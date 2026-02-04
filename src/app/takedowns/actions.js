'use server'

import { createClient } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { getSignedImageUrl, uploadFileToS3, getSignedDownloadUrl } from '@/utils/aws/s3'
import { revalidatePath } from 'next/cache'

/**
 * Fetch all active takedowns with filters
 */
export async function getTakedowns(filters = {}) {
  const supabase = await createClient()
  
  let query = supabase
    .from('takedown_cases')
    .select('*')
    .order('last_update_date', { ascending: false })

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  
  if (filters.platform && filters.platform !== 'all') {
    query = query.eq('platform', filters.platform)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching takedowns:', error)
    return []
  }

  return data
}

/**
 * Upload a document for a takedown case
 */
export async function uploadTakedownDocument(takedownId, formData) {
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
}

/**
 * Get documents for a takedown case
 */
export async function getTakedownDocuments(takedownId) {
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
}

/**
 * Generate download URL for a document
 */
export async function getDocumentDownloadUrl(documentId) {
    const supabase = await createClient()
    
    const { data: doc, error } = await supabase
        .from('takedown_documents')
        .select('*')
        .eq('id', documentId)
        .single()
        
    if (error || !doc) return null
    
    return await getSignedDownloadUrl(doc.s3_key, doc.file_name)
}

/**
 * Fetch specific takedown details including Mongo post data and history
 */
export async function getTakedownDetails(id) {
  const supabase = await createClient()

  // 1. Fetch Takedown Case
  const { data: takedown, error: takedownError } = await supabase
    .from('takedown_cases')
    .select('*')
    .eq('id', id)
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
    const db = client.db(process.env.MONGO_DB_NAME)
    
    // Try by mongo_id first if it's a valid ObjectId
    if (ObjectId.isValid(takedown.mongo_post_id)) {
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
        post._id = post._id.toString()
        
        // Handle signed URL here if needed by the UI
        const { getSignedImageUrl } = require('@/utils/aws/s3')
        let s3UrlToSign = null
        if (post.post_content?.media_urls && post.post_content.media_urls.length > 0) {
            const firstMedia = post.post_content.media_urls[0]
            s3UrlToSign = firstMedia.thumbnail_url || firstMedia.s3_url
        }
        post.signedImageUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null
    }
    
  } catch (e) {
    console.error('MongoDB fetch error:', e)
  }

  return { 
    takedown: JSON.parse(JSON.stringify(takedown)), 
    history: JSON.parse(JSON.stringify(history || [])), 
    post 
  }
}

/**
 * Update takedown status/details and log history
 */
export async function updateTakedown(id, updates, message) {
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

  return { success: true }
}

/**
 * Add a note to the takedown
 */
export async function addTakedownNote(id, noteContent) {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser()).data.user
    
    // Fetch current notes to append (or just use history for timeline view)
    // We'll update the main notes field AND add to history
    
    const { data: current } = await supabase
        .from('takedown_cases')
        .select('notes')
        .eq('id', id)
        .single()
        
    const newNotes = current?.notes ? `${current.notes}\n\n[${new Date().toLocaleDateString()}] ${noteContent}` : `[${new Date().toLocaleDateString()}] ${noteContent}`
    
    const { error } = await supabase
        .from('takedown_cases')
        .update({
            notes: newNotes,
            last_update_message: 'New note added',
            last_update_date: new Date().toISOString()
        })
        .eq('id', id)
        
    if (error) return { success: false, error: error.message }
    
    // Log to history
    await supabase.from('takedown_history').insert({
        takedown_id: id,
        action: 'note_added',
        details: noteContent,
        created_by: user?.id
    })
    
    return { success: true }
}
