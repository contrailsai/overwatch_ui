import { registerOTel } from '@vercel/otel';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';

export function register() {
    // ONLY FOR DEV/DEBUGGING
    if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'development') {
        diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
    }

    registerOTel({
        serviceName: 'overwatch-client-app',
        instrumentations: [
            new MongoDBInstrumentation(),
        ],
    });
}