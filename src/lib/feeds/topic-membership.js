import { ObjectId } from 'mongodb'
import { postsCollection } from '@/utils/mongodb/collections'
import { TOPICS_COLLECTION } from '@/lib/feeds/feed-schema'
import { toPostObjectIds } from '@/lib/feeds/resolve-feed-posts'

/** Normalize ObjectId or string to a 24-char hex post id. */
export function getPostHexId(postId) {
  if (!postId) return null
  const str = String(postId)
  if (/^[a-fA-F0-9]{24}$/.test(str)) return str.toLowerCase()
  try {
    return new ObjectId(str).toHexString()
  } catch {
    return null
  }
}

/** Read publish date from a raw Posts document. */
export function getPostPostedAt(post) {
  if (!post) return null
  const raw = post.list?.posted_at
    ?? post.engagement?.posted_at
    ?? post.metadata?.posted_date
    ?? post.posted_date
  if (!raw) return null
  const date = raw instanceof Date ? raw : new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Allocate the next T##### topic_id for this project database. */
export async function allocateNextTopicId(db) {
  const collection = db.collection(TOPICS_COLLECTION)
  const topics = await collection
    .find({ topic_id: { $regex: /^T\d+$/ } }, { projection: { topic_id: 1 } })
    .toArray()

  let maxNum = 0
  for (const topic of topics) {
    const num = parseInt(String(topic.topic_id).slice(1), 10)
    if (Number.isFinite(num) && num > maxNum) maxNum = num
  }
  return `T${String(maxNum + 1).padStart(5, '0')}`
}

/** Recompute denormalized stats on a topic from its posts[] and Posts collection. */
export async function recomputeTopicStats(db, topicId) {
  const collection = db.collection(TOPICS_COLLECTION)
  const topic = await collection.findOne({ topic_id: topicId }, { projection: { posts: 1 } })
  if (!topic) return

  const posts = Array.isArray(topic.posts) ? topic.posts : []
  if (posts.length === 0) {
    await collection.updateOne(
      { topic_id: topicId },
      { $set: { post_count: 0, first_posted_at: null, last_posted_at: null } }
    )
    return
  }

  const objectIds = toPostObjectIds(posts)
  const postDocs = objectIds.length > 0
    ? await postsCollection(db)
      .find(
        { _id: { $in: objectIds } },
        { projection: { 'list.posted_at': 1, 'engagement.posted_at': 1, 'metadata.posted_date': 1, posted_date: 1 } }
      )
      .toArray()
    : []

  const dates = postDocs.map(getPostPostedAt).filter(Boolean)
  const firstPostedAt = dates.length > 0
    ? new Date(Math.min(...dates.map((d) => d.getTime())))
    : null
  const lastPostedAt = dates.length > 0
    ? new Date(Math.max(...dates.map((d) => d.getTime())))
    : null

  await collection.updateOne(
    { topic_id: topicId },
    {
      $set: {
        post_count: posts.length,
        first_posted_at: firstPostedAt,
        last_posted_at: lastPostedAt,
      },
    }
  )
}

/** Remove a post from every topic that contains it; recompute affected topic stats. */
export async function removePostFromAllTopics(db, postId) {
  const hexId = getPostHexId(postId)
  if (!hexId) return { affectedTopicIds: [] }

  const collection = db.collection(TOPICS_COLLECTION)
  const containing = await collection
    .find({ posts: hexId }, { projection: { topic_id: 1 } })
    .toArray()
  const affectedTopicIds = containing.map((t) => t.topic_id)

  if (affectedTopicIds.length > 0) {
    await collection.updateMany({ posts: hexId }, { $pull: { posts: hexId } })
    for (const topicId of affectedTopicIds) {
      await recomputeTopicStats(db, topicId)
    }
  }

  return { affectedTopicIds }
}

/**
 * Enforce single-topic membership: pull post from all topics, add to target, recompute stats.
 */
export async function movePostToTopic(db, postId, targetTopicId) {
  const hexId = getPostHexId(postId)
  if (!hexId) throw new Error('Invalid post id.')

  const collection = db.collection(TOPICS_COLLECTION)
  const target = await collection.findOne({ topic_id: targetTopicId }, { projection: { topic_id: 1 } })
  if (!target) throw new Error('Topic not found.')

  const containing = await collection
    .find({ posts: hexId }, { projection: { topic_id: 1 } })
    .toArray()
  const affectedTopicIds = new Set(containing.map((t) => t.topic_id))
  affectedTopicIds.add(targetTopicId)

  await collection.updateMany({ posts: hexId }, { $pull: { posts: hexId } })
  await collection.updateOne(
    { topic_id: targetTopicId },
    { $addToSet: { posts: hexId } }
  )

  for (const topicId of affectedTopicIds) {
    await recomputeTopicStats(db, topicId)
  }

  const updated = await collection.findOne(
    { topic_id: targetTopicId },
    { projection: { topic_id: 1, title: 1, post_count: 1, first_posted_at: 1, last_posted_at: 1, posts: 1 } }
  )
  return { hexId, topic: updated }
}
