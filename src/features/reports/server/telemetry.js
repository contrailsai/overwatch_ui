'use server'

import { metrics } from '@opentelemetry/api'
import { runInSpan } from '@/utils/tracing'
import { flushOtelLogs, LOKI_STREAMS, otelLogger } from '@/utils/otel-logger'
import { requireAuthContext } from '@/utils/auth-context'

const meter = metrics.getMeter('overwatch-client-meter')
const reportWaitOutcomeCounter = meter.createCounter('report_wait_session_outcomes_total', {
  description: 'Browser report-generation wait outcomes (hybrid realtime + HTTP poll)',
})

export async function flushReportWaitTelemetry(summary) {
  if (!shouldEmitReportWaitTelemetry()) {
    return { ok: false, skipped: true }
  }

  const ctx = await requireAuthContext()
  const safe = sanitizeSummary(summary)

  return runInSpan('telemetry.report_wait.flush', async (span) => {
    span.setAttribute('app.span_type', 'report_wait_telemetry')
    span.setAttribute('app.user_id', ctx.user.id)
    span.setAttribute('report_wait.job_id', safe.job_id)
    span.setAttribute('report_wait.outcome', safe.outcome)
    span.setAttribute('report_wait.report_format', safe.report_format)
    span.setAttribute('report_wait.report_type', safe.report_type)
    span.setAttribute('report_wait.duration_ms', safe.duration_ms)
    span.setAttribute('report_wait.http_ok_count', safe.http_ok_count)
    span.setAttribute('report_wait.http_server_fallback_count', safe.http_server_fallback_count)
    span.setAttribute('report_wait.realtime_events', safe.realtime_events)
    span.setAttribute('report_wait.stale_forced_http', safe.stale_forced_http)
    if (safe.completion_source) span.setAttribute('report_wait.completion_source', safe.completion_source)
    if (safe.consecutive_errors_max != null) {
      span.setAttribute('report_wait.consecutive_errors_max', safe.consecutive_errors_max)
    }
    if (safe.false_negative_candidate != null) {
      span.setAttribute('report_wait.false_negative_candidate', safe.false_negative_candidate)
    }
    if (safe.server_had_success_after_network_abort != null) {
      span.setAttribute('report_wait.server_had_success_after_network_abort', safe.server_had_success_after_network_abort)
    }

    try {
      reportWaitOutcomeCounter.add(1, {
        outcome: safe.outcome,
        report_format: safe.report_format,
        report_type: safe.report_type,
      })
    } catch {
      // meter may be no-op in some runtimes
    }

    otelLogger.info('report_wait_telemetry', {
      loki_stream: LOKI_STREAMS.reports,
      telemetry_kind: 'report_wait_telemetry',
      app_span_type: 'report_wait_telemetry',
      user_id: ctx.user.id,
      project_name: ctx.clientDetails?.project_name ?? null,
      ...safe,
    })
    await flushOtelLogs()

    return { ok: true }
  })
}

function shouldEmitReportWaitTelemetry() {
  if (process.env.NODE_ENV === 'production') return true
  return process.env.NEXT_PUBLIC_REPORT_WAIT_TELEMETRY === '1'
}

function sanitizeSummary(s) {
  const raw = typeof s === 'object' && s !== null ? s : {}
  const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : v ?? null)

  return {
    job_id: String(raw.job_id ?? ''),
    report_format: clip(String(raw.report_format ?? 'unknown'), 32),
    report_type: clip(String(raw.report_type ?? 'unknown'), 32),
    channel_prefix: clip(String(raw.channel_prefix ?? ''), 64),
    outcome: clip(String(raw.outcome ?? 'unknown'), 48),
    duration_ms: Number.isFinite(Number(raw.duration_ms)) ? Number(raw.duration_ms) : 0,
    http_ok_count: Number(raw.http_ok_count) || 0,
    http_server_fallback_count: Number(raw.http_server_fallback_count) || 0,
    realtime_events: Number(raw.realtime_events) || 0,
    stale_forced_http: Number(raw.stale_forced_http) || 0,
    completion_source: raw.completion_source ? clip(String(raw.completion_source), 24) : null,
    consecutive_errors_max: raw.consecutive_errors_max != null ? Number(raw.consecutive_errors_max) : null,
    last_status_preview: clip(String(raw.last_status_preview ?? ''), 240),
    had_s3_path_last_ok: Boolean(raw.had_s3_path_last_ok),
    error_message_preview: clip(String(raw.error_message_preview ?? ''), 240),
    false_negative_candidate: raw.false_negative_candidate != null ? Boolean(raw.false_negative_candidate) : null,
    server_had_success_after_network_abort:
      raw.server_had_success_after_network_abort != null
        ? Boolean(raw.server_had_success_after_network_abort)
        : null,
  }
}
