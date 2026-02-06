'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'

/**
 * Layout wrapper that conditionally renders the Sidebar based on the current route
 * Sidebar is hidden on login and auth pages
 */
export function AppLayout({ children }) {
    const pathname = usePathname()

    // Don't show sidebar on login or auth pages
    const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/auth')

    if (isAuthPage) {
        return <>{children}</>
    }

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden">
            <Sidebar />
            {children}
        </div>
    )
}
