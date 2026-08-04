import { computeEngagementScore } from '@/app/(dashboard)/cases/riskBuckets'

/**
 * Maps simplified manual-ingest input to the strict posts v3 collection shape.
 * @param {Record<string, unknown>} data
 * @param {boolean} s3Stored
 * @param {string} updatedBy
 */

function getFlexible(data, keys, defaultValue = null) {
  for (const key of keys) {
    if (key.includes('.')) {
      const parts = key.split('.')
      let curr = data
      for (const p of parts) {
        if (curr && typeof curr === 'object' && p in curr) {
          curr = curr[p]
        } else {
          curr = null
          break
        }
      }
      if (curr != null) return curr
    } else if (data && typeof data === 'object' && key in data) {
      return data[key]
    }
  }
  return defaultValue
}

function parseDate(dateVal) {
  if (dateVal == null || dateVal === '') return null
  if (typeof dateVal === 'object' && dateVal !== null && '$date' in dateVal) {
    const dateStr = dateVal.$date
    try {
      return new Date(String(dateStr).replace('Z', '+00:00'))
    } catch {
      return null
    }
  }
  if (typeof dateVal === 'string') {
    try {
      if (dateVal.endsWith('Z')) {
        return new Date(dateVal.replace('Z', '+00:00'))
      }
      return new Date(dateVal)
    } catch {
      return null
    }
  }
  if (typeof dateVal === 'number' && Number.isFinite(dateVal)) {
    const ms = dateVal < 1e12 ? dateVal * 1000 : dateVal
    return new Date(ms)
  }
  return null
}

function parseTakenAt(takenAt) {
  if (takenAt == null || takenAt === '') return null
  if (typeof takenAt === 'number' && Number.isFinite(takenAt)) {
    const ms = takenAt < 1e12 ? takenAt * 1000 : takenAt
    return new Date(ms)
  }
  if (typeof takenAt === 'string' && takenAt.trim()) {
    const asNum = Number(takenAt)
    if (!Number.isNaN(asNum) && takenAt.trim() === String(asNum)) {
      return parseTakenAt(asNum)
    }
    return parseDate(takenAt)
  }
  return null
}

/**
 * @param {Record<string, unknown>} data
 * @param {boolean} s3Stored
 * @param {string} updatedBy
 */
export function buildStrictPostDocument(data, s3Stored, updatedBy) {
  const nowUtc = new Date()

  const postId = String(getFlexible(data, ['id', 'post_id', 'code']) ?? '').trim()
  const postUrl = String(getFlexible(data, ['url-of-post', 'url', 'original_url'], '') ?? '')

  let platform = getFlexible(data, ['platform'])
  if (!platform && postUrl) {
    const u = String(postUrl).toLowerCase()
    if (u.includes('facebook.com')) platform = 'facebook'
    else if (u.includes('youtube.com') || u.includes('youtu.be')) platform = 'youtube'
    else if (u.includes('instagram.com')) platform = 'instagram'
    else if (u.includes('x.com') || u.includes('twitter.com')) platform = 'x'
  }
  if (!platform) platform = 'facebook'

  const content = String(getFlexible(data, ['content', 'caption', 'post_content.caption'], '') ?? '')

  const timestamp =
    parseTakenAt(getFlexible(data, ['taken_at'])) ??
    parseDate(getFlexible(data, ['posted_date', 'timestamp', 'created_at', '$date'])) ??
    nowUtc

  const rawTaken = getFlexible(data, ['taken_at'])
  let takenAtUnix = Math.floor(timestamp.getTime() / 1000)
  if (typeof rawTaken === 'number' && Number.isFinite(rawTaken)) {
    takenAtUnix = rawTaken < 1e12 ? Math.floor(rawTaken) : Math.floor(rawTaken / 1000)
  } else if (typeof rawTaken === 'string' && rawTaken.trim()) {
    const n = Number(rawTaken.trim())
    if (!Number.isNaN(n)) {
      takenAtUnix = n < 1e12 ? Math.floor(n) : Math.floor(n / 1000)
    }
  }

  const username = String(
    getFlexible(
      data,
      [
        'profile.name',
        'profile.username',
        'author.name',
        'author_name',
        'username',
        'author.name',
        'user.name',
      ],
      'unknown'
    ) ?? 'unknown'
  )

  const profileLink = String(
    getFlexible(
      data,
      [
        'profile.link_to_userprofile',
        'profile.profile_url',
        'author.url',
        'author_url',
        'author.url',
        'user.url',
      ],
      ''
    ) ?? ''
  )

  const platformUserId = getFlexible(data, ['platform_user_id', 'profile.platform_user_id'])

  const likes = Number.parseInt(String(getFlexible(data, ['engagement.likes', 'likes', 'stats.likes'], 0) ?? 0), 10) || 0
  const comments =
    Number.parseInt(String(getFlexible(data, ['engagement.comments', 'comments', 'stats.comments'], 0) ?? 0), 10) || 0
  const shares =
    Number.parseInt(String(getFlexible(data, ['engagement.shares', 'shares', 'stats.shares'], 0) ?? 0), 10) || 0
  const views =
    Number.parseInt(String(getFlexible(data, ['engagement.views', 'views', 'stats.views'], 0) ?? 0), 10) || 0

  const rawMedia = getFlexible(data, ['media', 'media_urls', 'post_content.media_urls'], [])
  const mediaList = []
  if (Array.isArray(rawMedia)) {
    for (const item of rawMedia) {
      if (typeof item === 'string') {
        mediaList.push({ type: 'image', original_url: item, s3_url: null })
      } else if (item && typeof item === 'object') {
        mediaList.push({
          type: item.type || 'image',
          original_url: item.original_url || item.url || null,
          s3_url: item.s3_url ?? null,
        })
      }
    }
  }

  const engagementScore = computeEngagementScore(views, likes, comments, shares)

  return {
    schema_version: 3,
    platform,
    platform_post_id: postId,
    original_url: postUrl,
    profile_id: null,
    workflow: {
      ai_status: 'pending',
      review_status: 'pending',
      client_status: 'open',
      visibility_status: data.visibility_status != null ? data.visibility_status : 'available',
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
      posted_at: timestamp,
      sourced_at: nowUtc,
      reviewed_at: null,
      alert_hour_ist: null,
      engagement_score: engagementScore,
      cluster_id: null,
      is_cluster_representative: true,
      poi_detected: false,
    },
    content: {
      caption: content,
      media: mediaList,
      language: getFlexible(data, ['language', 'post_content.language']) ?? null,
      post_type: getFlexible(data, ['post_type', 'post_content.post_type'], 'post'),
    },
    author_snapshot: {
      platform_user_id: platformUserId ?? null,
      username,
      display_name: String(
        getFlexible(data, ['profile.full_name', 'profile.display_name', 'display_name'], username) ?? username
      ),
      profile_url: profileLink || null,
      is_verified: Boolean(
        getFlexible(data, ['is_verified', 'profile.is_verified', 'profile.verified', 'verified'], false)
      ),
    },
    analysis_results: data.analysis_results && typeof data.analysis_results === 'object' ? data.analysis_results : {},
    review_details: data.review_details && typeof data.review_details === 'object' ? data.review_details : {},
    takedown: {
      status: 'none',
      initiated_at: null,
      completed_at: null,
      client_reference_id: null,
      platform_case_id: null,
      notes: [],
      documents: [],
    },
    client_notes: [],
    supabase_refs:
      data.supabase_refs && typeof data.supabase_refs === 'object'
        ? data.supabase_refs
        : { case_id: null, alert_ids: [], chat_thread_ids: [] },
    ingestion: {
      type: 'manual_upload',
      source_url: postUrl || null,
      ingested_at: nowUtc,
    },
    system: {
      created_at: nowUtc,
      updated_at: nowUtc,
      s3_stored: s3Stored,
    },
  }
}
