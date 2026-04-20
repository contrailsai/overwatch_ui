'use server'

import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { getSignedImageUrl, uploadFileToS3, getSignedDownloadUrl, getSignedViewUrl } from '@/utils/aws/s3'
import { revalidatePath } from 'next/cache'
import { traceAction } from '@/utils/tracing'
import crypto from 'crypto'

async function getProjectDetails() {
  const user = await getAuthenticatedUser()

  if (!user) return null

  const supabase = await createClient()
  const { data: clientDetails } = await supabase
    .from('client_details')
    .select('project_name, project:project_name(mongo_db_map)')
    .eq('id', user.id)
    .single()

  if (!clientDetails?.project_name) return null

  return {
    projectName: clientDetails.project_name,
    dbName: clientDetails.project?.mongo_db_map
  }
}

/**
 * Check if the current user has reviewer permissions
 */
export const checkReviewerPermission = traceAction('checkReviewerPermission', async () => {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return false
  }

  const { data: clientDetails, error } = await supabase
    .from('client_details')
    .select('permission')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !clientDetails) {
    return false
  }

  return clientDetails.permission === 'reviewer'
})

const buildTakedownMatchQuery = (filters = {}) => {
  let query = {
    $or: [
      { client_status: { $regex: /^takedown$/i } },
      { 'takedown_info.status': { $exists: true } }
    ]
  }

  const andConditions = []

  // Status Filter
  if (filters.status && filters.status !== 'all') {
    const statusMap = {
      'takedown successful': ['takedown successful', 'takedown_successful'],
      'takedown_successful': ['takedown successful', 'takedown_successful'],
      'takedown failed': ['takedown failed', 'takedown_failed'],
      'takedown_failed': ['takedown failed', 'takedown_failed'],
      'appealed again': ['appealed again', 're_appeal_takedown'],
      're_appeal_takedown': ['appealed again', 're_appeal_takedown'],
      'under process': ['under process', 'under_review'],
      'under_review': ['under process', 'under_review']
    };
    
    if (statusMap[filters.status]) {
      query['takedown_info.status'] = { $in: statusMap[filters.status] }
    } else {
      query['takedown_info.status'] = filters.status
    }
  }

  // Platform Filter
  if (filters.platform && filters.platform !== 'all') {
    query.platform = { $regex: new RegExp(`^${filters.platform}$`, 'i') }
  }

  // Risk Priority Filter
  if (filters.risk_priority && filters.risk_priority !== 'all') {
    if (filters.risk_priority === 'high') {
      query['review_details.threat_score'] = { $gt: 95 }
    } else if (filters.risk_priority === 'medium') {
      query['review_details.threat_score'] = { $gt: 75, $lte: 95 }
    } else if (filters.risk_priority === 'low') {
      query['review_details.threat_score'] = { $gt: 40, $lte: 75 }
    } else if (filters.risk_priority === 'safe') {
      query['review_details.threat_score'] = { $lte: 40 }
    }
  }

  // Violations filter
  if (filters.violations && filters.violations !== 'all') {
    const violationsArray = filters.violations.split(',');
    if (violationsArray.length > 0) {
      const normalViolations = violationsArray.filter(v => v !== 'aigc');
      const hasAigc = violationsArray.includes('aigc');
      
      const violationConditions = [];
      if (normalViolations.length > 0) {
        violationConditions.push({ 'review_details.threat_types': { $in: normalViolations } });
        const flagConditions = normalViolations.map(v => ({ [`review_details.flags.${v}`]: true }));
        violationConditions.push(...flagConditions);
      }
      if (hasAigc) {
        violationConditions.push({ 'review_details.is_aigc': true });
      }
      
      if (violationConditions.length > 0) {
        andConditions.push({
          $or: violationConditions
        });
      }
    }
  }

  if (andConditions.length > 0) {
    query.$and = andConditions
  }

  return query
}

/**
 * Fetch all active takedowns with filters and enriched MongoDB data
 */
export const getTakedowns = traceAction('getTakedowns', async (filters = {}) => {
  const projectDetails = await getProjectDetails()
  if (!projectDetails?.projectName) return []

  try {
    const client = await clientPromise
    const db = client.db(projectDetails.dbName)
    const collection = db.collection('Posts')

    const matchStage = buildTakedownMatchQuery(filters)

    const dateFilterStage = {}

    if (filters.original_date_from || filters.original_date_to) {
      dateFilterStage.sort_original_date = {};
      if (filters.original_date_from) {
        dateFilterStage.sort_original_date.$gte = new Date(filters.original_date_from);
      }
      if (filters.original_date_to) {
        dateFilterStage.sort_original_date.$lte = new Date(filters.original_date_to);
      }
    }

    if (filters.processed_from || filters.processed_to) {
      dateFilterStage.sort_processed_after = {};
      if (filters.processed_from) {
        dateFilterStage.sort_processed_after.$gte = new Date(filters.processed_from);
      }
      if (filters.processed_to) {
        dateFilterStage.sort_processed_after.$lte = new Date(filters.processed_to);
      }
    }

    if (filters.takedown_date_from || filters.takedown_date_to) {
      dateFilterStage.sort_takedown_date = {};
      if (filters.takedown_date_from) {
        dateFilterStage.sort_takedown_date.$gte = new Date(filters.takedown_date_from);
      }
      if (filters.takedown_date_to) {
        dateFilterStage.sort_takedown_date.$lte = new Date(filters.takedown_date_to);
      }
    }

    const hasDateFilters = Object.keys(dateFilterStage).length > 0;

    const posts = await collection.aggregate([
      { $match: matchStage },
      { $project: { text_embedding: 0, image_embedding: 0 } },
      {
        $addFields: {
          sort_original_date: {
            $toDate: {
              $ifNull: ["$engagement.posted_at", "$metadata.posted_date"]
            }
          },
          sort_processed_after: {
            $toDate: {
              $ifNull: ["$review_details.reviewed_at", "$metadata.updated_at"]
            }
          },
          sort_takedown_date: {
            $toDate: {
              $ifNull: ["$takedown_info.takedown_start_date", "$metadata.updated_at"]
            }
          }
        }
      },
      ...(hasDateFilters ? [{ $match: dateFilterStage }] : []),
      { $sort: { 'takedown_info.events.date': -1, 'metadata.updated_at': -1 } }
    ]).toArray()

    const enrichedTakedowns = await Promise.all(posts.map(async (post) => {
      let thumbnail = null
      let caption = post.post_content?.caption || post.caption || ''
      let username = post.user?.username || post.profile?.username || 'Unknown'

      // Handle Media/Thumbnail
      if (post.post_content?.media_urls?.length > 0) {
        const media = post.post_content.media_urls[0]
        const s3Url = media.thumbnail_url || media.s3_url
        if (s3Url) {
          thumbnail = await getSignedImageUrl(s3Url)
        }
      } else if (post.s3_url) {
        thumbnail = await getSignedImageUrl(post.s3_url)
      }

      // Extract events to find last update date
      const events = post.takedown_info?.events || []
      let lastUpdateDate = events.length > 0 
        ? events[events.length - 1].date 
        : (post.takedown_info?.takedown_start_date || post.metadata?.updated_at || null)

      if (lastUpdateDate && lastUpdateDate.$date) lastUpdateDate = lastUpdateDate.$date
      
      let takedownDate = post.takedown_info?.takedown_start_date || null
      if (takedownDate && takedownDate.$date) takedownDate = takedownDate.$date

      return {
        id: post._id.toString(),
        mongo_post_id: post._id.toString(),
        post_platform_id: post.post_id || post.code || '',
        platform: post.platform,
        status: post.takedown_info?.status || 'initiated',
        risk_score: post.review_details?.threat_score || 0,
        threat_type: post.review_details?.threat_types?.[0] || 'Unknown',
        last_update_date: lastUpdateDate,
        takedown_date: takedownDate,
        notes: post.takedown_info?.notes ? post.takedown_info.notes.join('\n\n') : '',
        enrichment: {
          caption: caption.length > 100 ? caption.substring(0, 100) + '...' : caption,
          thumbnail,
          username
        }
      }
    }))

    return enrichedTakedowns
  } catch (mongoError) {
    console.error('Error fetching takedowns from MongoDB:', mongoError)
    return []
  }
})

export const getTakedownMetrics = traceAction('getTakedownMetrics', async (filters = {}) => {
  const projectDetails = await getProjectDetails()
  if (!projectDetails?.projectName) return { inProgress: 0, successful: 0, reAppeal: 0, failed: 0 }

  try {
    const client = await clientPromise
    const db = client.db(projectDetails.dbName)
    const collection = db.collection('Posts')
    
    // Create filters clone without status
    const metricsFilters = { ...filters }
    delete metricsFilters.status
    
    const matchStage = buildTakedownMatchQuery(metricsFilters)
    
    const dateFilterStage = {}

    if (filters.original_date_from || filters.original_date_to) {
      dateFilterStage.sort_original_date = {};
      if (filters.original_date_from) {
        dateFilterStage.sort_original_date.$gte = new Date(filters.original_date_from);
      }
      if (filters.original_date_to) {
        dateFilterStage.sort_original_date.$lte = new Date(filters.original_date_to);
      }
    }

    if (filters.processed_from || filters.processed_to) {
      dateFilterStage.sort_processed_after = {};
      if (filters.processed_from) {
        dateFilterStage.sort_processed_after.$gte = new Date(filters.processed_from);
      }
      if (filters.processed_to) {
        dateFilterStage.sort_processed_after.$lte = new Date(filters.processed_to);
      }
    }

    if (filters.takedown_date_from || filters.takedown_date_to) {
      dateFilterStage.sort_takedown_date = {};
      if (filters.takedown_date_from) {
        dateFilterStage.sort_takedown_date.$gte = new Date(filters.takedown_date_from);
      }
      if (filters.takedown_date_to) {
        dateFilterStage.sort_takedown_date.$lte = new Date(filters.takedown_date_to);
      }
    }

    const hasDateFilters = Object.keys(dateFilterStage).length > 0;

    const pipeline = [
      { $match: matchStage }
    ]
    
    if (hasDateFilters) {
      pipeline.push({
        $addFields: {
          sort_original_date: {
            $toDate: {
              $ifNull: ["$engagement.posted_at", "$metadata.posted_date"]
            }
          },
          sort_processed_after: {
            $toDate: {
              $ifNull: ["$review_details.reviewed_at", "$metadata.updated_at"]
            }
          },
          sort_takedown_date: {
            $toDate: {
              $ifNull: ["$takedown_info.takedown_start_date", "$metadata.updated_at"]
            }
          }
        }
      })
      pipeline.push({ $match: dateFilterStage })
    }

    pipeline.push({
      $group: {
        _id: "$takedown_info.status",
        count: { $sum: 1 }
      }
    })

    const metrics = await collection.aggregate(pipeline).toArray()

    return metrics.reduce((acc, curr) => {
      const status = curr._id ? curr._id.toLowerCase() : 'unknown'
      if (['initiated', 'under_review'].includes(status)) acc.inProgress += curr.count;
      else if (status === 'takedown_successful' || status === 'takedown successful') acc.successful += curr.count;
      else if (status === 're_appeal_takedown' || status === 'appealed again') acc.reAppeal += curr.count;
      else if (status === 'takedown_failed' || status === 'takedown failed') acc.failed += curr.count;
      return acc;
    }, { inProgress: 0, successful: 0, reAppeal: 0, failed: 0 });
    
  } catch (error) {
    console.error('Error fetching takedown metrics:', error)
    return { inProgress: 0, successful: 0, reAppeal: 0, failed: 0 }
  }
})

/**
 * Upload a document for a takedown case
 */
export const uploadTakedownDocument = traceAction('uploadTakedownDocument', async (takedownId, formData) => {
  const isReviewer = await checkReviewerPermission()
  if (!isReviewer) return { success: false, error: 'Unauthorized: Reviewer access required' }

  const projectDetails = await getProjectDetails()
  if (!projectDetails?.projectName) return { success: false, error: 'Unauthorized' }

  const file = formData.get('file')
  if (!file) return { success: false, error: 'No file provided' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const fileName = file.name
    const fileType = file.type
    const fileSize = file.size
    const s3Key = `takedown-cases/${takedownId}/${Date.now()}-${fileName}`

    // 1. Upload to S3
    await uploadFileToS3(buffer, s3Key, fileType)

    // 2. Update MongoDB
    const client = await clientPromise
    const db = client.db(projectDetails.dbName)
    
    const documentRecord = {
      id: crypto.randomUUID(),
      file_name: fileName,
      file_type: fileType,
      file_size: fileSize,
      s3_key: s3Key,
      uploaded_by: user.id,
      created_at: new Date().toISOString()
    }

    const eventRecord = {
      id: crypto.randomUUID(),
      action: 'document_uploaded',
      event: 'Document Uploaded',
      details: `Uploaded document: ${fileName}`,
      created_by: user.id,
      date: new Date().toISOString(),
      created_at: new Date().toISOString()
    }

    await db.collection('Posts').updateOne(
      { _id: new ObjectId(takedownId) },
      { 
        $push: { 
          'takedown_info.documents': documentRecord,
          'takedown_info.events': eventRecord
        } 
      }
    )

    revalidatePath(`/takedowns/case/${takedownId}`)
    return { success: true }
  } catch (error) {
    console.error('Upload error:', error)
    return { success: false, error: error.message }
  }
})

/**
 * Get documents for a takedown case
 */
export const getTakedownDocuments = traceAction('getTakedownDocuments', async (takedownId) => {
  const projectDetails = await getProjectDetails()
  if (!projectDetails?.projectName) return []

  try {
    const client = await clientPromise
    const db = client.db(projectDetails.dbName)
    
    const post = await db.collection('Posts').findOne(
      { _id: new ObjectId(takedownId) },
      { projection: { text_embedding: 0, image_embedding: 0 } }
    )
    if (!post || !post.takedown_info || !post.takedown_info.documents) {
      return []
    }

    const sortedDocs = post.takedown_info.documents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    
    // Generate signed view URLs for all documents so frontend can preview them
    const docsWithUrls = await Promise.all(sortedDocs.map(async (doc) => {
      const viewUrl = await getSignedViewUrl(doc.s3_key)
      return { ...doc, view_url: viewUrl }
    }))
    
    return docsWithUrls
  } catch (error) {
    console.error('Error fetching documents:', error)
    return []
  }
})

/**
 * Generate download URL for a document
 */
export const getDocumentDownloadUrl = traceAction('getDocumentDownloadUrl', async (documentId) => {
  const projectDetails = await getProjectDetails()
  if (!projectDetails?.projectName) return null

  try {
    const client = await clientPromise
    const db = client.db(projectDetails.dbName)
    
    const post = await db.collection('Posts').findOne(
      { 'takedown_info.documents.id': documentId },
      { projection: { text_embedding: 0, image_embedding: 0 } }
    )
    if (!post) return null

    const doc = post.takedown_info.documents.find(d => d.id === documentId)
    if (!doc) return null

    return await getSignedDownloadUrl(doc.s3_key, doc.file_name)
  } catch (error) {
    console.error('Error generating document download url:', error)
    return null
  }
})

/**
 * Fetch specific takedown details including Mongo post data and history
 */
export const getTakedownDetails = traceAction('getTakedownDetails', async (id) => {
  const projectDetails = await getProjectDetails()
  if (!projectDetails?.projectName) return null

  try {
    const client = await clientPromise
    const db = client.db(projectDetails.dbName)

    let post = await db.collection('Posts').findOne(
      { _id: new ObjectId(id) },
      { projection: { text_embedding: 0, image_embedding: 0 } }
    )

    if (!post) return null

    // Serialize MongoDB objects for Next.js Client Components
    post = JSON.parse(JSON.stringify(post))

    // Ensure _id is a string (JSON.stringify handles this but let's be explicit if needed)
    if (post._id) post._id = post._id.toString()

    // Handle signed URL here if needed by the UI
    let s3UrlToSign = null
    if (post.post_content?.media_urls && post.post_content.media_urls.length > 0) {
      const firstMedia = post.post_content.media_urls[0]
      s3UrlToSign = firstMedia.thumbnail_url || firstMedia.s3_url
    } else if (post.s3_url) {
      s3UrlToSign = post.s3_url
    }
    post.signedImageUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null

    // NORMALIZE USER DATA HERE for consistency across UI
    post.user = {
      username: post.user?.username || post.profile?.username || 'Unknown',
      full_name: post.user?.full_name || post.profile?.display_name || '',
      profile_pic_url: post.user?.profile_pic_url || post.profile?.profile_pic_url || post.profile?.profile_url || '',
      is_verified: post.user?.is_verified || post.profile?.is_verified || false
    }

    // NORMALIZE STATS
    post.stats = {
      like_count: post.stats?.like_count || post.engagement?.likes || 0,
      comment_count: post.stats?.comment_count || post.engagement?.comments || 0,
      share_count: post.stats?.share_count || post.engagement?.shares || 0,
      view_count: post.stats?.view_count || post.engagement?.views || '-'
    }

    post.visibility_status = post.visibility_status || 'active'

    // Prepare takedown object
    let takedownStartDate = post.takedown_info?.takedown_start_date || post.metadata?.updated_at || post.created_at || null
    if (takedownStartDate && takedownStartDate.$date) takedownStartDate = takedownStartDate.$date

    const takedown = {
      id: post._id,
      status: post.takedown_info?.status || 'initiated',
      created_at: takedownStartDate,
      post_platform_id: post.post_id || post.code,
      notes: post.takedown_info?.notes || [],
    }

    // Prepare history array
    const rawEvents = post.takedown_info?.events || []
    
    let history = rawEvents.map(e => ({
      id: e.id || crypto.randomUUID(),
      action: e.action || 'update',
      details: e.details || e.event || '',
      created_at: e.date || e.created_at || new Date().toISOString(),
      created_by: e.created_by || null
    }))
    
    history.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    return {
      takedown,
      history,
      post
    }
  } catch (e) {
    console.error('MongoDB fetch error:', e)
    return null
  }
})

/**
 * Update takedown status/details and log history
 */
export const updateTakedown = traceAction('updateTakedown', async (id, updates, message) => {
  // Permission Check
  const isReviewer = await checkReviewerPermission()
  if (!isReviewer) return { success: false, error: 'Unauthorized: Reviewer access required' }

  const projectDetails = await getProjectDetails()
  if (!projectDetails?.projectName) return { success: false, error: 'Unauthorized' }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser()).data.user

  try {
    const client = await clientPromise
    const db = client.db(projectDetails.dbName)
    
    const updateFields = {}
    if (updates.status !== undefined) {
      updateFields['takedown_info.status'] = updates.status
      if (updates.status === 'takedown_successful') {
        updateFields['takedown_info.takedown_end_date'] = new Date().toISOString()
        updateFields['takedown_info.content_active'] = false
      }
    }

    const eventRecord = {
      id: crypto.randomUUID(),
      action: 'update',
      event: 'Status Update',
      details: message,
      created_by: user?.id,
      date: new Date().toISOString(),
      created_at: new Date().toISOString()
    }

    await db.collection('Posts').updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: updateFields,
        $push: { 'takedown_info.events': eventRecord }
      }
    )

    revalidatePath(`/takedowns/case/${id}`)
    return { success: true }
  } catch (error) {
    console.error('Update takedown error:', error)
    return { success: false, error: error.message }
  }
})

/**
 * Add a note to the takedown
 */
export const addTakedownNote = traceAction('addTakedownNote', async (id, noteContent) => {
  // Permission Check
  const isReviewer = await checkReviewerPermission()
  if (!isReviewer) return { success: false, error: 'Unauthorized: Reviewer access required' }

  const projectDetails = await getProjectDetails()
  if (!projectDetails?.projectName) return { success: false, error: 'Unauthorized' }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser()).data.user

  try {
    const client = await clientPromise
    const db = client.db(projectDetails.dbName)

    const formattedNote = `[${new Date().toLocaleString()}] ${noteContent}`
    
    const eventRecord = {
      id: crypto.randomUUID(),
      action: 'note_added',
      event: 'Note Added',
      details: noteContent,
      created_by: user?.id,
      date: new Date().toISOString(),
      created_at: new Date().toISOString()
    }

    await db.collection('Posts').updateOne(
      { _id: new ObjectId(id) },
      { 
        $push: { 
          'takedown_info.notes': formattedNote,
          'takedown_info.events': eventRecord
        } 
      }
    )

    revalidatePath(`/takedowns/case/${id}`)
    return { success: true }
  } catch (error) {
    console.error('Add takedown note error:', error)
    return { success: false, error: error.message }
  }
})