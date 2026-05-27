/**
 * Risk bucket thresholds — aligned with buildCasesMatchQuery in actions.js
 * high > 95, medium > 75 && <= 95, low > 40 && <= 75, safe <= 40
 */
export const RISK_THRESHOLDS = {
  HIGH: 95,
  MEDIUM: 75,
  LOW: 40,
}

export const RISK_RANK = {
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  SAFE: 1,
  UNKNOWN: 0,
}

export function getRiskLabel(score) {
  if (score == null || Number.isNaN(Number(score))) {
    return { label: 'Safe', color: 'text-slate-500 bg-slate-50 border-slate-200' }
  }
  const n = Number(score)
  if (n > RISK_THRESHOLDS.HIGH) {
    return { label: 'High', color: 'text-rose-500 bg-rose-50 border-rose-200' }
  }
  if (n > RISK_THRESHOLDS.MEDIUM) {
    return { label: 'Medium', color: 'text-orange-500 bg-orange-50 border-orange-200' }
  }
  if (n > RISK_THRESHOLDS.LOW) {
    return { label: 'Low', color: 'text-amber-500 bg-amber-50 border-amber-200' }
  }
  return { label: 'Safe', color: 'text-slate-500 bg-slate-50 border-slate-200' }
}

export const ENGAGEMENT_WEIGHTS = {
  views: 1,
  likes: 2,
  comments: 3,
  shares: 4,
}

/** Weighted engagement: views + 2×likes + 3×comments + 4×shares */
export function computeEngagementScore(views = 0, likes = 0, comments = 0, shares = 0) {
  const v = Number(views) || 0
  const l = Number(likes) || 0
  const c = Number(comments) || 0
  const s = Number(shares) || 0
  return (
    v * ENGAGEMENT_WEIGHTS.views +
    l * ENGAGEMENT_WEIGHTS.likes +
    c * ENGAGEMENT_WEIGHTS.comments +
    s * ENGAGEMENT_WEIGHTS.shares
  )
}

function engagementToLong(fieldPath) {
  return { $convert: { input: { $ifNull: [fieldPath, 0] }, to: 'long', onError: 0, onNull: 0 } }
}

/** Mongo $addFields fragment for sort_engagement. */
export function buildEngagementScoreAddFields() {
  return {
    sort_engagement: {
      $add: [
        engagementToLong('$engagement.views'),
        { $multiply: [ENGAGEMENT_WEIGHTS.likes, engagementToLong('$engagement.likes')] },
        { $multiply: [ENGAGEMENT_WEIGHTS.comments, engagementToLong('$engagement.comments')] },
        { $multiply: [ENGAGEMENT_WEIGHTS.shares, engagementToLong('$engagement.shares')] },
      ],
    },
  }
}

/** Combined sort-field helpers for cases list aggregation pipelines. */
export function buildCaseSortAddFields() {
  return {
    ...buildRiskRankAddFields(),
    ...buildEngagementScoreAddFields(),
  }
}

/**
 * Default cases list $sort: risk bucket -> engagement -> alert date -> publish date -> _id.
 * Engagement tiebreaker is always descending.
 */
export function buildCasesSortPipeline(sort = {}) {
  const engagementDesc = -1
  const dateDesc = -1
  const idAsc = 1

  if (sort.field === 'original_date') {
    return {
      sort_original_date: sort.direction === 'asc' ? 1 : -1,
      risk_rank: -1,
      sort_engagement: engagementDesc,
      sort_processed_after: dateDesc,
      _id: idAsc,
    }
  }

  if (sort.field === 'processed_date') {
    return {
      sort_processed_after: sort.direction === 'asc' ? 1 : -1,
      risk_rank: -1,
      sort_engagement: engagementDesc,
      sort_original_date: dateDesc,
      _id: idAsc,
    }
  }

  const riskDir = sort.field === 'threat_score' && sort.direction === 'asc' ? 1 : -1
  return {
    risk_rank: riskDir,
    sort_engagement: engagementDesc,
    sort_processed_after: dateDesc,
    sort_original_date: dateDesc,
    _id: idAsc,
  }
}

/** Mongo $addFields fragment for risk_rank (bucket sort key). */
export function buildRiskRankAddFields() {
  const score = '$review_details.threat_score'
  return {
    risk_rank: {
      $switch: {
        branches: [
          { case: { $gt: [score, RISK_THRESHOLDS.HIGH] }, then: RISK_RANK.HIGH },
          {
            case: {
              $and: [{ $gt: [score, RISK_THRESHOLDS.MEDIUM] }, { $lte: [score, RISK_THRESHOLDS.HIGH] }],
            },
            then: RISK_RANK.MEDIUM,
          },
          {
            case: {
              $and: [{ $gt: [score, RISK_THRESHOLDS.LOW] }, { $lte: [score, RISK_THRESHOLDS.MEDIUM] }],
            },
            then: RISK_RANK.LOW,
          },
          { case: { $lte: [score, RISK_THRESHOLDS.LOW] }, then: RISK_RANK.SAFE },
        ],
        default: RISK_RANK.UNKNOWN,
      },
    },
  }
}
