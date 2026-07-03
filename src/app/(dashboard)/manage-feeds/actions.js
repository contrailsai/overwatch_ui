'use server'

import { revalidatePath } from 'next/cache'
import { ObjectId } from 'mongodb'
import clientPromise from '@/utils/mongodb/client'
import { requireRole } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import {
  FEEDS_COLLECTION,
  TOPICS_COLLECTION,
  serializeFeed,
  serializeTopicOption,
  sanitizeStringArray,
  escapeRegex,
} from '@/lib/feeds/feed-schema'
import { getSemanticSearchPosts, getPosts, getPostsByIds } from '../cases/actions'
import { parsePostSearchDork, hasStructuredPostFilters } from '@/lib/feeds/post-search-dork'

const FEED_LOG = { loki_stream: LOKI_STREAMS.cases }

const clampLimit = (value, fallback, max) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.floor(n), max)
}

/** List all feeds for the project (reviewer management view). */
export async function listFeeds() {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const client = await clientPromise
    const collection = client.db(dbName).collection(FEEDS_COLLECTION)

    const feeds = await collection
      .find({}, { projection: { update_history: 0 } })
      .sort({ updated_at: -1 })
      .toArray()

    return feeds.map(serializeFeed)
  } catch (e) {
    logActionError({ ...FEED_LOG, app_action: 'listFeeds', message: 'listFeeds failed' }, e)
    console.error('listFeeds Error:', e)
    return []
  }
}

/** Fetch a single feed with hydrated topics + manually-added posts (for the editor). */
export async function getFeed(feedId) {
  try {
    if (!feedId) return null
    const { dbName } = await requireRole(['reviewer'])
    const client = await clientPromise
    const db = client.db(dbName)

    let objectId
    try {
      objectId = new ObjectId(feedId)
    } catch {
      return null
    }

    const feed = await db.collection(FEEDS_COLLECTION).findOne({ _id: objectId })
    if (!feed) return null

    const serialized = serializeFeed(feed)

    // Hydrate topics for display (title + counts).
    let topics = []
    if (serialized.topic_ids.length > 0) {
      const topicDocs = await db
        .collection(TOPICS_COLLECTION)
        .find(
          { topic_id: { $in: serialized.topic_ids } },
          { projection: { topic_id: 1, title: 1, post_count: 1, first_posted_at: 1, last_posted_at: 1, posts: 1, source: 1 } }
        )
        .toArray()
      topics = topicDocs.map(serializeTopicOption)
    }

    // Hydrate manually-added posts (reviewed-only, normalized + S3 signed).
    let manualPosts = []
    if (serialized.manual_post_ids.length > 0) {
      const res = await getPostsByIds(null, serialized.manual_post_ids)
      manualPosts = Array.isArray(res?.posts) ? res.posts : []
    }

    return { ...serialized, topics, manualPosts }
  } catch (e) {
    logActionError({ ...FEED_LOG, app_action: 'getFeed', message: 'getFeed failed' }, e)
    console.error('getFeed Error:', e)
    return null
  }
}

/** Create a new feed. */
export async function createFeed(input = {}) {
  try {
    const { dbName, clientDetails } = await requireRole(['reviewer'])

    const title = (input.title || '').trim()
    if (!title) return { success: false, error: 'A feed title is required.' }

    const now = new Date()
    const doc = {
      title,
      description: (input.description || '').trim(),
      topic_ids: sanitizeStringArray(input.topic_ids),
      manual_post_ids: sanitizeStringArray(input.manual_post_ids),
      cover_image_url: input.cover_image_url || null,
      created_by: clientDetails.email,
      created_at: now,
      updated_at: now,
      update_history: [
        { updated_at: now, updated_by: clientDetails.email, changes_summary: 'feed created' },
      ],
    }

    const client = await clientPromise
    const result = await client.db(dbName).collection(FEEDS_COLLECTION).insertOne(doc)

    revalidatePath('/manage-feeds')
    return { success: true, feedId: result.insertedId.toString() }
  } catch (e) {
    logActionError({ ...FEED_LOG, app_action: 'createFeed', message: 'createFeed failed' }, e)
    console.error('createFeed Error:', e)
    return { success: false, error: e.message || 'Failed to create feed.' }
  }
}

/** Update an existing feed. */
export async function updateFeed(feedId, input = {}) {
  try {
    if (!feedId) return { success: false, error: 'Missing feed id.' }
    const { dbName, clientDetails } = await requireRole(['reviewer'])

    let objectId
    try {
      objectId = new ObjectId(feedId)
    } catch {
      return { success: false, error: 'Invalid feed id.' }
    }

    const title = (input.title || '').trim()
    if (!title) return { success: false, error: 'A feed title is required.' }

    const now = new Date()
    const setFields = {
      title,
      description: (input.description || '').trim(),
      topic_ids: sanitizeStringArray(input.topic_ids),
      manual_post_ids: sanitizeStringArray(input.manual_post_ids),
      updated_at: now,
    }
    if ('cover_image_url' in input) {
      setFields.cover_image_url = input.cover_image_url || null
    }

    const client = await clientPromise
    const result = await client.db(dbName).collection(FEEDS_COLLECTION).updateOne(
      { _id: objectId },
      {
        $set: setFields,
        $push: {
          update_history: {
            updated_at: now,
            updated_by: clientDetails.email,
            changes_summary: 'feed updated',
          },
        },
      }
    )

    if (result.matchedCount === 0) {
      return { success: false, error: 'Feed not found.' }
    }

    revalidatePath('/manage-feeds')
    return { success: true }
  } catch (e) {
    logActionError({ ...FEED_LOG, app_action: 'updateFeed', message: 'updateFeed failed' }, e)
    console.error('updateFeed Error:', e)
    return { success: false, error: e.message || 'Failed to update feed.' }
  }
}

/** Delete a feed. */
export async function deleteFeed(feedId) {
  try {
    if (!feedId) return { success: false, error: 'Missing feed id.' }
    const { dbName } = await requireRole(['reviewer'])

    let objectId
    try {
      objectId = new ObjectId(feedId)
    } catch {
      return { success: false, error: 'Invalid feed id.' }
    }

    const client = await clientPromise
    const result = await client.db(dbName).collection(FEEDS_COLLECTION).deleteOne({ _id: objectId })

    if (result.deletedCount === 0) {
      return { success: false, error: 'Feed not found.' }
    }

    revalidatePath('/manage-feeds')
    return { success: true }
  } catch (e) {
    logActionError({ ...FEED_LOG, app_action: 'deleteFeed', message: 'deleteFeed failed' }, e)
    console.error('deleteFeed Error:', e)
    return { success: false, error: e.message || 'Failed to delete feed.' }
  }
}

/** Search topics by title for the feed builder topic picker. */
export async function searchTopics(query = '', limit = 12) {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const client = await clientPromise
    const collection = client.db(dbName).collection(TOPICS_COLLECTION)

    const q = (query || '').trim()
    const filter = q ? { title: { $regex: escapeRegex(q), $options: 'i' } } : {}

    const topics = await collection
      .find(filter, {
        projection: { topic_id: 1, title: 1, post_count: 1, first_posted_at: 1, last_posted_at: 1, posts: 1, source: 1 },
      })
      .sort({ last_posted_at: -1 })
      .limit(clampLimit(limit, 12, 50))
      .toArray()

    return topics.map(serializeTopicOption)
  } catch (e) {
    logActionError({ ...FEED_LOG, app_action: 'searchTopics', message: 'searchTopics failed' }, e)
    console.error('searchTopics Error:', e)
    return []
  }
}

/**
 * Search reviewed posts (text + semantic hybrid) so reviewers can add individual
 * posts to a feed. Reuses the cases-list search pipeline (reviewed-only).
 */
export async function searchPostsForFeed(query = '', limit = 15, extraFilters = {}) {
  try {
    await requireRole(['reviewer'])
    const q = (query || '').trim()
    const { freeText, filters: parsedFilters } = parsePostSearchDork(q)
    const mergedFilters = { ...parsedFilters, ...extraFilters }
    const hasFilters = hasStructuredPostFilters(mergedFilters)
    const hasText = Boolean(freeText)

    if (!hasText && !hasFilters) return []

    const clampedLimit = clampLimit(limit, 15, 40)

    if (hasText) {
      const res = await getSemanticSearchPosts(null, freeText, clampedLimit, mergedFilters)
      return Array.isArray(res?.posts) ? res.posts : []
    }

    const res = await getPosts(null, 1, clampedLimit, mergedFilters)
    return Array.isArray(res?.posts) ? res.posts : []
  } catch (e) {
    logActionError({ ...FEED_LOG, app_action: 'searchPostsForFeed', message: 'searchPostsForFeed failed' }, e)
    console.error('searchPostsForFeed Error:', e)
    return []
  }
}
