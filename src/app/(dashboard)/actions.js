'use server'

import { cache } from 'react'
import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { traceAction } from '@/utils/tracing'
import { posthogServer } from '@/utils/posthog'
import { getAuthContext } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { buildDashboardPayload } from '@/lib/analytics/dashboardSeries'
import { METRIC_TIMEZONE, shiftDateStr, todayDateStr } from '@/lib/analytics/dims'

export const getDashboardData = traceAction('getDashboardData', async (project, queryParams) => {
  const supabase = await createClient()
  const projectName = typeof project === 'string' ? project : project?.project_name

  const { days, from, to } = queryParams || {}
  
  // Track this server action with PostHog
  const user = await getAuthenticatedUser()
  if (user) {
    posthogServer.capture({
      distinctId: user.email || user.id,
      event: 'server_action_called',
      properties: {
        action_name: 'getDashboardData',
        project: projectName,
        days_range: days
      }
    })
  }
  
  const timeZone = (typeof project === 'object' && project?.project_details?.timezone) || METRIC_TIMEZONE
  let startDateStr
  let endDateStr

  if (from && to) {
    startDateStr = String(from).slice(0, 10)
    endDateStr = String(to).slice(0, 10)
  } else {
    const defaultDays = [1, 7].includes(days) ? days : 7
    endDateStr = todayDateStr(timeZone)
    startDateStr = shiftDateStr(endDateStr, -defaultDays)
  }

  const windowDays = Math.max(
    1,
    Math.round((Date.parse(`${endDateStr}T00:00:00Z`) - Date.parse(`${startDateStr}T00:00:00Z`)) / 86400000) + 1,
  )
  const priorEndStr = shiftDateStr(startDateStr, -1)
  const priorStartStr = shiftDateStr(priorEndStr, -(windowDays - 1))

  return buildDashboardPayload(supabase, project, {
    startDateStr,
    endDateStr,
    priorStartStr,
    priorEndStr,
    days: from && to ? 'custom' : ([1, 7].includes(days) ? days : 7),
  })
})

export const getUser = traceAction('getUser', cache(async () => {
  const user = await getAuthenticatedUser()

  if (!user) return { user: null, clientDetails: null }

  const supabase = await createClient()
  const { data: clientDetails, error } = await supabase
    .from('client_details')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.dashboard,
      app_action: 'getUser',
      message: 'Error fetching client details',
    }, error)
    console.error('Error fetching client details:', error)
    return { user, clientDetails: null }
  }

  return { user, clientDetails }
}))

export const getClientandProjectDetails = traceAction('getClientandProjectDetails', cache(async () => {
  const context = await getAuthContext()
  if (!context) return null

  return {
    user: context.user,
    clientDetails: context.clientDetails,
    project: context.project,
  }
}))

export const getCases = traceAction('getCases', async (projectName) => {
  const supabase = await createClient()

  let query = supabase
    .from('cases_metadata')
    .select('*')
    .order('created_at', { ascending: false })

  if (projectName) {
    query = query.eq('project_name', projectName)
  }

  const { data: cases, error } = await query

  if (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.dashboard,
      app_action: 'getCases',
      message: 'Error fetching cases',
    }, error)
    console.error('Error fetching cases:', error)
    return []
  }

  // Process cases with signed URLs
  const processedCases = await Promise.all(cases.map(async (c) => {
    const signedUrl = c.image_key ? await getSignedImageUrl(c.image_key) : null

    return {
      ...c,
      signedImageUrl: signedUrl
    }
  }))

  return processedCases
})
