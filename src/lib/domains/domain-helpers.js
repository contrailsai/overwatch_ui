/**
 * Domains document helpers for review UI (schema v1).
 * See docs/contracts/domains-schema-v1.md for the full contract.
 */

import { ObjectId } from 'mongodb'
import { caseEventsCollection } from '@/utils/mongodb/collections'
import {
  serializeForClient,
  toIsoDate,
  insertCaseEvent,
  mapV3ClientStatusToUi,
} from '@/utils/mongodb/v3-schema'
import { RISK_THRESHOLDS } from '@/app/(dashboard)/cases/riskBuckets'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { uniqueCloakVariants } from '@/lib/domains/domain-display'

export { insertCaseEvent }

/** Projection for reviewer/client domain lists — keep one screenshot, drop heavy analysis blobs. */
export const DOMAIN_LIST_PROJECTION = {
  domain_name: 1,
  schema_version: 1,
  workflow: 1,
  list: 1,
  review_details: 1,
  content_reviewed_by: 1,
  discovery: 1,
  'analysis_results.screenshot': 1,
  system: 1,
  ingestion: 1,
}

/**
 * Detail fetch: only fields the domain UI reads.
 * Drops page_text / raw / capture / top-level media and unused whois/ssl/cloak blobs.
 * Matches DomainAnalysisResults + DomainCloakVariants + review form defaults.
 */
export const DOMAIN_DETAIL_PROJECTION = {
  domain_name: 1,
  schema_version: 1,
  workflow: 1,
  list: 1,
  review_details: 1,
  analysis_correction_request: 1,
  takedown: 1,
  client_notes: 1,
  content_reviewed_by: 1,
  discovery: 1,
  system: 1,
  ingestion: 1,

  'analysis_results.whois.registrar': 1,
  'analysis_results.whois.created_at': 1,
  'analysis_results.whois.age_days_at_analysis': 1,
  'analysis_results.whois.privacy_protected': 1,
  'analysis_results.whois.registrant_country': 1,

  'analysis_results.dns.a': 1,
  'analysis_results.dns.mx': 1,
  'analysis_results.dns.ns': 1,
  'analysis_results.dns.nameservers': 1,

  'analysis_results.ssl.issuer': 1,
  'analysis_results.ssl.is_valid': 1,

  'analysis_results.hosting.provider': 1,
  'analysis_results.hosting.country': 1,
  'analysis_results.hosting.is_cdn': 1,

  'analysis_results.reputation.notes': 1,

  'analysis_results.content_classification.title': 1,
  'analysis_results.content_classification.summary': 1,
  'analysis_results.content_classification.excerpt': 1,
  'analysis_results.content_classification.category': 1,
  'analysis_results.content_classification.labels': 1,
  'analysis_results.content_classification.spoofed_brands': 1,
  'analysis_results.content_classification.poi_names': 1,

  'analysis_results.tech_stack': 1,
  'analysis_results.redirect_chain.url': 1,
  'analysis_results.redirect_chain.status_code': 1,

  'analysis_results.screenshot.s3_url': 1,
  'analysis_results.screenshot.url': 1,

  'analysis_results.cloak_probe.unlocked': 1,
  'analysis_results.cloak_probe.variants.label': 1,
  'analysis_results.cloak_probe.variants.param': 1,
  'analysis_results.cloak_probe.variants.kind': 1,
  'analysis_results.cloak_probe.variants.url': 1,
  'analysis_results.cloak_probe.variants.title': 1,
  'analysis_results.cloak_probe.variants.excerpt': 1,
  'analysis_results.cloak_probe.variants.differs_from_bare': 1,
  'analysis_results.cloak_probe.variants.screenshot.s3_url': 1,
  'analysis_results.cloak_probe.variants.screenshot.url': 1,
  'analysis_results.cloak_probe.variants.media.images.s3_url': 1,
  'analysis_results.cloak_probe.variants.media.images.alt': 1,
  'analysis_results.cloak_probe.variants.media.videos.s3_url': 1,
  'analysis_results.cloak_probe.variants.media.videos.poster': 1,
  'analysis_results.cloak_probe.variants.media.videos.thumbnail': 1,
}

export function riskRankFromScore(score) {
  if (score == null || Number.isNaN(Number(score))) return null
  const n = Number(score)
  if (n > RISK_THRESHOLDS.HIGH) return 'high'
  if (n > RISK_THRESHOLDS.MEDIUM) return 'medium'
  if (n > RISK_THRESHOLDS.LOW) return 'low'
  return 'safe'
}

export async function fetchDomainUpdateHistory(db, domainId) {
  const events = await caseEventsCollection(db)
    .find({
      entity_type: 'domain',
      entity_id: new ObjectId(domainId),
    })
    .sort({ occurred_at: -1 })
    .toArray()

  return events.map((event) => ({
    updated_at: toIsoDate(event.occurred_at),
    updated_by: event.actor || event.payload?.updated_by || null,
    changes_summary: event.summary || event.event_type || '',
    event_type: event.event_type,
    payload: serializeForClient(event.payload) ?? null,
  }))
}

async function resolveScreenshotUrl(screenshot, signedByUrl = null) {
  const raw = screenshot?.s3_url || screenshot?.url || null
  if (!raw) return null
  if (raw.startsWith('/')) return raw
  if (/amazonaws\.com/i.test(raw)) {
    if (signedByUrl?.has(raw)) return signedByUrl.get(raw) || raw
    return (await getSignedImageUrl(raw)) || raw
  }
  return raw
}

async function signUniqueS3Urls(urls = []) {
  const unique = [...new Set(urls.filter(Boolean))]
  const amazonUrls = unique.filter((url) => /amazonaws\.com/i.test(url) && !url.startsWith('/'))
  const entries = await Promise.all(
    amazonUrls.map(async (url) => [url, await getSignedImageUrl(url)]),
  )
  return new Map(entries)
}

function collectMediaS3Urls(media = {}) {
  const urls = []
  for (const img of media.images || []) {
    if (img?.s3_url) urls.push(img.s3_url)
  }
  for (const vid of media.videos || []) {
    if (vid?.s3_url) urls.push(vid.s3_url)
  }
  return urls
}

function applySignedMedia(media = {}, signedByUrl) {
  const images = (media.images || []).map((img) => ({
    ...serializeForClient(img),
    signedUrl: img?.s3_url ? signedByUrl.get(img.s3_url) || null : null,
  }))
  const videos = (media.videos || []).map((vid) => ({
    ...serializeForClient(vid),
    signedUrl: vid?.s3_url ? signedByUrl.get(vid.s3_url) || null : null,
  }))
  return {
    images,
    videos,
    skipped: serializeForClient(media.skipped) ?? [],
  }
}

function collectCloakProbeUrls(cloakProbe) {
  if (!cloakProbe || typeof cloakProbe !== 'object') return []
  const urls = []
  for (const v of cloakProbe.variants || []) {
    const shot = v?.screenshot?.s3_url || v?.screenshot?.url
    if (shot) urls.push(shot)
    urls.push(...collectMediaS3Urls(v?.media || {}))
  }
  return urls
}

function enrichCloakProbeWithSignedUrls(cloakProbe, signedByUrl) {
  if (!cloakProbe || typeof cloakProbe !== 'object') return null
  const variants = (cloakProbe.variants || []).map((v) => {
    const rawShot = v?.screenshot?.s3_url || v?.screenshot?.url || null
    const signedScreenshotUrl = rawShot
      ? (rawShot.startsWith('/') ? rawShot : (signedByUrl.get(rawShot) || rawShot))
      : null
    return {
      ...serializeForClient(v),
      signedScreenshotUrl,
      media: applySignedMedia(v?.media || {}, signedByUrl),
    }
  })
  return {
    ...serializeForClient(cloakProbe),
    variants,
    creatives: [],
  }
}

function buildDomainAliases(domain, discovery, occurrences) {
  return {
    first_seen_at: toIsoDate(domain?.list?.first_seen_at ?? domain?.system?.created_at),
    last_seen_at: toIsoDate(domain?.list?.last_seen_at),
    last_analyzed_at: toIsoDate(domain?.list?.last_analyzed_at),
    reviewed_at: toIsoDate(domain?.list?.reviewed_at ?? domain?.review_details?.reviewed_at),
    category: domain?.list?.category ?? domain?.review_details?.category ?? null,
    occurrence_count: domain?.list?.occurrence_count ?? occurrences.length,
    score: domain?.list?.effective_threat_score ?? domain?.review_details?.threat_score ?? null,
    risk_rank: domain?.list?.risk_rank ?? null,
    analysis_status: domain?.workflow?.analysis_status ?? 'pending',
  }
}

async function normalizeDomainListItem(domain) {
  const discovery = domain.discovery || {}
  const occurrences = Array.isArray(discovery.occurrences) ? discovery.occurrences : []
  const screenshotUrl = await resolveScreenshotUrl(domain.analysis_results?.screenshot)

  return {
    _id: domain._id.toString(),
    schema_version: domain.schema_version ?? 1,
    domain_name: domain.domain_name || null,
    discovery: {
      first_entity_type: discovery.first_entity_type || null,
      first_entity_id: discovery.first_entity_id ? discovery.first_entity_id.toString() : null,
      first_seen_url: discovery.first_seen_url || null,
      cloak_unlocked: discovery.cloak_unlocked ?? false,
      unlocked_params: discovery.unlocked_params || [],
      variant_urls: (discovery.variant_urls || []).map((v) => ({
        url: v?.url || null,
        param: v?.param || null,
        kind: v?.kind || null,
        label: v?.label || null,
      })),
      occurrences: occurrences.map((o) => ({
        entity_type: o?.entity_type || null,
        entity_id: o?.entity_id ? o.entity_id.toString() : null,
        url: o?.url || null,
        seen_at: toIsoDate(o?.seen_at),
      })),
    },
    workflow: serializeForClient(domain.workflow) ?? null,
    list: serializeForClient(domain.list) ?? null,
    client_status: mapV3ClientStatusToUi(domain?.workflow?.client_status),
    analysis_results: domain.analysis_results?.screenshot
      ? { screenshot: serializeForClient(domain.analysis_results.screenshot) }
      : null,
    review_details: serializeForClient(domain.review_details) ?? null,
    analysis_correction_request: null,
    takedown: null,
    client_notes: [],
    ingestion: serializeForClient(domain.ingestion) ?? null,
    system: serializeForClient(domain.system) ?? null,
    content_reviewed_by: domain.content_reviewed_by || null,
    update_history: [],
    screenshotUrl,
    cloakVariants: [],
    cloakCreatives: [],
    uniqueLanderCount: 0,
    unlockedLanderCount: 0,
    isCloaked: Boolean(discovery.cloak_unlocked),
    ...buildDomainAliases(domain, discovery, occurrences),
  }
}

/**
 * @param {object} domain
 * @param {{ mode?: 'list' | 'full' }} [options]
 */
export async function normalizeDomainForUi(domain, options = {}) {
  if (!domain) return null

  // Legacy callers passed a Mongo db as the second arg — ignore it (history is on-demand).
  const mode = options && typeof options === 'object' && options.mode === 'list' ? 'list' : 'full'
  if (mode === 'list') {
    return normalizeDomainListItem(domain)
  }

  const discovery = domain.discovery || {}
  const occurrences = Array.isArray(discovery.occurrences) ? discovery.occurrences : []

  const primaryShot = domain.analysis_results?.screenshot?.s3_url
    || domain.analysis_results?.screenshot?.url
    || null
  const urlsToSign = [
    primaryShot,
    ...collectCloakProbeUrls(domain.analysis_results?.cloak_probe),
  ]
  const signedByUrl = await signUniqueS3Urls(urlsToSign)

  const screenshotUrl = await resolveScreenshotUrl(domain.analysis_results?.screenshot, signedByUrl)
  const cloakProbe = enrichCloakProbeWithSignedUrls(domain.analysis_results?.cloak_probe, signedByUrl)

  const uniqueVariants = uniqueCloakVariants(cloakProbe?.variants || [])
  if (cloakProbe) {
    cloakProbe.variants = uniqueVariants
  }

  const analysisResults = serializeForClient(domain.analysis_results) ?? {}
  if (cloakProbe) analysisResults.cloak_probe = cloakProbe
  // Drop modules the UI never renders (defense in depth if caller skipped projection).
  delete analysisResults.page_text
  delete analysisResults.raw
  delete analysisResults.capture
  delete analysisResults.media
  if (screenshotUrl && analysisResults.screenshot) {
    analysisResults.screenshot = {
      ...analysisResults.screenshot,
      signedUrl: screenshotUrl,
    }
  }

  const uniqueVariantUrls = uniqueVariants.length > 0
    ? uniqueVariants
      .filter((v) => v?.url)
      .map((v) => ({
        url: v.url || null,
        param: v.param || null,
        kind: v.kind || null,
        label: v.label || null,
      }))
    : (discovery.variant_urls || []).map((v) => ({
      url: v?.url || null,
      param: v?.param || null,
      kind: v?.kind || null,
      label: v?.label || null,
    }))

  const unlockedCount = uniqueVariants.filter((v) => v.label !== 'bare' && v.differs_from_bare).length

  return {
    _id: domain._id.toString(),
    schema_version: domain.schema_version ?? 1,
    domain_name: domain.domain_name || null,
    discovery: {
      first_entity_type: discovery.first_entity_type || null,
      first_entity_id: discovery.first_entity_id ? discovery.first_entity_id.toString() : null,
      first_seen_url: discovery.first_seen_url || null,
      cloak_unlocked: discovery.cloak_unlocked ?? false,
      unlocked_params: discovery.unlocked_params || [],
      variant_urls: uniqueVariantUrls,
      occurrences: occurrences.map((o) => ({
        entity_type: o?.entity_type || null,
        entity_id: o?.entity_id ? o.entity_id.toString() : null,
        url: o?.url || null,
        seen_at: toIsoDate(o?.seen_at),
      })),
    },
    workflow: serializeForClient(domain.workflow) ?? null,
    list: serializeForClient(domain.list) ?? null,
    client_status: mapV3ClientStatusToUi(domain?.workflow?.client_status),
    analysis_results: analysisResults,
    review_details: serializeForClient(domain.review_details) ?? null,
    analysis_correction_request: serializeForClient(domain.analysis_correction_request) ?? null,
    takedown: serializeForClient(domain.takedown) ?? null,
    client_notes: serializeForClient(domain.client_notes) ?? [],
    ingestion: serializeForClient(domain.ingestion) ?? null,
    system: serializeForClient(domain.system) ?? null,
    content_reviewed_by: domain.content_reviewed_by || null,
    update_history: [],
    screenshotUrl,
    cloakVariants: uniqueVariants,
    cloakCreatives: [],
    uniqueLanderCount: uniqueVariants.length,
    unlockedLanderCount: unlockedCount,
    isCloaked: unlockedCount > 0,
    ...buildDomainAliases(domain, discovery, occurrences),
  }
}
