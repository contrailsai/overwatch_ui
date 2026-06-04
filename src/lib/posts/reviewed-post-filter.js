/** Posts eligible for cases list, report ordering, and export pipelines. */
export const REVIEWED_THREAT_SCORE_FILTER = { 'review_details.threat_score': { $exists: true } }

export function withReviewedThreatScoreFilter(query = {}) {
  return { ...query, ...REVIEWED_THREAT_SCORE_FILTER }
}
