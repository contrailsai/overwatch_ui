/**
 * Pure transformers: legacy Posts/Profiles → schema v3.
 * Shared by migrate_v3.js (no app imports — runnable as plain Node).
 */

const { ObjectId } = require('mongodb')

const SCHEMA_VERSION = 3

const ENGAGEMENT_WEIGHTS = {
  views: 1,
  likes: 2,
  comments: 3,
  shares: 4,
}

const UI_TO_V3_CLIENT_STATUS = {
  'to be reviewed': 'open',
  'no action': 'no_action',
  pass: 'no_action',
  'flag for takedown': 'flag_for_takedown',
  takedown: 'takedown',
  takedowns: 'takedown',
  open: 'open',
  alerted: 'alerted',
  no_action: 'no_action',
  flag_for_takedown: 'flag_for_takedown',
}

function toDate(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'object' && value.$date != null) {
    return toDate(value.$date)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const asNum = Number(trimmed)
    if (!Number.isNaN(asNum) && trimmed === String(asNum)) {
      return toDate(asNum)
    }
    const d = new Date(trimmed)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

function toObjectId(value) {
  if (value == null) return null
  if (value instanceof ObjectId) return value
  if (typeof value === 'object' && value.$oid) {
    try {
      return new ObjectId(value.$oid)
    } catch {
      return null
    }
  }
  if (typeof value === 'string' && ObjectId.isValid(value)) {
    try {
      return new ObjectId(value)
    } catch {
      return null
    }
  }
  return null
}

function riskRankFromScore(score) {
  if (score == null || Number.isNaN(Number(score))) return null
  const n = Number(score)
  if (n > 95) return 'high'
  if (n > 75) return 'medium'
  if (n > 40) return 'low'
  return 'safe'
}

function computeEngagementScore(views = 0, likes = 0, comments = 0, shares = 0) {
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

function alertHourIst(date) {
  const d = toDate(date)
  if (!d) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(d)
  const hourPart = parts.find((p) => p.type === 'hour')
  if (!hourPart) return null
  const hour = Number(hourPart.value)
  // Intl may return 24 for midnight in some environments
  return hour === 24 ? 0 : hour
}

function mapClientStatusToV3(status) {
  if (status == null || status === '') return 'open'
  const key = String(status).toLowerCase().trim()
  if (UI_TO_V3_CLIENT_STATUS[key]) return UI_TO_V3_CLIENT_STATUS[key]
  return key.replace(/\s+/g, '_')
}

function mapTakedownStatus(raw) {
  if (raw == null || raw === '') return 'none'
  const s = String(raw).toLowerCase().trim().replace(/\s+/g, '_')
  if (s === 'none' || s === 'null') return 'none'
  return s
}

function normalizePlatform(platform) {
  if (!platform) return 'instagram'
  return String(platform).toLowerCase().trim()
}

function extractMedia(oldPost) {
  const media = []
  const sources = [
    oldPost?.content?.media,
    oldPost?.post_content?.media_urls,
    oldPost?.media_urls,
  ]
  for (const src of sources) {
    if (!Array.isArray(src) || src.length === 0) continue
    for (const item of src) {
      if (typeof item === 'string') {
        media.push({ type: 'image', original_url: item, s3_url: null })
      } else if (item && typeof item === 'object') {
        media.push({
          type: item.type || 'image',
          original_url: item.original_url || item.url || null,
          s3_url: item.s3_url ?? null,
          ...(item.thumbnail_url || item.thumbnail_s3_url
            ? { thumbnail_url: item.thumbnail_url || item.thumbnail_s3_url }
            : {}),
        })
      }
    }
    if (media.length > 0) break
  }
  return media
}

function extractCaption(oldPost) {
  if (oldPost?.content?.caption != null) return String(oldPost.content.caption)
  if (oldPost?.post_content?.caption != null) return String(oldPost.post_content.caption)
  if (oldPost?.caption != null) return String(oldPost.caption)
  if (typeof oldPost?.content === 'string') return oldPost.content
  return ''
}

function extractAuthorSnapshot(oldPost) {
  if (oldPost?.author_snapshot && typeof oldPost.author_snapshot === 'object') {
    return {
      platform_user_id: oldPost.author_snapshot.platform_user_id ?? null,
      username: oldPost.author_snapshot.username || 'unknown',
      display_name:
        oldPost.author_snapshot.display_name ||
        oldPost.author_snapshot.username ||
        'unknown',
      profile_url: oldPost.author_snapshot.profile_url || null,
      is_verified: Boolean(oldPost.author_snapshot.is_verified),
    }
  }
  const profile = oldPost?.profile || {}
  const user = oldPost?.user || {}
  const author = oldPost?.author || {}
  return {
    platform_user_id:
      profile.platform_user_id || user.id || user.platform_user_id || null,
    username:
      profile.username ||
      user.username ||
      user.name ||
      author.username ||
      author.name ||
      'unknown',
    display_name:
      profile.display_name ||
      user.full_name ||
      user.name ||
      author.name ||
      profile.username ||
      'unknown',
    profile_url:
      profile.profile_url ||
      user.profile_url ||
      author.url ||
      user.url ||
      null,
    is_verified: Boolean(
      profile.is_verified || user.is_verified || author.verified
    ),
  }
}

/**
 * Transform a legacy (or partial) post document into schema v3.
 * @param {object} oldPost
 * @param {{ profileId?: import('mongodb').ObjectId | null }} [opts]
 * @returns {{ post: object, embedding: object | null, events: object[] }}
 */
function transformPostToV3(oldPost, opts = {}) {
  if (!oldPost?._id) {
    throw new Error('Post missing _id')
  }

  // Already v3 — soft normalize and still extract embeddings/events if present on legacy fields
  if (oldPost.schema_version === 3 && oldPost.workflow && oldPost.list) {
    const post = { ...oldPost }
    delete post.text_embedding
    delete post.image_embedding
    if (opts.profileId && !post.profile_id) {
      post.profile_id = opts.profileId
    }
    const embedding = extractPostEmbedding(oldPost, post)
    const events = extractCaseEventsFromPost(oldPost)
    return { post, embedding, events }
  }

  const platform = normalizePlatform(oldPost.platform)
  const platformPostId = String(
    oldPost.platform_post_id ||
      oldPost.code ||
      oldPost.post_id ||
      oldPost.id ||
      oldPost._id.toString()
  )

  const reviewDetails = oldPost.review_details || {}
  const analysisResults = oldPost.analysis_results || {}
  const hasReviewScore =
    reviewDetails.threat_score != null && reviewDetails.threat_score !== ''
  const hasAnalysis =
    analysisResults &&
    typeof analysisResults === 'object' &&
    Object.keys(analysisResults).length > 0

  const aiThreatScore =
    analysisResults.threat_score != null
      ? Number(analysisResults.threat_score)
      : analysisResults.risk_score != null
        ? Number(analysisResults.risk_score)
        : null
  const reviewThreatScore = hasReviewScore
    ? Number(reviewDetails.threat_score)
    : null
  const effectiveThreatScore =
    reviewThreatScore != null
      ? reviewThreatScore
      : aiThreatScore != null && !Number.isNaN(aiThreatScore)
        ? aiThreatScore
        : null

  const threatTypes =
    (Array.isArray(reviewDetails.threat_types) && reviewDetails.threat_types.length
      ? reviewDetails.threat_types
      : null) ||
    (Array.isArray(analysisResults.threat_types)
      ? analysisResults.threat_types
      : []) ||
    []

  const likes =
    Number(oldPost.engagement?.likes ?? oldPost.stats?.like_count ?? oldPost.stats?.likes ?? 0) ||
    0
  const comments =
    Number(
      oldPost.engagement?.comments ??
        oldPost.stats?.comment_count ??
        oldPost.stats?.comments ??
        0
    ) || 0
  const shares =
    Number(
      oldPost.engagement?.shares ?? oldPost.stats?.share_count ?? oldPost.stats?.shares ?? 0
    ) || 0
  const views =
    Number(oldPost.engagement?.views ?? oldPost.stats?.view_count ?? oldPost.stats?.views ?? 0) ||
    0

  const postedAt =
    toDate(oldPost.list?.posted_at) ||
    toDate(oldPost.engagement?.posted_at) ||
    toDate(oldPost.metadata?.posted_date) ||
    toDate(oldPost.timestamp) ||
    toDate(oldPost.created_at) ||
    null

  const sourcedAt =
    toDate(oldPost.list?.sourced_at) ||
    toDate(oldPost.metadata?.sourcing_date) ||
    toDate(oldPost.sourcing_date) ||
    toDate(oldPost.ingestion?.ingested_at) ||
    toDate(oldPost.metadata?.created_at) ||
    postedAt

  const reviewedAt =
    toDate(oldPost.list?.reviewed_at) ||
    toDate(reviewDetails.reviewed_at) ||
    null

  const alertedAt =
    toDate(oldPost.workflow?.alerted_at) ||
    toDate(oldPost.processed_at) ||
    (oldPost.processed ? reviewedAt || sourcedAt : null)

  const clientStatusRaw =
    oldPost.workflow?.client_status ?? oldPost.client_status ?? null
  let clientStatus = mapClientStatusToV3(clientStatusRaw)
  // Legacy: processed/alerted often meant "alerted to client"
  if (
    (clientStatus === 'open' || !clientStatusRaw) &&
    (oldPost.processed === true || alertedAt)
  ) {
    clientStatus = 'alerted'
  }

  const takedownInfo = oldPost.takedown_info || oldPost.takedown || {}
  const takedownStatus = mapTakedownStatus(
    oldPost.workflow?.takedown_status ||
      takedownInfo.takedown_status ||
      takedownInfo.status
  )

  const visibility =
    oldPost.workflow?.visibility_status ||
    oldPost.visibility_status ||
    'available'

  const clusterId =
    toObjectId(oldPost.list?.cluster_id) || toObjectId(oldPost.cluster_id)

  const poiDetected = Boolean(
    oldPost.list?.poi_detected ??
      (reviewDetails.face_present ||
        reviewDetails.name_present ||
        analysisResults.poi_check?.face_present ||
        analysisResults.poi_check?.poi_name_found ||
        (Array.isArray(reviewDetails.poi_names) && reviewDetails.poi_names.length > 0))
  )

  const createdAt =
    toDate(oldPost.system?.created_at) ||
    toDate(oldPost.metadata?.created_at) ||
    toDate(oldPost.created_at) ||
    sourcedAt ||
    new Date()
  const updatedAt =
    toDate(oldPost.system?.updated_at) ||
    toDate(oldPost.metadata?.updated_at) ||
    toDate(oldPost.updated_at) ||
    createdAt

  const profileId =
    opts.profileId ||
    toObjectId(oldPost.profile_id) ||
    null

  const post = {
    _id: oldPost._id,
    schema_version: SCHEMA_VERSION,
    platform,
    platform_post_id: platformPostId,
    original_url: oldPost.original_url || oldPost.url || null,
    profile_id: profileId,
    workflow: {
      ai_status:
        oldPost.workflow?.ai_status ||
        (hasAnalysis ? 'completed' : 'pending'),
      review_status:
        oldPost.workflow?.review_status ||
        (hasReviewScore ? 'reviewed' : 'pending'),
      client_status: clientStatus,
      visibility_status: String(visibility).toLowerCase(),
      takedown_status: takedownStatus,
      alerted_at: alertedAt,
    },
    list: {
      ai_threat_score:
        aiThreatScore != null && !Number.isNaN(aiThreatScore) ? aiThreatScore : null,
      review_threat_score: reviewThreatScore,
      effective_threat_score: effectiveThreatScore,
      risk_rank: riskRankFromScore(effectiveThreatScore),
      threat_types: threatTypes,
      violation_flags: threatTypes,
      posted_at: postedAt,
      sourced_at: sourcedAt,
      reviewed_at: reviewedAt,
      alert_hour_ist: alertHourIst(alertedAt || reviewedAt),
      engagement_score: computeEngagementScore(views, likes, comments, shares),
      cluster_id: clusterId,
      is_cluster_representative:
        oldPost.list?.is_cluster_representative != null
          ? Boolean(oldPost.list.is_cluster_representative)
          : true,
      poi_detected: poiDetected,
    },
    content: {
      caption: extractCaption(oldPost),
      media: extractMedia(oldPost),
      language:
        oldPost.content?.language ??
        oldPost.post_content?.language ??
        oldPost.lang ??
        null,
      post_type:
        oldPost.content?.post_type ||
        oldPost.post_content?.post_type ||
        oldPost.type ||
        'post',
    },
    author_snapshot: extractAuthorSnapshot(oldPost),
    analysis_results: analysisResults,
    review_details: reviewDetails,
    takedown: {
      status: takedownStatus,
      initiated_at:
        toDate(takedownInfo.initiated_at) ||
        toDate(takedownInfo.takedown_start_date) ||
        null,
      completed_at:
        toDate(takedownInfo.completed_at) ||
        toDate(takedownInfo.takedown_end_date) ||
        null,
      client_reference_id: takedownInfo.client_reference_id || null,
      platform_case_id: takedownInfo.platform_case_id || null,
      notes: Array.isArray(takedownInfo.notes) ? takedownInfo.notes : [],
      documents: Array.isArray(takedownInfo.documents) ? takedownInfo.documents : [],
    },
    client_notes: Array.isArray(oldPost.client_notes) ? oldPost.client_notes : [],
    supabase_refs:
      oldPost.supabase_refs && typeof oldPost.supabase_refs === 'object'
        ? oldPost.supabase_refs
        : { case_id: null, alert_ids: [], chat_thread_ids: [] },
    ingestion: {
      type:
        oldPost.ingestion?.type ||
        oldPost.result_origin?.type ||
        'unknown',
      source_url:
        oldPost.ingestion?.source_url ||
        oldPost.result_origin?.source_url ||
        oldPost.result_origin?.source ||
        oldPost.original_url ||
        null,
      ingested_at:
        toDate(oldPost.ingestion?.ingested_at) || sourcedAt || createdAt,
    },
    system: {
      created_at: createdAt,
      updated_at: updatedAt,
      s3_stored: Boolean(
        oldPost.system?.s3_stored ?? oldPost.s3_stored ?? oldPost.metadata?.storage?.s3_stored
      ),
    },
  }

  // Preserve optional fields the UI still uses at root
  if (oldPost.assigned_to != null) post.assigned_to = oldPost.assigned_to
  if (oldPost.content_reviewed_by != null) {
    post.content_reviewed_by = oldPost.content_reviewed_by
  }
  if (oldPost.analysis_correction_request != null) {
    post.analysis_correction_request = oldPost.analysis_correction_request
  }

  const embedding = extractPostEmbedding(oldPost, post)
  const events = extractCaseEventsFromPost(oldPost)

  return { post, embedding, events }
}

function extractPostEmbedding(oldPost, v3Post) {
  const text =
    oldPost.text_embedding ||
    (Array.isArray(oldPost.embeddings?.text) ? oldPost.embeddings.text : null)
  const image =
    oldPost.image_embedding ||
    (Array.isArray(oldPost.embeddings?.image) ? oldPost.embeddings.image : null)

  const hasText = Array.isArray(text) && text.length > 0
  const hasImage = Array.isArray(image) && image.length > 0
  if (!hasText && !hasImage) return null

  return {
    post_id: v3Post._id,
    ...(hasText ? { text_embedding: text } : {}),
    ...(hasImage ? { image_embedding: image } : {}),
    platform: v3Post.platform,
    effective_threat_score: v3Post.list?.effective_threat_score ?? null,
  }
}

function extractCaseEventsFromPost(oldPost) {
  const events = []
  const entityId = oldPost._id

  const history = oldPost.metadata?.update_history
  if (Array.isArray(history)) {
    for (const entry of history) {
      const occurredAt = toDate(entry.updated_at) || new Date()
      const actor = entry.updated_by || null
      const summary = entry.changes_summary || entry.event_type || 'Update'
      events.push({
        entity_type: 'post',
        entity_id: entityId,
        event_type: summary,
        actor,
        summary,
        payload: {
          updated_by: actor,
          changes_summary: summary,
          migrated_from: 'metadata.update_history',
        },
        occurred_at: occurredAt,
        source: inferEventSource(actor),
      })
    }
  }

  const takedownEvents =
    oldPost.takedown_info?.events || oldPost.takedown?.events || []
  if (Array.isArray(takedownEvents)) {
    for (const entry of takedownEvents) {
      const occurredAt =
        toDate(entry.date) || toDate(entry.occurred_at) || toDate(entry.created_at) || new Date()
      const summary =
        entry.event || entry.details || entry.summary || 'Takedown event'
      events.push({
        entity_type: 'post',
        entity_id: entityId,
        event_type: summary,
        actor: entry.created_by || entry.actor || null,
        summary: typeof entry.details === 'string' ? entry.details : summary,
        payload: {
          ...entry,
          migrated_from: 'takedown_info.events',
        },
        occurred_at: occurredAt,
        source: 'client',
      })
    }
  }

  return events
}

function inferEventSource(actor) {
  if (!actor) return 'ingest'
  const a = String(actor).toLowerCase()
  if (a.includes('ai_moderation') || a.includes('lambda')) {
    return 'ai_moderation_lambda'
  }
  if (a.includes('ingest') || a.includes('manual_ingest')) return 'ingest'
  if (a.includes('@')) return 'client'
  return 'ingest'
}

/**
 * Transform a legacy profile into schema v3.
 * @param {object} oldProfile
 * @returns {{ profile: object, postIds: string[] }}
 */
function transformProfileToV3(oldProfile) {
  if (!oldProfile?._id) {
    throw new Error('Profile missing _id')
  }

  const postIds = Array.isArray(oldProfile.posts)
    ? oldProfile.posts.map((id) => {
        if (id == null) return null
        if (typeof id === 'string') return id
        if (id instanceof ObjectId) return id.toString()
        if (id.$oid) return id.$oid
        if (id._id) return String(id._id)
        return String(id)
      }).filter(Boolean)
    : []

  if (oldProfile.schema_version === 3 && oldProfile.workflow && oldProfile.list) {
    const profile = { ...oldProfile }
    delete profile.posts
    return { profile, postIds }
  }

  const meta = oldProfile.metadata || {}
  const enrichmentSrc = oldProfile.enrichment || {}
  const platform = normalizePlatform(oldProfile.platform)

  const reviewDetails = oldProfile.review_details || {}
  const hasReview =
    oldProfile.workflow?.review_status === 'reviewed' ||
    Boolean(reviewDetails.risk) ||
    Boolean(reviewDetails.reviewed_at)

  const risk =
    oldProfile.list?.risk ??
    oldProfile.list?.risk_rank ??
    reviewDetails.risk ??
    null

  const profile = {
    _id: oldProfile._id,
    schema_version: SCHEMA_VERSION,
    platform,
    platform_user_id: oldProfile.platform_user_id ?? meta.platform_user_id ?? null,
    username: oldProfile.username || meta.username || null,
    display_name:
      oldProfile.display_name || meta.display_name || meta.full_name || oldProfile.username || null,
    profile_url: oldProfile.profile_url || meta.profile_url || null,
    is_verified: Boolean(oldProfile.is_verified ?? meta.is_verified),
    workflow: {
      review_status:
        oldProfile.workflow?.review_status || (hasReview ? 'reviewed' : 'pending'),
      client_status: mapClientStatusToV3(
        oldProfile.workflow?.client_status ?? oldProfile.client_status
      ),
      reviewed_at:
        toDate(oldProfile.workflow?.reviewed_at) ||
        toDate(reviewDetails.reviewed_at) ||
        null,
    },
    list: {
      risk: risk != null ? String(risk).toLowerCase() : null,
      risk_rank: risk != null ? String(risk).toLowerCase() : null,
      post_count: postIds.length,
      reviewed_post_count: oldProfile.list?.reviewed_post_count ?? 0,
      max_threat_score: oldProfile.list?.max_threat_score ?? null,
      last_active_at:
        toDate(oldProfile.list?.last_active_at) ||
        toDate(oldProfile.last_relevant_publish_date) ||
        null,
      follower_count:
        oldProfile.list?.follower_count ??
        meta.follower_count ??
        meta.followers_count ??
        null,
      location: oldProfile.list?.location ?? meta.location ?? null,
    },
    enrichment: {
      biography: enrichmentSrc.biography ?? meta.biography ?? null,
      profile_pic_s3: enrichmentSrc.profile_pic_s3 ?? meta.s3_url ?? null,
      profile_pic: enrichmentSrc.profile_pic ?? meta.profile_pic ?? null,
      media_count: enrichmentSrc.media_count ?? meta.media_count ?? null,
      account_created_at:
        toDate(enrichmentSrc.account_created_at) ||
        toDate(meta.account_creation_date) ||
        toDate(meta.account_created_at) ||
        null,
      following_count:
        enrichmentSrc.following_count ?? meta.following_count ?? null,
      is_business: enrichmentSrc.is_business ?? meta.is_business ?? null,
      category: enrichmentSrc.category ?? meta.category ?? null,
    },
    review_details: reviewDetails,
    client_notes: Array.isArray(oldProfile.client_notes) ? oldProfile.client_notes : [],
    system: {
      created_at:
        toDate(oldProfile.system?.created_at) ||
        toDate(oldProfile.created_at) ||
        null,
      updated_at:
        toDate(oldProfile.system?.updated_at) ||
        toDate(oldProfile.last_updated) ||
        toDate(oldProfile.updated_at) ||
        new Date(),
      last_synced_from_post_at:
        toDate(oldProfile.system?.last_synced_from_post_at) ||
        toDate(oldProfile.last_synced_from_post) ||
        null,
    },
  }

  return { profile, postIds }
}

/**
 * Build postId(string) → profileId(ObjectId) map from source profiles.
 */
function buildPostToProfileMap(profiles) {
  const map = new Map()
  for (const p of profiles) {
    const profileId = p._id
    const posts = Array.isArray(p.posts) ? p.posts : []
    for (const id of posts) {
      let key = null
      if (typeof id === 'string') key = id
      else if (id instanceof ObjectId) key = id.toString()
      else if (id?.$oid) key = id.$oid
      else if (id?._id) key = String(id._id)
      else if (id != null) key = String(id)
      if (key) map.set(key, profileId)
    }
  }
  return map
}

/**
 * Secondary index: `${platform}|${usernameLower}` → profileId
 */
function buildUsernameProfileMap(profiles) {
  const map = new Map()
  for (const p of profiles) {
    const platform = normalizePlatform(p.platform)
    const username = (p.username || p.metadata?.username || '').toLowerCase().trim()
    if (!username) continue
    map.set(`${platform}|${username}`, p._id)
  }
  return map
}

module.exports = {
  SCHEMA_VERSION,
  ENGAGEMENT_WEIGHTS,
  toDate,
  toObjectId,
  riskRankFromScore,
  computeEngagementScore,
  alertHourIst,
  mapClientStatusToV3,
  mapTakedownStatus,
  normalizePlatform,
  transformPostToV3,
  transformProfileToV3,
  extractPostEmbedding,
  extractCaseEventsFromPost,
  buildPostToProfileMap,
  buildUsernameProfileMap,
}
