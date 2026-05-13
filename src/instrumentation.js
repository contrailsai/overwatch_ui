import { registerOTel } from '@vercel/otel';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { AwsInstrumentation } from '@opentelemetry/instrumentation-aws-sdk';

export function register() {
    // ONLY FOR DEV/DEBUGGING
    if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'development') {
        diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
    }

    // Node server + server actions: traces/metrics export via Vercel OTEL → Grafana (Tempo/Mimir).
    // Browser-only flows (e.g. report export wait) emit via server action flushReportWaitTelemetry
    // (see src/app/(dashboard)/cases/report_wait_telemetry_action.js).
    registerOTel({
        serviceName: 'overwatch-client-app',
        instrumentations: [
            new MongoDBInstrumentation(),
            // Instruments AWS SDK (v2 and v3) including S3, DynamoDB, etc.
            new AwsInstrumentation({
                suppressInternalInstrumentation: true, // Recommended: hides the underlying HTTP fetch spans to keep traces clean
            }),
        ],
    });
}