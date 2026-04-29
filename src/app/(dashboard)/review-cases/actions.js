'use server'

import { createClient } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { redirect } from 'next/navigation'
import { ObjectId } from 'mongodb'
import { getSignedImageUrl, uploadFileToS3 } from '@/utils/aws/s3'
import { updateDailyMetrics } from '@/utils/supabase/metrics'
import { sendEmail } from '@/utils/email'
import { traceAction } from '@/utils/tracing'

export const normalized_S3_post = traceAction('normalized_S3_post', async (post) => {
  if (!post) return null;

  // Find S3 URL to sign from post_content.media_urls
  let s3UrlToSign = null;
  if (post?.post_content?.media_urls && post.post_content.media_urls.length > 0) {
    const firstMedia = post.post_content.media_urls[0];
    // Prefer thumbnail for videos, otherwise use s3_url
    s3UrlToSign = firstMedia.thumbnail_url || firstMedia.s3_url;
  }

  const signedUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null;

  // Map to frontend structure
  const normalized = {
    ...post,
    _id: post?._id?.toString() || post?.id?.toString() || '',
    created_at: post?.metadata?.created_at ? new Date(post.metadata.created_at).toISOString() : null,
    sourcing_date: post?.metadata?.sourcing_date ? new Date(post.metadata.sourcing_date).toISOString() : null,
    signedImageUrl: signedUrl,

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
})

export const getPosts = traceAction('getPosts_review', async (project_mongo_db_map, page = 1, limit = 20, filters = {}) => {
  try {

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
    const db = client.db(project_mongo_db_map)
    const collection = db.collection('Posts')

    const skip = (page - 1) * limit

    // Build query with filters
    const query = { _id: { $ne: null } }
    const andConditions = []

    // Filter by Review Status
    if (filters.status === 'pending') {
      andConditions.push({
        "review_details.threat_score": { $exists: false }
      })
    } else if (filters.status === 'reviewed') {
      andConditions.push({
        "review_details.threat_score": { $exists: true }
      })
    }

    // AI Analyzed Filter
    if (filters.aiAnalyzed) {
      andConditions.push({
        "analysis_results.risk_score": { $exists: true }
      })
    }
    // POI Detected Filter
    if (filters.poiDetected) {
      andConditions.push({
        $or: [
          { "analysis_results.poi_check.poi_name_found": true },
          { "analysis_results.poi_check.face_present": true }
        ]
      })
    }
    // Platform filter
    if (filters.platform && filters.platform !== 'all') {
      query.platform = { $regex: new RegExp(`^${filters.platform}\$`, 'i') }
    }

    if (andConditions.length > 0) {
      query.$and = andConditions
    }

    // SOURCED (INGESTED) AND POSTED (ORIGINAL) DATE FILTERS
    const matchStage = { ...query };
    const dateFilterStage = {};

    // Sourcing Date Filter (Ingested) -> metadata.created_at
    if (filters.sourcingDateStart || filters.sourcingDateEnd) {
      dateFilterStage.sort_sourced_at = {};
      if (filters.sourcingDateStart) {
        dateFilterStage.sort_sourced_at.$gte = new Date(filters.sourcingDateStart);
      }
      if (filters.sourcingDateEnd) {
        dateFilterStage.sort_sourced_at.$lte = new Date(filters.sourcingDateEnd);
      }
    }

    // Posting Date Filter (Original Date) -> engagement.posted_at / metadata.posted_date
    if (filters.postingDateStart || filters.postingDateEnd) {
      dateFilterStage.sort_posted_at = {};
      if (filters.postingDateStart) {
        dateFilterStage.sort_posted_at.$gte = new Date(filters.postingDateStart);
      }
      if (filters.postingDateEnd) {
        dateFilterStage.sort_posted_at.$lte = new Date(filters.postingDateEnd);
      }
    }

    const hasDateFilters = Object.keys(dateFilterStage).length > 0;

    const posts = await collection.aggregate([
      { $match: matchStage },
      { $project: { text_embedding: 0, image_embedding: 0 } },
      {
        $addFields: {
          sort_posted_at: {
            $convert: {
              input: { $ifNull: ["$engagement.posted_at", "$metadata.posted_date"] },
              to: "date",
              onError: {
                $toDate: { $toLong: { $ifNull: ["$engagement.posted_at", "$metadata.posted_date"] } }
              },
              onNull: null
            }
          },
          sort_sourced_at: {
            $convert: {
              input: "$metadata.created_at",
              to: "date",
              onError: { $toDate: { $toLong: "$metadata.created_at" } },
              onNull: null
            }
          }
        }
      },
      ...(hasDateFilters ? [{ $match: dateFilterStage }] : []),
      { $sort: { sort_sourced_at: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]).toArray();

    // Serialize and Sign URLs
    const processedPosts = await Promise.all(posts.map(normalized_S3_post));

    let totalCount;
    if (hasDateFilters) {
      const countResult = await collection.aggregate([
        { $match: matchStage },
        {
          $addFields: {
            sort_posted_at: {
              $convert: {
                input: { $ifNull: ["$engagement.posted_at", "$metadata.posted_date"] },
                to: "date",
                onError: {
                  $toDate: { $toLong: { $ifNull: ["$engagement.posted_at", "$metadata.posted_date"] } }
                },
                onNull: null
              }
            },
            sort_sourced_at: {
              $convert: {
                input: "$metadata.created_at",
                to: "date",
                onError: { $toDate: { $toLong: "$metadata.created_at" } },
                onNull: null
              }
            }
          }
        },
        { $match: dateFilterStage },
        { $count: "total" }
      ]).toArray();
      totalCount = countResult[0]?.total || 0;
    } else {
      totalCount = await collection.countDocuments(query)
    }

    return { posts: processedPosts, totalCount, page, totalPages: Math.ceil(totalCount / limit) }
  } catch (e) {
    console.error('MongoDB Error:', e)
    return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
  }
})

// SHOWCASE A SINGLE POST link
export const getPostById = traceAction('getPostById', async (project, case_id) => {
  try {
    const client = await clientPromise
    const db = client.db(project.mongo_db_map)
    const collection = db.collection('Posts')

    const post = await collection.findOne(
      { _id: new ObjectId(case_id) },
      { projection: { text_embedding: 0, image_embedding: 0 } }
    )

    // Serialize and Sign URLs - use new unified schema
    const processedPost = await normalized_S3_post(post);

    return processedPost
  } catch (e) {
    console.error('MongoDB Error:', e)
    return null
  }
})

// CSV EXPORT
export const getAllPostsForExport = traceAction('getAllPostsForExport', async (project_mongo_db_map, filters = {}) => {
  try {
    // const supabase = await createClient()
    // let { data } = await supabase
    //   .from('project')
    //   .select('*')
    //   .eq('project_name', project_name)
    //   .single()

    if (!project_mongo_db_map) {
      return { posts: [] }
    }

    const client = await clientPromise
    const db = client.db(project_mongo_db_map)
    const collection = db.collection('Posts')

    const query = { _id: { $ne: null } }
    const andConditions = []

    if (filters.status === 'pending') {
      andConditions.push({ "review_details.threat_score": { $exists: false } })
    } else if (filters.status === 'reviewed') {
      andConditions.push({ "review_details.threat_score": { $exists: true } })
    }

    if (filters.aiAnalyzed) {
      andConditions.push({ "analysis_results.risk_score": { $exists: true } })
    }

    if (filters.poiDetected) {
      andConditions.push({
        $or: [
          { "analysis_results.poi_check.poi_name_found": true },
          { "analysis_results.poi_check.face_present": true }
        ]
      })
    }

    if (filters.platform && filters.platform !== 'all') {
      query.platform = { $regex: new RegExp(`^${filters.platform}\$`, 'i') }
    }

    if (andConditions.length > 0) {
      query.$and = andConditions
    }

    const matchStage = { ...query }
    const dateFilterStage = {}

    // Sourcing Date Filter (Ingested) -> metadata.created_at
    if (filters.sourcingDateStart || filters.sourcingDateEnd) {
      dateFilterStage.sort_sourced_at = {};
      if (filters.sourcingDateStart) {
        dateFilterStage.sort_sourced_at.$gte = new Date(filters.sourcingDateStart);
      }
      if (filters.sourcingDateEnd) {
        dateFilterStage.sort_sourced_at.$lte = new Date(filters.sourcingDateEnd);
      }
    }

    // Posting Date Filter (Original Date) -> engagement.posted_at / metadata.posted_date
    if (filters.postingDateStart || filters.postingDateEnd) {
      dateFilterStage.sort_posted_at = {};
      if (filters.postingDateStart) {
        dateFilterStage.sort_posted_at.$gte = new Date(filters.postingDateStart);
      }
      if (filters.postingDateEnd) {
        dateFilterStage.sort_posted_at.$lte = new Date(filters.postingDateEnd);
      }
    }

    const hasDateFilters = Object.keys(dateFilterStage).length > 0;

    const pipeline = [
      { $match: matchStage },
      { $project: { text_embedding: 0, image_embedding: 0 } },
      {
        $addFields: {
          sort_posted_at: {
            $convert: {
              input: { $ifNull: ['$engagement.posted_at', '$metadata.posted_date'] },
              to: "date",
              onError: { $toDate: { $toLong: { $ifNull: ['$engagement.posted_at', '$metadata.posted_date'] } } }
            }
          },
          sort_sourced_at: {
            $convert: {
              input: "$metadata.created_at",
              to: "date",
              onError: { $toDate: { $toLong: "$metadata.created_at" } }
            }
          }
        }
      },
      ...(hasDateFilters ? [{ $match: dateFilterStage }] : []),
      { $sort: { sort_sourced_at: -1 } }
    ]

    const posts = await collection.aggregate(pipeline).toArray()

    const processedPosts = posts.map(post => ({
      _id: post._id.toString(),
      post_id: post.post_id || post.code || '',
      url: post.original_url || post.result_origin?.source_url || '',
      caption: post.post_content?.caption || post.caption || '',
      platform: post.platform ? post.platform.toLowerCase() : '',
      author_url: post.profile?.profile_url || post.author?.url || '',
      author_username: post.profile?.username || '',
      author_name: post.profile?.display_name || post.author?.name || '',
      posted_at: post.engagement?.posted_at ? new Date(post.engagement.posted_at).toISOString() : (post.metadata?.sourcing_date ? new Date(post.metadata.sourcing_date).toISOString() : ''),
      likes: post.engagement?.likes || 0,
      comments: post.engagement?.comments || 0,
      views: post.engagement?.views || 0,
      shares: post.engagement?.shares || 0,
      retweets: post.engagement?.retweets || 0,
      quotes: post.engagement?.quotes || 0,
      replies: post.engagement?.replies || 0,
      review_details: post.review_details || {}
    }))

    return { posts: processedPosts }
  } catch (e) {
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
          console.error('Email Error:', error)
          return { success: false, error: 'Failed to send email' }
        }

        return { success: true, messageId }
      }

      return { success: false, error: `Method ${active_method} not supported` }
    }

    return { success: false, error: `Notification type ${type} not supported` }
  } catch (error) {
    console.error('Send Notification Error:', error)
    return { success: false, error: error.message }
  }
}

export const submitCaseReview = traceAction('submitCaseReview', async (project, client_details, prevState, formData) => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Authentication required' }
  }

  // 1. Fetch Client Details & Project Config FIRST
  // const { data: client_details } = await supabase
  //   .from('client_details')
  //   .select('*')
  //   .eq('id', user.id)
  //   .single()

  if (!client_details?.project_name) {
    return { success: false, error: 'User not assigned to a project' }
  }

  // const { data: project } = await supabase
  //   .from('project')
  //   .select('project_name, mongo_db_map')
  //   .eq('project_name', client_details.project_name)
  //   .single()

  if (!project?.mongo_db_map) {
    return { success: false, error: 'Project database configuration missing' }
  }

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
    const db = client.db(project.mongo_db_map) // Use Correct DB
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
            updated_by: client_details.email,
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
      console.error('Background metrics update failed:', err)
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
    console.error('MongoDB Update Error:', error)
    return { success: false, error: error.message }
  }
})

export const getCaseMetadata = traceAction('getCaseMetadata', async (postId) => {
  try {
    const client = await clientPromise
    const db = client.db(process.env.MONGO_DB_NAME)
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
    console.error('Error fetching case metadata:', e)
    return null
  }
})

export const uploadCaseImage = traceAction('uploadCaseImage', async (postId, project, clientDetails, formData) => {
  try {
    if (!project?.mongo_db_map) {
      return { success: false, error: 'Project database configuration missing' }
    }

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
    const s3Key = `case-images/${project.mongo_db_map}/${postId}/${Date.now()}-${sanitizedFileName}`

    // 1. Upload to S3
    await uploadFileToS3(buffer, s3Key, fileType)

    // 2. Construct the full S3 URL
    const s3Url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`

    // 3. Update MongoDB — set post_content.media_urls with the new image
    const client = await clientPromise
    const db = client.db(project.mongo_db_map)
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
    console.error('uploadCaseImage Error:', error)
    return { success: false, error: error.message }
  }
})