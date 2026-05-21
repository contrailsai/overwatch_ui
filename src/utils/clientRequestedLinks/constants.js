/** Matches `check_ingested_status` on public.client_requested_links */
export const CLIENT_REQUESTED_LINK_INGESTED_STATUSES = Object.freeze([
  'pending',
  'ingested',
  'failed',
  'enlisted',
])

export const CLIENT_REQUESTED_LINK_DEFAULT_INGESTED = 'pending'

export function isKnownIngestedStatus(status) {
  if (status == null) return false
  return CLIENT_REQUESTED_LINK_INGESTED_STATUSES.includes(String(status).trim().toLowerCase())
}
