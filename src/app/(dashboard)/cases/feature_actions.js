'use server'

import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { sendSlackNotification } from '@/utils/slack'
import { updateClientReviewedMetrics, updateDailyMetrics } from '@/utils/supabase/metrics'
import { ObjectId } from 'mongodb'
// import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { traceAction, recordClickMetric } from '@/utils/tracing'
import { metadata } from '../layout'
import { requireAuthContext, requireRole } from '@/utils/auth-context'

import { normalized_S3_post } from './actions'

// ADD NOTE
export const addReviewNote = traceAction('addReviewNote', async (caseId, noteText) => {
    try {
        const { dbName, clientDetails } = await requireAuthContext()

        const client = await clientPromise
        const db = client.db(dbName)
        const collection = db.collection('Posts')

        const newNote = {
            text: noteText,
            email: clientDetails.email,
            created_at: new Date().toISOString()
        }

        const result = await collection.updateOne(
            { _id: new ObjectId(caseId) },
            {
                $set: { "metadata.updated_at": new Date().toISOString() },
                $push: {
                    client_notes: newNote,
                    "metadata.update_history": {
                        updated_at: new Date(),
                        updated_by: clientDetails.email,
                        changes_summary: "client added a review note"
                    }
                }
            }
        )

        if (result.matchedCount > 0) {
            return { success: true, note: newNote }
        } else {
            return { success: false, error: "Case not found" }
        }
    } catch (e) {
        console.error("addReviewNote Error:", e)
        return { success: false, error: e.message }
    }
})

// FOR RESULTS EDIT FUNCTIONALITY
export const submitCaseReview = traceAction('submitCaseReview', async (_project, _clientDetails, prevState, formData) => {
    const { dbName, clientDetails, project } = await requireAuthContext()

    const mongoId = formData.get('mongo_id')

    if (!mongoId) {
        return { success: false, error: 'Missing Post ID' }
    }

    // ----- STEP 1 ----> GO THROUGH FORM DATA AND CREATE THE DATA STRUCUTRE TO SAVE
    //--------------------------------------------------------------------
    // ----------------------
    // Handle dynamic flags from project labels
    const flags = {}
    const threat_types = []
    const legal_codes = []

    // project.mongo_db_map is already fetched, but we might need project_details labels
    // Currently we use 'flag_' prefix (check EditForm hidden inputs)
    for (const [key, value] of formData.entries()) {
        if (key.startsWith('flag_')) {
            const labelName = key.replace('flag_', '')
            const isActive = value === 'on'
            flags[labelName] = isActive
            if (isActive) {
                threat_types.push(labelName)
            }
        } else if (key.startsWith('legal_code_')) {
            const codeName = key.replace('legal_code_', '')
            const isActive = value === 'on'
            if (isActive) {
                legal_codes.push({
                    code: codeName,
                    reasoning: formData.get(`legal_reasoning_${codeName}`) || ''
                })
            }
        }
    }

    // Determine Takedown Status
    // If "is_in_takedown" is checked, default to 'raised' (Reviewer Checked)
    // This signals the Client to approve/start it.
    // const isTakedown = formData.get('is_in_takedown') === 'on';
    const takedown_status = formData.get('takedown_status');
    const suggest_takedown = ["on", "yes", "true"].includes(formData.get('suggest_takedown')?.toLowerCase());
    const already_in_takedown = ['raised', 'under_review', 'accepted', 'rejected', 'suspended', 'resolution'].includes(takedown_status);

    let takedown_info = {}
    if (!already_in_takedown) {
        // if its not in takedown stage then update it to be None or Requested for a takedown
        takedown_info = {
            takedown_status: suggest_takedown ? "requested" : "None"
        }
    }
    else {
        // if its already raised before and has an ongoing takedown stage dont update it
        takedown_info = {
            takedown_status: takedown_status
        }
    }


    // ----- STEP 2 ----> UPDATE THE DATA IN THE DATABASE AND SEND TO UPDATE METRICS
    //--------------------------------------------------------------------
    // ----------------------
    try {
        const client = await clientPromise
        const db = client.db(dbName) // Use Correct DB
        const collection = db.collection('Posts')

        // 1. Fetch existing post to get previous state
        const existingPost = await collection.findOne(
            { _id: new ObjectId(mongoId) },
            { projection: { text_embedding: 0, image_embedding: 0 } }
        )
        if (!existingPost) {
            return { success: false, error: 'Post not found' }
        }

        const review_details = {
            threat_score: parseInt(formData.get('threat_score') || '0'),
            threat_types: threat_types.length > 0 ? threat_types : ['safe'],
            legal_codes: legal_codes,
            is_aigc: formData.get('is_aigc') === 'on',

            // Flags
            flags: flags,

            // Text & Lists
            poi_names: formData.get('poi_names') ? formData.get('poi_names').split(',').map(s => s.trim()).filter(Boolean) : [],
            reasoning: formData.get('reasoning'),
            reviewer_comments: formData.get('reviewer_comments'),

            // POI
            face_present: ["on", "yes", "true"].includes(formData.get('face_present')?.toLowerCase()),
            name_present: ["on", "yes", "true"].includes(formData.get('name_present')?.toLowerCase()),

            reviewed_at: existingPost.review_details?.reviewed_at || new Date().toISOString()
        }

        // Check if it was previously reviewed to handle metrics updates correctly
        // We only treat it as an update if it has a valid threat_score from a previous session
        const prevReview = existingPost.review_details;
        const isPreviouslyReviewed = existingPost.processed && prevReview && prevReview.threat_score !== undefined;

        const previousReviewData = isPreviouslyReviewed ? {
            threat_score: prevReview.threat_score,
            threat_types: prevReview.threat_types || [prevReview.primary_threat_type || prevReview.threat_type], // Handle backward compat
            is_aigc: prevReview.is_aigc,
            platform: existingPost.platform
        } : null

        // 2. Update MongoDB
        const result = await collection.updateOne(
            { _id: new ObjectId(mongoId) },
            {
                $set: {
                    review_details,
                    takedown_info,
                    processed: true,
                    processed_at: new Date(),
                    "metadata.updated_at": new Date().toISOString()
                },
                $push: {
                    "metadata.update_history": {
                        updated_at: new Date(),
                        updated_by: clientDetails.email,
                        changes_summary: "client edited case review details"
                    }
                }
            }
        )

        // 3. Update Supabase Metrics
        const currentReviewData = {
            threat_score: review_details.threat_score,
            threat_types: review_details.threat_types,
            is_aigc: review_details.is_aigc,
            // takedown metrics are now handled in cases/actions.js
            platform: existingPost.platform ? existingPost.platform.toLowerCase() : 'instagram'
        }

        await updateDailyMetrics(project, currentReviewData, previousReviewData).catch(err =>
            console.error('Background metrics update failed:', err)
        )

        //
        // MAYBE WRITE AN ALERT SCENRIO FOR OTHERS IF RAISE TO A VERY HIGH LEVEL ??
        //

        return {
            success: true,
            updatedFields: {
                review_details,
                takedown_info,
                processed: true,
                processed_at: new Date().toISOString()
            }
        }
    } catch (error) {
        console.error('MongoDB Update Error:', error)
        return { success: false, error: error.message }
    }
})

// fetch other clients emails in the same project
export const fetch_clients_in_project = traceAction('fetch_clients_in_project', async () => {
    const { clientDetails } = await requireAuthContext()
    const supabase = await createClient();

    // Fetch
    const { data: client_details, error: dbError } = await supabase
        .from('client_details')
        .select('email, alias')
        .eq('project_name', clientDetails.project_name)
        .neq('permission', 'reviewer'); // anyone except reviewers

    if (dbError) {
        console.error(`[fetch_clients_in_project] Database Error:`, dbError.message);
        return { data: null, error: 'Failed to fetch project clients' };
    }

    const emails_and_aliases = client_details?.map((client) => ({ email: client.email, alias: client.alias })) || [];
    // console.log("CLEINT EMAILS = ", emails_and_aliases)

    return emails_and_aliases;
});

// ASSIGN TO OTHER CLIENTS (emails)
export const assignCaseTo = traceAction('assignCaseTo', async (_project, _clientDetails, post_id, assigned_email) => {
    const { dbName, clientDetails } = await requireRole(['client-admin'])

    if (!post_id) {
        return { success: false, error: 'Missing Post ID' }
    }

    try {
        const client = await clientPromise
        const db = client.db(dbName) // Use Correct DB
        const collection = db.collection('Posts')

        const result = await collection.updateOne(
            { _id: new ObjectId(post_id) },
            {
                $set: {
                    "assigned_to": assigned_email,
                    "metadata.updated_at": new Date().toISOString()
                },
                $push: {
                    "metadata.update_history": {
                        updated_at: new Date(),
                        updated_by: clientDetails.email,
                        changes_summary: "client admin assigned case to another client"
                    }
                }
            }
        )

        // FINALY ADD NOTIFICATION MESSAGE TO THE ASSIGNED CLIENT
        const supabase = await createClient()

        const { error } = await supabase
            .from('notifications')
            .insert([
                {
                    "client_email": assigned_email,
                    "notification_msg": "You are assigned a new case to review visit. ",
                    "notification_action": { "button": { "redirect": `/cases/${post_id}` } }
                }
            ])

        return {
            success: true,
            updatedFields: {
                assigned_to: assigned_email,
                processed_at: new Date().toISOString()
            }
        }
    } catch (error) {
        console.error('MongoDB Update Error:', error)
        return { success: false, error: error.message }
    }
})

// BULK ASSIGN TO OTHER CLIENTS (emails)
export const bulkAssignCasesTo = traceAction('bulkAssignCasesTo', async (_project, _clientDetails, post_ids, assigned_email) => {
    const { dbName, clientDetails } = await requireRole(['client-admin'])

    if (!post_ids || !Array.isArray(post_ids) || post_ids.length === 0) {
        return { success: false, error: 'Missing or invalid Post IDs' }
    }

    try {
        const client = await clientPromise
        const db = client.db(dbName) // Use Correct DB
        const collection = db.collection('Posts')

        const objectIds = post_ids.map(id => new ObjectId(id))

        const result = await collection.updateMany(
            { _id: { $in: objectIds } },
            {
                $set: {
                    "assigned_to": assigned_email,
                    "metadata.updated_at": new Date().toISOString()
                },
                $push: {
                    "metadata.update_history": {
                        updated_at: new Date(),
                        updated_by: clientDetails.email,
                        changes_summary: "admin assigned case to another client"
                    }
                }
            }
        )

        // FINALY ADD NOTIFICATION MESSAGE TO THE ASSIGNED CLIENT
        const supabase = await createClient()

        const { error } = await supabase
            .from('notifications')
            .insert([
                {
                    "client_email": assigned_email,
                    "notification_msg": `You have been assigned ${post_ids.length} new cases to review.`,
                    "notification_action": { "button": { "redirect": `/cases` } }
                }
            ])

        return {
            success: true,
            count: result.modifiedCount
        }
    } catch (error) {
        console.error('MongoDB Bulk Update Error:', error)
        return { success: false, error: error.message }
    }
})

