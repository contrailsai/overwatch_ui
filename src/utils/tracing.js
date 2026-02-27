import { trace, SpanStatusCode } from '@opentelemetry/api';

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
                span.end();
            }
        });
    };
}
