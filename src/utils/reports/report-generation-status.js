/**
 * Status helpers aligned with the report generation service contract.
 * @see module guide: [100%] Complete / [Error] ... / legacy "Failed:" strings
 */

export function isReportFailure(status) {
  if (status == null || typeof status !== 'string') return false
  const s = status.trim().toLowerCase()
  return s.startsWith('[error]') || s.includes('failed')
}

/**
 * Terminal success: artifact URL present and status is not a failure.
 * Treats non-null s3_path as success when not failed (handles race where path is set before final status).
 */
export function isReportSuccess(s3Path, status) {
  if (!s3Path) return false
  if (isReportFailure(status)) return false
  if (status == null || String(status).trim() === '') return true
  const t = String(status).trim()
  if (t.startsWith('[100%] Complete')) return true
  if (/^\[100%\]/i.test(t) && /complete/i.test(t)) return true
  if (/100%/.test(t) && /complete/i.test(t)) return true
  return true
}

export function isReportInFlight(row) {
  if (!row) return false
  if (isReportFailure(row.status)) return false
  if (isReportSuccess(row.s3_path, row.status)) return false
  return true
}
