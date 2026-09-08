export const ENTITY_TYPES = ['post', 'ad', 'domain']

export const ENTITY_LABELS = {
  post: 'Posts',
  ad: 'Ads',
  domain: 'Domains',
}

export const ENTITY_SHORT = {
  post: 'P',
  ad: 'A',
  domain: 'D',
}

export const ENTITY_COLORS = {
  post: '#3b82f6',
  ad: '#8b5cf6',
  domain: '#0f766e',
}

export const ENTITY_COLLECTIONS = {
  post: 'Posts',
  ad: 'Ads',
  domain: 'Domains',
}

export const METRIC_TIMEZONE = 'Asia/Kolkata'

export function toDateStr(value, timeZone = METRIC_TIMEZONE) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function todayDateStr(timeZone = METRIC_TIMEZONE) {
  return toDateStr(new Date(), timeZone)
}

export function shiftDateStr(dateStr, days) {
  const [year, month, day] = String(dateStr || '').split('-').map(Number)
  if (!year || !month || !day) return dateStr
  return new Date(Date.UTC(year, month - 1, day + Number(days || 0))).toISOString().slice(0, 10)
}

export function riskRankFromScore(score) {
  if (score == null || Number.isNaN(Number(score))) return null
  const n = Number(score)
  if (n > 95) return 'high'
  if (n > 75) return 'medium'
  if (n > 40) return 'low'
  return 'safe'
}

export function normalizeDimValue(value) {
  if (value == null) return null
  const s = String(value).trim()
  if (!s) return null
  return s.toLowerCase().replace(/\s+/g, '_')
}

export function clientActionKey(status) {
  if (!status) return null
  const s = String(status).toLowerCase().replace(/_/g, ' ').trim()
  if (s.includes('no action') || s.includes('no-action') || s === 'pass') return 'no-action'
  if (s.includes('flag for takedown') || s === 'flag for takedown') return 'Flag for Takedown'
  if (s === 'takedown' || s === 'do takedown' || s === 'takedown action' || s === 'do_takedown') return 'Takedown'
  return null
}

export function isOpenClientStatus(status) {
  if (!status) return true
  const ui = String(status).toLowerCase()
  return ui === 'to be reviewed' || ui === 'open' || ui === 'alerted'
}

export function platformForEntity(entityType, doc = {}) {
  if (entityType === 'domain') return 'web'
  const raw = doc.platform || (entityType === 'ad' ? 'meta' : 'unknown')
  return String(raw).toLowerCase() || 'unknown'
}

/** Ingest/first-seen day. Do not use for analytics metrics — those are review-dated. */
export function discoveryDateStr(entityType, doc = {}) {
  if (entityType === 'domain') {
    return toDateStr(
      doc.list?.first_seen_at
      || doc.discovery?.occurrences?.[0]?.seen_at
      || doc.list?.last_seen_at
      || doc.list?.reviewed_at
    )
  }
  return toDateStr(
    doc.list?.sourced_at
    || doc.list?.posted_at
    || doc.list?.start_date
    || doc.list?.reviewed_at
  )
}

export function reviewDateStr(doc = {}) {
  return toDateStr(doc.list?.reviewed_at || doc.review_details?.reviewed_at)
}

function inferAdChannel(doc) {
  const stored = doc.channel
  if (stored === 'ingestion' || stored === 'library' || stored === 'feed') return stored
  if (stored === 'ads_library') return 'library'
  if (doc.submitted_url) return 'ingestion'
  const ingestionType = String(doc.ingestion?.type || '')
  if (
    ingestionType === 'facebook_share_post'
    || ingestionType === 'client_request'
    || ingestionType === 'client_requested_link'
  ) {
    return 'ingestion'
  }
  const url = String(doc.original_url || doc.ingestion?.source_url || '')
  if (/\/ads\/library/i.test(url)) return 'library'
  return 'feed'
}

export function cloakBucket(doc = {}) {
  const probe = doc.analysis_results?.cloak_probe
  const variants = Array.isArray(probe?.variants) ? probe.variants : []
  if (probe?.unlocked === true || doc.discovery?.cloak_unlocked || doc.isCloaked) return 'unlocked'
  if (variants.some((v) => v?.label !== 'bare' && v?.differs_from_bare)) return 'unlocked'
  if (probe || variants.length) return 'none'
  return 'unknown'
}

export function whoisAgeBucket(doc = {}) {
  const created = doc.analysis_results?.whois?.created_at
  const analyzed = doc.list?.last_analyzed_at || doc.list?.first_seen_at
  if (!created) return 'unknown'
  const createdAt = new Date(created)
  const analyzedAt = analyzed ? new Date(analyzed) : new Date()
  if (Number.isNaN(createdAt.getTime()) || Number.isNaN(analyzedAt.getTime())) return 'unknown'
  const days = Math.max(0, Math.round((analyzedAt.getTime() - createdAt.getTime()) / 86400000))
  if (days <= 7) return '0-7d'
  if (days <= 30) return '8-30d'
  if (days <= 90) return '31-90d'
  return '90d+'
}

function boolBucket(value) {
  return value ? 'true' : 'false'
}

function overlayReview(doc, reviewDetails) {
  if (!reviewDetails) return doc
  return {
    ...doc,
    review_details: { ...(doc.review_details || {}), ...reviewDetails },
    list: {
      ...(doc.list || {}),
      threat_types: reviewDetails.threat_types || doc.list?.threat_types,
      effective_threat_score: reviewDetails.threat_score ?? doc.list?.effective_threat_score,
      risk_rank: riskRankFromScore(reviewDetails.threat_score ?? doc.list?.effective_threat_score)
        || doc.list?.risk_rank,
      poi_detected: doc.list?.poi_detected || (reviewDetails.poi_names || []).length > 0,
    },
  }
}

/** Map of dim -> list of string values for one document. */
export function extractDimValues(entityType, doc = {}) {
  const values = {}
  const push = (dim, value) => {
    const normalized = normalizeDimValue(value)
    if (!normalized) return
    if (!values[dim]) values[dim] = []
    if (!values[dim].includes(normalized)) values[dim].push(normalized)
  }

  const score = doc.list?.effective_threat_score ?? doc.review_details?.threat_score ?? doc.list?.review_threat_score
  const risk = doc.list?.risk_rank || riskRankFromScore(score)
  if (risk) push('risk_rank', risk)

  const threatTypes = doc.list?.threat_types || doc.review_details?.threat_types || []
  if (Array.isArray(threatTypes)) {
    threatTypes.filter((t) => typeof t === 'string').forEach((t) => push('threat_type', t))
  }

  const legalCodes = doc.review_details?.legal_codes
    || doc.list?.legal_codes
    || doc.analysis_results?.legal_codes
    || []
  if (Array.isArray(legalCodes)) {
    legalCodes.forEach((item) => {
      const raw = typeof item === 'string' ? item : (item?.code || item?.name)
      if (raw) push('legal_code', raw)
    })
  }

  const action = clientActionKey(doc.workflow?.client_status || doc.client_status)
  if (action) push('client_status', action)

  if (entityType === 'post') {
    push('platform', platformForEntity('post', doc))
    push('post_type', doc.content?.post_type || doc.list?.post_type || 'post')
    push('language', doc.content?.language || doc.list?.language)
    push('poi_detected', boolBucket(Boolean(doc.list?.poi_detected || (doc.review_details?.poi_names || []).length)))
    push('is_aigc', boolBucket(Boolean(doc.review_details?.is_aigc || doc.analysis_results?.is_aigc)))
  }

  if (entityType === 'ad') {
    push('display_format', doc.list?.display_format || doc.content?.display_format)
    push('channel', inferAdChannel(doc))
    push('is_active', boolBucket(doc.list?.is_active !== false && doc.ad_delivery?.is_active !== false))
    push('cta_type', doc.content?.cta_type)
    const publishers = doc.list?.publisher_platforms || doc.ad_delivery?.publisher_platforms || []
    if (Array.isArray(publishers)) {
      publishers.forEach((p) => push('publisher_platform', p))
    }
  }

  if (entityType === 'domain') {
    push('category', doc.list?.category || doc.review_details?.category)
    push('hosting_country', doc.list?.hosting_country)
    push('hosting_provider', doc.list?.hosting_provider)
    push('registrar', doc.list?.registrar)
    push('visibility_status', doc.workflow?.visibility_status || 'unknown')
    if (doc.list?.ssl_valid != null) push('ssl_valid', boolBucket(doc.list.ssl_valid))
    if (doc.list?.is_reachable != null) push('is_reachable', boolBucket(doc.list.is_reachable))
    push('cloak', cloakBucket(doc))
    push('discovery_source', doc.discovery?.first_entity_type || 'unknown')
    push('whois_age_bucket', whoisAgeBucket(doc))
  }

  return values
}

export function dimDeltasFromMaps(currentValues, previousValues = null) {
  const deltas = []
  const bump = (dim, value, delta) => {
    const existing = deltas.find((d) => d.dim === dim && d.value === value)
    if (existing) existing.delta += delta
    else deltas.push({ dim, value, delta })
  }

  Object.entries(currentValues || {}).forEach(([dim, vals]) => {
    vals.forEach((value) => bump(dim, value, 1))
  })
  Object.entries(previousValues || {}).forEach(([dim, vals]) => {
    vals.forEach((value) => bump(dim, value, -1))
  })

  return deltas.filter((d) => d.delta !== 0)
}

export function dimDeltasFromReview(entityType, doc, reviewDetails, previousReviewDetails = null) {
  const current = extractDimValues(entityType, overlayReview(doc, reviewDetails))
  const previous = previousReviewDetails
    ? extractDimValues(entityType, overlayReview(doc, previousReviewDetails))
    : null
  return dimDeltasFromMaps(current, previous)
}

export function caseReviewMetricArgs(entityType, doc, reviewDetails, previousReviewDetails = null) {
  const reviewDate = reviewDateStr(overlayReview(doc, reviewDetails))
  return {
    reviewData: {
      threat_score: reviewDetails?.threat_score,
      threat_types: reviewDetails?.threat_types,
      is_aigc: Boolean(reviewDetails?.is_aigc),
      platform: platformForEntity(entityType, doc),
    },
    previousReviewData: previousReviewDetails
      ? {
          threat_score: previousReviewDetails.threat_score,
          threat_types: previousReviewDetails.threat_types,
          is_aigc: Boolean(previousReviewDetails.is_aigc),
          platform: platformForEntity(entityType, doc),
        }
      : null,
    options: {
      entityType,
      reviewDate,
      sourcedDate: reviewDate,
      dims: dimDeltasFromReview(entityType, doc, reviewDetails, previousReviewDetails),
    },
  }
}
