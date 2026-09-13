/** Posts eligible for cases list, report ordering, and export pipelines. */
export const REVIEWED_THREAT_SCORE_FILTER = {
  'workflow.review_status': 'reviewed',
}

/** Profiles shown on the client Profiles list / Posts Nexus profile hubs. */
export const CLIENT_VISIBLE_PROFILE_FILTER = {
  $or: [
    { 'workflow.review_status': 'reviewed' },
    { 'list.reviewed_post_count': { $gt: 0 } },
    { 'review_details.reviewed_at': { $exists: true } },
  ],
}

export function withReviewedThreatScoreFilter(query = {}) {
  return {
    ...query,
    $and: [
      ...(query.$and || []),
      {
        $or: [
          { 'workflow.review_status': 'reviewed' },
          { 'list.review_threat_score': { $exists: true, $ne: null } },
        ],
      },
    ],
  }
}

export function isPendingReviewCase(post) {
  return post?.workflow?.review_status === 'pending'
    || post?.list?.review_threat_score == null
}

export function getCaseInspectHref(postId, { pending }) {
  return pending ? `/review-cases/${postId}` : `/cases/${postId}`
}
