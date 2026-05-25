'use server'

import { getSignedDownloadUrl } from '@/utils/aws/s3'
import { traceAction } from '@/utils/tracing'
import { createClient } from '@/utils/supabase/server'
import { generateReportHash } from '@/features/reports/hash'
import { sendReportSqsMessage } from '@/utils/aws/sqs'
import { requireAuthContext } from '@/utils/auth-context'
import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { resolveExistingReportJob } from '@/features/reports/lib/resolve-job'
import { REPORT_FORMATS } from '@/features/reports/constants'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'

const OBJECT_ID_HEX = /^[a-fA-F0-9]{24}$/

export const getReportDownloadUrl = traceAction('getReportDownloadUrl', async (s3Url, originalName) => {
  if (!s3Url) return null

  try {
    const { user } = await requireAuthContext()
    const supabase = await createClient()
    const { data: ownedReport } = await supabase
      .from('reports_generation')
      .select('id')
      .eq('client_id', user.id)
      .eq('s3_path', s3Url)
      .maybeSingle()

    if (!ownedReport) return null

    const url = new URL(s3Url)
    const key = url.pathname.substring(1)
    return await getSignedDownloadUrl(key, originalName)
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.reports,
      app_action: 'getReportDownloadUrl',
      message: 'Failed to generate signed download URL',
    }, error)
    console.error('Error generating signed download URL for report:', error)
    return null
  }
})

/**
 * Create or reuse a report generation job and dispatch Lambda via SQS.
 * @param {{ posts: Array<{_id: string}>, project?: object, profile?: object, reportType: string, reportFormat?: 'pdf'|'docx' }} input
 */
export const getOrCreateReportJob = traceAction('getOrCreateReportJob', async ({
  posts,
  project,
  profile,
  reportType,
  reportFormat = REPORT_FORMATS.PDF,
}) => {
  if (reportFormat === REPORT_FORMATS.DOCX && reportType === 'Summary') {
    throw new Error('DOCX reports do not support Summary report type')
  }

  const supabase = await createClient()
  const { user, project: resolvedProject, dbName } = await requireAuthContext()

  const postIds = posts.map((p) => p._id)
  const profileId = String(profile?._id ?? profile?.id ?? '')
  const hash = generateReportHash(
    resolvedProject?.project_name || 'unknown',
    postIds,
    reportType,
    profileId,
    reportFormat
  )

  for (const id of postIds) {
    if (id != null && String(id) !== '' && !OBJECT_ID_HEX.test(String(id))) {
      throw new Error('Invalid post ID format (expected 24-character hex)')
    }
  }

  const client = await clientPromise
  const db = client.db(dbName)
  const objectIds = postIds
    .filter(Boolean)
    .map((id) => {
      try {
        return new ObjectId(id)
      } catch {
        return null
      }
    })
    .filter(Boolean)

  if (objectIds.length === 0) {
    throw new Error('No valid post IDs for report generation')
  }

  const validatedPosts = await db
    .collection('Posts')
    .find({ _id: { $in: objectIds } }, { projection: { _id: 1 } })
    .toArray()

  if (validatedPosts.length !== objectIds.length) {
    throw new Error('Some requested posts do not belong to your project scope')
  }

  const resolved = await resolveExistingReportJob(supabase, hash, user.id)
  if (resolved.action === 'reuse_complete' || resolved.action === 'reuse_inflight') {
    const job = resolved.job
    return {
      jobId: job.id,
      status: job.status,
      s3Path: job.s3_path,
    }
  }

  const { data: newJob, error: insertError } = await supabase
    .from('reports_generation')
    .insert({
      report_hash: hash,
      project: resolvedProject?.project_name,
      status: '[0%] Queued',
      report_type: reportType,
      client_id: user.id,
      last_update: new Date().toISOString(),
      s3_path: null,
      finish_time: null,
    })
    .select('id')
    .single()

  if (insertError) {
    logActionError({
      loki_stream: LOKI_STREAMS.reports,
      app_action: 'getOrCreateReportJob',
      message: 'Failed to create report job record',
      report_type: reportType,
      report_format: reportFormat,
    }, insertError)
    console.error('Failed to create report job record:', insertError)
    throw new Error('Failed to create report job record: ' + insertError.message)
  }

  const sqsPayload = {
    projectId: resolvedProject?.project_name || 'unknown',
    postIds: objectIds.map((id) => id.toString()),
    database_name: dbName,
    reportType,
    reportFormat,
    project: resolvedProject,
    profile: profile || null,
    jobId: newJob.id,
  }

  try {
    await sendReportSqsMessage(sqsPayload)
  } catch (dispatchError) {
    logActionError({
      loki_stream: LOKI_STREAMS.reports,
      app_action: 'getOrCreateReportJob',
      message: 'Failed to dispatch report job via SQS',
      job_id: String(newJob.id),
      report_type: reportType,
      report_format: reportFormat,
    }, dispatchError)
    console.error('Failed to dispatch report job:', dispatchError)
    await supabase
      .from('reports_generation')
      .update({ status: 'Failed: SQS Delivery Error', finish_time: new Date().toISOString() })
      .eq('id', newJob.id)
    throw new Error('Failed to start report generation job.')
  }

  return { jobId: newJob.id, status: '[0%] Queued', s3Path: null }
})

/** Server-side row read when browser Supabase REST/realtime is blocked. */
export const getReportJobStatus = traceAction('getReportJobStatus', async (jobId) => {
  const { user } = await requireAuthContext()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reports_generation')
    .select('status, s3_path')
    .eq('id', jobId)
    .eq('client_id', user.id)
    .maybeSingle()

  if (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.reports,
      app_action: 'getReportJobStatus',
      message: 'Failed to fetch report job status',
      job_id: String(jobId),
    }, error)
    console.error('getReportJobStatus:', error)
    return null
  }
  return data
})

/** @deprecated Use getOrCreateReportJob with reportFormat: 'docx' */
export async function getOrCreateDocxReportJob(args) {
  return getOrCreateReportJob({ ...args, reportFormat: REPORT_FORMATS.DOCX })
}
