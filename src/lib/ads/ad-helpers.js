/**
 * Ads document helpers for review UI (schema v3).
 */

import { ObjectId } from 'mongodb'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { caseEventsCollection } from '@/utils/mongodb/collections'
import {
  serializeForClient,
  toIsoDate,
  ONLINE_VISIBILITY_VALUES,
  insertCaseEvent,
  mapV3ClientStatusToUi,
} from '@/utils/mongodb/v3-schema'
import { RISK_THRESHOLDS } from '@/app/(dashboard)/cases/riskBuckets'

export { ONLINE_VISIBILITY_VALUES, insertCaseEvent }

export function riskRankFromScore(score) {
  if (score == null || Number.isNaN(Number(score))) return null
  const n = Number(score)
  if (n > RISK_THRESHOLDS.HIGH) return 'high'
  if (n > RISK_THRESHOLDS.MEDIUM) return 'medium'
  if (n > RISK_THRESHOLDS.LOW) return 'low'
  return 'safe'
}

export function getAdMedia(ad) {
  if (Array.isArray(ad?.content?.media) && ad.content.media.length > 0) {
    return ad.content.media
  }
  const fromCards = []
  for (const [idx, card] of (ad?.content?.cards || []).entries()) {
    for (const m of card?.media || []) {
      fromCards.push({ ...m, card_index: m.card_index ?? idx })
    }
  }
  return fromCards
}

export function getFirstAdMediaS3Url(ad) {
  const media = getAdMedia(ad)
  if (!media.length) return null
  return media[0]?.s3_url || null
}

async function signUniqueS3Urls(urls = []) {
  const unique = [...new Set(urls.filter(Boolean))]
  const entries = await Promise.all(
    unique.map(async (url) => [url, await getSignedImageUrl(url)]),
  )
  return new Map(entries)
}

function applySignedMedia(media = [], signedByUrl) {
  return media.map((m) => ({
    ...serializeForClient(m),
    signedUrl: m?.s3_url ? signedByUrl.get(m.s3_url) || null : null,
  }))
}

export async function fetchAdUpdateHistory(db, adId) {
  const events = await caseEventsCollection(db)
    .find({
      entity_type: 'ad',
      entity_id: new ObjectId(adId),
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

export function buildNormalizedAdProfileForUi(profile, { signedProfilePic = null } = {}) {
  const enrichment = profile?.enrichment || {}
  const profileRisk =
    profile?.list?.risk_rank ?? profile?.list?.risk ?? profile?.review_details?.risk ?? null
  const pageName =
    profile?.page_name || profile?.display_name || profile?.platform_page_id || 'Unknown advertiser'

  return {
    _id: profile._id.toString(),
    schema_version: profile.schema_version ?? 3,
    platform: profile?.platform ? String(profile.platform).toLowerCase() : 'meta',
    platform_page_id: profile?.platform_page_id || null,
    page_name: pageName,
    display_name: pageName,
    profile_url: profile?.profile_url || null,
    is_verified: profile?.is_verified ?? false,
    review_details: serializeForClient({
      ...(profile?.review_details || {}),
      risk: profileRisk,
    }),
    client_status: mapV3ClientStatusToUi(profile?.workflow?.client_status),
    client_notes: serializeForClient(profile?.client_notes) ?? [],
    last_relevant_publish_date: toIsoDate(profile?.list?.last_active_at),
    ads_count: profile?.list?.ad_count ?? 0,
    cases_count: profile?.list?.ad_count ?? 0,
    list: serializeForClient(profile?.list) ?? null,
    workflow: serializeForClient(profile?.workflow) ?? null,
    enrichment: serializeForClient(enrichment) ?? null,
    metadata: serializeForClient({
      display_name: pageName,
      username: profile?.platform_page_id || null,
      profile_url: profile?.profile_url || null,
      follower_count: profile?.list?.follower_count ?? enrichment.page_like_count ?? null,
      location: profile?.list?.location ?? null,
      s3_url: enrichment.profile_pic_s3 || null,
      profile_pic: signedProfilePic,
      biography: enrichment.biography ?? null,
      page_categories: enrichment.page_categories || [],
      page_like_count: enrichment.page_like_count ?? null,
      page_is_deleted: enrichment.page_is_deleted ?? false,
      category: Array.isArray(enrichment.page_categories)
        ? enrichment.page_categories.join(', ')
        : enrichment.page_categories || null,
      media_count: profile?.list?.ad_count ?? 0,
      full_name: pageName,
    }),
  }
}

export async function normalizeAdProfileForUi(profile) {
  if (!profile) return null

  let signedProfilePic = null
  const picS3 = profile?.enrichment?.profile_pic_s3
  if (picS3) {
    signedProfilePic = await getSignedImageUrl(picS3)
  }

  return buildNormalizedAdProfileForUi(profile, { signedProfilePic })
}

/** @param {object} ad @param {object} [_db] Unused; kept for call-site compat. History is loaded on demand. */
export async function normalizeAdForUi(ad, _db = null) {
  if (!ad) return null

  const media = getAdMedia(ad)
  const cardsRaw = ad.content?.cards || []
  const advertiser = ad.advertiser_snapshot || {}

  const urlsToSign = [
    ...media.map((m) => m?.s3_url),
    ...cardsRaw.flatMap((card) => (card?.media || []).map((m) => m?.s3_url)),
    advertiser.profile_pic_s3,
  ]
  const signedByUrl = await signUniqueS3Urls(urlsToSign)

  const signedMedia = applySignedMedia(media, signedByUrl)
  // Prefer an image thumb URL so list <img> never receives a video URL
  const firstImageSigned =
    signedMedia.find((m) => String(m?.type || '').toLowerCase() === 'image' && m.signedUrl)
      ?.signedUrl || null
  const firstSigned =
    firstImageSigned ||
    signedMedia.find((m) => {
      if (!m.signedUrl) return false
      const t = String(m?.type || '').toLowerCase()
      if (t === 'video') return false
      return !/\.(mp4|webm|mov)(\?|$)/i.test(String(m.s3_url || m.signedUrl || ''))
    })?.signedUrl ||
    null

  const cards = cardsRaw.map((card, cardIndex) => {
    const cardMedia = applySignedMedia(
      (card.media || []).map((m) => ({ ...m, card_index: m.card_index ?? cardIndex })),
      signedByUrl,
    )
    return {
      ...serializeForClient(card),
      media: cardMedia,
    }
  })

  const signedProfilePic = advertiser.profile_pic_s3
    ? signedByUrl.get(advertiser.profile_pic_s3) || null
    : null

  return {
    _id: ad._id.toString(),
    schema_version: ad.schema_version ?? 3,
    platform: ad.platform ? String(ad.platform).toLowerCase() : 'meta',
    source: ad.source || null,
    platform_ad_id: ad.platform_ad_id || null,
    original_url: ad.original_url || null,
    ad_profile_id: ad.ad_profile_id ? ad.ad_profile_id.toString() : null,
    workflow: serializeForClient(ad.workflow) ?? null,
    list: serializeForClient(ad.list) ?? null,
    content: {
      ...(serializeForClient(ad.content) || {}),
      cards,
      media: signedMedia,
    },
    advertiser_snapshot: {
      ...serializeForClient(advertiser),
      signed_profile_pic: signedProfilePic,
    },
    ad_delivery: serializeForClient(ad.ad_delivery) ?? null,
    analysis_results: serializeForClient(ad.analysis_results) ?? null,
    review_details: serializeForClient(ad.review_details) ?? null,
    analysis_correction_request: serializeForClient(ad.analysis_correction_request) ?? null,
    ingestion: serializeForClient(ad.ingestion) ?? null,
    system: serializeForClient(ad.system) ?? null,
    content_reviewed_by: ad.content_reviewed_by || null,
    signedImageUrl: firstSigned,
    update_history: [],
    // convenience aliases for list UI
    sourcing_date: toIsoDate(ad?.list?.sourced_at ?? ad?.ingestion?.ingested_at),
    reviewed_at: toIsoDate(ad?.list?.reviewed_at ?? ad?.workflow?.reviewed_at ?? ad?.review_details?.reviewed_at),
    posted_date: toIsoDate(ad?.list?.posted_at ?? ad?.list?.start_date),
    start_date: toIsoDate(ad?.list?.start_date ?? ad?.ad_delivery?.start_date),
    end_date: toIsoDate(ad?.list?.end_date ?? ad?.ad_delivery?.end_date),
    page_name: advertiser.page_name || null,
    title: ad?.content?.title || null,
    caption: ad?.content?.caption || null,
    score: ad?.list?.effective_threat_score ?? ad?.review_details?.threat_score ?? null,
    visibility_status: ad?.workflow?.visibility_status ?? 'available',
    client_status: mapV3ClientStatusToUi(ad?.workflow?.client_status),
    client_notes: serializeForClient(ad?.client_notes) ?? [],
  }
}
