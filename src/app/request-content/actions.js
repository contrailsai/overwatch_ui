'use server'

import { createClient } from '@/utils/supabase/server'

export async function requestLink(prevState, formData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const link = formData.get('link')
  if (!link) {
    return { error: 'Please enter a link' }
  }

  // Basic URL validation
  try {
    new URL(link)
  } catch (e) {
    return { error: 'Please enter a valid URL' }
  }

  // 1. Insert into client_requested_links
  const { error: dbError } = await supabase
    .from('client_requested_links')
    .insert({
      requested_by: user.id,
      link: link,
      ingested: false
    })

  if (dbError) {
    console.error('Error inserting request:', dbError)
    return { error: 'Failed to submit request' }
  }

  // 2. Notify Slack (Dummy Webhook)
  try {
    // Dummy webhook URL as requested
    const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL_NEW_LINK_REQUEST

    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `New content ingestion request from user ${user.id}:\nLink: ${link}`
      })
    })
  } catch (slackError) {
    // We don't want to fail the whole request if Slack fails, so just log it
    console.error('Slack notification failed:', slackError)
  }

  return {
    success: true,
    message: 'Data will be ingested in a few hours. Thank you for your request!'
  }
}
