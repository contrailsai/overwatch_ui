'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'

export default function SafeDate({ date, formatStr = null, className = "" }) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        // Return a fixed format or a placeholder that won't change between server and client
        // Since we can't reliably predict the server's locale-based output, 
        // we return a placeholder during SSR.
        return <span className={className}>...</span>
    }

    const d = new Date(date)
    if (isNaN(d.getTime())) return <span className={className}>N/A</span>

    if (formatStr) {
        try {
            return <span className={className}>{format(d, formatStr)}</span>
        } catch (e) {
            console.error("SafeDate format error:", e)
            return <span className={className}>{d.toLocaleDateString()}</span>
        }
    }

    return <span className={className}>{d.toLocaleDateString()}</span>
}
