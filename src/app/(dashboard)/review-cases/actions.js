'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { getSignedImageUrl, deleteFileFromS3, getSignedUploadUrl, headS3Object, buildS3PublicUrl } from '@/utils/aws/s3'
import { validateReviewImageMeta, sanitizeUploadFileName, validateS3HeadSize, REVIEW_IMAGE_MAX_BYTES } from '@/utils/aws/upload-validation'
import { sendContentModerationSqsMessage } from '@/utils/aws/sqs'
import { updateDailyMetrics } from '@/utils/supabase/metrics'
import { markClientRequestedLinksEnlisted } from '@/utils/clientRequestedLinks/server'
import { sendEmail } from '@/utils/email'
import { traceAction } from '@/utils/tracing'
import { requireRole } from '@/utils/auth-context'
import { logActionError, logActionWarn, LOKI_STREAMS } from '@/utils/otel-logger'
import {
  getCorrectionRequest,
  isActiveCorrectionRequest,
  findActiveCorrectionRequest,
} from '@/utils/analysis/correctionRequestUtils'
import { removePostFromAllTopics } from '@/lib/feeds/topic-membership'
import { normalizeS3Post } from '@/lib/posts/pipeline-helpers'
import { COLLECTIONS, postsCollection, postEmbeddingsCollection } from '@/utils/mongodb/collections'
import {
  buildPostStatsForUi,
  buildTakedownInfoForUi,
  buildEffectiveThreatScoreRange,
  getPostEngagementMetrics,
  getPostMedia,
  insertCaseEvent,
  ONLINE_VISIBILITY_VALUES,
} from '@/utils/mongodb/v3-schema'

function getPostMediaItems(post) {
  return post?.content?.media || post?.post_content?.media_urls || []
}

/** Review list helper — extends shared normalizeS3Post with review UI fields. */
async function normalizeReviewS3Post(post, db = null) {
  if (!post) return null

  const normalized = await normalizeS3Post(post, db)
  const firstMedia = getPostMedia(post)[0] || null

  return {
    ...normalized,
    uploadedManually: firstMedia?.uploaded_manually === true,
    taken_at: normalized.posted_date
      ? Math.floor(new Date(normalized.posted_date).getTime() / 1000)
      : null,
    stats: buildPostStatsForUi(post),
    url: post.original_url || post.url || normalized.original_url || '',
  }
}

function analysisResultsKeyCountExpr() {
  return { $size: { $objectToArray: { $ifNull: ['$analysis_results', {}] } } }
}

function normalizeAiAnalyzedFilter(value) {
  if (value === 'analyzed' || value === true || value === 'true') return 'analyzed'
  if (value === 'not_analyzed') return 'not_analyzed'
  return 'all'
}

function buildReviewPostsDateFilterStage(filters = {}) {
  const dateFilterStage = {}

  if (filters.sourcingDateStart || filters.sourcingDateEnd) {
    dateFilterStage['list.sourced_at'] = {}
    if (filters.sourcingDateStart) {
      dateFilterStage['list.sourced_at'].$gte = new Date(filters.sourcingDateStart)
    }
    if (filters.sourcingDateEnd) {
      dateFilterStage['list.sourced_at'].$lte = new Date(filters.sourcingDateEnd)
    }
  }

  if (filters.postingDateStart || filters.postingDateEnd) {
    dateFilterStage['list.posted_at'] = {}
    if (filters.postingDateStart) {
      dateFilterStage['list.posted_at'].$gte = new Date(filters.postingDateStart)
    }
    if (filters.postingDateEnd) {
      dateFilterStage['list.posted_at'].$lte = new Date(filters.postingDateEnd)
    }
  }

  return {
    dateFilterStage,
    hasDateFilters: Object.keys(dateFilterStage).length > 0,
  }
}

/** high > 95, medium > 75 && <= 95, low > 40 && <= 75, safe <= 40 */
function buildReviewRiskBucketMatch(aiRisk) {
  const range = buildEffectiveThreatScoreRange(aiRisk && aiRisk !== 'all' ? String(aiRisk).toLowerCase() : null)
  if (!range) return null
  return { $match: { 'list.effective_threat_score': range } }
}

function buildReviewPostsPipelineStages(filters = {}) {
  const { dateFilterStage, hasDateFilters } = buildReviewPostsDateFilterStage(filters)
  const riskMatch = buildReviewRiskBucketMatch(filters.aiRisk)

  return [
    { $match: buildReviewPostsMatchQuery(filters) },
    ...(hasDateFilters ? [{ $match: dateFilterStage }] : []),
    ...(riskMatch ? [riskMatch] : []),
  ]
}

/** Shared $match query for review-cases list + export (keep filters in sync). */
function buildReviewPostsMatchQuery(filters = {}) {
  const query = { _id: { $ne: null } }
  const andConditions = [
    // Ingest sometimes wrote image-embedding sidecar docs into Posts — never show as cases
    { _is_embedding_stub: { $ne: true } },
    { 'ingestion.type': { $ne: 'embedding_stub' } },
  ]

  if (filters.status === 'pending') {
    andConditions.push({
      $or: [
        { 'workflow.review_status': 'pending' },
        { 'list.review_threat_score': { $exists: false } },
        { 'list.review_threat_score': null },
      ],
    })
  } else if (filters.status === 'reviewed') {
    andConditions.push({ 'workflow.review_status': 'reviewed' })
  }

  const aiMode = normalizeAiAnalyzedFilter(filters.aiAnalyzed)
  if (aiMode === 'analyzed') {
    andConditions.push({ $expr: { $gt: [analysisResultsKeyCountExpr(), 0] } })
  } else if (aiMode === 'not_analyzed') {
    andConditions.push({ $expr: { $eq: [analysisResultsKeyCountExpr(), 0] } })
  }

  if (filters.poiDetected) {
    andConditions.push({
      $or: [
        { 'analysis_results.poi_check.poi_name_found': true },
        { 'analysis_results.poi_check.face_present': true },
      ],
    })
  }

  if (filters.platform && filters.platform !== 'all') {
    query.platform = { $regex: new RegExp(`^${filters.platform}$`, 'i') }
  }

  if (filters.visibility_status && filters.visibility_status !== 'all') {
    const visibilityLower = String(filters.visibility_status).toLowerCase()
    if (visibilityLower === 'down') {
      query['workflow.visibility_status'] = 'down'
    } else if (
      visibilityLower === 'active' ||
      visibilityLower === 'online' ||
      visibilityLower === 'available'
    ) {
      andConditions.push({
        $or: [
          { 'workflow.visibility_status': { $in: ONLINE_VISIBILITY_VALUES } },
          { 'workflow.visibility_status': { $exists: false } },
          { 'workflow.visibility_status': null },
        ],
      })
    }
  }

  if (andConditions.length > 0) {
    query.$and = andConditions
  }

  return query
}

export const getPosts = traceAction('getPosts_review', async (_project_mongo_db_map, page = 1, limit = 20, filters = {}) => {
  try {
    const { dbName } = await requireRole(['reviewer'])

    // const supabase = await createClient()
    // let { data } = await supabase
    //   .from('project')
    //   .select('*')
    //   .eq('project_name', project_name)
    //   .single()

    // if (!data?.mongo_db_map) {
    //   return { posts: [], totalPages: 0, totalCount: 0 }
    // }
    // console.log(data.mongo_db_map)
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = postsCollection(db)

    const skip = (page - 1) * limit
    const basePipeline = buildReviewPostsPipelineStages(filters)

    const facetResult = await collection
      .aggregate([
        ...basePipeline,
        {
          $facet: {
            data: [
              { $sort: { 'list.sourced_at': -1 } },
              { $skip: skip },
              { $limit: limit }
            ],
            total: [{ $count: 'total' }]
          }
        }
      ])
      .toArray()

    const posts = facetResult?.[0]?.data || []
    const totalCount = facetResult?.[0]?.total?.[0]?.total || 0

    const processedPosts = await Promise.all(posts.map((p) => normalizeReviewS3Post(p, db)))

    return { posts: processedPosts, totalCount, page, totalPages: Math.ceil(totalCount / limit) }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_cases,
      app_action: 'getPosts_review',
      message: 'review_cases.getPosts failed',
    }, e)
    console.error('MongoDB Error:', e)
    return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
  }
})

function escapeRegexLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Same compound shape as /cases Atlas index, plus review-cases caption + source URL fields. */
function buildReviewAtlasSearchCompound(searchText) {
  const fuzzy = {
    maxEdits: 2,
    prefixLength: 2,
    maxExpansions: 50,
  }
  return {
    should: [
      {
        text: {
          query: searchText,
          path: 'original_url.exact',
          score: { boost: { value: 10 } },
        },
      },
      {
        phrase: {
          query: searchText,
          path: 'original_url',
          score: { boost: { value: 5 } },
        },
      },
      {
        text: {
          query: searchText,
          path: [
            'content.caption',
            'author_snapshot.display_name',
            'original_url',
          ],
          fuzzy,
        },
      },
    ],
  }
}

function isLikelyUrlSearch(searchText) {
  const t = searchText.trim().toLowerCase()
  if (!t) return false
  return (
    /^https?:\/\//i.test(t) ||
    t.includes('facebook.com') ||
    t.includes('instagram.com') ||
    t.includes('youtube.com') ||
    t.includes('youtu.be') ||
    t.includes('twitter.com') ||
    t.includes('x.com') ||
    t.includes('reddit.com') ||
    /\.(com|net|org|io)\//.test(t)
  )
}

/** Build $or regex variants for pasted URLs (handles query strings, trailing slashes, path-only). */
function buildReviewUrlRegexMatch(searchText) {
  const trimmed = searchText.trim()
  if (!trimmed || trimmed.length < 4) return null

  const variants = new Set([trimmed])
  try {
    const parsed = new URL(trimmed)
    const pathOnly = parsed.pathname
    const withoutTrailingSlash = `${parsed.origin}${pathOnly}`.replace(/\/$/, '')
    const withTrailingSlash = `${withoutTrailingSlash}/`

    variants.add(withoutTrailingSlash)
    variants.add(withTrailingSlash)
    if (parsed.search) {
      variants.add(`${parsed.origin}${pathOnly}`)
    }
    if (pathOnly.length > 8) {
      variants.add(pathOnly)
      variants.add(pathOnly.replace(/\/$/, ''))
    }
  } catch {
    // Not a full URL — still allow substring match below
  }

  const orConditions = []
  for (const variant of variants) {
    const escaped = escapeRegexLiteral(variant)
    if (escaped.length < 4) continue
    const re = { $regex: escaped, $options: 'i' }
    orConditions.push(
      { original_url: re },
      { 'content.caption': re },
      { 'author_snapshot.display_name': re },
      { platform_post_id: re },
      { post_id: re },
    )
  }

  return orConditions.length > 0 ? { $or: orConditions } : null
}

function combineReviewMatchQuery(baseMatch, extraMatch) {
  if (!extraMatch) return baseMatch

  const clauses = []
  const { $and, ...rest } = baseMatch
  if (Object.keys(rest).length > 0) clauses.push(rest)
  if (Array.isArray($and) && $and.length > 0) clauses.push(...$and)
  clauses.push(extraMatch)

  if (clauses.length === 1) return clauses[0]
  return { $and: clauses }
}

async function runReviewRegexSearch(collection, searchText, limit, filters) {
  const urlMatch = buildReviewUrlRegexMatch(searchText)
  if (!urlMatch) return []

  const matchQuery = combineReviewMatchQuery(buildReviewPostsMatchQuery(filters), urlMatch)
  const { dateFilterStage, hasDateFilters } = buildReviewPostsDateFilterStage(filters)
  const riskMatch = buildReviewRiskBucketMatch(filters.aiRisk)

  const pipeline = [
    { $match: matchQuery },
    ...(hasDateFilters ? [{ $match: dateFilterStage }] : []),
    ...(riskMatch ? [riskMatch] : []),
    { $sort: { 'list.sourced_at': -1 } },
    { $limit: limit },
  ]

  try {
    return await collection.aggregate(pipeline).toArray()
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_cases,
      app_action: 'getReviewSemanticSearchPosts',
      message: 'Regex URL search failed',
    }, e)
    return []
  }
}

/** Hybrid Atlas text + vector search for review-cases (URL-focused, same index as /cases). */
export const getReviewSemanticSearchPosts = traceAction(
  'getReviewSemanticSearchPosts',
  async (_project_mongo_db_map, searchText, limit = 50, filters = {}) => {
    try {
      if (!searchText?.trim()) {
        return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
      }
      const query = searchText.trim()
      const { dbName } = await requireRole(['reviewer'])

      let queryVector = null
      try {
        const res = await fetch(`${process.env.EMBEDDING_SERVICE_API}/embed/text`, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: query }),
        })

        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data)) queryVector = data
          else if (data.embedding && Array.isArray(data.embedding)) queryVector = data.embedding
          else if (data.data && Array.isArray(data.data)) queryVector = data.data
        } else {
          logActionError({
            loki_stream: LOKI_STREAMS.review_cases,
            app_action: 'getReviewSemanticSearchPosts',
            message: 'Embedding API error',
            http_status: res.status,
          })
        }
      } catch (apiError) {
        logActionError({
          loki_stream: LOKI_STREAMS.review_cases,
          app_action: 'getReviewSemanticSearchPosts',
          message: 'Failed to fetch embeddings',
        }, apiError)
      }

      const client = await clientPromise
      const db = client.db(dbName)
      const collection = postsCollection(db)
      const embeddings = postEmbeddingsCollection(db)

      const matchQuery = buildReviewPostsMatchQuery(filters)
      const { dateFilterStage, hasDateFilters } = buildReviewPostsDateFilterStage(filters)
      const riskMatch = buildReviewRiskBucketMatch(filters.aiRisk)

      const postMatchStages = [
        { $match: matchQuery },
        ...(hasDateFilters ? [{ $match: dateFilterStage }] : []),
        ...(riskMatch ? [riskMatch] : []),
      ]

      const likelyUrl = isLikelyUrlSearch(query)

      let regexPosts = []
      if (likelyUrl) {
        regexPosts = await runReviewRegexSearch(collection, query, limit, filters)
      }

      let semanticPosts = []
      if (queryVector?.length > 0 && !likelyUrl) {
        const semanticPipeline = [
          {
            $vectorSearch: {
              index: 'vector_index',
              path: 'text_embedding',
              queryVector,
              numCandidates: 1000,
              limit: limit * 5,
            },
          },
          {
            $lookup: {
              from: COLLECTIONS.posts,
              localField: 'post_id',
              foreignField: '_id',
              as: 'post_doc',
            },
          },
          { $unwind: '$post_doc' },
          { $replaceRoot: { newRoot: '$post_doc' } },
          ...postMatchStages,
          {
            $addFields: {
              score: { $meta: 'vectorSearchScore' },
            },
          },
          { $match: { score: { $gt: 0.8 } } },
          { $sort: { score: -1, 'list.sourced_at': -1 } },
          { $limit: limit },
        ]

        try {
          semanticPosts = await embeddings.aggregate(semanticPipeline).toArray()
        } catch (e) {
          logActionError({
            loki_stream: LOKI_STREAMS.review_cases,
            app_action: 'getReviewSemanticSearchPosts',
            message: 'Semantic search aggregation failed',
          }, e)
        }
      }

      let textPosts = []
      if (!likelyUrl || regexPosts.length === 0) {
        const textPipeline = [
          {
            $search: {
              index: 'default',
              compound: buildReviewAtlasSearchCompound(query),
            },
          },
          ...postMatchStages,
          {
            $addFields: {
              score: { $meta: 'searchScore' },
            },
          },
          { $sort: { score: -1, 'list.sourced_at': -1 } },
          { $limit: limit },
        ]

        try {
          textPosts = await collection.aggregate(textPipeline).toArray()
        } catch (e) {
          logActionError({
            loki_stream: LOKI_STREAMS.review_cases,
            app_action: 'getReviewSemanticSearchPosts',
            message: 'Atlas text search aggregation failed',
          }, e)
        }
      }

      const mergedPosts = []
      const seenIds = new Set()

      const appendUnique = (list) => {
        for (const post of list) {
          const id = post._id.toString()
          if (!seenIds.has(id)) {
            mergedPosts.push(post)
            seenIds.add(id)
          }
        }
      }

      appendUnique(regexPosts)
      appendUnique(textPosts)
      appendUnique(semanticPosts)

      if (mergedPosts.length === 0) {
        const fallbackRegex = await runReviewRegexSearch(collection, query, limit, filters)
        appendUnique(fallbackRegex)
      }

      const finalLimitedPosts = mergedPosts.slice(0, limit)
      const processedPosts = await Promise.all(finalLimitedPosts.map((p) => normalizeReviewS3Post(p, db)))

      return {
        posts: processedPosts,
        totalCount: processedPosts.length,
        page: 1,
        totalPages: 1,
        search_metadata: {
          semantic_search: query,
          hybrid_search_used: !likelyUrl,
          url_regex_used: likelyUrl || regexPosts.length > 0,
        },
      }
    } catch (e) {
      logActionError({
        loki_stream: LOKI_STREAMS.review_cases,
        app_action: 'getReviewSemanticSearchPosts',
        message: 'getReviewSemanticSearchPosts failed',
      }, e)
      return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
    }
  }
)

// SHOWCASE A SINGLE POST link
export const getPostById = traceAction('getPostById', async (_project, case_id) => {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = postsCollection(db)

    const post = await collection.findOne({ _id: new ObjectId(case_id) })

    // Serialize and Sign URLs - use v3 schema normalization
    const processedPost = await normalizeReviewS3Post(post, db);

    return processedPost
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_cases,
      app_action: 'getPostById',
      message: 'review_cases.getPostById failed',
    }, e)
    console.error('MongoDB Error:', e)
    return null
  }
})

// CSV EXPORT
export const getAllPostsForExport = traceAction('getAllPostsForExport', async (_project_mongo_db_map, filters = {}) => {
  try {
    // const supabase = await createClient()
    // let { data } = await supabase
    //   .from('project')
    //   .select('*')
    //   .eq('project_name', project_name)
    //   .single()

    const { dbName } = await requireRole(['reviewer'])

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = postsCollection(db)

    const pipeline = [
      ...buildReviewPostsPipelineStages(filters),
      { $sort: { 'list.sourced_at': -1 } },
    ]

    const posts = await collection.aggregate(pipeline).toArray()

    const toExportDate = (value) => {
      if (!value) return ''
      const d = value instanceof Date ? value : new Date(value)
      return Number.isNaN(d.getTime()) ? '' : d.toISOString()
    }

    const processedPosts = posts.map(post => {
      const engagement = getPostEngagementMetrics(post)
      return {
        _id: { $oid: post._id.toString() },
        code: post.code || post.platform_post_id || post.post_id || '',
        content: post.content?.caption || post.content || post.caption || '',
        created_at: { $date: toExportDate(post.system?.created_at || post.created_at || post.metadata?.created_at) },
        engagement: {
          likes: engagement.likes,
          comments: engagement.comments,
          shares: engagement.shares,
          retweets: engagement.retweets,
          quotes: engagement.quotes,
          replies: engagement.replies,
          views: engagement.views,
          posted_at: { $date: toExportDate(post.list?.posted_at || post.engagement?.posted_at || post.metadata?.posted_date) }
        },
        media_urls: post.content?.media || post.media_urls || post.post_content?.media_urls || [],
        platform: post.platform ? post.platform.toLowerCase() : '',
        profile: {
          platform_user_id: post.author_snapshot?.platform_user_id || post.profile?.platform_user_id || null,
          username: post.author_snapshot?.username || post.profile?.username || post.author?.username || '',
          display_name: post.author_snapshot?.display_name || post.profile?.display_name || post.author?.name || '',
          profile_url: post.author_snapshot?.profile_url || post.profile?.profile_url || post.author?.url || '',
          is_verified: post.author_snapshot?.is_verified || post.profile?.is_verified || false
        },
        sourcing_date: { $date: toExportDate(post.list?.sourced_at || post.sourcing_date || post.metadata?.sourcing_date) },
        url: post.original_url || post.url || '',
        result_origin: post.result_origin && typeof post.result_origin === 'object' ? post.result_origin : {},
        analysis_results: post.analysis_results || {},
        review_details: post.review_details || {}
      }
    })

    // Strip BSON types / non-JSON values so the server action response serializes reliably
    return JSON.parse(JSON.stringify({ posts: processedPosts }))
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_cases,
      app_action: 'getAllPostsForExport',
      message: 'review_cases.getAllPostsForExport failed',
    }, e)
    console.error('MongoDB Export Error:', e)
    return { posts: [] }
  }
})

// EMAIL SENDING
async function sendNotification(notification_config, type) {
  try {
    if (type === "takedown_request") {
      if (!notification_config) {
        return { success: false, error: 'No notification configuration provided' }
      }
      const active_method = notification_config.active_method

      if (active_method === "email") {
        if (!notification_config.methods?.email?.receiving_email) {
          return { success: false, error: 'No receiving email configured' }
        }

        const send_email_to = notification_config.methods.email.receiving_email

        const html = `
          <p>Hi</p>
          <p>We have found an High Risk Post and would like to request a takedown.</p>
          <p> 
            Please review the post and take necessary actions on the url 
            <a href="https://overwatch.contrails.ai/cases/" target="_blank">Click here to go to dashboard</a>
          </p>
          <p>Best regards,</p>
          <p>Overwatch</p>
          <br/>
          <br/>
          <span> This is an automated email, please do not reply to this email.</span>
          `
        const { success, messageId, error } = await sendEmail({
          to: send_email_to,
          subject: 'New Takedown Request',
          html,
        })

        if (error) {
          logActionError({
            loki_stream: LOKI_STREAMS.review_cases,
            app_action: 'sendNotification',
            message: 'review_cases.sendNotification email failed',
          }, error)
          console.error('Email Error:', error)
          return { success: false, error: 'Failed to send email' }
        }

        return { success: true, messageId }
      }

      return { success: false, error: `Method ${active_method} not supported` }
    }

    return { success: false, error: `Notification type ${type} not supported` }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_cases,
      app_action: 'sendNotification',
      message: 'review_cases.sendNotification failed',
    }, error)
    console.error('Send Notification Error:', error)
    return { success: false, error: error.message }
  }
}

export const submitCaseReview = traceAction('submitCaseReview', async (_project, _client_details, prevState, formData) => {
  const { dbName, clientDetails, project } = await requireRole(['reviewer'])

  // 1. Fetch Client Details & Project Config FIRST
  // const { data: client_details } = await supabase
  //   .from('client_details')
  //   .select('*')
  //   .eq('id', user.id)
  //   .single()

  const mongoId = formData.get('mongo_id')

  if (!mongoId) {
    return { success: false, error: 'Missing Post ID' }
  }

  // Handle dynamic flags from project labels
  const flags = {}
  const threat_types = []
  const legal_codes = []

  // project.mongo_db_map is already fetched, but we might need project_details labels
  // Currently we use 'flag_' prefix from ReviewDetails.js
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('flag_')) {
      const labelName = key.replace('flag_', '')
      const isActive = value === 'on'
      flags[labelName] = isActive
      if (isActive) {
        threat_types.push(labelName)
      }
    } else if (key.startsWith('legal_code_')) {
      const codeName = key.replace('legal_code_', '')
      const isActive = value === 'on'
      if (isActive) {
        legal_codes.push({
          code: codeName,
          reasoning: formData.get(`legal_reasoning_${codeName}`) || ''
        })
      }
    }
  }

  // Determine Takedown Status
  // If "is_in_takedown" is checked, default to 'raised' (Reviewer Checked)
  // This signals the Client to approve/start it.
  // const isTakedown = formData.get('is_in_takedown') === 'on';
  const takedown_status = formData.get('takedown_status');
  const suggest_takedown = ["on", "yes", "true"].includes(formData.get('suggest_takedown')?.toLowerCase());
  const already_in_takedown = ['raised', 'under_review', 'accepted', 'rejected', 'suspended', 'resolution'].includes(takedown_status);

  let takedown_info = {}
  if (!already_in_takedown) {
    // if its not in takedown stage then update it to be None or Requested for a takedown
    takedown_info = {
      takedown_status: suggest_takedown ? "requested" : "None"
    }
  }
  else {
    // if its already raised before and has an ongoing takedown stage dont update it
    takedown_info = {
      takedown_status: takedown_status
    }
  }

  try {
    const client = await clientPromise
    const db = client.db(dbName) // Use Correct DB
    const collection = postsCollection(db)

    // 1. Fetch existing post to get previous state
    const existingPost = await collection.findOne({ _id: new ObjectId(mongoId) })
    if (!existingPost) {
      return { success: false, error: 'Post not found' }
    }

    const review_details = {
      threat_score: parseInt(formData.get('threat_score') || '0'),
      threat_types: threat_types.length > 0 ? threat_types : ['safe'],
      legal_codes: legal_codes,
      is_aigc: formData.get('is_aigc') === 'on',

      // Flags
      flags: flags,

      // Text & Lists
      poi_names: formData.get('poi_names') ? formData.get('poi_names').split(',').map(s => s.trim()).filter(Boolean) : [],
      reasoning: formData.get('reasoning'),
      simple_report_description: formData.get('simple_report_description') || null,
      reviewer_comments: formData.get('reviewer_comments'),

      // POI
      face_present: ["on", "yes", "true"].includes(formData.get('face_present')?.toLowerCase()),
      name_present: ["on", "yes", "true"].includes(formData.get('name_present')?.toLowerCase()),

      reviewed_at: existingPost.review_details?.reviewed_at || new Date().toISOString()
    }

    // Check if it was previously reviewed to handle metrics updates correctly
    const prevReview = existingPost.review_details;
    const isPreviouslyReviewed = existingPost.workflow?.review_status === 'reviewed'
      || (prevReview && prevReview.threat_score !== undefined);

    const previousReviewData = isPreviouslyReviewed ? {
      threat_score: prevReview.threat_score,
      threat_types: prevReview.threat_types || [prevReview.primary_threat_type || prevReview.threat_type], // Handle backward compat
      is_aigc: prevReview.is_aigc,
      platform: existingPost.platform
    } : null

    const reviewedAt = review_details.reviewed_at
    const effectiveScore = review_details.threat_score

    // 2. Update MongoDB
    const result = await collection.updateOne(
      { _id: new ObjectId(mongoId) },
      {
        $set: {
          review_details,
          takedown: {
            ...(existingPost.takedown || {}),
            status: takedown_info.takedown_status?.toLowerCase?.() === 'none'
              ? (existingPost.takedown?.status || 'none')
              : (takedown_info.takedown_status || existingPost.takedown?.status || 'none'),
          },
          'workflow.review_status': 'reviewed',
          'workflow.client_status': existingPost.workflow?.client_status || 'alerted',
          'workflow.alerted_at': existingPost.workflow?.alerted_at || new Date(),
          ...(!already_in_takedown
            ? { 'workflow.takedown_status': suggest_takedown ? 'requested' : 'none' }
            : {}),
          content_reviewed_by: clientDetails.email,
          'list.review_threat_score': effectiveScore,
          'list.effective_threat_score': effectiveScore,
          'list.reviewed_at': new Date(reviewedAt),
          'list.threat_types': review_details.threat_types,
          'list.violation_flags': review_details.threat_types,
          'system.updated_at': new Date(),
        },
      }
    )

    await insertCaseEvent(db, {
      entityType: 'post',
      entityId: mongoId,
      eventType: 'Case Alerted',
      actor: clientDetails.email,
      summary: 'Case Alerted',
      payload: { review_details, takedown_info },
    })

    // 3. Update Supabase Metrics
    const currentReviewData = {
      threat_score: review_details.threat_score,
      threat_types: review_details.threat_types,
      is_aigc: review_details.is_aigc,
      // takedown metrics are now handled in cases/actions.js
      platform: existingPost.platform ? existingPost.platform.toLowerCase() : 'instagram'
    }

    // update the metrics for the analytics dashboard (important)
    await updateDailyMetrics(project, currentReviewData, previousReviewData).catch(err =>
      logActionError({
        loki_stream: LOKI_STREAMS.review_cases,
        app_action: 'submitCaseReview',
        message: 'Background metrics update failed',
      }, err)
    )

    await markClientRequestedLinksEnlisted({
      post: existingPost,
      projectName: project?.project_name,
    }).catch((err) =>
      logActionError({
        loki_stream: LOKI_STREAMS.review_cases,
        app_action: 'submitCaseReview',
        message: 'client_requested_links enlisted update failed',
      }, err)
    )

    // SEND A NOTIFICATION TO THE CLIENT ON THEIR SUPPORTED FORMAT
    if (suggest_takedown && !already_in_takedown) {
      // client_details is already fetched at the top

      // GET THE CLIENT'S NOTIFICATION CONFIG CONNECTED TO THIS PROJECT
      // const {notification_config} = client_details;
      // const { data: notification_data } = await supabase
      //   .from('client_details')
      //   .select('notification_config')
      //   .eq('project_name', client_details.project_name)
      //   .eq('permission', 'client')
      //   .single()

      // const notification_config = notification_data?.notification_config

      // SEND NOTIFICATION TO CLIENT
      // const { success, error } = await sendNotification(notification_config, "takedown_request")
      // if (!success) {
      //   console.error('Failed to send notification:', error)
      // }
      // else {
      //   console.log('Notification sent successfully')
      // }

    }

    return {
      success: true,
      updatedFields: {
        review_details,
        takedown_info,
        processed: true,
        processed_at: new Date().toISOString()
      }
    }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_cases,
      app_action: 'submitCaseReview',
      message: 'review_cases.submitCaseReview failed',
    }, error)
    console.error('MongoDB Update Error:', error)
    return { success: false, error: error.message }
  }
})

export const getCaseMetadata = traceAction('getCaseMetadata', async (postId) => {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = postsCollection(db)

    const post = await collection.findOne({ post_id: postId })

    if (!post || (!post.review_details && !post.takedown && !post.takedown_info)) {
      return null
    }

    return {
      review_details: post.review_details,
      takedown_info: buildTakedownInfoForUi(post),
      analysis_results: post.analysis_results
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_cases,
      app_action: 'getCaseMetadata',
      message: 'review_cases.getCaseMetadata failed',
    }, e)
    console.error('Error fetching case metadata:', e)
    return null
  }
})

export const initCaseImageUpload = traceAction('initCaseImageUpload', async (postId, fileMeta) => {
  try {
    const { dbName } = await requireRole(['reviewer'])

    if (!postId) {
      return { success: false, error: 'Missing Post ID' }
    }

    const { fileName, contentType, fileSize } = fileMeta || {}
    const validationError = validateReviewImageMeta({ contentType, fileSize })
    if (validationError) {
      return { success: false, error: validationError }
    }

    const sanitizedFileName = sanitizeUploadFileName(fileName)
    const s3Key = `case-images/${dbName}/${postId}/${Date.now()}-${sanitizedFileName}`
    const s3Url = buildS3PublicUrl(s3Key)
    const uploadUrl = await getSignedUploadUrl(s3Key, contentType)

    return { success: true, uploadUrl, s3Key, s3Url }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_cases,
      app_action: 'initCaseImageUpload',
      message: 'review_cases.initCaseImageUpload failed',
    }, error)
    console.error('initCaseImageUpload Error:', error)
    return { success: false, error: error.message }
  }
})

export const confirmCaseImageUpload = traceAction('confirmCaseImageUpload', async (postId, uploadMeta) => {
  try {
    const { dbName, clientDetails } = await requireRole(['reviewer'])

    if (!postId) {
      return { success: false, error: 'Missing Post ID' }
    }

    const { s3Key, s3Url, contentType } = uploadMeta || {}
    if (!s3Key || !s3Url || !contentType) {
      return { success: false, error: 'Missing upload metadata' }
    }

    const expectedPrefix = `case-images/${dbName}/${postId}/`
    if (!s3Key.startsWith(expectedPrefix)) {
      return { success: false, error: 'Invalid upload key' }
    }

    const head = await headS3Object(s3Key)
    if (!head) {
      return { success: false, error: 'Upload not found in S3' }
    }

    const sizeError = validateS3HeadSize(head, REVIEW_IMAGE_MAX_BYTES)
    if (sizeError) {
      return { success: false, error: sizeError }
    }

    const resolvedS3Url = buildS3PublicUrl(s3Key)

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = postsCollection(db)

    const existingPost = await collection.findOne(
      { _id: new ObjectId(postId) },
      { projection: { 'content.media': 1, 'post_content.media_urls': 1 } }
    )

    if (!existingPost) {
      return { success: false, error: 'Post not found' }
    }

    const existingMedia = getPostMediaItems(existingPost)
    const preservedMedia = existingMedia.filter((m) => !m?.uploaded_manually)
    const manualEntry = {
      s3_url: resolvedS3Url,
      media_type: contentType,
      uploaded_manually: true,
    }

    await collection.updateOne(
      { _id: new ObjectId(postId) },
      {
        $set: {
          'content.media': [...preservedMedia, manualEntry],
          'system.updated_at': new Date(),
        },
      }
    )

    await insertCaseEvent(db, {
      entityType: 'post',
      entityId: postId,
      eventType: 'Image Uploaded',
      actor: clientDetails.email,
      summary: 'Image uploaded manually for case',
    })

    const signedUrl = await getSignedImageUrl(resolvedS3Url)

    return { success: true, signedUrl }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_cases,
      app_action: 'confirmCaseImageUpload',
      message: 'review_cases.confirmCaseImageUpload failed',
    }, error)
    console.error('confirmCaseImageUpload Error:', error)
    return { success: false, error: error.message }
  }
})

export const deleteCaseImage = traceAction('deleteCaseImage', async (postId, _project, _clientDetails) => {
  try {
    const { dbName, clientDetails } = await requireRole(['reviewer'])

    if (!postId) {
      return { success: false, error: 'Missing Post ID' }
    }

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = postsCollection(db)

    const existingPost = await collection.findOne(
      { _id: new ObjectId(postId) },
      { projection: { 'content.media': 1, 'post_content.media_urls': 1 } }
    )

    if (!existingPost) {
      return { success: false, error: 'Post not found' }
    }

    const mediaUrls = getPostMediaItems(existingPost)

    // Best-effort: only delete manually uploaded files from S3 to avoid removing original scraped media
    for (const m of mediaUrls) {
      if (m?.uploaded_manually && m?.s3_url) {
        try {
          const url = new URL(m.s3_url)
          const key = url.pathname.substring(1)
          if (key) await deleteFileFromS3(key)
        } catch (err) {
          logActionError({
            loki_stream: LOKI_STREAMS.review_cases,
            app_action: 'deleteCaseImage',
            message: 'S3 delete failed (continuing)',
          }, err)
          console.error('S3 delete failed (continuing):', err)
        }
      }
    }

    const preservedMedia = mediaUrls.filter((m) => !m?.uploaded_manually)

    await collection.updateOne(
      { _id: new ObjectId(postId) },
      {
        $set: {
          'content.media': preservedMedia,
          'system.updated_at': new Date(),
        },
      }
    )

    await insertCaseEvent(db, {
      entityType: 'post',
      entityId: postId,
      eventType: 'Image Deleted',
      actor: clientDetails.email,
      summary: 'Image deleted manually for case',
    })

    return { success: true }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_cases,
      app_action: 'deleteCaseImage',
      message: 'review_cases.deleteCaseImage failed',
    }, error)
    console.error('deleteCaseImage Error:', error)
    return { success: false, error: error.message }
  }
})

export const updatePostVisibility = traceAction('updatePostVisibility', async (postId, _project, _clientDetails, status) => {
  try {
    const { dbName, clientDetails } = await requireRole(['reviewer'])

    if (!postId) {
      return { success: false, error: 'Missing Post ID' }
    }

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = postsCollection(db)

    await collection.updateOne(
      { _id: new ObjectId(postId) },
      {
        $set: {
          'workflow.visibility_status': status,
          'system.updated_at': new Date(),
        },
      }
    )

    await insertCaseEvent(db, {
      entityType: 'post',
      entityId: postId,
      eventType: 'Visibility Updated',
      actor: clientDetails.email,
      summary: `Visibility status updated to ${status}`,
      payload: { visibility_status: status },
    })

    return { success: true }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_cases,
      app_action: 'updatePostVisibility',
      message: 'review_cases.updatePostVisibility failed',
    }, error)
    console.error('updatePostVisibility Error:', error)
    return { success: false, error: error.message }
  }
})

export const deleteCase = traceAction('deleteCase', async (postId, _project, _clientDetails) => {
  try {
    const { dbName, clientDetails } = await requireRole(['reviewer'])

    if (!postId) {
      return { success: false, error: 'Missing Post ID' }
    }

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = postsCollection(db)

    // Fetch media to attempt S3 cleanup before deleting the document
    const existingPost = await collection.findOne(
      { _id: new ObjectId(postId) },
      { projection: { 'content.media': 1, 'post_content.media_urls': 1 } }
    )

    if (!existingPost) {
      return { success: false, error: 'Case not found' }
    }

    // Best-effort: delete any manually uploaded S3 files
    const mediaUrls = existingPost?.content?.media || existingPost?.post_content?.media_urls || []
    for (const m of mediaUrls) {
      if (m?.uploaded_manually && m?.s3_url) {
        try {
          const url = new URL(m.s3_url)
          const key = url.pathname.substring(1)
          if (key) await deleteFileFromS3(key)
        } catch (err) {
          logActionError({
            loki_stream: LOKI_STREAMS.review_cases,
            app_action: 'deleteCase',
            message: 'S3 delete failed (continuing)',
          }, err)
          console.error('S3 delete failed (continuing):', err)
        }
      }
    }

    // Remove post from all topic memberships before hard-delete
    await removePostFromAllTopics(db, postId)

    await insertCaseEvent(db, {
      entityType: 'post',
      entityId: postId,
      eventType: 'Case Deleted',
      actor: clientDetails.email,
      summary: `Case deleted by ${clientDetails.email}`,
    })

    await postEmbeddingsCollection(db).deleteOne({ post_id: new ObjectId(postId) })

    // Hard-delete the document (case_events retained for audit trail)
    await collection.deleteOne({ _id: new ObjectId(postId) })

    console.log(`Case ${postId} deleted by ${clientDetails.email}`)

    return { success: true }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_cases,
      app_action: 'deleteCase',
      message: 'review_cases.deleteCase failed',
    }, error)
    console.error('deleteCase Error:', error)
    return { success: false, error: error.message }
  }
})

export const runAIAnalysis = traceAction('runAIAnalysis', async (postId, _project, _clientDetails) => {
  try {
    const { dbName, clientDetails } = await requireRole(['reviewer'])

    if (!postId) {
      return { success: false, error: 'Missing Post ID' }
    }

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = postsCollection(db)

    const existingPost = await collection.findOne(
      { _id: new ObjectId(postId) },
      { projection: { analysis_correction_request: 1, analysis_correction_requests: 1 } }
    )

    if (!existingPost) {
      return { success: false, error: 'Post not found' }
    }

    if (isActiveCorrectionRequest(getCorrectionRequest(existingPost))) {
      return { success: false, error: 'An AI correction is in progress. Check correction status or cancel it first.' }
    }

    const response = await sendContentModerationSqsMessage(dbName, COLLECTIONS.posts, postId);
    
    if (!response) {
      return { success: false, error: 'AI analysis queue not configured' }
    }

    await insertCaseEvent(db, {
      entityType: 'post',
      entityId: postId,
      eventType: 'AI Analysis Requested',
      actor: clientDetails.email,
      summary: 'AI analysis queued for post',
    })

    return { success: true }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_cases,
      app_action: 'runAIAnalysis',
      message: 'review_cases.runAIAnalysis failed',
    }, error)
    console.error('runAIAnalysis Error:', error)
    return { success: false, error: error.message }
  }
})

function hasNonEmptyAnalysisResults(analysis) {
  return analysis && typeof analysis === 'object' && Object.keys(analysis).length > 0
}

async function markCorrectionRequestFailed(collection, postId, correctionRequestId, errorMessage) {
  await collection.updateOne(
    { _id: new ObjectId(postId), 'analysis_correction_request.id': correctionRequestId },
    {
      $set: {
        'analysis_correction_request.status': 'failed',
        'analysis_correction_request.error': errorMessage,
        'analysis_correction_request.completed_at': new Date().toISOString(),
      },
    }
  )
}

async function queueCorrectionRevision({
  collection,
  db,
  dbName,
  postId,
  clientDetails,
  correctionRequestId,
  correction,
  changesSummary,
}) {
  const correctionRequest = {
    id: correctionRequestId,
    status: 'pending',
    requested_at: new Date().toISOString(),
    requested_by: clientDetails?.email || 'unknown',
    correction,
    completed_at: null,
    error: null,
  }

  const result = await collection.updateOne(
    { _id: new ObjectId(postId) },
    {
      $set: {
        analysis_correction_request: correctionRequest,
        'system.updated_at': new Date(),
      },
    }
  )

  if (result.matchedCount === 0) {
    return { success: false, error: 'Post not found' }
  }

  if (result.modifiedCount === 0) {
    return { success: false, error: 'Failed to queue AI correction' }
  }

  await insertCaseEvent(db, {
    entityType: 'post',
    entityId: postId,
    eventType: 'AI Correction Queued',
    actor: clientDetails?.email || 'unknown',
    summary: changesSummary,
  })

  let sqsResponse
  try {
    sqsResponse = await sendContentModerationSqsMessage(dbName, COLLECTIONS.posts, postId, {
      mode: 'revision',
      correction_request_id: correctionRequestId,
    })
  } catch (sqsError) {
    const sqsMessage = sqsError.message || 'Failed to send correction to AI queue'
    await markCorrectionRequestFailed(collection, postId, correctionRequestId, sqsMessage)
    return { success: false, error: sqsMessage }
  }

  if (!sqsResponse) {
    await markCorrectionRequestFailed(
      collection,
      postId,
      correctionRequestId,
      'AI analysis queue not configured'
    )
    return { success: false, error: 'AI analysis queue not configured' }
  }

  return { success: true, correctionRequestId, correctionRequest }
}

export const requestAIAnalysisCorrection = traceAction(
  'requestAIAnalysisCorrection',
  async (postId, _project, clientDetails, payload) => {
    let correctionRequestId = null
    let collection = null
    let db = null

    try {
      const { dbName } = await requireRole(['reviewer'])

      if (!postId) {
        return { success: false, error: 'Missing Post ID' }
      }

      const { correctionRequestId: requestId, correction } = payload || {}
      correctionRequestId = requestId
      if (!correctionRequestId || !correction) {
        return { success: false, error: 'Invalid correction payload' }
      }

      const hasChanges =
        correction.update_note?.trim() ||
        correction.update_risk != null ||
        correction.add?.['AI violations']?.length > 0 ||
        correction.add?.['legal violations']?.length > 0 ||
        correction.remove?.['AI violations']?.length > 0 ||
        correction.remove?.['legal violations']?.length > 0

      if (!hasChanges) {
        return { success: false, error: 'No correction changes to send' }
      }

      const client = await clientPromise
      db = client.db(dbName)
      collection = postsCollection(db)

      const existingPost = await collection.findOne(
        { _id: new ObjectId(postId) },
        { projection: { analysis_results: 1 } }
      )

      if (!existingPost) {
        return { success: false, error: 'Post not found' }
      }

      if (!hasNonEmptyAnalysisResults(existingPost.analysis_results)) {
        return { success: false, error: 'No AI analysis exists for this case yet' }
      }

      const correctionRequest = {
        id: correctionRequestId,
        status: 'pending',
        requested_at: new Date().toISOString(),
        requested_by: clientDetails?.email || 'unknown',
        correction,
        completed_at: null,
        error: null,
      }

      const result = await collection.updateOne(
        {
          _id: new ObjectId(postId),
          $and: [
            {
              $or: [
                { analysis_correction_request: { $exists: false } },
                { 'analysis_correction_request.status': { $nin: ['pending', 'processing'] } },
              ],
            },
            {
              $or: [
                { analysis_correction_requests: { $exists: false } },
                { analysis_correction_requests: { $size: 0 } },
                {
                  analysis_correction_requests: {
                    $not: { $elemMatch: { status: { $in: ['pending', 'processing'] } } },
                  },
                },
              ],
            },
          ],
        },
        {
          $set: {
            analysis_correction_request: correctionRequest,
            'system.updated_at': new Date(),
          },
        }
      )

      if (result.matchedCount === 0) {
        const blocked = await collection.findOne(
          { _id: new ObjectId(postId) },
          { projection: { analysis_correction_request: 1, analysis_correction_requests: 1 } }
        )
        if (!blocked) {
          return { success: false, error: 'Post not found' }
        }
        const active = findActiveCorrectionRequest(blocked)
        return {
          success: false,
          error: 'An AI correction is already in progress for this case',
          activeCorrectionRequestId: active?.id || null,
        }
      }

      if (result.modifiedCount === 0) {
        return { success: false, error: 'Failed to queue AI correction' }
      }

      await insertCaseEvent(db, {
        entityType: 'post',
        entityId: postId,
        eventType: 'AI Correction Queued',
        actor: clientDetails?.email || 'unknown',
        summary: 'Human-requested AI analysis correction',
      })

      let sqsResponse
      try {
        sqsResponse = await sendContentModerationSqsMessage(dbName, COLLECTIONS.posts, postId, {
          mode: 'revision',
          correction_request_id: correctionRequestId,
        })
      } catch (sqsError) {
        const sqsMessage = sqsError.message || 'Failed to send correction to AI queue'
        await markCorrectionRequestFailed(collection, postId, correctionRequestId, sqsMessage)
        return { success: false, error: sqsMessage }
      }

      if (!sqsResponse) {
        await markCorrectionRequestFailed(
          collection,
          postId,
          correctionRequestId,
          'AI analysis queue not configured'
        )
        return { success: false, error: 'AI analysis queue not configured' }
      }

      return { success: true, correctionRequestId }
    } catch (error) {
      logActionError({
        loki_stream: LOKI_STREAMS.review_cases,
        app_action: 'requestAIAnalysisCorrection',
        message: 'review_cases.requestAIAnalysisCorrection failed',
      }, error)
      console.error('requestAIAnalysisCorrection Error:', error)
      return { success: false, error: error.message }
    }
  }
)

export const getAnalysisCorrectionStatus = traceAction(
  'getAnalysisCorrectionStatus',
  async (postId, correctionRequestId) => {
    try {
      const { dbName } = await requireRole(['reviewer'])

      if (!postId || !correctionRequestId) {
        return { success: false, error: 'Missing Post ID or correction request ID' }
      }

      const client = await clientPromise
      const db = client.db(dbName)
      const collection = postsCollection(db)

      const post = await collection.findOne(
        { _id: new ObjectId(postId) },
        { projection: { analysis_results: 1, analysis_correction_request: 1, analysis_correction_requests: 1 } }
      )

      if (!post) {
        return { success: false, error: 'Post not found' }
      }

      const request = getCorrectionRequest(post)

      if (!request || request.id !== correctionRequestId) {
        return {
          success: false,
          notFound: true,
          error: 'Correction request not found',
          currentRequest: request || null,
        }
      }

      return {
        success: true,
        status: request.status,
        error: request.error || null,
        analysis_results: post.analysis_results || {},
        completed_at: request.completed_at || null,
        correction_request: request,
      }
    } catch (error) {
      logActionError({
        loki_stream: LOKI_STREAMS.review_cases,
        app_action: 'getAnalysisCorrectionStatus',
        message: 'review_cases.getAnalysisCorrectionStatus failed',
      }, error)
      console.error('getAnalysisCorrectionStatus Error:', error)
      return { success: false, error: error.message }
    }
  }
)

export const restartAIAnalysisCorrection = traceAction(
  'restartAIAnalysisCorrection',
  async (postId, _project, clientDetails) => {
    try {
      const { dbName } = await requireRole(['reviewer'])

      if (!postId) {
        return { success: false, error: 'Missing Post ID' }
      }

      const client = await clientPromise
      const db = client.db(dbName)
      const collection = postsCollection(db)

      const existingPost = await collection.findOne(
        { _id: new ObjectId(postId) },
        { projection: { analysis_correction_request: 1, analysis_correction_requests: 1, analysis_results: 1 } }
      )

      if (!existingPost) {
        return { success: false, error: 'Post not found' }
      }

      if (!hasNonEmptyAnalysisResults(existingPost.analysis_results)) {
        return { success: false, error: 'No AI analysis exists for this case yet' }
      }

      const currentRequest = getCorrectionRequest(existingPost)
      const correction = currentRequest?.correction
      if (!correction) {
        return { success: false, error: 'No correction payload to restart' }
      }

      const correctionRequestId = crypto.randomUUID()
      const queued = await queueCorrectionRevision({
        collection,
        db,
        dbName,
        postId,
        clientDetails,
        correctionRequestId,
        correction,
        changesSummary: 'Reviewer restarted AI analysis correction',
      })

      if (!queued.success) {
        return queued
      }

      return {
        success: true,
        correctionRequestId,
        correctionRequest: queued.correctionRequest,
      }
    } catch (error) {
      logActionError({
        loki_stream: LOKI_STREAMS.review_cases,
        app_action: 'restartAIAnalysisCorrection',
        message: 'review_cases.restartAIAnalysisCorrection failed',
      }, error)
      console.error('restartAIAnalysisCorrection Error:', error)
      return { success: false, error: error.message }
    }
  }
)

export const cancelAIAnalysisCorrection = traceAction(
  'cancelAIAnalysisCorrection',
  async (postId, _project, clientDetails) => {
    try {
      const { dbName } = await requireRole(['reviewer'])

      if (!postId) {
        return { success: false, error: 'Missing Post ID' }
      }

      const client = await clientPromise
      const db = client.db(dbName)
      const collection = postsCollection(db)

      const existingPost = await collection.findOne(
        { _id: new ObjectId(postId) },
        { projection: { analysis_correction_request: 1, analysis_correction_requests: 1 } }
      )

      if (!existingPost) {
        return { success: false, error: 'Post not found' }
      }

      const currentRequest = getCorrectionRequest(existingPost)
      if (!currentRequest || !isActiveCorrectionRequest(currentRequest)) {
        return { success: false, error: 'No active correction to cancel' }
      }

      const now = new Date().toISOString()
      const cancelledRequest = {
        id: crypto.randomUUID(),
        status: 'failed',
        requested_at: currentRequest.requested_at || now,
        requested_by: currentRequest.requested_by || clientDetails?.email || 'unknown',
        correction: currentRequest.correction || null,
        completed_at: now,
        error: 'Cancelled by reviewer',
      }

      const result = await collection.updateOne(
        { _id: new ObjectId(postId) },
        {
          $set: {
            analysis_correction_request: cancelledRequest,
            'system.updated_at': new Date(now),
          },
        }
      )

      if (result.matchedCount === 0) {
        return { success: false, error: 'Post not found' }
      }

      await insertCaseEvent(db, {
        entityType: 'post',
        entityId: postId,
        eventType: 'AI Correction Cancelled',
        actor: clientDetails?.email || 'unknown',
        summary: 'Reviewer cancelled AI analysis correction',
      })

      return { success: true, correctionRequest: cancelledRequest }
    } catch (error) {
      logActionError({
        loki_stream: LOKI_STREAMS.review_cases,
        app_action: 'cancelAIAnalysisCorrection',
        message: 'review_cases.cancelAIAnalysisCorrection failed',
      }, error)
      console.error('cancelAIAnalysisCorrection Error:', error)
      return { success: false, error: error.message }
    }
  }
)
