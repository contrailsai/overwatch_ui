'use server'

import { createClient } from '@/utils/supabase/server'
import { traceAction } from '@/utils/tracing'
import { posthogServer } from '@/utils/posthog'
import { getSignedDownloadUrl } from '@/utils/aws/s3'
import { requireAuthContext } from '@/utils/auth-context'

export const getReports = traceAction('getReports', async (filters = {}) => {
  const { user, clientDetails } = await requireAuthContext()
  const supabase = await createClient()
  const projectName = clientDetails.project_name

  posthogServer.capture({
    distinctId: clientDetails.email || user.id,
    event: 'server_action_called',
    properties: {
      action_name: 'getReports',
      project: projectName,
      filters,
    },
  })

  const { from, to, report_type } = filters

  let query = supabase
    .from('reports_generation')
    .select('*')
    .eq('client_id', user.id)
    .eq('project', projectName)
    .order('last_update', { ascending: false })

  if (report_type && report_type !== 'all') {
    query = query.eq('report_type', report_type)
  }

  if (from) {
    query = query.gte('last_update', new Date(from).toISOString())
  }
  
  if (to) {
    const toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)
    query = query.lte('last_update', toDate.toISOString())
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching reports:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    })
    throw new Error(`Failed to fetch reports history: ${error.message}`)
  }

  return data || []
})

export const getReportDownloadUrlAction = traceAction('getReportDownloadUrlAction', async (s3Url, reportType, timestamp) => {
  if (!s3Url) return null

  try {
    const { user, clientDetails } = await requireAuthContext()
    const supabase = await createClient()
    const { data: ownedReport } = await supabase
      .from('reports_generation')
      .select('id')
      .eq('client_id', user.id)
      .eq('project', clientDetails.project_name)
      .eq('s3_path', s3Url)
      .maybeSingle()
    if (!ownedReport) return null

    const url = new URL(s3Url)
    const key = url.pathname.substring(1) // remove leading '/'
    
    const formattedDate = timestamp ? new Date(timestamp).toISOString().split('T')[0] : 'report'
    const fileName = `${reportType || 'Summary'}_Report_${formattedDate}.pdf`

    return await getSignedDownloadUrl(key, fileName)
  } catch (error) {
    console.error("Error generating signed download URL for report:", error)
    return null
  }
})
