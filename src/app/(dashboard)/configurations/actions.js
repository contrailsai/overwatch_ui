'use server'

import { createClient } from '@/utils/supabase/server'
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

  const activeMethod = formData.get('active_method')

  if (!['email', 'slack', 'telegram'].includes(activeMethod)) {
    return { error: 'Invalid notification method selected' }
  }

  // Initialize methods structure if it doesn't exist
  const methods = currentConfig.methods || {
    email: { receiving_email: '' },
    slack: { slack_token: '', slack_channel: '' },
    telegram: { telegram_token: '', telegram_chat_id: '' }
  }

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

  try {
    if (labelsString) {
      // Parse the JSON string back into an array of objects
      const parsedLabels = JSON.parse(labelsString)

      // Filter out any labels where the name is completely empty and ensure they have a severity
      labels = parsedLabels
        .filter(label => label.name?.trim() !== '')
        .map(label => ({
          ...label,
          severity: label.severity || 'low'
        }))
    }

    if (legalCodesString) {
      const parsedCodes = JSON.parse(legalCodesString)
      legalCodes = parsedCodes
        .filter(code => (code.actName?.trim() !== '' || code.codeName?.trim() !== ''))
        .map(code => ({
          ...code,
          name: `${code.actName || ''} - ${code.codeName || ''}`.trim().replace(/^-|-$/g, '').trim(),
          severity: code.severity || 'low'
        }))
    }
  } catch (e) {
    console.error("Error parsing JSON:", e)
    return { error: 'Invalid data provided' }
  }

  console.log("Parsed labels = ", labels)
  console.log("Parsed legal codes = ", legalCodes)

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

  // Make sure to import revalidatePath at the top of your file!
  // import { revalidatePath } from 'next/cache'
  revalidatePath('/configurations')

  return { success: true, message: 'Labels updated successfully' }
}
