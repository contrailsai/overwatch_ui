'use server'

import clientPromise from '@/utils/mongodb/client'
import { getSignedImageUrl } from '@/utils/aws/s3'

export async function getPosts(page = 1, limit = 20, filters = {}, sort = { field: 'created_at', direction: 'desc' }) {
  try {
    const client = await clientPromise
    const db = client.db(process.env.MONGO_DB_NAME)
    const collection = db.collection('Posts')

    const skip = (page - 1) * limit

    // Build query
    const query = {}

    // Platform filter
    if (filters.platform && filters.platform !== 'all') {
      query.platform = filters.platform
    }

    // Threat Type filter (if applicable to raw posts or if they have analysis results)
    if (filters.threat_type && filters.threat_type !== 'all') {
      // Assuming threat_type might be in review_details or analysis_results
      query.$or = [
        { 'review_details.threat_type': filters.threat_type },
        { 'analysis_results.threat_category': filters.threat_type }
      ]
    }
    
    // Status filter (processed vs unprocessed)
    if (filters.status && filters.status !== 'all') {
        if (filters.status === 'reviewed') {
            query.processed = true
        } else if (filters.status === 'pending') {
            query.$or = [{ processed: false }, { processed: { $exists: false } }]
        }
    }

    // Build Sort
    const sortOptions = {}
    if (sort.field === 'created_at') {
      sortOptions['metadata.created_at'] = sort.direction === 'asc' ? 1 : -1
    } else if (sort.field === 'threat_score') {
      sortOptions['review_details.threat_score'] = sort.direction === 'asc' ? 1 : -1
    } else {
      // Default sort
       sortOptions['metadata.created_at'] = -1
    }

    const posts = await collection.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .toArray()

    // Serialize and Sign URLs
    const processedPosts = await Promise.all(posts.map(async (post) => {
      // Find S3 URL to sign
      let s3UrlToSign = null;
      if (post.post_content?.media_urls && post.post_content.media_urls.length > 0) {
        const firstMedia = post.post_content.media_urls[0];
        s3UrlToSign = firstMedia.thumbnail_url || firstMedia.s3_url;
      } else if (post.s3_url) {
          s3UrlToSign = post.s3_url;
      }

      const signedUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null;

      // Normalize data structure
      const normalized = {
        _id: post._id.toString(),
        // Metadata
        created_at: post.metadata?.created_at ? new Date(post.metadata.created_at).toISOString() : null,
        platform: post.platform || 'instagram',
        processed: post.processed || false,
        
        // Content
        caption: post.post_content?.caption || post.caption || '',
        signedImageUrl: signedUrl,
        
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
        
        // Stats
        stats: {
          like_count: post.engagement?.likes || 0,
          comment_count: post.engagement?.comments || 0,
          share_count: post.engagement?.shares || 0
        }
      };

      return normalized;
    }));

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
}
