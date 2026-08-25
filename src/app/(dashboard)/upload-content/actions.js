'use server'

import { sendSqsMessage } from '@/utils/aws/sqs'
import { traceAction, runInSpan } from '@/utils/tracing'
import { getAuthContext } from '@/utils/auth-context'
import {
  insertClientRequestedLinks,
  getClientRequestedLinksForUser,
} from '@/utils/clientRequestedLinks/server'
import { isMetaAdUrl } from '@/utils/clientRequestedLinks/urls'
import { isSectionEnabled } from '@/lib/project-sections'
import { logActionWarn, LOKI_STREAMS } from '@/utils/otel-logger'

export const bulkRequestLinks = traceAction('bulkRequestLinks_upload', async (links, options = {}) => {
  const ctx = await getAuthContext()
  if (!ctx?.user?.id || !ctx.clientDetails?.project_name) {
    return { error: 'Not authenticated' }
  }

  const { user, clientDetails, project } = ctx
  const projectName = clientDetails.project_name
  const isAd = options?.isAd === true

  if (isAd && !isSectionEnabled(project, 'ads')) {
    return { error: 'Ads ingest is not enabled for this project' }
  }

  if (!links || links.length === 0) {
    return { error: 'No links provided' }
  }

  const skippedNonMeta = isAd ? links.filter((link) => !isMetaAdUrl(link)) : []
  const linksToQueue = isAd ? links.filter((link) => isMetaAdUrl(link)) : links

  if (isAd && linksToQueue.length === 0) {
    return {
      error:
        'Ads ingest is Meta-only. Provide Facebook Ads Library or Facebook share URLs (facebook.com).',
    }
  }

  const insertResult = await runInSpan(
    'upload_content.bulkRequestLinks.supabase_insert',
    async () =>
      insertClientRequestedLinks({
        userId: user.id,
        projectName,
        rawLinks: linksToQueue,
      }),
    { 'app.span_type': 'supabase_query' }
  )

  if (insertResult.error) {
    return { error: insertResult.error }
  }

  const { data: insertedData, validLinks, invalidLinks } = insertResult

  const sqsResults = await runInSpan(
    'upload_content.bulkRequestLinks.sqs_send',
    async () =>
      Promise.allSettled(
        insertedData.map((row) => {
          const body = {
            id: row.id,
            link: row.link,
            project: row.project,
            requested_by: row.requested_by,
          }
          if (isAd) body.is_ad = true
          return sendSqsMessage(body)
        })
      ),
    { 'app.span_type': 'sqs_send' }
  )

  const sqsFailures = sqsResults.filter((r) => r.status === 'rejected')
  if (sqsFailures.length > 0) {
    logActionWarn({
      loki_stream: LOKI_STREAMS.upload,
      app_action: 'bulkRequestLinks',
      message: 'SQS messages failed to send',
      sqs_failure_count: sqsFailures.length,
    })
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
              text: `Bulk ${isAd ? 'ads' : 'content'} ingestion request from user ${userIdentifier}: ${validLinks.length} link(s) queued.
        ${invalidLinks.length > 0 ? `${invalidLinks.length} invalid link(s) were skipped.` : ''}
        ${skippedNonMeta.length > 0 ? `${skippedNonMeta.length} non-Facebook URL(s) were skipped (ads ingest is Meta-only).` : ''}
        ${sqsFailures.length > 0 ? `${sqsFailures.length} link(s) failed to queue for ingestion.` : ''}
        `,
            }),
          }),
        { 'app.span_type': 'http_outbound' }
      )
    } catch (slackError) {
      logActionWarn({ loki_stream: LOKI_STREAMS.upload, app_action: 'bulkRequestLinks', message: 'Slack notification failed' })
      console.error('Slack notification failed:', slackError)
    }
  }

  const kindLabel = isAd ? 'ad link(s)' : 'link(s)'
  const skipParts = []
  if (invalidLinks.length > 0) skipParts.push(`${invalidLinks.length} invalid`)
  if (skippedNonMeta.length > 0) skipParts.push(`${skippedNonMeta.length} non-Facebook`)

  return {
    success: true,
    count: validLinks.length,
    invalidCount: invalidLinks.length,
    skippedNonMetaCount: skippedNonMeta.length,
    message: `${validLinks.length} ${kindLabel} queued for ingestion successfully!${
      skipParts.length ? ` ${skipParts.join(' and ')} skipped.` : ''
    }`,
  }
})

export const getRequestedLinks = traceAction('getRequestedLinks_upload', async () => {
  const ctx = await getAuthContext()
  if (!ctx?.user?.id || !ctx.clientDetails?.project_name) {
    return { error: 'Not authenticated' }
  }

  const { data, error } = await runInSpan(
    'upload_content.getRequestedLinks.supabase_query',
    async () =>
      getClientRequestedLinksForUser({
        userId: ctx.user.id,
        projectName: ctx.clientDetails.project_name,
      }),
    { 'app.span_type': 'supabase_query' }
  )

  if (error) {
    return { error }
  }

  return { data }
})
