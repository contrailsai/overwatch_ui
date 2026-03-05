'use client'

import { useEffect } from 'react'

export function GoogleAnalyticsConfig({ userId }) {
    useEffect(() => {
        const gaId = process.env.NEXT_PUBLIC_GA_ID
        if (gaId && userId && window.gtag) {
            window.gtag('config', gaId, {
                'user_id': userId
            });
        }
    }, [userId])

    return null
}
