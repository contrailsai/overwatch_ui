/** Client-safe domain display helpers. Keep Mongo/server imports out of this file. */

import { buildReviewFormDefaults } from '@/utils/analysis/correctionRequestUtils'

/** Bare + landers whose page differs from bare. Drops same-as-bare param noise. */
export function uniqueCloakVariants(variants = []) {
  if (!Array.isArray(variants)) return []
  return variants.filter((v) => {
    if (!v || !(v.url || v.label)) return false
    if (v.label === 'bare') return true
    return Boolean(v.differs_from_bare)
  })
}

export function domainHasCloaking(domain) {
  const variants = domain?.cloakVariants
    || domain?.analysis_results?.cloak_probe?.variants
    || []
  return uniqueCloakVariants(variants).some((v) => v.label !== 'bare' && v.differs_from_bare)
}

/** Unlocked scam lander URL (with params), or null if none. */
export function domainUnlockedScamUrl(domain) {
  const probe = domain?.analysis_results?.cloak_probe
  const bestUnlocked = uniqueCloakVariants(probe?.variants || []).find(
    (v) => v?.kind === 'scam' && v?.differs_from_bare && v?.url,
  )
  if (bestUnlocked?.url) return bestUnlocked.url

  const variantUrls = domain?.discovery?.variant_urls || []
  const unlockedVariant = variantUrls.find((v) => v?.kind === 'scam' && v?.url)
  return unlockedVariant?.url || null
}

export function domainVisitUrl(domain) {
  const unlocked = domainUnlockedScamUrl(domain)
  if (unlocked) return unlocked

  const seen = domain?.discovery?.first_seen_url
  if (typeof seen === 'string' && seen.trim()) return seen.trim()
  if (domain?.domain_name) return `https://${domain.domain_name}`
  return null
}

/**
 * Compact domain summary for ad destination cross-links (no S3 signing).
 * Includes enough review/analysis fields for the ads right-pane “linked domains” section.
 */
export function toDestinationDomainSummary(domain) {
  if (!domain?._id || !domain?.domain_name) return null
  const visitUrl = domainUnlockedScamUrl(domain)
  const cloakUnlocked = domainHasCloaking(domain)
    || Boolean(domain?.discovery?.cloak_unlocked)
    || Boolean(domain?.isCloaked)
  const review = domain?.review_details || {}
  const content = domain?.analysis_results?.content_classification || {}
  const list = domain?.list || {}
  const legalCodes = Array.isArray(review.legal_codes) ? review.legal_codes : []
  const threatTypes = Array.isArray(review.threat_types)
    ? review.threat_types
    : (Array.isArray(list.threat_types) ? list.threat_types : [])

  return {
    _id: String(domain._id),
    domain_name: domain.domain_name,
    risk: list.risk_rank || domain?.risk_rank || null,
    cloakUnlocked,
    hasScamLander: Boolean(visitUrl),
    visitUrl,
    unlockedParams: Array.isArray(domain?.discovery?.unlocked_params)
      ? domain.discovery.unlocked_params
      : [],
    category: content.category || list.category || review.category || null,
    pageTitle: content.title || null,
    pageSummary: content.summary || null,
    registrar: list.registrar || domain?.analysis_results?.whois?.registrar || null,
    hostingProvider: list.hosting_provider || domain?.analysis_results?.hosting?.provider || null,
    hostingCountry: list.hosting_country || domain?.analysis_results?.hosting?.country || null,
    reviewReasoning: review.reasoning || null,
    threatTypes: threatTypes.filter(Boolean).map(String),
    legalCodes: legalCodes.map((item) => (
      typeof item === 'string'
        ? { code: item, reasoning: '' }
        : { code: item?.code || '', reasoning: item?.reasoning || '' }
    )).filter((c) => c.code),
  }
}

export function domainScreenshotUrl(domain) {
  return domain?.screenshotUrl
    || domain?.analysis_results?.screenshot?.s3_url
    || domain?.analysis_results?.screenshot?.url
    || null
}

export function isDomainOnline(domain) {
  const status = String(domain?.workflow?.visibility_status || '').toLowerCase()
  if (!status) return true
  if (status === 'down' || status === 'parked') return false
  return status === 'up' || status === 'available' || status === 'online' || status === 'active'
}

/** Deep-link into client surfaces for a discovery occurrence, or null if unknown. */
export function hrefForDomainOccurrence(entityType, entityId) {
  if (!entityId) return null
  const type = String(entityType || '').toLowerCase()
  if (type === 'ad') return `/ads?ad_id=${entityId}`
  if (type === 'post') return `/cases/${entityId}`
  if (type === 'ad_profile') return `/ad-profiles`
  if (type === 'profile') return `/profiles`
  return null
}

const SCAM_HIGH_RISK_SCORE = 96
const SCAM_VIOLATION_CANDIDATES = ['fraud', 'FRAUD']
const SCAM_LEGAL_CODE_CANDIDATES = [
  'IT ACT 2000 - SECTION 66D',
  'BNS 2023 - Section 318(4)',
]

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function projectItemName(item) {
  if (typeof item === 'string') return item
  return item?.name || item?.code || ''
}

/** Resolve a desired label/code to the project's configured name (fuzzy). */
export function resolveProjectItemName(desired, projectItems = []) {
  const want = normalizeKey(desired)
  if (!want) return null
  const exact = projectItems.find((item) => normalizeKey(projectItemName(item)) === want)
  if (exact) return projectItemName(exact)
  const partial = projectItems.find((item) => {
    const got = normalizeKey(projectItemName(item))
    return got.includes(want) || want.includes(got)
  })
  return partial ? projectItemName(partial) : null
}

/** True when category or unlocked cloak lander signals scam (for review autofill only). */
export function isDomainScamCategory(domain) {
  const category = domain?.category
    || domain?.list?.category
    || domain?.analysis_results?.content_classification?.category
    || domain?.review_details?.category
  if (normalizeKey(category) === 'scam') return true

  const variants = domain?.cloakVariants
    || domain?.analysis_results?.cloak_probe?.variants
    || []
  if (uniqueCloakVariants(variants).some((v) => normalizeKey(v?.kind) === 'scam' && v?.differs_from_bare)) {
    return true
  }

  const variantUrls = domain?.discovery?.variant_urls || []
  return variantUrls.some((v) => normalizeKey(v?.kind) === 'scam' && v?.url)
}

/** Hide analyzer "scam" category/labels from content UI (use for review presets instead). */
export function isScamDisplayLabel(value) {
  return normalizeKey(value) === 'scam'
}

/**
 * Violation labels for list/detail UI.
 * Prefers reviewed / list threat types; if empty and domain is scam-tagged, assumes Fraud.
 */
export function collectDomainViolations(domain) {
  const fromReview = domain?.review_details?.threat_types || []
  const fromList = domain?.list?.threat_types || domain?.list?.violation_flags || []
  const flagObj = domain?.review_details?.flags
  const fromFlagObj = flagObj && !Array.isArray(flagObj) && typeof flagObj === 'object'
    ? Object.entries(flagObj).filter(([, v]) => v).map(([k]) => k)
    : []
  const reviewFlags = Array.isArray(fromReview) ? fromReview : fromFlagObj
  const listFlags = Array.isArray(fromList) ? fromList : []

  const labels = [...new Set([...reviewFlags, ...listFlags]
    .filter(Boolean)
    .map(String)
    .filter((v) => {
      const key = normalizeKey(v)
      return key && key !== 'safe'
    }))]

  if (labels.length > 0) return labels
  if (isDomainScamCategory(domain)) return ['Fraud']
  return []
}

/** High risk + Fraud + IT Act 66D + BNS 318(4), matched to project config names. */
export function applyDomainScamReviewPresets(defaults, projectDetails) {
  const projectLabels = projectDetails?.labels || []
  const projectLegalCodes = projectDetails?.legal_codes || []

  const threatTypes = new Set(defaults.threatTypes || [])
  for (const candidate of SCAM_VIOLATION_CANDIDATES) {
    const matched = resolveProjectItemName(candidate, projectLabels)
    if (matched) threatTypes.add(matched)
    else threatTypes.add(candidate)
  }

  const selectedLegalCodes = [...(defaults.selectedLegalCodes || [])]
  for (const candidate of SCAM_LEGAL_CODE_CANDIDATES) {
    const matched = resolveProjectItemName(candidate, projectLegalCodes) || candidate
    if (!selectedLegalCodes.some((c) => normalizeKey(c.code) === normalizeKey(matched))) {
      selectedLegalCodes.push({ code: matched, reasoning: '' })
    }
  }

  return {
    ...defaults,
    threatScore: SCAM_HIGH_RISK_SCORE,
    threatTypes: Array.from(threatTypes),
    selectedLegalCodes,
  }
}

export function buildDomainReviewFormDefaults(domain, projectDetails) {
  const content = domain?.analysis_results?.content_classification || {}
  const list = domain?.list || {}
  const review = domain?.review_details
  const hasReview = Boolean(
    review && Object.keys(review).length > 0 && (review.threat_score != null || review.reviewed_at),
  )

  const defaults = buildReviewFormDefaults({
    review_details: hasReview ? review : {},
    analysis_results: {
      threat_score: list.ai_threat_score ?? list.effective_threat_score,
      risk_score: list.ai_threat_score ?? list.effective_threat_score,
      threat_types: list.threat_types || content.labels,
      poi_names: content.poi_names,
      name_present: (content.poi_names || []).length > 0,
      reasoning: content.summary,
      simple_report_description: content.excerpt,
    },
  }, projectDetails)

  // Unreviewed scam domains: pre-select the standard scam verdict package.
  if (!hasReview && isDomainScamCategory(domain)) {
    return applyDomainScamReviewPresets(defaults, projectDetails)
  }

  return defaults
}
