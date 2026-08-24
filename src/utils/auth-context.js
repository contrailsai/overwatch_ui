'use server'

import { cache } from 'react'
import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'
import { runInSpan } from '@/utils/tracing'
import { logActionWarn, LOKI_STREAMS } from '@/utils/otel-logger'

const TENANT_CONTEXT_TTL_MS = 30 * 1000
const tenantContextCache = new Map()

export const getAuthContext = cache(async () => {
  const authContextStart = Date.now()
  const user = await getAuthenticatedUser()
  if (!user) return null

  const cachedEntry = tenantContextCache.get(user.id)
  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return {
      user,
      clientDetails: cachedEntry.clientDetails,
      project: cachedEntry.project,
      dbName: cachedEntry.dbName,
    }
  }

  const tenantLookupStart = Date.now()
  const { data: clientDetails, error } = await runInSpan(
    'auth_context.supabase_tenant_lookup',
    async (span) => {
      const supabase = await createClient()
      span.setAttribute('app.user_id', user.id)
      return supabase
        .from('client_details')
        .select('id, email, permission, project_name, project:project_name(project_name, mongo_db_map, project_details, editable)')
        .eq('id', user.id)
        .single()
    },
    { 'app.span_type': 'auth_context' }
  )
  const supabaseTenantLookupMs = Date.now() - tenantLookupStart
  const authContextMs = Date.now() - authContextStart

  console.debug('[auth-context] resolved tenant metadata', {
    userId: user.id,
    success: !error && !!clientDetails?.project?.mongo_db_map,
    supabase_tenant_lookup_ms: supabaseTenantLookupMs,
    auth_context_ms: authContextMs,
  })

  if (error || !clientDetails?.project?.mongo_db_map) {
    logActionWarn({
      loki_stream: LOKI_STREAMS.auth,
      app_action: 'getAuthContext',
      message: 'auth_context tenant lookup failed or incomplete',
      user_id: user.id,
      has_client_details: !!clientDetails,
      has_mongo_db_map: !!clientDetails?.project?.mongo_db_map,
      supabase_error: error?.message ?? null,
    })
    return null
  }

  const context = {
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

  tenantContextCache.set(user.id, {
    clientDetails: context.clientDetails,
    project: context.project,
    dbName: context.dbName,
    expiresAt: Date.now() + TENANT_CONTEXT_TTL_MS,
  })

  return context
})

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

export async function invalidateTenantContext(userId) {
  if (userId) {
    tenantContextCache.delete(userId)
    return
  }
  tenantContextCache.clear()
}
