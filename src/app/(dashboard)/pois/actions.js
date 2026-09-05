'use server'

import { ObjectId } from 'mongodb'
import clientPromise from '@/utils/mongodb/client'
import { requireAuthContext, requireRole } from '@/utils/auth-context'
import { postsCollection, poisCollection } from '@/utils/mongodb/collections'
import { traceAction } from '@/utils/tracing'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { getSignedImageUrl, getSignedUploadUrl, buildS3PublicUrl, headS3Object } from '@/utils/aws/s3'
import {
  REVIEW_IMAGE_MAX_BYTES,
  validateReviewImageMeta,
  validateS3HeadSize,
  sanitizeUploadFileName,
} from '@/utils/aws/upload-validation'
import {
  buildNormalizedPostForUi,
  getFirstMediaS3Url,
} from '@/utils/mongodb/v3-schema'
import {
  POI_TIERS,
  buildPoiPostMatch,
  resolvePoiDateRange,
  serializePoiForClient,
  normalizePoiNameKey,
} from '@/lib/pois/poi-helpers'

async function signPoiImage(poi) {
  const s3Url = poi?.image?.s3_url
  if (!s3Url) return null
  try {
    return await getSignedImageUrl(s3Url)
  } catch {
    return null
  }
}

function parseObjectId(id) {
  if (!id || !ObjectId.isValid(id)) return null
  return new ObjectId(id)
}

export const getPois = traceAction('getPois', async ({
  tier = 'all',
  search = '',
  page = 1,
  limit = 50,
} = {}) => {
  try {
    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = poisCollection(db)

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
    const safePage = Math.max(Number(page) || 1, 1)
    const skip = (safePage - 1) * safeLimit

    const query = {
      status: { $ne: 'merged' },
      merged_into: null,
    }

    if (tier && tier !== 'all' && POI_TIERS.includes(tier)) {
      query.tier = tier
    }

    if (search && String(search).trim()) {
      const re = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      query.$or = [
        { display_name: re },
        { name: re },
        { aliases: re },
        { 'meta.title': re },
        { summary: re },
      ]
    }

    const [total, docs] = await Promise.all([
      collection.countDocuments(query),
      collection
        .find(query)
        .sort({ post_count: -1, display_name: 1 })
        .skip(skip)
        .limit(safeLimit)
        .toArray(),
    ])

    const pois = await Promise.all(
      docs.map(async (doc) => serializePoiForClient(doc, { signedImageUrl: await signPoiImage(doc) }))
    )

    const tierCounts = await collection
      .aggregate([
        { $match: { status: { $ne: 'merged' }, merged_into: null } },
        { $group: { _id: '$tier', count: { $sum: 1 } } },
      ])
      .toArray()

    const counts = { primary: 0, secondary: 0, other: 0, all: 0 }
    for (const row of tierCounts) {
      const key = POI_TIERS.includes(row._id) ? row._id : 'other'
      counts[key] += row.count
      counts.all += row.count
    }

    return {
      pois,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      tierCounts: counts,
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.profiles,
      app_action: 'getPois',
      message: 'pois.getPois failed',
    }, e)
    console.error('getPois failed', e)
    return {
      pois: [],
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 1,
      tierCounts: { primary: 0, secondary: 0, other: 0, all: 0 },
      error: e.message,
    }
  }
})

export const getPoiById = traceAction('getPoiById', async (poiId) => {
  try {
    const { dbName } = await requireAuthContext()
    const oid = parseObjectId(poiId)
    if (!oid) return { poi: null, error: 'Invalid POI id' }

    const client = await clientPromise
    const doc = await poisCollection(client.db(dbName)).findOne({ _id: oid })
    if (!doc) return { poi: null, error: 'POI not found' }

    return {
      poi: serializePoiForClient(doc, { signedImageUrl: await signPoiImage(doc) }),
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.profiles,
      app_action: 'getPoiById',
      message: 'pois.getPoiById failed',
    }, e)
    return { poi: null, error: e.message }
  }
})

export const getPoiAnalytics = traceAction('getPoiAnalytics', async (poiId, range = {}) => {
  try {
    const { dbName } = await requireAuthContext()
    const oid = parseObjectId(poiId)
    if (!oid) return { error: 'Invalid POI id' }

    const client = await clientPromise
    const db = client.db(dbName)
    const poi = await poisCollection(db).findOne({ _id: oid })
    if (!poi) return { error: 'POI not found' }

    const { from, to, preset } = resolvePoiDateRange(range)
    const match = buildPoiPostMatch(poi, { from, to })
    const posts = postsCollection(db)

    const [platformRows, violationRows, timelineRows, totalInRange] = await Promise.all([
      posts
        .aggregate([
          { $match: match },
          { $group: { _id: '$platform', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),
      posts
        .aggregate([
          { $match: match },
          {
            $project: {
              threats: {
                $cond: [
                  { $gt: [{ $size: { $ifNull: ['$list.threat_types', []] } }, 0] },
                  '$list.threat_types',
                  { $ifNull: ['$review_details.threat_types', []] },
                ],
              },
            },
          },
          { $unwind: { path: '$threats', preserveNullAndEmptyArrays: false } },
          {
            $group: {
              _id: { $toLower: { $trim: { input: { $toString: '$threats' } } } },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 12 },
        ])
        .toArray(),
      posts
        .aggregate([
          { $match: match },
          {
            $project: {
              day: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: { $ifNull: ['$list.posted_at', '$list.sourced_at'] },
                },
              },
            },
          },
          { $match: { day: { $ne: null } } },
          { $group: { _id: '$day', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      posts.countDocuments(match),
    ])

    return {
      preset,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      totalInRange,
      platforms: platformRows.map((r) => ({
        platform: r._id || 'unknown',
        count: r.count,
      })),
      violations: violationRows.map((r) => ({
        type: r._id || 'unknown',
        count: r.count,
      })),
      timeline: timelineRows.map((r) => ({
        date: r._id,
        count: r.count,
      })),
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.profiles,
      app_action: 'getPoiAnalytics',
      message: 'pois.getPoiAnalytics failed',
    }, e)
    return { error: e.message, platforms: [], violations: [], timeline: [], totalInRange: 0 }
  }
})

export const getPoiProfiles = traceAction('getPoiProfiles', async (poiId, range = {}, limit = 20) => {
  try {
    const { dbName } = await requireAuthContext()
    const oid = parseObjectId(poiId)
    if (!oid) return { profiles: [], error: 'Invalid POI id' }

    const client = await clientPromise
    const db = client.db(dbName)
    const poi = await poisCollection(db).findOne({ _id: oid })
    if (!poi) return { profiles: [], error: 'POI not found' }

    const { from, to } = resolvePoiDateRange(range)
    const match = buildPoiPostMatch(poi, { from, to })
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50)

    const rows = await postsCollection(db)
      .aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              profile_id: '$profile_id',
              platform: '$platform',
              username: '$author_snapshot.username',
            },
            posts: { $sum: 1 },
            engagement: { $sum: { $ifNull: ['$list.engagement_score', 0] } },
            display_name: { $first: '$author_snapshot.display_name' },
            username: { $first: '$author_snapshot.username' },
            profile_url: { $first: '$author_snapshot.profile_url' },
            profile_id: { $first: '$profile_id' },
            platform: { $first: '$platform' },
          },
        },
        { $sort: { posts: -1, engagement: -1 } },
        { $limit: safeLimit },
      ])
      .toArray()

    return {
      profiles: rows.map((r) => ({
        profile_id: r.profile_id?.toString?.() ?? r.profile_id ?? null,
        platform: r.platform || 'unknown',
        username: r.username || r.display_name || 'Unknown',
        display_name: r.display_name || r.username || 'Unknown',
        profile_url: r.profile_url || null,
        posts: r.posts || 0,
        engagement: Math.round(r.engagement || 0),
      })),
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.profiles,
      app_action: 'getPoiProfiles',
      message: 'pois.getPoiProfiles failed',
    }, e)
    return { profiles: [], error: e.message }
  }
})

export const getPoiRecentPosts = traceAction('getPoiRecentPosts', async (poiId, range = {}, limit = 12) => {
  try {
    const { dbName } = await requireAuthContext()
    const oid = parseObjectId(poiId)
    if (!oid) return { posts: [], error: 'Invalid POI id' }

    const client = await clientPromise
    const db = client.db(dbName)
    const poi = await poisCollection(db).findOne({ _id: oid })
    if (!poi) return { posts: [], error: 'POI not found' }

    const { from, to } = resolvePoiDateRange(range)
    const match = buildPoiPostMatch(poi, { from, to })
    const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 24)

    const docs = await postsCollection(db)
      .find(match)
      .sort({ 'list.sourced_at': -1 })
      .limit(safeLimit)
      .toArray()

    const posts = await Promise.all(
      docs.map(async (post) => {
        const s3Url = getFirstMediaS3Url(post)
        const signedImageUrl = s3Url ? await getSignedImageUrl(s3Url) : null
        const normalized = buildNormalizedPostForUi(post, { signedImageUrl })
        return {
          _id: normalized._id || post._id?.toString(),
          platform: normalized.platform || post.platform,
          caption: normalized.caption || post.content?.caption || '',
          signedImageUrl,
          original_url: post.original_url || normalized.original_url || null,
          sourced_at: post.list?.sourced_at
            ? new Date(post.list.sourced_at).toISOString()
            : null,
          posted_at: post.list?.posted_at
            ? new Date(post.list.posted_at).toISOString()
            : null,
          threat_types: post.list?.threat_types || post.review_details?.threat_types || [],
          effective_threat_score:
            post.list?.effective_threat_score ??
            post.list?.review_threat_score ??
            post.list?.ai_threat_score ??
            normalized.score ??
            null,
          author: {
            username: post.author_snapshot?.username || normalized.user?.username || null,
            display_name: post.author_snapshot?.display_name || normalized.user?.full_name || null,
          },
        }
      })
    )

    return { posts }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.profiles,
      app_action: 'getPoiRecentPosts',
      message: 'pois.getPoiRecentPosts failed',
    }, e)
    return { posts: [], error: e.message }
  }
})

export const updatePoiTier = traceAction('updatePoiTier', async (poiId, tier) => {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const oid = parseObjectId(poiId)
    if (!oid) return { success: false, error: 'Invalid POI id' }
    if (!POI_TIERS.includes(tier)) return { success: false, error: 'Invalid tier' }

    const client = await clientPromise
    const result = await poisCollection(client.db(dbName)).updateOne(
      { _id: oid },
      { $set: { tier, updated_at: new Date() } }
    )

    if (result.matchedCount === 0) return { success: false, error: 'POI not found' }
    return { success: true }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.profiles,
      app_action: 'updatePoiTier',
      message: 'pois.updatePoiTier failed',
    }, e)
    return { success: false, error: e.message }
  }
})

export const updatePoi = traceAction('updatePoi', async (poiId, payload = {}) => {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const oid = parseObjectId(poiId)
    if (!oid) return { success: false, error: 'Invalid POI id' }

    const client = await clientPromise
    const collection = poisCollection(client.db(dbName))
    const existing = await collection.findOne({ _id: oid })
    if (!existing) return { success: false, error: 'POI not found' }

    const setFields = { updated_at: new Date() }

    if (typeof payload.summary === 'string') {
      setFields.summary = payload.summary.slice(0, 8000)
    }

    if (payload.tier && POI_TIERS.includes(payload.tier)) {
      setFields.tier = payload.tier
    }

    if (typeof payload.display_name === 'string' && payload.display_name.trim()) {
      const displayName = payload.display_name.trim().slice(0, 200)
      setFields.display_name = displayName
      // Keep name key stable unless explicitly empty/missing historically
      if (!existing.name) {
        setFields.name = normalizePoiNameKey(displayName)
      }
    }

    if (payload.meta && typeof payload.meta === 'object') {
      setFields.meta = {
        title: String(payload.meta.title || '').slice(0, 300),
        organization: String(payload.meta.organization || '').slice(0, 300),
        state: String(payload.meta.state || '').slice(0, 120),
        notes: String(payload.meta.notes || '').slice(0, 4000),
      }
    }

    if (Array.isArray(payload.aliases)) {
      const seen = new Set()
      const aliases = []
      for (const raw of payload.aliases) {
        const s = String(raw || '').trim().slice(0, 200)
        if (!s) continue
        const key = s.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        aliases.push(s)
        if (aliases.length >= 50) break
      }
      setFields.aliases = aliases
    }

    await collection.updateOne({ _id: oid }, { $set: setFields })
    const updated = await collection.findOne({ _id: oid })
    return {
      success: true,
      poi: serializePoiForClient(updated, { signedImageUrl: await signPoiImage(updated) }),
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.profiles,
      app_action: 'updatePoi',
      message: 'pois.updatePoi failed',
    }, e)
    return { success: false, error: e.message }
  }
})

export const initPoiImageUpload = traceAction('initPoiImageUpload', async (poiId, fileMeta) => {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const oid = parseObjectId(poiId)
    if (!oid) return { success: false, error: 'Invalid POI id' }

    const { fileName, contentType, fileSize } = fileMeta || {}
    const validationError = validateReviewImageMeta({ contentType, fileSize })
    if (validationError) return { success: false, error: validationError }

    const client = await clientPromise
    const exists = await poisCollection(client.db(dbName)).findOne({ _id: oid }, { projection: { _id: 1 } })
    if (!exists) return { success: false, error: 'POI not found' }

    const sanitizedFileName = sanitizeUploadFileName(fileName)
    const s3Key = `poi-images/${dbName}/${poiId}/${Date.now()}-${sanitizedFileName}`
    const s3Url = buildS3PublicUrl(s3Key)
    const uploadUrl = await getSignedUploadUrl(s3Key, contentType)

    return { success: true, uploadUrl, s3Key, s3Url }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.profiles,
      app_action: 'initPoiImageUpload',
      message: 'pois.initPoiImageUpload failed',
    }, e)
    return { success: false, error: e.message }
  }
})

export const confirmPoiImageUpload = traceAction('confirmPoiImageUpload', async (poiId, uploadMeta) => {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const oid = parseObjectId(poiId)
    if (!oid) return { success: false, error: 'Invalid POI id' }

    const { s3Key, s3Url, contentType } = uploadMeta || {}
    if (!s3Key || !s3Url || !contentType) {
      return { success: false, error: 'Missing upload metadata' }
    }

    const expectedPrefix = `poi-images/${dbName}/${poiId}/`
    if (!s3Key.startsWith(expectedPrefix)) {
      return { success: false, error: 'Invalid upload key' }
    }

    const head = await headS3Object(s3Key)
    if (!head) return { success: false, error: 'Upload not found in S3' }

    const sizeError = validateS3HeadSize(head, REVIEW_IMAGE_MAX_BYTES)
    if (sizeError) return { success: false, error: sizeError }

    const client = await clientPromise
    const collection = poisCollection(client.db(dbName))
    const result = await collection.updateOne(
      { _id: oid },
      {
        $set: {
          image: { s3_url: s3Url, s3_key: s3Key },
          updated_at: new Date(),
        },
      }
    )
    if (result.matchedCount === 0) return { success: false, error: 'POI not found' }

    const updated = await collection.findOne({ _id: oid })
    return {
      success: true,
      poi: serializePoiForClient(updated, { signedImageUrl: await signPoiImage(updated) }),
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.profiles,
      app_action: 'confirmPoiImageUpload',
      message: 'pois.confirmPoiImageUpload failed',
    }, e)
    return { success: false, error: e.message }
  }
})
