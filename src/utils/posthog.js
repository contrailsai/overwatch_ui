import { PostHog } from 'posthog-node'

export const posthogServer = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN 
    ? new PostHog(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.posthog.com',
    })
    : { capture: () => {} }; // Mock if missing
