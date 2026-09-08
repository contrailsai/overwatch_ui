/**
 * Domain PDF templates for overwatch-pdf-service.
 *
 * SQS: { entityType: 'domains', domainIds, variantKeysByDomainId, reportType, reportFormat, jobId, ... }
 * Attach reportVariantKey / reportLander on each domain before render.
 *
 * reportType Summary  → SummaryDomainsReportDocument ({ domains|posts, compressedImages, project })
 * reportType Detailed → DetailedDomainsReportDocument
 * reportType Single   → SingleDomainDocument ({ domain|post, compressedImage, project })
 */

export { SummaryDomainsReportDocument } from './SummaryDomainsReport'
export { DetailedDomainsReportDocument } from './DetailedDomainsReport'
export { SingleDomainDocument, SingleDomainPages } from './SingleDomainReport'
