'use server'

import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { sendSlackNotification } from '@/utils/slack'
import { updateClientReviewedMetrics, updateDailyMetrics, updateClientMetaStats } from '@/utils/supabase/metrics'
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
})

// GET POSTS WITH PAGINATIONS AND FILTERS
const buildUniqueClustersStage = (filters) => {
  if (filters.unique_clusters === 'true' || filters.unique_clusters === true) {
    return [
      {
        $lookup: {
          from: 'unique_clusters',
          localField: 'cluster_id',
          foreignField: '_id',
          as: 'cluster_info'
        }
      },
      {
        $match: {
          $expr: {
            $eq: [{ $toString: "$_id" }, { $arrayElemAt: ["$cluster_info.representative_post_id", 0] }]
          }
        }
      }
    ];
  }
  return [];
};

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
      // CONTENT MUST BE REVIEWED ON REVIEW-CASES PAGE BEFORE COMMING HERE
      "review_details.threat_score": { $exists: true }
      // processed: true
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

    // Visibility status filter
    if (filters.visibility_status && filters.visibility_status !== 'all') {
      if (filters.visibility_status === 'down') {
        query.visibility_status = 'down';
      } else if (filters.visibility_status === 'active') {
        andConditions.push({
          $or: [
            { visibility_status: 'active' },
            { visibility_status: { $exists: false } },
            { visibility_status: null }
          ]
        });
      }
    }

    // Client Status filter
    if (filters.client_status && filters.client_status !== 'all') {
      // To Be Reviewed edge case: 
      // ---> any case that doesnt have the key, 
      // ---> key is null or 
      // ---> the key is explicitly "To Be Reviewed" 
      // should be included in this filter.
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

    // Risk Priority filter
    // high > 95 >= medium > 75 >= low > 40 >= safe
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
            $and: violationConditions
          });
        }
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
      ...buildUniqueClustersStage(filters),
      { $project: { text_embedding: 0, image_embedding: 0 } },
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
        ...buildUniqueClustersStage(filters),
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
      if (filters.unique_clusters === 'true' || filters.unique_clusters === true) {
        const countResult = await collection.aggregate([
          { $match: matchStage },
          ...buildUniqueClustersStage(filters),
          { $count: "total" }
        ]).toArray();
        totalCount = countResult[0]?.total || 0;
      } else {
        totalCount = await collection.countDocuments(query);
      }
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

    const post = await collection.findOne(
      { _id: new ObjectId(id) },
      { projection: { text_embedding: 0, image_embedding: 0 } }
    );
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
        const normalViolations = violationsArray.filter(v => v !== 'aigc');
        const hasAigc = violationsArray.includes('aigc');
        
        const orConditions = [];
        if (normalViolations.length > 0) {
          orConditions.push({ 'review_details.threat_types': { $in: normalViolations } });
          const flagConditions = normalViolations.map(v => ({ [`review_details.flags.${v}`]: true }));
          orConditions.push(...flagConditions);
        }
        if (hasAigc) {
          orConditions.push({ 'review_details.is_aigc': true });
        }
        
        if (orConditions.length > 0) {
          andConditions.push({
            $or: orConditions
          });
        }
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
      ...buildUniqueClustersStage(filters),
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
export const getIdenticalPosts = traceAction('getIdenticalPosts', async (project, clusterId, currentPostId) => {
  try {
    if (!project?.mongo_db_map || !clusterId) return [];
    const client = await clientPromise;
    const db = client.db(project.mongo_db_map);
    
    const cluster = await db.collection('unique_clusters').findOne({ _id: new ObjectId(clusterId) });
    if (!cluster || !cluster.member_ids) return [];
    
    const otherMemberIds = cluster.member_ids.filter(id => id !== currentPostId && id.toString() !== currentPostId);
    if (otherMemberIds.length === 0) return [];
    
    const objectIds = otherMemberIds.map(id => new ObjectId(id));
    const posts = await db.collection('Posts').find({ _id: { $in: objectIds } }).toArray();
    
    return await Promise.all(posts.map(normalized_S3_post));
  } catch (e) {
    console.error('getIdenticalPosts Error:', e);
    return [];
  }
});

export const getPostsByIds = traceAction('getPostsByIds', async (project, ids) => {
  try {
    if (!project?.mongo_db_map || !ids || ids.length === 0) {
      return []
    }
    const client = await clientPromise
    const db = client.db(project.mongo_db_map)
    const collection = db.collection('Posts')
    const totalCount = ids.length;
    const page = 1;
    const limit = 100;

    const objectIds = ids.map(id => new ObjectId(id))
    const posts = await collection.find(
      { _id: { $in: objectIds } },
      { projection: { text_embedding: 0, image_embedding: 0 } }
    ).toArray()

    // Normalize and Sign URLs (using the existing helper)
    const processedPosts = await Promise.all(posts.map(normalized_S3_post))

    // Important: Maintain the order of IDs if possible, or just return them
    // Returning processedPosts is enough for the export components
    return {
      posts: processedPosts,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit)
    }
  } catch (e) {
    console.error('getPostsByIds Error:', e)
    return []
  }
})

export const getSimilarPosts = traceAction('getSimilarPosts', async (project, sourcePostId, type = 'text', limit = 10, filters = {}, sort = { field: 'threat_score', direction: 'desc' }) => {
  try {
    if (!project?.mongo_db_map || !sourcePostId) return { posts: [], totalCount: 0, page: 1, totalPages: 0 }

    const client = await clientPromise
    const db = client.db(project.mongo_db_map)
    const collection = db.collection('Posts')

    // 1. Get the source post (including embeddings for query, but also all other fields for display)
    const sourcePost = await collection.findOne(
      { _id: new ObjectId(sourcePostId) }
    )

    if (!sourcePost) return { posts: [], totalCount: 0, page: 1, totalPages: 0 }

    const embeddingField = type === 'image' ? 'image_embedding' : 'text_embedding'
    const queryVector = sourcePost[embeddingField]

    if (!queryVector || !Array.isArray(queryVector) || queryVector.length === 0) {
      console.log(`No ${embeddingField} found for post ${sourcePostId}`)
      return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
    }

    // Prepare match stage based on existing filters
    const matchQuery = {
      _id: { $ne: new ObjectId(sourcePostId) }, // Exclude self
      "review_details.threat_score": { $exists: true } // Only cases (reviewed)
    };

    const andConditions = [];

    if (filters.platform && filters.platform !== 'all') {
      matchQuery.platform = { $regex: new RegExp(`^${filters.platform}$`, 'i') }
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
        matchQuery.client_status = filters.client_status
      }
    }

    if (filters.risk_priority && filters.risk_priority !== 'all') {
      if (filters.risk_priority === 'high') {
        matchQuery['review_details.threat_score'] = { $gt: 95 }
      } else if (filters.risk_priority === 'medium') {
        matchQuery['review_details.threat_score'] = { $gt: 75, $lte: 95 }
      } else if (filters.risk_priority === 'low') {
        matchQuery['review_details.threat_score'] = { $gt: 40, $lte: 75 }
      } else if (filters.risk_priority === 'safe') {
        matchQuery['review_details.threat_score'] = { $lte: 40 }
      }
    }

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
          andConditions.push({ $and: violationConditions });
        }
      }
    }

    if (andConditions.length > 0) {
      matchQuery.$and = andConditions;
    }

    // Build Sort Pipeline
    let sortPipeline = {};
    if (sort.field === 'threat_score') {
      sortPipeline = { score: -1, 'review_details.threat_score': sort.direction === 'asc' ? 1 : -1, 'sort_processed_after': -1, '_id': 1 };
    } else if (sort.field === 'original_date') {
      sortPipeline = { score: -1, 'sort_original_date': sort.direction === 'asc' ? 1 : -1, 'review_details.threat_score': -1, '_id': 1 };
    } else if (sort.field === 'processed_date') {
      sortPipeline = { score: -1, 'sort_processed_after': sort.direction === 'asc' ? 1 : -1, 'review_details.threat_score': -1, '_id': 1 };
    } else {
      // For similarity search, prioritize similarity score
      sortPipeline = { score: -1, 'review_details.threat_score': -1, '_id': 1 }; 
    }

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
      ...buildUniqueClustersStage(filters),
      {
        $addFields: {
          score: { $meta: "vectorSearchScore" },
          sort_original_date: {
            $toDate: { $ifNull: ["$engagement.posted_at", "$metadata.posted_date"] }
          },
          sort_processed_after: {
            $toDate: { $ifNull: ["$review_details.reviewed_at", "$metadata.updated_at"] }
          }
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
    const processedPosts = await Promise.all(posts.map(normalized_S3_post))

    // 3. Prepend the source post to the results to show it at the top
    const normalizedSourcePost = await normalized_S3_post(sourcePost)
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
    console.error('getSimilarPosts Error:', e)
    return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
  }
})

export const getSemanticSearchPosts = traceAction('getSemanticSearchPosts', async (project, searchText, limit = 10, filters = {}, sort = {}) => {
  try {
    if (!project?.mongo_db_map || !searchText) return { posts: [], totalCount: 0, page: 1, totalPages: 0 }

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
        console.error(`Embedding API error: ${res.status} ${res.statusText}`);
      }
    } catch (apiError) {
      console.error('Failed to fetch embeddings:', apiError);
    }

    const client = await clientPromise
    const db = client.db(project.mongo_db_map)
    const collection = db.collection('Posts')

    // 2. Build common match and date filters
    const matchQuery = {
      "review_details.threat_score": { $exists: true }
    };

    const andConditions = [];

    if (filters.platform && filters.platform !== 'all') {
      matchQuery.platform = { $regex: new RegExp(`^${filters.platform}$`, 'i') }
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
        matchQuery.client_status = filters.client_status
      }
    }

    if (filters.risk_priority && filters.risk_priority !== 'all') {
      if (filters.risk_priority === 'high') {
        matchQuery['review_details.threat_score'] = { $gt: 95 }
      } else if (filters.risk_priority === 'medium') {
        matchQuery['review_details.threat_score'] = { $gt: 75, $lte: 95 }
      } else if (filters.risk_priority === 'low') {
        matchQuery['review_details.threat_score'] = { $gt: 40, $lte: 75 }
      } else if (filters.risk_priority === 'safe') {
        matchQuery['review_details.threat_score'] = { $lte: 40 }
      }
    }

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
          andConditions.push({ $and: violationConditions });
        }
      }
    }

    if (andConditions.length > 0) {
      matchQuery.$and = andConditions;
    }

    let sortPipeline = null;
    if (sort.field === 'threat_score') {
      sortPipeline = { score: -1, 'review_details.threat_score': sort.direction === 'asc' ? 1 : -1, 'sort_processed_after': -1, '_id': 1 };
    } else if (sort.field === 'original_date') {
      sortPipeline = { score: -1, 'sort_original_date': sort.direction === 'asc' ? 1 : -1, 'review_details.threat_score': -1, '_id': 1 };
    } else if (sort.field === 'processed_date') {
      sortPipeline = { score: -1, 'sort_processed_after': sort.direction === 'asc' ? 1 : -1, 'review_details.threat_score': -1, '_id': 1 };
    } else {
      sortPipeline = { score: -1, 'review_details.threat_score': -1, '_id': 1 };
    }

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
        ...buildUniqueClustersStage(filters),
        {
          $addFields: {
            score: { $meta: "vectorSearchScore" },
            sort_original_date: { $toDate: { $ifNull: ["$engagement.posted_at", "$metadata.posted_date"] } },
            sort_processed_after: { $toDate: { $ifNull: ["$review_details.reviewed_at", "$metadata.updated_at"] } }
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
      ...buildUniqueClustersStage(filters),
      {
        $addFields: {
          score: { $meta: "searchScore" },
          sort_original_date: { $toDate: { $ifNull: ["$engagement.posted_at", "$metadata.posted_date"] } },
          sort_processed_after: { $toDate: { $ifNull: ["$review_details.reviewed_at", "$metadata.updated_at"] } }
        }
      }
    ];

    if (Object.keys(dateFilterStage).length > 0) textPipeline.push({ $match: dateFilterStage });
    if (sortPipeline) textPipeline.push({ $sort: sortPipeline });
    textPipeline.push({ $limit: limit }, { $project: { text_embedding: 0, image_embedding: 0 } });
    
    try {
      textPosts = await collection.aggregate(textPipeline).toArray();
    } catch (e) {
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
      mergedPosts.push(post);
      seenIds.add(post._id.toString());
    }

    // Apply the final threshold/limit
    const finalLimitedPosts = mergedPosts.slice(0, limit);
    const processedPosts = await Promise.all(finalLimitedPosts.map(normalized_S3_post));

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
    console.error('getSemanticSearchPosts Error:', e)
    return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
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

// UPDATE CLIENT STATUS FLAG FOR TAKEDOWN / NO ACTION
export const updateClientStatus = traceAction('updateClientStatus', async (caseId, status, client_email) => {
  try {
    const projectDetails = await getProjectDetails()
    if (!projectDetails?.dbName) {
      return { success: false, error: "Project configuration not found" }
    }

    const client = await clientPromise
    const db = client.db(projectDetails.dbName)
    const collection = db.collection('Posts')

    const post = await collection.findOne(
      { _id: new ObjectId(caseId) },
      { projection: { text_embedding: 0, image_embedding: 0 } }
    )
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
        },
        $push: {
          "metadata.update_history": {
            updated_at: new Date(),
            updated_by: projectDetails.client_email,
            changes_summary: "client status change to " + status
          }
        }
      }
    )

    if (result.matchedCount > 0) {
      // Track metrics

      // 1. DAILY REVIEW METRICS UPDATES
      const currentReviewData = {
        risk_score: post.review_details?.threat_score || 0,
        client_status: status,
        platform: post?.platform.toLowerCase()
      }

      const previousReviewData = post.client_status && post.client_status !== 'To Be Reviewed' ? {
        risk_score: post.review_details?.threat_score || 0,
        client_status: post.client_status,
        platform: post?.platform.toLowerCase() 
      } : null

      await updateClientReviewedMetrics(
        { project_name: projectDetails.projectName },
        currentReviewData,
        previousReviewData
      ).catch(err =>
        console.error('Failed to update client metrics:', err)
      )

      // 2. CLIENT's META STATS UPDATE
      await updateClientMetaStats(
        projectDetails.projectName,
        client_email,
        "reviewed_case"
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
