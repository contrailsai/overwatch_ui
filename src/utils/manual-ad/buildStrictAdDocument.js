import { inferAdChannelFromUrl } from '@/lib/ads/ad-display'

function parseDate(dateVal) {
  if (dateVal == null || dateVal === '') return null
  if (typeof dateVal === 'string' || typeof dateVal === 'number') {
    const d = new Date(dateVal)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (dateVal instanceof Date) {
    return Number.isNaN(dateVal.getTime()) ? null : dateVal
  }
  return null
}

export function normalizeAdPlatform(raw) {
  const s = String(raw || '').toLowerCase().trim()
  if (!s || s === 'facebook' || s === 'fb' || s === 'instagram') return 'meta'
  return s
}

/**
 * Maps simplified manual-ingest input to the Ads v3 collection shape.
 * @param {Record<string, unknown>} data
 * @param {boolean} s3Stored
 */
export function buildStrictAdDocument(data, s3Stored) {
  const nowUtc = new Date()
  const platform = normalizeAdPlatform(data.platform)
  const platformAdId = String(data.id ?? data.platform_ad_id ?? '').trim()
  const originalUrl = String(data.url ?? data.original_url ?? '').trim()
  const title = String(data.title ?? '').trim() || null
  const body = String(data.body ?? data.content ?? '').trim() || null
  const caption = String(data.caption ?? '').trim() || null
  const ctaText = String(data.ctaText ?? data.cta_text ?? '').trim() || null
  const ctaType = String(data.ctaType ?? data.cta_type ?? '').trim() || null
  const linkUrl = String(data.linkUrl ?? data.link_url ?? '').trim() || null
  const linkDescription = String(data.linkDescription ?? data.link_description ?? '').trim() || null
  const displayFormatRaw = String(data.displayFormat ?? data.display_format ?? '').trim()
  const startDate = parseDate(data.startDate ?? data.start_date ?? data.taken_at) ?? nowUtc
  const isActive = data.isActive !== false && data.is_active !== false

  const mediaInput = Array.isArray(data.media) ? data.media : []
  const media = mediaInput.map((item, index) => ({
    original_url: item.original_url || item.s3_url || null,
    s3_url: item.s3_url ?? null,
    type: item.type || 'image',
    role: item.role || 'card_image',
    card_index: item.card_index ?? index,
    uploaded_manually: true,
  }))

  const inferredFormat =
    displayFormatRaw ||
    (media.length > 1 ? 'CAROUSEL' : media.length === 1 ? 'IMAGE' : 'IMAGE')
  const displayFormat = String(inferredFormat).toUpperCase()

  const cards = media.length
    ? media.map((item, index) => ({
        title,
        body: body || '',
        caption,
        cta_text: ctaText,
        cta_type: ctaType,
        link_url: linkUrl,
        link_description: linkDescription,
        media: [
          {
            original_url: item.original_url,
            s3_url: item.s3_url,
            type: item.type || 'image',
            role: item.role || 'card_image',
          },
        ],
        card_index: index,
      }))
    : []

  const pageName = String(data.pageName ?? data.page_name ?? '').trim() || 'unknown'
  const platformPageId = String(data.platformPageId ?? data.platform_page_id ?? '').trim() || null
  const profileUrl = String(data.profileUrl ?? data.profile_url ?? '').trim() || null

  return {
    schema_version: 3,
    platform,
    source: 'manual_upload',
    platform_ad_id: platformAdId,
    original_url: originalUrl,
    channel: inferAdChannelFromUrl(originalUrl),
    ad_profile_id: null,
    workflow: {
      ai_status: 'pending',
      review_status: 'pending',
      client_status: 'open',
      visibility_status: 'available',
      takedown_status: 'none',
      alerted_at: null,
    },
    list: {
      ai_threat_score: null,
      review_threat_score: null,
      effective_threat_score: null,
      risk_rank: null,
      threat_types: [],
      violation_flags: [],
      posted_at: startDate,
      sourced_at: nowUtc,
      reviewed_at: null,
      alert_hour_ist: null,
      poi_detected: false,
      start_date: startDate,
      end_date: null,
      is_active: isActive,
      display_format: displayFormat,
      publisher_platforms: ['FACEBOOK'],
      impressions_text: null,
      impressions_index: null,
      card_count: cards.length,
    },
    content: {
      title,
      body,
      caption,
      cta_text: ctaText,
      cta_type: ctaType,
      display_format: displayFormat,
      link_url: linkUrl,
      link_description: linkDescription,
      language: null,
      cards,
      media,
    },
    advertiser_snapshot: {
      platform_page_id: platformPageId,
      page_name: pageName,
      profile_url: profileUrl,
      profile_pic: null,
      profile_pic_s3: null,
      page_is_deleted: false,
      page_categories: [],
      page_like_count: 0,
    },
    ad_delivery: {
      is_active: isActive,
      start_date: startDate,
      end_date: null,
      publisher_platforms: ['FACEBOOK'],
      impressions_text: null,
      impressions_index: null,
      spend: null,
      currency: '',
      reach_estimate: null,
      targeted_or_reached_countries: [],
      total_active_time: null,
      collation_id: null,
      collation_count: null,
      categories: [],
      gated_type: null,
      contains_digital_created_media: false,
      contains_sensitive_content: false,
      regional_regulation_data: null,
    },
    analysis_results: {},
    review_details: {},
    ingestion: {
      type: 'manual_upload',
      source_url: originalUrl || null,
      ingested_at: nowUtc,
    },
    system: {
      created_at: nowUtc,
      updated_at: nowUtc,
      s3_stored: Boolean(s3Stored),
    },
    content_reviewed_by: null,
  }
}
