'use client'

import { useCallback, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Search,
  UserRound,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updatePoiTier } from './actions'

const TIER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'primary', label: 'Primary' },
  { id: 'secondary', label: 'Secondary' },
  { id: 'other', label: 'Other' },
]

const TIER_STYLES = {
  primary: 'bg-slate-900 text-white border-slate-900',
  secondary: 'bg-sky-50 text-sky-800 border-sky-200',
  other: 'bg-slate-100 text-slate-600 border-slate-200',
}

function PoiAvatar({ poi }) {
  const src = poi.image?.signed_url
  const initial = (poi.display_name || '?').charAt(0).toUpperCase()
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="h-12 w-12 rounded-full object-cover border border-slate-200 bg-slate-100"
      />
    )
  }
  return (
    <div className="h-12 w-12 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-semibold text-lg border border-slate-300">
      {initial}
    </div>
  )
}

export function PoisList({ initialData, initialTier, initialSearch, isReviewer }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchInput, setSearchInput] = useState(initialSearch || '')
  const [tierBusyId, setTierBusyId] = useState(null)
  const [optimisticTiers, setOptimisticTiers] = useState({})

  const serverPois = initialData?.pois || []
  const pois = serverPois.map((p) =>
    optimisticTiers[p._id] ? { ...p, tier: optimisticTiers[p._id] } : p
  )
  const tierCounts = initialData?.tierCounts || {
    primary: 0,
    secondary: 0,
    other: 0,
    all: 0,
  }

  const pushParams = useCallback(
    (updates) => {
      const params = new URLSearchParams(searchParams.toString())
      Object.entries(updates).forEach(([key, value]) => {
        if (value == null || value === '' || (key === 'tier' && value === 'all')) {
          params.delete(key)
        } else {
          params.set(key, String(value))
        }
      })
      startTransition(() => {
        setOptimisticTiers({})
        router.push(`${pathname}?${params.toString()}`)
      })
    },
    [pathname, router, searchParams]
  )

  const activeTier = initialTier || 'all'
  const page = initialData?.page || 1
  const totalPages = initialData?.totalPages || 1
  const total = initialData?.total || 0

  const onSearchSubmit = (e) => {
    e.preventDefault()
    pushParams({ search: searchInput.trim(), page: 1 })
  }

  const handleTierChange = async (poiId, tier) => {
    setTierBusyId(poiId)
    setOptimisticTiers((prev) => ({ ...prev, [poiId]: tier }))
    const res = await updatePoiTier(poiId, tier)
    setTierBusyId(null)
    if (!res?.success) {
      setOptimisticTiers((prev) => {
        const next = { ...prev }
        delete next[poiId]
        return next
      })
      return
    }
    router.refresh()
  }

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8 py-3 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex flex-wrap gap-1.5">
            {TIER_TABS.map((tab) => {
              const count = tierCounts[tab.id] ?? 0
              const active = activeTier === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => pushParams({ tier: tab.id, page: 1 })}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
                    active
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  )}
                >
                  {tab.label}
                  <span className={cn('ml-1.5 tabular-nums', active ? 'text-slate-300' : 'text-slate-400')}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          <form onSubmit={onSearchSubmit} className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search POIs…"
              className="w-full h-9 pl-9 pr-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </form>
        </div>
        <p className="text-xs text-slate-500">
          {total.toLocaleString()} POI{total === 1 ? '' : 's'}
          {isPending ? ' · Updating…' : ''}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4">
        {pois.length === 0 ? (
          <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center text-slate-500 gap-2">
            <UserRound className="h-10 w-10 text-slate-300" />
            <p className="font-medium text-slate-700">No POIs in this view</p>
            <p className="text-sm max-w-sm">
              Seed from post review tags with{' '}
              <code className="text-xs bg-slate-100 px-1 rounded">scripts/seed_pois_from_posts.js</code>
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pois.map((poi, idx) => (
              <li
                key={poi._id}
                className="group bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all animate-in fade-in slide-in-from-bottom-1"
                style={{ animationDelay: `${Math.min(idx, 12) * 30}ms` }}
              >
                <div className="flex items-start gap-3">
                  <Link href={`/pois/${poi._id}`} className="shrink-0">
                    <PoiAvatar poi={poi} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/pois/${poi._id}`} className="min-w-0">
                        <h2 className="font-semibold text-slate-900 truncate group-hover:underline">
                          {poi.display_name}
                        </h2>
                        {poi.meta?.title ? (
                          <p className="text-xs text-slate-500 truncate mt-0.5">{poi.meta.title}</p>
                        ) : null}
                      </Link>
                      <Badge
                        variant="outline"
                        className={cn('capitalize shrink-0', TIER_STYLES[poi.tier] || TIER_STYLES.other)}
                      >
                        {poi.tier}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 line-clamp-2 min-h-[2rem]">
                      {poi.summary || 'No summary yet.'}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-600 tabular-nums">
                        {(poi.post_count || 0).toLocaleString()} posts
                      </span>
                      {isReviewer ? (
                        <Select
                          value={poi.tier}
                          disabled={tierBusyId === poi._id}
                          onValueChange={(v) => handleTierChange(poi._id, v)}
                        >
                          <SelectTrigger className="h-8 w-[120px] text-xs">
                            {tierBusyId === poi._id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <SelectValue />
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="primary">Primary</SelectItem>
                            <SelectItem value="secondary">Secondary</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isPending}
            onClick={() => pushParams({ page: page - 1 })}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Prev
          </Button>
          <span className="text-sm text-slate-600 tabular-nums">
            Page {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isPending}
            onClick={() => pushParams({ page: page + 1 })}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      ) : null}
    </div>
  )
}
