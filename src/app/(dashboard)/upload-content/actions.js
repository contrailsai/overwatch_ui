'use server'

import { createClient } from '@/utils/supabase/server'
import { sendSqsMessage } from '@/utils/aws/sqs'
import { traceAction } from '@/utils/tracing'

export const bulkRequestLinks = traceAction('bulkRequestLinks', async (links, project_name) => {

  console.log("LINKS LIST= ", links)
  console.log("PROJECT_NAME= ", project_name)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  if (!links || links.length === 0) {
    return { error: 'No links provided' }
  }

  // Validate each URL
  const validLinks = []
  const invalidLinks = []
  for (const raw of links) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    try {
      new URL(trimmed)
      validLinks.push(trimmed)
    } catch {
      invalidLinks.push(trimmed)
    }
  }

  if (validLinks.length === 0) {
    return { error: 'None of the provided links are valid URLs' }
  }

  const rows = validLinks.map((link) => ({
    requested_by: user.id,
    link,
    ingested: false,
    project: project_name
  }))

  const { data: insertedData, error: dbError } = await supabase
    .from('client_requested_links')
    .insert(rows)
    .select()

  if (dbError) {
    console.error('Error bulk inserting requests:', dbError)
    return { error: 'Failed to submit bulk request' }
  }

  // Send each link to SQS
  const sqsResults = await Promise.allSettled(
    insertedData.map((row) =>
      sendSqsMessage({
        id: row.id,
        link: row.link,
        project: row.project,
        requested_by: row.requested_by
      })
    )
  )

  const sqsFailures = sqsResults.filter((r) => r.status === 'rejected')
  if (sqsFailures.length > 0) {
    console.error(`${sqsFailures.length} SQS messages failed to send`)
  }

  // Notify Slack
  try {
    const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL_NEW_LINK_REQUEST
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `Bulk content ingestion request from user ${user.id}: ${validLinks.length} link(s) queued.
        ${invalidLinks.length > 0 ? `${invalidLinks.length} invalid link(s) were skipped.` : ''}
        ${sqsFailures.length > 0 ? `${sqsFailures.length} link(s) failed to queue for ingestion.` : ''}
        `
      })
    })
  } catch (slackError) {
    console.error('Slack notification failed:', slackError)
  }

  return {
    success: true,
    count: validLinks.length,
    invalidCount: invalidLinks.length,
    message: `${validLinks.length} link(s) queued for ingestion successfully!`
  }
})

export const getRequestedLinks = traceAction('getRequestedLinks', async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('client_requested_links')
    .select('*')
    .eq('requested_by', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching requested links:', error)
    return { error: 'Failed to fetch requested links' }
  }

  return { data }
})