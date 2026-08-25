# Ingest Handoff: Posts Date Fields & Schema Shape

**Audience:** Ingest module owners  
**Priority:** High — broken writes make Review Cases / Client Cases **date filters return 0** even when the post is visible by `case_id`  
**Tenant example:** `MIB-PMO-Data-Search`  
**Example ObjectId:** `6a798c9cd376f815968787d8` (manual ingest ~2026-08-10)  
**Related contract:** [`posts-profiles-schema-v3.md`](./posts-profiles-schema-v3.md)  
**Canonical sample:** [`sample_documents/mongodb_schema/Posts.json`](../../sample_documents/mongodb_schema/Posts.json)

---

## Executive summary

Ingest is writing **legacy post shapes** (or partial hybrid docs) into the tenant `Posts` collection. The Overwatch client filters and sorts on **schema v3 materialized fields** under `list.*` and `workflow.*`.

When those fields are missing:

| Symptom | Cause |
|---------|--------|
| Post opens fine via `?case_id=…` | Lookup by `_id` only |
| Sourcing / Publish / Alert date filters return **0** | Filters query `list.sourced_at` / `list.posted_at` / `list.reviewed_at` |
| UI may still show a date on the detail page | Fallback to `metadata.sourcing_date`, `engagement.posted_at`, etc. |

**Fix ingest writes.** Client-side remapping of legacy fields is not the long-term contract.

---

## Collection name (critical)

| Target | Name |
|--------|------|
| **Posts collection (canonical for client)** | **`Posts`** (PascalCase) |
| Profiles | `profiles` (lowercase) |
| Embeddings / events | `post_embeddings`, `case_events` |

Do **not** write new posts into lowercase `posts`. A partial dual-write (`Posts` + `posts`) already caused data to land in a collection the UI does not query.

> Note: older v3 migration docs mentioned lowercase `posts`. **Current client source of truth** is `src/utils/mongodb/collections.js` → `posts: 'Posts'`. Ingest must match the client.

---

## What ingest wrote that was wrong

Reconstructed from ObjectId `6a798c9cd376f815968787d8` (pre-remediation). Marker: `metadata.update_history.updated_by = "manual_ingest_script"`.

### Wrong / incomplete document (illustrative)

```js
{
  _id: ObjectId("6a798c9cd376f815968787d8"),
  // ❌ Missing top-level schema_version: 3
  platform: "Facebook",                    // ❌ Must be lowercase "facebook"
  platform_post_id: "1474688640799321",

  workflow: {
    ai_status: "completed"
    // ❌ Missing review_status, client_status, visibility_status, takedown_status
  },

  list: {
    ai_threat_score: 96,
    effective_threat_score: 96,
    poi_detected: true,
    risk_rank: "high",
    threat_types: ["Anti-India-Propaganda", "Hate-speech"],
    violation_flags: ["Anti-India-Propaganda", "Hate-speech"]
    // ❌ Missing list.posted_at
    // ❌ Missing list.sourced_at   ← Review "Sourcing Date" filter
    // ❌ Missing list.reviewed_at  ← Client "Alert Date" filter (after review)
  },

  // ❌ Legacy engagement blob used for publish time instead of list.posted_at
  engagement: {
    likes: 0,
    comments: 0,
    shares: 0,
    views: 4427,
    posted_at: "2026-06-06T07:48:17+00:00"   // ❌ ISO string; belongs on list.posted_at as Date
  },

  // ❌ Legacy metadata — client date filters do NOT use these
  metadata: {
    schema_version: 1,                       // ❌ Legacy
    created_at: "2026-08-10T08:32:28.198226+00:00",
    updated_at: "2026-08-10T08:32:28.198226+00:00",
    sourcing_date: "2026-08-10T08:32:28.198226+00:00",  // ❌ Not queried by filters
    update_history: [ /* … */ ]              // ❌ Prefer case_events for audit
  },

  // ❌ Top-level legacy duplicates
  sourcing_date: "2026-08-10T08:32:28.198Z",
  created_at: "2026-06-06T07:48:17.000Z",
  timestamp: "2026-06-06T07:48:17.000Z"

  // ❌ Missing system.created_at / system.updated_at (v3)
  // ❌ Missing content / author_snapshot / ingestion in v3 shape (if not mapped)
}
```

### Why the Aug 1–10 sourcing filter failed

Client Review Cases filter:

```js
{ "list.sourced_at": { $gte: <from>, $lte: <to> } }
```

This post had **no** `list.sourced_at`. It only had `metadata.sourcing_date` / top-level `sourcing_date` (= 2026-08-10). Detail UI could still show that date via fallbacks; the filter could not.

Publish date on the detail page (06/06/2026) came from `engagement.posted_at`, not `list.posted_at`.

---

## What is actually needed

### Required on every new / upserted post

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `schema_version` | `number` | **Yes** | Always `3` |
| `platform` | `string` | **Yes** | Lowercase: `facebook`, `instagram`, `x`, `youtube`, … |
| `platform_post_id` | `string` | **Yes** | Stable platform id |
| `original_url` | `string` | Yes | Canonical URL |
| `workflow.ai_status` | `string` | **Yes** | e.g. `pending` at insert; worker may set `completed` |
| `workflow.review_status` | `string` | **Yes** | `pending` until human review |
| `workflow.client_status` | `string` | **Yes** | Default `open` (or `alerted` if already alerted) |
| `workflow.visibility_status` | `string` | **Yes** | Prefer `available` |
| `workflow.takedown_status` | `string` | Yes | Default `none` |
| **`list.posted_at`** | **BSON `Date`** | **Yes** | When the content was published on the platform |
| **`list.sourced_at`** | **BSON `Date`** | **Yes** | When ingest sourced/ingested the post into Overwatch |
| `list.reviewed_at` | `Date \| null` | Optional at ingest | Leave `null` until human review |
| `list.engagement_score` | `number` | Yes | `views*1 + likes*2 + comments*3 + shares*4` |
| `system.created_at` | `Date` | **Yes** | Usually same instant as `list.sourced_at` on insert |
| `system.updated_at` | `Date` | **Yes** | |
| `content.*` | object | Yes | `caption`, `media[]`, `language`, `post_type` |
| `author_snapshot.*` | object | Yes | Snapshot at ingest |
| `ingestion.type` / `ingestion.ingested_at` | | Yes | `ingested_at` should align with `list.sourced_at` |

### Date semantics (do not conflate)

| UI / filter label | Mongo field | Meaning |
|-------------------|-------------|---------|
| **Sourcing Date** (Review Cases) | `list.sourced_at` | When we ingested / sourced the post |
| **Publish Date** | `list.posted_at` | When it was published on the platform |
| **Alert Date** (Client Cases) | `list.reviewed_at` (also related: `workflow.alerted_at`) | When reviewed / alerted to client — **not** set by ingest for new pending posts |

All of these must be **native BSON `Date`**, not ISO strings.

### Minimal correct insert (ingest-owned fields)

```js
{
  schema_version: 3,
  platform: "facebook",                    // lowercase
  platform_post_id: "1474688640799321",
  original_url: "https://www.facebook.com/…",
  profile_id: ObjectId("…"),             // resolve/create profile first

  workflow: {
    ai_status: "pending",                // or "completed" if AI already ran
    review_status: "pending",
    client_status: "open",
    visibility_status: "available",
    takedown_status: "none",
    alerted_at: null
  },

  list: {
    ai_threat_score: null,               // worker fills after analysis
    review_threat_score: null,
    effective_threat_score: null,
    risk_rank: null,
    threat_types: [],
    violation_flags: [],
    posted_at: ISODate("2026-06-06T07:48:17.000Z"),   // platform publish time
    sourced_at: ISODate("2026-08-10T08:32:28.198Z"),  // ingest time
    reviewed_at: null,
    alert_hour_ist: null,
    engagement_score: 4427,              // views*1 + …
    poi_detected: false,
    cluster_id: null,
    is_cluster_representative: true
  },

  content: {
    caption: "…",
    media: [ /* { original_url, s3_url?, type? } */ ],
    language: "en",
    post_type: "post"
  },

  author_snapshot: {
    platform_user_id: "…",
    username: "…",
    display_name: "…",
    profile_url: "…",
    is_verified: false
  },

  ingestion: {
    type: "manual_ingest",               // or your pipeline name
    source_url: null,
    ingested_at: ISODate("2026-08-10T08:32:28.198Z")
  },

  system: {
    created_at: ISODate("2026-08-10T08:32:28.198Z"),
    updated_at: ISODate("2026-08-10T08:32:28.198Z"),
    s3_stored: false
  }
}
```

Store engagement **raw counts** where your pipeline has them (likes/comments/shares/views) only if you still need them for scoring — the **filter/sort contract** for dates is `list.posted_at` / `list.sourced_at`, not `engagement.posted_at`.

---

## Stop writing these (legacy)

Do **not** rely on these for new documents (they are not what date filters query):

| Legacy field | Replace with |
|--------------|--------------|
| `metadata.schema_version: 1` | `schema_version: 3` |
| `metadata.sourcing_date` | `list.sourced_at` (+ `ingestion.ingested_at`) |
| top-level `sourcing_date` | `list.sourced_at` |
| `engagement.posted_at` as the only publish time | `list.posted_at` |
| top-level `timestamp` / `created_at` as publish time | `list.posted_at` |
| `metadata.created_at` / `metadata.updated_at` | `system.created_at` / `system.updated_at` |
| `metadata.update_history[]` | append to `case_events` |
| `platform: "Facebook"` | `platform: "facebook"` |
| Writing into collection `posts` (lowercase) | collection **`Posts`** |

---

## Acceptance checklist (for ingest PR / deploy)

- [ ] Inserts go to tenant DB collection **`Posts`**
- [ ] Every new doc has `schema_version: 3`
- [ ] `platform` is lowercase
- [ ] `list.sourced_at` is set as BSON `Date` (= ingest/source time)
- [ ] `list.posted_at` is set as BSON `Date` (= platform publish time)
- [ ] `workflow.review_status` is `pending` on insert
- [ ] `workflow.client_status` and `workflow.visibility_status` are set
- [ ] `system.created_at` / `system.updated_at` are BSON `Date`
- [ ] Smoke test: insert a post → Review Cases → filter **Sourcing Date** to that calendar day → post appears
- [ ] Smoke test: same post → filter **Publish Date** to platform publish day → post appears

### Quick Mongo verification query

```js
db.Posts.findOne(
  { _id: ObjectId("…") },
  {
    schema_version: 1,
    platform: 1,
    "list.sourced_at": 1,
    "list.posted_at": 1,
    "workflow.review_status": 1,
    "system.created_at": 1
  }
)
```

Expect all of the above present; `list.sourced_at` / `list.posted_at` typeof Date.

---

## What Overwatch already remediated (context only)

On `MIB-PMO-Data-Search`, ~35 existing docs missing `list.sourced_at` / `list.posted_at` were **non-destructively backfilled** from legacy fields (`metadata.sourcing_date`, `engagement.posted_at`, etc.). That unblocked filters for already-ingested posts. **New ingest must write the correct fields** so this does not recur.

---

## Questions / contact

If ingest cannot populate platform publish time, still set `list.posted_at` to the best available timestamp and document the fallback — but **never leave `list.sourced_at` null** on insert; that field is mandatory for Review Cases sourcing filters.
