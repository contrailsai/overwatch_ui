'use server'

import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { sendSlackNotification } from '@/utils/slack'
import { manageTakedownCase, updateClientReviewedMetrics, updateDailyMetrics } from '@/utils/supabase/metrics'
import { ObjectId } from 'mongodb'
// import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { traceAction, recordClickMetric } from '@/utils/tracing'
import { metadata } from '../layout'

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
    posted_date: post.engagement?.posted_at ? new Date(post.engagement.posted_at).toISOString() : post.metadata?.posted_date ? new Date(post.metadata.posted_date).toISOString() : null,
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

    assigned_to: post?.assigned_to || null,

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
    // if (filters.client_status !== 'all' && filters.client_status !== 'Flag for Takedown') {
    //   query['takedown_info.takedown_status'] = { $ne: 'raised' }
    // }
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

    // NECESSARY CONDITION FOR POSTS TO APPEAR ON THIS PAGE (CONTENT MUST BE REVIEWED ON REVIEW-CASES PAGE BEFORE COMMING HERE)
    query["review_details.threat_score"] = { $exists: true }

    // Risk Priority filter
    if (filters.risk_priority && filters.risk_priority !== 'all') {
      if (filters.risk_priority === 'high') {
        query['review_details.threat_score'] = { $gt: 95 }
      } else if (filters.risk_priority === 'medium') {
        query['review_details.threat_score'] = { $gt: 75, $lte: 95 }
      } else if (filters.risk_priority === 'low') {
        query['review_details.threat_score'] = { $gt: 40, $lte: 75 }
      } else if (filters.risk_priority === 'safe') {
        query['review_details.threat_score'] = { $lte: 40 }
      }
    }

    if (andConditions.length > 0) {
      query.$and = andConditions
    }

    // SORT STUFF OUT
    let sortPipeline = {};
    if (sort.field === 'threat_score') {
      sortPipeline = {
        'review_details.threat_score': sort.direction === 'asc' ? 1 : -1,
        'sort_posted_at': -1,
        '_id': 1
      };
    } else if (sort.field === 'posted_at') {
      sortPipeline = {
        'sort_posted_at': sort.direction === 'asc' ? 1 : -1,
        'review_details.threat_score': -1,
        '_id': 1
      };
    } else {
      // Default sort: Risk Priority (desc) -> Post Date (desc) -> _id (asc)
      sortPipeline = {
        'review_details.threat_score': -1,
        'sort_posted_at': -1,
        '_id': 1
      };
    }

    // "Posted After" filter (requires computed field)
    const matchStage = { ...query };
    const dateFilterStage = {};
    if (filters.posted_after) {
      dateFilterStage.sort_posted_at = { $gte: new Date(filters.posted_after) };
    }

    const posts = await collection.aggregate([
      { $match: matchStage },
      {
        $addFields: {
          sort_posted_at: {
            // $toDate standardizes the field so comparisons and sorting work flawlessly
            $toDate: {
              $ifNull: ["$engagement.posted_at", "$metadata.posted_date"]
            }
          }
        }
      },
      ...(filters.posted_after ? [{ $match: dateFilterStage }] : []),
      { $sort: sortPipeline },
      { $skip: skip },
      { $limit: limit }
    ]).toArray();

    // Serialize and Sign URLs
    const processedPosts = await Promise.all(posts.map(normalized_S3_post));

    // For count, we need to respect the posted_after filter if present
    let totalCount;
    if (filters.posted_after) {
      const countResult = await collection.aggregate([
        { $match: matchStage },
        {
          $addFields: {
            sort_posted_at: {
              $ifNull: ["$engagement.posted_at", "$metadata.posted_date"]
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

export const getAllPostIds = traceAction('getAllPostIds', async (project, filters = {}) => {
  try {
    if (!project?.mongo_db_map) return []

    const client = await clientPromise
    const db = client.db(project.mongo_db_map)
    const collection = db.collection('Posts')

    // Build the same query as getPosts
    const query = { processed: true }
    const andConditions = []

    if (filters.platform && filters.platform !== 'all') {
      query.platform = { $regex: new RegExp(`^${filters.platform}$`, 'i') }
    }

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

    query['review_details.threat_score'] = { $exists: true }

    if (filters.risk_priority && filters.risk_priority !== 'all') {
      if (filters.risk_priority === 'high') {
        query['review_details.threat_score'] = { $gt: 95 }
      } else if (filters.risk_priority === 'medium') {
        query['review_details.threat_score'] = { $gt: 75, $lte: 95 }
      } else if (filters.risk_priority === 'low') {
        query['review_details.threat_score'] = { $gt: 40, $lte: 75 }
      } else if (filters.risk_priority === 'safe') {
        query['review_details.threat_score'] = { $lte: 40 }
      }
    }

    if (andConditions.length > 0) query.$and = andConditions

    const matchStage = { ...query }
    const dateFilterStage = {}
    if (filters.posted_after) {
      dateFilterStage.sort_posted_at = { $gte: new Date(filters.posted_after) }
    }

    const pipeline = [
      { $match: matchStage },
      ...(filters.posted_after ? [
        {
          $addFields: {
            sort_posted_at: {
              $toDate: { $ifNull: ['$engagement.posted_at', '$metadata.posted_date'] }
            }
          }
        },
        { $match: dateFilterStage }
      ] : []),
      { $project: { _id: 1 } }
    ]

    const docs = await collection.aggregate(pipeline).toArray()
    return docs.map(d => d._id.toString())
  } catch (e) {
    console.error('getAllPostIds Error:', e)
    return []
  }
})

export const getPostsByIds = traceAction('getPostsByIds', async (project, ids) => {
  try {
    if (!project?.mongo_db_map || !ids || ids.length === 0) {
      return []
    }
    const client = await clientPromise
    const db = client.db(project.mongo_db_map)
    const collection = db.collection('Posts')

    const objectIds = ids.map(id => new ObjectId(id))
    const posts = await collection.find({ _id: { $in: objectIds } }).toArray()

    // Normalize and Sign URLs (using the existing helper)
    const processedPosts = await Promise.all(posts.map(normalized_S3_post))

    // Important: Maintain the order of IDs if possible, or just return them
    // Returning processedPosts is enough for the export components
    return processedPosts
  } catch (e) {
    console.error('getPostsByIds Error:', e)
    return []
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
    const currentReviewData = {
      risk_score: post.review_details?.threat_score || 0,
      client_status: 'Takedown',
      platform: post.platform ? post.platform.toLowerCase() : 'instagram'
    }

    const previousReviewData = post.client_status && post.client_status !== 'To Be Reviewed' ? {
      risk_score: post.review_details?.threat_score || 0,
      client_status: post.client_status,
      platform: post.platform ? post.platform.toLowerCase() : 'instagram'
    } : null

    updateClientReviewedMetrics({ project_name: projectDetails.projectName }, currentReviewData, previousReviewData).catch(err => {
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

// FLAG FOR TAKEDOWN / NO ACTION
export const updateClientStatus = traceAction('updateClientStatus', async (caseId, status) => {
  try {
    const projectDetails = await getProjectDetails()
    if (!projectDetails?.dbName) {
      return { success: false, error: "Project configuration not found" }
    }

    const client = await clientPromise
    const db = client.db(projectDetails.dbName)
    const collection = db.collection('Posts')

    const post = await collection.findOne({ _id: new ObjectId(caseId) })
    if (!post) {
      return { success: false, error: "Case not found" }
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(caseId) },
      { $set: { client_status: status, "metadata.updated_at": new Date().toISOString() } }
    )

    if (result.matchedCount > 0) {
      // Track metrics
      const currentReviewData = {
        risk_score: post.review_details?.threat_score || 0,
        client_status: status,
        platform: post.platform ? post.platform.toLowerCase() : 'instagram'
      }

      const previousReviewData = post.client_status && post.client_status !== 'To Be Reviewed' ? {
        risk_score: post.review_details?.threat_score || 0,
        client_status: post.client_status,
        platform: post.platform ? post.platform.toLowerCase() : 'instagram'
      } : null

      updateClientReviewedMetrics({ project_name: projectDetails.projectName }, currentReviewData, previousReviewData).catch(err =>
        console.error('Failed to update client metrics:', err)
      )

      return { success: true }
    } else {
      return { success: false, error: "Case not found" }
    }
  } catch (e) {
    console.error("updateClientStatus Error:", e)
    return { success: false, error: e.message }
  }
})

export const addReviewNote = traceAction('addReviewNote', async (caseId, noteText, project, clientDetails) => {
  try {
    if (!project?.mongo_db_map) {
      return { success: false, error: "Project configuration not found" }
    }

    const client = await clientPromise
    const db = client.db(project.mongo_db_map)
    const collection = db.collection('Posts')

    const newNote = {
      text: noteText,
      email: clientDetails.email,
      created_at: new Date().toISOString()
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(caseId) },
      { $push: { client_notes: newNote }, $set: { "metadata.updated_at": new Date().toISOString() } }
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

    // get normalized post
    return await normalized_S3_post(post);

  } catch (e) {
    console.error('getPostById Error:', e);
    return null;
  }
})

export const submitCaseReview = traceAction('submitCaseReview', async (project, prevState, formData) => {

  // console.log("YO EDITING THE REVIEW, ", project)

  // const supabase = await createClient()
  // const { data: { user } } = await supabase.auth.getUser()

  // if (!user) {
  //   return { success: false, error: 'Authentication required' }
  // }

  // // 1. Fetch Client Details & Project Config FIRST
  // const { data: client_details } = await supabase
  //   .from('client_details')
  //   .select('*')
  //   .eq('id', user.id)
  //   .single()

  // if (!client_details?.project_name) {
  //   return { success: false, error: 'User not assigned to a project' }
  // }

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
          processed_at: new Date(),
          "metadata.updated_at": new Date().toISOString()
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

    // // SEND A NOTIFICATION TO THE CLIENT ON THEIR SUPPORTED FORMAT
    // if (suggest_takedown && !already_in_takedown) {
    //   // client_details is already fetched at the top

    //   // GET THE CLIENT'S NOTIFICATION CONFIG CONNECTED TO THIS PROJECT
    //   const { data: notification_data } = await supabase
    //     .from('client_details')
    //     .select('notification_config')
    //     .eq('project_name', client_details.project_name)
    //     .eq('permission', 'client')
    //     .single()

    //   const notification_config = notification_data?.notification_config

    //   // SEND NOTIFICATION TO CLIENT
    //   const { success, error } = await sendNotification(notification_config, "takedown_request")
    //   if (!success) {
    //     console.error('Failed to send notification:', error)
    //   }
    //   else {
    //     console.log('Notification sent successfully')
    //   }

    // }

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

export const fetch_clients_in_project = traceAction('fetch_clients_in_project', async (project_name) => {

  const supabase = await createClient()
  // const { data: { user } } = await supabase.auth.getUser()

  // if (!user) {
  //   return { success: false, error: 'Authentication required' }
  // }

  const { data: client_details, error } = await supabase
    .from('client_details')
    .select('*')
    .eq('project_name', project_name)
    .eq('permission', 'client')

  if (error) {
    console.error("ERROR: ", error)
    return null
  }

  const emails = client_details.map((client) => client.email)

  return emails

})

export const assignCaseTo = traceAction('assignCaseTo', async (project, post_id, assigned_email) => {
  if (!project?.mongo_db_map) {
    return { success: false, error: 'Project database configuration missing' }
  }

  if (!post_id) {
    return { success: false, error: 'Missing Post ID' }
  }

  try {
    const client = await clientPromise
    const db = client.db(project.mongo_db_map) // Use Correct DB
    const collection = db.collection('Posts')

    const result = await collection.updateOne(
      { _id: new ObjectId(post_id) },
      {
        $set: {
          "assigned_to": assigned_email,
          "metadata.updated_at": new Date().toISOString()
        }
      }
    )

    // FINALY ADD NOTIFICATION MESSAGE TO THE ASSIGNED CLIENT
    const supabase = await createClient()

    const { error } = await supabase
      .from('notifications')
      .insert([
        {
          "client_email": assigned_email,
          "notification_msg": "You are assigned a new case to review visit. ",
          "notification_action": { "button": { "redirect": `/cases/${post_id}` } }
        }
      ])

    return {
      success: true,
      updatedFields: {
        assigned_to: assigned_email,
        processed_at: new Date().toISOString()
      }
    }
  } catch (error) {
    console.error('MongoDB Update Error:', error)
    return { success: false, error: error.message }
  }
})