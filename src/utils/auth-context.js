'use server'

import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'

export async function getAuthContext() {
  const user = await getAuthenticatedUser()
  if (!user) return null

  const supabase = await createClient()
  const { data: clientDetails, error } = await supabase
    .from('client_details')
    .select('id, email, permission, project_name, project:project_name(project_name, mongo_db_map, project_details)')
    .eq('id', user.id)
    .single()

  if (error || !clientDetails?.project?.mongo_db_map) {
    return null
  }

  return {
    user,
    clientDetails: {
      id: clientDetails.id,
      email: clientDetails.email,
      permission: clientDetails.permission,
      project_name: clientDetails.project_name
    },
    project: clientDetails.project,
    dbName: clientDetails.project.mongo_db_map
  }
}

export async function requireAuthContext() {
  const context = await getAuthContext()
  if (!context) {
    throw new Error('Authentication required')
  }
  return context
}

export async function requireRole(allowedRoles = []) {
  const context = await requireAuthContext()
  if (!allowedRoles.includes(context.clientDetails.permission)) {
    throw new Error('Insufficient permissions')
  }
  return context
}
