import { context, trace } from '@opentelemetry/api'
import { logs, SeverityNumber } from '@opentelemetry/api-logs'
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources'

const LOGGER_NAME = 'overwatch-client'
const DEFAULT_SERVICE_NAME = 'overwatch-client-app'
const MAX_ATTR_LEN = 500

/** Service name for OTLP resource + log attributes (Loki label `service_name`). */
export function getOtelServiceName() {
  return process.env.OTEL_SERVICE_NAME?.trim() || DEFAULT_SERVICE_NAME
}

/** Resource for LoggerProvider — required for service.name on OTLP log streams. */
export function buildOtelLogResource() {
  const serviceName = getOtelServiceName()
  const deploymentEnv =
    process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'

  return defaultResource().merge(
    resourceFromAttributes({
      'service.name': serviceName,
      'deployment.environment.name': deploymentEnv,
      ...(process.env.VERCEL_GIT_COMMIT_SHA
        ? { 'vcs.ref.head.revision': process.env.VERCEL_GIT_COMMIT_SHA }
        : {}),
      ...(process.env.VERCEL_URL ? { 'vercel.host': process.env.VERCEL_URL } : {}),
    })
  )
}

function baseLogAttributes() {
  return {
    service_name: getOtelServiceName(),
    deployment_environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  }
}

/** @type {import('@opentelemetry/sdk-logs').LoggerProvider | null} */
let loggerProviderRef = null

export const LOKI_STREAMS = {
  cases: 'cases',
  review_cases: 'review_cases',
  review_profiles: 'review_profiles',
  review_ads: 'review_ads',
  review_ad_profiles: 'review_ad_profiles',
  ad_profiles: 'ad_profiles',
  domains: 'domains',
  review_domains: 'review_domains',
  profiles: 'profiles',
  takedowns: 'takedowns',
  reports: 'reports',
  upload: 'upload',
  configurations: 'configurations',
  admin: 'admin',
  dashboard: 'dashboard',
  auth: 'auth',
  shared: 'shared',
}

export function bindOtelLoggerProvider(provider) {
  loggerProviderRef = provider
}

export function isOtelLogsEnabled() {
  const exporter = process.env.OTEL_LOGS_EXPORTER ?? 'otlp'
  return exporter !== 'none' && exporter.includes('otlp')
}

/** Verbose info/debug OTLP logs (e.g. page load, timing). Off in production by default. */
export function isOtelLogsVerbose() {
  return process.env.NEXT_PUBLIC_OTEL_LOGS_VERBOSE === '1'
}

/** Every server action success/failure audit log (on by default when OTLP logs are enabled). */
export function isOtelActionAuditEnabled() {
  if (!isOtelLogsEnabled()) return false
  return process.env.OTEL_ACTION_AUDIT_LOGS !== '0'
}

function shouldFlushActionAudit() {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.OTEL_FLUSH_ACTION_AUDIT === '1'
  )
}

/**
 * Best-effort Loki stream from traceAction name when call sites omit `loki_stream`.
 * Prefer passing `{ loki_stream }` in traceAction for ambiguous names.
 */
export function inferLokiStream(actionName) {
  const n = String(actionName).toLowerCase()

  if (n.startsWith('configurations.')) return LOKI_STREAMS.configurations
  if (n.startsWith('admin.')) return LOKI_STREAMS.admin
  if (n.startsWith('cases.')) return LOKI_STREAMS.cases
  if (n.startsWith('auth.')) return LOKI_STREAMS.auth
  if (n.includes('upload') || n.includes('requestedlinks') || n.includes('manualreviewer')) {
    return LOKI_STREAMS.upload
  }
  if (n.includes('report') || n.includes('docx')) return LOKI_STREAMS.reports
  if (n.includes('takedown') || n.includes('raisedcount') || n.includes('prioritytakedown')) {
    return LOKI_STREAMS.takedowns
  }
  if (n.includes('adprofile') || n.includes('ad_profile') || (n.includes('ad') && n.includes('profile'))) {
    if (n.includes('review') || n.endsWith('_review')) return LOKI_STREAMS.review_ad_profiles
    return LOKI_STREAMS.ad_profiles
  }
  if (n.includes('domain')) {
    if (n.includes('review')) return LOKI_STREAMS.review_domains
    return LOKI_STREAMS.domains
  }
  if (n.includes('profile') && n.includes('review')) return LOKI_STREAMS.review_profiles
  if (n.includes('ad') && (n.includes('review') || n.includes('getads') || n.includes('updatead'))) {
    return LOKI_STREAMS.review_ads
  }
  if (
    n.endsWith('_review') ||
    n.includes('submitcasereview') ||
    n.includes('caseimage') ||
    n.includes('deletecase') ||
    n.includes('runaianalysis') ||
    n.includes('postvisibility')
  ) {
    return LOKI_STREAMS.review_cases
  }
  if (
    n.includes('getposts') ||
    n.includes('getpost') ||
    n.includes('semanticsearch') ||
    n.includes('similarpost') ||
    n.includes('identicalpost') ||
    n.includes('updateclientstatus') ||
    n.includes('reviewnote') ||
    n.includes('assigncase') ||
    n.includes('bulkassign')
  ) {
    return LOKI_STREAMS.cases
  }
  if (n === 'getdashboarddata' || n === 'getcases' || n === 'getuser') return LOKI_STREAMS.dashboard
  if (
    n.includes('fetch_capacity') ||
    n.includes('fetch_client_activity') ||
    n.includes('create_new_client') ||
    n.includes('delete_client') ||
    n.includes('update_client')
  ) {
    return LOKI_STREAMS.admin
  }
  if (n.includes('profile')) return LOKI_STREAMS.profiles
  if (n.includes('sqs') || n.includes('s3') || n.includes('telemetry')) return LOKI_STREAMS.shared

  return LOKI_STREAMS.shared
}

/**
 * Server action completed successfully (audit trail).
 * @param {{ loki_stream: string, app_action: string, message?: string, duration_ms?: number, flush?: boolean, [key: string]: unknown }} attrs
 */
export function logActionSuccess(attrs) {
  if (!isOtelActionAuditEnabled()) return
  const { loki_stream, app_action, message, duration_ms, flush, ...rest } = attrs
  const body = message ?? `${app_action} completed`
  otelLogger.info(body, {
    loki_stream,
    app_span_type: loki_stream,
    app_action,
    log_kind: 'action_audit',
    outcome: 'success',
    ...(duration_ms != null ? { duration_ms } : {}),
    ...rest,
  })
  if (flush ?? shouldFlushActionAudit()) return flushOtelLogs()
}

function traceContextAttributes() {
  const span = trace.getSpan(context.active())
  if (!span) return {}
  const { traceId, spanId } = span.spanContext()
  if (!traceId) return {}
  return { trace_id: traceId, span_id: spanId }
}

function sanitizeAttributes(attributes) {
  const out = {}
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (value == null) continue
    if (typeof value === 'string') {
      out[key] = value.slice(0, MAX_ATTR_LEN)
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    } else {
      out[key] = String(value).slice(0, MAX_ATTR_LEN)
    }
  }
  return out
}

function echoToDevConsole(severityText, body, attributes) {
  if (process.env.NODE_ENV !== 'development') return
  console.info(`[otel:${severityText}]`, body, attributes)
}

export function otelLog(severityNumber, severityText, body, attributes = {}) {
  if (!isOtelLogsEnabled()) return
  const attrs = sanitizeAttributes({
    ...baseLogAttributes(),
    ...traceContextAttributes(),
    ...attributes,
  })
  try {
    const logger = logs.getLogger(LOGGER_NAME)
    logger.emit({
      severityNumber,
      severityText,
      body: typeof body === 'string' ? body : String(body),
      attributes: attrs,
    })
    echoToDevConsole(severityText, body, attrs)
  } catch {
    // LoggerProvider not registered (edge runtime, local without instrumentation)
  }
}

function applyErrorAttributes(attrs, error) {
  if (error instanceof Error) {
    attrs.error_message = error.message
    attrs.error_name = error.name
    return
  }
  if (error != null && typeof error === 'object') {
    if (error.message != null) attrs.error_message = String(error.message)
    if (error.code != null) attrs.error_code = String(error.code)
    if (error.details != null) attrs.error_details = String(error.details)
    if (error.hint != null) attrs.error_hint = String(error.hint)
    if (attrs.error_message == null) {
      try {
        attrs.error_message = JSON.stringify(error)
      } catch {
        attrs.error_message = String(error)
      }
    }
    return
  }
  if (error != null) {
    attrs.error_message = String(error)
  }
}

export function otelLogError(body, attributes = {}, error) {
  const attrs = { ...attributes }
  applyErrorAttributes(attrs, error)
  otelLog(SeverityNumber.ERROR, 'ERROR', body, attrs)
}

/**
 * Standard error log for server actions / utils (swallowed catch blocks).
 * Flushes to OTLP by default so logs are not lost when a serverless handler returns.
 * Pass `flush: false` only for high-volume errors where batching is acceptable.
 *
 * @param {{ loki_stream: string, app_action?: string, message?: string, flush?: boolean, [key: string]: unknown }} attrs
 */
export function logActionError(attrs, error) {
  const { loki_stream, app_action, message, flush = true, ...rest } = attrs
  const body = message ?? app_action ?? 'action_error'
  otelLogger.error(body, {
    loki_stream,
    app_span_type: loki_stream,
    app_action: app_action ?? null,
    ...rest,
  }, error)
  if (flush) return flushOtelLogs()
}

/**
 * @param {{ loki_stream: string, app_action?: string, message?: string, flush?: boolean, [key: string]: unknown }} attrs
 */
export function logActionWarn(attrs) {
  const { loki_stream, app_action, message, flush = true, ...rest } = attrs
  const body = message ?? app_action ?? 'action_warn'
  otelLogger.warn(body, {
    loki_stream,
    app_span_type: loki_stream,
    app_action: app_action ?? null,
    ...rest,
  })
  if (flush) return flushOtelLogs()
}

export const otelLogger = {
  debug: (body, attributes) => otelLog(SeverityNumber.DEBUG, 'DEBUG', body, attributes),
  info: (body, attributes) => otelLog(SeverityNumber.INFO, 'INFO', body, attributes),
  warn: (body, attributes) => otelLog(SeverityNumber.WARN, 'WARN', body, attributes),
  error: (body, attributes, error) => otelLogError(body, attributes, error),
}

export async function flushOtelLogs() {
  if (!loggerProviderRef) return
  try {
    await loggerProviderRef.forceFlush()
  } catch {
    // ignore flush failures
  }
}
