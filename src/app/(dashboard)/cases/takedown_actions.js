'use server'

import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { sendSlackNotification } from '@/utils/slack'
import { updateClientReviewedMetrics, updateDailyMetrics, updateClientMetaStats } from '@/utils/supabase/metrics'
import { ObjectId } from 'mongodb'
// import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { traceAction } from '@/utils/tracing'
// import { metadata } from '../layout'



export const getProjectDetails = traceAction('getProjectDetails_cases', async () => {
    const user = await getAuthenticatedUser()

    if (!user) return null

    const supabase = await createClient()
    const { data: clientDetails } = await supabase
        .from('client_details')
        .select('email, project_name, project:project_name(mongo_db_map, project_details)')
        .eq('id', user.id)
        .single()

    if (!clientDetails?.project_name) return null

    return {
        client_email: clientDetails.email,
        projectName: clientDetails.project_name,
        dbName: clientDetails.project?.mongo_db_map
    }
})

//--------- TAKEDOWNS RELATED SETUP
//
// FOR TAKEDOWNS DETAILS ( WE REFACTOR LATER WHEN WE SEE THE TAKEDOWNS )
//
export const initiateTakedown = traceAction('initiateTakedown', async (caseId, status, client_email) => {
    try {
        const projectDetails = await getProjectDetails()
        if (!projectDetails?.dbName) {
            return { success: false, error: "Project configuration not found" }
        }

        const client = await clientPromise
        const db = client.db(projectDetails.dbName)
        const collection = db.collection('Posts')

        // 1. Fetch post data
        const post = await collection.findOne({ _id: new ObjectId(caseId) })
        if (!post) {
            return { success: false, error: "Case not found" }
        }

        // SETUP THE OBJECT FOR TAKEDOWN MANAGEMENT
        const takedown_info = {
            in_takedown_process: true,
            status: 'initiated',
            takedown_start_date: new Date().toISOString(),
            notes: [],
            documents: [],
            events: [
                {
                    event: 'Takedown Initiated',
                    date: new Date().toISOString(),
                    details: `Takedown initiated by client ${client_email}`
                }
            ]
        }

        const result = await collection.updateOne(
            { _id: new ObjectId(caseId) },
            {
                $set: {
                    client_status: status,
                    "content_reviewed_by": projectDetails.client_email,
                    "metadata.updated_at": new Date().toISOString(),
                    "takedown_info": takedown_info
                },
                $push: {
                    "metadata.update_history": {
                        updated_at: new Date(),
                        updated_by: projectDetails.client_email,
                        changes_summary: "client initiated case takedown"
                    }
                }
            }
        )

        if (result.matchedCount > 0) {
            // Track metrics

            // 1. DAILY REVIEW METRICS UPDATES
            const currentReviewData = {
                risk_score: post.review_details?.threat_score || 0,
                client_status: status,
                platform: post?.platform.toLowerCase()
            }

            const previousReviewData = post.client_status && post.client_status !== 'To Be Reviewed' ? {
                risk_score: post.review_details?.threat_score || 0,
                client_status: post.client_status,
                platform: post?.platform.toLowerCase()
            } : null

            await updateClientReviewedMetrics(
                { project_name: projectDetails.projectName },
                currentReviewData,
                previousReviewData
            ).catch(err =>
                console.error('Failed to update client metrics:', err)
            )

            // 2. CLIENT's META STATS UPDATE
            await updateClientMetaStats(
                projectDetails.projectName,
                client_email,
                "reviewed_case"
            )

            // SLACK NOTIFICATION
            // 4. Trigger Slack Alert
            await sendSlackNotification().catch(e => console.error("Slack alert failed", e));

            return { success: true }
        } else {
            return { success: false, error: "Case not found" }
        }

    } catch (e) {
        console.error("Approve Takedown Error:", e)
        return { success: false, error: e.message }
    }
})

export const getPriorityTakedowns = traceAction('getPriorityTakedowns', async () => {
    try {
        const projectDetails = await getProjectDetails()
        if (!projectDetails?.dbName) {
            return []
        }

        const client = await clientPromise
        const db = client.db(projectDetails.dbName)
        const collection = db.collection('Posts')

        // Fetch all requested takedowns (priority)
        const posts = await collection.find({
            'takedown_info.takedown_status': 'requested'
        })
            .sort({ 'metadata.created_at': -1 })
            .toArray()

        // Serialize and Sign URLs (reuse logic)
        const processedPosts = await Promise.all(posts.map(async (post) => {
            let s3UrlToSign = null;
            if (post.post_content?.media_urls && post.post_content.media_urls.length > 0) {
                const firstMedia = post.post_content.media_urls[0];
                s3UrlToSign = firstMedia.thumbnail_url || firstMedia.s3_url;
            } else if (post.s3_url) {
                s3UrlToSign = post.s3_url;
            }

            const signedUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null;

            const normalized = {
                _id: post._id.toString(),
                created_at: post.metadata?.created_at ? new Date(post.metadata.created_at).toISOString() : null,
                taken_at: post.post_content?.taken_at || post.taken_at || null,
                platform: post.platform ? post.platform.toLowerCase() : 'instagram',
                processed: post.processed || false,
                client_status: post.client_status || 'To Be Reviewed',
                caption: post.post_content?.caption || post.caption || '',
                signedImageUrl: signedUrl,
                user: {
                    username: post.profile?.username || post.user?.username || 'Unknown',
                    full_name: post.profile?.display_name || '',
                    profile_pic_url: post.profile?.profile_pic_url || post.profile?.profile_url || '',
                    is_verified: post.profile?.is_verified || false
                },
                review_details: post.review_details || null,
                takedown_info: post.takedown_info || null,
                analysis_results: post.analysis_results || null,
                stats: {
                    like_count: post.engagement?.likes || 0,
                    comment_count: post.engagement?.comments || 0,
                    share_count: post.engagement?.shares || 0
                }
            };
            return normalized;
        }));

        return processedPosts;
    } catch (e) {
        console.error('getPriorityTakedowns Error:', e)
        return []
    }
})

export const getRaisedCount = traceAction('getRaisedCount', async () => {
    try {
        const projectDetails = await getProjectDetails()
        if (!projectDetails?.dbName) {
            return 0
        }
        const client = await clientPromise
        const db = client.db(projectDetails.dbName)
        const collection = db.collection('Posts')
        return await collection.countDocuments({ 'takedown_info.takedown_status': 'raised' })
    } catch (e) {
        console.error('getRaisedCount Error:', e)
        return 0
    }
})
//-------END OF TAKEDOWNS RELATED ACTIONS
