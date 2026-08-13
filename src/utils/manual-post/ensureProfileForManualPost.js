import { ObjectId } from 'mongodb'
import { profilesCollection } from '@/utils/mongodb/collections'

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extract a stable platform user id from common profile / post URLs.
 * @param {string|null|undefined} platform
 * @param {string|null|undefined} profileUrl
 * @param {string|null|undefined} postUrl
 */
export function extractPlatformUserIdFromUrls(platform, profileUrl, postUrl) {
  const p = String(platform || '').toLowerCase()
  const urls = [profileUrl, postUrl].filter(Boolean).map(String)

  for (const url of urls) {
    if (p === 'facebook' || /facebook\.com/i.test(url)) {
      let m = url.match(/facebook\.com\/people\/[^/]+\/(\d+)/i)
      if (m) return m[1]
      m = url.match(/facebook\.com\/profile\.php\?id=(\d+)/i)
      if (m) return m[1]
      m = url.match(/facebook\.com\/(\d+)(?:\/|$|\?)/i)
      if (m) return m[1]
    }
    if (p === 'instagram' || /instagram\.com/i.test(url)) {
      const m = url.match(/instagram\.com\/([^/?#]+)/i)
      if (m && !['p', 'reel', 'reels', 'stories', 'explore'].includes(m[1].toLowerCase())) {
        return m[1]
      }
    }
    if (p === 'youtube' || /youtube\.com|youtu\.be/i.test(url)) {
      let m = url.match(/youtube\.com\/(?:channel\/|c\/|@)([^/?#]+)/i)
      if (m) return m[1]
      m = url.match(/youtu\.be\/([^/?#]+)/i)
      if (m) return m[1]
    }
    if (p === 'x' || /(?:x|twitter)\.com/i.test(url)) {
      const m = url.match(/(?:x|twitter)\.com\/([^/?#]+)/i)
      if (m && !['i', 'intent', 'share', 'home'].includes(m[1].toLowerCase())) {
        return m[1]
      }
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

/**
 * Find an existing v3 profile or create one from a manual post's author_snapshot.
 * Returns the profile ObjectId (or null when author data is insufficient).
 *
 * @param {import('mongodb').Db} db
 * @param {{
 *   platform: string,
 *   author_snapshot?: {
 *     platform_user_id?: string|null,
 *     username?: string|null,
 *     display_name?: string|null,
 *     profile_url?: string|null,
 *     is_verified?: boolean,
 *   },
 *   original_url?: string|null,
 *   list?: { posted_at?: Date|null, effective_threat_score?: number|null, ai_threat_score?: number|null },
 * }} postDoc
 * @returns {Promise<import('mongodb').ObjectId|null>}
 */
export async function ensureProfileForManualPost(db, postDoc) {
  const author = postDoc?.author_snapshot || {}
  const platform = String(postDoc?.platform || 'facebook').toLowerCase().trim()
  const username = String(author.username || '').trim()
  const profileUrl = author.profile_url || null
  const platformUserId =
    (author.platform_user_id != null && String(author.platform_user_id).trim()) ||
    extractPlatformUserIdFromUrls(platform, profileUrl, postDoc?.original_url) ||
    null

  if (!username && !platformUserId && !profileUrl) {
    return null
  }

  const profiles = profilesCollection(db)
  const orConditions = []

  if (platformUserId) {
    orConditions.push({ platform, platform_user_id: String(platformUserId) })
  }
  if (username) {
    orConditions.push({
      platform,
      username: { $regex: new RegExp(`^${escapeRegex(username)}$`, 'i') },
    })
  }
  if (profileUrl) {
    orConditions.push({ platform, profile_url: profileUrl })
  }

  const existing = orConditions.length
    ? await profiles.findOne({ $or: orConditions })
    : null

  const postedAt = postDoc?.list?.posted_at ? new Date(postDoc.list.posted_at) : null
  const threat =
    postDoc?.list?.effective_threat_score ?? postDoc?.list?.ai_threat_score ?? null
  const now = new Date()

  if (existing) {
    const $set = {
      'system.updated_at': now,
      'system.last_synced_from_post_at': now,
    }
    if (!existing.platform_user_id && platformUserId) {
      $set.platform_user_id = String(platformUserId)
    }
    if (!existing.profile_url && profileUrl) {
      $set.profile_url = profileUrl
    }
    if (!existing.display_name && (author.display_name || username)) {
      $set.display_name = author.display_name || username
    }
    if (!existing.username && username) {
      $set.username = username
    }

    const inc = { 'list.post_count': 1 }
    const updates = { $set, $inc: inc }

    if (postedAt && !Number.isNaN(postedAt.getTime())) {
      if (!existing.list?.last_active_at || new Date(existing.list.last_active_at) < postedAt) {
        $set['list.last_active_at'] = postedAt
      }
    }
    if (typeof threat === 'number') {
      const prevMax = existing.list?.max_threat_score
      if (prevMax == null || threat > prevMax) {
        $set['list.max_threat_score'] = threat
        $set['list.risk'] = riskRankFromScore(threat)
        $set['list.risk_rank'] = riskRankFromScore(threat)
      }
    }

    await profiles.updateOne({ _id: existing._id }, updates)
    return existing._id
  }

  const profileId = new ObjectId()
  const profile = {
    _id: profileId,
    schema_version: 3,
    platform,
    platform_user_id: platformUserId ? String(platformUserId) : null,
    username: username || author.display_name || 'unknown',
    display_name: author.display_name || username || 'unknown',
    profile_url: profileUrl,
    is_verified: Boolean(author.is_verified),
    workflow: {
      review_status: 'pending',
      client_status: 'open',
      reviewed_at: null,
    },
    list: {
      risk: riskRankFromScore(threat),
      risk_rank: riskRankFromScore(threat),
      post_count: 1,
      reviewed_post_count: 0,
      max_threat_score: typeof threat === 'number' ? threat : null,
      last_active_at: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
      follower_count: null,
      location: null,
    },
    enrichment: {
      biography: null,
      profile_pic_s3: null,
      profile_pic: null,
      media_count: null,
      account_created_at: null,
      following_count: null,
      is_business: null,
      category: null,
    },
    review_details: {},
    client_notes: [],
    system: {
      created_at: now,
      updated_at: now,
      last_synced_from_post_at: now,
    },
  }

  await profiles.insertOne(profile)
  return profileId
}
