import crypto from 'crypto';

/**
 * Generates a consistent hash for a report request to be used as a cache key.
 * The logic must exactly match the Lambda function's implementation.
 */
export function generateReportHash(projectId, postIds, reportType, profileId = '', reportFormat = 'pdf') {
  const sortedIds = [...postIds].sort();
  const rawString = `${projectId}-${sortedIds.join(',')}-${reportType}-${profileId}-${reportFormat}`;
  return crypto.createHash('sha256').update(rawString).digest('hex');
}
