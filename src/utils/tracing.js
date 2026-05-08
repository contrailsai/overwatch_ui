import { trace, metrics, SpanStatusCode } from '@opentelemetry/api';

/**
 * Traces an async action function.
 * @param {string} name - Name of the span
 * @param {Function} fn - The async function to trace
 * @returns {Function} - Wrapped function
 */
export function traceAction(name, fn) {
    return async (...args) => {
        const tracer = trace.getTracer('actions-tracer');
        return tracer.startActiveSpan(`action:${name}`, async (span) => {
            const handlerStart = Date.now();
            span.setAttribute('app.span_type', 'server_action');
            span.setAttribute('app.action_name', name);
            try {
                const result = await fn(...args);
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
            } catch (error) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error instanceof Error ? error.message : String(error),
                });
                span.recordException(error instanceof Error ? error : new Error(String(error)));
                throw error;
            } finally {
                const totalHandlerMs = Date.now() - handlerStart;
                span.setAttribute('total_handler_ms', totalHandlerMs);
                console.debug('[traceAction] action completed', {
                    action: name,
                    total_handler_ms: totalHandlerMs,
                });
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
    const tracer = trace.getTracer('actions-tracer');
    return tracer.startActiveSpan(name, async (span) => {
        const spanStart = Date.now();
        try {
            for (const [key, value] of Object.entries(attributes)) {
                span.setAttribute(key, value);
            }
            const result = await fn(span);
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
        } catch (error) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error instanceof Error ? error.message : String(error),
            });
            span.recordException(error instanceof Error ? error : new Error(String(error)));
            throw error;
        } finally {
            span.setAttribute('duration_ms', Date.now() - spanStart);
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
        console.error('Error recording click metric:', e);
    }
}
