import { REPORT_REUSE_MAX_AGE_MS } from '@/features/reports/constants'
import { isReportInFlight, isReportSuccess } from '@/features/reports/lib/status'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'

function isCompletedReportStale(row) {
  const timestamp = row.finish_time ?? row.last_update
  if (!timestamp) return true
  return Date.now() - new Date(timestamp).getTime() > REPORT_REUSE_MAX_AGE_MS
}

/**
 * Latest row for this client + hash; decide reuse vs new insert.
 */
export async function resolveExistingReportJob(supabase, reportHash, clientId) {
  const { data: row, error } = await supabase
    .from('reports_generation')
    .select('*')
    .eq('report_hash', reportHash)
    .eq('client_id', clientId)
    .order('last_update', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.reports,
      app_action: 'resolveExistingReportJob',
      message: 'Failed to resolve existing report job',
    }, error)
    console.error('resolveExistingReportJob:', error)
    return { action: 'create' }
  }
  if (!row) return { action: 'create' }
  if (isReportSuccess(row.s3_path, row.status)) {
    if (isCompletedReportStale(row)) {
      return { action: 'create' }
    }
    return { action: 'reuse_complete', job: row }
  }
  if (isReportInFlight(row)) {
    return { action: 'reuse_inflight', job: row }
  }
  return { action: 'create' }
}
