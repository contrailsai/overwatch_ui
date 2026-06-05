'use server'

import clientPromise from '@/utils/mongodb/client'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { sendSlackNotification } from '@/utils/slack'
import { updateClientReviewedMetricsBatch, updateDailyMetrics, updateClientMetaStats } from '@/utils/supabase/metrics'
import { ObjectId } from 'mongodb'
// import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { traceAction, recordClickMetric, runInSpan } from '@/utils/tracing'
import { requireAuthContext } from '@/utils/auth-context'
import { flushOtelLogs, isOtelLogsVerbose, logActionError, LOKI_STREAMS, otelLogger } from '@/utils/otel-logger'
import {
  buildCaseSortAddFields,
  buildCasesListSortPipeline,
  buildCasesReportSortPipeline,
  UNIQUE_CLUSTER_LIST_SORT,
  UNIQUE_CLUSTER_EARLY_SORT,
} from './riskBuckets'
import { withReviewedThreatScoreFilter } from '@/lib/posts/reviewed-post-filter'

const CASES_TRACE_OPTS = { loki_stream: LOKI_STREAMS.cases }

export const trackClientClick = traceAction(
  'trackClientClick',
  async (buttonName, attributes = {}) => {
    recordClickMetric(buttonName, attributes)
  },
  CASES_TRACE_OPTS,
)

const normalizeS3Post = async (post) => {
  // Find S3 URL to sign
  let s3UrlToSign = null;
  if (post.post_content?.media_urls && post.post_content.media_urls.length > 0) {
    const firstMedia = post.post_content.media_urls[0];
    s3UrlToSign = firstMedia.s3_url;
  } else if (post.s3_url) {
    s3UrlToSign = post.s3_url;
  }

  const signedUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null;

  // Normalize data structure
  const normalized = {
    _id: post._id.toString(),
    // Metadata
    created_at: post.metadata?.created_at ? new Date(post.metadata.created_at).toISOString() : null,
    sourcing_date: post.metadata?.sourcing_date ? new Date(post.metadata.sourcing_date).toISOString() : null,
    posted_date: post.engagement?.posted_at ? new Date(post.engagement.posted_at).toISOString() : post.metadata?.posted_date ? new Date(post.metadata.posted_date).toISOString() : null,
    taken_at: post.post_content?.taken_at || post.taken_at || null,
    updated_at: post.metadata?.updated_at ? new Date(post.metadata.updated_at).toISOString() : null,
    reviewed_at: post.review_details?.reviewed_at ? new Date(post.review_details.reviewed_at).toISOString() : null,

    update_history: post.metadata?.update_history ? post.metadata.update_history.map(update => ({
      ...update,
      updated_at: update.updated_at ? new Date(update.updated_at).toISOString() : null,
    })) : [],

    platform: post.platform ? post.platform.toLowerCase() : 'instagram',
    processed: post.processed || false,
    client_status: post.client_status || 'To Be Reviewed',

    // Content
    caption: post.post_content?.caption || post.caption || '',
    signedImageUrl: signedUrl,
    original_url: post.original_url,
    post_id: post.post_id || post.code,
    visibility_status: post.visibility_status || 'active',

    // Profile
    user: {
      username: post.profile?.username || post.user?.username || 'Unknown',
      full_name: post.profile?.display_name || '',
      profile_pic_url: post.profile?.profile_pic_url || post.profile?.profile_url || '',
      is_verified: post.profile?.is_verified || false
    },

    assigned_to: post?.assigned_to || null,
    content_reviewed_by: post?.content_reviewed_by || null,
    score: post.score || null,

    // Review Details (if available)
    review_details: post.review_details || null,
    takedown_info: post.takedown_info || null,
    analysis_results: post.analysis_results || null,
    client_notes: post.client_notes || [],

    // Stats
    stats: {
      like_count: post.engagement?.likes || 0,
      comment_count: post.engagement?.comments || 0,
      share_count: post.engagement?.shares || 0,
      view_count: post.engagement?.views || 0
    },

    // Clusters
    cluster_id: post.cluster_id ? post.cluster_id.toString() : null
  };

  return normalized;
}

// GET POSTS WITH PAGINATIONS AND FILTERS
const buildUniqueClustersStage = (filters, { clusterSort = 'list' } = {}) => {
  const clusterRankSort = clusterSort === 'early' ? UNIQUE_CLUSTER_EARLY_SORT : UNIQUE_CLUSTER_LIST_SORT
  if (filters.unique_clusters === 'true' || filters.unique_clusters === true) {
    const useStrictUniqueClustering = process.env.USE_STRICT_UNIQUE_CLUSTERING === 'true';
    if (!useStrictUniqueClustering) {
      return [
        {
          $addFields: {
            _unique_group_key: {
              $ifNull: [{ $toString: "$cluster_id" }, { $toString: "$_id" }]
            }
          }
        },
        {
          // Pick one "best" post per cluster (or per post when no cluster_id)
          $sort: {
            _unique_group_key: 1,
            ...clusterRankSort,
          }
        },
        {
          $group: {
            _id: "$_unique_group_key",
            doc: { $first: "$$ROOT" }
          }
        },
        { $replaceRoot: { newRoot: "$doc" } },
        {
          $project: {
            _unique_group_key: 0
          }
        }
      ];
    }

    return [
      {
        $addFields: {
          _cluster_id_str: {
            $cond: [
              { $ifNull: ["$cluster_id", false] },
              { $toString: "$cluster_id" },
              null
            ]
          },
          _doc_id_str: { $toString: "$_id" }
        }
      },
      {
        $lookup: {
          from: 'unique_clusters',
          let: { clusterIdObj: "$cluster_id", clusterIdStr: "$_cluster_id_str" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    // Handles normal ObjectId-to-ObjectId joins.
                    { $eq: ["$_id", "$$clusterIdObj"] },
                    // Handles mismatches where one side is stringified.
                    { $eq: [{ $toString: "$_id" }, "$$clusterIdStr"] }
                  ]
                }
              }
            }
          ],
          as: 'cluster_info'
        }
      },
      {
        $unwind: {
          path: "$cluster_info",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          _representative_post_id_str: {
            $cond: [
              { $ifNull: ["$cluster_info.representative_post_id", false] },
              { $toString: "$cluster_info.representative_post_id" },
              null
            ]
          },
          _member_ids_str: {
            $map: {
              input: { $ifNull: ["$cluster_info.member_ids", []] },
              as: "memberId",
              in: { $toString: "$$memberId" }
            }
          }
        }
      },
      {
        $addFields: {
          _is_representative: { $eq: ["$_doc_id_str", "$_representative_post_id_str"] },
          _is_member: { $in: ["$_doc_id_str", "$_member_ids_str"] },
          // If cluster doc is missing, treat the post as unique on its own.
          _has_cluster_info: { $ne: ["$cluster_info", null] },
          _unique_group_key: {
            $ifNull: [{ $toString: "$cluster_info._id" }, "$_doc_id_str"]
          }
        }
      },
      {
        $match: {
          $expr: {
            $or: [
              { $not: ["$_has_cluster_info"] },
              "$_is_representative",
              "$_is_member"
            ]
          }
        }
      },
      {
        // Prefer representative if present; else best-ranked recent member.
        $sort: {
          _unique_group_key: 1,
          _is_representative: -1,
          ...clusterRankSort,
        }
      },
      {
        $group: {
          _id: "$_unique_group_key",
          doc: { $first: "$$ROOT" }
        }
      },
      { $replaceRoot: { newRoot: "$doc" } },
      {
        $project: {
          _cluster_id_str: 0,
          _doc_id_str: 0,
          _representative_post_id_str: 0,
          _member_ids_str: 0,
          _is_representative: 0,
          _is_member: 0,
          _has_cluster_info: 0,
          _unique_group_key: 0,
          cluster_info: 0
        }
      }
    ];
  }
  return [];
};

const ONLINE_VISIBILITY_VALUES = ['active', 'online', 'available'];

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildCasesMatchQuery = (filters = {}) => {
  const query = withReviewedThreatScoreFilter({});

  const andConditions = [];

  // Platform filter
  if (filters.platform && filters.platform !== 'all') {
    const escapedPlatform = escapeRegex(filters.platform);
    query.platform = { $regex: new RegExp(`^${escapedPlatform}$`, 'i') };
  }

  // Visibility status filter
  if (filters.visibility_status && filters.visibility_status !== 'all') {
    const visibilityLower = String(filters.visibility_status).toLowerCase();
    if (visibilityLower === 'down') {
      query.visibility_status = 'down';
    } else if (visibilityLower === 'active' || visibilityLower === 'online' || visibilityLower === 'available') {
      andConditions.push({
        $or: [
          { visibility_status: { $in: ONLINE_VISIBILITY_VALUES } },
          { visibility_status: { $exists: false } },
          { visibility_status: null }
        ]
      });
    }
  }

  // Client Status filter
  if (filters.client_status && filters.client_status !== 'all') {
    const statusLower = filters.client_status.toLowerCase();
    const escapedStatus = escapeRegex(filters.client_status);
    if (statusLower === 'to be reviewed') {
      andConditions.push({
        $or: [
          { client_status: { $exists: false } },
          { client_status: null },
          { client_status: { $regex: new RegExp('^to be reviewed$', 'i') } }
        ]
      });
    } else if (statusLower === 'takedown' || statusLower === 'takedowns') {
      query.client_status = { $regex: new RegExp('^takedowns?$', 'i') };
    } else {
      query.client_status = { $regex: new RegExp(`^${escapedStatus}$`, 'i') };
    }
  }

  // Risk Priority filter
  // high > 95 >= medium > 75 >= low > 40 >= safe
  if (filters.risk_priority && filters.risk_priority !== 'all') {
    if (filters.risk_priority === 'high') {
      query['review_details.threat_score'] = { $exists: true, $gt: 95 };
    } else if (filters.risk_priority === 'medium') {
      query['review_details.threat_score'] = { $exists: true, $gt: 75, $lte: 95 };
    } else if (filters.risk_priority === 'low') {
      query['review_details.threat_score'] = { $exists: true, $gt: 40, $lte: 75 };
    } else if (filters.risk_priority === 'safe') {
      query['review_details.threat_score'] = { $exists: true, $lte: 40 };
    }
  }

  // Violations filter
  if (filters.violations && filters.violations !== 'all') {
    const violationsArray = filters.violations.split(',');
    if (violationsArray.length > 0) {
      const normalViolations = violationsArray.filter(v => v !== 'aigc');
      const hasAigc = violationsArray.includes('aigc');

      const violationConditions = [];
      if (normalViolations.length > 0) {
        violationConditions.push({ 'review_details.threat_types': { $in: normalViolations } });
        const flagConditions = normalViolations.map(v => ({ [`review_details.flags.${v}`]: true }));
        violationConditions.push(...flagConditions);
      }
      if (hasAigc) {
        violationConditions.push({ 'review_details.is_aigc': true });
      }

      if (violationConditions.length > 0) {
        andConditions.push({
          $or: violationConditions
        });
      }
    }
  }

  if (andConditions.length > 0) {
    query.$and = andConditions;
  }

  return query;
};

export const getPosts = traceAction('getPosts', async (_project, page = 1, limit = 20, filters = {}, sort = { field: 'threat_score', direction: 'desc' }) => {
  try {
    const handlerStart = Date.now()
    const { dbName } = await requireAuthContext()

    if (isOtelLogsVerbose()) {
      otelLogger.info('cases.getPosts started', {
        loki_stream: LOKI_STREAMS.cases,
        app_span_type: 'cases',
        app_action: 'getPosts',
        db_name: dbName,
        page,
        limit,
      })
    }
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = db.collection('Posts')

    const skip = (page - 1) * limit

    const query = buildCasesMatchQuery(filters);

    const sortPipeline = buildCasesListSortPipeline(sort);

    const matchStage = { ...query };
    const dateFilterStage = buildCasesDateFilterStage(filters);
    const hasDateFilters = Object.keys(dateFilterStage).length > 0;

    const basePipeline = [
      { $match: matchStage },
      // Embeddings are large and never needed for cases listing/count paths.
      // Drop them early so downstream stages ($lookup/$group/$facet) process smaller documents.
      { $project: { text_embedding: 0, image_embedding: 0 } },
      {
        $addFields: {
          ...buildCasesDateAddFieldsStage(),
          ...buildCaseSortAddFields(),
        }
      },
      ...(hasDateFilters ? [{ $match: dateFilterStage }] : []),
      ...buildUniqueClustersStage(filters),
    ]

    const facetStart = Date.now()
    const facetResult = await runInSpan(
      'cases.getPosts.mongo_data_and_count_query',
      async () => collection.aggregate([
        ...basePipeline,
        {
          $facet: {
            data: [
              { $sort: sortPipeline },
              { $skip: skip },
              { $limit: limit },
              { $project: { text_embedding: 0, image_embedding: 0 } },
            ],
            total: [{ $count: 'total' }],
          }
        }
      ]).toArray(),
      { 'app.span_type': 'mongo_query', 'app.query_kind': 'data_and_count' }
    )
    const mongoFacetMs = Date.now() - facetStart

    const posts = facetResult?.[0]?.data || []
    const totalCount = facetResult?.[0]?.total?.[0]?.total || 0

    // Keep legacy timing keys so existing dashboards stay valid.
    const mongoPostsQueryMs = mongoFacetMs
    const mongoCountQueryMs = 0

    // Serialize and Sign URLs
    const signingStart = Date.now()
    const processedPosts = await runInSpan(
      'cases.getPosts.s3_signing',
      async () => Promise.all(posts.map(normalizeS3Post)),
      { 'app.span_type': 's3_signing' }
    )
    const s3SigningMs = Date.now() - signingStart
    const totalHandlerMs = Date.now() - handlerStart

    const timingAttrs = {
      loki_stream: LOKI_STREAMS.cases,
      app_span_type: 'cases',
      app_action: 'getPosts',
      log_kind: 'timing',
      db_name: dbName,
      page,
      limit,
      unique_clusters: filters.unique_clusters === 'true' || filters.unique_clusters === true,
      has_date_filters: hasDateFilters,
      result_count: processedPosts.length,
      total_count: totalCount,
      mongo_data_and_count_query_ms: mongoFacetMs,
      mongo_posts_query_ms: mongoPostsQueryMs,
      mongo_count_query_ms: mongoCountQueryMs,
      s3_signing_ms: s3SigningMs,
      total_handler_ms: totalHandlerMs,
    }
    if (process.env.NODE_ENV === 'development') {
      console.info('[cases.getPosts] timing', timingAttrs)
    }
    if (isOtelLogsVerbose()) {
      otelLogger.info('cases.getPosts timing', timingAttrs)
      await flushOtelLogs()
    }

    return {
      posts: processedPosts,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit)
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.cases,
      app_action: 'getPosts',
      message: 'cases.getPosts failed',
    }, e)
    console.error('MongoDB Error:', e)
    return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
  }
}, CASES_TRACE_OPTS)

// For opening using specific case links
export const getPostById = traceAction('getPostById', async (_project, id) => {
  try {
    if (!id) return null;
    const { dbName } = await requireAuthContext()

    const client = await clientPromise;
    const db = client.db(dbName);
    const collection = db.collection('Posts');

    const post = await collection.findOne(
      withReviewedThreatScoreFilter({ _id: new ObjectId(id) }),
      { projection: { text_embedding: 0, image_embedding: 0 } }
    );
    if (!post) return null;

    // get normalized post
    return await normalizeS3Post(post);

  } catch (e) {
    logActionError({ loki_stream: LOKI_STREAMS.cases, app_action: 'getPostById', message: 'getPostById failed' }, e)
    console.error('getPostById Error:', e);
    return null;
  }
}, CASES_TRACE_OPTS)

const CASES_ALERT_HOUR_TIMEZONE = 'Asia/Kolkata'

const buildCasesDateAddFieldsStage = () => ({
  sort_original_date: {
    $toDate: {
      $ifNull: ['$engagement.posted_at', '$metadata.posted_date'],
    },
  },
  sort_processed_after: {
    $toDate: {
      $ifNull: ['$review_details.reviewed_at', '$metadata.updated_at'],
    },
  },
  sort_processed_after_hour: {
    $cond: [
      { $ne: [{ $ifNull: ['$review_details.reviewed_at', '$metadata.updated_at'] }, null] },
      {
        $dateTrunc: {
          date: {
            $toDate: {
              $ifNull: ['$review_details.reviewed_at', '$metadata.updated_at'],
            },
          },
          unit: 'hour',
          timezone: CASES_ALERT_HOUR_TIMEZONE,
        },
      },
      null,
    ],
  },
})

const buildCasesDateFilterStage = (filters = {}) => {
  const dateFilterStage = {}

  if (filters.original_date_from || filters.original_date_to) {
    dateFilterStage.sort_original_date = {}
    if (filters.original_date_from) {
      dateFilterStage.sort_original_date.$gte = new Date(filters.original_date_from)
    }
    if (filters.original_date_to) {
      dateFilterStage.sort_original_date.$lte = new Date(filters.original_date_to)
    }
  }

  if (filters.processed_from || filters.processed_to) {
    dateFilterStage.sort_processed_after = {}
    if (filters.processed_from) {
      dateFilterStage.sort_processed_after.$gte = new Date(filters.processed_from)
    }
    if (filters.processed_to) {
      dateFilterStage.sort_processed_after.$lte = new Date(filters.processed_to)
    }
  }

  return dateFilterStage
}

/** Order post IDs for report export (risk -> engagement -> alert -> publish). */
export const orderPostIdsForReport = traceAction('orderPostIdsForReport', async (postIds = []) => {
  try {
    if (!postIds?.length) return []

    const { dbName } = await requireAuthContext()
    const objectIds = postIds
      .filter((id) => id != null && String(id) !== '')
      .map((id) => {
        try {
          return new ObjectId(id)
        } catch {
          return null
        }
      })
      .filter(Boolean)

    if (objectIds.length === 0) return []

    const client = await clientPromise
    const collection = client.db(dbName).collection('Posts')

    const docs = await collection.aggregate([
      { $match: withReviewedThreatScoreFilter({ _id: { $in: objectIds } }) },
      {
        $addFields: {
          ...buildCasesDateAddFieldsStage(),
          ...buildCaseSortAddFields(),
        },
      },
      { $sort: buildCasesReportSortPipeline() },
      { $project: { _id: 1 } },
    ]).toArray()

    return docs.map((d) => d._id.toString())
  } catch (e) {
    logActionError({ loki_stream: LOKI_STREAMS.cases, app_action: 'orderPostIdsForReport', message: 'orderPostIdsForReport failed' }, e)
    console.error('orderPostIdsForReport Error:', e)
    return []
  }
}, CASES_TRACE_OPTS)

// USEFUL FOR PDFs / bulk select — report sort order (matches SQS export)
export const getAllPostIds = traceAction('getAllPostIds', async (_project, filters = {}) => {
  try {
    const { dbName } = await requireAuthContext()

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = db.collection('Posts')

    const matchStage = buildCasesMatchQuery(filters)
    const dateFilterStage = buildCasesDateFilterStage(filters)
    const hasDateFilters = Object.keys(dateFilterStage).length > 0

    const pipeline = [
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
      { $sort: buildCasesReportSortPipeline() },
      { $project: { _id: 1 } },
    ]

    const docs = await collection.aggregate(pipeline).toArray()
    return docs.map(d => d._id.toString())
  } catch (e) {
    logActionError({ loki_stream: LOKI_STREAMS.cases, app_action: 'getAllPostIds', message: 'getAllPostIds failed' }, e)
    console.error('getAllPostIds Error:', e)
    return []
  }
}, CASES_TRACE_OPTS)

// USEFUL FOR PDFs
export const getIdenticalPosts = traceAction('getIdenticalPosts', async (_project, clusterId, currentPostId) => {
  try {
    if (!clusterId) return [];
    const { dbName } = await requireAuthContext()
    const client = await clientPromise;
    const db = client.db(dbName);
    
    const cluster = await db.collection('unique_clusters').findOne({ _id: new ObjectId(clusterId) });
    if (!cluster || !cluster.member_ids) return [];
    
    const otherMemberIds = cluster.member_ids.filter(id => id !== currentPostId && id.toString() !== currentPostId);
    if (otherMemberIds.length === 0) return [];
    
    const objectIds = otherMemberIds.map(id => new ObjectId(id));
    const posts = await db.collection('Posts').find(withReviewedThreatScoreFilter({ _id: { $in: objectIds } })).toArray();
    
    return await Promise.all(posts.map(normalizeS3Post));
  } catch (e) {
    logActionError({ loki_stream: LOKI_STREAMS.cases, app_action: 'getIdenticalPosts', message: 'getIdenticalPosts failed' }, e)
    console.error('getIdenticalPosts Error:', e);
    return [];
  }
}, CASES_TRACE_OPTS);

export const getPostsByIds = traceAction('getPostsByIds', async (_project, ids) => {
  try {
    if (!ids || ids.length === 0) {
      return []
    }
    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = db.collection('Posts')
    const totalCount = ids.length;
    const page = 1;
    const limit = 100;

    const objectIds = ids.map(id => new ObjectId(id))
    const posts = await collection.find(
      withReviewedThreatScoreFilter({ _id: { $in: objectIds } }),
      { projection: { text_embedding: 0, image_embedding: 0 } }
    ).toArray()

    // Normalize and Sign URLs (using the existing helper)
    const processedPosts = await Promise.all(posts.map(normalizeS3Post))

    // Important: Maintain the order of IDs if possible, or just return them
    // Returning processedPosts is enough for the export components
    return {
      posts: processedPosts,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit)
    }
  } catch (e) {
    logActionError({ loki_stream: LOKI_STREAMS.cases, app_action: 'getPostsByIds', message: 'getPostsByIds failed' }, e)
    console.error('getPostsByIds Error:', e)
    return []
  }
}, CASES_TRACE_OPTS)

export const getSimilarPosts = traceAction('getSimilarPosts', async (_project, sourcePostId, type = 'text', limit = 10, filters = {}, sort = { field: 'threat_score', direction: 'desc' }) => {
  try {
    if (!sourcePostId) return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
    const { dbName } = await requireAuthContext()

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = db.collection('Posts')

    // 1. Get the source post (including embeddings for query, but also all other fields for display)
    const sourcePost = await collection.findOne(
      withReviewedThreatScoreFilter({ _id: new ObjectId(sourcePostId) })
    )

    if (!sourcePost) return { posts: [], totalCount: 0, page: 1, totalPages: 0 }

    const embeddingField = type === 'image' ? 'image_embedding' : 'text_embedding'
    const queryVector = sourcePost[embeddingField]

    if (!queryVector || !Array.isArray(queryVector) || queryVector.length === 0) {
      console.log(`No ${embeddingField} found for post ${sourcePostId}`)
      return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
    }

    // Keep filtering parity with the main cases list (including visibility logic).
    const matchQuery = {
      ...buildCasesMatchQuery(filters),
      _id: { $ne: new ObjectId(sourcePostId) } // Exclude self
    };

    const sortPipeline = { score: -1, ...buildCasesListSortPipeline(sort) };

    // 2. Perform vector search using Atlas Vector Search stage $vectorSearch
    // We assume an index named 'vector_index' is configured for the 'Posts' collection
    // Note: $vectorSearch must be the first stage in the pipeline.
    // Unfortunately, combining heavy filtering or sorting with vector search can be complex,
    // but Atlas Vector Search supports pre-filtering in the query itself if indexed, 
    // or we can use $match right after for non-indexed fields.
    const pipeline = [
      {
        $vectorSearch: {
          index: "vector_index",
          path: embeddingField,
          queryVector: queryVector,
          numCandidates: 1000, // Fetch more to allow for post-filtering
          limit: limit * 5 // Increase limit to ensure we get enough after match
        }
      },
      {
        $match: matchQuery
      },
      { $addFields: buildCaseSortAddFields() },
      ...buildUniqueClustersStage(filters, { clusterSort: 'early' }),
      {
        $addFields: {
          score: { $meta: "vectorSearchScore" },
          ...buildCasesDateAddFieldsStage(),
        }
      }
    ];

    // Add Date Filters
    const dateFilterStage = {};
    if (filters.original_date_from || filters.original_date_to) {
      dateFilterStage.sort_original_date = {};
      if (filters.original_date_from) dateFilterStage.sort_original_date.$gte = new Date(filters.original_date_from);
      if (filters.original_date_to) dateFilterStage.sort_original_date.$lte = new Date(filters.original_date_to);
    }
    if (filters.processed_from || filters.processed_to) {
      dateFilterStage.sort_processed_after = {};
      if (filters.processed_from) dateFilterStage.sort_processed_after.$gte = new Date(filters.processed_from);
      if (filters.processed_to) dateFilterStage.sort_processed_after.$lte = new Date(filters.processed_to);
    }
    if (Object.keys(dateFilterStage).length > 0) {
      pipeline.push({ $match: dateFilterStage });
    }

    // Add explicit sorting if requested (overrides similarity score ordering)
    // Only sort if it's explicitly not the default, or if we want to enforce it.
    // If we sort, we lose the similarity ranking. We will apply sort only if field is explicitly passed.
    if (sortPipeline) {
       pipeline.push({ $sort: sortPipeline });
    }

    pipeline.push(
      { $limit: limit }, // Final limit after all sorting and matching
      { $project: { text_embedding: 0, image_embedding: 0 } }
    );

    const posts = await collection.aggregate(pipeline).toArray()
    const processedPosts = await Promise.all(posts.map(normalizeS3Post))

    // 3. Prepend the source post to the results to show it at the top
    const normalizedSourcePost = await normalizeS3Post(sourcePost)
    const finalPosts = [normalizedSourcePost, ...processedPosts]

    return {
      posts: finalPosts,
      totalCount: finalPosts.length,
      page: 1,
      totalPages: 1,
      search_metadata: {
        similar_to: sourcePostId,
        search_type: type
      }
    }
  } catch (e) {
    logActionError({ loki_stream: LOKI_STREAMS.cases, app_action: 'getSimilarPosts', message: 'getSimilarPosts failed' }, e)
    console.error('getSimilarPosts Error:', e)
    return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
  }
}, CASES_TRACE_OPTS)

export const getSemanticSearchPosts = traceAction('getSemanticSearchPosts', async (_project, searchText, limit = 10, filters = {}, sort = {}) => {
  try {
    if (!searchText) return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
    const { dbName } = await requireAuthContext()

    // 1. Fetch embedding for semantic search
    let queryVector = null;
    try {
      const res = await fetch(`${process.env.EMBEDDING_SERVICE_API}/embed/text`, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: searchText })
      });
      
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) queryVector = data;
        else if (data.embedding && Array.isArray(data.embedding)) queryVector = data.embedding;
        else if (data.data && Array.isArray(data.data)) queryVector = data.data;
      } else {
        logActionError({
          loki_stream: LOKI_STREAMS.cases,
          app_action: 'getSemanticSearchPosts',
          message: 'Embedding API error',
          http_status: res.status,
        })
        console.error(`Embedding API error: ${res.status} ${res.statusText}`);
      }
    } catch (apiError) {
      logActionError({
        loki_stream: LOKI_STREAMS.cases,
        app_action: 'getSemanticSearchPosts',
        message: 'Failed to fetch embeddings',
      }, apiError)
      console.error('Failed to fetch embeddings:', apiError);
    }

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = db.collection('Posts')

    // 2. Build common match and date filters
    const matchQuery = buildCasesMatchQuery(filters);

    const sortPipeline = { score: -1, ...buildCasesListSortPipeline(sort) };

    const dateFilterStage = {};
    if (filters.original_date_from || filters.original_date_to) {
      dateFilterStage.sort_original_date = {};
      if (filters.original_date_from) dateFilterStage.sort_original_date.$gte = new Date(filters.original_date_from);
      if (filters.original_date_to) dateFilterStage.sort_original_date.$lte = new Date(filters.original_date_to);
    }
    if (filters.processed_from || filters.processed_to) {
      dateFilterStage.sort_processed_after = {};
      if (filters.processed_from) dateFilterStage.sort_processed_after.$gte = new Date(filters.processed_from);
      if (filters.processed_to) dateFilterStage.sort_processed_after.$lte = new Date(filters.processed_to);
    }

    // 3. Setup Semantic Pipeline
    let semanticPosts = [];
    if (queryVector && queryVector.length > 0) {
      const semanticPipeline = [
        {
          $vectorSearch: {
            index: "vector_index",
            path: "text_embedding",
            queryVector: queryVector,
            numCandidates: 1000,
            limit: limit * 5
          }
        },
        { $match: matchQuery },
        { $addFields: buildCaseSortAddFields() },
        ...buildUniqueClustersStage(filters, { clusterSort: 'early' }),
        {
          $addFields: {
            score: { $meta: "vectorSearchScore" },
            ...buildCasesDateAddFieldsStage(),
          }
        },
        { $match: { score: { $gt: 0.80} } } // Filter vectors with a score less than 0.75
      ];

      if (Object.keys(dateFilterStage).length > 0) semanticPipeline.push({ $match: dateFilterStage });
      if (sortPipeline) semanticPipeline.push({ $sort: sortPipeline });
      semanticPipeline.push({ $limit: limit }, { $project: { text_embedding: 0, image_embedding: 0 } });
      
      try {
        semanticPosts = await collection.aggregate(semanticPipeline).toArray();
      } catch (e) {
        logActionError({
          loki_stream: LOKI_STREAMS.cases,
          app_action: 'getSemanticSearchPosts',
          message: 'Semantic search aggregation failed',
        }, e)
        console.error("Semantic search aggregation failed:", e);
      }
    }

    // 4. Setup Atlas Text Search Pipeline
    // Make sure you have an Atlas Search index (e.g., named "default") configured for your text fields.
    let textPosts = [];
    const textPipeline = [
      {
        $search: {
          index: "default", // Replace with your actual Atlas Search index name if different
          compound: {
            should: [
              {
                // Layer 1: The Absolute Exact Match (Highest Priority)
                text: {
                  query: searchText,
                  path: "original_url.exact",
                  score: { boost: { value: 10 } }
                }
              },
              {
                // Layer 2: The Missing Slash / Sequential Match (High Priority)
                phrase: {
                  query: searchText,
                  path: "original_url",
                  score: { boost: { value: 5 } }
                }
              },
              {
                // Layer 3: The Partial Hash Match & other text fields (Normal Priority)
                text: {
                  query: searchText,
                  path: ['content', 'original_url', 'profile.display_name'],
                  fuzzy: {
                    maxEdits: 2,
                    prefixLength: 2,
                    maxExpansions: 50
                  }
                }
              }
            ]
          }
        }
      },
      { $match: matchQuery },
      { $addFields: buildCaseSortAddFields() },
      ...buildUniqueClustersStage(filters, { clusterSort: 'early' }),
      {
        $addFields: {
          score: { $meta: "searchScore" },
          ...buildCasesDateAddFieldsStage(),
        }
      }
    ];

    if (Object.keys(dateFilterStage).length > 0) textPipeline.push({ $match: dateFilterStage });
    if (sortPipeline) textPipeline.push({ $sort: sortPipeline });
    textPipeline.push({ $limit: limit }, { $project: { text_embedding: 0, image_embedding: 0 } });
    
    try {
      textPosts = await collection.aggregate(textPipeline).toArray();
    } catch (e) {
      logActionError({
        loki_stream: LOKI_STREAMS.cases,
        app_action: 'getSemanticSearchPosts',
        message: 'Atlas Text Search aggregation failed',
      }, e)
      console.error("Atlas Text Search aggregation failed:", e);
    }

    // 5. Merge Results: First Atlas Text Search then Semantic Search results, ensuring no duplicates and respecting the limit
    const mergedPosts = [];
    const seenIds = new Set();

    // Add text search results if not already present
    for (const post of textPosts) {
      if (!seenIds.has(post._id.toString())) {
        mergedPosts.push(post);
        seenIds.add(post._id.toString());
      }
    }

    // Add semantic results
    for (const post of semanticPosts) {
      if (!seenIds.has(post._id.toString())) {
        mergedPosts.push(post);
        seenIds.add(post._id.toString());
      }
    }

    // Apply the final threshold/limit
    const finalLimitedPosts = mergedPosts.slice(0, limit);
    const processedPosts = await Promise.all(finalLimitedPosts.map(normalizeS3Post));

    return {
      posts: processedPosts,
      totalCount: processedPosts.length,
      page: 1,
      totalPages: 1,
      search_metadata: {
        semantic_search: searchText,
        hybrid_search_used: true
      }
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.cases,
      app_action: 'getSemanticSearchPosts',
      message: 'getSemanticSearchPosts failed',
    }, e)
    console.error('getSemanticSearchPosts Error:', e)
    return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
  }
}, CASES_TRACE_OPTS)

// UPDATE CLIENT STATUS FLAG FOR TAKEDOWN / NO ACTION
// Accepts a single caseId (string) OR an array of caseIds for bulk operation.
export const updateClientStatus = traceAction('updateClientStatus', async (caseId, status, _client_email) => {
  try {
    const ids = Array.isArray(caseId) ? caseId : [caseId]
    if (ids.length === 0) {
      return { success: false, error: "No cases provided" }
    }

    const authContext = await requireAuthContext()
    if (!authContext?.dbName) {
      return { success: false, error: "Project configuration not found" }
    }

    const client = await clientPromise
    const db = client.db(authContext.dbName)
    const collection = db.collection('Posts')

    const objectIds = ids.map(id => new ObjectId(id))
    const isBulk = ids.length > 1

    const posts = await collection.find(
      withReviewedThreatScoreFilter({ _id: { $in: objectIds } }),
      { projection: { text_embedding: 0, image_embedding: 0 } }
    ).toArray()

    if (posts.length === 0) {
      return { success: false, error: "Case not found" }
    }

    const nowIso = new Date().toISOString()
    const changesSummary = (isBulk ? "bulk " : "") + "client status change to " + status

    const bulkOps = posts.map(post => ({
      updateOne: {
        filter: { _id: post._id },
        update: {
          $set: {
            client_status: status,
            "content_reviewed_by": authContext.clientDetails.email,
            "metadata.updated_at": nowIso,
          },
          $push: {
            "metadata.update_history": {
              updated_at: new Date(),
              updated_by: authContext.clientDetails.email,
              changes_summary: changesSummary
            }
          }
        }
      }
    }))

    const result = await collection.bulkWrite(bulkOps)

    // Track metrics for each post (parallel, errors swallowed)
    await updateClientReviewedMetricsBatch(
      { project_name: authContext.clientDetails.project_name },
      posts,
      status
    ).catch(err => logActionError({
      loki_stream: LOKI_STREAMS.cases,
      app_action: 'updateClientStatus',
      message: 'Failed to update client metrics',
    }, err))

    await Promise.all(posts.map(async post => {
      await updateClientMetaStats(
        authContext.clientDetails.project_name,
        authContext.clientDetails.email,
        "reviewed_case"
      ).catch(err => logActionError({
        loki_stream: LOKI_STREAMS.cases,
        app_action: 'updateClientStatus',
        message: 'Failed to update meta stats',
      }, err))
    }))

    return {
      success: true,
      count: result.modifiedCount,
      requested: ids.length,
      skipped: ids.length - posts.length
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.cases,
      app_action: 'updateClientStatus',
      message: 'updateClientStatus failed',
    }, e)
    console.error("updateClientStatus Error:", e)
    return { success: false, error: e.message }
  }
}, CASES_TRACE_OPTS)
