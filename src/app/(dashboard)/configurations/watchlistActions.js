'use server'

import { createClient } from '@/utils/supabase/server'
import { requireRole, getAuthContext } from '@/utils/auth-context'
import { traceAction, runInSpan } from '@/utils/tracing'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'

/** `_project_name` is ignored for tenant scope; project comes from auth context (guardrail). */
export const get_watchlist = traceAction('configurations.get_watchlist', async (_project_name, search = '') => {
  const ctx = await getAuthContext()
  if (!ctx?.clientDetails?.project_name) {
    return { error: 'Failed to fetch watchlist' }
  }

  const supabase = await createClient()

  let query = supabase
    .from('watchlist')
    .select('*')
    .eq('project_name', ctx.clientDetails.project_name)
    .order('created_at', { ascending: false })

  if (search) {
    query = query.ilike('link', `%${search}%`)
  }

  const { data, error } = await runInSpan(
    'configurations.get_watchlist.supabase_query',
    async () => query,
    { 'app.span_type': 'supabase_query' }
  )

  if (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.configurations,
      app_action: 'get_watchlist',
      message: 'Error fetching watchlist',
    }, error)
    console.error('Error fetching watchlist:', error)
    return { error: 'Failed to fetch watchlist' }
  }
  return data
})

export const add_to_watchlist = traceAction('configurations.add_to_watchlist', async (_project_name, link) => {
  const { clientDetails } = await requireRole(['client', 'client-admin', 'reviewer'])
  if (!link || !link.trim()) {
    return { error: 'Link cannot be empty' }
  }

  const trimmedLink = link.trim()
  try {
    new URL(trimmedLink)
  } catch (_) {
    return { error: 'Please provide a valid URL starting with http:// or https://' }
  }

  const supabase = await createClient()

  const { data: existing } = await runInSpan(
    'configurations.add_to_watchlist.supabase_exists',
    async () =>
      supabase
        .from('watchlist')
        .select('id')
        .eq('project_name', clientDetails.project_name)
        .eq('link', trimmedLink)
        .single(),
    { 'app.span_type': 'supabase_query' }
  )

  if (existing) {
    return { error: 'This profile is already in the watchlist' }
  }

  const { error } = await runInSpan(
    'configurations.add_to_watchlist.supabase_insert',
    async () =>
      supabase
        .from('watchlist')
        .insert([{
          project_name: clientDetails.project_name,
          link: trimmedLink,
          type: 'profile'
        }]),
    { 'app.span_type': 'supabase_query' }
  )

  if (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.configurations,
      app_action: 'add_to_watchlist',
      message: 'Error adding to watchlist',
    }, error)
    console.error('Error adding to watchlist:', error)
    return { error: 'Failed to add to watchlist' }
  }

  return { success: true }
})

export const delete_from_watchlist = traceAction('configurations.delete_from_watchlist', async (id) => {
  if (!id) return { error: 'Invalid item ID' }
  const { clientDetails } = await requireRole(['client', 'client-admin', 'reviewer'])

  const supabase = await createClient()
  const { data: existing, error: existingError } = await runInSpan(
    'configurations.delete_from_watchlist.supabase_fetch',
    async () =>
      supabase
        .from('watchlist')
        .select('project_name')
        .eq('id', id)
        .single(),
    { 'app.span_type': 'supabase_query' }
  )

  if (existingError || !existing) {
    return { error: 'Item not found' }
  }
  if (existing.project_name !== clientDetails.project_name) {
    return { error: 'Unauthorized access to watchlist item' }
  }

  const { error } = await runInSpan(
    'configurations.delete_from_watchlist.supabase_delete',
    async () =>
      supabase
        .from('watchlist')
        .delete()
        .eq('id', id),
    { 'app.span_type': 'supabase_query' }
  )

  if (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.configurations,
      app_action: 'delete_from_watchlist',
      message: 'Error deleting from watchlist',
    }, error)
    console.error('Error deleting from watchlist:', error)
    return { error: 'Failed to delete item' }
  }

  return { success: true }
})
