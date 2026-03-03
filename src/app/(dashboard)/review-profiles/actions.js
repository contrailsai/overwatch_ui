'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction } from '@/utils/tracing'
import { getSignedImageUrl } from '@/utils/aws/s3'

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

        const profiles = await collection.find(query)
            .sort({ display_name: 1 })
            .skip(skip)
            .limit(limit)
            .toArray()

        const totalCount = await collection.countDocuments(query)

        const serialized = profiles.map(p => ({
            _id: p._id.toString(),
            display_name: p.display_name || p.username || 'Unknown',
            platform: p.platform || 'unknown',
            is_verified: p.is_verified || false,
            posts: (p.posts || []).map(id => id.toString()),
            profile_url: p.profile_url || null,
            review_details: p.review_details || {},
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
            .project({
                _id: 1,
                platform: 1,
                'post_content.caption': 1,
                caption: 1,
                original_url: 1,
                'review_details.threat_score': 1,
                'review_details.primary_threat_type': 1,
                client_status: 1,
                'metadata.created_at': 1,
                'post_content.media_urls': 1,
                's3_url': 1,
            })
            .toArray()

        return Promise.all(posts.map(async (p) => {
            let s3UrlToSign = null
            if (p.post_content?.media_urls && p.post_content.media_urls.length > 0) {
                const firstMedia = p.post_content.media_urls[0]
                s3UrlToSign = firstMedia.s3_url || firstMedia.thumbnail_url
            } else if (p.s3_url) {
                s3UrlToSign = p.s3_url
            }

            const signedUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null

            return {
                _id: p._id.toString(),
                platform: p.platform || 'unknown',
                caption: p.post_content?.caption || p.caption || '',
                signedImageUrl: signedUrl,
                original_url: p.original_url || null,
                client_status: p.client_status || 'To Be Reviewed',
                threat_score: p.review_details?.threat_score ?? null,
                primary_threat_type: p.review_details?.primary_threat_type || null,
                created_at: p.metadata?.created_at ? new Date(p.metadata.created_at).toISOString() : null,
            }
        }))
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
