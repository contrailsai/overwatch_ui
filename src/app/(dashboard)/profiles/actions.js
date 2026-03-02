'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction } from '@/utils/tracing'

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
            query.platform = filters.platform
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
            })
            .toArray()

        return posts.map(p => ({
            _id: p._id.toString(),
            platform: p.platform || 'unknown',
            caption: p.post_content?.caption || p.caption || '',
            original_url: p.original_url || null,
            client_status: p.client_status || 'To Be Reviewed',
            threat_score: p.review_details?.threat_score ?? null,
            primary_threat_type: p.review_details?.primary_threat_type || null,
            created_at: p.metadata?.created_at ? new Date(p.metadata.created_at).toISOString() : null,
        }))
    } catch (e) {
        console.error('getProfileCases MongoDB Error:', e)
        return []
    }
})
