import crypto from 'crypto'

/**
 * Cache key for reports_generation rows. Must match the Lambda implementation.
 * `entityType` is appended only for non-posts jobs so existing post hashes stay stable.
 * `extra` (e.g. domain lander keys) is appended when non-empty.
 */
export function generateReportHash(
  projectId,
  postIds,
  reportType,
  profileId = '',
  reportFormat = 'pdf',
  entityType = 'posts',
  extra = ''
) {
  const sortedIds = [...postIds].sort()
  const base = `${projectId}-${sortedIds.join(',')}-${reportType}-${profileId}-${reportFormat}`
  let rawString = entityType && entityType !== 'posts' ? `${base}-${entityType}` : base
  if (extra) rawString = `${rawString}-${extra}`
  return crypto.createHash('sha256').update(rawString).digest('hex')
}
