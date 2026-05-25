import { trace, metrics, SpanStatusCode } from '@opentelemetry/api';
import {
    flushOtelLogs,
    inferLokiStream,
    logActionSuccess,
    LOKI_STREAMS,
    otelLogger,
    otelLogError,
} from '@/utils/otel-logger';

/** Next.js `redirect()` / `notFound()` — not application failures. */
function isNextNavigationError(error) {
    const digest = error && typeof error === 'object' ? error.digest : undefined;
    return (
        typeof digest === 'string' &&
        (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_NOT_FOUND'))
    );
}

/**
 * Traces an async action function and emits OTLP audit logs on success and failure.
 * @param {string} name - Name of the span / app_action
 * @param {Function} fn - The async function to trace
 * @param {{ loki_stream?: string }} [options] - Loki facet (inferred from name when omitted)
 * @returns {Function} - Wrapped function
 */
export function traceAction(name, fn, options = {}) {
    const loki_stream = options.loki_stream ?? inferLokiStream(name);
    return async (...args) => {
        const tracer = trace.getTracer('actions-tracer');
        return tracer.startActiveSpan(`action:${name}`, async (span) => {
            const handlerStart = Date.now();
            let failed = false;
            span.setAttribute('app.span_type', 'server_action');
            span.setAttribute('app.action_name', name);
            span.setAttribute('loki_stream', loki_stream);
            try {
                const result = await fn(...args);
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
            } catch (error) {
                if (isNextNavigationError(error)) {
                    throw error;
                }
                failed = true;
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error instanceof Error ? error.message : String(error),
                });
                span.recordException(error instanceof Error ? error : new Error(String(error)));
                otelLogError(`server_action:${name} failed`, {
                    loki_stream,
                    app_span_type: 'server_action',
                    app_action: name,
                    log_kind: 'action_audit',
                    outcome: 'error',
                }, error);
                await flushOtelLogs();
                throw error;
            } finally {
                const totalHandlerMs = Date.now() - handlerStart;
                span.setAttribute('total_handler_ms', totalHandlerMs);
                if (!failed) {
                    await logActionSuccess({
                        loki_stream,
                        app_action: name,
                        duration_ms: totalHandlerMs,
                    });
                }
                if (process.env.NODE_ENV === 'development') {
                    console.info('[traceAction]', failed ? 'failed' : 'completed', {
                        action: name,
                        loki_stream,
                        total_handler_ms: totalHandlerMs,
                    });
                }
                span.end();
            }
        });
    };
}

/**
 * Creates a nested span under the current active span.
 * Useful for stage-level visibility (auth lookup, db query, signing, etc.).
 */
export async function runInSpan(name, fn, attributes = {}) {
    const { loki_stream: lokiStreamAttr, ...spanAttributes } = attributes;
    const loki_stream = lokiStreamAttr ?? inferLokiStream(name);
    const tracer = trace.getTracer('actions-tracer');
    return tracer.startActiveSpan(name, async (span) => {
        const spanStart = Date.now();
        let failed = false;
        try {
            for (const [key, value] of Object.entries(spanAttributes)) {
                span.setAttribute(key, value);
            }
            span.setAttribute('loki_stream', loki_stream);
            const result = await fn(span);
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
        } catch (error) {
            if (isNextNavigationError(error)) {
                throw error;
            }
            failed = true;
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error instanceof Error ? error.message : String(error),
            });
            span.recordException(error instanceof Error ? error : new Error(String(error)));
            otelLogError(`span:${name} failed`, {
                loki_stream,
                app_span_type: 'nested_span',
                app_action: name,
                span_name: name,
                log_kind: 'action_audit',
                outcome: 'error',
            }, error);
            await flushOtelLogs();
            throw error;
        } finally {
            const durationMs = Date.now() - spanStart;
            span.setAttribute('duration_ms', durationMs);
            if (!failed) {
                await logActionSuccess({
                    loki_stream,
                    app_action: name,
                    duration_ms: durationMs,
                    app_span_type: spanAttributes['app.span_type'] ?? 'nested_span',
                });
            }
            span.end();
        }
    });
}

const meter = metrics.getMeter('overwatch-client-meter');
const clickCounter = meter.createCounter('client_button_clicks', {
    description: 'Counts the number of times client buttons are clicked',
});

/**
 * Records a client-side button click.
 * @param {string} buttonName - The name of the button clicked.
 * @param {object} attributes - Additional attributes for the metric.
 */
export function recordClickMetric(buttonName, attributes = {}) {
    try {
        clickCounter.add(1, { button: buttonName, ...attributes });
    } catch (e) {
        otelLogger.error('Error recording click metric', {
            loki_stream: LOKI_STREAMS.shared,
            app_span_type: 'client_metric',
            app_action: 'recordClickMetric',
            log_kind: 'action_audit',
            outcome: 'error',
        }, e);
        void flushOtelLogs();
    }
}
