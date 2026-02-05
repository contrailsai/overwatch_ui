'use server'

import clientPromise from '@/utils/mongodb/client'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { sendSlackNotification } from '@/utils/slack'
import { manageTakedownCase } from '@/utils/supabase/metrics'
import { ObjectId } from 'mongodb'

export async function approveTakedown(caseId) {
  try {
    const client = await clientPromise
    const db = client.db(process.env.MONGO_DB_NAME)
    const collection = db.collection('Posts')

    // 1. Fetch current post data for metrics/Supabase
    const post = await collection.findOne({ _id: new ObjectId(caseId) })
    if (!post) {
      return { success: false, error: "Case not found" }
    }

    // 2. Update MongoDB Status
    const result = await collection.updateOne(
      { _id: new ObjectId(caseId) },
      {
        $set: {
          "takedown_info.takedown_status": "requested",
          "takedown_info.client_approval_date": new Date().toISOString()
        }
      }
    )

    if (result.modifiedCount === 1) {
      // 3. Trigger Supabase Takedown Case Management
      // This creates/updates the record in the 'takedown_cases' table
      await manageTakedownCase({
        mongo_post_id: caseId,
        post_platform_id: post.post_id || post.code,
        platform: post.platform || 'instagram',
        is_in_takedown: true,
        risk_score: post.review_details?.threat_score || 0,
        threat_type: post.review_details?.primary_threat_type || 'safe'
      }).catch(err => console.error('Takedown management failed:', err))

      // 4. Trigger Slack Alert
      await sendSlackNotification().catch(e => console.error("Slack alert failed", e));
      return { success: true }
    } else {
      return { success: false, error: "Case not found or already updated" }
    }

  } catch (e) {
    console.error("Approve Takedown Error:", e)
    return { success: false, error: e.message }
  }
}

export async function getPriorityTakedowns() {
  try {
    const client = await clientPromise
    const db = client.db(process.env.MONGO_DB_NAME)
    const collection = db.collection('Posts')

    // Fetch all raised takedowns (priority)
    const posts = await collection.find({
      'takedown_info.takedown_status': 'raised'
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
        platform: post.platform || 'instagram',
        processed: post.processed || false,
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
}

export async function getPosts(page = 1, limit = 20, filters = {}, sort = { field: 'created_at', direction: 'desc' }) {
  try {
    const client = await clientPromise
    const db = client.db(process.env.MONGO_DB_NAME)
    const collection = db.collection('Posts')

    const skip = (page - 1) * limit

    // Build query
    // CLIENT VIEW: Enforce processed = true
    const query = { processed: true }
    const andConditions = []

    // Platform filter
    if (filters.platform && filters.platform !== 'all') {
      query.platform = filters.platform
    }

    // Threat Type filter (if applicable to raw posts or if they have analysis results)
    if (filters.threat_type && filters.threat_type !== 'all') {
      andConditions.push({
        $or: [
          { 'review_details.threat_type': filters.threat_type },
          { 'review_details.primary_threat_type': filters.threat_type },
          { 'analysis_results.threat_category': filters.threat_type }
        ]
      })
    }

    // Default Filter: Analysis completed AND POI detected (Face OR Name)
    // We keep this to ensure relevance, even for reviewed posts
    // AI analysis is there
    query["analysis_results.risk_score"] = { $exists: true }
    // Human analysis is there
    query["review_details.threat_score"] = { $exists: true }

    andConditions.push({
      $or: [
        { "analysis_results.poi_check.face_present": true },
        { "analysis_results.poi_check.poi_name_found": true }
      ]
    })

    if (andConditions.length > 0) {
      query.$and = andConditions
    }

    // Build Sort
    const sortOptions = {}
    if (sort.field === 'created_at') {
      sortOptions['metadata.created_at'] = sort.direction === 'asc' ? 1 : -1
    } else if (sort.field === 'threat_score') {
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
        sourcing_date: post.metadata?.sourcing_date ? new Date(post.metadata.sourcing_date).toISOString() : null,
        platform: post.platform || 'instagram',
        processed: post.processed || false,

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
