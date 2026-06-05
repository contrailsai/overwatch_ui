/** @typedef {'pdf' | 'docx'} ReportFormat */

export const REPORT_FORMATS = /** @type {const} */ ({
  PDF: 'pdf',
  DOCX: 'docx',
})

export const REPORT_TYPES = /** @type {const} */ ({
  SUMMARY: 'Summary',
  DETAILED: 'Detailed',
  SINGLE: 'Single',
  PROFILE: 'Profile',
  SIMPLE_PROFILE: 'SimpleProfile',
})

/** Max age before a completed report with the same hash is regenerated. */
export const REPORT_REUSE_MAX_AGE_MS = 2 * 60 * 1000

/** Realtime channel name prefix per format (must stay unique per job). */
export function getRealtimeChannelPrefix(reportFormat) {
  return reportFormat === REPORT_FORMATS.DOCX ? 'docx-report' : 'report'
}

export function getFileExtension(reportFormat) {
  return reportFormat === REPORT_FORMATS.DOCX ? 'docx' : 'pdf'
}

export function getFormatLabel(reportFormat) {
  return reportFormat === REPORT_FORMATS.DOCX ? 'DOCX' : 'PDF'
}
