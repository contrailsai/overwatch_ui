# Cases Data Fetching Documentation

This document explains data fetching for the `/cases` route: filters, sorting (table vs reports), exports, and MongoDB aggregation pipelines. Server logic lives mainly in [`actions.js`](actions.js) and [`riskBuckets.js`](riskBuckets.js).

## Overview

The Cases page loads posts from the MongoDB `Posts` collection. Large result sets are filtered, sorted, and paginated in aggregation pipelines before the client receives them.

Every post is normalized via `normalizeS3Post` (presigned S3 URLs, consistent fields for React).

**Gate:** Reviewed content only, via `withReviewedThreatScoreFilter` in [`reviewed-post-filter.js`](../../lib/posts/reviewed-post-filter.js): `workflow.review_status: 'reviewed'` **or** a stored `list.review_threat_score`. This applies to the list, bulk ID fetch, and report ordering.

---

## URL parameters (`page.js`)

Filters and sort are driven by search params:

| URL param | Filter key | Default |
|-----------|------------|---------|
| `platform` | `platform` | `all` |
| `status` | `client_status` | `all` |
| `visibility_status` | `visibility_status` | `all` |
| `risk_priority` | `risk_priority` | `high` when the param is absent. Explicit `all` stays unfiltered (the param is kept so a refresh does not snap High risk back on). |
| `violations` | `violations` (comma-separated) | `all` |
| `pois` | `pois` (comma-separated parent POI `name`s; aliases included in the match) | `all` |
| `published_from` / `published_to` (aliases: `original_date_*`) | publish date range on `list.posted_at` | — |
| `alert_from` / `alert_to` (aliases: `processed_*`) | alert date range on `list.reviewed_at` | — |
| `unique_clusters` | `true` / absent | off |
| `sortField` | `engagement_score`, `threat_score`, `processed_date`, `original_date` | `engagement_score` when the param is absent (except similarity / semantic search, which keep a null sort field). Turning the engagement chip off writes `threat_score` + `desc`. |
| `sortDirection` | `asc` / `desc` | `desc` |
| `page`, `limit` | pagination | `1`, `25` (max 100) |
| `similar_to`, `semantic_search` | similarity modes | — |
| `case_id` | deep-link selected case | — |

---

## Filters (`buildCasesMatchQuery`)

Built in [`pipeline-helpers.js`](../../lib/posts/pipeline-helpers.js) and applied from [`actions.js`](actions.js). All filters combine with the reviewed gate. POI matching is a second step: `applyPoiNameFilter`.

The list toolbar splits controls across surfaces in [`CasesFilterPanel.js`](CasesFilterPanel.js): **primary** (search, alert date, POI), **actions** (similar search / assign when rows are selected), and **advanced** (platform, status, visibility, risk, violations, publish date, unique clusters). Suggestion chips in [`CaseFilterSuggestions.js`](CaseFilterSuggestions.js) are Today, Last 7 days, Needs review, High risk, and Still online, then a divider and **Sort by engagement**.

Landing view (no query params): High risk is on, and sort is highest `list.engagement_score` first. Un-clicking High risk writes `risk_priority=all`. Un-clicking engagement sort writes `sortField=threat_score` and `sortDirection=desc` (the risk-bucket list order below). There is no low-engagement sort. High risk alone does not light the Clear button or the filters-toggle dot. Clear still resets the URL to `/cases`, which returns to the landing view.

The case-detail side list keeps search, alert date, and POI visible, and repeats those three at the top of the Filters panel.

### Platform

- `platform !== 'all'`: case-insensitive exact match on `platform`.

### Visibility

- `down`: `workflow.visibility_status === 'down'`.
- `active` / `online` / `available`: online-like `workflow.visibility_status` values, including missing/null (treated as online).

### Client status

Mapped through `mapUiClientStatusToV3` onto `workflow.client_status`.

- `To Be Reviewed`: `open`, `alerted`, or missing/null.
- `takedown` / `takedowns`: `workflow.client_status === 'takedown'`.
- Other values: exact v3 status from the UI label.

### Risk priority (threat score buckets)

Aligned with UI labels in [`riskBuckets.js`](riskBuckets.js). Filter field is `list.effective_threat_score`.

| Filter id | Mongo condition |
|-----------|-----------------|
| `high` | > 95 |
| `medium` | > 75 and ≤ 95 |
| `low` | > 40 and ≤ 75 |
| `safe` | ≤ 40 |

### Violations

- Comma-separated list in `violations` param.
- Matches `list.violation_flags`, `review_details.threat_types`, or `review_details.flags.<type>`.
- `aigc` matches `review_details.is_aigc`.

### POIs

- Comma-separated parent POI `name`s in the `pois` param (multi-select). Options come from `getPoiFilterOptions()` (parent POIs only).
- Each selected POI is expanded to its display name, canonical name, aliases, and `alias_poi_names`, then matched against `review_details.poi_names` or `analysis_results.poi_check.poi_names` (any label).
- Unknown names match nothing (`_id` exists-false), so a stale selection cannot return the unfiltered list.

### Publish date (`published_*` / `original_date_*`)

- `$match` on stored `list.posted_at` (`$gte` / `$lte`). No computed date field.

### Alert date (`alert_*` / `processed_*`)

- `$match` on stored `list.reviewed_at`.
- The default list **sort** still buckets by IST calendar day; the filter uses the full timestamp.

### Unique clusters

- When `unique_clusters=true`, pipeline deduplicates by `list.cluster_id` (falling back to `_id`). See [Unique clusters](#unique-clusters).
- Strict mode: `USE_STRICT_UNIQUE_CLUSTERING=true` uses `unique_clusters` collection + representative/member rules.

---

## Computed sort fields (`$addFields`)

Default / Risk-column sort cannot use stored fields directly. `buildCasesSortKeyAddFields()` in [`riskBuckets.js`](riskBuckets.js) adds these immediately before `$sort` (`buildCasesListSortStages`). They are `$unset` on list results so they do not leak to the client.

| Field | Source | Purpose |
|-------|--------|---------|
| `_sort_risk_bucket` | `list.effective_threat_score` via the buckets below (null/missing score → Safe) | Default Risk sort. Same bucket, same priority. Not the stored `list.risk_rank` string (that sorts alphabetically). |
| `_sort_alert_day` | `list.reviewed_at` truncated to an IST calendar day (`$dateTrunc`, `Asia/Kolkata`). Non-date → null (sorts last when descending). | Default Risk sort. Time of day is ignored. |
| `list.engagement_score` | Materialized weighted engagement | Engagement tiebreaker |
| `list.posted_at` | Publish time | Publish tiebreaker / Publish column |
| `list.reviewed_at` | Alert timestamp | Alert column sort only (not the default chain) |

### Risk buckets (`_sort_risk_bucket`)

Same cutoffs as `getRiskLabel` / `RISK_THRESHOLDS`.

| Bucket | Rank | Threshold |
|--------|------|-----------|
| High | 4 | > 95 |
| Medium | 3 | > 75, ≤ 95 |
| Low | 2 | > 40, ≤ 75 |
| Safe | 1 | ≤ 40, or score missing |

### Engagement score (`list.engagement_score`)

```
views + (2 × likes) + (3 × comments) + (4 × shares)
```

Stored on `list.engagement_score` at write time. Null/missing sorts as lowest.

---

## Sorting: two different orders

The **cases table** and **PDF/DOCX reports** intentionally use different priority chains.

### A. Cases page / `getPosts` — list order

Builders: `buildCasesListSortStages(sort)` in [`riskBuckets.js`](riskBuckets.js) (`$addFields` then `$sort`). Feed lists use the same helper.

**Landing sort (`sortField=engagement_score`, always desc):** highest engagement first. Direction is ignored for this field (no ascending mode).

1. `list.engagement_score` desc
2. `list.effective_threat_score` desc
3. `list.reviewed_at` desc
4. `list.posted_at` desc
5. `_id` asc

**Risk column (`sortField=threat_score`, desc):** descending except `_id` (asc tiebreaker). Implemented via `buildCasesDefaultListSortPipeline()`. This is what the engagement chip writes when turned off.

1. `_sort_risk_bucket` desc — High → Medium → Low → Safe (same bucket, same priority)
2. `_sort_alert_day` desc — newest alert **calendar day** first (IST `dd-mm-yyyy`; time of day ignored)
3. `list.engagement_score` desc
4. `list.posted_at` desc
5. `_id` asc — pagination tiebreaker only

The UI still displays the full alert time (`dd/MM/yyyy hh:mm a`); only sort uses the IST date.

Risk column **asc** only reverses `_sort_risk_bucket`; alert day, engagement, and publish stay desc.

**Alert Date column (`processed_date`):** primary = full `list.reviewed_at` (user direction), then numeric `list.effective_threat_score` → `list.posted_at` → engagement → `_id`. Not the default bucket/day chain.

**Publish Date column (`original_date`):** primary = `list.posted_at` (user direction), then numeric score → `list.reviewed_at` → engagement → `_id`.

Similarity search (`getSimilarPosts`, `getSemanticSearchPosts`) prepends vector/search `score: -1`, then uses the same list tiebreakers.

### B. Reports — export / SQS order

Builders: `buildCasesReportSortPipeline()` in [`riskBuckets.js`](riskBuckets.js).

**Fixed order (ignores UI column sort).** This is not the list bucket/day chain.

1. `list.effective_threat_score` (numeric, not the risk bucket)
2. `list.engagement_score`
3. `list.reviewed_at` (full timestamp)
4. `list.posted_at`
5. `_id`

**Where it is applied:**

- [`orderPostIdsForReport`](actions.js) — re-sorts selected IDs before SQS in [`getOrCreateReportJob`](../../features/reports/server/actions.js). Works for manual selection, current page, or “select all filtered”; client selection order does not matter.
- [`getAllPostIds`](actions.js) — returns IDs in report order for bulk select / export helpers.

Report cache keys ([`hash.js`](../../features/reports/hash.js)) sort IDs alphabetically for hashing, so export order does not affect deduplication.

### Report types (UI)

From [`CasesList.js`](CasesList.js) / [`ReportExportButton`](../../features/reports/components/ReportExportButton.jsx):

| Preset | Format | `reportType` |
|--------|--------|--------------|
| PDF Sum | PDF | Summary |
| PDF Det | PDF | Detailed |
| DOCX Det | DOCX | Detailed |

Flow: `useReportExport` → `getOrCreateReportJob` → `orderPostIdsForReport` → `sendReportSqsMessage` with ordered `postIds`.

---

## Key server actions

### `getPosts`

- Paginated table data (`$skip` / `$limit`).
- Filters + list sort + optional unique clusters.
- Returns `{ posts, totalCount, page, totalPages }`.

### `getAllPostIds`

- Same filters and cluster logic as `getPosts`, no pagination.
- **`$sort` uses report order** (not list order).
- Used for “Select all filtered” and any bulk ID list that should match export ordering.

### `orderPostIdsForReport(postIds)`

- Takes an array of post ID strings; returns the same IDs sorted for reports.
- Used by report job creation before SQS dispatch.

### `getSimilarPosts` / `getSemanticSearchPosts`

- Vector / text search; filters and list-style sort after search score.
- Unique-cluster pick uses the same ranking keys as the list (`UNIQUE_CLUSTER_EARLY_SORT`).

### `getPostById` / `getIdenticalPosts` / `getPostsByIds`

- Single case, cluster siblings, or explicit ID list (export components); not re-sorted for table defaults unless fetched via pipelines above.

---

## Pipeline architecture (typical `getPosts`)

1. `$match` — `buildCasesMatchQuery` + reviewed gate  
2. `$match` — date range filters (if any)  
3. Unique clusters stages (if enabled; computes sort keys, then drops them)  
4. `$facet` — `{ data: [$addFields sort keys, $sort, $skip, $limit, $unset helpers], total: [$count] }`  
5. Normalize + S3 signing on results  

---

## Unique clusters

When enabled, one representative post per cluster is kept.

**Representative pick sort** (list and early/similarity): `_sort_risk_bucket` → `_sort_alert_day` → `list.engagement_score` → `list.posted_at` → `_id`. Sort keys are computed in the cluster stage, then projected away.

---

## `normalizeS3Post`

Maps raw Mongo documents to UI shape: dates, `user`, `stats` (from `engagement.*`), `review_details`, presigned media URLs, etc.

---

## Best practices and gotchas

- **Dates:** Always normalize with `$toDate` / `$ifNull` before comparing or sorting.  
- **Vector search:** `$vectorSearch` / `$search` must be first stage; filter and sort afterward.  
- **List vs report sort:** Do not assume table order matches PDF/DOCX order; reports always use report pipeline.  
- **Zero engagement:** No special case; alert/publish dates order those rows among peers.  
- **Performance:** `getPosts` uses `$facet` for data + count in one round trip; embeddings stripped early.
