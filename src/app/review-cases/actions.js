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
    const db = client.db(process.env.MONGO_DB_NAME) // Assuming DB name, using default from connection string if implied
    const collection = db.collection('Posts')

    const skip = (page - 1) * limit

    // Build query with filters
    const query = {
      $and: [
        {
          $or: [
            { processed: { $exists: false } },
            { processed: false }
          ]
        }
      ]
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

    // Date filter - handle taken_at (Instagram), timestamp (Facebook/X)
    // Note: X uses string timestamps, so we need different handling
    if (filters.startDate || filters.endDate) {
      const startUnix = filters.startDate ? new Date(filters.startDate).getTime() / 1000 : null
      const endUnix = filters.endDate ? new Date(filters.endDate).getTime() / 1000 : null
      const startDate = filters.startDate ? new Date(filters.startDate) : null
      const endDate = filters.endDate ? new Date(filters.endDate) : null

      const dateConditions = []

      // For numeric timestamps (Instagram, Facebook)
      const numericQuery = {}
      if (startUnix) numericQuery.$gte = startUnix
      if (endUnix) numericQuery.$lte = endUnix

      if (Object.keys(numericQuery).length > 0) {
        dateConditions.push({ taken_at: numericQuery })
        dateConditions.push({ timestamp: numericQuery })
      }

      // For string timestamps (X)
      const stringQuery = {}
      if (startDate) stringQuery.$gte = startDate.toISOString()
      if (endDate) stringQuery.$lte = endDate.toISOString()

      if (Object.keys(stringQuery).length > 0) {
        dateConditions.push({ timestamp: stringQuery })
      }

      if (dateConditions.length > 0) {
        query.$and.push({ $or: dateConditions })
      }
    }

    const posts = await collection.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    // Serialize and Sign URLs - normalize data structure for Instagram, Facebook, and X
    const processedPosts = await Promise.all(posts.map(async (post) => {
      let s3UrlToSign = post.s3_url;

      // Check media_urls if root s3_url is missing
      if (!s3UrlToSign && post.media_urls && post.media_urls.length > 0) {
        // For X videos, use thumbnail_s3_url if available
        s3UrlToSign = post.media_urls[0].thumbnail_s3_url || post.media_urls[0].s3_url;
      }

      const signedUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null;

      // Normalize timestamp - handle Unix timestamp (number) or date string
      let normalizedTimestamp;
      if (typeof post.taken_at === 'number') {
        normalizedTimestamp = post.taken_at;
      } else if (typeof post.timestamp === 'number') {
        normalizedTimestamp = post.timestamp;
      } else if (typeof post.timestamp === 'string') {
        // X uses date string format like "Wed Jan 28 06:45:11 +0000 2026"
        normalizedTimestamp = Math.floor(new Date(post.timestamp).getTime() / 1000);
      } else {
        normalizedTimestamp = null;
      }

      // Normalize data structure to handle Instagram, Facebook, and X formats
      const normalized = {
        ...post,
        _id: post._id.toString(),
        created_at: post.created_at ? new Date(post.created_at).toISOString() : null,
        sourcing_date: post.sourcing_date ? new Date(post.sourcing_date).toISOString() : null,
        signedImageUrl: signedUrl,

        // Normalize caption/content
        caption: post.caption || post.content || '',

        // Normalize user/author (handle Instagram, Facebook, and X formats)
        user: post.user || {
          username: post.author?.username || post.author?.name || (post.author?.id ? `user_${post.author.id}` : 'Unknown'),
          full_name: post.author?.name || post.author?.username || '',
          profile_pic_url: post.author?.profile_pic_url || post.author?.profile_pic || '',
          is_verified: post.user?.is_verified || post.author?.verified || false
        },

        // Normalize timestamp
        taken_at: normalizedTimestamp,

        // Normalize stats (handle all platforms)
        stats: {
          like_count: post.stats?.like_count || post.stats?.likes || 0,
          comment_count: post.stats?.comment_count || post.stats?.comments || post.stats?.replies || 0,
          view_count: post.stats?.view_count || (post.stats?.views ? parseInt(post.stats.views) : null),
          share_count: post.stats?.shares || post.stats?.retweets || 0,
          // X-specific stats
          retweet_count: post.stats?.retweets || 0,
          quote_count: post.stats?.quotes || 0,
          reply_count: post.stats?.replies || 0
        },

        // Ensure platform is set
        platform: post.platform || 'instagram'
      };

      return normalized;
    }));

    const totalCount = await collection.countDocuments(query)

    return { posts: processedPosts, totalCount, page, totalPages: Math.ceil(totalCount / limit) }
  } catch (e) {
    console.error('MongoDB Error:', e)
    return { posts: [], totalCount: 0, page: 1, totalPages: 0 }
  }
}

export async function submitCaseReview(prevState, formData) {
  const supabase = await createClient()
  const mongoId = formData.get('mongo_id')

  const rawData = {
    post_id: formData.get('post_id'),
    platform: formData.get('platform'),
    threat_type: formData.get('threat_type'),
    threat_score: parseInt(formData.get('threat_score')),
    sourcing_date: formData.get('sourcing_date'), // Ensure this is ISO string
    is_in_takedown: formData.get('is_in_takedown') === 'on',
    takedown_status: formData.get('takedown_status'),
    caption: formData.get('caption'),
    image_key: formData.get('image_key'),
    profile_username: formData.get('profile_username'),
    posting_time: formData.get('posting_time'), // Ensure this is ISO string
  }

  // Check if case already exists (update) or create new
  const { data: existingCase } = await supabase
    .from('cases_metadata')
    .select('id')
    .eq('post_id', rawData.post_id)
    .maybeSingle()

  let supabaseError
  if (existingCase) {
    // Update existing case
    const { error } = await supabase
      .from('cases_metadata')
      .update(rawData)
      .eq('id', existingCase.id)
    supabaseError = error
  } else {
    // Insert new case
    const { error } = await supabase
      .from('cases_metadata')
      .insert(rawData)
    supabaseError = error
  }

  if (supabaseError) {
    console.error('Supabase Insert/Update Error:', supabaseError)
    return { success: false, error: supabaseError.message }
  }

  // Mark post as processed in MongoDB
  if (mongoId) {
    try {
      const client = await clientPromise
      const db = client.db(process.env.MONGO_DB_NAME)
      const collection = db.collection('Posts')

      await collection.updateOne(
        { _id: new ObjectId(mongoId) },
        { $set: { processed: true, processed_at: new Date() } }
      )
    } catch (mongoError) {
      console.error('MongoDB Update Error:', mongoError)
      // Don't fail the whole operation if MongoDB update fails
    }
  }

  return { success: true }
}

export async function getCaseMetadata(postId) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('cases_metadata')
    .select('*')
    .eq('post_id', postId)
    .maybeSingle()

  if (error) {
    console.error('Error fetching case metadata:', error)
    return null
  }

  return data
}