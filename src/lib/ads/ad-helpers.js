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

async function signMediaList(media = []) {
  return Promise.all(
    media.map(async (m) => {
      const signed = m?.s3_url ? await getSignedImageUrl(m.s3_url) : null
      return {
        ...serializeForClient(m),
        signedUrl: signed,
      }
    }),
  )
}

async function fetchAdCaseEvents(db, adId) {
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

export async function normalizeAdForUi(ad, db = null) {
  if (!ad) return null

  const media = getAdMedia(ad)
  const signedMedia = await signMediaList(media)
  const firstSigned = signedMedia.find((m) => m.signedUrl)?.signedUrl || null

  const cards = await Promise.all(
    (ad.content?.cards || []).map(async (card, cardIndex) => {
      const cardMedia = await signMediaList(
        (card.media || []).map((m) => ({ ...m, card_index: m.card_index ?? cardIndex })),
      )
      return {
        ...serializeForClient(card),
        media: cardMedia,
      }
    }),
  )

  let updateHistory = []
  if (db && ad._id) {
    try {
      updateHistory = await fetchAdCaseEvents(db, ad._id.toString())
    } catch {
      updateHistory = []
    }
  }

  const advertiser = ad.advertiser_snapshot || {}
  let signedProfilePic = null
  if (advertiser.profile_pic_s3) {
    signedProfilePic = await getSignedImageUrl(advertiser.profile_pic_s3)
  }

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
    update_history: updateHistory,
    // convenience aliases for list UI
    sourcing_date: toIsoDate(ad?.list?.sourced_at ?? ad?.ingestion?.ingested_at),
    posted_date: toIsoDate(ad?.list?.posted_at ?? ad?.list?.start_date),
    start_date: toIsoDate(ad?.list?.start_date ?? ad?.ad_delivery?.start_date),
    end_date: toIsoDate(ad?.list?.end_date ?? ad?.ad_delivery?.end_date),
    page_name: advertiser.page_name || null,
    title: ad?.content?.title || null,
    caption: ad?.content?.caption || null,
    score: ad?.list?.effective_threat_score ?? ad?.review_details?.threat_score ?? null,
    visibility_status: ad?.workflow?.visibility_status ?? 'available',
  }
}
