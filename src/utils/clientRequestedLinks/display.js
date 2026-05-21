import { isKnownIngestedStatus } from './constants'

function toTitleCase(word) {
  const s = String(word).trim().toLowerCase()
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function normalizedStatusKey(status) {
  if (status == null) return null
  const key = String(status).trim().toLowerCase()
  return key || null
}

/** Label for UI — known statuses in Title Case; edge cases as "Unknown". */
export function formatIngestionStatusLabel(status) {
  const key = normalizedStatusKey(status)
  if (!key) return '—'
  if (isKnownIngestedStatus(key)) return toTitleCase(key)
  return 'Unknown'
}

/**
 * Case deep-link for upload history. Returns null when no link should be shown.
 * - ingested + reviewer → /review-cases/:id
 * - enlisted (any user) → /cases/:id
 * - client / client_admin on ingested, or missing case_id → null
 */
export function getClientRequestedLinkCaseHref({ ingested, caseId, isReviewer }) {
  const id = caseId != null ? String(caseId).trim() : ''
  if (!id) return null

  const status = normalizedStatusKey(ingested)
  if (status === 'enlisted') return `/cases/${id}`
  if (status === 'ingested' && isReviewer) return `/review-cases/${id}`
  return null
}

/** Badge classes for the four DB statuses; default for edge cases. */
export function getIngestionStatusBadgeClass(status) {
  const key = normalizedStatusKey(status)
  switch (key) {
    case 'pending':
      return 'bg-amber-50 text-amber-700 border-amber-100'
    case 'ingested':
      return 'bg-green-50 text-green-600 border-green-100'
    case 'failed':
      return 'bg-rose-50 text-rose-700 border-rose-100'
    case 'enlisted':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    default:
      return 'bg-slate-50 text-slate-700 border-slate-100'
  }
}
