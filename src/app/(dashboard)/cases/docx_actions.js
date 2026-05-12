'use server'

import { getSignedDownloadUrl } from '@/utils/aws/s3'
import { traceAction } from '@/utils/tracing'
import { createClient } from '@/utils/supabase/server'
import { generateReportHash } from '@/utils/report-hash'
import { sendReportSqsMessage } from '@/utils/aws/sqs'
import { requireAuthContext } from '@/utils/auth-context'
import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'

/**
 * Signs a storage URL so the client can download the DOCX file.
 */
export const getReportDownloadUrl = traceAction('getDocxReportDownloadUrl', async (s3Url, originalName) => {
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
    let key = url.pathname.substring(1) // remove leading '/'
    return await getSignedDownloadUrl(key, originalName)
  } catch (error) {
    console.error('Error generating signed download URL for DOCX report:', error)
    return null
  }
})

export const getOrCreateDocxReportJob = traceAction('getOrCreateDocxReportJob', async ({ posts, profile, reportType }) => {
  const supabase = await createClient();
  const { user, project: resolvedProject, dbName } = await requireAuthContext()

  const postIds = posts.map(p => p._id);
  const profileId = profile?.id || profile?._id || '';
  const hash = generateReportHash(resolvedProject?.project_name || 'unknown', postIds, reportType, profileId, 'docx');

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
  const validatedPosts = await db.collection('Posts').find(
    { _id: { $in: objectIds } },
    { projection: { _id: 1 } }
  ).toArray()
  if (validatedPosts.length !== objectIds.length) {
    throw new Error('Some requested posts do not belong to your project scope')
  }

  const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  // Check for a recent matching DOCX request by THIS client
  const { data: existingJob, error: checkError } = await supabase
    .from('reports_generation')
    .select('*')
    .eq('report_hash', hash)
    .eq('client_id', user.id)
    .gte('last_update', twoMinsAgo)
    .order('last_update', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (checkError) {
    console.error('Error checking existing DOCX report job:', checkError);
  }

  if (existingJob) {
    return {
      jobId: existingJob.id,
      status: existingJob.status,
      s3Path: existingJob.s3_path
    };
  }

  // Create a new job row
  const { data: newJob, error: insertError } = await supabase
    .from('reports_generation')
    .insert({
      report_hash: hash,
      project: resolvedProject?.project_name,
      status: 'Waiting in queue...',
      report_type: reportType,
      client_id: user.id,
      last_update: new Date().toISOString()
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Failed to create DOCX report job record:', insertError);
    throw new Error('Failed to create DOCX report job record: ' + insertError.message);
  }

  const sqsPayload = {
    projectId: resolvedProject?.project_name || 'unknown',
    postIds: objectIds.map((id) => id.toString()),
    database_name: dbName,
    reportType,
    reportFormat: 'docx',
    project: resolvedProject,
    profile: profile || null,
    jobId: newJob.id
  };

  try {
      await sendReportSqsMessage(sqsPayload);
  } catch (dispatchError) {
    console.error('Failed to dispatch DOCX report job:', dispatchError);

    await supabase
      .from('reports_generation')
      .update({ status: "Failed: SQS Delivery Error", finish_time: new Date().toISOString() })
      .eq('id', newJob.id);

    throw new Error('Failed to start DOCX report generation job.');
  }

  return { jobId: newJob.id, status: 'Waiting in queue...', s3Path: null };
})
