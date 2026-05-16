import crypto from 'crypto'

/**
 * Cache key for reports_generation rows. Must match the Lambda implementation.
 */
export function generateReportHash(projectId, postIds, reportType, profileId = '', reportFormat = 'pdf') {
  const sortedIds = [...postIds].sort()
  const rawString = `${projectId}-${sortedIds.join(',')}-${reportType}-${profileId}-${reportFormat}`
  return crypto.createHash('sha256').update(rawString).digest('hex')
}
