# Domain PDF reports and client-visible unlockers

**Status:** Implemented in `overwatch_client` (PDF templates + job payload). `overwatch-pdf-service` must consume `entityType: 'domains'` and the templates under `src/components/pdf/*Domains*`.  
**Surfaces:** `/review-domains` (curate landers), `/domains` (client view + export)  
**Related:** [domains-schema-v1.md](../contracts/domains-schema-v1.md), [domain-analyzer-module.md](./domain-analyzer-module.md)

**Reports team (Lambda setup):** send [overwatch-pdf-service-domains.md](./overwatch-pdf-service-domains.md) — SQS payload, hash, lander attach, template mapping, acceptance checks.

## Unlockers vs reports

| Surface | Rule |
|---|---|
| Review `/review-domains` | Reviewer always sees every differing lander. |
| Client `/domains` | Show reviewer-selected landers. Empty selection = all differing landers. |
| Detailed PDF | Only the **active filmstrip lander** at export (or list fallback). Page 1 = dossier. Later pages = that lander’s capture + archived media. |
| Summary PDF | All selected domains in one table. One thumbnail per row. |

**List / multi-select Detailed fallback:** first client-visible `kind === 'scam'` that differs from bare, else Bare. Caption includes `Lander: …`.

## Reviewer: client-visible landers

Left column under the filmstrip. Checkboxes per `uniqueCloakVariants` row. Persist `review_details.client_visible_variant_keys` (`variant.label`). Empty / missing = all.

## Client export

`/domains` uses Summary PDF + Detailed PDF (no DOCX). Detail-header export passes the active filmstrip key. List export uses fallback keys. Jobs: `entityType: 'domains'`; hash includes `id:variantKey` pairs.

## Summary PDF

Metrics: total / high / medium / low / safe, plus cloaked count. Table: thumb, domain + URL, risk, cloaked + lander count, violations, ads count, hosting country, client status.

## Detailed PDF

One domain block after another (single-domain = one block).

1. **Dossier** — banner (domain, risk, status, lander key + URL), split (hero shot vs legal/reasoning/violations), infra band (WHOIS, hosting, SSL dates, DNS, ads, page meta, redirects, cloak context).
2. **Full-page capture** of that lander.
3. **Archived media** grid if present.

Templates: [`SummaryDomainsReport.js`](../../src/components/pdf/SummaryDomainsReport.js), [`SingleDomainReport.js`](../../src/components/pdf/SingleDomainReport.js), [`DetailedDomainsReport.js`](../../src/components/pdf/DetailedDomainsReport.js).
