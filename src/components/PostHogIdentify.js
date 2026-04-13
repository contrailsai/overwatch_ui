'use client'

import { useEffect } from 'react'
import { usePostHog } from 'posthog-js/react'

export function PostHogIdentify({ user, clientDetails, project }) {
    const posthog = usePostHog()

    useEffect(() => {
        if (user && posthog) {
            posthog.identify(user.id, {
                email: user.email,
                name: user.user_metadata?.full_name || user.email,
                role: clientDetails?.permission,
                project_name: project?.project_name,
                client_id: clientDetails?.client_id,
            })
        }
    }, [user, clientDetails, project, posthog])

    return null
}
