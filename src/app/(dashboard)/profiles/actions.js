'use server'

import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'
import { updateClientMetaStats } from '@/utils/supabase/metrics'
import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction } from '@/utils/tracing'
import { getSignedImageUrl } from '@/utils/aws/s3'

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

export const getProfiles = traceAction('getProfiles', async (project, page = 1, limit = 20, filters = {}) => {
    try {
        if (!project?.mongo_db_map) {
            return { profiles: [], totalCount: 0, page: 1, totalPages: 0 }
        }
        const client = await clientPromise
        const db = client.db(project.mongo_db_map)
        const collection = db.collection('Profiles')

        const skip = (page - 1) * limit

        // Only show profiles that have been reviewed
        const query = {
            'review_details.reviewed_at': { $exists: true }
        }

        if (filters.platform && filters.platform !== 'all') {
            query.platform = { $regex: new RegExp(`^${filters.platform}\$`, 'i') }
        }

        if (filters.is_verified !== undefined && filters.is_verified !== 'all') {
            query.is_verified = filters.is_verified === 'true'
        }

        if (filters.status && filters.status !== 'all') {
            if (filters.status === 'To Be Reviewed') {
                query.$or = [
                    { client_status: { $regex: /^pending$/i } },
                    { client_status: { $regex: /^to be reviewed$/i } },
                    { client_status: { $exists: false } },
                    { client_status: null },
                    { client_status: '' }
                ]
            } else {
                query.client_status = { $regex: new RegExp(`^${filters.status}$`, 'i') }
            }
        }

        const profiles = await collection.find(query)
            .sort({ 'review_details.reviewed_at': -1 })
            .skip(skip)
            .limit(limit)
            .toArray()

        const totalCount = await collection.countDocuments(query)

        const serialized = await Promise.all(profiles.map(async (p) => {
            let signedProfilePic = null
            if (p.metadata?.s3_url) {
                signedProfilePic = await getSignedImageUrl(p.metadata.s3_url)
            }

            return {
                _id: p._id.toString(),
                display_name: p.metadata?.display_name || p.display_name || p.username || 'Unknown',
                username: p.metadata?.username || p.username || null,
                platform: p.platform || 'unknown',
                is_verified: p.metadata?.is_verified ?? p.is_verified ?? false,
                posts: (p.posts || []).map(id => id.toString()),
                profile_url: p.metadata?.profile_url || p.profile_url || null,
                review_details: p.review_details || {},
                client_status: p.client_status || 'To Be Reviewed',
                client_notes: p.client_notes || [],
                metadata: p.metadata ? {
                    ...p.metadata,
                    profile_pic: signedProfilePic
                } : null
            }
        }))

        return {
            profiles: serialized,
            totalCount,
            page,
            totalPages: Math.ceil(totalCount / limit),
        }
    } catch (e) {
        console.error('getProfiles MongoDB Error:', e)
        return { profiles: [], totalCount: 0, page: 1, totalPages: 0 }
    }
})

export const getProfileCases = traceAction('getProfileCases', async (project, postIds = []) => {
    try {
        if (!project?.mongo_db_map || postIds.length === 0) return []

        const client = await clientPromise
        const db = client.db(project.mongo_db_map)
        const collection = db.collection('Posts')

        const objectIds = postIds.map(id => {
            try { return new ObjectId(id) } catch { return null }
        }).filter(Boolean)

        if (objectIds.length === 0) return []

        const posts = await collection
            .find({ _id: { $in: objectIds } })
            .toArray()

        return Promise.all(
            posts.map(
                async (p) => await normalized_S3_post(p)
            )
        )
    } catch (e) {
        console.error('getProfileCases MongoDB Error:', e)
        return []
    }
})

export const updateProfileClientStatus = traceAction('updateProfileClientStatus', async (project, profileId, status, client_email) => {
    try {
        if (!project?.mongo_db_map || !profileId) {
            return { success: false, error: "Project configuration not found" }
        }

        const client = await clientPromise
        const db = client.db(project.mongo_db_map)
        const collection = db.collection('Profiles')

        const result = await collection.updateOne(
            { _id: new ObjectId(profileId) },
            { $set: { client_status: status } }
        )

        if (result.matchedCount > 0) {
            // 2. CLIENT's META STATS UPDATE
            await updateClientMetaStats(
                project.project_name,
                client_email,
                "reviewed_profile"
            )
            return { success: true }
        } else {
            return { success: false, error: "Profile not found" }
        }
    } catch (e) {
        console.error("updateProfileClientStatus Error:", e)
        return { success: false, error: e.message }
    }
})

export const addProfileClientNote = traceAction('addProfileClientNote', async (project, profileId, noteText) => {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, error: "Unauthorized" }
        }

        if (!project?.mongo_db_map || !profileId) {
            return { success: false, error: "Project configuration not found" }
        }

        const client = await clientPromise
        const db = client.db(project.mongo_db_map)
        const collection = db.collection('Profiles')

        const newNote = {
            text: noteText,
            email: user.email,
            created_at: new Date().toISOString()
        }

        const result = await collection.updateOne(
            { _id: new ObjectId(profileId) },
            { $push: { client_notes: newNote } }
        )

        if (result.matchedCount > 0) {
            return { success: true, note: newNote }
        } else {
            return { success: false, error: "Profile not found" }
        }
    } catch (e) {
        console.error("addProfileClientNote Error:", e)
        return { success: false, error: e.message }
    }
})
