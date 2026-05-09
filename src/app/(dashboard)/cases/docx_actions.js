'use server'

import { getSignedDownloadUrl } from '@/utils/aws/s3'
import { traceAction } from '@/utils/tracing'
import { createClient } from '@/utils/supabase/server'
import { generateReportHash } from '@/utils/report-hash'
import { sendReportSqsMessage } from '@/utils/aws/sqs'
import { getAuthenticatedUser } from '@/utils/supabase/server'

/**
 * Signs a storage URL so the client can download the DOCX file.
 */
export const getReportDownloadUrl = traceAction('getDocxReportDownloadUrl', async (s3Url, originalName) => {
  if (!s3Url) return null

  try {
    const url = new URL(s3Url)
    let key = url.pathname.substring(1) // remove leading '/'
    return await getSignedDownloadUrl(key, originalName)
  } catch (error) {
    console.error('Error generating signed download URL for DOCX report:', error)
    return null
  }
})

/**
 * Creates (or retrieves a recent cached) DOCX report generation job and dispatches
 * it to the overwatch-pdf-creation-service with reportFormat='docx'.
 *
 * The shape mirrors getOrCreateReportJob from pdf_actions.js so useDocxExport.js
 * can follow the exact same polling / realtime pattern.
 */
export const getOrCreateDocxReportJob = traceAction('getOrCreateDocxReportJob', async ({ posts, project, profile, reportType }) => {
  const supabase = await createClient();
  const user = await getAuthenticatedUser();
  if (!user) throw new Error('Authentication required to generate reports');

  const postIds = posts.map(p => p._id);
  const profileId = profile?.id || profile?._id || '';
  // Append 'docx' to keep the hash space separate from PDF hashes
  const hash = generateReportHash(project?.project_name || 'unknown', postIds, reportType, profileId, 'docx');

  // Calculate 2 mins ago (same dedup window as PDF)
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
      project: project?.project_name,
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
    projectId: project?.project_name || 'unknown',
    postIds,
    database_name: project?.mongo_db_map,
    reportType,
    reportFormat: 'docx',          // ← tells the service to use the DOCX pipeline
    project: project,
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
