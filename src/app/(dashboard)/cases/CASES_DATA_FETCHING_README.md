# Cases Data Fetching Documentation

This document explains data fetching for the `/cases` route: filters, sorting (table vs reports), exports, and MongoDB aggregation pipelines. Server logic lives mainly in [`actions.js`](actions.js) and [`riskBuckets.js`](riskBuckets.js).

## Overview

The Cases page loads posts from the MongoDB `Posts` collection. Large result sets are filtered, sorted, and paginated in aggregation pipelines before the client receives them.

Every post is normalized via `normalizeS3Post` (presigned S3 URLs, consistent fields for React).

**Gate:** Only posts with `review_details.threat_score` present are included (reviewed content). This applies to the list, bulk ID fetch, and report ordering.

---

## URL parameters (`page.js`)

Filters and sort are driven by search params:

| URL param | Filter key | Default |
|-----------|------------|---------|
| `platform` | `platform` | `all` |
| `status` | `client_status` | `all` |
| `visibility_status` | `visibility_status` | `all` |
| `risk_priority` | `risk_priority` | `all` |
| `violations` | `violations` (comma-separated) | `all` |
| `original_date_from` / `original_date_to` | publish date range | — |
| `processed_from` / `processed_to` | alert date range | — |
| `unique_clusters` | `true` / absent | off |
| `sortField` | `threat_score`, `processed_date`, `original_date` | `threat_score` (except similarity search) |
| `sortDirection` | `asc` / `desc` | `desc` |
| `page`, `limit` | pagination | `1`, `25` (max 100) |
| `similar_to`, `semantic_search` | similarity modes | — |
| `case_id` | deep-link selected case | — |

---

## Filters (`buildCasesMatchQuery`)

Implemented in [`actions.js`](actions.js). All filters combine with the reviewed-threat-score gate.

### Platform

- `platform !== 'all'`: case-insensitive exact match on `platform`.

### Visibility

- `down`: `visibility_status === 'down'`.
- `active` / `online` / `available`: online-like statuses, including missing/null (treated as online).

### Client status

- `To Be Reviewed`: missing, null, or case-insensitive match.
- `takedown` / `takedowns`: regex for takedown variants.
- Other values: case-insensitive exact match on `client_status`.

### Risk priority (threat score buckets)

Aligned with UI labels in [`riskBuckets.js`](riskBuckets.js):

| Filter id | Mongo condition |
|-----------|-----------------|
| `high` | `threat_score` > 95 |
| `medium` | > 75 and ≤ 95 |
| `low` | > 40 and ≤ 75 |
| `safe` | ≤ 40 |

### Violations

- Comma-separated list in `violations` param.
- Matches `review_details.threat_types`, `review_details.flags.<type>`, or `review_details.is_aigc` when `aigc` is included.

### Publish date (`original_date_*`)

- Applied after `$addFields` computes `sort_original_date` from `engagement.posted_at` or `metadata.posted_date`.
- Range: `$gte` / `$lte` on normalized date.

### Alert date (`processed_*`)

- Applied on `sort_processed_after`: `review_details.reviewed_at` or `metadata.updated_at`.

### Unique clusters

- When `unique_clusters=true`, pipeline deduplicates by cluster (see [Unique clusters](#unique-clusters)).
- Strict mode: `USE_STRICT_UNIQUE_CLUSTERING=true` uses `unique_clusters` collection + representative/member rules.

---

## Computed sort fields (`$addFields`)

| Field | Source | Purpose |
|-------|--------|---------|
| `sort_original_date` | Publish/posted date | Publish column, publish filter, sort |
| `sort_processed_after` | Review/alert date (full timestamp) | Alert column filter, Alert column sort, sub-hour tiebreaker |
| `sort_processed_after_hour` | Alert date truncated to IST hour (`$dateTrunc`, `Asia/Kolkata`) | Default Risk sort — posts in the same clock-hour compete on engagement |
| `risk_rank` | `threat_score` buckets 4→1 | Risk bucket sort (not raw score) |
| `sort_engagement` | Weighted engagement | Engagement tiebreaker / report sort |

### Risk buckets (`risk_rank`)

| Bucket | `risk_rank` | Threshold |
|--------|-------------|-----------|
| High | 4 | > 95 |
| Medium | 3 | > 75, ≤ 95 |
| Low | 2 | > 40, ≤ 75 |
| Safe | 1 | ≤ 40 |

### Engagement score (`sort_engagement`)

```
views + (2 × likes) + (3 × comments) + (4 × shares)
```

Mongo paths: `engagement.views`, `engagement.likes`, `engagement.comments`, `engagement.shares`. Null/missing → 0. All zeros still sort; dates break ties.

---

## Sorting: two different orders

The **cases table** and **PDF/DOCX reports** intentionally use different priority chains.

### A. Cases page / `getPosts` — list order

Builders: `buildCasesListSortPipeline(sort)` in [`riskBuckets.js`](riskBuckets.js).

**Default / Risk column (`sortField=threat_score`, desc):** all descending except `_id` (asc tiebreaker). Implemented via `buildCasesDefaultListSortPipeline()`.

1. `risk_rank` desc — High → Medium → Low → Safe
2. `sort_processed_after_hour` desc — newest alert **hour** first (IST; e.g. `27-05-2026 16` before `27-05-2026 06`)
3. `sort_engagement` desc — highest engagement first within the same hour
4. `sort_original_date` desc — newest publish date first
5. `sort_processed_after` desc — full alert timestamp (sub-hour tiebreaker)
6. `_id` asc — stable tiebreaker

The UI still displays the full alert time (`dd/MM/yyyy hh:mm a`); only sort uses the hour bucket.

Risk column **asc** only reverses `risk_rank`; hour, engagement, publish, and full-alert tiebreakers stay desc.

**Alert Date column (`processed_date`):** primary = alert date (user direction), then risk → publish date → engagement → `_id`.

**Publish Date column (`original_date`):** primary = publish date (user direction), then risk → alert date → engagement → `_id`.

Similarity search (`getSimilarPosts`, `getSemanticSearchPosts`) prepends vector/search `score: -1`, then uses list tiebreakers.

### B. Reports — export / SQS order

Builders: `buildCasesReportSortPipeline()` in [`riskBuckets.js`](riskBuckets.js).

**Fixed order (ignores UI column sort):**

1. `risk_rank`
2. `sort_engagement`
3. `sort_processed_after`
4. `sort_original_date`
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
- Unique-cluster pick uses `UNIQUE_CLUSTER_EARLY_SORT` when date fields are not yet computed.

### `getPostById` / `getIdenticalPosts` / `getPostsByIds`

- Single case, cluster siblings, or explicit ID list (export components); not re-sorted for table defaults unless fetched via pipelines above.

---

## Pipeline architecture (typical `getPosts`)

1. `$match` — `buildCasesMatchQuery` + reviewed gate  
2. `$project` — drop embeddings  
3. `$addFields` — dates, `risk_rank`, `sort_engagement`  
4. `$match` — date range filters (if any)  
5. Unique clusters stages (if enabled)  
6. `$facet` — `{ data: [$sort, $skip, $limit], total: [$count] }`  
7. Normalize + S3 signing on results  

---

## Unique clusters

When enabled, one representative post per cluster is kept.

**Representative pick sort** (after sort fields exist): list priority — `risk_rank` → alert date → publish date → engagement → `reviewed_at` → `_id`.

Early pipelines (vector search before date `$addFields`): `risk_rank` → engagement → `reviewed_at` → `_id`.

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
