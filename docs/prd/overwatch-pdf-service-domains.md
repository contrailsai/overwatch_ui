# overwatch-pdf-service: domain PDF handoff

**Audience:** `overwatch-pdf-service`  
**From:** `overwatch_client` (jobs + templates already shipping)  
**Goal:** handle `entityType: 'domains'` (and keep `entityType: 'ads'`) — **do not require `postIds`**.

**Current Lambda error (2026-09-08):** `Invalid payload: postIds must be a non-empty array`. The service still validates `postIds` before `entityType`. Client jobs:

| entityType | ID field sent | `postIds` sent? |
|---|---|---|
| omitted / posts | `postIds` | yes |
| `ads` | `adIds` | **no** — same validator rejects ads unless ads was already special-cased |
| `domains` | `domainIds` + `variantKeysByDomainId` | **no** |

Treat `domainIds` / `adIds` as the entity list. Do not look them up in `Posts`.

Product summary: [`domain-pdf-reports.md`](./domain-pdf-reports.md). Cloak lander shape: [`../ops/sebi-ads-domain-cloak-pipeline/SCHEMA.md`](../ops/sebi-ads-domain-cloak-pipeline/SCHEMA.md). Domain contract: [`../contracts/domains-schema-v1.md`](../contracts/domains-schema-v1.md).

## 1. SQS message (already sent)

```json
{
  "projectId": "<project_name>",
  "entityType": "domains",
  "domainIds": ["24-char hex", "..."],
  "variantKeysByDomainId": { "<domainId>": "bare" },
  "database_name": "<tenant db>",
  "reportType": "Summary | Detailed",
  "reportFormat": "pdf",
  "project": { },
  "profile": null,
  "jobId": "<reports_generation.id>"
}
```

- Collection: tenant `Domains` (`schema_version: 1`).
- `domainIds` are already ordered (risk desc, then `list.reviewed_at`, then `_id`). Keep that order in the PDF.
- There is **no `postIds` field** on this message. If your validator still requires `postIds`, ads (`adIds`) and domains (`domainIds`) will fail with `Invalid payload: postIds must be a non-empty array`. Branch on `entityType` first.
- `variantKeysByDomainId[id]` is `cloak_probe.variants[].label` (`bare` or a param like `pEl8X=MI1_HT2`). Always set by the client, including fallbacks.
- UI never sends `reportType: 'Single'`. One-domain detail export is `Detailed` with a single id. Still wire `Single` → `SingleDomainDocument` if you want parity with posts.
- Reject `reportFormat: 'docx'` (client already throws). No Profile / SimpleProfile for domains.

Client enqueue: [`src/features/reports/server/actions.js`](../../src/features/reports/server/actions.js).

## 2. Cache hash (must match client)

[`src/features/reports/hash.js`](../../src/features/reports/hash.js):

```
sortedIds = sort(domainIds)
base = `${projectId}-${sortedIds.join(',')}-${reportType}--${reportFormat}`
raw = `${base}-domains`
extra = sort(domainIds.map(id => `${id}=${variantKeysByDomainId[id] || ''}`)).join('|')
hash = sha256(`${raw}-${extra}`)
```

`profileId` is empty (the `--` in `base`). `extra` is required so Bare vs a param does not reuse the wrong file. If Lambda recomputes the hash, use this exact string. Client already writes it on `reports_generation.report_hash`.

## 3. Load + attach lander before render

For each id in `domainIds`:

1. Load the domain document (full cloak_probe variants, screenshot, media, review_details, list, discovery, whois/dns/ssl/hosting, content_classification).
2. Set `domain.reportVariantKey = variantKeysByDomainId[id]`.
3. Optionally set `domain.reportLander` to the matching variant (templates call `reportLanderForDomain`).

Fallback if the key is missing/stale (same as [`resolveReportLander`](../../src/lib/domains/domain-display.js)):

- Prefer client-visible variants: `review_details.client_visible_variant_keys` (empty/missing = all unique landers).
- Unique landers = `label === 'bare'` **or** `differs_from_bare`.
- Preferred key if still in that set; else first `kind === 'scam' && differs_from_bare`; else first unique (usually Bare).

## 4. Images

Do **not** always compress `analysis_results.screenshot`. That is the primary/best-unlocked shot and can disagree with the selected lander.

Per domain, compress in this order ([`landerImageSrc`](../../src/components/pdf/domainPdfShared.js)):

1. Selected variant `screenshot.s3_url` / `url`
2. Else domain `analysis_results.screenshot`

Sign HTTPS `amazonaws.com` URLs (same as posts/ads). Also sign **that lander’s** `media.images[].s3_url` and video poster/thumbnail for archived-media pages. Pass `compressedImages[i]` aligned with `domainIds[i]`.

## 5. Template mapping

Copy from client (keep `@react-pdf/renderer` + Outfit fonts already used for posts):

| reportType | Component | Props |
|---|---|---|
| Summary | `SummaryDomainsReportDocument` | `{ domains or posts, compressedImages, project }` |
| Detailed | `DetailedDomainsReportDocument` | same |
| Single | `SingleDomainDocument` | `{ domain or post, compressedImage, project }` |

Barrel: [`src/components/pdf/domainReports.js`](../../src/components/pdf/domainReports.js). Shared: [`domainPdfShared.js`](../../src/components/pdf/domainPdfShared.js), [`SingleDomainReport.js`](../../src/components/pdf/SingleDomainReport.js), [`SummaryDomainsReport.js`](../../src/components/pdf/SummaryDomainsReport.js), [`DetailedDomainsReport.js`](../../src/components/pdf/DetailedDomainsReport.js).

`domainPdfShared.js` imports `@/lib/domains/domain-display`. Either copy that module into the Lambda alias, or vendor these exports: `clientVisibleCloakVariants`, `collectDomainViolations`, `domainHasCloaking`, `domainVisitUrl`, `resolveReportLander`, `cloakVariantKey`.

Templates already accept `posts` as an alias for `domains` so an ads-style `posts=` render path still works if you attach `reportVariantKey` on each item.

## 6. Page contract

**Summary** — A4 landscape. Metrics: total / high / medium / low / safe / cloaked. Table: thumb, domain + visit URL, risk, cloaked Y/N · lander count, violations, ads count, hosting country, client status.

**Detailed / single** — one block per domain, **one lander only**:

1. Dossier (A4): domain, risk, status, `Lander: Bare|<param>`, visit URL, hero of that lander, legal/reasoning/violations, infra (WHOIS, hosting, SSL, DNS, ads, page meta, redirects, cloak context). Caption if other landers exist: this PDF covers one.
2. Full-page capture of that lander (skip if no shot).
3. Archived media grid for **that lander only** (4 per page).

Cloak/visit/counts in the PDF must use **client-visible** landers, not every probe variant.

## 7. Mongo fields Lambda needs

- Identity: `_id`, `domain_name`, `workflow.client_status`, `list.*` (risk, hosting, dates, scores).
- Review: `review_details` (reasoning, legal_codes, threat_types, `client_visible_variant_keys`, simple_report_description).
- Discovery: `discovery.occurrences` (ads count), `first_seen_url`, cloak helpers.
- `analysis_results.cloak_probe.variants[]`: `label`, `param`, `kind`, `url`, `title`, `excerpt`, `differs_from_bare`, `screenshot`, `media`.
- Infra modules already on the doc: whois, dns, ssl, hosting, content_classification, tech_stack, redirect_chain, screenshot.

Variant `label` is the stable key (must match `variantKeysByDomainId`).

## 8. Acceptance checks

- Summary of N domains → landscape table, N rows, thumbs from fallback lander.
- Detailed of one domain from list → dossier + capture + media for fallback lander (`scam` else Bare).
- Detailed from detail header after switching filmstrip → PDF lander caption/URL/shot match that tab; hash differs from Bare export of the same id.
- Domain with no cloak variants → still renders; lander Bare / primary screenshot.
- Unreviewed id must not appear (client already filters; Lambda should skip or fail closed).
- Existing posts/ads jobs unchanged (`entityType` omitted or `ads`).

## 9. What not to do

- Do not dump every `cloak_probe.variants` into one PDF.
- Do not reuse a completed job when only the lander key changed.
- Do not treat `analysis_results.screenshot` as the selected lander.
- Do not add DOCX for domains.
