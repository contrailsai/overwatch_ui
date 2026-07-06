/** Posts eligible for cases list, report ordering, and export pipelines. */
export const REVIEWED_THREAT_SCORE_FILTER = {
  'workflow.review_status': 'reviewed',
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
