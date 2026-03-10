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

    // Profile
    user: {
      username: post.profile?.username || post.user?.username || 'Unknown',
      full_name: post.profile?.display_name || '',
      profile_pic_url: post.profile?.profile_pic_url || post.profile?.profile_url || '',
      is_verified: post.profile?.is_verified || false
    },

    assigned_to: post?.assigned_to || null,
    content_reviewed_by: post?.content_reviewed_by || null,

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

// GET POSTS WITH PAGINATIONS AND FILTERS
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
      // To Be Reviewed cases might not even have the key "client_status"
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

    // Violations filter
    if (filters.violations && filters.violations !== 'all') {
      const violationsArray = filters.violations.split(',');
      if (violationsArray.length > 0) {
        const flagConditions = violationsArray.map(v => ({ [`review_details.flags.${v}`]: true }));
        andConditions.push({
          $or: [
            { 'review_details.threat_types': { $in: violationsArray } },
            ...flagConditions
          ]
        });
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
        'sort_processed_after': -1,
        'sort_original_date': -1,
        '_id': 1
      };
    } else if (sort.field === 'original_date') {
      sortPipeline = {
        'sort_original_date': sort.direction === 'asc' ? 1 : -1,
        'review_details.threat_score': -1,
        'sort_processed_after': -1,
        '_id': 1
      };
    } else if (sort.field === 'processed_date') {
      sortPipeline = {
        'sort_processed_after': sort.direction === 'asc' ? 1 : -1,
        'review_details.threat_score': -1,
        'sort_original_date': -1,
        '_id': 1
      };
    } else {
      // Default sort: Risk Priority (desc) -> Post Date (desc) -> _id (asc)
      sortPipeline = {
        'review_details.threat_score': -1,
        'sort_processed_after': -1,
        'sort_original_date': -1,
        '_id': 1
      };
    }

    // "Original Date (posted_date)" filter (requires computed field)
    const matchStage = { ...query };
    const dateFilterStage = {};
    
    if (filters.original_date_from || filters.original_date_to) {
      dateFilterStage.sort_original_date = {};
      if (filters.original_date_from) {
        dateFilterStage.sort_original_date.$gte = new Date(filters.original_date_from);
      }
      if (filters.original_date_to) {
        dateFilterStage.sort_original_date.$lte = new Date(filters.original_date_to);
      }
    }
    
    if (filters.processed_from || filters.processed_to) {
      dateFilterStage.sort_processed_after = {};
      if (filters.processed_from) {
        dateFilterStage.sort_processed_after.$gte = new Date(filters.processed_from);
      }
      if (filters.processed_to) {
        dateFilterStage.sort_processed_after.$lte = new Date(filters.processed_to);
      }
    }

    const hasDateFilters = Object.keys(dateFilterStage).length > 0;

    const posts = await collection.aggregate([
      { $match: matchStage },
      {
        $addFields: {
          sort_original_date: {
            // $toDate standardizes the field so comparisons and sorting work flawlessly
            $toDate: {
              $ifNull: ["$engagement.posted_at", "$metadata.posted_date"]
            }
          },
          sort_processed_after: {
            // $toDate standardizes the field so comparisons and sorting work flawlessly
            $toDate: {
              $ifNull: ["$review_details.reviewed_at", "$metadata.updated_at"]
            }
          }
        }
      },
      ...(hasDateFilters ? [{ $match: dateFilterStage }] : []),
      { $sort: sortPipeline },
      { $skip: skip },
      { $limit: limit }
    ]).toArray();

    // Serialize and Sign URLs
    const processedPosts = await Promise.all(posts.map(normalized_S3_post));

    // For count, we need to respect the date filters if present
    let totalCount;
    if (hasDateFilters) {
      const countResult = await collection.aggregate([
        { $match: matchStage },
        {
          $addFields: {
            sort_original_date: {
              // $toDate standardizes the field so comparisons and sorting work flawlessly
              $toDate: {
                $ifNull: ["$engagement.posted_at", "$metadata.posted_date"]
              }
            },
            sort_processed_after: {
              // $toDate standardizes the field so comparisons and sorting work flawlessly
              $toDate: {
                $ifNull: ["$review_details.reviewed_at", "$metadata.updated_at"]
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

// For opening using specific case links
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

// USEFUL FOR PDFs
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

    // Violations filter
    if (filters.violations && filters.violations !== 'all') {
      const violationsArray = filters.violations.split(',');
      if (violationsArray.length > 0) {
        const flagConditions = violationsArray.map(v => ({ [`review_details.flags.${v}`]: true }));
        andConditions.push({
          $or: [
            { 'review_details.threat_types': { $in: violationsArray } },
            ...flagConditions
          ]
        });
      }
    }

    if (andConditions.length > 0) query.$and = andConditions

    const matchStage = { ...query }
    const dateFilterStage = {}
    
    if (filters.original_date_from || filters.original_date_to) {
      dateFilterStage.sort_posted_at = {};
      if (filters.original_date_from) {
        dateFilterStage.sort_posted_at.$gte = new Date(filters.original_date_from);
      }
      if (filters.original_date_to) {
        dateFilterStage.sort_posted_at.$lte = new Date(filters.original_date_to);
      }
    }

    if (filters.processed_from || filters.processed_to) {
      dateFilterStage.sort_processed_after = {};
      if (filters.processed_from) {
        dateFilterStage.sort_processed_after.$gte = new Date(filters.processed_from);
      }
      if (filters.processed_to) {
        dateFilterStage.sort_processed_after.$lte = new Date(filters.processed_to);
      }
    }

    const hasDateFilters = Object.keys(dateFilterStage).length > 0;

    const pipeline = [
      { $match: matchStage },
      ...(hasDateFilters ? [
        {
          $addFields: {
            sort_posted_at: {
              $toDate: { $ifNull: ['$engagement.posted_at', '$metadata.posted_date'] }
            },
            sort_processed_after: {
              $toDate: { $ifNull: ["$review_details.reviewed_at", "$metadata.updated_at"] }
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

// USEFUL FOR PDFs
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
    .select('email, project_name, project:project_name(mongo_db_map, project_details)')
    .eq('id', user.id)
    .single()

  if (!clientDetails?.project_name) return null

  return {
    client_email: clientDetails.email,
    projectName: clientDetails.project_name,
    dbName: clientDetails.project?.mongo_db_map
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

      {
        $set: {
          client_status: status,
          "content_reviewed_by": projectDetails.client_email,
          "metadata.updated_at": new Date().toISOString(),
        }
      }
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

      updateClientReviewedMetrics(
        { project_name: projectDetails.projectName },
        currentReviewData,
        previousReviewData
      ).catch(err =>
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
