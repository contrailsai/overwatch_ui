'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { logActionError, logActionWarn, LOKI_STREAMS } from '@/utils/otel-logger'
import { partitionUrls } from './urls'

function getPostLinkCandidates(post) {
  if (!post) return []
  const candidates = [
    post.original_url,
    post.url,
    post.result_origin?.source_url,
  ].filter(Boolean)
  return [...new Set(candidates)]
}

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) return null

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Insert client-requested links for the current project (session client / RLS).
 */
export async function insertClientRequestedLinks({ userId, projectName, rawLinks }) {
  const { validLinks, invalidLinks } = partitionUrls(rawLinks)

  if (validLinks.length === 0) {
    return {
      error: 'None of the provided links are valid URLs',
      validLinks: [],
      invalidLinks,
      data: null,
    }
  }

  const rows = validLinks.map((link) => ({
    requested_by: userId,
    link,
    project: projectName,
  }))

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('client_requested_links')
    .insert(rows)
    .select()

  if (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'clientRequestedLinks/server',
      app_action: 'insertClientRequestedLinks',
      message: 'insertClientRequestedLinks failed',
    }, error)
    console.error('insertClientRequestedLinks:', error)
    return {
      error: 'Failed to submit bulk request',
      validLinks,
      invalidLinks,
      data: null,
    }
  }

  return { data, validLinks, invalidLinks, error: null }
}

/**
 * List requested links for the authenticated user on their project.
 */
export async function getClientRequestedLinksForUser({ userId, projectName }) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('client_requested_links')
    .select('*')
    .eq('requested_by', userId)
    .eq('project', projectName)
    .order('created_at', { ascending: false })

  if (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'clientRequestedLinks/server',
      app_action: 'getClientRequestedLinksForUser',
      message: 'getClientRequestedLinksForUser failed',
    }, error)
    console.error('getClientRequestedLinksForUser:', error)
    return { error: 'Failed to fetch requested links', data: null }
  }

  return { data, error: null }
}

/**
 * Marks all matching upload-content rows as enlisted when a reviewer publishes a case.
 * Overrides any prior status (pending, ingested, failed, etc.) so review→client always
 * wins over worker timing; the ingestion worker only transitions pending → ingested/failed.
 */
export async function markClientRequestedLinksEnlisted({ post, projectName }) {
  const urls = getPostLinkCandidates(post)
  if (!urls.length || !projectName) return { updated: 0 }

  const supabase = getServiceRoleClient()
  if (!supabase) {
    logActionWarn({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'clientRequestedLinks/server',
      app_action: 'markClientRequestedLinksEnlisted',
      message: 'markClientRequestedLinksEnlisted: SUPABASE_SERVICE_ROLE_KEY missing, skipping update',
    })
    console.warn(
      'markClientRequestedLinksEnlisted: SUPABASE_SERVICE_ROLE_KEY missing, skipping update'
    )
    return { updated: 0, skipped: true }
  }

  const caseId = post?._id != null ? String(post._id) : null
  const updatePayload = { ingested: 'enlisted' }
  if (caseId) updatePayload.case_id = caseId

  const { data, error } = await supabase
    .from('client_requested_links')
    .update(updatePayload)
    .in('link', urls)
    .eq('project', projectName)
    .select('id')

  if (error) {
    throw error
  }

  return { updated: data?.length ?? 0 }
}
