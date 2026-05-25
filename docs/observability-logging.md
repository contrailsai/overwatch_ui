# Observability logging (Loki quick reference)

Full picture (logs + traces + metrics): **[observability.md](./observability.md)**

## Logs-only summary

- **Export:** OTLP → collector → **Grafana Loki**
- **Code:** [`src/utils/otel-logger.js`](../src/utils/otel-logger.js), wired in [`src/instrumentation.js`](../src/instrumentation.js)
- **Not in Loki:** `console.*` alone, Edge middleware, browser components

## Automatic audit (`traceAction`)

| Outcome | `log_kind` | `outcome` |
|---------|------------|-----------|
| Action OK | `action_audit` | `success` |
| Thrown error | `action_audit` | `error` |
| Swallowed `catch` | — | use `logActionError` |

```logql
{service_name="overwatch-client-app"} | json | log_kind="action_audit" | outcome="success"
```

## Manual errors

```javascript
logActionError({
  loki_stream: LOKI_STREAMS.cases,
  app_action: 'getPosts',
  message: 'cases.getPosts failed',
}, err)
```

## Env toggles

| Variable | Effect |
|----------|--------|
| `OTEL_LOGS_EXPORTER=none` | Disable OTLP logs |
| `OTEL_ACTION_AUDIT_LOGS=0` | No per-action success logs |
| `NEXT_PUBLIC_OTEL_LOGS_VERBOSE=1` | Extra timing/detail logs |

See [observability.md](./observability.md) for traces (Tempo), metrics (Mimir), and full env list.
