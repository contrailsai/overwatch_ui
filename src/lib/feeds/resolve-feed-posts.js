import { ObjectId } from 'mongodb'
import { TOPICS_COLLECTION } from '@/lib/feeds/feed-schema'
import {
  buildCasesMatchQuery,
  buildCasesDateAddFieldsStage,
  buildCasesDateFilterStage,
  buildUniqueClustersStage,
} from '@/lib/posts/pipeline-helpers'
import { buildCaseSortAddFields, buildCasesListSortPipeline, buildCasesReportSortPipeline } from '@/app/(dashboard)/cases/riskBuckets'

/** Convert hex post id strings to ObjectIds; skip invalid entries. */
export function toPostObjectIds(hexIds = []) {
  const objectIds = []
  const seen = new Set()
  for (const id of hexIds) {
    if (!id || seen.has(id)) continue
    try {
      objectIds.push(new ObjectId(id))
      seen.add(id)
    } catch {
      // skip invalid id
    }
  }
  return objectIds
}

/**
 * Resolve a feed's post set live from Topics + manual_post_ids.
 * Returns deduped ObjectIds (not yet filtered to reviewed-only).
 */
export async function resolveFeedPostObjectIds(db, feed) {
  if (!feed) return []

  const topicIds = Array.isArray(feed.topic_ids) ? feed.topic_ids : []
  const manualIds = Array.isArray(feed.manual_post_ids) ? feed.manual_post_ids : []

  let fromTopics = []
  if (topicIds.length > 0) {
    const topicDocs = await db
      .collection(TOPICS_COLLECTION)
      .find({ topic_id: { $in: topicIds } }, { projection: { posts: 1 } })
      .toArray()
    fromTopics = topicDocs.flatMap((t) => (Array.isArray(t.posts) ? t.posts : []))
  }

  return toPostObjectIds([...fromTopics, ...manualIds])
}

/** Shared pipeline prefix: feed post id scope + cases filters + date stages. */
export function buildFeedScopedPipeline(postObjectIds, filters = {}) {
  if (!postObjectIds?.length) return null

  const matchStage = {
    ...buildCasesMatchQuery(filters),
    _id: { $in: postObjectIds },
  }
  const dateFilterStage = buildCasesDateFilterStage(filters)
  const hasDateFilters = Object.keys(dateFilterStage).length > 0

  return [
    { $match: matchStage },
    { $project: { text_embedding: 0, image_embedding: 0 } },
    {
      $addFields: {
        ...buildCasesDateAddFieldsStage(),
        ...buildCaseSortAddFields(),
      },
    },
    ...(hasDateFilters ? [{ $match: dateFilterStage }] : []),
    ...buildUniqueClustersStage(filters),
  ]
}

/** Faceted list pipeline for paginated feed post queries. */
export function buildFeedPostsFacetPipeline(postObjectIds, filters, sort, page, limit) {
  const base = buildFeedScopedPipeline(postObjectIds, filters)
  if (!base) return null

  const skip = (page - 1) * limit
  const sortPipeline = buildCasesListSortPipeline(sort)

  return [
    ...base,
    {
      $facet: {
        data: [
          { $sort: sortPipeline },
          { $skip: skip },
          { $limit: limit },
          { $project: { text_embedding: 0, image_embedding: 0 } },
        ],
        total: [{ $count: 'total' }],
      },
    },
  ]
}

/** Id-only pipeline for report export / select-all. */
export function buildFeedPostIdsPipeline(postObjectIds, filters) {
  const base = buildFeedScopedPipeline(postObjectIds, filters)
  if (!base) return null

  return [
    ...base,
    { $sort: buildCasesReportSortPipeline() },
    { $project: { _id: 1 } },
  ]
}

/** Group posts by publish day for the publishing timeline chart. */
export function buildFeedHistogramPipeline(postObjectIds, filters) {
  const base = buildFeedScopedPipeline(postObjectIds, filters)
  if (!base) return null

  return [
    ...base,
    { $match: { sort_original_date: { $ne: null } } },
    {
      $group: {
        _id: {
          $dateTrunc: {
            date: '$sort_original_date',
            unit: 'day',
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]
}
