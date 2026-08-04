'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction, runInSpan } from '@/utils/tracing'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { profilesCollection, postsCollection } from '@/utils/mongodb/collections'
import { buildNormalizedProfileForUi, insertCaseEvent } from '@/utils/mongodb/v3-schema'
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
        matchQuery['list.last_active_at'] = {}
        if (filters.publish_date_from) {
            matchQuery['list.last_active_at'].$gte = new Date(filters.publish_date_from)
        }
        if (filters.publish_date_to) {
            matchQuery['list.last_active_at'].$lte = new Date(filters.publish_date_to)
        }
    }

    if (filters.reviewStatus === 'reviewed') {
        andConditions.push({ 'workflow.review_status': 'reviewed' })
    } else if (filters.reviewStatus === 'pending') {
        andConditions.push({
            $or: [
                { 'workflow.review_status': 'pending' },
                { 'workflow.review_status': { $exists: false } },
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
        const collection = profilesCollection(db)

        const skip = (page - 1) * limit
        const matchQuery = buildProfileMatchQuery(filters)

        const pipeline = [
            { $match: matchQuery },
            { $sort: { 'list.post_count': -1, _id: 1 } },
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
                const picS3 = p.enrichment?.profile_pic_s3 || p.metadata?.s3_url
                if (picS3) {
                    signedProfilePic = await getSignedImageUrl(picS3)
                }

                return buildNormalizedProfileForUi(p, { signedProfilePic })
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

export const getProfileCases = traceAction('getProfileCases_review', async (_project, profileId) => {
    try {
        if (!profileId) return []
        const { dbName } = await requireRole(['reviewer'])

        const client = await clientPromise
        const db = client.db(dbName)
        const collection = postsCollection(db)

        const query = { profile_id: new ObjectId(profileId) }

        const posts = await runInSpan(
            'review_profiles.getProfileCases.mongo_query',
            async () => collection.find(query).toArray(),
            { 'app.span_type': 'mongo_query' }
        )

        return runInSpan(
            'review_profiles.getProfileCases.s3_signing',
            async () => Promise.all(posts.map((p) => normalized_S3_post(p, db))),
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
        const collection = profilesCollection(db)

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
            {
                $set: {
                    review_details,
                    'workflow.review_status': 'reviewed',
                    'workflow.reviewed_at': new Date(),
                    'list.risk': risk,
                    'list.risk_rank': risk,
                    'system.updated_at': new Date(),
                },
            }
        )

        await insertCaseEvent(db, {
            entityType: 'profile',
            entityId: profileId,
            eventType: 'Profile Review Submitted',
            summary: `Profile review submitted with risk ${risk}`,
            payload: { review_details },
        })

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
