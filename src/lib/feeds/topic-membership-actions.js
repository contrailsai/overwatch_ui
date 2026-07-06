'use server'

import { ObjectId } from 'mongodb'
import clientPromise from '@/utils/mongodb/client'
import { requireRole } from '@/utils/auth-context'
import { logActionError, logActionWarn, LOKI_STREAMS } from '@/utils/otel-logger'
import { TOPICS_COLLECTION, serializeTopicOption } from '@/lib/feeds/feed-schema'
import { postsCollection } from '@/utils/mongodb/collections'
import {
  allocateNextTopicId,
  getPostHexId,
  getPostPostedAt,
  movePostToTopic,
  removePostFromAllTopics,
} from '@/lib/feeds/topic-membership'

const TOPIC_LOG = { loki_stream: LOKI_STREAMS.review_cases }

/** Return the topic a post currently belongs to (single-topic model). */
export async function getTopicForPost(postId) {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const hexId = getPostHexId(postId)
    if (!hexId) return { success: true, topic: null }

    const client = await clientPromise
    const collection = client.db(dbName).collection(TOPICS_COLLECTION)

    const matches = await collection
      .find(
        { posts: hexId },
        { projection: { topic_id: 1, title: 1, post_count: 1, first_posted_at: 1, last_posted_at: 1, posts: 1 } }
      )
      .limit(2)
      .toArray()

    if (matches.length > 1) {
      logActionWarn({
        ...TOPIC_LOG,
        app_action: 'getTopicForPost',
        message: 'Post belongs to multiple topics; returning first match',
        post_id: hexId,
      })
    }

    return {
      success: true,
      topic: matches[0] ? serializeTopicOption(matches[0]) : null,
    }
  } catch (e) {
    logActionError({ ...TOPIC_LOG, app_action: 'getTopicForPost', message: 'getTopicForPost failed' }, e)
    console.error('getTopicForPost Error:', e)
    return { success: false, error: e.message || 'Failed to load topic.', topic: null }
  }
}

/** Batch lookup — one round trip for many posts (e.g. current review-cases page). */
export async function getTopicsForPosts(postIds) {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const idEntries = (postIds || [])
      .map((id) => ({ inputId: String(id), hexId: getPostHexId(id) }))
      .filter((entry) => entry.hexId)

    if (idEntries.length === 0) {
      return { success: true, topicsByPostId: {} }
    }

    const hexIds = [...new Set(idEntries.map((entry) => entry.hexId))]
    const client = await clientPromise
    const collection = client.db(dbName).collection(TOPICS_COLLECTION)

    const topics = await collection
      .find(
        { posts: { $in: hexIds } },
        { projection: { topic_id: 1, title: 1, post_count: 1, first_posted_at: 1, last_posted_at: 1, posts: 1 } }
      )
      .toArray()

    const hexToTopic = new Map()
    for (const topic of topics) {
      const serialized = serializeTopicOption(topic)
      for (const postHex of topic.posts || []) {
        const hex = String(postHex).toLowerCase()
        if (hexIds.includes(hex) && !hexToTopic.has(hex)) {
          hexToTopic.set(hex, serialized)
        }
      }
    }

    const topicsByPostId = {}
    for (const { inputId, hexId } of idEntries) {
      topicsByPostId[inputId] = hexToTopic.get(hexId) ?? null
    }

    return { success: true, topicsByPostId }
  } catch (e) {
    logActionError({ ...TOPIC_LOG, app_action: 'getTopicsForPosts', message: 'getTopicsForPosts failed' }, e)
    console.error('getTopicsForPosts Error:', e)
    return { success: false, error: e.message || 'Failed to load topics.', topicsByPostId: {} }
  }
}

/** Move a post to an existing topic (removes from any prior topic). */
export async function assignPostToTopic(postId, topicId) {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const hexId = getPostHexId(postId)
    if (!hexId) return { success: false, error: 'Invalid post id.' }
    if (!topicId) return { success: false, error: 'Topic is required.' }

    const client = await clientPromise
    const db = client.db(dbName)
    const { topic } = await movePostToTopic(db, hexId, topicId)

    return { success: true, topic: serializeTopicOption(topic) }
  } catch (e) {
    logActionError({ ...TOPIC_LOG, app_action: 'assignPostToTopic', message: 'assignPostToTopic failed' }, e)
    console.error('assignPostToTopic Error:', e)
    return { success: false, error: e.message || 'Failed to assign topic.' }
  }
}

/** Create a new topic containing only this post. */
export async function createTopicForPost({ title, postId }) {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const trimmedTitle = (title || '').trim()
    if (!trimmedTitle) return { success: false, error: 'A topic title is required.' }

    const hexId = getPostHexId(postId)
    if (!hexId) return { success: false, error: 'Invalid post id.' }

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = db.collection(TOPICS_COLLECTION)

    const postDoc = await postsCollection(db).findOne(
      { _id: new ObjectId(hexId) },
      { projection: { 'engagement.posted_at': 1, 'metadata.posted_date': 1, posted_date: 1 } }
    )
    if (!postDoc) return { success: false, error: 'Post not found.' }

    await removePostFromAllTopics(db, hexId)

    const postedAt = getPostPostedAt(postDoc)
    const now = new Date()
    const topicId = await allocateNextTopicId(db)

    const doc = {
      topic_id: topicId,
      title: trimmedTitle,
      posts: [hexId],
      post_count: 1,
      first_posted_at: postedAt || now,
      last_posted_at: postedAt || now,
      imported_at: now,
      source: 'review-cases',
    }

    await collection.insertOne(doc)

    return { success: true, topic: serializeTopicOption(doc) }
  } catch (e) {
    logActionError({ ...TOPIC_LOG, app_action: 'createTopicForPost', message: 'createTopicForPost failed' }, e)
    console.error('createTopicForPost Error:', e)
    return { success: false, error: e.message || 'Failed to create topic.' }
  }
}

/** Remove a post from all topics (unassigned state). */
export async function clearPostTopic(postId) {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const hexId = getPostHexId(postId)
    if (!hexId) return { success: false, error: 'Invalid post id.' }

    const client = await clientPromise
    await removePostFromAllTopics(client.db(dbName), hexId)

    return { success: true, topic: null }
  } catch (e) {
    logActionError({ ...TOPIC_LOG, app_action: 'clearPostTopic', message: 'clearPostTopic failed' }, e)
    console.error('clearPostTopic Error:', e)
    return { success: false, error: e.message || 'Failed to clear topic.' }
  }
}
