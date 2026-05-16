/** @typedef {'pdf' | 'docx'} ReportFormat */

export const REPORT_FORMATS = /** @type {const} */ ({
  PDF: 'pdf',
  DOCX: 'docx',
})

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
