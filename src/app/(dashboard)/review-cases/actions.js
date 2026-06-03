'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { getSignedImageUrl, uploadFileToS3, deleteFileFromS3 } from '@/utils/aws/s3'
import { sendContentModerationSqsMessage } from '@/utils/aws/sqs'
import { updateDailyMetrics } from '@/utils/supabase/metrics'
import { markClientRequestedLinksEnlisted } from '@/utils/clientRequestedLinks/server'
import { sendEmail } from '@/utils/email'
import { traceAction } from '@/utils/tracing'
import { requireRole } from '@/utils/auth-context'
import { logActionError, logActionWarn, LOKI_STREAMS } from '@/utils/otel-logger'

/** Local helper — not a traced server action (avoids per-row trace overhead on list loads). */
async function normalizeReviewS3Post(post) {
  if (!post) return null;

  // Find S3 URL to sign from post_content.media_urls
  const firstMedia = post?.post_content?.media_urls?.[0] || null;
  // Prefer thumbnail for videos, otherwise use s3_url
  const s3UrlToSign = firstMedia ? (firstMedia.thumbnail_url || firstMedia.s3_url) : null;

  const signedUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null;

  // Map to frontend structure
  const normalized = {
    ...post,
    _id: post?._id?.toString() || post?.id?.toString() || '',
    created_at: post?.metadata?.created_at ? new Date(post.metadata.created_at).toISOString() : null,
    sourcing_date: post?.metadata?.sourcing_date ? new Date(post.metadata.sourcing_date).toISOString() : null,
    signedImageUrl: signedUrl,
    uploadedManually: firstMedia?.uploaded_manually === true,

    // Content
    caption: post.post_content?.caption || post.post_content?.content || '',

    // Profile
    user: {
      username: post.profile?.username || 'Unknown',
      full_name: post.profile?.display_name || '',
      profile_pic_url: post.profile?.profile_pic_url || '', // Note: DB field is currently profile_url or profile_pic_url, need to check specific sample if strictly one. Samples show 'profile_url' in facebook/instagram but 'profile_pic' in x. Let's try to grab what's there.
      is_verified: post.profile?.is_verified || false
    },
    // Fix for profile pic url variation in samples if needed, but strict mapping:
    // Instagram sample: profile_pic_url
    // Facebook sample: profile_url
    // X sample: profile_pic (null in sample)
    // Let's robustly grab it below:

    // Timestamp
    taken_at: post.engagement?.posted_at ? Math.floor(new Date(post.engagement.posted_at).getTime() / 1000) : null,

    // Stats
    stats: {
      like_count: post.engagement?.likes || 0,
      comment_count: post.engagement?.comments || 0,
      view_count: post.engagement?.views || 0,
      share_count: post.engagement?.shares || 0,
      retweet_count: post.engagement?.retweets || 0,
      quote_count: post.engagement?.quotes || 0,
      reply_count: post.engagement?.replies || 0
    },

    // AI ANALYSIS
    analysis_results: post.analysis_results || {},
    review_details: post.review_details || {},
    takedown_info: post.takedown_info || {},

    // Metadata
    created_at: post.metadata?.created_at ? new Date(post.metadata.created_at).toISOString() : null,
    sourcing_date: post.metadata?.sourcing_date ? new Date(post.metadata.sourcing_date).toISOString() : null,
    posted_date: post.engagement?.posted_at ? new Date(post.engagement.posted_at).toISOString() : post.metadata?.posted_date ? new Date(post.metadata.posted_date).toISOString() : null,
    updated_at: post.metadata?.updated_at ? new Date(post.metadata.updated_at).toISOString() : null,

    // Platform
    platform: post.platform ? post.platform.toLowerCase() : 'instagram',
    visibility_status: post.visibility_status || 'active'
  };

  // Robust profile pic handling
  normalized.user.profile_pic_url = post.profile?.profile_pic_url || post.profile?.profile_url || post.profile?.profile_pic || '';

  return JSON.parse(JSON.stringify(normalized));
}

function analysisResultsKeyCountExpr() {
  return { $size: { $objectToArray: { $ifNull: ['$analysis_results', {}] } } }
}

function normalizeAiAnalyzedFilter(value) {
  if (value === 'analyzed' || value === true || value === 'true') return 'analyzed'
  if (value === 'not_analyzed') return 'not_analyzed'
  return 'all'
}

const ONLINE_VISIBILITY_VALUES = ['active', 'online', 'available']

function buildReviewPostsDateFilterStage(filters = {}) {
  const dateFilterStage = {}

  if (filters.sourcingDateStart || filters.sourcingDateEnd) {
    dateFilterStage.sort_sourced_at = {}
    if (filters.sourcingDateStart) {
      dateFilterStage.sort_sourced_at.$gte = new Date(filters.sourcingDateStart)
    }
    if (filters.sourcingDateEnd) {
      dateFilterStage.sort_sourced_at.$lte = new Date(filters.sourcingDateEnd)
    }
  }

  if (filters.postingDateStart || filters.postingDateEnd) {
    dateFilterStage.sort_posted_at = {}
    if (filters.postingDateStart) {
      dateFilterStage.sort_posted_at.$gte = new Date(filters.postingDateStart)
    }
    if (filters.postingDateEnd) {
      dateFilterStage.sort_posted_at.$lte = new Date(filters.postingDateEnd)
    }
  }

  return {
    dateFilterStage,
    hasDateFilters: Object.keys(dateFilterStage).length > 0,
  }
}

function buildReviewPostsAddFieldsStage() {
  return {
    $addFields: {
      sort_posted_at: {
        $convert: {
          input: { $ifNull: ['$engagement.posted_at', '$metadata.posted_date'] },
          to: 'date',
          onError: {
            $toDate: { $toLong: { $ifNull: ['$engagement.posted_at', '$metadata.posted_date'] } }
          },
          onNull: null,
        },
      },
      sort_sourced_at: {
        $convert: {
          input: '$metadata.created_at',
          to: 'date',
          onError: { $toDate: { $toLong: '$metadata.created_at' } },
          onNull: null,
        },
      },
      // Human review score wins; otherwise AI threat_score, then legacy risk_score
      effective_threat_score: {
        $convert: {
          input: {
            $ifNull: [
              '$review_details.threat_score',
              '$analysis_results.threat_score',
              '$analysis_results.risk_score',
            ],
          },
          to: 'double',
          onError: null,
          onNull: null,
        },
      },
    },
  }
}

/** high > 95, medium > 75 && <= 95, low > 40 && <= 75, safe <= 40 */
function buildReviewRiskBucketMatch(aiRisk) {
  const risk = aiRisk && aiRisk !== 'all' ? String(aiRisk).toLowerCase() : null
  if (!risk) return null
  if (risk === 'high') return { $match: { effective_threat_score: { $gt: 95 } } }
  if (risk === 'medium') return { $match: { effective_threat_score: { $gt: 75, $lte: 95 } } }
  if (risk === 'low') return { $match: { effective_threat_score: { $gt: 40, $lte: 75 } } }
  if (risk === 'safe') return { $match: { effective_threat_score: { $lte: 40 } } }
  return null
}

function buildReviewPostsPipelineStages(filters = {}) {
  const { dateFilterStage, hasDateFilters } = buildReviewPostsDateFilterStage(filters)
  const riskMatch = buildReviewRiskBucketMatch(filters.aiRisk)

  return [
    { $match: buildReviewPostsMatchQuery(filters) },
    { $project: { text_embedding: 0, image_embedding: 0 } },
    buildReviewPostsAddFieldsStage(),
    ...(hasDateFilters ? [{ $match: dateFilterStage }] : []),
    ...(riskMatch ? [riskMatch] : []),
  ]
}

/** Shared $match query for review-cases list + export (keep filters in sync). */
function buildReviewPostsMatchQuery(filters = {}) {
  const query = { _id: { $ne: null } }
  const andConditions = []

  if (filters.status === 'pending') {
    andConditions.push({ 'review_details.threat_score': { $exists: false } })
  } else if (filters.status === 'reviewed') {
    andConditions.push({ 'review_details.threat_score': { $exists: true } })
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
      query.visibility_status = 'down'
    } else if (
      visibilityLower === 'active' ||
      visibilityLower === 'online' ||
      visibilityLower === 'available'
    ) {
      andConditions.push({
        $or: [
          { visibility_status: { $in: ONLINE_VISIBILITY_VALUES } },
          { visibility_status: { $exists: false } },
          { visibility_status: null },
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
    const collection = db.collection('Posts')

    const skip = (page - 1) * limit
    const basePipeline = buildReviewPostsPipelineStages(filters)

    const facetResult = await collection
      .aggregate([
        ...basePipeline,
        {
          $facet: {
            data: [
              { $sort: { sort_sourced_at: -1 } },
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

    const processedPosts = await Promise.all(posts.map((p) => normalizeReviewS3Post(p)))

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

// SHOWCASE A SINGLE POST link
export const getPostById = traceAction('getPostById', async (_project, case_id) => {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = db.collection('Posts')

    const post = await collection.findOne(
      { _id: new ObjectId(case_id) },
      { projection: { text_embedding: 0, image_embedding: 0 } }
    )

    // Serialize and Sign URLs - use new unified schema
    const processedPost = await normalizeReviewS3Post(post);

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
    const collection = db.collection('Posts')

    const pipeline = [
      ...buildReviewPostsPipelineStages(filters),
      { $sort: { sort_sourced_at: -1 } },
    ]

    const posts = await collection.aggregate(pipeline).toArray()

    const toExportDate = (value) => {
      if (!value) return ''
      const d = value instanceof Date ? value : new Date(value)
      return Number.isNaN(d.getTime()) ? '' : d.toISOString()
    }

    const processedPosts = posts.map(post => ({
      _id: { $oid: post._id.toString() },
      code: post.code || post.post_id || '',
      content: post.content || post.post_content?.content || post.caption || '',
      created_at: { $date: toExportDate(post.created_at || post.metadata?.created_at) },
      engagement: {
        likes: post.engagement?.likes ?? post.stats?.like_count ?? 0,
        comments: post.engagement?.comments ?? post.stats?.comment_count ?? 0,
        shares: post.engagement?.shares ?? post.stats?.share_count ?? 0,
        retweets: post.engagement?.retweets ?? post.stats?.retweet_count ?? 0,
        quotes: post.engagement?.quotes ?? post.stats?.quote_count ?? 0,
        replies: post.engagement?.replies ?? post.stats?.reply_count ?? 0,
        views: post.engagement?.views ?? post.stats?.view_count ?? 0,
        posted_at: { $date: toExportDate(post.engagement?.posted_at || post.metadata?.posted_date) }
      },
      media_urls: post.media_urls || post.post_content?.media_urls || [],
      platform: post.platform ? post.platform.toLowerCase() : '',
      profile: {
        platform_user_id: post.profile?.platform_user_id || null,
        username: post.profile?.username || post.author?.username || '',
        display_name: post.profile?.display_name || post.author?.name || '',
        profile_url: post.profile?.profile_url || post.author?.url || '',
        is_verified: post.profile?.is_verified || false
      },
      sourcing_date: { $date: toExportDate(post.sourcing_date || post.metadata?.sourcing_date) },
      url: post.original_url || post.url || post.result_origin?.source_url || '',
      analysis_results: post.analysis_results || {},
      review_details: post.review_details || {}
    }))

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
    const collection = db.collection('Posts')

    // 1. Fetch existing post to get previous state
    const existingPost = await collection.findOne(
      { _id: new ObjectId(mongoId) },
      { projection: { text_embedding: 0, image_embedding: 0 } }
    )
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
      reviewer_comments: formData.get('reviewer_comments'),

      // POI
      face_present: ["on", "yes", "true"].includes(formData.get('face_present')?.toLowerCase()),
      name_present: ["on", "yes", "true"].includes(formData.get('name_present')?.toLowerCase()),

      reviewed_at: existingPost.review_details?.reviewed_at || new Date().toISOString()
    }

    // Check if it was previously reviewed to handle metrics updates correctly
    // We only treat it as an update if it has a valid threat_score from a previous session
    const prevReview = existingPost.review_details;
    const isPreviouslyReviewed = existingPost.processed && prevReview && prevReview.threat_score !== undefined;

    const previousReviewData = isPreviouslyReviewed ? {
      threat_score: prevReview.threat_score,
      threat_types: prevReview.threat_types || [prevReview.primary_threat_type || prevReview.threat_type], // Handle backward compat
      is_aigc: prevReview.is_aigc,
      platform: existingPost.platform
    } : null

    // 2. Update MongoDB
    const result = await collection.updateOne(
      { _id: new ObjectId(mongoId) },
      {
        $set: {
          review_details,
          takedown_info,
          processed: true,
          processed_at: new Date(),
          "metadata.updated_at": new Date().toISOString()
        },
        $push: {
          "metadata.update_history": {
            updated_at: new Date(),
            updated_by: clientDetails.email,
            changes_summary: "Case Alerted "
          }
        }
      }
    )

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
    const collection = db.collection('Posts')

    const post = await collection.findOne(
      { post_id: postId },
      { projection: { text_embedding: 0, image_embedding: 0 } }
    )

    if (!post || (!post.review_details && !post.takedown_info)) {
      return null
    }

    return {
      review_details: post.review_details,
      takedown_info: post.takedown_info,
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

export const uploadCaseImage = traceAction('uploadCaseImage', async (postId, _project, _clientDetails, formData) => {
  try {
    const { dbName, clientDetails } = await requireRole(['reviewer'])

    if (!postId) {
      return { success: false, error: 'Missing Post ID' }
    }

    const file = formData.get('file')
    if (!file) return { success: false, error: 'No file provided' }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return { success: false, error: 'Only image files are allowed' }
    }

    // Validate file size (max 10MB)
    const MAX_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return { success: false, error: 'File size exceeds 10MB limit' }
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const fileType = file.type
    const s3Key = `case-images/${dbName}/${postId}/${Date.now()}-${sanitizedFileName}`

    // 1. Upload to S3
    await uploadFileToS3(buffer, s3Key, fileType)

    // 2. Construct the full S3 URL
    const s3Url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`

    // 3. Update MongoDB — set post_content.media_urls with the new image
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = db.collection('Posts')

    await collection.updateOne(
      { _id: new ObjectId(postId) },
      {
        $set: {
          'post_content.media_urls': [{
            s3_url: s3Url,
            media_type: fileType,
            uploaded_manually: true
          }],
          'metadata.updated_at': new Date().toISOString()
        },
        $push: {
          'metadata.update_history': {
            updated_at: new Date(),
            updated_by: clientDetails.email,
            changes_summary: 'Image uploaded manually for case'
          }
        }
      }
    )

    // 4. Generate signed URL for immediate display
    const signedUrl = await getSignedImageUrl(s3Url)

    return { success: true, signedUrl }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_cases,
      app_action: 'uploadCaseImage',
      message: 'review_cases.uploadCaseImage failed',
    }, error)
    console.error('uploadCaseImage Error:', error)
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
    const collection = db.collection('Posts')

    const existingPost = await collection.findOne(
      { _id: new ObjectId(postId) },
      { projection: { 'post_content.media_urls': 1 } }
    )

    if (!existingPost) {
      return { success: false, error: 'Post not found' }
    }

    const mediaUrls = existingPost?.post_content?.media_urls || []

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

    await collection.updateOne(
      { _id: new ObjectId(postId) },
      {
        $set: {
          'post_content.media_urls': [],
          'metadata.updated_at': new Date().toISOString()
        },
        $push: {
          'metadata.update_history': {
            updated_at: new Date(),
            updated_by: clientDetails.email,
            changes_summary: 'Image deleted manually for case'
          }
        }
      }
    )

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
    const collection = db.collection('Posts')

    await collection.updateOne(
      { _id: new ObjectId(postId) },
      {
        $set: {
          visibility_status: status,
          "metadata.updated_at": new Date().toISOString()
        },
        $push: {
          "metadata.update_history": {
            updated_at: new Date(),
            updated_by: clientDetails.email,
            changes_summary: `Visibility status updated to ${status}`
          }
        }
      }
    )

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
    const collection = db.collection('Posts')

    // Fetch media to attempt S3 cleanup before deleting the document
    const existingPost = await collection.findOne(
      { _id: new ObjectId(postId) },
      { projection: { 'post_content.media_urls': 1 } }
    )

    if (!existingPost) {
      return { success: false, error: 'Case not found' }
    }

    // Best-effort: delete any manually uploaded S3 files
    const mediaUrls = existingPost?.post_content?.media_urls || []
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

    // Hard-delete the document
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
    const { dbName } = await requireRole(['reviewer'])

    if (!postId) {
      return { success: false, error: 'Missing Post ID' }
    }

    const response = await sendContentModerationSqsMessage(dbName, 'Posts', postId);
    
    if (!response) {
      return { success: false, error: 'AI analysis queue not configured' }
    }

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
