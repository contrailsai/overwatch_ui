/** Ads eligible for the client list, report ordering, and export pipelines. */
export const REVIEWED_ADS_FILTER = {
  $or: [
    { 'workflow.review_status': 'reviewed' },
    { 'list.review_threat_score': { $exists: true, $ne: null } },
  ],
}

/** Ad profiles shown on the client Ad Profiles list / Ads Nexus hubs. */
export const CLIENT_VISIBLE_AD_PROFILE_FILTER = {
  $or: [
    { 'workflow.review_status': 'reviewed' },
    { 'list.reviewed_ad_count': { $gt: 0 } },
    { 'review_details.reviewed_at': { $exists: true } },
  ],
}
