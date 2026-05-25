import { registerOTel } from '@vercel/otel';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { AwsInstrumentation } from '@opentelemetry/instrumentation-aws-sdk';
import {
    bindOtelLoggerProvider,
    buildOtelLogResource,
    getOtelServiceName,
    isOtelLogsEnabled,
} from '@/utils/otel-logger';

function registerOtelLogs() {
    if (process.env.NEXT_RUNTIME === 'edge') return;
    if (!isOtelLogsEnabled()) return;

    const exporter = new OTLPLogExporter();
    const provider = new LoggerProvider({
        resource: buildOtelLogResource(),
        processors: [
            new BatchLogRecordProcessor(exporter, {
                // Keep batch small; logActionError also forceFlush() on each error.
                scheduledDelayMillis: Number(process.env.OTEL_BLRP_SCHEDULE_DELAY) || 100,
            }),
        ],
    });

    logs.setGlobalLoggerProvider(provider);
    bindOtelLoggerProvider(provider);
}

export function register() {
    // ONLY FOR DEV/DEBUGGING
    if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'development') {
        diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
    }

    registerOtelLogs();

    // Node server + server actions: traces/metrics/logs → OTLP collector (Tempo/Mimir/Loki).
    registerOTel({
        serviceName: getOtelServiceName(),
        instrumentations: [
            new MongoDBInstrumentation(),
            new AwsInstrumentation({
                suppressInternalInstrumentation: true,
            }),
        ],
    });
}
