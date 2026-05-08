'use server'

import { createClient } from '@/utils/supabase/server'
import { requireRole, requireAuthContext } from '@/utils/auth-context'

export async function get_watchlist(_project_name, search = "") {
  const { clientDetails } = await requireAuthContext()

  const supabase = await createClient()

  let query = supabase
    .from('watchlist')
    .select('*')
    .eq('project_name', clientDetails.project_name)
    .order('created_at', { ascending: false })

  if (search) {
    query = query.ilike('link', `%${search}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching watchlist:', error)
    return { error: 'Failed to fetch watchlist' }
  }
  return data
}

export async function add_to_watchlist(_project_name, link) {
  const { clientDetails } = await requireRole(['client-admin', 'reviewer'])
  if (!link || !link.trim()) {
    return { error: 'Link cannot be empty' }
  }

  const trimmedLink = link.trim()
  try {
    new URL(trimmedLink) // Basic URL validation
  } catch (_) {
    return { error: 'Please provide a valid URL starting with http:// or https://' }
  }

  const supabase = await createClient()

  // Check if already exists for this project
  const { data: existing } = await supabase
    .from('watchlist')
    .select('id')
    .eq('project_name', clientDetails.project_name)
    .eq('link', trimmedLink)
    .single()

  if (existing) {
    return { error: 'This profile is already in the watchlist' }
  }

  const { error } = await supabase
    .from('watchlist')
    .insert([{
      project_name: clientDetails.project_name,
      link: trimmedLink,
      type: 'profile'
    }])

  if (error) {
    console.error('Error adding to watchlist:', error)
    return { error: 'Failed to add to watchlist' }
  }

  return { success: true }
}

export async function delete_from_watchlist(id) {
  if (!id) return { error: 'Invalid item ID' }
  const { clientDetails } = await requireRole(['client-admin', 'reviewer'])

  const supabase = await createClient()
  const { data: existing, error: existingError } = await supabase
    .from('watchlist')
    .select('project_name')
    .eq('id', id)
    .single()

  if (existingError || !existing) {
    return { error: 'Item not found' }
  }
  if (existing.project_name !== clientDetails.project_name) {
    return { error: 'Unauthorized access to watchlist item' }
  }

  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting from watchlist:', error)
    return { error: 'Failed to delete item' }
  }

  return { success: true }
}
