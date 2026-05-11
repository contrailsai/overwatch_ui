'use server'

import { createClient } from '@/utils/supabase/server'
import { sendSqsMessage } from '@/utils/aws/sqs'
import { traceAction, runInSpan } from '@/utils/tracing'
import { getAuthContext } from '@/utils/auth-context'

export const bulkRequestLinks = traceAction('bulkRequestLinks_upload', async (links) => {
  const ctx = await getAuthContext()
  if (!ctx?.user?.id || !ctx.clientDetails?.project_name) {
    return { error: 'Not authenticated' }
  }

  const { user, clientDetails } = ctx
  const projectName = clientDetails.project_name

  if (!links || links.length === 0) {
    return { error: 'No links provided' }
  }

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
    project: projectName
  }))

  const supabase = await createClient()
  const { data: insertedData, error: dbError } = await runInSpan(
    'upload_content.bulkRequestLinks.supabase_insert',
    async () => supabase.from('client_requested_links').insert(rows).select(),
    { 'app.span_type': 'supabase_query' }
  )

  if (dbError) {
    console.error('Error bulk inserting requests:', dbError)
    return { error: 'Failed to submit bulk request' }
  }

  const sqsResults = await runInSpan(
    'upload_content.bulkRequestLinks.sqs_send',
    async () =>
      Promise.allSettled(
        insertedData.map((row) =>
          sendSqsMessage({
            id: row.id,
            link: row.link,
            project: row.project,
            requested_by: row.requested_by
          })
        )
      ),
    { 'app.span_type': 'sqs_send' }
  )

  const sqsFailures = sqsResults.filter((r) => r.status === 'rejected')
  if (sqsFailures.length > 0) {
    console.error(`${sqsFailures.length} SQS messages failed to send`)
  }

  const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL_NEW_LINK_REQUEST
  if (SLACK_WEBHOOK_URL) {
    try {
      const userIdentifier = user.email || user.id
      await runInSpan(
        'upload_content.bulkRequestLinks.slack_notify',
        async () =>
          fetch(SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `Bulk content ingestion request from user ${userIdentifier}: ${validLinks.length} link(s) queued.
        ${invalidLinks.length > 0 ? `${invalidLinks.length} invalid link(s) were skipped.` : ''}
        ${sqsFailures.length > 0 ? `${sqsFailures.length} link(s) failed to queue for ingestion.` : ''}
        `
            })
          }),
        { 'app.span_type': 'http_outbound' }
      )
    } catch (slackError) {
      console.error('Slack notification failed:', slackError)
    }
  }

  return {
    success: true,
    count: validLinks.length,
    invalidCount: invalidLinks.length,
    message: `${validLinks.length} link(s) queued for ingestion successfully!`
  }
})

export const getRequestedLinks = traceAction('getRequestedLinks_upload', async () => {
  const ctx = await getAuthContext()
  if (!ctx?.user?.id || !ctx.clientDetails?.project_name) {
    return { error: 'Not authenticated' }
  }

  const supabase = await createClient()
  const { data, error } = await runInSpan(
    'upload_content.getRequestedLinks.supabase_query',
    async () =>
      supabase
        .from('client_requested_links')
        .select('*')
        .eq('requested_by', ctx.user.id)
        .eq('project', ctx.clientDetails.project_name)
        .order('created_at', { ascending: false }),
    { 'app.span_type': 'supabase_query' }
  )

  if (error) {
    console.error('Error fetching requested links:', error)
    return { error: 'Failed to fetch requested links' }
  }

  return { data }
})
