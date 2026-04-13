'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'

export function PostHogProvider({ children }) {
    useEffect(() => {
        if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) {
            posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
                api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
                ui_host: 'https://eu.posthog.com',
                person_profiles: 'identified_only',
                capture_pageview: false, // handled by PostHogPageView
                capture_pageleave: true,
            })
        }
    }, [])

    return <PHProvider client={posthog}>{children}</PHProvider>
}
