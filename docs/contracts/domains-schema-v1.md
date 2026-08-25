# Domains Schema V1 — Service Contract

**Audience:** domain-analyzer service (internal team), and `overwatch_client`.
**Status:** Draft — client surfaces (`/domains`, `/review-domains`) land with this contract. Analyzer module PRD: [`docs/prd/domain-analyzer-module.md`](../prd/domain-analyzer-module.md). `analysis_results` module keys below are now the shipped set; additive keys are allowed and must not break the client.
**Reference samples:** [`sample_documents/mongodb_schema/Domains.json`](../../sample_documents/mongodb_schema/Domains.json) (`newzonic.com`), [`sample_documents/mongodb_schema/Domains.noiverjio34.json`](../../sample_documents/mongodb_schema/Domains.noiverjio34.json) (`noiverjio34.com`), [`sample_documents/mongodb_schema/Domains.mezaxs.json`](../../sample_documents/mongodb_schema/Domains.mezaxs.json) (`mezaxs.com`)
**Related:** [`ads-ad-profiles-schema-v3.md`](./ads-ad-profiles-schema-v3.md), [`posts-profiles-schema-v3.md`](./posts-profiles-schema-v3.md) (shared conventions this doc reuses on purpose)

---

## Why a new, independent schema line

Domains are not Posts, Profiles, or Ads. There is no author/advertiser, no creative, and no single "platform" — a domain is a fact about the internet that we happen to have discovered through a link somewhere (a post, an ad, an ad profile bio, a manual submission, …). The analysis is produced by a dedicated internal domain-analyzer module whose exact capabilities (WHOIS, DNS, SSL, hosting, content classification, reputation feeds, screenshots, etc.) are still being built out.

Because of that:

- One collection, not two. There is no `Domain_profiles` — a domain **is** the entity, so `list` / `workflow` / `analysis_results` / `review_details` all live directly on the `Domains` document (unlike Ads, which splits creative-instance vs. advertiser-page).
- `analysis_results` is deliberately a loosely-typed, module-keyed bag (see below) instead of a fixed shape, because the analyzer's internals will evolve. Everything **outside** `analysis_results` (identity, `workflow`, `list`, `review_details`, `system`) is a firm contract client code can rely on today.
- `schema_version: 1` — its own version line, independent of the Posts/Ads `schema_version: 3` numbering.

| Collection | Role |
|------------|------|
| `Domains` | Canonical domain document (`schema_version: 1`) |
| `case_events` | Reused; `entity_type: "domain"` |

---

## Identity & discovery

Canonical identity is the **registrable domain** (eTLD+1), lowercased and punycode-normalized where applicable — e.g. `iknroling.com`, not `http://iknroling.com/?content_id=3` or `www.iknroling.com`. Unique index intent: `{ domain_name: 1 }`.

A domain is very often discovered through a link embedded in a Post, Ad, or Profile. Rather than creating duplicate domain docs per occurrence, every sighting is appended to `discovery.occurrences[]` and the domain doc is upserted by `domain_name`.

```js
discovery: {
  first_entity_type,   // "post" | "ad" | "ad_profile" | "profile" | "manual" | "feed" | …
  first_entity_id,      // ObjectId of the doc that first surfaced this domain
  first_seen_url,        // exact URL/link text as scraped (pre-normalization)
  occurrences: [{
    entity_type,        // "post" | "ad" | "ad_profile" | "profile" | "manual" | …
    entity_id,           // ObjectId → Posts / Ads / Ad_profiles / profiles
    url,                  // exact link as scraped
    seen_at              // Date
  }]
}
```

`list.occurrence_count` mirrors `discovery.occurrences.length` for cheap sorting/filtering without loading the array.

---

## Field ownership

### Domain-analyzer service owns

| Field | Notes |
|-------|--------|
| `schema_version` | Always `1` |
| `domain_name` | Canonical eTLD+1, lowercase, punycode |
| `discovery.*` | Set on first insert; `occurrences[]` appended on every re-sighting ($addToSet-style upsert, dedupe by `entity_id` + `url`) |
| `analysis_results.*` | Full-replace per analyzer run, keyed by module (see below) |
| `workflow.analysis_status` | `pending` at insert → `running` → `completed` \| `failed` |
| `list.ai_threat_score`, `list.threat_types`, `list.violation_flags` | Derived from `analysis_results` |
| `list.category` | Analyzer's best-guess classification (`phishing`, `counterfeit`, `gambling`, `adult`, `malware`, `scam`, `benign`, `unknown`, …) |
| `list.registrar`, `list.hosting_provider`, `list.hosting_country` | Denormalized from `analysis_results.whois` / `analysis_results.hosting` |
| `list.is_reachable`, `list.ssl_valid` | Denormalized liveness/cert checks |
| `list.first_seen_at`, `list.last_seen_at`, `list.last_analyzed_at` | Dates |
| `list.effective_threat_score`, `list.risk_rank` | Recompute on every analyzer write (respect existing `list.review_threat_score` if present — review wins, same formula as Posts/Ads) |
| `ingestion.*`, `system.*` | |
| `workflow.review_status` | `pending` until human review |
| `workflow.client_status` | Default `open` |
| `workflow.visibility_status` | `up` \| `down` \| `parked` \| `unknown` |
| `workflow.takedown_status` | Default `none` |

**Analyzer must not** write `review_details`, `list.review_*`, or client workflow decisions.

### Client / reviewer owns

| Field | Notes |
|-------|--------|
| `review_details` | Reviewer's verdict — same conceptual shape as Posts/Ads `review_details` (see below), fields adapted for domains |
| `workflow.review_status` | `reviewed` |
| `workflow.client_status`, `workflow.alerted_at` | Client decisions (`open` / `alerted` / `no_action` / `flag_for_takedown` / `takedown`, reusing `mapUiClientStatusToV3` / `mapV3ClientStatusToUi`) |
| `list.review_threat_score`, `list.reviewed_at` | After human review |
| `list.effective_threat_score`, `list.risk_rank` | Recalculated after review (review wins) |
| `takedown.*`, `workflow.takedown_status` | When takedown flow is enabled for domains |
| `client_notes` | |

---

## Shared formulas (reused from Posts/Ads)

- `effective_threat_score = review_threat_score ?? ai_threat_score`
- `risk_rank` thresholds (`>95` high, `>75` medium, `>40` low, else safe) — see `RISK_THRESHOLDS`
- Native BSON `Date` for all `list.*` / `system.*` / `workflow.alerted_at` sort fields

---

## Document shape

### `Domains` (v1)

```js
{
  _id, schema_version: 1,
  domain_name,                 // canonical eTLD+1, lowercase, punycode

  discovery: {
    first_entity_type, first_entity_id, first_seen_url,
    occurrences: [{ entity_type, entity_id, url, seen_at }]
  },

  workflow: {
    analysis_status,           // "pending" | "running" | "completed" | "failed"
    review_status,              // "pending" | "reviewed"
    client_status,               // "open" | "alerted" | "no_action" | "flag_for_takedown" | "takedown"
    visibility_status,           // "up" | "down" | "parked" | "unknown"
    takedown_status,             // "none" | …
    alerted_at
  },

  list: {
    ai_threat_score, review_threat_score, effective_threat_score,
    risk_rank,                    // "high" | "medium" | "low" | "safe" | null
    threat_types: [], violation_flags: [],
    category,                      // analyzer's classification label
    registrar, hosting_provider, hosting_country,
    is_reachable, ssl_valid,
    first_seen_at, last_seen_at, last_analyzed_at, reviewed_at,
    occurrence_count
  },

  // Module-keyed bag — analyzer owns internals; unknown keys display-as-JSON.
  // Full-replace per module on each analyzer run; do not rename/remove a
  // shipped module key without bumping schema_version.
  // Shipped keys (see domain-analyzer PRD): whois, dns, ssl, hosting,
  // reputation, content_classification, page_text, tech_stack, redirect_chain,
  // screenshot, capture, media, raw.
  analysis_results: {
    whois: { … },                 // registrar, created_at, expires_at, registrant_country, privacy_protected
    dns: { … },                   // a/aaaa/mx/ns/txt records, nameservers
    ssl: { … },                   // issuer, valid_from, valid_to, is_valid, san[]
    hosting: { … },               // ip, asn, provider, country, city, is_cdn, anycast
    reputation: { … },            // blocklist/threat-intel hits, sources[]
    content_classification: { … },// title, summary, excerpt, category, labels, poi_names, spoofed_brands, lander_path, cloak_param
    page_text: {                  // rendered DOM extract
      title, meta_description, og_title, og_description, canonical_url,
      headings: [{ tag, text }],  // h1–h3
      paragraphs: [],             // visible <p>
      language
    },
    tech_stack: [ … ],            // detected frameworks/CMS/analytics
    redirect_chain: [ … ],        // [{ url, status_code }]
    screenshot: {                 // full-page capture; s3_url must be HTTPS amazonaws.com in prod
      s3_url, captured_at, source_url, width, height, content_type, sha256
    },
    capture: { run_id, user_agent, pre_js_title, post_js_title, variants: [], error },
    media: {                      // on-page images/videos archived to S3
      images: [{ source_url, s3_url, content_type, bytes, width, height, sha256, alt }],
      videos: [{ source_url, s3_url, content_type, bytes, sha256 }],
      skipped: [{ source_url, reason }]
    },
    raw: { … }                    // optional trimmed raw analyzer payload
  },

  review_details: {
    threat_score, category, threat_types: [],
    reasoning, reviewer_comments,
    is_parked, is_placeholder,
    poi_names: [], legal_codes: [],
    reviewed_at
  },

  analysis_correction_request: { … },   // same correction-flow shape as Posts/Ads

  takedown: { status, initiated_at, completed_at, notes: [], documents: [] },
  client_notes: [],
  ingestion: { type, source_url, ingested_at },
  system: { created_at, updated_at },
  content_reviewed_by
}
```

### `case_events`

```js
{
  entity_type: "domain",
  entity_id: ObjectId,
  event_type, actor, summary, payload,
  occurred_at: Date,
  source: "client" | "domain_analyzer" | "ingest" | …
}
```

---

## Indexes (recommended)

ESR (equality → sort → range). Created by `scripts/ensure_indexes_v3.js`.

- Unique: `{ domain_name: 1 }`
- Reviewer queue: `{ "workflow.review_status": 1, "list.last_analyzed_at": -1, "list.last_seen_at": -1, _id: -1 }`
- Client list: `{ "workflow.review_status": 1, "list.last_seen_at": -1, _id: 1 }`
- Client status: `{ "workflow.review_status": 1, "workflow.client_status": 1, "list.last_seen_at": -1 }`
- Sort by score: `{ "workflow.review_status": 1, "list.effective_threat_score": -1, _id: 1 }`
- Sort by occurrences: `{ "workflow.review_status": 1, "list.occurrence_count": -1, _id: 1 }`
- Analysis filter: `{ "workflow.review_status": 1, "workflow.analysis_status": 1, "list.last_analyzed_at": -1 }`
- Risk filter: `{ "list.risk_rank": 1, "list.last_seen_at": -1 }` (equality on `risk_rank`; regex filters cannot use this prefix)
- Discovery lookup: `{ "discovery.occurrences.entity_id": 1 }`
- Ad join: `{ linked_ad_ids: 1 }`

---

## Client surfaces (this cut)

| Route | Status |
|-------|--------|
| `/domains` | Shell — client list (reviewed domains), minimal columns, detail panel dumps `analysis_results` as-is |
| `/review-domains` | Shell — reviewer queue (pending analysis/review), minimal review action (category + threat score + notes) |

Analyzer integration (writing `analysis_results` + `workflow.analysis_status`) is specified in [`docs/prd/domain-analyzer-module.md`](../prd/domain-analyzer-module.md). Until that service ships, seed fixtures (`scripts/seed_newzonic_domain.js`) so `/review-domains` has pages to review. `/domains` only lists documents with `workflow.review_status: "reviewed"`.

Production `screenshot.s3_url` / `media.*.s3_url` must be full `amazonaws.com` HTTPS URLs so `getSignedImageUrl` can sign them. Leading `/` paths are fixture-only.
