# Observability: Logs, Traces, and Metrics

This document describes **how observability works today** in `overwatch_client`: what is implemented, where data goes, and how to use or extend each signal.

**Stack (production intent):** OpenTelemetry OTLP → collector at `OTEL_EXPORTER_OTLP_ENDPOINT` → Grafana (**Loki** for logs, **Tempo** for traces, **Mimir/Prometheus** for metrics). Local dev uses the same env vars from `.env.local`.

**Service name:** `overwatch-client-app` (override with `OTEL_SERVICE_NAME`).

---

## Architecture at a glance

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                 │
│  • posthog-js (prod): pageviews, identify, some UI events               │
│  • Google Analytics (NEXT_PUBLIC_GA_ID)                                 │
│  • console.* only — no OTLP from React client components              │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ Server Actions / RSC / Route Handlers
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Next.js Node runtime (instrumentation.js)                             │
│                                                                          │
│  TRACES + METRICS          LOGS (separate SDK path)                      │
│  @vercel/otel              @opentelemetry/sdk-logs + OTLPLogExporter     │
│  • registerOTel()          • LoggerProvider + BatchLogRecordProcessor    │
│  • fetch (default)         • otel-logger.js emit API                     │
│  • MongoDBInstrumentation                                                │
│  • AwsInstrumentation                                                    │
│                                                                          │
│  Application layer:                                                      │
│  • traceAction / runInSpan  → spans + Loki audit logs                    │
│  • logActionError/Warn      → Loki only (swallowed errors)               │
│  • OTEL metrics API         → 2 custom counters (see Metrics)            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ OTLP HTTP (protobuf)
                                ▼
                    Collector (e.g. record-metrics.*)
                    ├─► Tempo   (traces)
                    ├─► Loki    (logs)
                    └─► Mimir   (metrics)
```

**Not instrumented with OTLP:**

| Surface | Reason |
|---------|--------|
| Edge middleware (`src/utils/supabase/middleware.js` via `src/proxy.js`) | `NEXT_RUNTIME === 'edge'` — log SDK skipped in `instrumentation.js` |
| React client components | No browser OTEL exporter; use server actions for Grafana signals |
| `@vercel/analytics` / `@vercel/speed-insights` | Listed in `package.json` but **not mounted** in app layouts today |

---

## Bootstrap and configuration

### Entry point

| File | Role |
|------|------|
| [`src/instrumentation.js`](../src/instrumentation.js) | Next.js `register()` — wires logs then `@vercel/otel` |
| [`src/instrumentation-client.js`](../src/instrumentation-client.js) | Browser: PostHog init only (comments describe server OTLP) |
| [`src/utils/otel-logger.js`](../src/utils/otel-logger.js) | OTLP **logs** API, Loki streams, flush, audit helpers |
| [`src/utils/tracing.js`](../src/utils/tracing.js) | **Traces** + audit logs for server actions / nested spans + one metric |

### Environment variables

Set in `.env.local` (development) and Vercel project settings (production).

| Variable | Required | Purpose |
|----------|----------|---------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Yes (for Grafana) | Base URL for OTLP export (traces; logs use same unless overridden) |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Recommended | e.g. `http/protobuf` |
| `OTEL_EXPORTER_OTLP_HEADERS` | If collector auth | e.g. `Authorization=Basic ...` |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | Optional | Separate logs URL if collector splits signals |
| `OTEL_SERVICE_NAME` | Optional | Resource `service.name` / log attr `service_name` (default `overwatch-client-app`) |
| `OTEL_LOGS_EXPORTER` | Optional | `otlp` (default) or `none` to disable log export |
| `OTEL_BLRP_SCHEDULE_DELAY` | Optional | Log batch delay ms (default `100`) |
| `OTEL_ACTION_AUDIT_LOGS` | Optional | Set `0` to disable per-action success audit logs |
| `OTEL_FLUSH_ACTION_AUDIT` | Optional | Set `1` to force-flush success audits in production |
| `NEXT_PUBLIC_OTEL_LOGS_VERBOSE` | Optional | `1` = extra timing/detail OTLP logs (e.g. Mongo ms breakdown) |
| `NEXT_PUBLIC_REPORT_WAIT_TELEMETRY` | Optional | `1` = report-wait telemetry in dev (prod always on) |
| `NEXT_PUBLIC_ENVIRONMENT` | Optional | `development` enables OTEL diag console in `instrumentation.js` |

**Disable logs only:** `OTEL_LOGS_EXPORTER=none` (traces/metrics from `@vercel/otel` can still run).

---

## Logs (Loki)

### Status: **Implemented (server-side OTLP)**

Logs are **application-emitted OTLP log records**, not Vercel Log Drains and **not** `console.*` automatically forwarded to Loki.

| Mechanism | Backend | Notes |
|-----------|---------|--------|
| Custom `LoggerProvider` | Loki via collector | Registered before `@vercel/otel` in `instrumentation.js` |
| `otel-logger.js` | Same | All app log lines go through `logs.getLogger('overwatch-client')` |
| `console.info/debug/warn/error` | Vercel / terminal only | Overlapping messages in dev; **not** structured Loki unless you also call otel APIs |

### Log categories

| Category | Trigger | Key attributes | Flush |
|----------|---------|----------------|-------|
| **Action audit (success)** | Every `traceAction` / `runInSpan` success | `log_kind=action_audit`, `outcome=success`, `app_action`, `loki_stream`, `duration_ms` | Dev by default; prod batched unless `OTEL_FLUSH_ACTION_AUDIT=1` |
| **Action audit (thrown error)** | `traceAction` / `runInSpan` catch | `outcome=error`, `error_message`, `trace_id`, `span_id` | Always `flushOtelLogs()` |
| **Swallowed error** | `logActionError()` in `catch` returning data | `loki_stream`, `app_action`, error fields | Default `flush: true` |
| **Warning** | `logActionWarn()` | Same shape, WARN severity | Default `flush: true` |
| **Verbose timing** | `isOtelLogsVerbose()` | e.g. `log_kind=timing`, Mongo ms | Manual flush where implemented |
| **Auth / routes** | `auth/callback` route, login | `loki_stream=auth` | Explicit flush on route |
| **Report wait** | `flushReportWaitTelemetry` | `telemetry_kind=report_wait_telemetry` | Always flush |

### `loki_stream` facets

Defined in `LOKI_STREAMS` (`otel-logger.js`): `cases`, `review_cases`, `review_profiles`, `profiles`, `takedowns`, `reports`, `upload`, `configurations`, `admin`, `dashboard`, `auth`, `shared`.

- Pass explicitly: `traceAction('name', fn, { loki_stream: LOKI_STREAMS.cases })`
- Or rely on `inferLokiStream(actionName)` (prefixes like `configurations.*`, `admin.*`, `getPosts_review`, etc.)

### Implementation patterns

**1. Wrapped server actions (preferred — ~80+ exports)**

```javascript
export const getPosts = traceAction('getPosts', async () => {
  // ...
}, { loki_stream: LOKI_STREAMS.cases })
```

On success → automatic `getPosts completed` log. On throw → automatic error log + span error.

**2. Swallowed errors (required manual log)**

```javascript
} catch (e) {
  logActionError({
    loki_stream: LOKI_STREAMS.cases,
    app_action: 'getPosts',
    message: 'cases.getPosts failed',
  }, e)
  return { posts: [], totalCount: 0 }
}
```

**3. Direct emit**

```javascript
otelLogger.info('custom event', { loki_stream: LOKI_STREAMS.shared, ... })
await flushOtelLogs() // if you need immediate export on serverless
```

### Dev terminal echo

When `NODE_ENV=development` and OTLP logs are enabled, each `otelLog` also prints:

```text
[otel:INFO] getPosts completed { app_action, loki_stream, ... }
```

Plus `[traceAction] completed` from `tracing.js`.

### LogQL examples

```logql
{service_name="overwatch-client-app"} | json | log_kind="action_audit" | outcome="success"
```

```logql
{service_name="overwatch-client-app"} | json | loki_stream="cases" | outcome="error"
```

```logql
{service_name="overwatch-client-app"} | json | app_action="getDashboardData"
```

Correlate with traces when `trace_id` / `span_id` are present on the log line.

### Coverage gaps (logs)

| Area | Logging today |
|------|----------------|
| Server actions using `traceAction` | Audit success + thrown errors |
| `updateLabels`, `login` | Wrapped in `traceAction` |
| `getOrCreateDocxReportJob` | Delegates to traced `getOrCreateReportJob` |
| `utils/supabase/metrics.js` | `logActionError` / `logActionWarn` on failures only |
| `utils/mongodb/client.js`, `s3`, `sqs`, `email`, `slack` | Errors/warnings at util layer |
| Edge middleware | `console.*` only |
| Internal `getAuthContext` | Warn on bad tenant; `console.debug` timing |

---

## Traces (Tempo)

### Status: **Implemented (server-side via `@vercel/otel`)**

Traces are created by the OpenTelemetry SDK registered in `instrumentation.js` through [`@vercel/otel`](https://www.npmjs.com/package/@vercel/otel) `registerOTel()`.

| Source | Span names / notes |
|--------|-------------------|
| **Automatic** | `fetch` (default `@vercel/otel` instrumentation) |
| **Automatic** | MongoDB driver spans (`MongoDBInstrumentation`) |
| **Automatic** | AWS SDK spans (`AwsInstrumentation`, internal suppressed) |
| **Application: `traceAction`** | `action:{name}` — e.g. `action:getPosts` |
| **Application: `runInSpan`** | Custom — e.g. `cases.getPosts.s3_signing`, `auth_context.supabase_tenant_lookup`, `rsc.cases_page.cases_query` |
| **Report telemetry** | `telemetry.report_wait.flush` |

### Common span attributes

| Attribute | Set on |
|-----------|--------|
| `app.span_type` | `server_action`, `nested_span`, `rsc_fetch`, `mongo_query`, `auth_context`, etc. |
| `app.action_name` | `traceAction` wrapper |
| `loki_stream` | Actions and nested spans |
| `total_handler_ms` / `duration_ms` | Action / nested span duration |
| `report_wait.*` | Report wait telemetry span |

### Implementation patterns

```javascript
// Server action boundary
export const getTakedowns = traceAction('getTakedowns_list', async (filters) => {
  return runInSpan('takedowns.mongo_query', async (span) => {
    span.setAttribute('app.span_type', 'mongo_query')
    // ...
  }, { loki_stream: LOKI_STREAMS.takedowns })
})
```

```javascript
// RSC page (no traceAction on the page itself)
const data = await runInSpan(
  'rsc.cases_page.cases_query',
  () => getPosts(...),
  { loki_stream: 'cases', 'app.span_type': 'rsc_fetch', 'app.surface': 'rsc' }
)
```

**Next.js navigation:** `redirect()` / `notFound()` are re-thrown without marking the span as failed (`isNextNavigationError` in `tracing.js`).

### Tempo / trace query tips

- Filter by service: `service.name = overwatch-client-app`
- Find slow actions: search `action:getPosts` or attribute `app.action_name`
- Parent/child: RSC `runInSpan` children nest under request spans from Next/`fetch`

### Coverage gaps (traces)

| Area | Traced? |
|------|---------|
| Node server actions (wrapped) | Yes |
| Nested DB/S3/SQS steps using `runInSpan` | Yes (where added) |
| Edge middleware | No OTEL |
| Browser | No OTEL traces |
| Unwrapped server functions | Only auto-instrumentation if they use fetch/Mongo/AWS |

---

## Metrics (Mimir / Prometheus)

### Status: **Partially implemented**

Metrics export is handled by `@vercel/otel` (same OTLP endpoint as traces). The app defines **only two custom instruments**; everything else is whatever the SDK/auto-instrumentation emits (HTTP, Mongo, AWS — depending on collector and instrumentation).

| Metric name | Type | Where | Labels / usage |
|-------------|------|-------|----------------|
| `client_button_clicks` | Counter | `tracing.js` → `recordClickMetric()` | `button`, plus caller attrs; used from cases/takedowns `trackClientClick` |
| `report_wait_session_outcomes_total` | Counter | `features/reports/server/telemetry.js` | `outcome`, `report_format`, `report_type`; incremented when report export wait finishes |

Meter name: `overwatch-client-meter` (`metrics.getMeter(...)`).

### Report wait telemetry (metrics + logs + trace)

Browser wait loop in `wait-for-completion.js` calls server action `flushReportWaitTelemetry`:

- **Trace:** span `telemetry.report_wait.flush` with job/outcome attributes
- **Metric:** `report_wait_session_outcomes_total`
- **Log:** `otelLogger.info('report_wait_telemetry', { loki_stream: reports, ... })`

Enabled when `NODE_ENV === 'production'` or `NEXT_PUBLIC_REPORT_WAIT_TELEMETRY=1`.

### Not implemented as OTEL metrics

| Desired signal | Today |
|----------------|--------|
| Per-action success rate | Use Loki `log_kind=action_audit` or Tempo span counts |
| Dashboard KPIs | Product data in Supabase/Mongo, not OTEL metrics |
| Vercel Analytics / Speed Insights | Packages installed, **not wired in UI** |

---

## Other observability (non-OTLP)

These run **in parallel** with Grafana OTEL; they do not replace Loki/Tempo/Mimir.

| System | Status | Implementation |
|--------|--------|----------------|
| **PostHog (browser)** | Prod only | `instrumentation-client.js`, `PostHogPageView`, `PostHogIdentify` |
| **PostHog (server)** | Prod only | `utils/posthog.js` — `posthogServer.capture` in e.g. `getDashboardData`, reports |
| **Google Analytics** | If `NEXT_PUBLIC_GA_ID` set | `app/layout.js` — `@next/third-parties/google` |
| **Vercel deployment logs** | Always | `console.*` from server/middleware |
| **Slack webhooks** | Operational alerts | `utils/slack.js` on some failures (not structured telemetry) |

---

## Quick reference: which API when

| Goal | API |
|------|-----|
| Trace a server action + audit log success/failure | `traceAction(name, fn, { loki_stream? })` |
| Trace a sub-step (DB, S3, RSC fetch) | `runInSpan(name, fn, { loki_stream?, ...attrs })` |
| Log error but return fallback data | `logActionError({ loki_stream, app_action, message? }, err)` |
| Log warning (no throw) | `logActionWarn({ ... })` |
| Custom log line | `otelLogger.info/warn/error(...)` + optional `flushOtelLogs()` |
| Button click metric | `recordClickMetric(buttonName, attrs)` |
| Disable all OTLP logs | `OTEL_LOGS_EXPORTER=none` |
| Disable success audit only | `OTEL_ACTION_AUDIT_LOGS=0` |
| Extra timing logs | `NEXT_PUBLIC_OTEL_LOGS_VERBOSE=1` |

---

## File map

| Path | Signal |
|------|--------|
| `src/instrumentation.js` | Registers logs + `@vercel/otel` |
| `src/utils/otel-logger.js` | Logs |
| `src/utils/tracing.js` | Traces, audit logs, `client_button_clicks` |
| `src/features/reports/server/telemetry.js` | Report wait: trace + metric + log |
| `src/app/**/actions.js` | `traceAction` + `logActionError` |
| `src/app/**/page.js` | `runInSpan` for RSC fetches |
| `src/app/(auth)/auth/callback/route.js` | Auth route logs |
| `src/utils/auth-context.js` | Auth span + warn logs |
| `src/utils/supabase/middleware.js` | Console only (edge) |
| `docs/observability-logging.md` | Short Loki-focused supplement (links here) |

---

## Operational checklist

1. Confirm `OTEL_EXPORTER_OTLP_*` on Vercel and locally.
2. Restart dev after changing `NEXT_PUBLIC_*` vars.
3. Open a page → terminal should show `[otel:INFO] … completed` per server action.
4. In Loki: `{service_name="overwatch-client-app"} | json | log_kind="action_audit"`.
5. In Tempo: search `service.name` + `action:getPosts`.
6. In Mimir: search `client_button_clicks` or `report_wait_session_outcomes_total`.

---

## Related docs

- [observability-logging.md](./observability-logging.md) — Loki conventions and copy-paste LogQL
- [README.md](../README.md) — high-level stack mention
- OpenTelemetry env spec: https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/
