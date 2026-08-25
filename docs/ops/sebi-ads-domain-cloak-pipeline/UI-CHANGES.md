# Overwatch UI changes (cloak variants)

Shipped in `overwatch_client` so Review Domains / Domains can show per-param captures and openable lander URLs.

## Files touched

| File | Change |
|------|--------|
| [`src/lib/domains/domain-helpers.js`](../../../src/lib/domains/domain-helpers.js) | Sign primary + per-variant screenshots/media; expose `cloakVariants`, `cloakCreatives`, `discovery.variant_urls` |
| [`src/lib/domains/domain-display.js`](../../../src/lib/domains/domain-display.js) | `domainVisitUrl` prefers best unlocked scam URL |
| [`src/components/domains/DomainCloakVariants.js`](../../../src/components/domains/DomainCloakVariants.js) | **New** — variant tabs, Open URL, screenshot, media gallery, creative groupings |
| [`src/components/domains/DomainAnalysisResults.js`](../../../src/components/domains/DomainAnalysisResults.js) | First-class “Cloak variants” card; exclude `cloak_probe` from raw JSON dump |
| [`src/app/(dashboard)/review-domains/ReviewDomainDetails.js`](../../../src/app/(dashboard)/review-domains/ReviewDomainDetails.js) | Render `DomainCloakVariants` when variants exist |
| [`src/app/(dashboard)/domains/DomainDetails.js`](../../../src/app/(dashboard)/domains/DomainDetails.js) | Same + list openable `discovery.variant_urls` |

## Reviewer flow

1. Open `/review-domains` for tenant mapped to `SEBI-Data-Search`.
2. Select a domain with `cloak_probe.unlocked`.
3. Use variant chips (`bare`, `pEl8X=MI1_HT2`, …).
4. Open the exact lander via the blue URL (includes search params).
5. Screenshot + archived images update with the selected variant.

Client `/domains` only lists `workflow.review_status: reviewed` — until reviewers mark domains reviewed, evidence lives on Review Domains.

## Signing

`getSignedImageUrl` is used for any `amazonaws.com` `s3_url` on:

- primary `analysis_results.screenshot`
- each `cloak_probe.variants[].screenshot`
- `media.images[]` / `videos[]` on primary and variants
