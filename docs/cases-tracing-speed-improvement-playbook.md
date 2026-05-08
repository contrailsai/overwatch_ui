# Cases Tracing Speed Improvement Playbook

## Goal

Improve `/cases` latency without weakening auth/tenant security, and build a repeatable process for optimizing other pages.

## Baseline (Before Work)

- Observed `/cases` responses around `7s-9s`.
- Major hotspots from traces/logs:
  - Repeated Supabase tenant resolution (`auth_context`, `getClientandProjectDetails`).
  - `getPosts()` running heavy data query and heavy count query separately.
  - `unique_clusters` lookup/join pipeline cost.
  - Per-post tracing noise (`normalized_S3_post`) made traces noisy.

## Changes Applied (In Order)

1. Canonical auth context + request dedupe
- File: `src/utils/auth-context.js`
- Added request-scoped memoization via `cache(...)`.
- Added timing logs:
  - `supabase_tenant_lookup_ms`
  - `auth_context_ms`

2. `/cases` page parallelization
- File: `src/app/(dashboard)/cases/page.js`
- Resolved auth context + `searchParams` in parallel.
- Ran cases query, optional selected-case fetch, and project-emails fetch in parallel.

3. Removed duplicate tenant lookup in mutation path
- File: `src/app/(dashboard)/cases/actions.js`
- `updateClientStatus()` now uses `requireAuthContext()` instead of local `getProjectDetails()` lookup.

4. Added action/stage tracing instrumentation
- Files:
  - `src/utils/tracing.js`
  - `src/utils/auth-context.js`
  - `src/app/(dashboard)/cases/actions.js`
  - `src/app/(dashboard)/cases/page.js`
- Added explicit spans:
  - `action:*` wrappers
  - `auth_context.supabase_tenant_lookup`
  - `cases.getPosts.mongo_*`
  - `cases.getPosts.s3_signing`
  - `rsc.cases_page.*`

5. Dedupe dashboard auth path
- File: `src/app/(dashboard)/actions.js`
- `getClientandProjectDetails()` now reuses `getAuthContext()` instead of querying Supabase again.

6. Combined posts data + count into one aggregation
- File: `src/app/(dashboard)/cases/actions.js`
- Replaced separate heavy data/count queries with one `$facet` pipeline.
- Added metric: `mongo_data_and_count_query_ms`.

7. Reduced per-row trace noise
- File: `src/app/(dashboard)/cases/actions.js`
- Converted `normalized_S3_post` from traced action to local helper.
- Kept aggregate stage span (`cases.getPosts.s3_signing`).

8. Fixed project emails fetch dependency
- File: `src/app/(dashboard)/cases/feature_actions.js`
- `fetch_clients_in_project(projectName)` now uses provided `projectName`.
- Falls back to auth context only if project name is not provided.

9. Added short TTL auth-context cache
- File: `src/utils/auth-context.js`
- Module-level map keyed by `user.id`, TTL `30s`.
- Purpose: reduce repeated Supabase tenant lookups across nearby requests.

10. Fast-path unique clustering (no `unique_clusters` lookup)
- File: `src/app/(dashboard)/cases/actions.js`
- Default path now groups directly by `cluster_id` (fallback `_id`).
- Strict legacy validation path retained behind:
  - `USE_STRICT_UNIQUE_CLUSTERING=true`

11. Dropped embedding fields early in pipeline
- File: `src/app/(dashboard)/cases/actions.js`
- Added early `$project` to remove `text_embedding`/`image_embedding` before heavy stages.

## Measured Impact Summary

- Warm `/cases` loads improved from multi-second (`~7s-9s`) to sub-second / low-second (`~0.6s-0.8s` range on repeated refreshes in current sample).
- `getPosts` dropped from `~4.5s` to `~0.3s` handler time in warm path for tested filter.
- `mongo_data_and_count_query_ms` dropped from `~2200ms+` to `~220ms` after unique-cluster fast path.

## Why Unique Clustering Became Fast

Old strict mode:
- Validated membership with `$lookup` into `unique_clusters`.
- Expensive join + sort/group phases.

Current fast mode:
- Assumes trustworthy `cluster_id`.
- Groups by `cluster_id` directly and picks one representative row.

Trade-off:
- Fast mode trusts data integrity.
- Strict mode (`USE_STRICT_UNIQUE_CLUSTERING=true`) is safer when data quality is uncertain.

## React Cache + Auth Context: Safety Notes

Current setup:
- `getAuthenticatedUser` uses React `cache(...)` (request-level dedupe).
- `getAuthContext` uses React `cache(...)` plus short TTL map keyed by `user.id`.

Behavior on logout/login:
- Logout: no authenticated user, so auth context returns null.
- Login as another account: different `user.id` key, no cross-user context leakage.
- Same user after role/project change: data can be stale up to TTL window (`30s` currently).

Risk profile:
- No cross-user leak expected with key-by-user design.
- Short staleness window for permission/project updates is possible.
- Cache is per server process; in multi-instance deployments, cache is not shared.

Recommended guardrails:
- Keep TTL short (10-30s).
- For highly sensitive role changes, add explicit invalidation hooks or disable TTL.
- Keep server-side auth/role checks (`requireRole`) as source of truth.

## Page-by-Page Optimization Plan (Major Plan)

### Phase 0 - Standardize observability
- Ensure every high-traffic page has:
  - RSC stage spans (`rsc.<page>.*`)
  - server action spans (`action:*`)
  - db/signing stage spans where relevant

### Phase 1 - Auth/tenant dedupe rollout
- Replace duplicate tenant helpers with `getAuthContext`/`requireAuthContext`.
- Audit layout + page + action combinations for duplicate tenant lookups.

### Phase 2 - Query-path optimization
- For each page interaction:
  - detect duplicate data/count queries
  - combine with `$facet` where possible
  - remove heavy fields early in pipeline
  - avoid expensive lookup joins unless required for correctness

### Phase 3 - Expensive post-processing
- Move costly per-row work (signing/transforms) to:
  - lazy paths or detail panel
  - or keep only aggregate-stage timing and optimize bottlenecks

### Phase 4 - Validation + regression checks
- For each page:
  - baseline p50/p95 (cold + warm)
  - apply one change at a time
  - compare trace stage deltas
  - validate auth/tenant security invariants

### Phase 5 - Hardening
- Add env toggles for risky optimizations (as done for unique clustering).
- Document fallback paths and rollback switches.

## Suggested Next Targets

1. `takedowns` page/action path
2. `review-cases` page/action path
3. `profiles` / `review-profiles` path
4. dashboard home data aggregates

Use the same sequence: instrument -> baseline -> dedupe auth -> merge query stages -> validate.
