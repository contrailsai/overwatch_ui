'use server'

import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'
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

export const updateProfileClientStatus = traceAction('updateProfileClientStatus', async (project, profileId, status) => {
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
