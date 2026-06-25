'use server'

import { format } from 'date-fns'
import { ObjectId } from 'mongodb'
import clientPromise from '@/utils/mongodb/client'
import { requireAuthContext } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { FEEDS_COLLECTION, serializeFeed } from '@/lib/feeds/feed-schema'
import { parseFeedSlugParam } from '@/lib/feeds/feed-slug'
import {
  resolveFeedPostObjectIds,
  buildFeedPostsFacetPipeline,
  buildFeedPostIdsPipeline,
  buildFeedHistogramPipeline,
} from '@/lib/feeds/resolve-feed-posts'
import { normalizeS3Post } from '@/lib/posts/pipeline-helpers'

const FEED_LOG = { loki_stream: LOKI_STREAMS.cases }

async function loadFeedContextById(feedId) {
  let objectId
  try {
    objectId = new ObjectId(feedId)
  } catch {
    return null
  }

  const { dbName } = await requireAuthContext()
  const client = await clientPromise
  const db = client.db(dbName)
  const feed = await db.collection(FEEDS_COLLECTION).findOne({ _id: objectId })
  if (!feed) return null

  const postObjectIds = await resolveFeedPostObjectIds(db, feed)
  return { db, feed, postObjectIds }
}

async function loadFeedContext(feedParam) {
  if (!feedParam) return null

  const parsed = parseFeedSlugParam(feedParam)

  if (parsed.fullId) {
    return loadFeedContextById(parsed.fullId)
  }

  if (parsed.suffix) {
    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)
    const feeds = await db.collection(FEEDS_COLLECTION).find({}).toArray()
    const matches = feeds.filter((f) =>
      f._id.toString().toLowerCase().endsWith(parsed.suffix)
    )

    if (matches.length === 0) return null

    let feed = matches[0]
    if (matches.length > 1) {
      const slugPrefix = feedParam.slice(0, -(parsed.suffix.length + 1)).toLowerCase()
      const narrowed = matches.filter((f) => {
        const serialized = serializeFeed(f)
        return serialized.slug?.toLowerCase().startsWith(slugPrefix)
      })
      if (narrowed.length === 1) feed = narrowed[0]
    }

    const postObjectIds = await resolveFeedPostObjectIds(db, feed)
    return { db, feed, postObjectIds }
  }

  return loadFeedContextById(feedParam)
}

/** All feeds visible to project users (read-only index). */
export async function listFeedsForClient() {
  try {
    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const feeds = await client
      .db(dbName)
      .collection(FEEDS_COLLECTION)
      .find({}, { projection: { update_history: 0 } })
      .sort({ updated_at: -1 })
      .toArray()

    return feeds.map(serializeFeed)
  } catch (e) {
    logActionError({ ...FEED_LOG, app_action: 'listFeedsForClient', message: 'listFeedsForClient failed' }, e)
    console.error('listFeedsForClient Error:', e)
    return []
  }
}

/** Single feed metadata for page header / routing. */
export async function getFeedById(feedId) {
  try {
    const ctx = await loadFeedContext(feedId)
    if (!ctx) return null
    return serializeFeed(ctx.feed)
  } catch (e) {
    logActionError({ ...FEED_LOG, app_action: 'getFeedById', message: 'getFeedById failed' }, e)
    console.error('getFeedById Error:', e)
    return null
  }
}

/** Paginated, filterable posts for one feed (reviewed-only, cases pipeline). */
export async function getFeedPosts(feedId, page = 1, limit = 25, filters = {}, sort = { field: 'threat_score', direction: 'desc' }) {
  try {
    const ctx = await loadFeedContext(feedId)
    if (!ctx) {
      return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
    }

    if (ctx.postObjectIds.length === 0) {
      return { posts: [], totalCount: 0, page, totalPages: 0 }
    }

    const pipeline = buildFeedPostsFacetPipeline(ctx.postObjectIds, filters, sort, page, limit)
    if (!pipeline) {
      return { posts: [], totalCount: 0, page, totalPages: 0 }
    }

    const facetResult = await ctx.db.collection('Posts').aggregate(pipeline).toArray()
    const posts = facetResult?.[0]?.data || []
    const totalCount = facetResult?.[0]?.total?.[0]?.total || 0
    const processedPosts = await Promise.all(posts.map(normalizeS3Post))

    return {
      posts: processedPosts,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit) || 0,
    }
  } catch (e) {
    logActionError({ ...FEED_LOG, app_action: 'getFeedPosts', message: 'getFeedPosts failed' }, e)
    console.error('getFeedPosts Error:', e)
    return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
  }
}

/** All matching post ids in a feed (for select-all + report export). */
export async function getFeedPostIds(feedId, filters = {}) {
  try {
    const ctx = await loadFeedContext(feedId)
    if (!ctx || ctx.postObjectIds.length === 0) return []

    const pipeline = buildFeedPostIdsPipeline(ctx.postObjectIds, filters)
    if (!pipeline) return []

    const docs = await ctx.db.collection('Posts').aggregate(pipeline).toArray()
    return docs.map((d) => d._id.toString())
  } catch (e) {
    logActionError({ ...FEED_LOG, app_action: 'getFeedPostIds', message: 'getFeedPostIds failed' }, e)
    console.error('getFeedPostIds Error:', e)
    return []
  }
}

/** Publishing-date histogram buckets for chart (one bar per day). */
export async function getFeedPublishingHistogram(feedId, filters = {}) {
  try {
    const ctx = await loadFeedContext(feedId)
    if (!ctx || ctx.postObjectIds.length === 0) return []

    const pipeline = buildFeedHistogramPipeline(ctx.postObjectIds, filters)
    if (!pipeline) return []

    const rows = await ctx.db.collection('Posts').aggregate(pipeline).toArray()
    return rows.map((row) => {
      const date = row._id instanceof Date ? row._id : new Date(row._id)
      const isoDay = date.toISOString().slice(0, 10)
      return {
        date: isoDay,
        count: row.count,
        label: format(date, 'MMM d, yyyy'),
      }
    })
  } catch (e) {
    logActionError({ ...FEED_LOG, app_action: 'getFeedPublishingHistogram', message: 'getFeedPublishingHistogram failed' }, e)
    console.error('getFeedPublishingHistogram Error:', e)
    return []
  }
}
