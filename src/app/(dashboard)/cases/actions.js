'use server'

import clientPromise from '@/utils/mongodb/client'
import { sendSlackNotification } from '@/utils/slack'
import { countReviewedCaseActivityDelta } from '@/utils/supabase/reviewed-activity-count'
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
} from './riskBuckets'
import { withReviewedThreatScoreFilter } from '@/lib/posts/reviewed-post-filter'
import {
  normalizeS3Post,
  buildCasesMatchQuery,
  buildCasesDateAddFieldsStage,
  buildCasesDateFilterStage,
  buildUniqueClustersStage,
} from '@/lib/posts/pipeline-helpers'

const CASES_TRACE_OPTS = { loki_stream: LOKI_STREAMS.cases }

export const trackClientClick = traceAction(
  'trackClientClick',
  async (buttonName, attributes = {}) => {
    recordClickMetric(buttonName, attributes)
  },
  CASES_TRACE_OPTS,
)

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

    const reviewedActivityCount = countReviewedCaseActivityDelta(posts, status)
    if (reviewedActivityCount > 0) {
      await updateClientMetaStats(
        authContext.clientDetails.project_name,
        authContext.clientDetails.email,
        'reviewed_case',
        reviewedActivityCount
      ).catch(err => logActionError({
      loki_stream: LOKI_STREAMS.cases,
      app_action: 'updateClientStatus',
      message: 'Failed to update meta stats',
      }, err))
    }

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
