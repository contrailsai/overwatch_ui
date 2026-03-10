'use server'

import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { sendSlackNotification } from '@/utils/slack'
import { manageTakedownCase, updateClientReviewedMetrics, updateDailyMetrics } from '@/utils/supabase/metrics'
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
export const approveTakedown = traceAction('approveTakedown', async (caseId) => {
    try {
        const projectDetails = await getProjectDetails()
        if (!projectDetails?.dbName) {
            return { success: false, error: "Project configuration not found" }
        }

        const client = await clientPromise
        const db = client.db(projectDetails.dbName)
        const collection = db.collection('Posts')

        // 1. Fetch current post data for metrics/Supabase
        const post = await collection.findOne({ _id: new ObjectId(caseId) })
        if (!post) {
            return { success: false, error: "Case not found" }
        }

        // 2. Trigger Supabase Takedown Case Management
        // This creates/updates the record in the 'takedown_cases' table
        const supabaseCase = await manageTakedownCase({
            mongo_post_id: caseId,
            post_platform_id: post.post_id || post.code,
            platform: post.platform ? post.platform.toLowerCase() : 'instagram',
            is_in_takedown: true,
            risk_score: post.review_details?.threat_score || 0,
            threat_type: post.review_details?.primary_threat_type || 'safe'
        }).catch(err => {
            console.error('Takedown management failed:', err)
            return null
        })

        // Track takedown event metric
        const currentReviewData = {
            risk_score: post.review_details?.threat_score || 0,
            client_status: 'Takedown',
            platform: post.platform ? post.platform.toLowerCase() : 'instagram'
        }

        const previousReviewData = post.client_status && post.client_status !== 'To Be Reviewed' ? {
            risk_score: post.review_details?.threat_score || 0,
            client_status: post.client_status,
            platform: post.platform ? post.platform.toLowerCase() : 'instagram'
        } : null

        updateClientReviewedMetrics({ project_name: projectDetails.projectName }, currentReviewData, previousReviewData).catch(err => {
            console.error('Failed to track takedown metric:', err)
        })

        // 3. Update MongoDB Status
        const result = await collection.updateOne(
            { _id: new ObjectId(caseId) },
            {
                $set: {
                    "takedown_info.takedown_status": "raised",
                    "takedown_info.client_approval_date": new Date().toISOString(),
                    "takedown_info.supabase_id": supabaseCase?.id || null,
                    "client_status": "Flag for Takedown"
                }
            }
        )

        if (result.modifiedCount === 1) {
            // 4. Trigger Slack Alert
            await sendSlackNotification().catch(e => console.error("Slack alert failed", e));
            return { success: true, supabase_id: supabaseCase?.id }
        } else {
            return { success: false, error: "Case not found or already updated" }
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
