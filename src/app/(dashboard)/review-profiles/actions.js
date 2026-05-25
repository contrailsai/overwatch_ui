'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction, runInSpan } from '@/utils/tracing'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { normalized_S3_post } from '@/app/(dashboard)/profiles/actions'
import { requireRole } from '@/utils/auth-context'
import { logActionError, logActionWarn, LOKI_STREAMS } from '@/utils/otel-logger'

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildProfileMatchQuery(filters) {
    const matchQuery = {}
    const andConditions = []

    if (filters.platform && filters.platform !== 'all') {
        matchQuery.platform = { $regex: new RegExp(`^${filters.platform}$`, 'i') }
    }

    if (filters.is_verified !== undefined && filters.is_verified !== 'all') {
        matchQuery.is_verified = filters.is_verified === 'true'
    }

    if (filters.publish_date_from || filters.publish_date_to) {
        matchQuery.last_relevant_publish_date = {}
        if (filters.publish_date_from) {
            matchQuery.last_relevant_publish_date.$gte = new Date(filters.publish_date_from)
        }
        if (filters.publish_date_to) {
            matchQuery.last_relevant_publish_date.$lte = new Date(filters.publish_date_to)
        }
    }

    matchQuery.metadata = { $exists: true }

    if (filters.reviewStatus === 'reviewed') {
        andConditions.push({ 'review_details.reviewed_at': { $exists: true, $ne: null } })
    } else if (filters.reviewStatus === 'pending') {
        andConditions.push({
            $or: [
                { review_details: { $exists: false } },
                { review_details: null },
                { 'review_details.reviewed_at': { $exists: false } },
                { 'review_details.reviewed_at': null },
            ],
        })
    }

    if (filters.searchText?.trim()) {
        const searchRegex = new RegExp(escapeRegex(filters.searchText.trim()), 'i')
        andConditions.push({
            $or: [
                { 'metadata.profile_url': { $regex: searchRegex } },
                { profile_url: { $regex: searchRegex } },
                { 'metadata.username': { $regex: searchRegex } },
                { username: { $regex: searchRegex } },
                { 'metadata.display_name': { $regex: searchRegex } },
                { display_name: { $regex: searchRegex } },
            ],
        })
    }

    if (andConditions.length > 0) {
        matchQuery.$and = andConditions
    }

    return matchQuery
}

export const getProfiles = traceAction('getProfiles_review', async (_project, page = 1, limit = 20, filters = {}) => {
    try {
        const { dbName } = await requireRole(['reviewer'])
        const client = await clientPromise
        const db = client.db(dbName)
        const collection = db.collection('Profiles')

        const skip = (page - 1) * limit
        const matchQuery = buildProfileMatchQuery(filters)

        const pipeline = [
            { $match: matchQuery },
            { $project: { text_embedding: 0, image_embedding: 0 } },
            {
                $addFields: {
                    posts_count: { $size: { $ifNull: ['$posts', []] } },
                },
            },
            { $sort: { posts_count: -1, _id: 1 } },
        ]

        pipeline.push({
            $facet: {
                data: [{ $skip: skip }, { $limit: limit }],
                total: [{ $count: "total" }],
            },
        })

        const facetResult = await runInSpan(
            'review_profiles.getProfiles.mongo_data_and_count',
            async () => collection.aggregate(pipeline).toArray(),
            { 'app.span_type': 'mongo_query', 'app.query_kind': 'data_and_count' }
        )

        const profiles = facetResult?.[0]?.data || []
        const totalCount = facetResult?.[0]?.total?.[0]?.total || 0

        const serialized = await runInSpan(
            'review_profiles.getProfiles.s3_signing',
            async () => Promise.all(profiles.map(async (p) => {
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
                    metadata: p.metadata ? {
                        ...p.metadata,
                        profile_pic: signedProfilePic
                    } : null
                }
            })),
            { 'app.span_type': 's3_signing' }
        )

        return {
            profiles: serialized,
            totalCount,
            page,
            totalPages: Math.ceil(totalCount / limit),
        }
    } catch (e) {
        logActionError({
            loki_stream: LOKI_STREAMS.review_profiles,
            app_action: 'getProfiles_review',
            message: 'review_profiles.getProfiles failed',
        }, e)
        console.error('getProfiles MongoDB Error:', e)
        return { profiles: [], totalCount: 0, page: 1, totalPages: 0 }
    }
})

export const getProfileCases = traceAction('getProfileCases_review', async (_project, postIds = []) => {
    try {
        if (postIds.length === 0) return []
        const { dbName } = await requireRole(['reviewer'])

        const client = await clientPromise
        const db = client.db(dbName)
        const collection = db.collection('Posts')

        const objectIds = postIds.map(id => {
            try { return new ObjectId(id) } catch { return null }
        }).filter(Boolean)

        if (objectIds.length === 0) return []

        const posts = await runInSpan(
            'review_profiles.getProfileCases.mongo_query',
            async () =>
                collection
                    .find({ _id: { $in: objectIds } }, { projection: { text_embedding: 0, image_embedding: 0 } })
                    .toArray(),
            { 'app.span_type': 'mongo_query' }
        )

        return runInSpan(
            'review_profiles.getProfileCases.s3_signing',
            async () => Promise.all(posts.map((p) => normalized_S3_post(p))),
            { 'app.span_type': 's3_signing' }
        )
    } catch (e) {
        logActionError({
            loki_stream: LOKI_STREAMS.review_profiles,
            app_action: 'getProfileCases_review',
            message: 'review_profiles.getProfileCases failed',
        }, e)
        console.error('getProfileCases MongoDB Error:', e)
        return []
    }
})

export const submitProfileReview = traceAction('submitProfileReview', async (_project, profileId, reviewData) => {
    try {
        if (!profileId) {
            return { success: false, error: 'Missing project or profile ID' }
        }
        const { dbName } = await requireRole(['reviewer'])

        const client = await clientPromise
        const db = client.db(dbName)
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
        logActionError({
            loki_stream: LOKI_STREAMS.review_profiles,
            app_action: 'submitProfileReview',
            message: 'review_profiles.submitProfileReview failed',
        }, e)
        console.error('submitProfileReview MongoDB Error:', e)
        return { success: false, error: e.message }
    }
})
