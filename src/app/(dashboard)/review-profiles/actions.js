'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction } from '@/utils/tracing'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { normalized_S3_post } from '@/app/(dashboard)/profiles/actions'

export const getProfiles = traceAction('getProfiles', async (project, page = 1, limit = 20, filters = {}) => {
    try {
        if (!project?.mongo_db_map) {
            return { profiles: [], totalCount: 0, page: 1, totalPages: 0 }
        }
        const client = await clientPromise
        const db = client.db(project.mongo_db_map)
        const collection = db.collection('Profiles')

        const skip = (page - 1) * limit

        const query = {}

        if (filters.platform && filters.platform !== 'all') {
            query.platform = { $regex: new RegExp(`^${filters.platform}\$`, 'i') }
        }

        if (filters.is_verified !== undefined && filters.is_verified !== 'all') {
            query.is_verified = filters.is_verified === 'true'
        }

        query.metadata = { $exists: true }

        const profiles = await collection.aggregate([
            { $match: query },
            {
                $addFields: {
                    posts_count: { $size: { $ifNull: ["$posts", []] } }
                }
            },
            { $sort: { posts_count: -1, _id: 1 } }, // -1 for descending (most posts first)
            { $skip: skip },
            { $limit: limit }
        ]).toArray()



        // const profiles = await collection.find(query)
        //     .sort({ display_name: 1, _id: 1 })
        //     .skip(skip)
        //     .limit(limit)
        //     .toArray()

        const totalCount = await collection.countDocuments(query)

        const serialized = await Promise.all(profiles.map(async (p) => {
            let signedProfilePic = null
            if (p.metadata?.s3_url) {
                signedProfilePic = await getSignedImageUrl(p.metadata.s3_url)
            }
            // else if (p.metadata?.profile_pic) {
            //     // If it's already a URL, we might want to sign it if it's an S3 URL
            //     // But usually we prefer s3_url if available
            //     signedProfilePic = p.metadata.profile_pic
            // }

            return {
                _id: p._id.toString(),
                display_name: p.metadata?.display_name || p.display_name || p.username || 'Unknown',
                username: p.metadata?.username || p.username || null,
                platform: p.platform || 'unknown',
                is_verified: p.metadata?.is_verified ?? p.is_verified ?? false,
                posts: (p.posts || []).map(id => id.toString()),
                profile_url: p.metadata?.profile_url || p.profile_url || null,
                review_details: p.review_details || {},
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

        return Promise.all(posts.map(normalized_S3_post))
    } catch (e) {
        console.error('getProfileCases MongoDB Error:', e)
        return []
    }
})

export const submitProfileReview = traceAction('submitProfileReview', async (project, profileId, reviewData) => {
    try {
        if (!project?.mongo_db_map || !profileId) {
            return { success: false, error: 'Missing project or profile ID' }
        }

        const client = await clientPromise
        const db = client.db(project.mongo_db_map)
        const collection = db.collection('Profiles')

        const { risk, violations, reasoning, reviewer_comments, action } = reviewData

        const review_details = {
            risk,
            violations: violations || [],
            reasoning: reasoning || '',
            reviewer_comments: reviewer_comments || '',
            action,
            reviewed_at: new Date().toISOString(),
        }

        await collection.updateOne(
            { _id: new ObjectId(profileId) },
            { $set: { review_details } }
        )

        return { success: true, review_details }
    } catch (e) {
        console.error('submitProfileReview MongoDB Error:', e)
        return { success: false, error: e.message }
    }
})
