# Cloak probe data shape

Stored on the same `Domains` document (`schema_version: 1`). Domain identity remains eTLD+1; query strings are variants.

## `analysis_results.cloak_probe`

```js
{
  probed_at: ISODateString,
  run_id: uuid,
  unlocked: boolean,
  unlocked_params: ["pEl8X=MI1_HT2", ...],
  creative_count: number,
  bare: { /* same shape as a variant */ },
  variants: [
    {
      label: "bare" | "pEl8X=MI1_HT2",
      param_key: "pEl8X" | null,
      param_value: "MI1_HT2" | null,
      param: "pEl8X=MI1_HT2" | null,
      url: "https://mowdmcporvx.com/?pEl8X=MI1_HT2",  // client-openable
      final_url, status,
      kind: "dummy" | "scam" | "mixed" | "unknown" | "error",
      differs_from_bare: boolean,
      text_sha16: string,
      title, excerpt, dummy_hits, scam_hits, body_len, error,
      screenshot: {
        s3_url, captured_at, source_url, width, height, content_type, sha256, label
      },
      media: {
        images: [{ source_url, s3_url, content_type, bytes, width, height, sha256, alt }],
        videos: [{ source_url, s3_url, content_type, bytes, sha256 }],
        skipped: [{ source_url, reason }]
      },
      page_text: { title, headings, paragraphs, ... }
    }
  ],
  creatives: [
    {
      text_sha16, kind, title, excerpt,
      params: ["pEl8X=MI1_HT2", "pEl8X=MI2_HT2"],  // params that rendered this page
      urls: ["https://host/?pEl8X=MI1_HT2", ...],
      representative_url: "https://host/?pEl8X=MI1_HT2",
      screenshot: { ... },
      media: { images, videos, skipped },
      scam_hits: []
    }
  ]
}
```

### Capture rules

- Screenshot **every** successful variant (dummy vs scam is evidence).
- Archive on-page media **once per `text_sha16`** (same creative shares the archive).
- Still store the **exact `url`** on every variant so reviewers can open each token.

S3 prefix (via `domain_analyzer.s3_paths`):

```text
domain-analyzer/{DB_NAME}/{domain_name}/{run_id}/screenshot/full.png
domain-analyzer/{DB_NAME}/{domain_name}/{run_id}/screenshot/variant-{label}.png
domain-analyzer/{DB_NAME}/{domain_name}/{run_id}/media/{sha256}.{ext}
```

## Compatibility fields (existing UI)

| Field | Meaning after probe |
|-------|---------------------|
| `analysis_results.screenshot` | Best unlocked scam (else bare) |
| `analysis_results.media` | Media for that primary creative |
| `analysis_results.page_text` | Text/headings for primary |
| `analysis_results.content_classification` | category/labels; `cloak_param`, `source_url` |
| `analysis_results.capture.variants` | Slim `{ label, title, url, kind, screenshot_s3_url }` |

## Discovery helpers

```js
discovery: {
  cloak_unlocked: true,
  unlocked_params: [...],
  variant_urls: [
    { url, param, kind, label }
  ],
  // existing:
  first_seen_url, occurrences: [{ entity_type: "ad", entity_id, url, seen_at }]
}
```

## Classification heuristics (`cloak_probe.py`)

- **Dummy markers:** horology, luxury watch, timepiece, exhibition, gallery, …
- **Scam markers:** invest, quantum, ₹ / rs., earn, withdraw, nirmala, sudha murthy, …
- **Unlocked:** variant `differs_from_bare` and `kind` in `scam` | `mixed`

Note: some hosts return a different *dummy* shell for certain tokens (e.g. “RagaHorology” guide). Those still mark `differs_from_bare`; treat `kind` + title carefully when triaging.

## Ads ↔ Domains M2M

```js
// Ads
linked_domain_ids: [ObjectId, ...]

// Domains
linked_ad_ids: [ObjectId, ...]
discovery.occurrences: [{ entity_type: "ad", entity_id: ObjectId, url, seen_at }]
```
