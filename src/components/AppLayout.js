'use client'

import { usePathname } from 'next/navigation'
import { ClientProvider } from '@/context/ClientContext'
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
        return <ClientProvider>{children}</ClientProvider>
    }

    return (
        <ClientProvider>
            <div className="flex h-full bg-slate-50 overflow-hidden">
                <Sidebar />
                <main className="flex-1 relative overflow-y-auto focus:outline-none">
                    {children}
                </main>
            </div>
        </ClientProvider>
    )
}
