'use server'

import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { getSignedImageUrl, uploadFileToS3, getSignedDownloadUrl } from '@/utils/aws/s3'
import { revalidatePath } from 'next/cache'
import { traceAction } from '@/utils/tracing'

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

  const supabase = await createClient()

  let query = supabase
    .from('takedown_cases')
    .select('*')
    .eq('project_name', projectDetails.projectName)
    .order('last_update_date', { ascending: false })

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  if (filters.platform && filters.platform !== 'all') {
    query = query.eq('platform', filters.platform)
  }

  const { data: takedowns, error } = await query

  if (error) {
    console.error('Error fetching takedowns:', error)
    return []
  }

  if (!takedowns || takedowns.length === 0) return []

  // Enrich with MongoDB Data
  try {
    const client = await clientPromise
    const db = client.db(projectDetails.dbName)

    // Collect IDs
    const mongoIds = takedowns
      .map(t => t.mongo_post_id)
      .filter(id => id && ObjectId.isValid(id))
      .map(id => new ObjectId(id))

    const posts = await db.collection('Posts')
      .find({ _id: { $in: mongoIds } })
      .project({
        _id: 1,
        'post_content.caption': 1,
        'post_content.media_urls': 1,
        'user.username': 1,
        'user.profile_pic_url': 1,
        'profile.username': 1, // Fallback
        'profile.profile_pic_url': 1, // Fallback
        'profile.profile_url': 1 // Fallback
      })
      .toArray()

    // Map posts to a dictionary for O(1) lookup
    const postsMap = posts.reduce((acc, post) => {
      acc[post._id.toString()] = post
      return acc
    }, {})

    // Merge data
    const enrichedTakedowns = await Promise.all(takedowns.map(async (takedown) => {
      const post = postsMap[takedown.mongo_post_id]

      let thumbnail = null
      let caption = ''
      let username = 'Unknown'

      if (post) {
        // Handle Media/Thumbnail
        if (post.post_content?.media_urls?.length > 0) {
          const media = post.post_content.media_urls[0]
          const s3Url = media.thumbnail_url || media.s3_url
          if (s3Url) {
            thumbnail = await getSignedImageUrl(s3Url)
          }
        }

        caption = post.post_content?.caption || ''
        username = post.user?.username || post.profile?.username || 'Unknown'
      }

      return {
        ...takedown,
        enrichment: {
          caption: caption.length > 100 ? caption.substring(0, 100) + '...' : caption,
          thumbnail,
          username
        }
      }
    }))

    return enrichedTakedowns

  } catch (mongoError) {
    console.error('Error enriching takedowns with MongoDB data:', mongoError)
    // Return Supabase data only if Mongo fails
    return takedowns.map(t => ({ ...t, enrichment: null }))
  }
})

/**
 * Upload a document for a takedown case
 */
export const uploadTakedownDocument = traceAction('uploadTakedownDocument', async (takedownId, formData) => {
  // Permission Check
  const isReviewer = await checkReviewerPermission()
  if (!isReviewer) return { success: false, error: 'Unauthorized: Reviewer access required' }

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

    // 2. Insert into Supabase
    const { error: dbError } = await supabase
      .from('takedown_documents')
      .insert({
        takedown_id: takedownId,
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize,
        s3_key: s3Key,
        uploaded_by: user.id
      })

    if (dbError) throw dbError

    // 3. Log History
    await supabase.from('takedown_history').insert({
      takedown_id: takedownId,
      action: 'document_uploaded',
      details: `Uploaded document: ${fileName}`,
      created_by: user.id
    })

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
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('takedown_documents')
    .select('*')
    .eq('takedown_id', takedownId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching documents:', error)
    return []
  }
  return data
})

/**
 * Generate download URL for a document
 */
export const getDocumentDownloadUrl = traceAction('getDocumentDownloadUrl', async (documentId) => {
  const supabase = await createClient()

  const { data: doc, error } = await supabase
    .from('takedown_documents')
    .select('*')
    .eq('id', documentId)
    .single()

  if (error || !doc) return null

  return await getSignedDownloadUrl(doc.s3_key, doc.file_name)
})

/**
 * Fetch specific takedown details including Mongo post data and history
 */
export const getTakedownDetails = traceAction('getTakedownDetails', async (id) => {
  const projectDetails = await getProjectDetails()
  if (!projectDetails?.projectName) return null

  const supabase = await createClient()

  // 1. Fetch Takedown Case
  const { data: takedown, error: takedownError } = await supabase
    .from('takedown_cases')
    .select('*')
    .eq('id', id)
    .eq('project_name', projectDetails.projectName)
    .single()

  if (takedownError || !takedown) return null

  // 2. Fetch History
  const { data: history } = await supabase
    .from('takedown_history')
    .select('*')
    .eq('takedown_id', id)
    .order('created_at', { ascending: false })

  // 3. Fetch MongoDB Post Data
  let post = null
  try {
    const client = await clientPromise
    const db = client.db(projectDetails.dbName)

    // Try by mongo_id first if it's a valid ObjectId
    if (takedown.mongo_post_id && ObjectId.isValid(takedown.mongo_post_id)) {
      post = await db.collection('Posts').findOne({ _id: new ObjectId(takedown.mongo_post_id) })
    }

    // Fallback if not found or ID not valid
    if (!post) {
      post = await db.collection('Posts').findOne({ post_id: takedown.post_platform_id })
    }

    if (post) {
      // Serialize MongoDB objects for Next.js Client Components
      post = JSON.parse(JSON.stringify(post))

      // Ensure _id is a string (JSON.stringify handles this but let's be explicit if needed)
      if (post._id) post._id = post._id.toString()

      // Handle signed URL here if needed by the UI
      let s3UrlToSign = null
      if (post.post_content?.media_urls && post.post_content.media_urls.length > 0) {
        const firstMedia = post.post_content.media_urls[0]
        s3UrlToSign = firstMedia.thumbnail_url || firstMedia.s3_url
      }
      post.signedImageUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null

      // NORMALIZE USER DATA HERE for consistency across UI
      // Checking post.user, post.profile, etc.
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
    }

  } catch (e) {
    console.error('MongoDB fetch error:', e)
  }

  return {
    takedown: JSON.parse(JSON.stringify(takedown)),
    history: JSON.parse(JSON.stringify(history || [])),
    post
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

  // 1. Update Case
  const { error } = await supabase
    .from('takedown_cases')
    .update({
      ...updates,
      last_update_message: message,
      last_update_date: new Date().toISOString()
    })
    .eq('id', id)
    .eq('project_name', projectDetails.projectName)

  if (error) return { success: false, error: error.message }

  // 2. Add History Log
  await supabase
    .from('takedown_history')
    .insert({
      takedown_id: id,
      action: 'update',
      details: message,
      created_by: user?.id
    })

  revalidatePath(`/takedowns/case/${id}`)
  return { success: true }
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

  // Fetch current notes to append (or just use history for timeline view)
  // We'll update the main notes field AND add to history

  const { data: current } = await supabase
    .from('takedown_cases')
    .select('notes')
    .eq('id', id)
    .eq('project_name', projectDetails.projectName)
    .single()

  if (!current) return { success: false, error: 'Case not found or unauthorized' }

  const newNotes = current?.notes ? `${current.notes}\n\n[${new Date().toLocaleDateString()}] ${noteContent}` : `[${new Date().toLocaleDateString()}] ${noteContent}`

  const { error } = await supabase
    .from('takedown_cases')
    .update({
      notes: newNotes,
      last_update_message: 'New note added',
      last_update_date: new Date().toISOString()
    })
    .eq('id', id)
    .eq('project_name', projectDetails.projectName)

  if (error) return { success: false, error: error.message }

  // Log to history
  await supabase.from('takedown_history').insert({
    takedown_id: id,
    action: 'note_added',
    details: noteContent,
    created_by: user?.id
  })

  revalidatePath(`/takedowns/case/${id}`)
  return { success: true }
})
