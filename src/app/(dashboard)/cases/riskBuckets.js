/**
 * Risk bucket thresholds — aligned with list.effective_threat_score materialization.
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

const STRING_RISK_RANK = {
  high: RISK_RANK.HIGH,
  medium: RISK_RANK.MEDIUM,
  mid: RISK_RANK.MEDIUM,
  low: RISK_RANK.LOW,
  safe: RISK_RANK.SAFE,
}

export function getRiskLabel(score) {
  if (score == null || Number.isNaN(Number(score))) {
    return { label: 'Safe', color: 'text-slate-600 bg-slate-50 border-slate-200' }
  }
  const n = Number(score)
  if (n > RISK_THRESHOLDS.HIGH) {
    return { label: 'High', color: 'text-rose-700 bg-rose-50 border-rose-300' }
  }
  if (n > RISK_THRESHOLDS.MEDIUM) {
    return { label: 'Medium', color: 'text-orange-800 bg-orange-100 border-orange-300' }
  }
  if (n > RISK_THRESHOLDS.LOW) {
    return { label: 'Low', color: 'text-amber-800 bg-amber-100 border-amber-300' }
  }
  return { label: 'Safe', color: 'text-slate-600 bg-slate-50 border-slate-200' }
}

export const ENGAGEMENT_WEIGHTS = {
  views: 1,
  likes: 2,
  comments: 3,
  shares: 4,
}

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

/** @deprecated v3 uses materialized list fields directly in sort pipelines. */
export function buildCaseSortAddFields() {
  return {}
}

const engagementDesc = -1
const dateDesc = -1
const idAsc = 1

export function buildCasesDefaultListSortPipeline() {
  return {
    'list.effective_threat_score': -1,
    'list.alert_hour_ist': -1,
    'list.engagement_score': -1,
    'list.posted_at': -1,
    'list.reviewed_at': -1,
    _id: idAsc,
  }
}

export function buildCasesListSortPipeline(sort = {}) {
  if (sort.field === 'published_date' || sort.field === 'original_date') {
    return {
      'list.posted_at': sort.direction === 'asc' ? 1 : -1,
      'list.effective_threat_score': -1,
      'list.reviewed_at': dateDesc,
      'list.engagement_score': engagementDesc,
      _id: idAsc,
    }
  }

  if (sort.field === 'alert_date' || sort.field === 'processed_date') {
    return {
      'list.reviewed_at': sort.direction === 'asc' ? 1 : -1,
      'list.effective_threat_score': -1,
      'list.posted_at': dateDesc,
      'list.engagement_score': engagementDesc,
      _id: idAsc,
    }
  }

  if (!sort.field || sort.field === 'threat_score') {
    if (sort.direction === 'asc') {
      return {
        'list.effective_threat_score': 1,
        'list.alert_hour_ist': dateDesc,
        'list.engagement_score': engagementDesc,
        'list.posted_at': dateDesc,
        'list.reviewed_at': dateDesc,
        _id: idAsc,
      }
    }
    return buildCasesDefaultListSortPipeline()
  }

  return buildCasesDefaultListSortPipeline()
}

export function buildCasesReportSortPipeline() {
  return {
    'list.effective_threat_score': -1,
    'list.engagement_score': engagementDesc,
    'list.reviewed_at': dateDesc,
    'list.posted_at': dateDesc,
    _id: idAsc,
  }
}

export const UNIQUE_CLUSTER_LIST_SORT = buildCasesDefaultListSortPipeline()

export const UNIQUE_CLUSTER_EARLY_SORT = {
  'list.effective_threat_score': -1,
  'list.engagement_score': engagementDesc,
  'list.reviewed_at': dateDesc,
  _id: idAsc,
}

/** @deprecated Use buildCasesListSortPipeline */
export function buildCasesSortPipeline(sort = {}) {
  return buildCasesListSortPipeline(sort)
}

export function riskRankFromString(value) {
  if (!value) return RISK_RANK.UNKNOWN
  return STRING_RISK_RANK[String(value).toLowerCase()] ?? RISK_RANK.UNKNOWN
}

/** @deprecated v3 stores list.risk_rank; numeric mapping available via riskRankFromString. */
export function buildRiskRankAddFields() {
  return {}
}

/** @deprecated v3 stores list.engagement_score. */
export function buildEngagementScoreAddFields() {
  return {}
}
