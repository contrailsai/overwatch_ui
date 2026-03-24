'use server'

import { createClient } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { revalidatePath } from 'next/cache'

export async function getConfiguration() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('client_details')
    .select('email, notification_config')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Error fetching configuration:', error)
    return { error: 'Failed to fetch configuration' }
  }

  return { data }
}

export async function updateConfiguration(prevState, formData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Fetch current config to preserve other methods' data
  const { data: currentData } = await supabase
    .from('client_details')
    .select('notification_config')
    .eq('id', user.id)
    .single()

  const currentConfig = currentData?.notification_config || { methods: {} }

  let activeMethod = formData.get('active_method')
  const notificationConfigStr = formData.get('notification_config')

  // Initialize methods structure if it doesn't exist
  const methods = currentConfig.methods || {
    email: { receiving_email: '' },
    slack: { slack_token: '', slack_channel: '' },
    telegram: { telegram_token: '', telegram_chat_id: '' }
  }

  if (notificationConfigStr) {
    try {
      const parsedConfig = JSON.parse(notificationConfigStr)
      activeMethod = parsedConfig.active_method

      if (parsedConfig.methods) {
        if (activeMethod === 'email') {
          const receivingEmail = parsedConfig.methods.email?.receiving_email
          if (!receivingEmail || !receivingEmail.includes('@')) {
            return { error: 'Please enter a valid email address' }
          }
          methods.email = { receiving_email: receivingEmail }
        }
        else if (activeMethod === 'slack') {
          const slackToken = parsedConfig.methods.slack?.slack_token
          const slackChannel = parsedConfig.methods.slack?.slack_channel
          if (!slackToken) return { error: 'Slack Bot Token is required' }
          if (!slackChannel) return { error: 'Slack Channel ID is required' }
          methods.slack = { slack_token: slackToken, slack_channel: slackChannel }
        }
        else if (activeMethod === 'telegram') {
          const telegramToken = parsedConfig.methods.telegram?.telegram_token
          const telegramChatId = parsedConfig.methods.telegram?.telegram_chat_id
          if (!telegramToken) return { error: 'Telegram Bot Token is required' }
          if (!telegramChatId) return { error: 'Telegram Chat ID is required' }
          methods.telegram = { telegram_token: telegramToken, telegram_chat_id: telegramChatId }
        }
      }
    } catch (e) {
      console.error('Error parsing notification_config:', e)
      return { error: 'Invalid configuration data' }
    }
  } else {
    // Update the specific method's config based on form data
    if (activeMethod === 'email') {
      const receivingEmail = formData.get('receiving_email')
      if (!receivingEmail || !receivingEmail.includes('@')) {
        return { error: 'Please enter a valid email address' }
      }
      methods.email = { receiving_email: receivingEmail }
    }
    else if (activeMethod === 'slack') {
      const slackToken = formData.get('slack_token')
      const slackChannel = formData.get('slack_channel')

      if (!slackToken) return { error: 'Slack Bot Token is required' }
      if (!slackChannel) return { error: 'Slack Channel ID is required' }

      methods.slack = { slack_token: slackToken, slack_channel: slackChannel }
    }
    else if (activeMethod === 'telegram') {
      const telegramToken = formData.get('telegram_token')
      const telegramChatId = formData.get('telegram_chat_id')

      if (!telegramToken) return { error: 'Telegram Bot Token is required' }
      if (!telegramChatId) return { error: 'Telegram Chat ID is required' }

      methods.telegram = { telegram_token: telegramToken, telegram_chat_id: telegramChatId }
    }
  }

  if (!['email', 'slack', 'telegram'].includes(activeMethod)) {
    return { error: 'Invalid notification method selected' }
  }

  // Construct the new notification config
  const notificationConfig = {
    active_method: activeMethod,
    methods: methods
  }

  const { error } = await supabase
    .from('client_details')
    .update({ notification_config: notificationConfig })
    .eq('id', user.id)

  if (error) {
    console.error('Error updating configuration:', error)
    return { error: 'Failed to update configuration' }
  }

  revalidatePath('/configurations')
  return { success: true, message: 'Configuration saved successfully' }
}

export async function updateLabels(prevState, formData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // 1. Get project name from client_details
  const { data: clientDetails, error: clientError } = await supabase
    .from('client_details')
    .select('project_name')
    .eq('id', user.id)
    .single()

  if (clientError || !clientDetails?.project_name) {
    return { error: 'Project not found' }
  }

  // 2. Fetch current project details to update
  const { data: projectData, error: projectError } = await supabase
    .from('project')
    .select('*')
    .eq('project_name', clientDetails.project_name)
    .single()

  if (projectError) {
    return { error: 'Failed to fetch project details' }
  }

  let projectDetails = {}
  // check if we get project details as string or object
  try {
    projectDetails = typeof projectData?.project_details === 'string'
      ? JSON.parse(projectData.project_details)
      : (projectData?.project_details || {})
  } catch (e) {
    console.error('Error parsing project_details:', e)
    projectDetails = {}
  }

  // 3. Extract inputs from formData
  const projectDescription = formData.get('project_description')
  const labelsString = formData.get('labels') // Grab the JSON string we sent from the frontend
  const legalCodesString = formData.get('legal_codes')

  let labels = []
  let legalCodes = []
  let renamedLabels = []
  let renamedLegalCodes = []

  try {
    if (labelsString) {
      // Parse the JSON string back into an array of objects
      const parsedLabels = JSON.parse(labelsString)

      // Filter out any labels where the name is completely empty and ensure they have a severity
      labels = parsedLabels
        .filter(label => label.name?.trim() !== '')
        .map(label => {
          if (label.originalName && label.name !== label.originalName) {
            renamedLabels.push({ oldName: label.originalName, newName: label.name })
          }
          return {
            name: label.name,
            description: label.description,
            severity: label.severity || 'low'
          }
        })
    }

    if (legalCodesString) {
      const parsedCodes = JSON.parse(legalCodesString)
      legalCodes = parsedCodes
        .filter(code => (code.actName?.trim() !== '' || code.codeName?.trim() !== ''))
        .map(code => {
          const generatedName = `${code.actName || ''} - ${code.codeName || ''}`.trim().replace(/^-|-$/g, '').trim()
          if (code.originalName && generatedName !== code.originalName) {
            renamedLegalCodes.push({ oldName: code.originalName, newName: generatedName })
          }
          return {
            actName: code.actName,
            codeName: code.codeName,
            description: code.description,
            name: generatedName,
            severity: code.severity || 'low'
          }
        })
    }
  } catch (e) {
    console.error("Error parsing JSON:", e)
    return { error: 'Invalid data provided' }
  }

  // console.log("Parsed labels = ", labels)
  // console.log("Parsed legal codes = ", legalCodes)

  // 4. Update project_details structure
  projectDetails.description = projectDescription
  projectDetails.labels = labels
  projectDetails.legal_codes = legalCodes

  const { error } = await supabase
    .from('project')
    .update({ project_details: projectDetails })
    .eq('project_name', clientDetails.project_name)

  if (error) {
    console.error('Error updating project labels:', error)
    return { error: 'Failed to update labels' }
  }

  // 5. Cascade updates to MongoDB
  if (renamedLabels.length > 0 || renamedLegalCodes.length > 0) {
    try {
      const client = await clientPromise
      // Use mongo_db_map if available, otherwise fallback to project_name
      const dbName = projectData.mongo_db_map
      const db = client.db(dbName)
      const postsCollection = db.collection('Posts')

      for (const { oldName, newName } of renamedLabels) {
        // Update threat_types array
        await postsCollection.updateMany(
          { "review_details.threat_types": oldName },
          { $set: { "review_details.threat_types.$": newName } }
        )

        // Update flags object key
        const renameOp = {}
        renameOp[`review_details.flags.${oldName}`] = `review_details.flags.${newName}`
        await postsCollection.updateMany(
          { [`review_details.flags.${oldName}`]: { $exists: true } },
          { $rename: renameOp }
        )
      }

      for (const { oldName, newName } of renamedLegalCodes) {
        // Update legal_codes array
        await postsCollection.updateMany(
          { "review_details.legal_codes": oldName },
          { $set: { "review_details.legal_codes.$": newName } }
        )
      }
    } catch (err) {
      console.error('Error cascading label updates to MongoDB:', err)
    }
  }

  // Make sure to import revalidatePath at the top of your file!
  // import { revalidatePath } from 'next/cache'
  revalidatePath('/configurations')

  return { success: true, message: 'Labels updated successfully' }
}

export async function get_keywords(project_db, text = "") {
  const client = await clientPromise
  const db = client.db(project_db)
  const collection = db.collection('Keywords')

  const sort = { importance: -1, last_used: -1, keyword: 1 }

  let docs
  if (text !== "") {
    docs = await collection.find({ keyword: { $regex: text, $options: 'i' } }).sort(sort).limit(50).toArray()
  } else {
    docs = await collection.find({}).sort(sort).limit(50).toArray()
  }

  // Serialize MongoDB-specific types so they can be safely passed to Client Components
  return docs.map((doc) => ({
    _id: doc._id.toString(),
    keyword: doc.keyword ?? '',
    usage_count: doc.usage_count ?? 0,
    last_used: doc.last_used ? new Date(doc.last_used).toISOString() : null,
    importance: doc.importance ?? 0,
  }))
}

export async function add_keyword(project_db, keyword) {
  if (!keyword || !keyword.trim()) {
    return { error: 'Keyword cannot be empty' }
  }

  const trimmed = keyword.trim().toLowerCase()
  const client = await clientPromise
  const db = client.db(project_db)
  const collection = db.collection('Keywords')

  const existing = await collection.findOne({ keyword: trimmed })
  if (existing) {
    return { error: 'Keyword already exists' }
  }

  await collection.insertOne({
    keyword: trimmed,
    usage_count: 0,
    last_used: null,
  })

  return { success: true }
}

export async function delete_keyword(project_db, keywordId) {
  const { ObjectId } = await import('mongodb')
  const client = await clientPromise
  const db = client.db(project_db)
  const collection = db.collection('Keywords')

  await collection.deleteOne({ _id: new ObjectId(keywordId) })

  return { success: true }
}

export async function get_watchlist(project_name, search = "") {
  if (!project_name) return { error: 'Project name is required' }

  const supabase = await createClient()
  // const { data: { user } } = await supabase.auth.getUser()
  // if (!user) return { error: 'Not authenticated' }

  let query = supabase
    .from('watchlist')
    .select('*')
    .eq('project_name', project_name)
    .order('created_at', { ascending: false })

  if (search) {
    query = query.ilike('link', `%${search}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching watchlist:', error)
    return { error: 'Failed to fetch watchlist' }
  }
  return data
}

export async function add_to_watchlist(project_name, link) {
  if (!project_name) return { error: 'Project name is required' }
  if (!link || !link.trim()) {
    return { error: 'Link cannot be empty' }
  }

  const trimmedLink = link.trim()
  try {
    new URL(trimmedLink) // Basic URL validation
  } catch (_) {
    return { error: 'Please provide a valid URL starting with http:// or https://' }
  }

  const supabase = await createClient()
  // const { data: { user } } = await supabase.auth.getUser()
  // if (!user) return { error: 'Not authenticated' }

  // Check if already exists for this project
  const { data: existing } = await supabase
    .from('watchlist')
    .select('id')
    .eq('project_name', project_name)
    .eq('link', trimmedLink)
    .single()

  if (existing) {
    return { error: 'This profile is already in the watchlist' }
  }

  const { error } = await supabase
    .from('watchlist')
    .insert([{
      project_name,
      link: trimmedLink,
      type: 'profile'
    }])

  if (error) {
    console.error('Error adding to watchlist:', error)
    return { error: 'Failed to add to watchlist' }
  }

  return { success: true }
}

export async function delete_from_watchlist(id) {
  if (!id) return { error: 'Invalid item ID' }

  const supabase = await createClient()
  // const { data: { user } } = await supabase.auth.getUser()
  // if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting from watchlist:', error)
    return { error: 'Failed to delete item' }
  }

  return { success: true }
}
