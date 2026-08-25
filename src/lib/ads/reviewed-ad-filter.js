/** Ads eligible for the client list, report ordering, and export pipelines. */
export const REVIEWED_ADS_FILTER = {
  $or: [
    { 'workflow.review_status': 'reviewed' },
    { 'list.review_threat_score': { $exists: true, $ne: null } },
  ],
}
