'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

function isCollectionsRoute(pathname) {
  if (pathname === '/feeds/collections') return true
  if (pathname.startsWith('/feeds/') && pathname !== '/feeds') return true
  return false
}

export function FeedsSubNav({ feedCount = 0 }) {
  const pathname = usePathname()
  const onTopicMap = pathname === '/feeds'
  const onCollections = isCollectionsRoute(pathname)

  return (
    <nav
      className="shrink-0 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8"
      aria-label="Feeds views"
    >
      <div className="flex gap-1">
        <Link
          href="/feeds"
          className={cn(
            'border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
            onTopicMap
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
          )}
        >
          Topic map
        </Link>
        <Link
          href="/feeds/collections"
          className={cn(
            'border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
            onCollections
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
          )}
        >
          Collections
          {feedCount > 0 && (
            <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
              {feedCount}
            </span>
          )}
        </Link>
      </div>
    </nav>
  )
}
