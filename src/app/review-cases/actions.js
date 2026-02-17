'use server'

import { createClient } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { redirect } from 'next/navigation'
import { ObjectId } from 'mongodb'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { updateDailyMetrics, manageTakedownCase } from '@/utils/supabase/metrics'
import { sendEmail } from '@/utils/email'

export async function getPosts(project_name, page = 1, limit = 20, filters = {}) {
  try {

    const supabase = await createClient()
    let { data } = await supabase
      .from('project')
      .select('*')
      .eq('project_name', project_name)
      .single()

    if (!data?.mongo_db_map) {
      return { posts: [], totalPages: 0, totalCount: 0 }
    }
    console.log(data.mongo_db_map)
    const client = await clientPromise
    const db = client.db(data.mongo_db_map)
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
      query.$and.push({ platform: filters.platform })
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
    const processedPosts = await Promise.all(posts.map(async (post) => {
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
        caption: post.post_content?.caption || '',

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
        platform: post.platform || 'instagram'
      };

      // Robust profile pic handling
      normalized.user.profile_pic_url = post.profile?.profile_pic_url || post.profile?.profile_url || post.profile?.profile_pic || '';

      return normalized;
    }));

    const totalCount = await collection.countDocuments(finalQuery)

    return { posts: processedPosts, totalCount, page, totalPages: Math.ceil(totalCount / limit) }
  } catch (e) {
    console.error('MongoDB Error:', e)
    return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
  }
}


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

export async function submitCaseReview(prevState, formData) {
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
    .select('mongo_db_map')
    .eq('project_name', client_details.project_name)
    .single()

  if (!project?.mongo_db_map) {
    return { success: false, error: 'Project database configuration missing' }
  }

  const mongoId = formData.get('mongo_id')

  if (!mongoId) {
    return { success: false, error: 'Missing Post ID' }
  }

  // Handle Threat Types (Multi-select)
  // formData.getAll returns an array of all values for inputs with name="threat_types"
  let threat_types = formData.getAll('threat_types');
  if (threat_types.length === 0) {
    // Fallback: try to see if it came as a single string (backward compatibility or different frontend logic)
    const raw = formData.get('threat_types');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) threat_types = parsed;
        else threat_types = [raw];
      } catch (e) {
        threat_types = [raw];
      }
    } else {
      threat_types = ['safe'];
    }
  }

  const review_details = {
    threat_score: parseInt(formData.get('threat_score') || '0'),
    threat_types: threat_types,

    // Flags
    flags: {
      poi_confirmed: formData.get('poi_confirmed') === 'on',
      is_hate_speech: formData.get('is_hate_speech') === 'on',
      is_nsfw: formData.get('is_nsfw') === 'on',
      is_fake_news: formData.get('is_fake_news') === 'on',
      is_aigc: formData.get('is_aigc') === 'on'
    },

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

    // Check if it was previously reviewed today to handle metrics updates correctly
    // If processed=true and review_details exist, we treat it as an update
    const previousReviewData = existingPost.processed && existingPost.review_details ? {
      threat_score: existingPost.review_details.threat_score,
      threat_types: existingPost.review_details.threat_types || [existingPost.review_details.primary_threat_type || existingPost.review_details.threat_type], // Handle backward compat
      // is_in_takedown: existingPost.takedown_info?.is_in_takedown, // This metrics should only be updated when the client approves the takedown request
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
      is_aigc: review_details.flags.is_aigc,
      // takedown metrics are now handled in cases/actions.js
      platform: existingPost.platform
    }

    // Fire and forget metrics update to not block UI
    updateDailyMetrics(currentReviewData, previousReviewData).catch(err =>
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
}

export async function getCaseMetadata(postId) {
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
}