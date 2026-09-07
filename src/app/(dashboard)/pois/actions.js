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
  buildPoiAigcPostMatch,
  compareAigcPosts,
  isAigcPost,
  resolvePoiDateRange,
  serializePoiForClient,
  normalizePoiNameKey,
  isPoiMerged,
  parentPoiFilter,
  poiTextSearchOr,
  mergeAliasFieldsIntoParent,
  uniquePoiStrings,
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

function escapeSearchRe(raw) {
  return new RegExp(String(raw || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
}

async function parentIdsFromAliasSearch(collection, re) {
  const aliasHits = await collection
    .find(
      {
        status: 'merged',
        $or: poiTextSearchOr(re),
      },
      { projection: { merged_into: 1, merged_into_name: 1 } }
    )
    .limit(200)
    .toArray()

  const ids = []
  const names = []
  const seenIds = new Set()
  const seenNames = new Set()
  for (const hit of aliasHits) {
    if (hit.merged_into) {
      const key = hit.merged_into.toString()
      if (!seenIds.has(key)) {
        seenIds.add(key)
        ids.push(hit.merged_into)
      }
    }
    const name = String(hit.merged_into_name || '').trim()
    if (name && !seenNames.has(name)) {
      seenNames.add(name)
      names.push(name)
    }
  }
  return { ids, names }
}

async function linkedAliasesForParent(collection, poi) {
  if (!poi?._id || isPoiMerged(poi)) return []
  const docs = await collection
    .find(
      {
        _id: { $ne: poi._id },
        $or: [
          { merged_into: poi._id },
          ...(poi.name ? [{ merged_into_name: poi.name }] : []),
        ],
      },
      { projection: { name: 1, display_name: 1 } }
    )
    .sort({ display_name: 1 })
    .toArray()

  return docs.map((doc) => ({
    _id: doc._id.toString(),
    name: doc.name || '',
    display_name: doc.display_name || doc.name || '',
  }))
}

async function serializeSignedPoi(doc, extra = {}) {
  return serializePoiForClient(doc, {
    signedImageUrl: await signPoiImage(doc),
    ...extra,
  })
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

    const query = parentPoiFilter()

    if (tier && tier !== 'all' && POI_TIERS.includes(tier)) {
      query.tier = tier
    }

    if (search && String(search).trim()) {
      const re = escapeSearchRe(search)
      const { ids: aliasParentIds, names: aliasParentNames } = await parentIdsFromAliasSearch(collection, re)
      query.$or = [
        ...poiTextSearchOr(re),
        ...(aliasParentIds.length ? [{ _id: { $in: aliasParentIds } }] : []),
        ...(aliasParentNames.length ? [{ name: { $in: aliasParentNames } }] : []),
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

    const pois = await Promise.all(docs.map((doc) => serializeSignedPoi(doc)))

    const tierCounts = await collection
      .aggregate([
        { $match: parentPoiFilter() },
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
    const collection = poisCollection(client.db(dbName))
    const doc = await collection.findOne({ _id: oid })
    if (!doc) return { poi: null, error: 'POI not found' }

    const linkedAliases = await linkedAliasesForParent(collection, doc)
    return {
      poi: await serializeSignedPoi(doc, { linkedAliases }),
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

async function serializePoiPostCard(post) {
  const s3Url = getFirstMediaS3Url(post)
  let signedImageUrl = null
  if (s3Url) {
    try {
      signedImageUrl = await getSignedImageUrl(s3Url)
    } catch {
      signedImageUrl = null
    }
  }
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
    is_aigc: isAigcPost(post),
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
}

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

    const posts = await Promise.all(docs.map(serializePoiPostCard))

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

export const getPoiAigcPosts = traceAction('getPoiAigcPosts', async (poiId, range = {}, limit = 60) => {
  try {
    const { dbName } = await requireAuthContext()
    const oid = parseObjectId(poiId)
    if (!oid) return { posts: [], error: 'Invalid POI id' }

    const client = await clientPromise
    const db = client.db(dbName)
    const poi = await poisCollection(db).findOne({ _id: oid })
    if (!poi) return { posts: [], error: 'POI not found' }

    const { from, to } = resolvePoiDateRange(range)
    const match = buildPoiAigcPostMatch(poi, { from, to })
    const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), 60)
    const fetchCap = Math.min(safeLimit * 2, 120)

    const docs = await postsCollection(db)
      .find(match)
      .sort({ 'list.sourced_at': -1 })
      .limit(fetchCap)
      .toArray()

    docs.sort(compareAigcPosts)
    const posts = await Promise.all(docs.slice(0, safeLimit).map(serializePoiPostCard))

    return { posts }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.profiles,
      app_action: 'getPoiAigcPosts',
      message: 'pois.getPoiAigcPosts failed',
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
    const collection = poisCollection(client.db(dbName))
    const existing = await collection.findOne({ _id: oid })
    if (!existing) return { success: false, error: 'POI not found' }
    if (isPoiMerged(existing)) {
      return { success: false, error: 'Merged alias POIs cannot be edited. Open the parent POI instead.' }
    }

    const result = await collection.updateOne(
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
    if (isPoiMerged(existing)) {
      return { success: false, error: 'Merged alias POIs cannot be edited. Open the parent POI instead.' }
    }

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
    const linkedAliases = await linkedAliasesForParent(collection, updated)
    return {
      success: true,
      poi: await serializeSignedPoi(updated, { linkedAliases }),
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
    const exists = await poisCollection(client.db(dbName)).findOne({ _id: oid }, { projection: { _id: 1, status: 1, merged_into: 1, merged_into_name: 1 } })
    if (!exists) return { success: false, error: 'POI not found' }
    if (isPoiMerged(exists)) {
      return { success: false, error: 'Merged alias POIs cannot be edited. Open the parent POI instead.' }
    }

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
    const existing = await collection.findOne({ _id: oid })
    if (!existing) return { success: false, error: 'POI not found' }
    if (isPoiMerged(existing)) {
      return { success: false, error: 'Merged alias POIs cannot be edited. Open the parent POI instead.' }
    }

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
    const linkedAliases = await linkedAliasesForParent(collection, updated)
    return {
      success: true,
      poi: await serializeSignedPoi(updated, { linkedAliases }),
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

export const searchPoisForConnect = traceAction('searchPoisForConnect', async ({
  query = '',
  excludeId = null,
  limit = 20,
} = {}) => {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const client = await clientPromise
    const collection = poisCollection(client.db(dbName))
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 30)
    const excludeOid = parseObjectId(excludeId)

    const filter = parentPoiFilter()
    if (excludeOid) filter._id = { $ne: excludeOid }

    const trimmed = String(query || '').trim()
    if (trimmed) {
      const re = escapeSearchRe(trimmed)
      const { ids: aliasParentIds, names: aliasParentNames } = await parentIdsFromAliasSearch(collection, re)
      filter.$or = [
        ...poiTextSearchOr(re),
        ...(aliasParentIds.length ? [{ _id: { $in: aliasParentIds } }] : []),
        ...(aliasParentNames.length ? [{ name: { $in: aliasParentNames } }] : []),
      ]
    }

    const docs = await collection
      .find(filter, {
        projection: {
          name: 1,
          display_name: 1,
          tier: 1,
          post_count: 1,
          meta: 1,
          image: 1,
          alias_poi_names: 1,
        },
      })
      .sort({ post_count: -1, display_name: 1 })
      .limit(safeLimit)
      .toArray()

    const pois = await Promise.all(docs.map((doc) => serializeSignedPoi(doc)))
    return { pois }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.profiles,
      app_action: 'searchPoisForConnect',
      message: 'pois.searchPoisForConnect failed',
    }, e)
    return { pois: [], error: e.message }
  }
})

export const connectPoiAsAlias = traceAction('connectPoiAsAlias', async (aliasId, parentId) => {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const aliasOid = parseObjectId(aliasId)
    const parentOid = parseObjectId(parentId)
    if (!aliasOid || !parentOid) return { success: false, error: 'Invalid POI id' }
    if (aliasOid.equals(parentOid)) {
      return { success: false, error: 'Choose two different POIs' }
    }

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = poisCollection(db)

    const [alias, parent] = await Promise.all([
      collection.findOne({ _id: aliasOid }),
      collection.findOne({ _id: parentOid }),
    ])
    if (!alias || !parent) return { success: false, error: 'POI not found' }
    if (isPoiMerged(parent)) {
      return { success: false, error: 'Parent must be a canonical POI, not an alias' }
    }
    if (isPoiMerged(alias)) {
      return { success: false, error: 'That POI is already an alias of another parent' }
    }

    const parentName = parent.name || normalizePoiNameKey(parent.display_name)
    if (!parentName) return { success: false, error: 'Parent POI is missing a name key' }

    const children = await collection
      .find({
        _id: { $nin: [aliasOid, parentOid] },
        $or: [
          { merged_into: aliasOid },
          ...(alias.name ? [{ merged_into_name: alias.name }] : []),
        ],
      })
      .toArray()

    const subtree = [alias, ...children]
    let working = { ...parent }
    for (const node of subtree) {
      working = { ...working, ...mergeAliasFieldsIntoParent(working, node) }
    }

    const parentNameKey = normalizePoiNameKey(parentName)
    working.alias_poi_names = uniquePoiStrings(
      (working.alias_poi_names || []).filter((n) => normalizePoiNameKey(n) !== parentNameKey)
    )

    const now = new Date()
    const parentSet = {
      summary: working.summary || '',
      image: working.image || { s3_url: null, s3_key: null },
      meta: working.meta || { title: '', organization: '', state: '', notes: '' },
      aliases: working.aliases || [],
      topics: working.topics || [],
      topic_count: working.topic_count || 0,
      alias_poi_names: working.alias_poi_names,
      updated_at: now,
    }

    const match = buildPoiPostMatch({ ...parent, ...parentSet })
    parentSet.post_count = await postsCollection(db).countDocuments(match)

    await collection.updateOne({ _id: parentOid }, { $set: parentSet })
    await collection.updateMany(
      { _id: { $in: subtree.map((n) => n._id) } },
      {
        $set: {
          status: 'merged',
          merged_into: parentOid,
          merged_into_name: parentName,
          alias_poi_names: [],
          updated_at: now,
        },
      }
    )

    const updated = await collection.findOne({ _id: parentOid })
    const linkedAliases = await linkedAliasesForParent(collection, updated)
    return {
      success: true,
      poi: await serializeSignedPoi(updated, { linkedAliases }),
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.profiles,
      app_action: 'connectPoiAsAlias',
      message: 'pois.connectPoiAsAlias failed',
    }, e)
    return { success: false, error: e.message }
  }
})
