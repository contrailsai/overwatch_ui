/**
 * Transform Posts v3 documents → Ads v3 single-creative documents.
 * Preserves all post data in source_payload and keeps the same _id when migrating.
 */

const { ObjectId } = require('mongodb')

function inferAdChannelFromUrl(originalUrl) {
  const url = String(originalUrl || '')
  if (/\/ads\/library/i.test(url)) return 'library'
  if (/\/share\/|\/posts\/|\/reels\/|permalink\.php|story_fbid|fbid|facebook\.com\/\d+\/posts\//i.test(url)) {
    return 'feed'
  }
  return 'feed'
}

function toDate(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'object' && value.$date != null) return toDate(value.$date)
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'string') {
    const d = new Date(value.trim())
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

function normalizeAdPlatform(raw) {
  const s = String(raw || '').toLowerCase().trim()
  if (!s || s === 'facebook' || s === 'fb' || s === 'instagram') return 'meta'
  return s
}

function extractAdArchiveId(post) {
  const url = String(post.original_url || post.ingestion?.source_url || '')
  const match = url.match(/ads\/library\/\?id=(\d+)/i)
  if (match) return match[1]
  return String(post.platform_post_id || post.platform_ad_id || '').trim()
}

function extractPageIdFromUrl(profileUrl) {
  if (!profileUrl) return null
  const url = String(profileUrl)
  const peopleMatch = url.match(/\/people\/[^/]+\/(\d+)/i)
  if (peopleMatch) return peopleMatch[1]
  const pageMatch = url.match(/facebook\.com\/(?:profile\.php\?id=)?(\d{8,})/i)
  if (pageMatch) return pageMatch[1]
  const trailingMatch = url.match(/facebook\.com\/(\d{8,})\/?(?:\?|$)/i)
  if (trailingMatch) return trailingMatch[1]
  return null
}

function resolvePageId(author = {}) {
  return (
    author.platform_user_id ||
    extractPageIdFromUrl(author.profile_url) ||
    null
  )
}

function inferMediaType(item, postType) {
  const raw = String(item?.type || '').toLowerCase()
  if (raw === 'video') return 'video'
  const url = String(item?.original_url || item?.s3_url || '')
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video'
  if (postType === 'video' && raw !== 'video') return 'image'
  return raw === 'image' || url ? 'image' : 'image'
}

function inferMediaRole(item, type, postType, index) {
  if (item?.role) return item.role
  if (type === 'video') return 'primary_video'
  if (postType === 'video') return 'thumbnail'
  return index === 0 ? 'card_image' : 'card_image'
}

function transformPostMediaToAdMedia(post) {
  const postType = String(post.content?.post_type || '').toLowerCase()
  const items = Array.isArray(post.content?.media) ? post.content.media : []

  return items.map((item, index) => {
    const type = inferMediaType(item, postType)
    const role = inferMediaRole(item, type, postType, index)
    return {
      original_url: item.original_url || null,
      s3_url: item.s3_url || null,
      ...(item.s3_key ? { s3_key: item.s3_key } : {}),
      ...(item.thumbnail_url ? { thumbnail_url: item.thumbnail_url } : {}),
      ...(item.thumbnail_s3_url ? { thumbnail_s3_url: item.thumbnail_s3_url } : {}),
      type,
      role,
      card_index: 0,
      ...(item.uploaded_manually ? { uploaded_manually: true } : {}),
    }
  })
}

function inferDisplayFormat(post, media) {
  const postType = String(post.content?.post_type || '').toLowerCase()
  if (postType === 'video' || media.some((m) => m.type === 'video')) return 'VIDEO'
  if (media.length > 1) return 'CAROUSEL'
  return 'IMAGE'
}

function firstLine(text) {
  if (!text) return null
  const line = String(text).split(/\r?\n/).map((l) => l.trim()).find(Boolean)
  return line || null
}

function extractLinkFromCaption(caption) {
  if (!caption) return null
  const match = String(caption).match(/https?:\/\/[^\s<>"')\]]+/i)
  return match ? match[0].replace(/[.,;:]+$/, '') : null
}

function inferSource(post) {
  const ingestionType = post.ingestion?.type
  const url = String(post.original_url || post.ingestion?.source_url || '')
  if (/ads\/library/i.test(url)) return 'meta_ads_library'
  if (ingestionType === 'manual_upload') return 'manual_upload'
  return 'posts_migration'
}

function buildAdProfileFromAuthor(author = {}, platform, now) {
  const pageId =
    resolvePageId(author) ||
    `migrated-${ObjectId.createFromTime(Math.floor(now.getTime() / 1000)).toString()}`
  const pageName = author.display_name || author.username || 'Unknown advertiser'

  return {
    schema_version: 3,
    platform,
    platform_page_id: String(pageId),
    page_name: pageName,
    display_name: pageName,
    profile_url: author.profile_url || null,
    is_verified: author.is_verified ?? false,
    workflow: {
      review_status: 'pending',
      client_status: 'open',
      reviewed_at: null,
    },
    list: {
      risk: null,
      risk_rank: null,
      ad_count: 0,
      reviewed_ad_count: 0,
      max_threat_score: null,
      last_active_at: now,
      follower_count: 0,
      location: null,
    },
    enrichment: {
      biography: null,
      profile_pic_s3: null,
      profile_pic: null,
      page_categories: [],
      page_like_count: 0,
      page_is_deleted: false,
    },
    review_details: {},
    client_notes: [],
    system: {
      created_at: now,
      updated_at: now,
      last_synced_from_ad_at: now,
    },
  }
}

/**
 * @param {object} post - Posts v3 document
 * @param {import('mongodb').ObjectId} adProfileId
 */
function transformPostToAd(post, adProfileId) {
  const now = new Date()
  const platform = normalizeAdPlatform(post.platform)
  const platformAdId = extractAdArchiveId(post)
  const media = transformPostMediaToAdMedia(post)
  const displayFormat = inferDisplayFormat(post, media)
  const caption = post.content?.caption || ''
  const body = caption || null
  const title = firstLine(caption)
  const linkUrl =
    extractLinkFromCaption(caption) ||
    (String(post.original_url || '').includes('ads/library') ? null : post.original_url) ||
    post.canonical_url ||
    null
  const postedAt =
    toDate(post.list?.posted_at) ||
    toDate(post.ingestion?.ingested_at) ||
    toDate(post.system?.created_at) ||
    now
  const sourcedAt =
    toDate(post.list?.sourced_at) ||
    toDate(post.ingestion?.ingested_at) ||
    toDate(post.system?.created_at) ||
    now

  const sourcePayload = {
    migrated_from: 'Posts',
    source_post_id: post._id,
    migration_at: now.toISOString(),
    content_post_type: post.content?.post_type || null,
    author_snapshot: post.author_snapshot || null,
    profile_id: post.profile_id || null,
    engagement: post.engagement || null,
    result_origin: post.result_origin || null,
    pipeline: post.pipeline || null,
    canonical_url: post.canonical_url || null,
    list_engagement_score: post.list?.engagement_score ?? null,
    list_cluster_id: post.list?.cluster_id ?? null,
    list_is_cluster_representative: post.list?.is_cluster_representative ?? null,
    supabase_refs: post.supabase_refs || null,
    original_ingestion: post.ingestion || null,
  }

  const ad = {
    _id: post._id,
    schema_version: 3,
    platform,
    source: inferSource(post),
    platform_ad_id: platformAdId,
    original_url: post.original_url || post.canonical_url || null,
    channel: inferAdChannelFromUrl(post.original_url || post.ingestion?.source_url || post.canonical_url),
    ad_profile_id: adProfileId,
    workflow: {
      ai_status: post.workflow?.ai_status ?? 'pending',
      review_status: post.workflow?.review_status ?? 'pending',
      client_status: post.workflow?.client_status ?? 'open',
      visibility_status: post.workflow?.visibility_status ?? 'available',
      takedown_status: post.workflow?.takedown_status ?? 'none',
      alerted_at: toDate(post.workflow?.alerted_at),
    },
    list: {
      ai_threat_score: post.list?.ai_threat_score ?? null,
      review_threat_score: post.list?.review_threat_score ?? null,
      effective_threat_score: post.list?.effective_threat_score ?? null,
      risk_rank: post.list?.risk_rank ?? null,
      threat_types: Array.isArray(post.list?.threat_types) ? [...post.list.threat_types] : [],
      violation_flags: Array.isArray(post.list?.violation_flags) ? [...post.list.violation_flags] : [],
      posted_at: postedAt,
      sourced_at: sourcedAt,
      reviewed_at: toDate(post.list?.reviewed_at),
      alert_hour_ist: post.list?.alert_hour_ist ?? null,
      poi_detected: post.list?.poi_detected ?? false,
      start_date: postedAt,
      end_date: postedAt,
      is_active: true,
      display_format: displayFormat,
      publisher_platforms: ['FACEBOOK'],
      impressions_text: null,
      impressions_index: null,
      card_count: 0,
    },
    content: {
      title,
      body,
      caption: caption || null,
      cta_text: null,
      cta_type: null,
      display_format: displayFormat,
      link_url: linkUrl,
      link_description: null,
      language: post.content?.language ?? null,
      cards: [],
      media,
    },
    advertiser_snapshot: {
      platform_page_id: resolvePageId(post.author_snapshot),
      page_name: post.author_snapshot?.display_name || post.author_snapshot?.username || null,
      profile_url: post.author_snapshot?.profile_url || null,
      profile_pic: null,
      profile_pic_s3: null,
      page_is_deleted: false,
      page_categories: [],
      page_like_count: 0,
    },
    ad_delivery: {
      is_active: true,
      start_date: postedAt,
      end_date: postedAt,
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
    source_payload: sourcePayload,
    analysis_results: post.analysis_results || {},
    review_details: post.review_details || {},
    takedown: post.takedown || {
      status: 'none',
      initiated_at: null,
      completed_at: null,
      notes: [],
      documents: [],
    },
    client_notes: Array.isArray(post.client_notes) ? [...post.client_notes] : [],
    ingestion: {
      type: post.ingestion?.type || 'posts_migration',
      source_url: post.ingestion?.source_url || post.original_url || null,
      ingested_at: toDate(post.ingestion?.ingested_at) || sourcedAt,
    },
    system: {
      created_at: toDate(post.system?.created_at) || sourcedAt,
      updated_at: now,
      s3_stored: post.system?.s3_stored ?? media.some((m) => Boolean(m.s3_url)),
    },
    content_reviewed_by: post.content_reviewed_by ?? null,
  }

  if (post.analysis_correction_request) {
    ad.analysis_correction_request = post.analysis_correction_request
  }

  return ad
}

module.exports = {
  normalizeAdPlatform,
  extractAdArchiveId,
  extractPageIdFromUrl,
  resolvePageId,
  transformPostMediaToAdMedia,
  buildAdProfileFromAuthor,
  transformPostToAd,
}
