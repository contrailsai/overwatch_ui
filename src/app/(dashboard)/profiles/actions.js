'use server'

import { updateClientMetaStats } from '@/utils/supabase/metrics'
import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction } from '@/utils/tracing'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { requireAuthContext } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { withReviewedThreatScoreFilter } from '@/lib/posts/reviewed-post-filter'
import { resolvePoiDateRange } from '@/lib/pois/poi-helpers'
import { postsCollection, profilesCollection } from '@/utils/mongodb/collections'
import {
  buildNormalizedPostForUi,
  buildNormalizedProfileForUi,
  getFirstMediaS3Url,
  insertCaseEvent,
  mapUiClientStatusToV3,
} from '@/utils/mongodb/v3-schema'

function parseObjectId(id) {
  if (!id || !ObjectId.isValid(id)) return null
  return new ObjectId(id)
}

/** Reviewed posts for a profile, optionally constrained to a date range on posted_at ?? sourced_at. */
function buildProfilePostMatch(profileOid, { from = null, to = null } = {}) {
  const match = withReviewedThreatScoreFilter({ profile_id: profileOid })
  if (from || to) {
    const dateExpr = { $ifNull: ['$list.posted_at', '$list.sourced_at'] }
    const bounds = []
    if (from) bounds.push({ $gte: [dateExpr, from] })
    if (to) bounds.push({ $lte: [dateExpr, to] })
    match.$and = [...(match.$and || []), { $expr: { $and: bounds } }]
  }
  return match
}

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

export const getProfileById = traceAction('getProfileById', async (profileId) => {
    try {
        const oid = parseObjectId(profileId)
        if (!oid) return { profile: null, error: 'Invalid profile id' }

        const { dbName } = await requireAuthContext()
        const client = await clientPromise
        const db = client.db(dbName)
        const doc = await profilesCollection(db).findOne({ _id: oid })
        if (!doc) return { profile: null, error: 'Profile not found' }

        let signedProfilePic = null
        const picS3 = doc.enrichment?.profile_pic_s3 || doc.metadata?.s3_url
        if (picS3) {
            signedProfilePic = await getSignedImageUrl(picS3)
        }

        return {
            profile: buildNormalizedProfileForUi(doc, { signedProfilePic }),
        }
    } catch (e) {
        logActionError({ loki_stream: LOKI_STREAMS.profiles, app_action: 'getProfileById', message: 'getProfileById failed' }, e)
        return { profile: null, error: e.message }
    }
})

export const getProfileAnalytics = traceAction('getProfileAnalytics', async (profileId, range = {}) => {
    try {
        const oid = parseObjectId(profileId)
        if (!oid) {
            return { error: 'Invalid profile id', riskRanks: [], violations: [], timeline: [], totalInRange: 0 }
        }

        const { dbName } = await requireAuthContext()
        const client = await clientPromise
        const db = client.db(dbName)
        const { from, to, preset } = resolvePoiDateRange(range)
        const match = buildProfilePostMatch(oid, { from, to })
        const posts = postsCollection(db)

        const [riskRows, violationRows, timelineRows, totalInRange] = await Promise.all([
            posts
                .aggregate([
                    { $match: match },
                    {
                        $group: {
                            _id: {
                                $toLower: {
                                    $ifNull: ['$list.risk_rank', 'unknown'],
                                },
                            },
                            count: { $sum: 1 },
                        },
                    },
                    { $sort: { count: -1 } },
                ])
                .toArray(),
            posts
                .aggregate([
                    { $match: match },
                    {
                        $project: {
                            threats: {
                                $cond: [
                                    { $gt: [{ $size: { $ifNull: ['$list.threat_types', []] } }, 0] },
                                    '$list.threat_types',
                                    { $ifNull: ['$review_details.threat_types', []] },
                                ],
                            },
                        },
                    },
                    { $unwind: { path: '$threats', preserveNullAndEmptyArrays: false } },
                    {
                        $group: {
                            _id: { $toLower: { $trim: { input: { $toString: '$threats' } } } },
                            count: { $sum: 1 },
                        },
                    },
                    { $sort: { count: -1 } },
                    { $limit: 12 },
                ])
                .toArray(),
            posts
                .aggregate([
                    { $match: match },
                    {
                        $project: {
                            day: {
                                $dateToString: {
                                    format: '%Y-%m-%d',
                                    date: { $ifNull: ['$list.posted_at', '$list.sourced_at'] },
                                },
                            },
                        },
                    },
                    { $match: { day: { $ne: null } } },
                    { $group: { _id: '$day', count: { $sum: 1 } } },
                    { $sort: { _id: 1 } },
                ])
                .toArray(),
            posts.countDocuments(match),
        ])

        return {
            preset,
            from: from ? from.toISOString() : null,
            to: to ? to.toISOString() : null,
            totalInRange,
            riskRanks: riskRows.map((r) => ({
                rank: r._id === 'mid' ? 'medium' : (r._id || 'unknown'),
                count: r.count,
            })),
            violations: violationRows.map((r) => ({
                type: r._id || 'unknown',
                count: r.count,
            })),
            timeline: timelineRows.map((r) => ({
                date: r._id,
                count: r.count,
            })),
        }
    } catch (e) {
        logActionError({ loki_stream: LOKI_STREAMS.profiles, app_action: 'getProfileAnalytics', message: 'getProfileAnalytics failed' }, e)
        return { error: e.message, riskRanks: [], violations: [], timeline: [], totalInRange: 0 }
    }
})

export const getProfilePosts = traceAction('getProfilePosts', async (profileId, range = {}, limit = 24) => {
    try {
        const oid = parseObjectId(profileId)
        if (!oid) return { posts: [], error: 'Invalid profile id' }

        const { dbName } = await requireAuthContext()
        const client = await clientPromise
        const db = client.db(dbName)
        const { from, to } = resolvePoiDateRange(range)
        const match = buildProfilePostMatch(oid, { from, to })
        const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 48)

        const docs = await postsCollection(db)
            .find(match)
            .sort({ 'list.posted_at': -1, 'list.sourced_at': -1 })
            .limit(safeLimit)
            .toArray()

        const posts = await Promise.all(
            docs.map(async (post) => {
                const s3Url = getFirstMediaS3Url(post)
                const signedImageUrl = s3Url ? await getSignedImageUrl(s3Url) : null
                const normalized = buildNormalizedPostForUi(post, { signedImageUrl })
                return {
                    _id: normalized._id || post._id?.toString(),
                    platform: normalized.platform || post.platform,
                    caption: normalized.caption || post.content?.caption || '',
                    signedImageUrl,
                    original_url: post.original_url || normalized.original_url || null,
                    sourced_at: post.list?.sourced_at
                        ? new Date(post.list.sourced_at).toISOString()
                        : null,
                    posted_at: post.list?.posted_at
                        ? new Date(post.list.posted_at).toISOString()
                        : null,
                    threat_types: post.list?.threat_types || post.review_details?.threat_types || [],
                    effective_threat_score:
                        post.list?.effective_threat_score ??
                        post.list?.review_threat_score ??
                        post.list?.ai_threat_score ??
                        normalized.score ??
                        null,
                    author: {
                        username: post.author_snapshot?.username || normalized.user?.username || null,
                        display_name: post.author_snapshot?.display_name || normalized.user?.full_name || null,
                    },
                }
            })
        )

        return { posts }
    } catch (e) {
        logActionError({ loki_stream: LOKI_STREAMS.profiles, app_action: 'getProfilePosts', message: 'getProfilePosts failed' }, e)
        return { posts: [], error: e.message }
    }
})

/** Lightweight IDs for PDF/DOCX profile reports — all reviewed cases, not date-filtered. */
export const getProfileCaseIds = traceAction('getProfileCaseIds', async (profileId) => {
    try {
        const oid = parseObjectId(profileId)
        if (!oid) return []

        const { dbName } = await requireAuthContext()
        const client = await clientPromise
        const db = client.db(dbName)
        const query = withReviewedThreatScoreFilter({ profile_id: oid })
        const docs = await postsCollection(db)
            .find(query)
            .project({ _id: 1 })
            .sort({ 'list.reviewed_at': -1 })
            .toArray()

        return docs.map((d) => ({ _id: d._id.toString() }))
    } catch (e) {
        logActionError({ loki_stream: LOKI_STREAMS.profiles, app_action: 'getProfileCaseIds', message: 'getProfileCaseIds failed' }, e)
        return []
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
