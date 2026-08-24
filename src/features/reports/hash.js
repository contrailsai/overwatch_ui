import crypto from 'crypto'

/**
 * Cache key for reports_generation rows. Must match the Lambda implementation.
 * `entityType` is appended only for non-posts jobs so existing post hashes stay stable.
 */
export function generateReportHash(
  projectId,
  postIds,
  reportType,
  profileId = '',
  reportFormat = 'pdf',
  entityType = 'posts'
) {
  const sortedIds = [...postIds].sort()
  const base = `${projectId}-${sortedIds.join(',')}-${reportType}-${profileId}-${reportFormat}`
  const rawString = entityType && entityType !== 'posts' ? `${base}-${entityType}` : base
  return crypto.createHash('sha256').update(rawString).digest('hex')
}
