import { ObjectId } from 'mongodb'
import { adProfilesCollection } from '@/utils/mongodb/collections'

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function extractMetaPageIdFromUrls(...urls) {
  for (const url of urls.filter(Boolean).map(String)) {
    let m = url.match(/facebook\.com\/people\/[^/]+\/(\d+)/i)
    if (m) return m[1]
    m = url.match(/facebook\.com\/profile\.php\?id=(\d+)/i)
    if (m) return m[1]
    m = url.match(/facebook\.com\/(?:pages\/[^/]+\/)?(\d+)(?:\/|$|\?)/i)
    if (m) return m[1]
  }
  return null
}

function fallbackPageId(pageName) {
  const slug = String(pageName || 'advertiser')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48)
  return `manual_${slug || 'advertiser'}`
}

/**
 * Find or create an Ad_profiles document from a manual ad's advertiser snapshot.
 * @returns {Promise<import('mongodb').ObjectId|null>}
 */
export async function ensureAdProfileForManualAd(db, adDoc) {
  const snapshot = adDoc?.advertiser_snapshot || {}
  const platform = String(adDoc?.platform || 'meta').toLowerCase().trim() || 'meta'
  const pageName = String(snapshot.page_name || '').trim()
  const profileUrl = snapshot.profile_url || null
  const platformPageId =
    (snapshot.platform_page_id != null && String(snapshot.platform_page_id).trim()) ||
    extractMetaPageIdFromUrls(profileUrl, adDoc?.original_url) ||
    (pageName ? fallbackPageId(pageName) : null)

  if (!platformPageId && !pageName && !profileUrl) {
    return null
  }

  const profiles = adProfilesCollection(db)
  const orConditions = []
  if (platformPageId) {
    orConditions.push({ platform, platform_page_id: String(platformPageId) })
  }
  if (profileUrl) {
    orConditions.push({ platform, profile_url: profileUrl })
  }
  if (pageName) {
    orConditions.push({
      platform,
      page_name: { $regex: new RegExp(`^${escapeRegex(pageName)}$`, 'i') },
    })
  }

  const existing = orConditions.length ? await profiles.findOne({ $or: orConditions }) : null
  const postedAt = adDoc?.list?.posted_at ? new Date(adDoc.list.posted_at) : null
  const now = new Date()

  if (existing) {
    const $set = {
      'system.updated_at': now,
      'system.last_synced_from_ad_at': now,
    }
    if (!existing.platform_page_id && platformPageId) {
      $set.platform_page_id = String(platformPageId)
    }
    if (!existing.profile_url && profileUrl) {
      $set.profile_url = profileUrl
    }
    if (!existing.page_name && pageName) {
      $set.page_name = pageName
      $set.display_name = pageName
    }

    const updates = { $set, $inc: { 'list.ad_count': 1 } }
    if (postedAt && !Number.isNaN(postedAt.getTime())) {
      if (!existing.list?.last_active_at || new Date(existing.list.last_active_at) < postedAt) {
        $set['list.last_active_at'] = postedAt
      }
    }

    await profiles.updateOne({ _id: existing._id }, updates)
    if (!adDoc.advertiser_snapshot.platform_page_id && (existing.platform_page_id || platformPageId)) {
      adDoc.advertiser_snapshot.platform_page_id = existing.platform_page_id || platformPageId
    }
    return existing._id
  }

  const profileId = new ObjectId()
  const resolvedPageId = platformPageId || fallbackPageId(pageName || 'advertiser')
  const resolvedName = pageName || resolvedPageId

  await profiles.insertOne({
    _id: profileId,
    schema_version: 3,
    platform,
    platform_page_id: String(resolvedPageId),
    page_name: resolvedName,
    display_name: resolvedName,
    profile_url: profileUrl,
    is_verified: false,
    workflow: {
      review_status: 'pending',
      client_status: 'open',
      reviewed_at: null,
    },
    list: {
      risk: null,
      risk_rank: null,
      ad_count: 1,
      reviewed_ad_count: 0,
      max_threat_score: null,
      last_active_at: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
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
  })

  adDoc.advertiser_snapshot.platform_page_id = String(resolvedPageId)
  adDoc.advertiser_snapshot.page_name = resolvedName
  return profileId
}
