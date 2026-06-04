'use server'

import { updateClientMetaStats } from '@/utils/supabase/metrics'
import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction } from '@/utils/tracing'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { requireAuthContext } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { withReviewedThreatScoreFilter } from '@/lib/posts/reviewed-post-filter'

/** Exported for review-profiles; not a traced server action (avoids per-row trace overhead). */
export async function normalized_S3_post(post) {
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

  return normalized
}

export const getProfiles = traceAction('getProfiles', async (page = 1, limit = 20, filters = {}, sort = { field: null, direction: 'desc' }) => {
    try {
        const { dbName } = await requireAuthContext()
        const client = await clientPromise
        const db = client.db(dbName)
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

        if (filters.searchText && filters.searchText.trim()) {
            const searchRegex = new RegExp(filters.searchText.trim(), 'i')
            const searchConditions = [
                { 'metadata.profile_url': { $regex: searchRegex } },
                { profile_url: { $regex: searchRegex } },
            ]
            if (query.$or) {
                // Merge search $or with any existing $or (e.g. from "To Be Reviewed" status filter)
                query.$and = [
                    ...(query.$and || []),
                    { $or: query.$or },
                    { $or: searchConditions },
                ]
                delete query.$or
            } else {
                query.$or = searchConditions
            }
        }

        if (filters.publish_date_from || filters.publish_date_to) {
            const dateRange = {}
            if (filters.publish_date_from) dateRange.$gte = new Date(filters.publish_date_from)
            if (filters.publish_date_to) dateRange.$lte = new Date(filters.publish_date_to)
            // Try last_relevant_publish_date first, fall back to review_details.reviewed_at
            const dateConditions = [
                { 'last_relevant_publish_date': dateRange },
                { 'review_details.reviewed_at': dateRange },
            ]
            if (query.$and) {
                query.$and.push({ $or: dateConditions })
            } else if (query.$or) {
                query.$and = [{ $or: query.$or }, { $or: dateConditions }]
                delete query.$or
            } else {
                query.$or = dateConditions
            }
        }

        // Risk filter on review_details.risk.
        // The DB stores the medium band as either 'mid' or 'medium' (see risk_rank pipeline below
        // and getProfileRiskBadge), so map the filter id to all stored variants before matching.
        if (filters.risk && filters.risk !== 'all') {
            const riskValues = filters.risk === 'medium' ? ['mid', 'medium'] : [filters.risk]
            query['review_details.risk'] = { $in: riskValues.map(v => new RegExp(`^${v}$`, 'i')) }
        }

        // Location text search on metadata.location
        if (filters.location && filters.location.trim()) {
            const locationRegex = new RegExp(filters.location.trim(), 'i')
            query['metadata.location'] = { $regex: locationRegex }
        }

        // Follower count range on metadata.follower_count
        if (filters.follower_min || filters.follower_max) {
            const followerRange = {}
            if (filters.follower_min) followerRange.$gte = parseInt(filters.follower_min, 10)
            if (filters.follower_max) followerRange.$lte = parseInt(filters.follower_max, 10)
            query['metadata.follower_count'] = followerRange
        }

        // Sort pipeline — backend-driven sorting for Risk / Followers / Cases / Last Active.
        const dir = sort.direction === 'asc' ? 1 : -1
        let sortPipeline
        if (sort.field === 'risk') {
            sortPipeline = { risk_rank: dir, 'review_details.reviewed_at': -1, _id: 1 }
        } else if (sort.field === 'followers') {
            sortPipeline = { 'metadata.follower_count': dir, 'review_details.reviewed_at': -1, _id: 1 }
        } else if (sort.field === 'cases') {
            sortPipeline = { cases_count: dir, 'review_details.reviewed_at': -1, _id: 1 }
        } else if (sort.field === 'last_active') {
            sortPipeline = { sort_last_active: dir, 'review_details.reviewed_at': -1, _id: 1 }
        } else {
            sortPipeline = { 'review_details.reviewed_at': -1, _id: 1 }
        }

        const basePipeline = [
            { $match: query },
            { $project: { text_embedding: 0, image_embedding: 0 } },
            {
                $addFields: {
                    cases_count: { $size: { $ifNull: ['$posts', []] } },
                    risk_rank: {
                        $switch: {
                            branches: [
                                { case: { $eq: [{ $toLower: { $ifNull: ['$review_details.risk', ''] } }, 'high'] }, then: 4 },
                                { case: { $in: [{ $toLower: { $ifNull: ['$review_details.risk', ''] } }, ['mid', 'medium']] }, then: 3 },
                                { case: { $eq: [{ $toLower: { $ifNull: ['$review_details.risk', ''] } }, 'low'] }, then: 2 },
                                { case: { $eq: [{ $toLower: { $ifNull: ['$review_details.risk', ''] } }, 'safe'] }, then: 1 },
                            ],
                            default: 0,
                        },
                    },
                    sort_last_active: {
                        $convert: {
                            input: '$last_relevant_publish_date',
                            to: 'date',
                            onError: null,
                            onNull: null,
                        },
                    },
                },
            },
        ]

        const facetResult = await collection
            .aggregate([
                ...basePipeline,
                {
                    $facet: {
                        data: [
                            { $sort: sortPipeline },
                            { $skip: skip },
                            { $limit: limit },
                        ],
                        total: [{ $count: 'total' }],
                    },
                },
            ])
            .toArray()

        const profiles = facetResult?.[0]?.data || []
        const totalCount = facetResult?.[0]?.total?.[0]?.total || 0

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
                last_relevant_publish_date: p.last_relevant_publish_date || null,
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
        logActionError({ loki_stream: LOKI_STREAMS.profiles, app_action: 'getProfiles', message: 'getProfiles failed' }, e)
        console.error('getProfiles MongoDB Error:', e)
        return { profiles: [], totalCount: 0, page: 1, totalPages: 0 }
    }
})

export const getProfileCases = traceAction('getProfileCases', async (postIds = []) => {
    try {
        if (postIds.length === 0) return []
        const { dbName } = await requireAuthContext()

        const client = await clientPromise
        const db = client.db(dbName)
        const collection = db.collection('Posts')

        const objectIds = postIds.map(id => {
            try { return new ObjectId(id) } catch { return null }
        }).filter(Boolean)

        if (objectIds.length === 0) return []

        const posts = await collection
            .find(
                withReviewedThreatScoreFilter({ _id: { $in: objectIds } }),
                { projection: { text_embedding: 0, image_embedding: 0 } }
            )
            .toArray()

        return Promise.all(posts.map((p) => normalized_S3_post(p)))
    } catch (e) {
        logActionError({ loki_stream: LOKI_STREAMS.profiles, app_action: 'getProfileCases', message: 'getProfileCases failed' }, e)
        console.error('getProfileCases MongoDB Error:', e)
        return []
    }
})

export const updateProfileClientStatus = traceAction('updateProfileClientStatus', async (profileId, status) => {
    try {
        if (!profileId) {
            return { success: false, error: 'Missing profile ID' }
        }

        const { dbName, clientDetails } = await requireAuthContext()

        const client = await clientPromise
        const db = client.db(dbName)
        const collection = db.collection('Profiles')

        const result = await collection.updateOne(
            { _id: new ObjectId(profileId) },
            { $set: { client_status: status } }
        )

        if (result.matchedCount > 0) {
            await updateClientMetaStats(
                clientDetails.project_name,
                clientDetails.email,
                'reviewed_profile'
            )
            return { success: true }
        } else {
            return { success: false, error: "Profile not found" }
        }
    } catch (e) {
        logActionError({ loki_stream: LOKI_STREAMS.profiles, app_action: 'updateProfileClientStatus', message: 'updateProfileClientStatus failed' }, e)
        console.error("updateProfileClientStatus Error:", e)
        return { success: false, error: e.message }
    }
})

export const addProfileClientNote = traceAction('addProfileClientNote', async (profileId, noteText) => {
    try {
        const { dbName, clientDetails } = await requireAuthContext()

        if (!profileId) {
            return { success: false, error: 'Missing profile ID' }
        }

        const client = await clientPromise
        const db = client.db(dbName)
        const collection = db.collection('Profiles')

        const newNote = {
            text: noteText,
            email: clientDetails.email,
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
        logActionError({ loki_stream: LOKI_STREAMS.profiles, app_action: 'addProfileClientNote', message: 'addProfileClientNote failed' }, e)
        console.error("addProfileClientNote Error:", e)
        return { success: false, error: e.message }
    }
})
