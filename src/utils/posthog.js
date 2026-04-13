import { PostHog } from 'posthog-node'

const isProd = process.env.NODE_ENV === 'production'

export const posthogServer = (process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && isProd) 
    ? new PostHog(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.posthog.com',
    })
    : { capture: () => {} }; // Mock if missing or in dev
