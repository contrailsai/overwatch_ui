'use server'

import { updateClientMetaStats } from '@/utils/supabase/metrics'
import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction } from '@/utils/tracing'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { requireAuthContext } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { withReviewedThreatScoreFilter } from '@/lib/posts/reviewed-post-filter'
import { postsCollection, profilesCollection } from '@/utils/mongodb/collections'
import {
  buildNormalizedPostForUi,
  buildNormalizedProfileForUi,
  getFirstMediaS3Url,
  insertCaseEvent,
  mapUiClientStatusToV3,
} from '@/utils/mongodb/v3-schema'

export async function normalized_S3_post(post, db = null) {
  const s3UrlToSign = getFirstMediaS3Url(post)
  const signedUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null
  return buildNormalizedPostForUi(post, { signedImageUrl: signedUrl })
}

export const getProfiles = traceAction('getProfiles', async (page = 1, limit = 20, filters = {}, sort = { field: null, direction: 'desc' }) => {
    try {
        const { dbName } = await requireAuthContext()
        const client = await clientPromise
        const db = client.db(dbName)
        const collection = profilesCollection(db)

        const skip = (page - 1) * limit

        const query = {
            $or: [
                { 'workflow.review_status': 'reviewed' },
                { 'list.reviewed_post_count': { $gt: 0 } },
                { 'review_details.reviewed_at': { $exists: true } },
            ],
        }

        if (filters.platform && filters.platform !== 'all') {
            query.platform = { $regex: new RegExp(`^${filters.platform}\$`, 'i') }
        }

        if (filters.is_verified !== undefined && filters.is_verified !== 'all') {
            query.is_verified = filters.is_verified === 'true'
        }

        if (filters.status && filters.status !== 'all') {
            if (filters.status === 'To Be Reviewed') {
                query.$and = [
                    ...(query.$and || []),
                    {
                        $or: [
                            { 'workflow.client_status': { $in: ['open', 'alerted'] } },
                            { 'workflow.client_status': { $exists: false } },
                            { 'workflow.client_status': null },
                        ],
                    },
                ]
            } else {
                query['workflow.client_status'] = mapUiClientStatusToV3(filters.status)
            }
        }

        if (filters.searchText && filters.searchText.trim()) {
            const searchRegex = new RegExp(filters.searchText.trim(), 'i')
            const searchConditions = [
                { profile_url: { $regex: searchRegex } },
                { username: { $regex: searchRegex } },
                { display_name: { $regex: searchRegex } },
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
                { 'list.last_active_at': dateRange },
                { 'workflow.reviewed_at': dateRange },
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
            query['list.risk_rank'] = { $in: riskValues.map((v) => new RegExp(`^${v}$`, 'i')) }
        }

        if (filters.location && filters.location.trim()) {
            const locationRegex = new RegExp(filters.location.trim(), 'i')
            query['list.location'] = { $regex: locationRegex }
        }

        if (filters.follower_min || filters.follower_max) {
            const followerRange = {}
            if (filters.follower_min) followerRange.$gte = parseInt(filters.follower_min, 10)
            if (filters.follower_max) followerRange.$lte = parseInt(filters.follower_max, 10)
            query['list.follower_count'] = followerRange
        }

        const dir = sort.direction === 'asc' ? 1 : -1
        let sortPipeline
        if (sort.field === 'risk') {
            sortPipeline = { 'list.effective_threat_score': dir, 'list.max_threat_score': dir, 'workflow.reviewed_at': -1, _id: 1 }
        } else if (sort.field === 'followers') {
            sortPipeline = { 'list.follower_count': dir, 'workflow.reviewed_at': -1, _id: 1 }
        } else if (sort.field === 'cases') {
            sortPipeline = { 'list.post_count': dir, 'workflow.reviewed_at': -1, _id: 1 }
        } else if (sort.field === 'last_active') {
            sortPipeline = { 'list.last_active_at': dir, 'workflow.reviewed_at': -1, _id: 1 }
        } else {
            sortPipeline = { 'workflow.reviewed_at': -1, 'list.last_active_at': -1, _id: 1 }
        }

        const basePipeline = [{ $match: query }]

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
            const picS3 = p.enrichment?.profile_pic_s3 || p.metadata?.s3_url
            if (picS3) {
                signedProfilePic = await getSignedImageUrl(picS3)
            }

            return buildNormalizedProfileForUi(p, { signedProfilePic })
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

export const getProfileCases = traceAction('getProfileCases', async (profileId) => {
    try {
        if (!profileId) return []

        const { dbName } = await requireAuthContext()

        const client = await clientPromise
        const db = client.db(dbName)
        const collection = postsCollection(db)

        const query = withReviewedThreatScoreFilter({ profile_id: new ObjectId(profileId) })
        const posts = await collection.find(query).sort({ 'list.reviewed_at': -1 }).toArray()
        return Promise.all(posts.map((p) => normalized_S3_post(p, db)))
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
        const collection = profilesCollection(db)

        const result = await collection.updateOne(
            { _id: new ObjectId(profileId) },
            {
                $set: {
                    'workflow.client_status': mapUiClientStatusToV3(status),
                    'system.updated_at': new Date(),
                },
            }
        )

        if (result.matchedCount > 0) {
            await insertCaseEvent(db, {
                entityType: 'profile',
                entityId: profileId,
                eventType: 'Client Status Updated',
                actor: clientDetails.email,
                summary: `Profile client status changed to ${status}`,
                payload: { ui_status: status, v3_status: mapUiClientStatusToV3(status) },
            })
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
        const collection = profilesCollection(db)

        const newNote = {
            text: noteText,
            email: clientDetails.email,
            created_at: new Date().toISOString()
        }

        const result = await collection.updateOne(
            { _id: new ObjectId(profileId) },
            {
                $push: { client_notes: newNote },
                $set: { 'system.updated_at': new Date() },
            }
        )

        if (result.matchedCount > 0) {
            await insertCaseEvent(db, {
                entityType: 'profile',
                entityId: profileId,
                eventType: 'Client Note Added',
                actor: clientDetails.email,
                summary: 'Profile client note added',
                payload: { note: newNote },
            })
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
