# Auth + Data Performance Investigation Handoff

## Context

Recent auth hardening improved security and tenant isolation, but page/data fetches now feel slower.  
This doc lists likely bottlenecks, why they matter, and what to investigate/fix without weakening auth or tenant restrictions.

Environment assumptions:
- Next.js App Router + server actions
- Supabase for auth + tenant metadata
- MongoDB per organization (`mongo_db_map` -> org DB with `Posts`, `Profiles`, etc.)

---

## High-Confidence Bottlenecks

### 1) Repeated auth + tenant resolution on hot paths
- `src/utils/auth-context.js` resolves auth context by:
  - `getAuthenticatedUser()`
  - Supabase query to `client_details` + joined `project`
- This work is repeated in multiple actions and often duplicated with other helpers.

**Why this hurts**
- Adds Supabase roundtrips before Mongo queries.
- Multiplies latency under heavy server-action traffic.

---

### 2) Duplicate tenant lookup helpers across codebase
Multiple overlapping helpers:
- `getAuthContext()` in `src/utils/auth-context.js`
- `getClientandProjectDetails()` in `src/app/(dashboard)/actions.js`
- `getProjectDetails()` in `src/app/(dashboard)/cases/actions.js`

**Why this hurts**
- Duplicate queries and inconsistent behavior.
- Harder to optimize globally.

---

### 3) Cases page orchestration has serial dependency cost
`src/app/(dashboard)/cases/page.js` does:
- fetch user/project
- fetch posts
- maybe fetch a selected case
- fetch project client emails

Some work can run in parallel once auth context is resolved.

**Why this hurts**
- Increases TTFB and perceived page load delay.

---

### 4) `getPosts()` executes expensive query stages multiple times
`src/app/(dashboard)/cases/actions.js`:
- One heavy aggregation for data page
- Another heavy aggregation for count
- Includes computed `$toDate`, filters, unique cluster stages

**Why this hurts**
- Duplicate compute + sort + match costs on large collections.

---

### 5) Per-row S3 signing during list fetch
`normalized_S3_post()` signs media URLs per post during list load.

**Why this hurts**
- Adds network/crypto overhead proportional to list size.
- Makes large page sizes noticeably slower.

---

### 6) Post-mutation actions still re-fetch tenant metadata
Example: `updateClientStatus()` -> `getProjectDetails()` in `cases/actions.js`.

**Why this hurts**
- Reintroduces per-action Supabase lookup overhead despite already known actor context.

---

### 7) Per-org DB architecture shifts overhead to metadata lookup
Current model is good for isolation, but every action needing db routing depends on resolving `mongo_db_map`.

**Why this hurts**
- Fast data isolation, but metadata lookup can dominate latency if uncached.

---

## Prioritized Work Plan

## P0 (Do first, highest ROI, low risk)

### P0.1 Canonical tenant resolver + request-scoped caching
- Consolidate to one tenant resolver helper.
- Ensure request-scoped memoization so multiple calls in one request do not re-query Supabase.

Targets:
- `src/utils/auth-context.js`
- `src/app/(dashboard)/actions.js`
- `src/app/(dashboard)/cases/actions.js`

Success criteria:
- Exactly one Supabase tenant lookup per request in common paths.

---

### P0.2 Parallelize independent page fetches
In `src/app/(dashboard)/cases/page.js`, once auth context exists:
- run posts fetch and project-emails fetch in parallel
- fetch selected case in parallel when `case_id` is present

Success criteria:
- Reduced TTFB on `/cases` initial load.

---

## P1 (High impact, moderate complexity)

### P1.1 Optimize `getPosts()` data+count pattern
- Avoid re-running expensive stages for count when possible.
- Re-evaluate `unique_clusters` path and index coverage.
- Consider moving computed sort fields to write-time persistence.

Target:
- `src/app/(dashboard)/cases/actions.js`

Success criteria:
- Materially lower query time on large datasets.

---

### P1.2 Reduce eager S3 signing work
Options:
- sign only visible/above-the-fold rows
- lazy-sign on detail panel open
- batch sign if architecture allows

Target:
- `src/app/(dashboard)/cases/actions.js`

Success criteria:
- Lower list render latency for larger page sizes.

---

## P1.5 (Observability before deeper refactor)

### P1.5 Add stage-level timing metrics
Add timings for:
- `auth_context_ms`
- `supabase_tenant_lookup_ms`
- `mongo_posts_query_ms`
- `mongo_count_query_ms`
- `s3_signing_ms`
- `total_handler_ms`

Targets:
- `src/utils/tracing.js`
- `src/utils/auth-context.js`
- `src/app/(dashboard)/cases/actions.js`

Success criteria:
- Actionable latency breakdown per request/action.

---

## P2 (Optional optimization, validate consistency constraints)

### P2.1 Small TTL cache for tenant mapping
- Cache `{ user.id -> project_name, dbName, permission }` for short TTL (30-120s).
- Keep Supabase as source of truth.
- Ensure invalidation strategy for permission/project changes.

Success criteria:
- Fewer Supabase lookups under bursty action traffic.
- No stale-permission security regressions.

---

## Measurement Plan (to quantify "how slow")

Benchmark route: `/cases`  
Collect p50/p95 for:
- initial page load
- filter change
- bulk action
- selected-case open

Record:
- auth context resolution time
- Mongo query time (data, count)
- S3 signing time
- total server action time

Use this to decide whether P1 query work or signing work should be prioritized first.

---

## Security Guardrails (must keep)

- Do not re-introduce client-supplied tenant trust (`project`, `mongo_db_map`, `project_name`, `client_email`).
- Keep server-side role checks (`requireRole`) for privileged mutations.
- Keep per-org DB isolation model intact.
- Any caching of auth/tenant context must be scoped and safe against cross-user leakage.

---

## Suggested First Ticket Breakdown

1. Consolidate tenant resolver + request-scoped cache
2. Parallelize `/cases` server fetch orchestration
3. Add latency instrumentation
4. Re-benchmark and identify top p95 contributor
5. Optimize that contributor (`getPosts` pipeline or S3 signing)
