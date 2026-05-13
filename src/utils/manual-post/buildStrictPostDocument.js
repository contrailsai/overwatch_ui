/**
 * Maps simplified manual-ingest input to the strict Posts collection shape
 * (aligned with Python manual_ingest enforce_strict_schema).
 * @param {Record<string, unknown>} data - Merged input; may include `media` as list of { type, original_url, s3_url }
 * @returns {Record<string, unknown>} Document suitable for Mongo insertOne (uses native Date where helpful)
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

  const metadata = {
    created_at: nowUtc,
    updated_at: nowUtc,
    sourcing_date: nowUtc,
    update_history: [
      {
        updated_at: nowUtc,
        updated_by: updatedBy,
        changes_summary: 'Manual post from reviewer upload UI',
      },
    ],
    schema_version: 1,
  }

  const engagementPostedAt = timestamp

  return {
    id: postId,
    code: postId,
    post_id: postId,

    platform,
    url: postUrl,
    original_url: postUrl,
    content,
    caption: content,

    post_content: {
      caption: content,
      media_urls: mediaList,
      post_type: getFlexible(data, ['post_type', 'post_content.post_type'], 'post'),
      language: getFlexible(data, ['language', 'post_content.language']) ?? null,
      taken_at: takenAtUnix,
    },

    type: getFlexible(data, ['type'], 'post'),
    timestamp,
    created_at: timestamp,
    sourcing_date: metadata.sourcing_date,
    visibility_status: data.visibility_status != null ? data.visibility_status : 'available',

    profile: {
      platform_user_id: platformUserId ?? '',
      username,
      display_name: String(
        getFlexible(data, ['profile.full_name', 'profile.display_name', 'display_name'], username) ?? username
      ),
      profile_url: profileLink,
      is_verified: Boolean(
        getFlexible(data, ['is_verified', 'profile.is_verified', 'profile.verified', 'verified'], false)
      ),
      metadata: {
        description: getFlexible(data, ['profile.description', 'description', 'biography', 'profile.biography']) ?? '',
        profile_pic:
          getFlexible(data, ['profile.profile_pic', 'profile_pic', 'profile.profile_pic_url', 'profile_pic_url']) ??
          '',
        followers_count:
          Number.parseInt(
            String(getFlexible(data, ['profile.followers_count', 'followers_count', 'follower_count'], 0) ?? 0),
            10
          ) || 0,
        following_count:
          Number.parseInt(
            String(getFlexible(data, ['profile.following_count', 'following_count'], 0) ?? 0),
            10
          ) || 0,
        media_count:
          Number.parseInt(String(getFlexible(data, ['profile.media_count', 'media_count'], 0) ?? 0), 10) || 0,
        posts_count:
          Number.parseInt(String(getFlexible(data, ['profile.posts_count', 'posts_count'], 0) ?? 0), 10) || 0,
        favourites_count:
          Number.parseInt(
            String(getFlexible(data, ['profile.favourites_count', 'favourites_count'], 0) ?? 0),
            10
          ) || 0,
        location: getFlexible(data, ['profile.location', 'location']) ?? '',
        external_url: getFlexible(data, ['profile.external_url', 'external_url']) ?? '',
        account_created_at:
          getFlexible(data, ['profile.account_created_at', 'account_created_at', 'account_creation_date']) ?? '',
      },
    },
    author: { name: username, url: profileLink },
    user: { name: username, url: profileLink },

    engagement: {
      likes,
      comments,
      shares,
      retweets: 0,
      quotes: 0,
      replies: 0,
      views,
      posted_at: engagementPostedAt,
    },
    stats: { likes, comments, shares },

    media_urls: mediaList,
    taken_at: takenAtUnix,
    metadata,

    analysis_results: data.analysis_results && typeof data.analysis_results === 'object' ? data.analysis_results : {},
    review_details: data.review_details && typeof data.review_details === 'object' ? data.review_details : {},
    takedown_info:
      data.takedown_info && typeof data.takedown_info === 'object'
        ? data.takedown_info
        : { takedown_status: 'None' },
    supabase_refs:
      data.supabase_refs && typeof data.supabase_refs === 'object'
        ? data.supabase_refs
        : { case_id: null, alert_ids: [], chat_thread_ids: [] },

    processed: false,
    processed_at: nowUtc,
    s3_stored: s3Stored,
    result_origin: {
      type: 'manual_upload',
      source_url: postUrl,
    },
  }
}
