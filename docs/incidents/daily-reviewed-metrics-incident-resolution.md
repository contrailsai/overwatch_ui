# Incident: Silent `daily_reviewed_metrics` Failures During Bulk Takedown

**Status:** Resolved  
**Severity:** Medium (user-facing actions succeeded; analytics/metrics silently broken)  
**Environment:** Production — Next.js App Router, Supabase, MongoDB, OpenTelemetry → Loki/Tempo  
**Resolution commit:** `80e7c39` — `fix silent daily_reviewed_metrics failures during bulk takedown`  
**Date documented:** 2026-06-05

---

## Executive summary

During bulk takedown and bulk status-change operations, the application updated MongoDB case records successfully but **failed to update `daily_reviewed_metrics`** in Supabase. Failures were silent: errors were logged but swallowed, and the API returned `{ success: true }`.

The root cause was a combination of:

1. **Duplicate rows** in `daily_reviewed_metrics` for the same natural key `(date, platform, project_name)`
2. **`.maybeSingle()`** on the fetch query, which throws `PGRST116` when more than one row matches
3. **No unique constraint** on the natural key, allowing insert races from parallel per-post updates
4. **Poor error serialization** in logs (`error_message: [object Object]`), hiding the real PostgREST error code

The fix included data deduplication, unique constraints on both daily metrics tables, race-safe read/insert/retry logic, platform-batched metrics writes for bulk actions, and improved PostgREST error logging.

---

## Incident reference

| Field | Value |
|---|---|
| Trace ID | `409b987a738f58cae6cb0fabbe096e56` |
| Span ID | `10a8007f062b3b7a` |
| Triggering action | `initiateTakedown` (bulk, 18 cases) |
| Project | `Ambani` |
| User | `Pratik1.Nale@ril.com` |
| Incident date | `2026-06-05` |
| Deploy at time of incident | `5ba4436541eed387a0eadfabd55ced9f3b8eef2a` |
| Action outcome | **Success** (805ms) — metrics errors swallowed |
| Error volume | ~59 occurrences in 24h at investigation time |

[Open trace in Grafana Tempo](https://metrics.contrails.ai/explore?left=%7B%22datasource%22%3A%22tempo_ds%22%2C%22queries%22%3A%5B%7B%22query%22%3A%22409b987a738f58cae6cb0fabbe096e56%22%2C%22queryType%22%3A%22traceql%22%2C%22refId%22%3A%22A%22%7D%5D%2C%22range%22%3A%7B%22from%22%3A%22now-7d%22%2C%22to%22%3A%22now%22%7D%7D)

---

## Timeline

| Phase | What happened |
|---|---|
| **Detection** | Production Loki logs showed repeated `Failed to update daily_reviewed_metrics` with `error_message: [object Object]` |
| **Investigation** | Grafana Loki + Tempo trace analysis; root cause identified as `.maybeSingle()` + duplicate rows |
| **Documentation** | Initial investigation written to `docs/daily-reviewed-metrics-failure-investigation.md` |
| **Planning** | Fix plan: observability → dedupe → constraints → race-safe code → batch optimization |
| **Implementation** | Code changes in `metrics.js`, bulk callers, `otel-logger.js`; dedupe script and SQL added |
| **Data remediation** | Ran `scripts/dedupe-daily-metrics.js` on production Overwatch Supabase |
| **Schema change** | Applied migration `daily_metrics_unique_day_platform_project` on production |
| **Verification** | Zero duplicate groups post-dedupe; constraints confirmed; `npm run build` passed |
| **Code review** | Sub-agent review: ship with fixes; noted residual read-modify-write race as follow-up |
| **Commit** | `80e7c39` on `dev` |

---

## What happened

A client initiated a **bulk takedown of 18 cases**. For each case, the app called `updateClientReviewedMetrics` in parallel from `initiateTakedown`. The same per-post pattern existed in `updateClientStatus`.

The takedown completed and returned success. All 18 metrics update attempts failed on the **initial SELECT** before any insert or update ran.

### Trace evidence

| Observation | Count |
|---|---|
| GET requests to `daily_reviewed_metrics` | 18 |
| POST/PATCH requests to `daily_reviewed_metrics` | **0** |
| Error logs in Loki for this trace | 18 |
| `client_details` PATCH | Succeeded |
| `client_logs` PATCH | Succeeded |

Platforms queried: `youtube`, `instagram`, `x` — all for `project_name=Ambani`, `date=2026-06-05`.

`client_logs` succeeded because it uses `.limit(1)` and handles `23505` duplicate-key errors, backed by `client_logs_unique_day`. `daily_reviewed_metrics` had neither pattern nor constraint.

---

## Root cause

### 1. `.maybeSingle()` fails when duplicate rows exist

```js
// Previous code in src/utils/supabase/metrics.js
const { data: existing, error: fetchError } = await supabase
  .from('daily_reviewed_metrics')
  .select('*')
  .eq('date', date)
  .eq('platform', platform)
  .eq('project_name', project_name)
  .maybeSingle()

if (fetchError) throw fetchError
```

`.maybeSingle()` errors when **more than one row** matches. PostgREST returns:

```
code: PGRST116
message: JSON object requested, multiple (or no) rows returned
```

### 2. No unique constraint on the natural key

`daily_reviewed_metrics` and `daily_case_metrics` had only a primary key on `id`. There was no `UNIQUE (date, platform, project_name)`.

### 3. Parallel per-post updates created duplicates

Bulk actions ran metrics once per post in `Promise.all`. Many posts shared the same platform. Concurrent insert races accumulated duplicate rows, which then caused all subsequent `.maybeSingle()` fetches to fail.

### 4. Observability gap

PostgREST errors are plain objects, not `Error` instances. `otelLogError` used `String(error)` → `[object Object]`, dropping `code`, `details`, and `hint`.

---

## User impact

| Area | Impact |
|---|---|
| Takedown / status change | **No impact** — Mongo updates succeeded; action returned success |
| Dashboard reviewed metrics | **Broken** — `daily_reviewed_metrics` not updated during failures |
| Client meta stats / activity logs | **Worked** in the reference trace |
| Operator visibility | **Poor** — errors logged but not surfaced to users; logs unusable |

---

## Resolution

### Phase 1 — Observability

**File:** `src/utils/otel-logger.js`

Added `applyErrorAttributes()` to serialize PostgREST-shaped errors:

- `error_message`, `error_code`, `error_details`, `error_hint` as separate OTLP attributes
- Fallback to `JSON.stringify(error)` for other plain objects

### Phase 2 — Data cleanup (production)

**Script:** `scripts/dedupe-daily-metrics.js`

Ran on production Overwatch Supabase (`hlmuadbcqlamewamgoff`):

| Table | Before | After | Duplicate groups merged |
|---|---|---|---|
| `daily_reviewed_metrics` | 271 rows | 191 rows | 17 groups |
| `daily_case_metrics` | 463 rows | 462 rows | 1 group |

Merge logic per group:

1. Keep row with lowest `id`
2. Sum `total_reviewed` / `total_cases`
3. Merge JSON counters key-by-key (`reviewed`, `risk`, `categories`)
4. Delete extra rows

Post-dedupe verification: **0 duplicate groups** on both tables.

### Phase 3 — Schema constraints (production)

**Migration:** `daily_metrics_unique_day_platform_project`

```sql
ALTER TABLE daily_reviewed_metrics
ADD CONSTRAINT daily_reviewed_metrics_day_platform_project_unique
UNIQUE (date, platform, project_name);

ALTER TABLE daily_case_metrics
ADD CONSTRAINT daily_case_metrics_day_platform_project_unique
UNIQUE (date, platform, project_name);
```

Constraints confirmed in `pg_constraint`. Schema documented in `supabase/tables info`.

**Deploy order used:** dedupe → constraints → deploy app code.

### Phase 4 — Race-safe application logic

**File:** `src/utils/supabase/metrics.js`

Introduced shared helpers mirroring the proven `client_logs` pattern:

| Helper | Purpose |
|---|---|
| `fetchDailyMetricRow` | `.order('id').limit(1)` instead of `.maybeSingle()` |
| `upsertDailyMetricRow` | Fetch → update, or insert → on `23505` retry fetch + update |
| `mergeJsonCounters` | Key-by-key JSON counter merge with `Math.max(0, …)` |
| `isDuplicateKeyError` | Shared duplicate-key detection (`23505` + message) |

Applied to both `updateDailyMetrics` (`daily_case_metrics`) and `updateClientReviewedMetrics` (`daily_reviewed_metrics`).

### Phase 5 — Bulk caller optimization

**Files:**

- `src/app/(dashboard)/cases/takedown_actions.js`
- `src/app/(dashboard)/cases/actions.js`

Replaced per-post `updateClientReviewedMetrics` in `Promise.all` with `updateClientReviewedMetricsBatch`, which:

1. Groups posts by platform
2. Accumulates deltas in memory
3. Writes once per platform bucket (e.g. 18 calls → ~3)

Per-post `updateClientMetaStats` kept as-is (client-scoped, not platform-scoped).

Removed unused `updateClientReviewedMetrics` import from `feature_actions.js`.

---

## Artifacts

| Artifact | Path |
|---|---|
| Initial investigation | `docs/daily-reviewed-metrics-failure-investigation.md` |
| This resolution doc | `docs/incidents/daily-reviewed-metrics-incident-resolution.md` |
| Dedupe script | `scripts/dedupe-daily-metrics.js` |
| Constraint SQL (reference) | `supabase/scripts/dedupe-and-constrain-daily-metrics.sql` |
| Schema reference | `supabase/tables info` |
| Fix commit | `80e7c39` |

---

## Verification performed

| Check | Result |
|---|---|
| Duplicate groups after dedupe | 0 on both tables |
| Unique constraints in Postgres | Both constraints present |
| `npm run build` | Passed |
| Delta math (batch vs per-post) | Equivalent — linear addition |
| Code review | Ship with fixes |

### Recommended post-deploy checks

1. Bulk takedown on 10+ posts sharing a platform (reproduce Ambani scenario)
2. Tempo trace: expect GET + PATCH/POST writes, no `updateClientReviewedMetrics` errors
3. Loki: confirm `error_code` appears on failures (not `[object Object]`)
4. Dashboard `getDashboardData` reflects updated reviewed counts
5. Run dedupe + constraints on **Dev_env** (`jssqsjhgihqofzzhblay`) if not already done

### Verification SQL

```sql
-- Should return zero rows after fix
SELECT date, platform, project_name, COUNT(*) AS cnt
FROM daily_reviewed_metrics
GROUP BY date, platform, project_name
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

SELECT date, platform, project_name, COUNT(*) AS cnt
FROM daily_case_metrics
GROUP BY date, platform, project_name
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- Incident-specific spot check
SELECT *
FROM daily_reviewed_metrics
WHERE project_name = 'Ambani'
  AND date = '2026-06-05'
ORDER BY platform, id;
```

---

## Code review findings (known follow-ups)

Review verdict: **ship with fixes**. The production failure mode (total metrics discard on duplicate rows) is resolved. Remaining items are lower blast radius.

| ID | Severity | Finding | Status |
|---|---|---|---|
| F1 | High | Read-modify-write race on UPDATE — concurrent bulk actions on same platform can still lose increments | Open — consider Postgres RPC with atomic JSON increment |
| F2 | High | `updateClientMetaStats` still called per-post in parallel; same lost-update class on `client_details.meta_stats` | Open — out of original scope |
| F3 | Medium | Batch errors caught internally; outer caller `.catch()` won't fire for per-platform failures | Accepted — logging still occurs |
| F4 | Medium | SQL script not idempotent if constraints already exist | Documented — one-time use |
| F5 | Low | UTC date bucketing (`toISOString().split('T')[0]`) may bucket to wrong day vs user timezone | Open — separate issue |

---

## Out of scope (by design)

- Surfacing metrics failures to end users (takedown should keep succeeding; metrics remain best-effort)
- PostgreSQL RPC for atomic JSON increment (deferred; unique constraint + `23505` retry matches `client_logs` pattern)
- Timezone-aware date bucketing

---

## Lessons learned

1. **`.maybeSingle()` requires a guaranteed-unique filter.** Without a DB constraint, use `.limit(1)` and handle duplicates explicitly.
2. **Mirror proven patterns.** `client_logs` already had the right insert-race handling; metrics tables should have been built the same way from the start.
3. **Serialize PostgREST errors in observability code.** Plain-object errors are common in Supabase; `String(error)` is never enough.
4. **Batch writes for bulk operations.** Aggregating by natural key before writing reduces contention and round-trips.
5. **Silent `.catch()` on metrics makes incidents invisible.** User actions succeed while dashboards drift; invest in alerting on metrics write failures.

---

## Related code (post-fix)

| File | Role |
|---|---|
| `src/utils/supabase/metrics.js` | `upsertDailyMetricRow`, `updateClientReviewedMetrics`, `updateClientReviewedMetricsBatch`, `updateDailyMetrics` |
| `src/utils/otel-logger.js` | `applyErrorAttributes` / `otelLogError` |
| `src/app/(dashboard)/cases/takedown_actions.js` | `initiateTakedown` — batch metrics |
| `src/app/(dashboard)/cases/actions.js` | `updateClientStatus` — batch metrics |
| `src/app/(dashboard)/actions.js` | Dashboard reads `daily_reviewed_metrics` |
| `supabase/tables info` | Table definitions with unique constraints |
