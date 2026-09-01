# Ads & Ad Profiles Schema V3 — Service Contract

**Audience:** ingest (Meta Ads Library and other ad platforms), content-moderation worker, and `overwatch_client`.  
**Status:** Client Review Ads surface lands with this contract. Downstream ingest/worker must write the same shapes.  
**Reference samples:** [`sample_documents/mongodb_schema/Ads.json`](../../sample_documents/mongodb_schema/Ads.json), [`sample_documents/mongodb_schema/Ad_profiles.json`](../../sample_documents/mongodb_schema/Ad_profiles.json)  
**Related:** [`posts-profiles-schema-v3.md`](./posts-profiles-schema-v3.md) (shared formulas, `case_events`, AI/review field shapes)

---

## Why separate collections

Ads are **not** Posts. They have different identity (`ad_archive_id`), carousel/DPA cards, delivery metadata (spend, publisher platforms, date range), and advertiser **pages** rather than social authors.

| Collection | Role |
|------------|------|
| `Ads` | Canonical ad document (`schema_version: 3`) — client queries this name |
| `Ad_profiles` | Advertiser / page document; no embedded `ads[]` |
| `case_events` | Reused; `entity_type: "ad"` \| `"ad_profile"` |

Do **not** write ads into `Posts` / `profiles`.

---

## Field ownership

### Ingest owns

| Field | Notes |
|-------|--------|
| `schema_version` | Always `3` |
| `platform` | Lowercase family: `meta`, later `google`, `tiktok`, … |
| `source` | e.g. `meta_ads_library` |
| `platform_ad_id` | Meta `ad_archive_id` (stable ID) |
| `original_url` | Ads Library permalink |
| `ad_profile_id` | Resolve/create `Ad_profiles`, then set FK |
| `advertiser_snapshot.*` | Page snapshot at ingest |
| `content.*` | Creative after S3 media copy (see below) |
| `ad_delivery.*` | Delivery / compliance metadata from the source |
| `source_payload` | Optional trimmed raw Meta object for audit/reprocess |
| `list.posted_at` / `list.sourced_at` | BSON `Date` (UTC). Prefer `start_date` → `posted_at`; ingest time → `sourced_at` |
| `list.start_date` / `list.end_date` | BSON `Date` from source unix timestamps |
| `list.is_active`, `list.display_format`, `list.publisher_platforms`, `list.impressions_*`, `list.card_count` | Hot filter/sort denorm |
| `ingestion.*`, `system.*` | |
| `workflow.ai_status` | `pending` at insert |
| `workflow.review_status` | `pending` until human review |
| `workflow.client_status` | Default `open` |
| `workflow.visibility_status` | Prefer `available` / `active` / `down` |
| `workflow.takedown_status` | Default `none` |
| Ad profile `list.ad_count` | `$inc` on new ad link |

**Ingest must not** write `review_details`, `list.review_*`, or embeddings onto `Ads`.

### Moderation worker owns

Same rules as posts: full-replace `analysis_results`; set `workflow.ai_status`, `list.ai_threat_score`, `list.threat_types` / `list.violation_flags`, `list.poi_detected`, recompute `list.effective_threat_score` / `list.risk_rank`; insert `case_events`.

**Worker must not** write `review_details`, content creative edits, or client workflow decisions.

### Client / reviewer owns

| Field | Notes |
|-------|--------|
| `review_details` | Same shape as Posts |
| `workflow.review_status` | `reviewed` |
| `workflow.client_status`, `workflow.alerted_at` | Client decisions |
| `list.review_threat_score`, `list.reviewed_at`, `list.alert_hour_ist` | After human review |
| `list.effective_threat_score`, `list.risk_rank` | Recalculated after review (review wins) |
| `content.*` | Reviewer may add/remove/edit creative (title, body, cards, media) |
| `takedown.*`, `workflow.takedown_status` | When takedown flow is enabled for ads |

---

## Shared formulas

Reuse from posts contract:

- `effective_threat_score = review_threat_score ?? ai_threat_score`
- `risk_rank` thresholds (`>95` high, `>75` medium, `>40` low, else safe)
- Platform / `source` strings lowercase at write time
- Native BSON `Date` for all `list.*` / `system.*` / `workflow.alerted_at` sort fields (convert Meta unix seconds at ingest)

---

## Document shapes

### `Ads` (v3)

```js
{
  _id, schema_version: 3,
  platform,                    // "meta" | …
  source,                      // "meta_ads_library" | …
  platform_ad_id,              // Meta ad_archive_id
  original_url,
  channel,                     // "ingestion" | "library" | "feed" — optional; client UI derives if absent
  submitted_url,               // optional — client Upload Content URL (forces channel=ingestion in UI)
  ad_profile_id,               // ObjectId → Ad_profiles

  workflow: {
    ai_status, review_status, client_status,
    visibility_status, takedown_status, alerted_at
  },

  list: {
    ai_threat_score, review_threat_score, effective_threat_score,
    risk_rank, threat_types: [], violation_flags: [],
    posted_at, sourced_at, reviewed_at, alert_hour_ist,
    poi_detected,
    // ad-specific hot fields
    start_date, end_date,      // Date
    is_active, display_format,
    publisher_platforms: [],
    impressions_text, impressions_index,
    card_count
  },

  content: {
    title, body, caption, cta_text, cta_type, display_format,
    link_url, link_description, language,
    cards: [{
      title, body, caption, cta_text, cta_type,
      link_url, link_description,
      media: [{ original_url, s3_url, type, role? }]
    }],
    media: [{                    // flattened for list thumbnails / signing
      original_url, s3_url,
      type: "image" | "video",
      role?, card_index?,
      uploaded_manually?
    }]
  },

  advertiser_snapshot: {
    platform_page_id, page_name, profile_url,
    profile_pic, profile_pic_s3,
    page_is_deleted, page_categories: [], page_like_count
  },

  ad_delivery: {
    is_active, start_date, end_date,   // Date (mirror list for detail)
    publisher_platforms: [],
    impressions_text, impressions_index,
    spend, currency, reach_estimate,
    targeted_or_reached_countries: [],
    total_active_time,
    collation_id, collation_count,
    categories: [], gated_type,
    contains_digital_created_media,
    contains_sensitive_content,
    regional_regulation_data
  },

  source_payload: { … },       // optional raw Meta-shaped object
  analysis_results: { … },     // worker — same shapes as Posts
  review_details: { … },       // reviewer — same shapes as Posts
  analysis_correction_request: { … },

  takedown: { status, initiated_at, completed_at, notes: [], documents: [] },
  client_notes: [],
  ingestion: { type, source_url, ingested_at },
  system: { created_at, updated_at, s3_stored },
  content_reviewed_by
}
```

Canonical identity: `{ platform, platform_ad_id }`. Unique index intent: `{ platform: 1, platform_ad_id: 1 }`.

### `channel` (UI + optional persist)

| Value | Meaning | How the client resolves it |
|-------|---------|----------------------------|
| `ingestion` | Client **Upload Content** request | Prefer stored `channel`; else `submitted_url` set; else `ingestion.type` is `facebook_share_post` / `client_request` |
| `library` | Meta Ads Library crawl / reviewer manual with `/ads/library` URL | `original_url` (or `ingestion.source_url`) contains `/ads/library` |
| `feed` | Platform feed post (`/share`, `/posts`, `/reels`, permalinks, etc.) | URL matches feed patterns; default when not library and not client-requested |

Client-requested ads **always display `ingestion`**, even when the submitted link resolves to a library or feed URL internally. Ingest may set `channel: "ingestion"` and/or `submitted_url` at write time.

**UI labels by channel:** feed-channel ads show `platform_ad_id` as **Post ID** and link to `original_url` as **View Post**; library ads show **Ad ID** / **Ads Library**; ingestion shows **Ad ID** / **Source**.

**Media navigation:** when `content.cards.length > 1`, the client uses card carousel (Meta DPA/carousel). When `content.cards` is empty but `content.media.length > 1` (typical for migrated feed posts with thumbnail + video), the client shows a flat **media carousel** so reviewers can browse every captured asset. Single-item creatives render without a filmstrip.

### Mapping from Meta Ads Library payload

| Meta field | Ads field |
|------------|-----------|
| `ad_archive_id` | `platform_ad_id` |
| `page_id` | `advertiser_snapshot.platform_page_id` |
| `page_name` / `snapshot.page_name` | `advertiser_snapshot.page_name` |
| `snapshot.page_profile_uri` | `advertiser_snapshot.profile_url` |
| `snapshot.page_profile_picture_url` | `advertiser_snapshot.profile_pic` (+ S3 copy → `profile_pic_s3`) |
| `snapshot.cards[]` | `content.cards[]` + flattened `content.media[]` |
| `snapshot.title/body/caption/cta_*` / `link_*` / `display_format` | `content.*` |
| `start_date` / `end_date` (unix) | `list.start_date` / `list.end_date` + `ad_delivery.*` as BSON Date |
| `publisher_platform` | `list.publisher_platforms` + `ad_delivery.publisher_platforms` |
| `is_active`, impressions, spend, etc. | `list.*` / `ad_delivery.*` |
| Raw object | `source_payload` (trim large unused blobs if needed) |

### S3 media paths

Ingest copies card images/videos from Meta CDN to S3, then sets `s3_url` while keeping `original_url`:

```text
{Platform}_ads/{platform_ad_id}/{cardIndex}/{n}.{ext}
```

Reviewer manual uploads:

```text
ad-images/{tenantDbName}/{adId}/{timestamp}-{filename}
```

Set `system.s3_stored: true` when ingest persisted media.

### `Ad_profiles` (v3)

```js
{
  _id, schema_version: 3,
  platform,                    // "meta" | …
  platform_page_id,            // Meta page_id
  page_name, display_name, profile_url, is_verified,

  workflow: { review_status, client_status, reviewed_at },

  list: {
    risk, risk_rank,
    ad_count, reviewed_ad_count, max_threat_score,
    last_active_at, follower_count, location
  },

  enrichment: {
    biography, profile_pic_s3, profile_pic,
    page_categories: [], page_like_count, page_is_deleted, …
  },

  review_details: { … },
  client_notes: [],
  system: { created_at, updated_at, last_synced_from_ad_at }
}
```

Unique index intent: `{ platform: 1, platform_page_id: 1 }`.  
Ads for a profile = `Ads.find({ ad_profile_id })`.

### `case_events`

```js
{
  entity_type: "ad" | "ad_profile",
  entity_id: ObjectId,
  event_type, actor, summary, payload,
  occurred_at: Date,
  source: "client" | "ai_moderation_lambda" | "ingest" | …
}
```

Creative edits from Review Ads should insert `event_type: "content_updated"`.

---

## Indexes (recommended)

ESR (equality → sort → range). Created by `scripts/ensure_indexes_v3.js`.

**Ads**

- Unique: `{ platform: 1, platform_ad_id: 1 }` (`uniq_platform_ad_id`)
- Reviewer queue sort: `{ "workflow.review_status": 1, "list.sourced_at": -1, _id: -1 }`
- Client list default: `{ "workflow.review_status": 1, "list.effective_threat_score": -1, "list.sourced_at": -1, _id: 1 }`
- Reports / start-date sort: `{ "workflow.review_status": 1, "list.effective_threat_score": -1, "list.start_date": -1, _id: 1 }`
- Client status filter: `{ "workflow.review_status": 1, "workflow.client_status": 1, "list.effective_threat_score": -1, "list.sourced_at": -1 }`
- AI filter: `{ "workflow.ai_status": 1, "workflow.review_status": 1, "list.sourced_at": -1 }`
- Profile panel: `{ ad_profile_id: 1, "list.sourced_at": -1 }`
- Active filter: `{ platform: 1, "list.is_active": 1, "list.start_date": -1 }`
- Sparse compat: `{ "list.review_threat_score": 1 }` (sparse; client `$or` arm)
- Domain join: `{ linked_domain_ids: 1 }`

**Ad_profiles**

- Unique: `{ platform: 1, platform_page_id: 1 }`
- Manual ingest: `{ platform: 1, profile_url: 1 }`
- Reviewer default sort: `{ "list.ad_count": -1, "list.max_threat_score": -1, _id: 1 }`
- Reviewer + status: `{ "workflow.review_status": 1, "list.ad_count": -1, "list.max_threat_score": -1, _id: 1 }`
- Client list: `{ "workflow.review_status": 1, "workflow.reviewed_at": -1, "list.last_active_at": -1, _id: 1 }`
- Client status: `{ "workflow.review_status": 1, "workflow.client_status": 1, "workflow.reviewed_at": -1 }`
- Review threat: `{ "workflow.review_status": 1, "list.max_threat_score": -1 }`

---

## Client surfaces (this cut)

| Route | Status |
|-------|--------|
| `/review-ads` | Implemented — reviewer queue + content edit |
| `/review-ad-profiles` | Implemented — reviewer queue + associated ads |
| `/ad-profiles` | Implemented — client list (reviewed advertisers) |
| `/ads` | Implemented — client list of reviewed ads |

AI run/correction against `collection_name: "ads"` requires worker support; until then the client may omit or disable Run AI for ads.
