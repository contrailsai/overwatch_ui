# Posts & Profiles Schema V3 — Service Migration Contract

**Audience:** ingest, content-moderation worker, embedding pipelines, and any service that reads/writes tenant MongoDB.  
**Status:** Client app (`overwatch_client`) has cut over. Downstream services must migrate to the same field ownership rules.  
**Reference samples:** [`sample_documents/new_schemas/`](../../sample_documents/new_schemas/)  
**Related:** [`content-moderation-worker-guide.md`](./content-moderation-worker-guide.md) (analysis pipelines; update for v3 field paths)

---

## Why this exists

The old `Posts` / `Profiles` documents mixed list-sort fields, embeddings, and audit history into one kitchen-sink shape. Schema v3:

1. Uses **lowercase** collection names.
2. Materializes hot filter/sort fields under `list.*` and `workflow.*`.
3. Moves vectors to **`post_embeddings`** / **`profile_embeddings`**.
4. Moves audit trail to **`case_events`**.
5. Links posts → profiles via **`profile_id`** (profiles no longer embed `posts[]`).

Every tenant is its own Mongo database (`db_name` from the project’s `mongo_db_map`). Migrations and indexes must iterate **all** tenant DBs.

**Out of scope for this cutover:** `Feeds` (still uppercase `Feeds`). Feeds only hold foreign keys (`topic_ids`, `manual_post_ids`) and already resolve live against v3 `posts` / `topics`.

---

## Collection layout (per tenant DB)

| Collection | Role |
|------------|------|
| `posts` | Canonical post / case document (`schema_version: 3`) |
| `profiles` | Canonical profile (`schema_version: 3`); no `posts[]` |
| `post_embeddings` | 1:1 with `posts._id` via `post_id` |
| `profile_embeddings` | 1:1 with `profiles._id` via `profile_id` (when used) |
| `case_events` | Append-only audit log for posts and profiles |
| `topics` | Topic membership (`posts[]` of ObjectIds); lowercase |
| `pois` | POI graph nodes |

**SQS `collection_name`:** use `"posts"` (not `"Posts"`). The client already sends `"posts"` for manual upload and re-queue AI.

---

## Field ownership (critical)

Each `list.*` / `workflow.*` field has **one writer per event**. Dual-writing the same field from ingest and worker causes drift.

### Ingest owns

| Field | Notes |
|-------|--------|
| `schema_version` | Always `3` on new docs |
| `platform` | Lowercase enum: `instagram`, `facebook`, `youtube`, `x`, … |
| `platform_post_id`, `original_url` | Stable platform identity |
| `profile_id` | Resolve/create profile, then set FK |
| `author_snapshot.*` | Snapshot at ingest time |
| `content.caption`, `content.media[]`, `content.language`, `content.post_type` | Media items: `{ original_url, s3_url, type? }` |
| `list.posted_at`, `list.sourced_at` | Native `Date` (UTC) |
| `list.engagement_score` | See formula below |
| `list.cluster_id`, `list.is_cluster_representative` | When clustering runs at ingest |
| `ingestion.*`, `system.created_at` / `system.updated_at` / `system.s3_stored` | |
| `workflow.ai_status` | e.g. `pending` at insert |
| `workflow.review_status` | `pending` until human review |
| `workflow.client_status` | Default `open` |
| `workflow.visibility_status` | Prefer `available` / `active` / `down` |
| `workflow.takedown_status` | Default `none` |
| Profile `list.post_count` | `$inc` on new post link; reconciler as backup |

**Ingest must not** write `review_details`, `list.review_*`, or `text_embedding` / `image_embedding` onto `posts`.

### Moderation worker owns

| Field | Notes |
|-------|--------|
| `analysis_results` | Full replace (same shape as today) |
| `workflow.ai_status` | e.g. `completed` / `failed` |
| `list.ai_threat_score` | From `analysis_results.threat_score` or `risk_score` |
| `list.threat_types` / `list.violation_flags` | From AI labels (until human review overwrites) |
| `list.poi_detected` | From POI / face-name checks |
| `list.effective_threat_score` | Recompute: `review_threat_score ?? ai_threat_score` |
| `list.risk_rank` | Recompute from effective score (see below) |
| `system.updated_at` | On every write |
| `case_events` insert | Instead of `$push metadata.update_history` |

**Worker must not** write `review_details`, `takedown`, or client workflow decisions (`client_status`, `alerted_at`).

### Client / reviewer owns (for context — do not overwrite)

| Field | Notes |
|-------|--------|
| `review_details` | Human verdict |
| `workflow.review_status` | `reviewed` |
| `workflow.client_status`, `workflow.alerted_at` | Client decisions |
| `list.review_threat_score`, `list.reviewed_at`, `list.alert_hour_ist` | After human review |
| `list.effective_threat_score`, `list.risk_rank` | Recalculated after review (review wins) |
| `takedown.*`, `workflow.takedown_status` | Takedown workflow |
| `client_notes` | |

### Embedding service owns

| Collection / field | Notes |
|--------------------|--------|
| `post_embeddings.post_id` | ObjectId of `posts._id` |
| `post_embeddings.text_embedding` / `image_embedding` | Vectors |
| Optional denorm | `platform`, `effective_threat_score` for Atlas pre-filters |

Do **not** store embeddings on `posts` or `profiles`.

---

## Shared formulas (copy into all services)

### Effective threat score

```text
effective_threat_score = list.review_threat_score
  if list.review_threat_score is not null
  else list.ai_threat_score
```

### Risk rank (string)

Thresholds (aligned with client `riskBuckets.js`):

| Score | `list.risk_rank` |
|------:|------------------|
| `> 95` | `"high"` |
| `> 75` and `≤ 95` | `"medium"` |
| `> 40` and `≤ 75` | `"low"` |
| `≤ 40` or null | `"safe"` (use `null` only if score is missing and never analyzed) |

```js
function riskRankFromScore(score) {
  if (score == null || Number.isNaN(Number(score))) return null
  const n = Number(score)
  if (n > 95) return 'high'
  if (n > 75) return 'medium'
  if (n > 40) return 'low'
  return 'safe'
}
```

### Engagement score

```text
engagement_score =
  views * 1 + likes * 2 + comments * 3 + shares * 4
```

Store as a number on `list.engagement_score`. Prefer raw counts from platform stats at ingest; do not recompute at query time in the client.

### Alert hour (IST)

When setting `list.reviewed_at` / `workflow.alerted_at`, also set:

```text
list.alert_hour_ist = hour of that instant in Asia/Kolkata (0–23)
```

Client materializes this on review; worker typically leaves it `null` until alerted/reviewed.

### Platform enum

Normalize to **lowercase** strings at write time (`Facebook` → `facebook`).

### Dates

Use native BSON `Date` everywhere. Do not store epoch integers or ISO strings for `list.*` / `system.*` / `workflow.alerted_at` fields the client sorts on.

---

## Document shapes

### `posts` (v3)

```js
{
  _id, schema_version: 3,
  platform,                    // lowercase
  platform_post_id, original_url,
  profile_id,                  // ObjectId → profiles

  workflow: {
    ai_status,                 // pending | completed | failed | …
    review_status,             // pending | reviewed
    client_status,             // open | alerted | no_action | flag_for_takedown | takedown
    visibility_status,         // available | active | down | …
    takedown_status,           // none | requested | initiated | under_review | takedown_successful | …
    alerted_at                 // Date | null — replaces ambiguous processed / processed_at
  },

  list: {
    ai_threat_score, review_threat_score, effective_threat_score,
    risk_rank,                 // "high" | "medium" | "low" | "safe" | null
    threat_types: [], violation_flags: [],
    posted_at, sourced_at, reviewed_at,  // Date | null
    alert_hour_ist,            // 0–23 | null
    engagement_score,
    cluster_id,                // ObjectId | null
    is_cluster_representative,
    poi_detected
  },

  content: { caption, media: [{ original_url, s3_url, type? }], language, post_type },
  author_snapshot: { platform_user_id, username, display_name, profile_url, is_verified },

  analysis_results: { … },     // worker
  review_details: { … },       // reviewer only
  analysis_correction_request: { … },  // correction flow (unchanged shape)

  takedown: {
    status, initiated_at, completed_at,
    client_reference_id, platform_case_id,
    notes: [], documents: []
  },

  client_notes: [],
  supabase_refs: { case_id, alert_ids: [], chat_thread_ids: [] },
  ingestion: { type, source_url, ingested_at },
  system: { created_at, updated_at, s3_stored }
}
```

**Removed from posts (do not write):**

`caption`, top-level `content` string, `author` / `user` / `profile` blobs, `stats` / `engagement` as the only engagement source, `id` / `code` / `post_id` aliases, `timestamp`, `text_embedding`, `image_embedding`, `metadata.update_history`, `takedown_info.*`, `processed` / `processed_at` as the alert signal.

Canonical identity is `platform_post_id`. Unique index intent: `{ platform: 1, platform_post_id: 1 }`.

Full sample: [`sample_documents/new_schemas/posts.json`](../../sample_documents/new_schemas/posts.json).

### `profiles` (v3)

```js
{
  _id, schema_version: 3,
  platform, platform_user_id,   // unique together
  username, display_name, profile_url, is_verified,

  workflow: { review_status, client_status, reviewed_at },

  list: {
    risk, risk_rank,
    post_count, reviewed_post_count, max_threat_score,
    last_active_at, follower_count, location
  },

  enrichment: {
    biography, profile_pic_s3, profile_pic,
    media_count, account_created_at, following_count, …
  },

  review_details: { … },
  client_notes: [],
  system: { created_at, updated_at, last_synced_from_post_at }
}
```

**Dropped:** `posts[]`. Cases for a profile = `posts.find({ profile_id })`. Maintain `list.post_count` via `$inc` + optional reconciler.

Sample: [`sample_documents/new_schemas/profiles.json`](../../sample_documents/new_schemas/profiles.json).

### `post_embeddings`

```js
{
  _id,
  post_id,                 // ObjectId → posts._id
  text_embedding: number[],
  image_embedding: number[],
  platform,                // optional denorm for vector pre-filter
  effective_threat_score   // optional denorm
}
```

Atlas vector index (`vector_index`) lives on **this** collection, paths `text_embedding` / `image_embedding`.  
Atlas text index (`default`) stays on **`posts`** (`content.caption`, `author_snapshot.display_name`, `original_url`).

Sample: [`sample_documents/new_schemas/post_embeddings.json`](../../sample_documents/new_schemas/post_embeddings.json).

### `case_events`

```js
{
  _id,
  entity_type: "post" | "profile",
  entity_id: ObjectId,
  event_type: string,          // e.g. "Automated AI content analysis"
  actor: string | null,        // email or service id
  summary: string,
  payload: object,             // free-form
  occurred_at: Date,
  source: "client" | "ai_moderation_lambda" | "ingest" | …
}
```

**Do not** `$push` to `metadata.update_history` or `takedown_info.events`. Always `insertOne` into `case_events`.

Sample: [`sample_documents/new_schemas/case_events.json`](../../sample_documents/new_schemas/case_events.json).

---

## Migration checklist by service

### 1. Ingest

- [ ] Insert into `posts` / `profiles` (lowercase) with `schema_version: 3`.
- [ ] Resolve or upsert profile; set `posts.profile_id`; `$inc` `profiles.list.post_count`.
- [ ] Write `author_snapshot`, `content.*`, `list.posted_at` / `sourced_at` / `engagement_score`.
- [ ] Initialize `workflow` + empty/null AI `list.*` scores.
- [ ] Upsert embeddings into `post_embeddings` (not on the post doc).
- [ ] Emit `case_events` for create/significant updates (`source: "ingest"`).
- [ ] Stop writing legacy duplicate fields listed above.
- [ ] Dup check: `{ platform, platform_post_id }` (not `code` / `id`).

### 2. Content moderation worker

- [ ] Accept SQS `collection_name: "posts"` (and treat `"Posts"` as legacy alias during transition if needed).
- [ ] **Read** caption/media/author from:
  - `content.caption`
  - `content.media[].s3_url`
  - `author_snapshot`
  - optionally join `profiles` via `profile_id`
- [ ] **Write** (in one update):
  - `analysis_results` (full replace)
  - `workflow.ai_status`
  - `list.ai_threat_score`, `list.threat_types`, `list.violation_flags`, `list.poi_detected`
  - recompute `list.effective_threat_score` and `list.risk_rank` (respect existing `list.review_threat_score` if present)
  - `system.updated_at`
- [ ] Insert `case_events` with `source: "ai_moderation_lambda"` (or your service name).
- [ ] Stop writing `metadata.update_history`, `metadata.updated_at`, embeddings on the post.
- [ ] Revision pipeline: still uses `analysis_correction_request` on the post (shape unchanged); same v3 read paths for caption/media.

Suggested `$set` after full analysis:

```js
{
  analysis_results: { /* full object */ },
  'workflow.ai_status': 'completed',
  'list.ai_threat_score': score,
  'list.threat_types': threatTypes,
  'list.violation_flags': threatTypes,
  'list.poi_detected': Boolean(poiDetected),
  'list.effective_threat_score': effective,  // review ?? ai
  'list.risk_rank': riskRankFromScore(effective),
  'system.updated_at': new Date()
}
```

### 3. Embedding / similarity pipeline

- [ ] Write/update `post_embeddings` by `post_id`.
- [ ] Point Atlas `vector_index` at `post_embeddings`.
- [ ] Optionally denormalize `platform` + `effective_threat_score` when scores change.
- [ ] On post delete: delete matching `post_embeddings` row (client already does this).

### 4. Any other readers

- [ ] Replace `Posts` → `posts`, `Profiles` → `profiles`.
- [ ] Replace sort/filter on computed fields with `list.*` / `workflow.*`.
- [ ] Replace action-log reads with `case_events` queries:
  `{ entity_type: "post", entity_id: <ObjectId> }` sorted by `occurred_at: -1`.

---

## Legacy → v3 field map (quick)

| Legacy | V3 |
|--------|-----|
| `Posts` / `Profiles` | `posts` / `profiles` |
| `post_content.caption` | `content.caption` |
| `post_content.media_urls[]` | `content.media[]` |
| `profile` / `user` / `author` | `author_snapshot` (+ `profile_id`) |
| `post_id` / `code` / `id` | `platform_post_id` |
| `metadata.sourcing_date` | `list.sourced_at` |
| `engagement.posted_at` / `metadata.posted_date` | `list.posted_at` |
| `metadata.created_at` / `updated_at` | `system.created_at` / `updated_at` |
| `processed` / `processed_at` | `workflow.alerted_at` |
| `client_status` | `workflow.client_status` |
| `visibility_status` | `workflow.visibility_status` |
| `takedown_info.*` | `takedown.*` + `workflow.takedown_status` |
| `text_embedding` / `image_embedding` on post | `post_embeddings` |
| `metadata.update_history` | `case_events` |
| `profiles.posts[]` | `posts.profile_id` + `list.post_count` |

### Client status values (v3)

| Value | Meaning |
|-------|---------|
| `open` | In queue / not yet client-actioned |
| `alerted` | Surfaced to client |
| `no_action` | Client passed |
| `flag_for_takedown` | Flagged |
| `takedown` | Client started takedown |

---

## Indexes expected (create per tenant)

**posts**

- `{ platform: 1, platform_post_id: 1 }` unique  
- `{ "workflow.review_status": 1, "list.risk_rank": -1, "list.alert_hour_ist": -1, "list.engagement_score": -1 }`  
- `{ platform: 1, "workflow.client_status": 1, "list.reviewed_at": -1 }`  
- `{ "list.effective_threat_score": -1, "list.reviewed_at": -1 }`  
- `{ "list.violation_flags": 1, "list.reviewed_at": -1 }`  
- `{ "workflow.review_status": 1, "workflow.ai_status": 1, "list.sourced_at": -1 }`  
- `{ profile_id: 1, "list.posted_at": -1 }`  
- `{ "list.cluster_id": 1, "list.is_cluster_representative": 1, "list.risk_rank": -1 }`  
- `{ "workflow.takedown_status": 1, "takedown.initiated_at": -1 }`  

**profiles**

- `{ platform: 1, platform_user_id: 1 }` unique  
- `{ "workflow.review_status": 1, "list.risk_rank": -1, "list.last_active_at": -1 }`  
- `{ "list.follower_count": -1 }`, `{ "list.post_count": -1 }`  

**case_events**

- `{ entity_type: 1, entity_id: 1, occurred_at: -1 }`  
- `{ occurred_at: -1 }`  

**post_embeddings**

- `{ post_id: 1 }` unique  
- Atlas vector index on embedding paths  

Legacy `scripts/ensure_indexes.js` in this repo still targets old `Posts` fields — do not use it as the v3 source of truth until replaced.

---

## Rollout guidance

1. **Dual-read/write briefly** if a tenant still has mixed docs — prefer writing **only** v3; read with fallbacks only during transition.
2. **Cut SQS** to `collection_name: "posts"` once workers understand lowercase.
3. **Strip** vectors and `update_history` from posts only after all writers are on v3 and search uses `post_embeddings`.
4. **Reconcile** `list.post_count` and `list.effective_threat_score` vs source fields on the largest tenant before declaring done.

---

## Client already live (for coordination)

The Overwatch UI on branch `db_schema_update`:

- Lists/filters/sorts on `workflow.*` and `list.*` (no runtime threat/date `$addFields` for cases).
- Vector / similar search: `$vectorSearch` on `post_embeddings` → `$lookup` posts.
- Action logs: `case_events`.
- Profile cases: `posts.find({ profile_id })`.
- Manual upload inserts full v3 docs via `buildStrictPostDocument`.

If workers still write legacy-only fields, lists will miss new rows or show wrong sort/filter values even though documents exist.

---

## Questions / ownership contacts

| Area | Owning surface |
|------|----------------|
| UI read/write contract | `overwatch_client` — `src/utils/mongodb/v3-schema.js`, `docs/db-schema-v3-ui-migration.md` |
| Ingest document builder | Python ingest + this contract |
| AI analysis shape | `analysis_results` in worker guide (shape unchanged; paths changed) |
| Embeddings | Embedding service + Atlas indexes |

When in doubt: match [`sample_documents/new_schemas/`](../../sample_documents/new_schemas/) and never invent a second field for the same concept.
