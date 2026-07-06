/**
 * Feeds collection (per-project MongoDB DB resolved via project.mongo_db_map).
 *
 * A Feed is a reviewer-curated collection of content shown to clients. It references
 * topics (by their stable `topic_id`) and/or individual posts (by `Posts._id`).
 * Posts are NOT denormalized into the feed; they are resolved live at read time:
 *   feed.topic_ids -> topics.posts[]  (one query)
 *   union with feed.manual_post_ids
 *   -> Posts $match { _id: { $in } } + reviewed filter (one query)
 * This keeps feeds "live" (topic edits cascade automatically) while bounding reads.
 *
 * Document shape:
 * {
 *   _id: ObjectId,
 *   title: string,
 *   description: string,
 *   topic_ids: string[],        // references topics.topic_id e.g. "T00002"
 *   manual_post_ids: string[],  // Posts._id hex strings added directly via search
 *   cover_image_url: string|null,
 *   created_by: string,         // reviewer email
 *   created_at: Date,
 *   updated_at: Date,
 *   update_history: [{ updated_at: Date, updated_by: string, changes_summary: string }]
 * }
 *
 * Topics collection — post membership is stored on topic docs (`posts[]` hex ids).
 * `source` values: CSV imports (e.g. "posts_ledger.csv") or "review-cases" for app-created topics.
 */

import { buildFeedSlug } from '@/lib/feeds/feed-slug'

export const FEEDS_COLLECTION = 'Feeds'
export const TOPICS_COLLECTION = 'topics'
export const POSTS_COLLECTION = 'posts'

const toIso = (value) => {
  if (!value) return null
  try {
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  } catch {
    return null
  }
}

/** Normalize a raw Feed document into a plain, client-safe object. */
export function serializeFeed(doc) {
  if (!doc) return null
  const topic_ids = Array.isArray(doc.topic_ids) ? doc.topic_ids : []
  const manual_post_ids = Array.isArray(doc.manual_post_ids) ? doc.manual_post_ids : []
  const _id = doc._id ? doc._id.toString() : null
  const title = doc.title || 'Untitled feed'
  return {
    _id,
    slug: _id ? buildFeedSlug({ _id, title }) : null,
    title,
    description: doc.description || '',
    topic_ids,
    manual_post_ids,
    topic_count: topic_ids.length,
    manual_post_count: manual_post_ids.length,
    cover_image_url: doc.cover_image_url || null,
    created_by: doc.created_by || null,
    created_at: toIso(doc.created_at),
    updated_at: toIso(doc.updated_at),
  }
}

/** Normalize a raw topic document into a lightweight picker option. */
export function serializeTopicOption(doc) {
  if (!doc) return null
  return {
    topic_id: doc.topic_id,
    title: doc.title || 'Untitled topic',
    post_count: typeof doc.post_count === 'number'
      ? doc.post_count
      : Array.isArray(doc.posts) ? doc.posts.length : 0,
    first_posted_at: toIso(doc.first_posted_at),
    last_posted_at: toIso(doc.last_posted_at),
    source: doc.source || null,
  }
}

/** Dedupe + trim an array of strings (used for topic_ids / manual_post_ids). */
export function sanitizeStringArray(arr) {
  if (!Array.isArray(arr)) return []
  return [...new Set(arr.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()))]
}

/** Escape a user-supplied string for safe use inside a RegExp. */
export function escapeRegex(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
