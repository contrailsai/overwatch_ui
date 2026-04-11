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

/**
 * Fetch all active takedowns with filters and enriched MongoDB data
 */
export const getTakedowns = traceAction('getTakedowns', async (filters = {}) => {
  const projectDetails = await getProjectDetails()
  if (!projectDetails?.projectName) return []

  try {
    const client = await clientPromise
    const db = client.db(projectDetails.dbName)

    let query = {
      $or: [
        { client_status: { $regex: /^takedown$/i } },
        { 'takedown_info.status': { $exists: true } }
      ]
    }

    if (filters.status && filters.status !== 'all') {
      query['takedown_info.status'] = filters.status
    }

    if (filters.platform && filters.platform !== 'all') {
      query.platform = filters.platform
    }

    if (filters.threat_type && filters.threat_type !== 'all') {
      query['review_details.threat_types'] = filters.threat_type
    }

    if (filters.risk_score && filters.risk_score !== 'all') {
      if (filters.risk_score === 'high') query['review_details.threat_score'] = { $gte: 80 }
      else if (filters.risk_score === 'medium') query['review_details.threat_score'] = { $gte: 40, $lt: 80 }
      else if (filters.risk_score === 'low') query['review_details.threat_score'] = { $lt: 40 }
    }

    const posts = await db.collection('Posts')
      .find(query)
      .sort({ 'takedown_info.events.date': -1, 'metadata.updated_at': -1 })
      .toArray()

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

      return {
        id: post._id.toString(),
        mongo_post_id: post._id.toString(),
        post_platform_id: post.post_id || post.code || '',
        platform: post.platform,
        status: post.takedown_info?.status || 'initiated',
        risk_score: post.review_details?.threat_score || 0,
        threat_type: post.review_details?.threat_types?.[0] || 'Unknown',
        last_update_date: lastUpdateDate,
        notes: post.takedown_info?.notes ? post.takedown_info.notes.join('\n\n') : '',
        enrichment: {
          caption: caption.length > 100 ? caption.substring(0, 100) + '...' : caption,
          thumbnail,
          username
        }
      }
    }))

    // Sort by last update date descending
    let sortedTakedowns = enrichedTakedowns.sort((a, b) => new Date(b.last_update_date || 0) - new Date(a.last_update_date || 0))

    if (filters.date_from) {
      const from = new Date(filters.date_from).getTime()
      sortedTakedowns = sortedTakedowns.filter(t => new Date(t.last_update_date).getTime() >= from)
    }

    if (filters.date_to) {
      const to = new Date(filters.date_to).getTime()
      sortedTakedowns = sortedTakedowns.filter(t => new Date(t.last_update_date).getTime() <= to)
    }

    return sortedTakedowns

  } catch (mongoError) {
    console.error('Error fetching takedowns from MongoDB:', mongoError)
    return []
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
    
    const post = await db.collection('Posts').findOne({ _id: new ObjectId(takedownId) })
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
    
    const post = await db.collection('Posts').findOne({ 'takedown_info.documents.id': documentId })
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

    let post = await db.collection('Posts').findOne({ _id: new ObjectId(id) })

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

    // Prepare takedown object
    let takedownStartDate = post.takedown_info?.takedown_start_date || post.metadata?.updated_at || post.created_at || null
    if (takedownStartDate && takedownStartDate.$date) takedownStartDate = takedownStartDate.$date

    const takedown = {
      id: post._id,
      status: post.takedown_info?.status || 'initiated',
      created_at: takedownStartDate,
      post_platform_id: post.post_id || post.code,
      notes: post.takedown_info?.notes || [],
      platform_email_status: post.takedown_info?.platform_email_status || 'pending',
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
    if (updates.status !== undefined) updateFields['takedown_info.status'] = updates.status
    if (updates.platform_email_status !== undefined) updateFields['takedown_info.platform_email_status'] = updates.platform_email_status

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