'use server'

import { createClient } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { redirect } from 'next/navigation'
import { ObjectId } from 'mongodb'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { updateDailyMetrics } from '@/utils/supabase/metrics'
import { sendEmail } from '@/utils/email'
import { traceAction } from '@/utils/tracing'

export const normalized_S3_post = traceAction('normalized_S3_post', async (post) => {
  // Find S3 URL to sign from post_content.media_urls
  let s3UrlToSign = null;
  if (post.post_content?.media_urls && post.post_content.media_urls.length > 0) {
    const firstMedia = post.post_content.media_urls[0];
    // Prefer thumbnail for videos, otherwise use s3_url
    s3UrlToSign = firstMedia.thumbnail_url || firstMedia.s3_url;
  }

  const signedUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null;

  // Map to frontend structure
  const normalized = {
    ...post,
    _id: post._id.toString(),
    created_at: post.metadata?.created_at ? new Date(post.metadata.created_at).toISOString() : null,
    sourcing_date: post.metadata?.sourcing_date ? new Date(post.metadata.sourcing_date).toISOString() : null,
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

    // Platform
    platform: post.platform ? post.platform.toLowerCase() : 'instagram'
  };

  // Robust profile pic handling
  normalized.user.profile_pic_url = post.profile?.profile_pic_url || post.profile?.profile_url || post.profile?.profile_pic || '';

  return normalized;
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
    const query = { $and: [] }

    // Filter by Review Status
    if (filters.status === 'pending') {
      query.$and.push({
        "review_details.threat_score": { $exists: false }
      })
    } else if (filters.status === 'reviewed') {
      query.$and.push({
        "review_details.threat_score": { $exists: true }
      })
    }

    // AI Analyzed Filter
    if (filters.aiAnalyzed) {
      query.$and.push({
        "analysis_results.risk_score": { $exists: true }
      })
    }

    // POI Detected Filter
    if (filters.poiDetected) {
      query.$and.push({
        $or: [
          { "analysis_results.poi_check.poi_name_found": true },
          { "analysis_results.poi_check.face_present": true }
        ]
      })
    }

    // Platform filter - handle both explicit platform field and default to instagram
    if (filters.platform && filters.platform !== 'all') {
      query.$and.push({ platform: { $regex: new RegExp(`^${filters.platform}\$`, 'i') } })
    }

    // Sourcing Date Filter (metadata.sourcing_date)
    // Stored as BSON Date objects in MongoDB
    if (filters.sourcingDateStart || filters.sourcingDateEnd) {
      const sourcingQuery = {}
      if (filters.sourcingDateStart) {
        const start = new Date(`${filters.sourcingDateStart}T00:00:00.000Z`)
        if (!isNaN(start)) sourcingQuery.$gte = start
      }
      if (filters.sourcingDateEnd) {
        const end = new Date(`${filters.sourcingDateEnd}T23:59:59.999Z`)
        if (!isNaN(end)) sourcingQuery.$lte = end
      }

      if (Object.keys(sourcingQuery).length > 0) {
        query.$and.push({ 'metadata.sourcing_date': sourcingQuery })
      }
    }

    // DB Ingest Date Filter (metadata.created_at)
    // Stored as BSON Date objects in MongoDB
    if (filters.dbDateStart || filters.dbDateEnd) {
      const dbDateQuery = {}
      if (filters.dbDateStart) {
        const start = new Date(`${filters.dbDateStart}T00:00:00.000Z`)
        if (!isNaN(start)) dbDateQuery.$gte = start
      }
      if (filters.dbDateEnd) {
        const end = new Date(`${filters.dbDateEnd}T23:59:59.999Z`)
        if (!isNaN(end)) dbDateQuery.$lte = end
      }

      if (Object.keys(dbDateQuery).length > 0) {
        query.$and.push({ 'metadata.created_at': dbDateQuery })
      }
    }

    // Ensure we don't have an empty $and
    const finalQuery = query.$and.length > 0 ? query : {}

    const posts = await collection.find(finalQuery)
      .sort({ 'metadata.created_at': -1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    // Serialize and Sign URLs - use new unified schema
    const processedPosts = await Promise.all(posts.map(normalized_S3_post));

    const totalCount = await collection.countDocuments(finalQuery)

    return { posts: processedPosts, totalCount, page, totalPages: Math.ceil(totalCount / limit) }
  } catch (e) {
    console.error('MongoDB Error:', e)
    return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
  }
})

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

    // Build query with filters (same logic as getPosts)
    const query = { $and: [] }

    if (filters.status === 'pending') {
      query.$and.push({ "review_details.threat_score": { $exists: false } })
    } else if (filters.status === 'reviewed') {
      query.$and.push({ "review_details.threat_score": { $exists: true } })
    }

    if (filters.aiAnalyzed) {
      query.$and.push({ "analysis_results.risk_score": { $exists: true } })
    }

    if (filters.poiDetected) {
      query.$and.push({
        $or: [
          { "analysis_results.poi_check.poi_name_found": true },
          { "analysis_results.poi_check.face_present": true }
        ]
      })
    }

    if (filters.platform && filters.platform !== 'all') {
      query.$and.push({ platform: { $regex: new RegExp(`^${filters.platform}\$`, 'i') } })
    }

    if (filters.sourcingDateStart || filters.sourcingDateEnd) {
      const sourcingQuery = {}
      if (filters.sourcingDateStart) {
        const start = new Date(`${filters.sourcingDateStart}T00:00:00.000Z`)
        if (!isNaN(start)) sourcingQuery.$gte = start
      }
      if (filters.sourcingDateEnd) {
        const end = new Date(`${filters.sourcingDateEnd}T23:59:59.999Z`)
        if (!isNaN(end)) sourcingQuery.$lte = end
      }
      if (Object.keys(sourcingQuery).length > 0) {
        query.$and.push({ 'metadata.sourcing_date': sourcingQuery })
      }
    }

    if (filters.dbDateStart || filters.dbDateEnd) {
      const dbDateQuery = {}
      if (filters.dbDateStart) {
        const start = new Date(`${filters.dbDateStart}T00:00:00.000Z`)
        if (!isNaN(start)) dbDateQuery.$gte = start
      }
      if (filters.dbDateEnd) {
        const end = new Date(`${filters.dbDateEnd}T23:59:59.999Z`)
        if (!isNaN(end)) dbDateQuery.$lte = end
      }
      if (Object.keys(dbDateQuery).length > 0) {
        query.$and.push({ 'metadata.created_at': dbDateQuery })
      }
    }

    const finalQuery = query.$and.length > 0 ? query : {}

    const posts = await collection.find(finalQuery)
      .sort({ 'metadata.created_at': -1 })
      .toArray()

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
      replies: post.engagement?.replies || 0
    }))

    return { posts: processedPosts }
  } catch (e) {
    console.error('MongoDB Export Error:', e)
    return { posts: [] }
  }
})


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

export const submitCaseReview = traceAction('submitCaseReview', async (prevState, formData) => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Authentication required' }
  }

  // 1. Fetch Client Details & Project Config FIRST
  const { data: client_details } = await supabase
    .from('client_details')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!client_details?.project_name) {
    return { success: false, error: 'User not assigned to a project' }
  }

  const { data: project } = await supabase
    .from('project')
    .select('project_name, mongo_db_map')
    .eq('project_name', client_details.project_name)
    .single()

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
    }
  }

  const review_details = {
    threat_score: parseInt(formData.get('threat_score') || '0'),
    threat_types: threat_types.length > 0 ? threat_types : ['safe'],
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

    reviewed_at: new Date().toISOString()
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
    const existingPost = await collection.findOne({ _id: new ObjectId(mongoId) })
    if (!existingPost) {
      return { success: false, error: 'Post not found' }
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
          processed_at: new Date()
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

    // Fire and forget metrics update to not block UI
    updateDailyMetrics(project, currentReviewData, previousReviewData).catch(err =>
      console.error('Background metrics update failed:', err)
    )

    // SEND A NOTIFICATION TO THE CLIENT ON THEIR SUPPORTED FORMAT
    if (suggest_takedown && !already_in_takedown) {
      // client_details is already fetched at the top

      // GET THE CLIENT'S NOTIFICATION CONFIG CONNECTED TO THIS PROJECT
      const { data: notification_data } = await supabase
        .from('client_details')
        .select('notification_config')
        .eq('project_name', client_details.project_name)
        .eq('permission', 'client')
        .single()

      const notification_config = notification_data?.notification_config

      // SEND NOTIFICATION TO CLIENT
      const { success, error } = await sendNotification(notification_config, "takedown_request")
      if (!success) {
        console.error('Failed to send notification:', error)
      }
      else {
        console.log('Notification sent successfully')
      }

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

    const post = await collection.findOne({ post_id: postId })

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