import { REPORT_FORMATS } from '@/features/reports/constants'

/**
 * Analytics + export defaults for each report entry point.
 * @typedef {object} ReportExportPreset
 * @property {'pdf'|'docx'} format
 * @property {string} reportType
 * @property {string} fileNamePrefix
 * @property {string} [gaEventName]
 * @property {{ type: string, format: string }} posthog
 * @property {string} activityKey
 * @property {string} loadingFallback
 * @property {string} idleLabel
 */

/** @type {Record<string, ReportExportPreset>} */
export const REPORT_EXPORT_PRESETS = {
  summaryPdf: {
    format: REPORT_FORMATS.PDF,
    reportType: 'Summary',
    fileNamePrefix: 'Overwatch_Report',
    gaEventName: 'download_summary_report',
    posthog: { type: 'Summary Report', format: 'pdf' },
    activityKey: 'summary_pdf',
    loadingFallback: 'Preparing...',
    idleLabel: 'Export Summary PDF',
  },
  detailedPdf: {
    format: REPORT_FORMATS.PDF,
    reportType: 'Detailed',
    fileNamePrefix: 'Detailed_Report',
    gaEventName: 'download_detailed_report',
    posthog: { type: 'Detailed Case Report', format: 'pdf' },
    activityKey: 'detailed_pdf',
    loadingFallback: 'Generating PDF...',
    idleLabel: 'Export Detailed Report',
  },
  detailedDocx: {
    format: REPORT_FORMATS.DOCX,
    reportType: 'Detailed',
    fileNamePrefix: 'Detailed_Report',
    gaEventName: 'download_detailed_cases_report_docx',
    posthog: { type: 'Detailed Case Report', format: 'docx' },
    activityKey: 'detailed_docx',
    loadingFallback: 'Generating DOCX...',
    idleLabel: 'Export Detailed DOCX',
  },
}
