'use server'

import { createClient } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { postsCollection } from '@/utils/mongodb/collections'
import { revalidatePath } from 'next/cache'
import { getAuthContext, requireRole, invalidateTenantContext } from '@/utils/auth-context'
import { normalizeSections } from '@/lib/project-sections'
import { runInSpan, traceAction } from '@/utils/tracing'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'

const TIME_PATTERN = /^\d{2}:\d{2}$/
const CRON_WRITE_ROLES = ['client-admin', 'reviewer']

async function cronApiFetch(path, { method = 'GET', body } = {}) {
  const base = process.env.WHATSAPP_CRON_API_URL?.trim().replace(/\/$/, '')
  const key = process.env.WHATSAPP_CRON_API_KEY?.trim()
  if (!base || !key) {
    return { configured: false, error: 'Automatic WhatsApp reports are not configured' }
  }

  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': key,
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })

    const text = await res.text()
    let data = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = { message: text }
      }
    }

    if (res.ok) {
      return { configured: true, data, status: res.status }
    }

    if (res.status === 503) {
      return { configured: true, error: 'Report scheduling is not available on the server. Contact your administrator.' }
    }
    if (res.status === 401) {
      return {
        configured: true,
        error: 'Could not connect to the report scheduling service. Contact your administrator.',
      }
    }
    if (res.status === 404) {
      return { configured: true, error: data?.error || data?.message || 'Scheduled report not found' }
    }

    const details = Array.isArray(data?.details)
      ? data.details.join('; ')
      : null
    const message = data?.error || data?.message || `Could not update the report schedule (${res.status})`
    return {
      configured: true,
      error: details ? `${message}: ${details}` : message,
      details: data?.details,
    }
  } catch (err) {
    logActionError({
      loki_stream: LOKI_STREAMS.configurations,
      app_action: 'cronApiFetch',
      message: 'WhatsApp cron API fetch error',
      cron_path: path,
      cron_method: method,
    }, err)
    console.error('WhatsApp cron API fetch error:', err)
    return { configured: true, error: 'Could not reach the report scheduling service' }
  }
}

function assertCronWriteAccess(ctx) {
  if (!ctx?.clientDetails?.project_name) {
    return { error: 'Not authenticated' }
  }
  if (!CRON_WRITE_ROLES.includes(ctx.clientDetails.permission)) {
    return { error: 'Insufficient permissions to manage scheduled reports' }
  }
  if (ctx.project?.editable !== true) {
    return { error: 'Project details are locked for this project' }
  }
  return null
}

function validateCronCommand(command) {
  const trimmed = command?.trim()
  if (!trimmed) return 'Please choose a report type'
  if (!trimmed.startsWith('@bot') && !trimmed.startsWith('!')) {
    return 'Use “PDF summary” for a standard report, or ask support for a custom instruction'
  }
  return null
}

function validateCronTime(time) {
  if (!time || !TIME_PATTERN.test(time)) {
    return 'Please choose a valid send time'
  }
  return null
}

function buildSchedulePayload(fields) {
  const payload = {
    time: fields.time,
    timezone: fields.timezone || 'Asia/Kolkata',
    repeat: fields.repeat || 'daily',
    enabled: fields.enabled !== false,
  }
  if (payload.repeat === 'weekly' && fields.dayOfWeek != null) {
    payload.dayOfWeek = Number(fields.dayOfWeek)
  }
  if (payload.repeat === 'monthly' && fields.dayOfMonth != null) {
    payload.dayOfMonth = Number(fields.dayOfMonth)
  }
  return payload
}

export const get_cron_jobs = traceAction('configurations.get_cron_jobs', async () => {
  const ctx = await requireRole(['client', 'client-admin', 'reviewer'])
  const projectName = ctx.clientDetails.project_name

  const result = await cronApiFetch(
    `/api/cron-jobs?project_name=${encodeURIComponent(projectName)}`
  )

  if (!result.configured) {
    return { configured: false, error: result.error }
  }
  if (result.error) {
    return { configured: true, error: result.error }
  }

  const jobs = Array.isArray(result.data)
    ? result.data
    : (result.data?.jobs ?? [])

  return { configured: true, jobs }
})

export const create_cron_job = traceAction('configurations.create_cron_job', async (fields) => {
  const ctx = await getAuthContext()
  const authError = assertCronWriteAccess(ctx)
  if (authError) return authError

  const timeError = validateCronTime(fields?.time)
  if (timeError) return { error: timeError }

  const commandError = validateCronCommand(fields?.command)
  if (commandError) return { error: commandError }

  const schedule = buildSchedulePayload(fields)
  const payload = {
    project_name: ctx.clientDetails.project_name,
    command: fields.command.trim(),
    ...schedule,
  }

  const result = await cronApiFetch('/api/cron-jobs', {
    method: 'POST',
    body: payload,
  })

  if (!result.configured) {
    return { error: result.error }
  }
  if (result.error) {
    return { error: result.error, details: result.details }
  }

  const jobId = result.data?.jobId
  if (!jobId) {
    return { error: 'Could not create the report schedule. Please try again.' }
  }
  return { jobId }
})

export const update_cron_job = traceAction('configurations.update_cron_job', async (jobId, fields) => {
  const ctx = await getAuthContext()
  const authError = assertCronWriteAccess(ctx)
  if (authError) return authError

  if (!jobId) return { error: 'Report schedule ID is required' }

  const body = {}
  if (fields?.enabled !== undefined) body.enabled = fields.enabled
  if (fields?.command !== undefined) {
    const commandError = validateCronCommand(fields.command)
    if (commandError) return { error: commandError }
    body.command = fields.command.trim()
  }
  if (fields?.time !== undefined) {
    const timeError = validateCronTime(fields.time)
    if (timeError) return { error: timeError }
    body.time = fields.time
  }
  if (fields?.timezone !== undefined) body.timezone = fields.timezone
  if (fields?.repeat !== undefined) body.repeat = fields.repeat
  if (fields?.dayOfWeek !== undefined) body.dayOfWeek = Number(fields.dayOfWeek)
  if (fields?.dayOfMonth !== undefined) body.dayOfMonth = Number(fields.dayOfMonth)

  if (Object.keys(body).length === 0) {
    return { error: 'Nothing to update' }
  }

  const result = await cronApiFetch(`/api/cron-jobs/${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    body,
  })

  if (!result.configured) {
    return { error: result.error }
  }
  if (result.error) {
    return { error: result.error, details: result.details }
  }

  const job = result.data?.jobId ? result.data : (result.data?.job ?? result.data)
  return { job }
})

export const delete_cron_job = traceAction('configurations.delete_cron_job', async (jobId) => {
  const ctx = await getAuthContext()
  const authError = assertCronWriteAccess(ctx)
  if (authError) return authError

  if (!jobId) return { error: 'Report schedule ID is required' }

  const result = await cronApiFetch(`/api/cron-jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
  })

  if (!result.configured) {
    return { error: result.error }
  }
  if (result.error) {
    return { error: result.error }
  }

  return { success: true }
})

export const updateLabels = traceAction('configurations.updateLabels', async (prevState, formData) => {
  const ctx = await getAuthContext()
  if (!ctx?.clientDetails?.project_name || !ctx.dbName) {
    return { error: 'Not authenticated' }
  }

  const projectData = ctx.project
  if (!projectData?.mongo_db_map) {
    return { error: 'Project not found' }
  }

  const allowedRoles = ['client-admin', 'reviewer']
  if (!allowedRoles.includes(ctx.clientDetails.permission)) {
    return { error: 'Insufficient permissions to update project settings' }
  }

  if (projectData.editable !== true) {
    return { error: 'Project details are locked for this project' }
  }

  let projectDetails = {}
  try {
    projectDetails = typeof projectData?.project_details === 'string'
      ? JSON.parse(projectData.project_details)
      : (projectData?.project_details || {})
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.configurations,
      app_action: 'updateLabels',
      message: 'Error parsing project_details',
    }, e)
    console.error('Error parsing project_details:', e)
    projectDetails = {}
  }

  const projectDescription = formData.get('project_description')
  const labelsString = formData.get('labels')
  const legalCodesString = formData.get('legal_codes')

  let labels = []
  let legalCodes = []
  let renamedLabels = []
  let renamedLegalCodes = []

  try {
    if (labelsString) {
      const parsedLabels = JSON.parse(labelsString)

      labels = parsedLabels
        .filter(label => label.name?.trim() !== '')
        .map(label => {
          if (label.originalName && label.name !== label.originalName) {
            renamedLabels.push({ oldName: label.originalName, newName: label.name })
          }
          return {
            name: label.name,
            description: label.description,
            severity: label.severity || 'low'
          }
        })
    }

    if (legalCodesString) {
      const parsedCodes = JSON.parse(legalCodesString)
      legalCodes = parsedCodes
        .filter(code => (code.actName?.trim() !== '' || code.codeName?.trim() !== ''))
        .map(code => {
          const generatedName = `${code.actName || ''} - ${code.codeName || ''}`.trim().replace(/^-|-$/g, '').trim()
          if (code.originalName && generatedName !== code.originalName) {
            renamedLegalCodes.push({ oldName: code.originalName, newName: generatedName })
          }
          return {
            actName: code.actName,
            codeName: code.codeName,
            description: code.description,
            name: generatedName,
            severity: code.severity || 'low',
            referenceLink: code.referenceLink || ''
          }
        })
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.configurations,
      app_action: 'updateLabels',
      message: 'Error parsing labels/legal_codes JSON',
    }, e)
    console.error('Error parsing JSON:', e)
    return { error: 'Invalid data provided' }
  }

  projectDetails.description = projectDescription
  projectDetails.labels = labels
  projectDetails.legal_codes = legalCodes

  const supabase = await createClient()
  const { error } = await runInSpan(
    'configurations.updateLabels.supabase_update',
    async () =>
      supabase
        .from('project')
        .update({ project_details: projectDetails })
        .eq('project_name', ctx.clientDetails.project_name),
    { 'app.span_type': 'supabase_query' }
  )

  if (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.configurations,
      app_action: 'updateLabels',
      message: 'Error updating project labels',
      project_name: ctx.clientDetails.project_name,
    }, error)
    console.error('Error updating project labels:', error)
    return { error: 'Failed to update labels' }
  }

  if (renamedLabels.length > 0 || renamedLegalCodes.length > 0) {
    try {
      await runInSpan(
        'configurations.updateLabels.mongo_cascade',
        async () => {
          const client = await clientPromise
          const db = client.db(ctx.dbName)
          const postsCol = postsCollection(db)

          for (const { oldName, newName } of renamedLabels) {
            await postsCol.updateMany(
              { 'review_details.threat_types': oldName },
              { $set: { 'review_details.threat_types.$': newName } }
            )

            const renameOp = {}
            renameOp[`review_details.flags.${oldName}`] = `review_details.flags.${newName}`
            await postsCol.updateMany(
              { [`review_details.flags.${oldName}`]: { $exists: true } },
              { $rename: renameOp }
            )
          }

          for (const { oldName, newName } of renamedLegalCodes) {
            await postsCol.updateMany(
              { 'review_details.legal_codes': oldName },
              { $set: { 'review_details.legal_codes.$': newName } }
            )
          }
        },
        { 'app.span_type': 'mongo_query' }
      )
    } catch (err) {
      logActionError({
        loki_stream: LOKI_STREAMS.configurations,
        app_action: 'updateLabels',
        message: 'Error cascading label updates to MongoDB',
        project_name: ctx.clientDetails.project_name,
        renamed_labels_count: renamedLabels.length,
        renamed_legal_codes_count: renamedLegalCodes.length,
      }, err)
      console.error('Error cascading label updates to MongoDB:', err)
    }
  }

  await invalidateTenantContext(ctx.user?.id)
  revalidatePath('/', 'layout')
  revalidatePath('/configurations')

  return { success: true, message: 'Labels updated successfully' }
}, { loki_stream: LOKI_STREAMS.configurations })

export const updateProjectSections = traceAction('configurations.updateProjectSections', async (sectionsInput) => {
  const ctx = await getAuthContext()
  if (!ctx?.clientDetails?.project_name) {
    return { error: 'Not authenticated' }
  }

  const projectData = ctx.project
  if (!projectData?.mongo_db_map) {
    return { error: 'Project not found' }
  }

  const allowedRoles = ['client-admin', 'reviewer']
  if (!allowedRoles.includes(ctx.clientDetails.permission)) {
    return { error: 'Insufficient permissions to update project settings' }
  }

  if (projectData.editable !== true) {
    return { error: 'Project details are locked for this project' }
  }

  let projectDetails = {}
  try {
    projectDetails = typeof projectData?.project_details === 'string'
      ? JSON.parse(projectData.project_details)
      : (projectData?.project_details || {})
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.configurations,
      app_action: 'updateProjectSections',
      message: 'Error parsing project_details',
    }, e)
    console.error('Error parsing project_details:', e)
    projectDetails = {}
  }

  projectDetails.sections = normalizeSections(sectionsInput)

  const supabase = await createClient()
  const { error } = await runInSpan(
    'configurations.updateProjectSections.supabase_update',
    async () =>
      supabase
        .from('project')
        .update({ project_details: projectDetails })
        .eq('project_name', ctx.clientDetails.project_name),
    { 'app.span_type': 'supabase_query' }
  )

  if (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.configurations,
      app_action: 'updateProjectSections',
      message: 'Error updating project sections',
      project_name: ctx.clientDetails.project_name,
    }, error)
    console.error('Error updating project sections:', error)
    return { error: 'Failed to update monitoring sections' }
  }

  await invalidateTenantContext(ctx.user?.id)
  revalidatePath('/', 'layout')
  revalidatePath('/configurations')

  return { success: true, sections: projectDetails.sections }
}, { loki_stream: LOKI_STREAMS.configurations })

export const updateDoTakedowns = traceAction('configurations.updateDoTakedowns', async (enabled) => {
  const ctx = await getAuthContext()
  if (!ctx?.clientDetails?.project_name) {
    return { error: 'Not authenticated' }
  }

  const projectData = ctx.project
  if (!projectData?.mongo_db_map) {
    return { error: 'Project not found' }
  }

  const allowedRoles = ['client-admin', 'reviewer']
  if (!allowedRoles.includes(ctx.clientDetails.permission)) {
    return { error: 'Insufficient permissions to update project settings' }
  }

  if (projectData.editable !== true) {
    return { error: 'Project details are locked for this project' }
  }

  let projectDetails = {}
  try {
    projectDetails = typeof projectData?.project_details === 'string'
      ? JSON.parse(projectData.project_details)
      : (projectData?.project_details || {})
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.configurations,
      app_action: 'updateDoTakedowns',
      message: 'Error parsing project_details',
    }, e)
    console.error('Error parsing project_details:', e)
    projectDetails = {}
  }

  projectDetails.do_takedowns = enabled !== false

  const supabase = await createClient()
  const { error } = await runInSpan(
    'configurations.updateDoTakedowns.supabase_update',
    async () =>
      supabase
        .from('project')
        .update({ project_details: projectDetails })
        .eq('project_name', ctx.clientDetails.project_name),
    { 'app.span_type': 'supabase_query' }
  )

  if (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.configurations,
      app_action: 'updateDoTakedowns',
      message: 'Error updating do_takedowns',
      project_name: ctx.clientDetails.project_name,
    }, error)
    console.error('Error updating do_takedowns:', error)
    return { error: 'Failed to update takedowns setting' }
  }

  await invalidateTenantContext(ctx.user?.id)
  revalidatePath('/', 'layout')
  revalidatePath('/configurations')

  return { success: true, do_takedowns: projectDetails.do_takedowns }
}, { loki_stream: LOKI_STREAMS.configurations })
