'use server'

import { format } from 'date-fns'
import { ObjectId } from 'mongodb'
import { postsCollection } from '@/utils/mongodb/collections'
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
import { buildPoiTopicsGraph } from '@/lib/feeds/build-poi-topics-graph'
import { poisCollection, topicsCollection } from '@/utils/mongodb/collections'
import { toPostObjectIds } from '@/lib/feeds/resolve-feed-posts'

const FEED_LOG = { loki_stream: LOKI_STREAMS.cases }

function formatHistogramRows(rows = []) {
  return rows.map((row) => {
    const date = row._id instanceof Date ? row._id : new Date(row._id)
    const isoDay = date.toISOString().slice(0, 10)
    return {
      date: isoDay,
      count: row.count,
      label: format(date, 'MMM d, yyyy'),
    }
  })
}

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

/** POI → Topics graph for the feeds nexus map (live MongoDB data). */
export async function getPoiTopicsGraph() {
  try {
    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)

    const [topics, pois] = await Promise.all([
      topicsCollection(db)
        .find({}, {
          projection: {
            _id: 1,
            topic_id: 1,
            title: 1,
            category: 1,
            type: 1,
            status: 1,
            parent_topic_id: 1,
            post_count: 1,
            poi_names: 1,
          },
        })
        .toArray(),
      poisCollection(db)
        .find({}, { projection: { display_name: 1, name: 1, post_count: 1 } })
        .toArray(),
    ])

    return buildPoiTopicsGraph({ topics, pois })
  } catch (e) {
    logActionError({ ...FEED_LOG, app_action: 'getPoiTopicsGraph', message: 'getPoiTopicsGraph failed' }, e)
    console.error('getPoiTopicsGraph Error:', e)
    return buildPoiTopicsGraph({ topics: [], pois: [] })
  }
}

/** Lightweight feed count for subnav badge. */
export async function countFeeds() {
  try {
    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    return await client.db(dbName).collection(FEEDS_COLLECTION).countDocuments()
  } catch (e) {
    logActionError({ ...FEED_LOG, app_action: 'countFeeds', message: 'countFeeds failed' }, e)
    console.error('countFeeds Error:', e)
    return 0
  }
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

    const facetResult = await postsCollection(ctx.db).aggregate(pipeline).toArray()
    const posts = facetResult?.[0]?.data || []
    const totalCount = facetResult?.[0]?.total?.[0]?.total || 0
    const processedPosts = await Promise.all(posts.map((post) => normalizeS3Post(post, ctx.db)))

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

    const docs = await postsCollection(ctx.db).aggregate(pipeline).toArray()
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

    const rows = await postsCollection(ctx.db).aggregate(pipeline).toArray()
    return formatHistogramRows(rows)
  } catch (e) {
    logActionError({ ...FEED_LOG, app_action: 'getFeedPublishingHistogram', message: 'getFeedPublishingHistogram failed' }, e)
    console.error('getFeedPublishingHistogram Error:', e)
    return []
  }
}

/** Paginated posts for a topic (graph detail panel). */
export async function getTopicPosts(
  topicId,
  page = 1,
  limit = 25,
  sort = { field: 'published_date', direction: 'desc' }
) {
  try {
    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)

    const topic = await topicsCollection(db).findOne(
      { topic_id: topicId },
      {
        projection: {
          topic_id: 1,
          title: 1,
          narrative: 1,
          category: 1,
          type: 1,
          post_count: 1,
          posts: 1,
        },
      }
    )

    if (!topic) {
      return { topic: null, posts: [], totalCount: 0, page: 1, totalPages: 0, histogram: [] }
    }

    const postObjectIds = toPostObjectIds(Array.isArray(topic.posts) ? topic.posts : [])
    const topicMeta = {
      topic_id: topic.topic_id,
      title: topic.title,
      narrative: topic.narrative,
      category: topic.category,
      topicType: topic.type || 'active',
      post_count: topic.post_count ?? 0,
    }

    if (postObjectIds.length === 0) {
      return { topic: topicMeta, posts: [], totalCount: 0, page, totalPages: 0, histogram: [] }
    }

    const pipeline = buildFeedPostsFacetPipeline(postObjectIds, {}, sort, page, limit)
    const histogramPipeline = buildFeedHistogramPipeline(postObjectIds, {})
    if (!pipeline) {
      return { topic: topicMeta, posts: [], totalCount: 0, page, totalPages: 0, histogram: [] }
    }

    const postsColl = postsCollection(db)
    const [facetResult, histogramRows] = await Promise.all([
      postsColl.aggregate(pipeline).toArray(),
      histogramPipeline ? postsColl.aggregate(histogramPipeline).toArray() : Promise.resolve([]),
    ])
    const posts = facetResult?.[0]?.data || []
    const totalCount = facetResult?.[0]?.total?.[0]?.total || 0
    const processedPosts = await Promise.all(posts.map((post) => normalizeS3Post(post, db)))

    return {
      topic: { ...topicMeta, post_count: topic.post_count ?? totalCount },
      posts: processedPosts,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit) || 0,
      histogram: formatHistogramRows(histogramRows),
    }
  } catch (e) {
    logActionError({ ...FEED_LOG, app_action: 'getTopicPosts', message: 'getTopicPosts failed' }, e)
    console.error('getTopicPosts Error:', e)
    return { topic: null, posts: [], totalCount: 0, page: 1, totalPages: 0, histogram: [] }
  }
}
