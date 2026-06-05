'use server'

import { getSignedDownloadUrl, resolveS3ObjectKeyFromStoredPath } from '@/utils/aws/s3'
import { traceAction } from '@/utils/tracing'
import { createClient } from '@/utils/supabase/server'
import { generateReportHash } from '@/features/reports/hash'
import { sendReportSqsMessage } from '@/utils/aws/sqs'
import { requireAuthContext } from '@/utils/auth-context'
import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { resolveExistingReportJob } from '@/features/reports/lib/resolve-job'
import { REPORT_FORMATS, REPORT_TYPES } from '@/features/reports/constants'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { orderPostIdsForReport } from '@/app/(dashboard)/cases/actions'
import { REVIEWED_THREAT_SCORE_FILTER } from '@/lib/posts/reviewed-post-filter'

const OBJECT_ID_HEX = /^[a-fA-F0-9]{24}$/

export const getReportDownloadUrl = traceAction('getReportDownloadUrl', async (jobId, originalName) => {
  if (jobId == null || jobId === '') return null

  try {
    const { user } = await requireAuthContext()
    const supabase = await createClient()
    const { data: ownedReport, error: lookupError } = await supabase
      .from('reports_generation')
      .select('s3_path')
      .eq('id', jobId)
      .eq('client_id', user.id)
      .maybeSingle()

    if (lookupError) {
      logActionError({
        loki_stream: LOKI_STREAMS.reports,
        app_action: 'getReportDownloadUrl',
        message: 'Report ownership lookup failed',
        job_id: String(jobId),
      }, lookupError)
      console.error('getReportDownloadUrl: ownership lookup failed', lookupError)
      return null
    }
    if (!ownedReport?.s3_path) return null

    const key = resolveS3ObjectKeyFromStoredPath(ownedReport.s3_path)
    if (!key) return null

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
  if (reportFormat === REPORT_FORMATS.DOCX && reportType === REPORT_TYPES.SUMMARY) {
    throw new Error('DOCX reports do not support Summary report type')
  }

  if (reportType === REPORT_TYPES.SIMPLE_PROFILE && reportFormat !== REPORT_FORMATS.DOCX) {
    throw new Error('SimpleProfile is only supported with reportFormat docx')
  }

  const supabase = await createClient()
  const { user, project: resolvedProject, dbName } = await requireAuthContext()

  const postIds = posts.map((p) => p._id)
  const profileId = String(profile?._id ?? profile?.id ?? '')

  if (reportType === REPORT_TYPES.SIMPLE_PROFILE && !profileId) {
    throw new Error('Profile is required for SimpleProfile report generation')
  }

  for (const id of postIds) {
    if (id != null && String(id) !== '' && !OBJECT_ID_HEX.test(String(id))) {
      throw new Error('Invalid post ID format (expected 24-character hex)')
    }
  }

  const client = await clientPromise
  const db = client.db(dbName)
  const objectIds = [
    ...new Map(
      postIds
        .filter(Boolean)
        .map((id) => {
          try {
            return [String(id), new ObjectId(id)]
          } catch {
            return null
          }
        })
        .filter(Boolean)
    ).values(),
  ]

  if (objectIds.length === 0) {
    throw new Error('No valid post IDs for report generation')
  }

  const postsCollection = db.collection('Posts')
  let reportObjectIds = objectIds

  const isProfileFamily =
    reportType === REPORT_TYPES.PROFILE || reportType === REPORT_TYPES.SIMPLE_PROFILE

  if (isProfileFamily) {
    // Profile.posts may reference stale, pending, or duplicate IDs — only export reviewed posts that exist.
    const reviewedPosts = await postsCollection
      .find({ _id: { $in: objectIds }, ...REVIEWED_THREAT_SCORE_FILTER }, { projection: { _id: 1 } })
      .toArray()

    if (reviewedPosts.length === 0) {
      throw new Error('No reviewed posts available for profile report generation')
    }
    reportObjectIds = reviewedPosts.map((p) => p._id)
  } else {
    const validatedPosts = await postsCollection
      .find({ _id: { $in: objectIds } }, { projection: { _id: 1 } })
      .toArray()

    if (validatedPosts.length !== objectIds.length) {
      throw new Error('Some requested posts do not belong to your project scope')
    }

    const reviewedPosts = await postsCollection
      .find({ _id: { $in: objectIds }, ...REVIEWED_THREAT_SCORE_FILTER }, { projection: { _id: 1 } })
      .toArray()

    if (reviewedPosts.length !== objectIds.length) {
      const unreviewedCount = objectIds.length - reviewedPosts.length
      throw new Error(
        `${unreviewedCount} post(s) are not reviewed and cannot be included in report generation`
      )
    }
  }

  const reportPostIds = reportObjectIds.map((id) => id.toString())

  let orderedPostIds
  if (reportType === REPORT_TYPES.SIMPLE_PROFILE) {
    const reviewedSet = new Set(reportPostIds)
    orderedPostIds = postIds.map(String).filter((id) => reviewedSet.has(id))
    if (orderedPostIds.length === 0) {
      throw new Error('No reviewed posts available for profile report generation')
    }
  } else {
    orderedPostIds = await orderPostIdsForReport(reportPostIds)
    if (orderedPostIds.length !== reportPostIds.length) {
      throw new Error('Some requested posts could not be ordered for report generation')
    }
  }

  const hash = generateReportHash(
    resolvedProject?.project_name || 'unknown',
    reportPostIds,
    reportType,
    profileId,
    reportFormat
  )

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
    postIds: orderedPostIds,
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
