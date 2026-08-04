'use server'

import clientPromise from '@/utils/mongodb/client'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { sendSlackNotification } from '@/utils/slack'
import { countReviewedCaseActivityDelta } from '@/utils/supabase/reviewed-activity-count'
import { updateClientReviewedMetricsBatch, updateClientMetaStats } from '@/utils/supabase/metrics'
import { ObjectId } from 'mongodb'
// import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { traceAction } from '@/utils/tracing'
import { requireAuthContext } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { postsCollection } from '@/utils/mongodb/collections'
import { insertCaseEvent, mapUiClientStatusToV3 } from '@/utils/mongodb/v3-schema'
import { normalizeS3Post } from '@/lib/posts/pipeline-helpers'
// import { metadata } from '../layout'

//--------- TAKEDOWNS RELATED SETUP
//
// FOR TAKEDOWNS DETAILS ( WE REFACTOR LATER WHEN WE SEE THE TAKEDOWNS )
//
export const initiateTakedown = traceAction('initiateTakedown', async (caseIds, _client_email) => {
    try {
        const { dbName, clientDetails } = await requireAuthContext()
        const ids = Array.isArray(caseIds) ? caseIds : [caseIds]
        if (ids.length === 0) {
            return { success: false, error: "No cases provided" }
        }

        const client = await clientPromise
        const db = client.db(dbName)
        const collection = postsCollection(db)

        const objectIds = ids.map(id => new ObjectId(id))
        const isBulk = ids.length > 1

        const posts = await collection.find(
            {
                _id: { $in: objectIds },
                $and: [
                    { 'workflow.takedown_status': { $nin: ['initiated', 'under_review', 'takedown_successful'] } },
                    { 'workflow.client_status': { $ne: 'takedown' } },
                ],
            }
        ).toArray()

        if (posts.length === 0) {
            return { success: false, error: "No eligible cases found (already in takedown or missing)" }
        }

        const now = new Date()
        const v3Status = mapUiClientStatusToV3('Takedown')
        const changesSummary = isBulk ? "client initiated bulk case takedown" : "client initiated case takedown"
        const eventDetails = `Takedown initiated by client ${clientDetails.email}${isBulk ? ' (bulk)' : ''}`

        const bulkOps = posts.map(post => ({
            updateOne: {
                filter: { _id: post._id },
                update: {
                    $set: {
                        'workflow.client_status': v3Status,
                        'workflow.takedown_status': 'initiated',
                        content_reviewed_by: clientDetails.email,
                        'system.updated_at': now,
                        takedown: {
                            ...(post.takedown || {}),
                            status: 'initiated',
                            initiated_at: now,
                            completed_at: post.takedown?.completed_at || null,
                            notes: post.takedown?.notes || [],
                            documents: post.takedown?.documents || [],
                        },
                    },
                }
            }
        }))

        const result = await collection.bulkWrite(bulkOps)

        await Promise.all(posts.map((post) =>
            insertCaseEvent(db, {
                entityType: 'post',
                entityId: post._id.toString(),
                eventType: 'Takedown Initiated',
                actor: clientDetails.email,
                summary: eventDetails,
                payload: {
                    event: 'Takedown Initiated',
                    date: now.toISOString(),
                    details: eventDetails,
                },
            })
        ))

        await updateClientReviewedMetricsBatch(
            { project_name: clientDetails.project_name },
            posts,
            'Takedown'
        ).catch(err => logActionError({
            loki_stream: LOKI_STREAMS.cases,
            app_action: 'initiateTakedown',
            message: 'Failed to update client metrics',
        }, err))

        const reviewedActivityCount = countReviewedCaseActivityDelta(posts, 'Takedown')
        if (reviewedActivityCount > 0) {
            await updateClientMetaStats(
                clientDetails.project_name,
                clientDetails.email,
                'reviewed_case',
                reviewedActivityCount
            ).catch(err => logActionError({
                loki_stream: LOKI_STREAMS.cases,
                app_action: 'initiateTakedown',
                message: 'Failed to update meta stats',
            }, err))
        }

        await sendSlackNotification().catch(e => logActionError({
            loki_stream: LOKI_STREAMS.cases,
            app_action: 'initiateTakedown',
            message: 'Slack alert failed',
        }, e))

        return {
            success: true,
            count: result.modifiedCount,
            requested: ids.length,
            skipped: ids.length - posts.length
        }
    } catch (e) {
        logActionError({ loki_stream: LOKI_STREAMS.cases, app_action: 'initiateTakedown', message: 'initiateTakedown failed' }, e)
        console.error("Initiate Takedown Error:", e)
        return { success: false, error: e.message }
    }
})

export const getPriorityTakedowns = traceAction('getPriorityTakedowns', async () => {
    try {
        const { dbName } = await requireAuthContext()

        const client = await clientPromise
        const db = client.db(dbName)
        const collection = postsCollection(db)

        const posts = await collection.find(
            {
                $or: [
                    { 'review_details.flags': { $exists: true } },
                    { 'workflow.takedown_status': 'requested' },
                ],
                'workflow.review_status': 'reviewed',
            }
        )
            .sort({ 'list.reviewed_at': -1 })
            .toArray()

        const processedPosts = await Promise.all(posts.map((post) => normalizeS3Post(post, db)));

        return processedPosts;
    } catch (e) {
        logActionError({ loki_stream: LOKI_STREAMS.cases, app_action: 'getPriorityTakedowns', message: 'getPriorityTakedowns failed' }, e)
        console.error('getPriorityTakedowns Error:', e)
        return []
    }
})

export const getRaisedCount = traceAction('getRaisedCount', async () => {
    try {
        const { dbName } = await requireAuthContext()
        const client = await clientPromise
        const db = client.db(dbName)
        const collection = postsCollection(db)
        return await collection.countDocuments({ 'workflow.takedown_status': { $in: ['initiated', 'under_review'] } })
    } catch (e) {
        logActionError({ loki_stream: LOKI_STREAMS.cases, app_action: 'getRaisedCount', message: 'getRaisedCount failed' }, e)
        console.error('getRaisedCount Error:', e)
        return 0
    }
})
//-------END OF TAKEDOWNS RELATED ACTIONS
