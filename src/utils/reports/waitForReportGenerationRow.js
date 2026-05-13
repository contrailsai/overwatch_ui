import { isReportFailure, isReportSuccess } from '@/utils/reports/report-generation-status'
import { flushReportWaitTelemetry } from '@/app/(dashboard)/cases/report_wait_telemetry_action'

/** Baseline REST poll when realtime may be working */
const BASE_POLL_MS = 3000
/** If neither realtime nor HTTP surfaced a *changed* row snapshot in this long, force extra HTTP reads */
const STALE_MS = 8000
/** How often to run a forced HTTP read while "stale" (subscription silent / missed events) */
const STALE_WATCHDOG_MS = 2500
/** Total wait before giving up (Lambda hung) */
const DEADLINE_MS = 5 * 60 * 1000
/** Transient REST failures before giving up (flaky mobile / tab sleep) */
const MAX_CONSECUTIVE_FETCH_ERRORS = 12

/**
 * Hybrid wait: Supabase Realtime primary + periodic REST `.select()` as source of truth.
 * If progress appears stuck (same row snapshot), a watchdog triggers extra HTTP reads so a
 * completed row is still picked up when the channel never delivers `postgres_changes`.
 *
 * Telemetry: end-of-session summary is sent via {@link flushReportWaitTelemetry} (server OTEL span
 * + JSON log line for Loki + Mimir counter) when `telemetry` is provided or inferable from `channelPrefix`.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} opts
 * @param {string|number} opts.jobId
 * @param {string} opts.channelPrefix - e.g. `report` or `docx-report` (unique per job in channel name)
 * @param {(status: string | null | undefined) => void} [opts.onStatus]
 * @param {string} [opts.timeoutMessage]
 * @param {string} [opts.networkErrorMessage]
 * @param {string} [opts.failureMessageFallback] - when row status is missing on failure
 * @param {string|null|undefined} [opts.initialStatus] - seed snapshot so stale watchdog matches server state
 * @param {string|null|undefined} [opts.initialS3Path]
 * @param {{ reportFormat?: string, reportType?: string }} [opts.telemetry] - forwarded to server flush (Grafana)
 * @returns {Promise<string>} s3_path when successful
 */
export function waitForReportGenerationRow(supabase, opts) {
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

    const checkStatus = async (source) => {
      if (isResolved) return
      if (source === 'http_stale') {
        stats.stale_forced_http += 1
      }
      try {
        const { data, error } = await supabase
          .from('reports_generation')
          .select('status, s3_path')
          .eq('id', jobId)
          .single()

        if (error) throw error

        consecutiveErrors = 0
        lastUpdateSource = 'http'
        stats.http_ok_count += 1

        if (data) {
          touchRow(data.status, data.s3_path)
          if (typeof data.status === 'string') {
            stats.last_status_preview = data.status.slice(0, 240)
          }
          stats.had_s3_path_last_ok = Boolean(data.s3_path)
          if (data.status) onStatus?.(data.status)
          tryFinish(data.status, data.s3_path)
        }
      } catch (err) {
        console.error('Report job HTTP status check failed:', err)
        consecutiveErrors += 1
        consecutiveErrorsMax = Math.max(consecutiveErrorsMax, consecutiveErrors)
        if (consecutiveErrors >= MAX_CONSECUTIVE_FETCH_ERRORS) {
          cleanup()
          const serverSuccess = await verifyServerRowAfterNetworkFailure(supabase, jobId)
          scheduleFlush(
            buildBasePayload({
              outcome: 'network_error',
              completion_source: null,
              error_message_preview: networkErrorMessage.slice(0, 240),
              false_negative_candidate: Boolean(serverSuccess),
              server_had_success_after_network_abort: Boolean(serverSuccess),
            })
          )
          reject(new Error(networkErrorMessage))
          return
        } else if (consecutiveErrors >= 2) {
          onStatus?.(
            `Network issue, retrying... (${consecutiveErrors}/${MAX_CONSECUTIVE_FETCH_ERRORS})`
          )
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
            console.error(`Report job realtime subscription: ${status}, retrying...`)
            if (channel) supabase.removeChannel(channel)
            if (retryCount < 3 && !isResolved) {
              retryCount += 1
              setTimeout(subscribeToChannel, 1000 * retryCount)
            } else if (!isResolved) {
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
        cleanup()
        const serverSuccess = await verifyServerRowAfterNetworkFailure(supabase, jobId)
        scheduleFlush(
          buildBasePayload({
            outcome: 'deadline_error',
            completion_source: null,
            error_message_preview: timeoutMessage.slice(0, 240),
            false_negative_candidate: Boolean(serverSuccess),
            server_had_success_after_network_abort: Boolean(serverSuccess),
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

/**
 * After repeated HTTP failures, one last read to detect "client gave up but row is already complete"
 * (feeds `false_negative_candidate` / `server_had_success_after_network_abort` in Loki + span attrs).
 */
async function verifyServerRowAfterNetworkFailure(supabase, jobId) {
  try {
    const { data, error } = await supabase
      .from('reports_generation')
      .select('status, s3_path')
      .eq('id', jobId)
      .single()
    if (error || !data) return false
    return isReportSuccess(data.s3_path, data.status)
  } catch {
    return false
  }
}
