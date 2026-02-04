'use server'

import { createClient } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { redirect } from 'next/navigation'
import { ObjectId } from 'mongodb'
import { getSignedImageUrl } from '@/utils/aws/s3'

export async function checkReviewerPermission() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: clientDetails, error } = await supabase
    .from('client_details')
    .select('permission')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !clientDetails) {
    return false
  }

  return clientDetails.permission === 'reviewer'
}

export async function getUnreviewedPosts(page = 1, limit = 20, filters = {}) {
  try {
    const client = await clientPromise
    const db = client.db(process.env.MONGO_DB_NAME)
    const collection = db.collection('Posts')

    const skip = (page - 1) * limit

    // Build query with filters
    const query = { $and: [] }

    // If aiAnalyzed or poiDetected is selected, we show all matching results regardless of processed status
    // Otherwise, we only show unreviewed posts
    if (filters.aiAnalyzed || filters.poiDetected) {
      if (filters.aiAnalyzed) {
        query.$and.push({
          "analysis_results.risk_score": { $exists: true }
        })
      }
    } else {
      query.$and.push({
        $or: [
          { processed: { $exists: false } },
          { processed: false },
          { processed: null }
        ]
      })
    }

    // POI Detected Filter
    if (filters.poiDetected) {
      query.$and.push({
        "analysis_results.poi_check.poi_name_found": true
      })
    }

    // Platform filter - handle both explicit platform field and default to instagram
    if (filters.platform && filters.platform !== 'all') {
      if (filters.platform === 'instagram') {
        query.$and.push({
          $or: [
            { platform: 'instagram' },
            { platform: { $exists: false } }
          ]
        })
      } else {
        query.$and.push({ platform: filters.platform })
      }
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

import { updateDailyMetrics, manageTakedownCase } from '@/utils/supabase/metrics'
import { sendSlackNotification } from '@/utils/slack'

// ... existing imports

export async function submitCaseReview(prevState, formData) {
  const mongoId = formData.get('mongo_id')

  if (!mongoId) {
    return { success: false, error: 'Missing Post ID' }
  }

  const review_details = {
    threat_type: formData.get('threat_type'),
    threat_score: parseInt(formData.get('threat_score') || '0'),
    reviewed_at: new Date().toISOString()
  }

  const takedown_info = {
    is_in_takedown: formData.get('is_in_takedown') === 'on',
    takedown_status: formData.get('takedown_status'),
    client_reference_id: null
  }

  try {
    const client = await clientPromise
    const db = client.db(process.env.MONGO_DB_NAME)
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
        threat_type: existingPost.review_details.threat_type,
        is_in_takedown: existingPost.takedown_info?.is_in_takedown,
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
        threat_type: review_details.threat_type,
        is_in_takedown: takedown_info.is_in_takedown,
        platform: existingPost.platform
    }
    
    // Fire and forget metrics update to not block UI
    updateDailyMetrics(currentReviewData, previousReviewData).catch(err => 
        console.error('Background metrics update failed:', err)
    )

    // 4. Handle Takedown (Supabase & Slack)
    if (takedown_info.is_in_takedown) {
        // If it wasn't already in takedown, send notification
        const isNewTakedown = !previousReviewData?.is_in_takedown

        // Update/Insert Takedown Case
        manageTakedownCase({
            mongo_post_id: mongoId,
            post_platform_id: existingPost.post_id || existingPost.code,
            platform: existingPost.platform || 'instagram',
            is_in_takedown: true,
            risk_score: review_details.threat_score,
            threat_type: review_details.threat_type
        }).catch(err => console.error('Takedown management failed:', err))

        // Send Slack Notification only for new takedowns
        if (isNewTakedown) {
            sendSlackNotification().catch(err => 
                console.error('Slack notification failed:', err)
            )
        }
    }

    return { success: true }
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