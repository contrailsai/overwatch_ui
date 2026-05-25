import { isReportFailure, isReportSuccess } from '@/features/reports/lib/status'
import { flushReportWaitTelemetry } from '@/features/reports/server/telemetry'
import { getReportJobStatus } from '@/features/reports/server/actions'
import { logActionError, logActionWarn, LOKI_STREAMS } from '@/utils/otel-logger'

const BASE_POLL_MS = 3000
const STALE_MS = 8000
const STALE_WATCHDOG_MS = 2500
const DEADLINE_MS = 5 * 60 * 1000
const MAX_CONSECUTIVE_FETCH_ERRORS = 12

/**
 * Wait for a reports_generation row to reach success.
 * Hybrid: Supabase Realtime + REST polling, with server-action fallback when browser cannot reach Supabase.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} opts
 * @param {string|number} opts.jobId
 * @param {string} opts.channelPrefix
 * @param {(status: string | null | undefined) => void} [opts.onStatus]
 * @param {string} [opts.timeoutMessage]
 * @param {string} [opts.networkErrorMessage]
 * @param {string} [opts.failureMessageFallback]
 * @param {string|null|undefined} [opts.initialStatus]
 * @param {string|null|undefined} [opts.initialS3Path]
 * @param {{ reportFormat?: string, reportType?: string }} [opts.telemetry]
 * @returns {Promise<string>} s3_path
 */
export function waitForReportCompletion(supabase, opts) {
  const {
    jobId,
    channelPrefix,
    onStatus,
    initialStatus,
    initialS3Path,
    timeoutMessage = 'An error occurred while creating the report.',
    networkErrorMessage =
      'Network connection lost or server unreachable. Please check your connection and try again.',
    failureMessageFallback = timeoutMessage,
    telemetry: telemetryOpts,
  } = opts

  const reportFormatGuess = channelPrefix.includes('docx') ? 'docx' : 'pdf'

  return new Promise((resolve, reject) => {
    let isResolved = false
    let pollInterval
    let staleWatchdog
    let deadlineTimer
    let channel
    let retryCount = 0
    let consecutiveErrors = 0
    let consecutiveErrorsMax = 0
    let lastSig = ''
    let lastProgressAt = Date.now()
    let lastUpdateSource = 'http'
    const startedAt = Date.now()

    const stats = {
      job_id: String(jobId),
      report_format: telemetryOpts?.reportFormat ?? reportFormatGuess,
      report_type: telemetryOpts?.reportType ?? 'unknown',
      channel_prefix: channelPrefix,
      http_ok_count: 0,
      http_server_fallback_count: 0,
      realtime_events: 0,
      stale_forced_http: 0,
      last_status_preview: typeof initialStatus === 'string' ? initialStatus.slice(0, 240) : '',
      had_s3_path_last_ok: Boolean(initialS3Path),
    }

    const touchRow = (status, s3Path) => {
      const sig = `${status ?? ''}|${s3Path ?? ''}`
      if (sig !== lastSig) {
        lastSig = sig
        lastProgressAt = Date.now()
      }
    }

    const scheduleFlush = (payload) => {
      void flushReportWaitTelemetry(payload).catch((err) => {
        logActionWarn({
          loki_stream: LOKI_STREAMS.reports,
          app_action: 'waitForReportCompletion',
          message: 'Report wait telemetry flush failed',
          job_id: stats.job_id,
        })
        console.warn('[report_wait] telemetry flush failed', err)
      })
    }

    const buildBasePayload = (partial) => ({
      job_id: stats.job_id,
      report_format: stats.report_format,
      report_type: stats.report_type,
      channel_prefix: stats.channel_prefix,
      duration_ms: Date.now() - startedAt,
      http_ok_count: stats.http_ok_count,
      http_server_fallback_count: stats.http_server_fallback_count,
      realtime_events: stats.realtime_events,
      stale_forced_http: stats.stale_forced_http,
      last_status_preview: stats.last_status_preview,
      had_s3_path_last_ok: stats.had_s3_path_last_ok,
      consecutive_errors_max: consecutiveErrorsMax,
      ...partial,
    })

    const cleanup = () => {
      isResolved = true
      if (pollInterval) clearInterval(pollInterval)
      if (staleWatchdog) clearInterval(staleWatchdog)
      if (deadlineTimer) clearTimeout(deadlineTimer)
      if (channel) supabase.removeChannel(channel)
    }

    const tryFinish = (status, s3Path) => {
      if (isResolved) return false
      if (isReportFailure(status)) {
        cleanup()
        logActionError({
          loki_stream: LOKI_STREAMS.reports,
          app_action: 'waitForReportCompletion',
          message: 'Report generation failed',
          job_id: stats.job_id,
          report_format: stats.report_format,
          report_type: stats.report_type,
          status_preview: String(status ?? '').slice(0, 240),
        })
        scheduleFlush(
          buildBasePayload({
            outcome: 'row_error',
            completion_source: null,
            error_message_preview: String(status ?? failureMessageFallback).slice(0, 240),
            false_negative_candidate: false,
            server_had_success_after_network_abort: null,
          })
        )
        reject(new Error(status || failureMessageFallback))
        return true
      }
      if (isReportSuccess(s3Path, status)) {
        cleanup()
        scheduleFlush(
          buildBasePayload({
            outcome: 'success',
            completion_source: lastUpdateSource,
            error_message_preview: null,
            false_negative_candidate: false,
            server_had_success_after_network_abort: null,
          })
        )
        resolve(s3Path)
        return true
      }
      return false
    }

    const applyRowSnapshot = (data, updateSource) => {
      if (!data) return
      consecutiveErrors = 0
      lastUpdateSource = updateSource
      touchRow(data.status, data.s3_path)
      if (typeof data.status === 'string') {
        stats.last_status_preview = data.status.slice(0, 240)
      }
      stats.had_s3_path_last_ok = Boolean(data.s3_path)
      if (data.status) onStatus?.(data.status)
      tryFinish(data.status, data.s3_path)
    }

    const fetchJobRow = async () => {
      try {
        const { data, error } = await supabase
          .from('reports_generation')
          .select('status, s3_path')
          .eq('id', jobId)
          .single()
        if (error) throw error
        return { data, updateSource: 'http' }
      } catch (clientErr) {
        try {
          const data = await getReportJobStatus(jobId)
          if (data) return { data, updateSource: 'http_server' }
        } catch (serverErr) {
          logActionWarn({
            loki_stream: LOKI_STREAMS.reports,
            app_action: 'waitForReportCompletion',
            message: 'Report job server status fallback failed',
            job_id: String(jobId),
          })
          console.warn('Report job server status fallback failed:', serverErr)
        }
        throw clientErr
      }
    }

    const checkStatus = async (source) => {
      if (isResolved) return
      if (source === 'http_stale') stats.stale_forced_http += 1

      try {
        const { data, updateSource } = await fetchJobRow()
        if (updateSource === 'http') stats.http_ok_count += 1
        else stats.http_server_fallback_count += 1
        if (data) applyRowSnapshot(data, updateSource)
      } catch (err) {
        console.error('Report job HTTP status check failed:', err)
        consecutiveErrors += 1
        consecutiveErrorsMax = Math.max(consecutiveErrorsMax, consecutiveErrors)

        if (consecutiveErrors >= MAX_CONSECUTIVE_FETCH_ERRORS) {
          const recovered = await recoverCompletedJobViaServer(jobId)
          if (recovered) {
            lastUpdateSource = 'http_server_recovery'
            applyRowSnapshot(recovered, 'http_server_recovery')
            return
          }
          cleanup()
          logActionError({
            loki_stream: LOKI_STREAMS.reports,
            app_action: 'waitForReportCompletion',
            message: 'Report job status polling exhausted retries',
            job_id: stats.job_id,
            report_format: stats.report_format,
            report_type: stats.report_type,
            consecutive_errors: consecutiveErrors,
          }, err)
          scheduleFlush(
            buildBasePayload({
              outcome: 'network_error',
              completion_source: null,
              error_message_preview: networkErrorMessage.slice(0, 240),
              false_negative_candidate: false,
              server_had_success_after_network_abort: false,
            })
          )
          reject(new Error(networkErrorMessage))
          return
        }

        if (consecutiveErrors >= 2) {
          onStatus?.(`Network issue, retrying... (${consecutiveErrors}/${MAX_CONSECUTIVE_FETCH_ERRORS})`)
        }
      }
    }

    const subscribeToChannel = () => {
      if (isResolved) return
      channel = supabase
        .channel(`${channelPrefix}-${jobId}-${retryCount}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'reports_generation',
            filter: `id=eq.${jobId}`,
          },
          (payload) => {
            if (isResolved) return
            const newStatus = payload.new.status
            lastUpdateSource = 'realtime'
            stats.realtime_events += 1
            touchRow(newStatus, payload.new.s3_path)
            if (typeof newStatus === 'string') {
              stats.last_status_preview = newStatus.slice(0, 240)
            }
            stats.had_s3_path_last_ok = Boolean(payload.new.s3_path)
            if (newStatus) onStatus?.(newStatus)
            tryFinish(newStatus, payload.new.s3_path)
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            logActionWarn({
              loki_stream: LOKI_STREAMS.reports,
              app_action: 'waitForReportCompletion',
              message: `Report job realtime subscription ${status}`,
              job_id: stats.job_id,
              retry_count: retryCount,
            })
            console.error(`Report job realtime subscription: ${status}, retrying...`)
            if (channel) supabase.removeChannel(channel)
            if (retryCount < 3 && !isResolved) {
              retryCount += 1
              setTimeout(subscribeToChannel, 1000 * retryCount)
            } else if (!isResolved) {
              logActionWarn({
                loki_stream: LOKI_STREAMS.reports,
                app_action: 'waitForReportCompletion',
                message: 'Report job realtime unavailable; relying on HTTP polling',
                job_id: stats.job_id,
              })
              console.warn('Report job realtime unavailable; relying on HTTP polling and watchdog')
            }
          }
        })
    }

    pollInterval = setInterval(() => void checkStatus('http_poll'), BASE_POLL_MS)
    staleWatchdog = setInterval(() => {
      if (isResolved) return
      if (Date.now() - lastProgressAt < STALE_MS) return
      void checkStatus('http_stale')
    }, STALE_WATCHDOG_MS)

    deadlineTimer = setTimeout(() => {
      if (isResolved) return
      void (async () => {
        if (isResolved) return
        const recovered = await recoverCompletedJobViaServer(jobId)
        if (recovered) {
          lastUpdateSource = 'http_server_recovery'
          applyRowSnapshot(recovered, 'http_server_recovery')
          return
        }
        cleanup()
        logActionError({
          loki_stream: LOKI_STREAMS.reports,
          app_action: 'waitForReportCompletion',
          message: 'Report generation deadline exceeded',
          job_id: stats.job_id,
          report_format: stats.report_format,
          report_type: stats.report_type,
          duration_ms: Date.now() - startedAt,
        })
        scheduleFlush(
          buildBasePayload({
            outcome: 'deadline_error',
            completion_source: null,
            error_message_preview: timeoutMessage.slice(0, 240),
            false_negative_candidate: false,
            server_had_success_after_network_abort: false,
          })
        )
        reject(new Error(timeoutMessage))
      })()
    }, DEADLINE_MS)

    touchRow(initialStatus, initialS3Path)
    subscribeToChannel()
    void checkStatus('http_initial')
  })
}

async function recoverCompletedJobViaServer(jobId) {
  try {
    const data = await getReportJobStatus(jobId)
    if (!data || !isReportSuccess(data.s3_path, data.status)) return null
    return data
  } catch {
    return null
  }
}

/** @deprecated Use waitForReportCompletion */
export const waitForReportGenerationRow = waitForReportCompletion
