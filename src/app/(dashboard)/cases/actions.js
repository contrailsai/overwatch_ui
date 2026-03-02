'use server'

import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { sendSlackNotification } from '@/utils/slack'
import { manageTakedownCase, trackTakedownEvent } from '@/utils/supabase/metrics'
import { ObjectId } from 'mongodb'
// import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { traceAction, recordClickMetric } from '@/utils/tracing'

export const trackClientClick = traceAction('trackClientClick', async (buttonName, attributes = {}) => {
  recordClickMetric(buttonName, attributes);
})

export const normalized_S3_post = traceAction('normalized_S3_post', async (post) => {
  // Find S3 URL to sign
  let s3UrlToSign = null;
  if (post.post_content?.media_urls && post.post_content.media_urls.length > 0) {
    const firstMedia = post.post_content.media_urls[0];
    s3UrlToSign = firstMedia.s3_url || firstMedia.thumbnail_url;
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
    posted_date: post.engagement.posted_at ? new Date(post.engagement.posted_at).toISOString() : post.metadata?.sourcing_date ? new Date(post.metadata.sourcing_date).toISOString() : null,
    taken_at: post.post_content?.taken_at || post.taken_at || null,
    platform: post.platform ? post.platform.toLowerCase() : 'instagram',
    processed: post.processed || false,
    client_status: post.client_status || 'To Be Reviewed',

    // Content
    caption: post.post_content?.caption || post.caption || '',
    signedImageUrl: signedUrl,
    original_url: post.original_url,
    post_id: post.post_id || post.code,

    // Profile
    user: {
      username: post.profile?.username || post.user?.username || 'Unknown',
      full_name: post.profile?.display_name || '',
      profile_pic_url: post.profile?.profile_pic_url || post.profile?.profile_url || '',
      is_verified: post.profile?.is_verified || false
    },

    // Review Details (if available)
    review_details: post.review_details || null,
    takedown_info: post.takedown_info || null,
    analysis_results: post.analysis_results || null,
    client_notes: post.client_notes || [],

    // Stats
    stats: {
      like_count: post.engagement?.likes || 0,
      comment_count: post.engagement?.comments || 0,
      share_count: post.engagement?.shares || 0
    }
  };

  return normalized;
})


export const getPosts = traceAction('getPosts', async (project, page = 1, limit = 20, filters = {}, sort = { field: 'created_at', direction: 'desc' }) => {
  try {
    if (!project?.mongo_db_map) {
      return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
    }
    const client = await clientPromise
    const db = client.db(project.mongo_db_map)
    const collection = db.collection('Posts')

    const skip = (page - 1) * limit

    // Build query
    // CLIENT VIEW: Enforce processed = true
    const query = {
      processed: true
    }

    // Only exclude raised cases if we are not explicitly asking for 'all' or 'Flag for Takedown'
    if (filters.client_status !== 'all' && filters.client_status !== 'Flag for Takedown') {
      query['takedown_info.takedown_status'] = { $ne: 'raised' }
    }
    const andConditions = []

    // Platform filter
    if (filters.platform && filters.platform !== 'all') {
      query.platform = { $regex: new RegExp(`^${filters.platform}\$`, 'i') }
    }

    // Client Status filter
    if (filters.client_status && filters.client_status !== 'all') {
      if (filters.client_status === 'To Be Reviewed') {
        andConditions.push({
          $or: [
            { client_status: { $exists: false } },
            { client_status: null },
            { client_status: 'To Be Reviewed' }
          ]
        })
      } else {
        query.client_status = filters.client_status
      }
    }

    // Threat Type filter (if applicable to raw posts or if they have analysis results)
    if (filters.threat_type && filters.threat_type !== 'all') {
      andConditions.push({
        $or: [
          { 'review_details.threat_type': filters.threat_type },
          { 'review_details.primary_threat_type': filters.threat_type },
          // { 'analysis_results.threat_category': filters.threat_type }
        ]
      })
    }

    // Default Filter: Analysis completed AND POI detected (Face OR Name)
    // We keep this to ensure relevance, even for reviewed posts
    // AI analysis is there
    // query["analysis_results.risk_score"] = { $exists: true }
    // Human analysis is there
    query["review_details.threat_score"] = { $exists: true }

    // andConditions.push({
    //   $or: [
    //     // { "analysis_results.poi_check.face_present": true },
    //     // { "analysis_results.poi_check.poi_name_found": true }
    //   ]
    // })

    if (andConditions.length > 0) {
      query.$and = andConditions
    }

    // Build Sort
    const sortOptions = {}
    if (sort.field === 'created_at') {
      sortOptions['metadata.created_at'] = sort.direction === 'asc' ? 1 : -1
    } else if (sort.field === 'threat_score') {
      console.log("sorting by threat_score in review_details")
      sortOptions['review_details.threat_score'] = sort.direction === 'asc' ? 1 : -1
    } else {
      // Default sort
      sortOptions['review_details.threat_score'] = -1
    }

    const posts = await collection.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .toArray()

    // Serialize and Sign URLs
    const processedPosts = await Promise.all(posts.map(normalized_S3_post));

    const totalCount = await collection.countDocuments(query)

    return {
      posts: processedPosts,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit)
    }
  } catch (e) {
    console.error('MongoDB Error:', e)
    return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
  }
})

export const getProjectDetails = traceAction('getProjectDetails_cases', async () => {
  const user = await getAuthenticatedUser()

  if (!user) return null

  const supabase = await createClient()
  const { data: clientDetails } = await supabase
    .from('client_details')
    .select('project_name, project:project_name(mongo_db_map, project_details)')
    .eq('id', user.id)
    .single()

  if (!clientDetails?.project_name) return null

  return {
    projectName: clientDetails.project_name,
    dbName: clientDetails.project?.mongo_db_map
  }
})

export const approveTakedown = traceAction('approveTakedown', async (caseId) => {
  try {
    const projectDetails = await getProjectDetails()
    if (!projectDetails?.dbName) {
      return { success: false, error: "Project configuration not found" }
    }

    const client = await clientPromise
    const db = client.db(projectDetails.dbName)
    const collection = db.collection('Posts')

    // 1. Fetch current post data for metrics/Supabase
    const post = await collection.findOne({ _id: new ObjectId(caseId) })
    if (!post) {
      return { success: false, error: "Case not found" }
    }

    // 2. Trigger Supabase Takedown Case Management
    // This creates/updates the record in the 'takedown_cases' table
    const supabaseCase = await manageTakedownCase({
      mongo_post_id: caseId,
      post_platform_id: post.post_id || post.code,
      platform: post.platform ? post.platform.toLowerCase() : 'instagram',
      is_in_takedown: true,
      risk_score: post.review_details?.threat_score || 0,
      threat_type: post.review_details?.primary_threat_type || 'safe'
    }).catch(err => {
      console.error('Takedown management failed:', err)
      return null
    })

    // Track takedown event metric
    await trackTakedownEvent(post.platform ? post.platform.toLowerCase() : 'instagram').catch(err => {
      console.error('Failed to track takedown metric:', err)
    })

    // 3. Update MongoDB Status
    const result = await collection.updateOne(
      { _id: new ObjectId(caseId) },
      {
        $set: {
          "takedown_info.takedown_status": "raised",
          "takedown_info.client_approval_date": new Date().toISOString(),
          "takedown_info.supabase_id": supabaseCase?.id || null,
          "client_status": "Flag for Takedown"
        }
      }
    )

    if (result.modifiedCount === 1) {
      // 4. Trigger Slack Alert
      await sendSlackNotification().catch(e => console.error("Slack alert failed", e));
      return { success: true, supabase_id: supabaseCase?.id }
    } else {
      return { success: false, error: "Case not found or already updated" }
    }

  } catch (e) {
    console.error("Approve Takedown Error:", e)
    return { success: false, error: e.message }
  }
})

export const getPriorityTakedowns = traceAction('getPriorityTakedowns', async () => {
  try {
    const projectDetails = await getProjectDetails()
    if (!projectDetails?.dbName) {
      return []
    }

    const client = await clientPromise
    const db = client.db(projectDetails.dbName)
    const collection = db.collection('Posts')

    // Fetch all requested takedowns (priority)
    const posts = await collection.find({
      'takedown_info.takedown_status': 'requested'
    })
      .sort({ 'metadata.created_at': -1 })
      .toArray()

    // Serialize and Sign URLs (reuse logic)
    const processedPosts = await Promise.all(posts.map(async (post) => {
      let s3UrlToSign = null;
      if (post.post_content?.media_urls && post.post_content.media_urls.length > 0) {
        const firstMedia = post.post_content.media_urls[0];
        s3UrlToSign = firstMedia.thumbnail_url || firstMedia.s3_url;
      } else if (post.s3_url) {
        s3UrlToSign = post.s3_url;
      }

      const signedUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null;

      const normalized = {
        _id: post._id.toString(),
        created_at: post.metadata?.created_at ? new Date(post.metadata.created_at).toISOString() : null,
        taken_at: post.post_content?.taken_at || post.taken_at || null,
        platform: post.platform ? post.platform.toLowerCase() : 'instagram',
        processed: post.processed || false,
        client_status: post.client_status || 'To Be Reviewed',
        caption: post.post_content?.caption || post.caption || '',
        signedImageUrl: signedUrl,
        user: {
          username: post.profile?.username || post.user?.username || 'Unknown',
          full_name: post.profile?.display_name || '',
          profile_pic_url: post.profile?.profile_pic_url || post.profile?.profile_url || '',
          is_verified: post.profile?.is_verified || false
        },
        review_details: post.review_details || null,
        takedown_info: post.takedown_info || null,
        analysis_results: post.analysis_results || null,
        stats: {
          like_count: post.engagement?.likes || 0,
          comment_count: post.engagement?.comments || 0,
          share_count: post.engagement?.shares || 0
        }
      };
      return normalized;
    }));

    return processedPosts;
  } catch (e) {
    console.error('getPriorityTakedowns Error:', e)
    return []
  }
})

export const getRaisedCount = traceAction('getRaisedCount', async () => {
  try {
    const projectDetails = await getProjectDetails()
    if (!projectDetails?.dbName) {
      return 0
    }
    const client = await clientPromise
    const db = client.db(projectDetails.dbName)
    const collection = db.collection('Posts')
    return await collection.countDocuments({ 'takedown_info.takedown_status': 'raised' })
  } catch (e) {
    console.error('getRaisedCount Error:', e)
    return 0
  }
})

export const updateClientStatus = traceAction('updateClientStatus', async (caseId, status) => {
  try {
    const projectDetails = await getProjectDetails()
    if (!projectDetails?.dbName) {
      return { success: false, error: "Project configuration not found" }
    }

    const client = await clientPromise
    const db = client.db(projectDetails.dbName)
    const collection = db.collection('Posts')

    const result = await collection.updateOne(
      { _id: new ObjectId(caseId) },
      { $set: { client_status: status } }
    )

    if (result.matchedCount > 0) {
      return { success: true }
    } else {
      return { success: false, error: "Case not found" }
    }
  } catch (e) {
    console.error("updateClientStatus Error:", e)
    return { success: false, error: e.message }
  }
})

export const addReviewNote = traceAction('addReviewNote', async (caseId, noteText) => {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: "Unauthorized" }
    }

    const projectDetails = await getProjectDetails()
    if (!projectDetails?.dbName) {
      return { success: false, error: "Project configuration not found" }
    }

    const client = await clientPromise
    const db = client.db(projectDetails.dbName)
    const collection = db.collection('Posts')

    const newNote = {
      text: noteText,
      email: user.email,
      created_at: new Date().toISOString()
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(caseId) },
      { $push: { client_notes: newNote } }
    )

    if (result.matchedCount > 0) {
      return { success: true, note: newNote }
    } else {
      return { success: false, error: "Case not found" }
    }
  } catch (e) {
    console.error("addReviewNote Error:", e)
    return { success: false, error: e.message }
  }
})

export const getPostById = traceAction('getPostById', async (project, id) => {
  try {
    if (!project?.mongo_db_map || !id) return null;

    const client = await clientPromise;
    const db = client.db(project.mongo_db_map);
    const collection = db.collection('Posts');

    const post = await collection.findOne({ _id: new ObjectId(id) });
    if (!post) return null;

    let s3UrlToSign = null;
    if (post.post_content?.media_urls && post.post_content.media_urls.length > 0) {
      const firstMedia = post.post_content.media_urls[0];
      s3UrlToSign = firstMedia.thumbnail_url || firstMedia.s3_url;
    } else if (post.s3_url) {
      s3UrlToSign = post.s3_url;
    }

    const signedUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null;

    return {
      _id: post._id.toString(),
      created_at: post.metadata?.created_at ? new Date(post.metadata.created_at).toISOString() : null,
      sourcing_date: post.metadata?.sourcing_date ? new Date(post.metadata.sourcing_date).toISOString() : null,
      taken_at: post.post_content?.taken_at || post.taken_at || null,
      platform: post.platform ? post.platform.toLowerCase() : 'instagram',
      processed: post.processed || false,
      client_status: post.client_status || 'To Be Reviewed',
      caption: post.post_content?.caption || post.caption || '',
      signedImageUrl: signedUrl,
      original_url: post.original_url,
      post_id: post.post_id || post.code,
      user: {
        username: post.profile?.username || post.user?.username || 'Unknown',
        full_name: post.profile?.display_name || '',
        profile_pic_url: post.profile?.profile_pic_url || post.profile?.profile_url || '',
        is_verified: post.profile?.is_verified || false
      },
      review_details: post.review_details || null,
      takedown_info: post.takedown_info || null,
      analysis_results: post.analysis_results || null,
      client_notes: post.client_notes || [],
      stats: {
        like_count: post.engagement?.likes || 0,
        comment_count: post.engagement?.comments || 0,
        share_count: post.engagement?.shares || 0
      }
    };
  } catch (e) {
    console.error('getPostById Error:', e);
    return null;
  }
})
