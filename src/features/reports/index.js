/**
 * Report generation feature — async export pipeline (job → wait → download).
 *
 * Flow:
 *   UI (ReportGenerate / ReportExportButton)
 *     → useReportExport (client)
 *     → getOrCreateReportJob (server) → SQS → Lambda
 *     → waitForReportCompletion (client realtime + poll + server fallback)
 *     → getReportDownloadUrl (server) → browser download
 *
 * Post /cases reports:
 *   Pass the current table `sort` ({ field, direction }) through export.
 *   getOrCreateReportJob → orderPostIdsForReport(ids, sort) → SQS `postIds`
 *   in the same order as the cases/feeds UI (default: engagement_score desc).
 *   The PDF worker walks `postIds` in array order; it does not re-sort.
 *   Details: src/app/(dashboard)/cases/CASES_DATA_FETCHING_README.md
 *
 * PDF/DOCX React document templates remain under @/components/pdf and @/components/docx.
 * Domain PDFs: SummaryDomainsReportDocument, DetailedDomainsReportDocument, SingleDomainDocument.
 * SQS payload for domains includes entityType: 'domains', domainIds, variantKeysByDomainId.
 * Ad profile PDFs: entityType: 'ad_profiles', adProfileIds (Summary PDF only).
 */

export { REPORT_FORMATS, getRealtimeChannelPrefix, getFileExtension, getFormatLabel } from './constants'
export { generateReportHash } from './hash'
export { isReportFailure, isReportSuccess, isReportInFlight } from './lib/status'
export { resolveExistingReportJob } from './lib/resolve-job'
export { waitForReportCompletion, waitForReportGenerationRow } from './lib/wait-for-completion'
export {
  getOrCreateReportJob,
  getOrCreateDocxReportJob,
  getReportJobStatus,
  getReportDownloadUrl,
} from './server/actions'
export { flushReportWaitTelemetry } from './server/telemetry'
export { useReportExport, usePdfExport, useDocxExport } from './client/use-report-export'
export { REPORT_EXPORT_PRESETS } from './client/presets'
export { ReportExportButton } from './components/ReportExportButton'
export { default as ReportGenerate } from './components/ReportGenerate'
