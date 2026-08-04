# MongoDB Schema V3 — Client UI Migration

Branch: `db_schema_update`  
Target database: `Ambani-Data-v2` (see `.env.local` / Supabase `project.mongo_db_map`)  
Sample documents: `sample_documents/new_schemas/`

This document records all client-side changes made so the Overwatch UI reads and writes the v3 MongoDB schema instead of the legacy `Posts` / `Profiles` kitchen-sink documents.

---

## Overview

The v3 database uses **lowercase collection names** and **materialized sub-documents** for list queries. The UI layer keeps the same normalized response shape (e.g. `client_status`, `takedown_info`, `user`) via server-side mappers so React components did not require a full rewrite.

### Collections (v3)

| Legacy | V3 | Notes |
|--------|-----|-------|
| `Posts` | `posts` | Main case/post documents |
| `Profiles` | `profiles` | Profile documents; no embedded `posts[]` |
| — | `post_embeddings` | 1:1 with `post_id`; Atlas vector index lives here |
| — | `profile_embeddings` | 1:1 with profile |
| — | `case_events` | Unified audit log |
| `Topics` | `topics` | Topic membership unchanged conceptually |
| `unique_clusters` | *(empty in v3 DB)* | Cluster dedup uses `list.cluster_id` + `list.is_cluster_representative` |
| `Feeds` | *(not migrated yet)* | Feeds UI needs separate migration |

### Verified counts (`Ambani-Data-v2`)

| Collection | Count |
|------------|------:|
| `posts` | 2,407 |
| `profiles` | 2,363 |
| `post_embeddings` | 2,857 |
| `case_events` | 10,981 |
| `topics` | 505 |

Reviewed cases filter returns **2,407** posts. Profiles with `list.reviewed_post_count > 0` returns **1,878**.

---

## New files

### `src/utils/mongodb/collections.js`

Central collection name constants and helpers:

- `COLLECTIONS.posts`, `.profiles`, `.case_events`, `.post_embeddings`, `.topics`, etc.
- `postsCollection(db)`, `profilesCollection(db)`, `caseEventsCollection(db)`, `postEmbeddingsCollection(db)`

All server actions should use these instead of `db.collection('Posts')`.

### `src/utils/mongodb/v3-schema.js`

Shared v3 logic consumed across actions:

| Export | Purpose |
|--------|---------|
| `buildNormalizedPostForUi(post, opts)` | Maps v3 post → legacy UI contract |
| `buildNormalizedProfileForUi(profile, opts)` | Maps v3 profile → UI contract |
| `buildTakedownInfoForUi(post)` | Maps `takedown` + `workflow.takedown_status` → `takedown_info` |
| `mapV3ClientStatusToUi` / `mapUiClientStatusToV3` | Client status enum translation |
| `withReviewedCasesFilter(query)` | Reviewed cases list eligibility |
| `buildEffectiveThreatScoreRange(risk)` | Risk bucket filter on `list.effective_threat_score` |
| `fetchPostCaseEvents(db, postId)` | Read action logs from `case_events` |
| `insertCaseEvent(db, payload)` | Write audit events (replaces `$push metadata.update_history`) |
| `getPostCaption`, `getAuthorSnapshot`, `getFirstMediaS3Url`, `getPostMedia` | Field accessors |

---

## Field mapping reference

### Posts — read paths

| Legacy | V3 |
|--------|-----|
| `metadata.created_at` | `system.created_at` |
| `metadata.updated_at` | `system.updated_at` |
| `metadata.sourcing_date` | `list.sourced_at` / `ingestion.ingested_at` |
| `engagement.posted_at` | `list.posted_at` |
| `review_details.reviewed_at` | `list.reviewed_at` |
| `post_content.caption` | `content.caption` |
| `post_content.media_urls[]` | `content.media[]` |
| `profile` / `user` / `author` | `author_snapshot` |
| `post_id` / `code` | `platform_post_id` |
| `client_status` | `workflow.client_status` (mapped for UI) |
| `visibility_status` | `workflow.visibility_status` |
| `processed` | `workflow.alerted_at` present |
| `review_details.threat_score` (filter) | `workflow.review_status: 'reviewed'` + `list.review_threat_score` |
| `review_details.threat_score` (sort/filter) | `list.effective_threat_score` |
| Risk rank (computed) | `list.risk_rank` / `list.effective_threat_score` |
| Engagement (computed) | `list.engagement_score` |
| Alert hour (computed `$dateTrunc`) | `list.alert_hour_ist` |
| `cluster_id` | `list.cluster_id` |
| `text_embedding` / `image_embedding` | `post_embeddings` collection |
| `metadata.update_history` | `case_events` collection |
| `takedown_info.*` | `takedown.*` + `workflow.takedown_status` |

### Posts — write paths

| Action | V3 fields written |
|--------|-------------------|
| Client status update | `workflow.client_status`, `system.updated_at`, `content_reviewed_by` + `case_events` |
| Takedown initiate | `workflow.client_status`, `workflow.takedown_status`, `takedown.initiated_at`, `system.updated_at` + `case_events` |
| Review note | `client_notes`, `system.updated_at` + `case_events` |
| Case assignment | `assigned_to`, `system.updated_at` + `case_events` |
| Edit review (client) | `review_details`, `list.*`, `workflow.review_status`, `takedown`, `system.updated_at` + `case_events` |
| Manual post upload | Full v3 document via `buildStrictPostDocument` |

### Profiles — read paths

| Legacy | V3 |
|--------|-----|
| `posts[]` (embedded IDs) | Query `posts.find({ profile_id })` |
| `cases_count` (`$size posts`) | `list.post_count` |
| `client_status` | `workflow.client_status` |
| `metadata.follower_count` | `list.follower_count` |
| `metadata.location` | `list.location` |
| `last_relevant_publish_date` | `list.last_active_at` |
| `review_details.risk` | `list.risk_rank` / `list.risk` |
| Reviewed filter | `workflow.review_status: 'reviewed'` OR `list.reviewed_post_count > 0` |

### Client status mapping (v3 ↔ UI)

| V3 `workflow.client_status` | UI label |
|-----------------------------|----------|
| `open` | To Be Reviewed |
| `alerted` | To Be Reviewed |
| `no_action` / `pass` | No Action |
| `flag_for_takedown` | Flag for Takedown |
| `takedown` | Takedown |

UI filter **"To Be Reviewed"** matches `open` and `alerted`.

### Takedown status mapping

| Legacy `takedown_info` | V3 |
|------------------------|-----|
| `takedown_status` / `status` | `workflow.takedown_status` / `takedown.status` |
| `takedown_start_date` | `takedown.initiated_at` |
| `takedown_end_date` | `takedown.completed_at` |
| `in_takedown_process` | derived from `workflow.takedown_status` in `['initiated','under_review','pending']` |
| `events[]` | `case_events` collection |

Observed v3 values in DB: `none`, `initiated`, `under_review`, `takedown_successful`.

---

## Query simplification

### Before (legacy)

Cases list pipeline:

```
$match → $project (drop embeddings) → $addFields (dates, risk_rank, engagement) → $match (dates) → $lookup/$group (clusters) → $facet
```

### After (v3)

```
$match (workflow.*, list.*) → $match (list.posted_at / list.reviewed_at dates) → $group (clusters via list.cluster_id) → $facet
```

Sort keys now use materialized fields directly:

- `list.effective_threat_score`
- `list.alert_hour_ist`
- `list.engagement_score`
- `list.posted_at`
- `list.reviewed_at`

`buildCaseSortAddFields()` and `buildCasesDateAddFieldsStage()` are deprecated no-ops kept for import compatibility.

### Vector / semantic search

Embeddings moved off `posts`. Search pipelines:

1. `$vectorSearch` on `post_embeddings` (`vector_index` on `text_embedding` / `image_embedding`)
2. `$lookup` → `posts` on `post_id`
3. `$replaceRoot` to post document
4. Apply cases/review filters and sort on `list.*`

Atlas text search paths updated to:

- `content.caption`
- `author_snapshot.display_name`
- `original_url`

---

## Modified files

### Core utilities

| File | Changes |
|------|---------|
| `src/utils/mongodb/collections.js` | **New** — collection constants |
| `src/utils/mongodb/v3-schema.js` | **New** — normalization, filters, case events, status mapping |
| `src/utils/mongodb/schema.js` | Delegates to v3 helpers; legacy fallbacks retained |
| `src/lib/posts/pipeline-helpers.js` | V3 match/sort/date filters; `normalizeS3Post` loads `case_events` when `db` passed |
| `src/lib/posts/reviewed-post-filter.js` | Uses `workflow.review_status` / `list.review_threat_score` |
| `src/app/(dashboard)/cases/riskBuckets.js` | Sort pipelines use `list.*`; deprecated `$addFields` helpers |
| `src/utils/supabase/reviewed-activity-count.js` | Reads `workflow.client_status` via `mapV3ClientStatusToUi` |
| `src/utils/manual-post/buildStrictPostDocument.js` | Outputs full v3 document (`schema_version: 3`) |

### Cases

| File | Changes |
|------|---------|
| `src/app/(dashboard)/cases/actions.js` | `postsCollection`; simplified list pipeline; vector search via `post_embeddings`; `updateClientStatus` writes v3 + `case_events`; `getIdenticalPosts` uses `list.cluster_id` |
| `src/app/(dashboard)/cases/feature_actions.js` | Notes, review edit, assign/bulk assign → v3 writes + `case_events` |
| `src/app/(dashboard)/cases/takedown_actions.js` | Initiate takedown, priority takedowns, raised count → v3 fields |

### Review

| File | Changes |
|------|---------|
| `src/app/(dashboard)/review-cases/actions.js` | Full v3: filters, sorts, writes, export mapping, vector search, SQS collection name `posts` |
| `src/app/(dashboard)/review-profiles/actions.js` | `profilesCollection` / `postsCollection`; profile cases via `profile_id`; v3 review submit |

### Profiles & takedowns

| File | Changes |
|------|---------|
| `src/app/(dashboard)/profiles/actions.js` | V3 list filters/sorts; `buildNormalizedProfileForUi`; cases via `profile_id` |
| `src/app/(dashboard)/takedowns/actions.js` | V3 queries, normalization, writes, `case_events` for history |

### Feeds & topics

| File | Changes |
|------|---------|
| `src/lib/feeds/feed-schema.js` | `TOPICS_COLLECTION = 'topics'`; added `POSTS_COLLECTION` |
| `src/lib/feeds/resolve-feed-posts.js` | Removed runtime `$addFields`; histogram uses `list.posted_at` |
| `src/lib/feeds/topic-membership.js` | `postsCollection`; `getPostPostedAt` reads `list.posted_at` |
| `src/lib/feeds/topic-membership-actions.js` | `postsCollection` |
| `src/app/(dashboard)/feeds/actions.js` | `postsCollection`; pass `db` to `normalizeS3Post` |

### Other

| File | Changes |
|------|---------|
| `src/app/(dashboard)/upload-content/manualPostActions.js` | Inserts v3 docs; dup check on `platform_post_id`; SQS sends `'posts'` |
| `src/features/reports/server/actions.js` | `postsCollection` for report post validation |
| `src/app/(dashboard)/configurations/projectActions.js` | Label cascade updates use `postsCollection` |

---

## UI contract (unchanged at component layer)

Server actions still return normalized objects with fields the UI already expects:

```js
{
  _id, platform, post_id, caption, signedImageUrl, original_url,
  client_status,   // mapped from workflow.client_status
  visibility_status,
  user: { username, full_name, profile_pic_url, is_verified },
  review_details, takedown_info, analysis_results, client_notes,
  stats, cluster_id, update_history,  // update_history from case_events
  created_at, sourcing_date, posted_date, reviewed_at, ...
}
```

Components such as `CasesList`, `CaseDetailPanel`, `TakedownDetails`, and export/PDF flows continue to consume this shape.

---

## Setup required for local / dev testing

1. **Supabase tenant mapping** — The app resolves the Mongo DB from `client_details.project.mongo_db_map`, not `.env.local` `MONGO_DB`. Set it to:

   ```
   Ambani-Data-v2
   ```

2. **`.env.local`** — Used by scripts and local Mongo smoke tests:

   ```
   MONGO_URI=...
   MONGO_DB=Ambani-Data-v2
   ```

3. **Atlas indexes** — Ensure vector index `vector_index` exists on `post_embeddings` (not `posts`). Text search index `default` should target v3 paths on `posts`.

4. **SQS / worker** — Moderation worker messages should use `collection_name: "posts"` (updated in review-cases manual re-queue paths).

---

## Known gaps / follow-ups

| Area | Status |
|------|--------|
| `Feeds` collection | Not in v3 DB; feeds CRUD/list may fail until migrated |
| `unique_clusters` | Empty; dedup uses `list.is_cluster_representative` or simple `list.cluster_id` grouping |
| `assigned_to` / `content_reviewed_by` | Not in strict v3 sample but still written at root for UI |
| Ingest + moderation worker | Must write canonical v3 fields (`list.*`, `workflow.*`) — outside this client repo |
| Legacy field cleanup | Dual-read fallbacks remain in `schema.js` and some takedown lookups for migration safety |
| Index scripts | `scripts/ensure_indexes.js` still targets legacy fields; needs v3 multi-tenant index script |
| `getTakedowns` list mapper | Still hand-rolled; detail path uses `normalizeS3Post` — consolidate when refactoring takedowns list |
| `getDocumentDownloadUrl` | Still queries legacy `takedown_info.documents.id`; v3 path is `takedown.documents` |
| Profile list legacy fallbacks | `/profiles` reviewed gate still includes `review_details.reviewed_at`; date filter includes legacy paths |

---

## V3 consistency audit (2026-07-05)

Cross-route audit of `/cases`, `/takedowns`, `/profiles`, `/review-profiles`. Fixes applied in this pass:

| Fix | Files |
|-----|-------|
| `serializeForClient` on nested post/profile subdocs | `v3-schema.js` |
| `buildNormalizedProfileForUi` maps `enrichment.*` → `metadata.*`, `list.risk_rank` → `review_details.risk` | `v3-schema.js` |
| `getProfileCases` queries by `profile_id` (fixes single-post ID bug) | `profiles/actions.js`, `review-profiles/actions.js` |
| Profile list uses `cases_count` / `list.post_count` (removed 500-post ID cap) | `profiles/actions.js`, `ProfilesList.js`, `ProfileDetails.js` |
| `getTakedowns` serializes dates with `toIsoDate` | `takedowns/actions.js` |
| Missing `logActionError` import in takedown initiate flow | `cases/takedown_actions.js` |
| UI uses `post.score`, `post.reviewed_at` for risk/alert display | `CasesList.js`, `CaseDetailPanel.js`, `TakedownDetails.js` |
| Review edit sets `workflow.takedown_status` when suggesting takedown | `cases/feature_actions.js` |
| Profile note/review writes emit `case_events` | `profiles/actions.js`, `review-profiles/actions.js` |

Remaining follow-ups (not yet fixed):

- Refactor `getTakedowns` to reuse `normalizeS3Post`
- `getDocumentDownloadUrl` legacy document path
- Trim legacy dual-read fallbacks in `/profiles` filters once migration verified
- Update `CASES_DATA_FETCHING_README.md` to v3 field names
- Review-cases: optional action log panel in `ReviewDetails.js` (history is fetched via `update_history`)

### Review-cases fixes (2026-07-05)

| Fix | Files |
|-----|-------|
| Image upload merges with scraped `content.media`; delete removes manual only | `review-cases/actions.js` |
| `submitCaseReview` sets `workflow.takedown_status`, `content_reviewed_by` | `review-cases/actions.js` |
| `deleteCase` / `runAIAnalysis` emit `case_events`; embeddings cleaned on delete | `review-cases/actions.js` |
| Shared `normalizeS3Post` instead of raw doc spread | `review-cases/actions.js` |
| Export uses live URL filters; POI filter in panel | `ReviewInterface.js`, `ReviewCasesFilterPanel.js` |

---

## Suggested test plan

1. Confirm Supabase `mongo_db_map` → `Ambani-Data-v2`
2. **Cases** — list load, sort by risk/alert/publish, filter by status/platform/violations
3. **Case detail** — action logs from `case_events`, client status buttons, takedown flow
4. **Review queue** — pending vs reviewed tabs, AI filters, submit review
5. **Profiles** — list, profile detail cases via `profile_id`, client status
6. **Takedowns** — list, detail, status updates, notes/documents
7. **Search** — semantic + similar posts (requires `post_embeddings` + Atlas index)
8. **Manual upload** — insert v3 doc + SQS trigger
9. **Reports** — export selected reviewed case IDs

---

## Related planning docs

- Cursor plan: Posts & Profiles Schema V3 (`posts_profiles_schema_v3`)
- **Service migration contract (ingest / worker / embeddings):** [`docs/contracts/posts-profiles-schema-v3.md`](./contracts/posts-profiles-schema-v3.md)
- Sample schemas: `sample_documents/new_schemas/` (`posts.json`, `profiles.json`, `case_events.json`, `post_embeddings.json`, `topics.json`, `pois.json`)
