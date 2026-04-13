import posthog from 'posthog-js'

const isProd = process.env.NODE_ENV === 'production'

if (process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && isProd) {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        defaults: '2026-01-30',
        person_profiles: 'identified_only',
        capture_pageview: true,
    })
}
