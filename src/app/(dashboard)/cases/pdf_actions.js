'use server'

import { getSignedDownloadUrl } from '@/utils/aws/s3'
import { traceAction } from '@/utils/tracing'
import { createClient } from '@/utils/supabase/server'
import { generateReportHash } from '@/utils/report-hash'
import { sendReportSqsMessage } from '@/utils/aws/sqs'
import { getAuthenticatedUser } from '@/utils/supabase/server'
import { requireAuthContext } from '@/utils/auth-context'
import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'

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
    let key = url.pathname.substring(1) // remove leading '/'

    return await getSignedDownloadUrl(key, originalName)
  } catch (error) {
    console.error("Error generating signed download URL for report:", error)
    return null
  }
})

export const getOrCreateReportJob = traceAction('getOrCreateReportJob', async ({ posts, project, profile, reportType }) => {
  const supabase = await createClient();
  const { user, project: resolvedProject, dbName } = await requireAuthContext()

  const postIds = posts.map(p => p._id);
  const profileId = profile?.id || profile?._id || '';
  const hash = generateReportHash(resolvedProject?.project_name || 'unknown', postIds, reportType, profileId, pdf);

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

  // Calculate 2 mins ago
  const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  // Check for recent matching request by THIS client
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
    console.error("Error checking existing report job:", checkError);
  }

  // If we found a recent matching job, return it
  if (existingJob) {
    return { 
      jobId: existingJob.id, 
      status: existingJob.status, 
      s3Path: existingJob.s3_path 
    };
  }

  // Otherwise, create a new job
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
    console.error("Failed to create report job record:", insertError);
    throw new Error('Failed to create report job record: ' + insertError.message);
  }

  // Send request to SQS
  const sqsPayload = {
    projectId: resolvedProject?.project_name || 'unknown',
    postIds: objectIds.map((id) => id.toString()),
    database_name: dbName,
    reportType: reportType,
    project: resolvedProject,
    profile: profile || null,
    jobId: newJob.id
  };

  try {
    await sendReportSqsMessage(sqsPayload);
  } catch (sqsError) {
    console.error("Failed to send message to SQS:", sqsError);
    
    // Optionally update the job status to failed
    await supabase
      .from('reports_generation')
      .update({ status: 'Failed: SQS Delivery Error', finish_time: new Date().toISOString() })
      .eq('id', newJob.id);
      
    throw new Error('Failed to start report generation job.');
  }

  return { jobId: newJob.id, status: 'Waiting in queue...', s3Path: null };
});
