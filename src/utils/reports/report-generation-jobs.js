import { isReportInFlight, isReportSuccess } from '@/utils/reports/report-generation-status'

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
    console.error('resolveExistingReportJob:', error)
    return { action: 'create' }
  }
  if (!row) return { action: 'create' }
  if (isReportSuccess(row.s3_path, row.status)) {
    return { action: 'reuse_complete', job: row }
  }
  if (isReportInFlight(row)) {
    return { action: 'reuse_inflight', job: row }
  }
  return { action: 'create' }
}
