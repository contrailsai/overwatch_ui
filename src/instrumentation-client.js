import posthog from 'posthog-js'

/**
 * Browser bundle observability
 *
 * - **PostHog:** product analytics (below).
 * - **Grafana (Tempo / Loki / Mimir):** server-side OpenTelemetry is registered in `src/instrumentation.js`
 *   (Node). Client-only flows (e.g. report export wait) emit telemetry via the server action
 *   `flushReportWaitTelemetry` → span `telemetry.report_wait.flush`, Mimir counter
 *   `report_wait_session_outcomes_total`, and a JSON `console.info` line (`loki_stream: "report_wait_telemetry"`)
 *   for log shipping to Loki.
 * - **Local dev:** set `NEXT_PUBLIC_REPORT_WAIT_TELEMETRY=1` to enable report-wait flushes (off by default
 *   outside production).
 */

const isProd = process.env.NODE_ENV === 'production'

if (process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && isProd) {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        defaults: '2026-01-30',
        person_profiles: 'identified_only',
        capture_pageview: true,
    })
}
