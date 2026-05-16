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
 * PDF/DOCX React document templates remain under @/components/pdf and @/components/docx.
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
