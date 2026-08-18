'use client'

import * as React from 'react'
import { useState, useEffect, useCallback, useTransition, useMemo } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import {
  Loader2, Filter, ChevronLeft, ChevronRight, Megaphone, ExternalLink, X, Eye, Search,
} from 'lucide-react'
import { Facebook, Instagram } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { DateFilterPopover } from '@/components/DateFilterPopover'
import { cn } from '@/lib/utils'
import { getRiskLabel } from '@/app/(dashboard)/cases/riskBuckets'
import {
  formatDisplayFormat,
  formatAdDate,
  getAdDisplayTitle,
  getAdDisplayPreview,
  getAdImpressions,
} from '@/lib/ads/ad-display'
import ReviewAdForm from './ReviewAdDetails'

const FILTER_LABEL = 'text-[10px] font-bold text-slate-500 uppercase tracking-wide'
const FILTER_TRIGGER =
  'w-full h-8 text-xs bg-slate-50 border-slate-200 hover:border-slate-300 focus:ring-blue-500/20 px-2.5'

function parseFilters(searchParams) {
  const aiAnalyzedRaw = searchParams.get('aiAnalyzed')
  let aiAnalyzed = 'all'
  if (aiAnalyzedRaw === 'analyzed' || aiAnalyzedRaw === 'true') aiAnalyzed = 'analyzed'
  else if (aiAnalyzedRaw === 'not_analyzed') aiAnalyzed = 'not_analyzed'

  return {
    platform: searchParams.get('platform') || 'all',
    status: searchParams.get('status') || 'pending',
    aiAnalyzed,
    visibility_status: searchParams.get('visibility_status') || 'all',
    aiRisk: searchParams.get('aiRisk') || 'all',
    is_active: searchParams.get('is_active') || 'all',
    display_format: searchParams.get('display_format') || 'all',
    sourcingDateStart: searchParams.get('sourcingDateStart') || undefined,
    sourcingDateEnd: searchParams.get('sourcingDateEnd') || undefined,
    startDateStart: searchParams.get('startDateStart') || undefined,
    startDateEnd: searchParams.get('startDateEnd') || undefined,
    search: searchParams.get('search') || '',
  }
}

function FilterField({ label, children, className }) {
  return (
    <div className={cn('space-y-0.5 min-w-0', className)}>
      <Label className={FILTER_LABEL}>{label}</Label>
      {children}
    </div>
  )
}

function PlatformIcon({ platform }) {
  const p = String(platform || '').toLowerCase()
  if (p === 'meta' || p === 'facebook') {
    return <Facebook className="w-3.5 h-3.5 text-blue-600" />
  }
  if (p === 'instagram') {
    return <Instagram className="w-3.5 h-3.5 text-pink-500" />
  }
  return <Megaphone className="w-3.5 h-3.5 text-slate-500" />
}

function getAdListFields(ad) {
  const title = getAdDisplayTitle(ad)
  const preview = getAdDisplayPreview(ad)
  return {
    risk: getRiskLabel(ad.score),
    thumb: ad.signedImageUrl || ad.content?.media?.[0]?.signedUrl,
    title,
    preview: preview && preview !== title ? preview : null,
    formatLabel: formatDisplayFormat(ad.list?.display_format),
    formatRaw: ad.list?.display_format,
    impressions: getAdImpressions(ad),
    sourced: formatAdDate(ad.sourcing_date),
    pageName: ad.page_name || 'Unknown page',
    isActive: Boolean(ad.list?.is_active),
  }
}

function AdThumb({ src, className, iconClassName }) {
  return (
    <div className={cn('bg-slate-100 overflow-hidden shrink-0', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full flex items-center justify-center">
          <Megaphone className={cn('text-slate-300', iconClassName)} />
        </div>
      )}
    </div>
  )
}

function AdMetaBadges({ fields, compact = false }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 flex-wrap text-[11px] text-slate-500',
        compact ? 'mt-2' : 'mt-1.5',
      )}
    >
      <span className={cn('font-medium px-1.5 py-0.5 rounded border', fields.risk.color)}>
        {fields.risk.label}
      </span>
      {fields.formatLabel && (
        <span className="text-slate-500" title={fields.formatRaw}>
          {fields.formatLabel}
        </span>
      )}
      {fields.impressions.text && (
        <span className="inline-flex items-center gap-1 text-slate-600">
          <Eye className="h-3 w-3 text-slate-400" />
          <span className="tabular-nums">{fields.impressions.text}</span>
          {!compact && <span className="text-slate-400">impressions</span>}
        </span>
      )}
      {fields.sourced && (
        <span className={cn('text-slate-400 tabular-nums', compact && 'ml-auto')}>
          {fields.sourced}
        </span>
      )}
    </div>
  )
}

function AdListRow({ ad, isActive, onOpen }) {
  const fields = getAdListFields(ad)

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(ad)}
        className={cn(
          'w-full text-left px-5 py-3.5 flex gap-3.5 transition-colors duration-150',
          isActive
            ? 'bg-blue-50/90 border-l-2 border-l-blue-600'
            : 'hover:bg-slate-50/80 border-l-2 border-l-transparent',
        )}
      >
        <AdThumb
          src={fields.thumb}
          className="h-16 w-16 rounded-xl border border-slate-200/80 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.03)]"
          iconClassName="h-5 w-5"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <PlatformIcon platform={ad.platform} />
            <span className="text-[13px] font-semibold text-slate-900 truncate tracking-tight">
              {fields.pageName}
            </span>
            {fields.isActive && (
              <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                Active
              </span>
            )}
          </div>

          <p className="text-[13px] text-slate-800 font-medium mt-1 line-clamp-1">
            {fields.title}
          </p>
          {fields.preview && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{fields.preview}</p>
          )}

          <AdMetaBadges fields={fields} compact />
        </div>
      </button>
    </li>
  )
}

function AdGridCard({ ad, onOpen }) {
  const fields = getAdListFields(ad)

  return (
    <button
      type="button"
      onClick={() => onOpen(ad)}
      className={cn(
        'group flex flex-col rounded-xl border border-slate-200 bg-white text-left shadow-sm overflow-hidden',
        'transition-all duration-150',
        'hover:border-blue-200 hover:shadow-md hover:ring-1 hover:ring-blue-100',
      )}
    >
      <AdThumb
        src={fields.thumb}
        className="aspect-[4/3] w-full"
        iconClassName="h-8 w-8"
      />

      <div className="p-3.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <PlatformIcon platform={ad.platform} />
          <span className="text-[13px] font-semibold text-slate-900 truncate tracking-tight">
            {fields.pageName}
          </span>
          {fields.isActive && (
            <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
              Active
            </span>
          )}
        </div>

        <p className="text-[13px] text-slate-800 font-medium mt-1.5 line-clamp-2 leading-snug">
          {fields.title}
        </p>
        {fields.preview && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{fields.preview}</p>
        )}

        <AdMetaBadges fields={fields} />
      </div>
    </button>
  )
}

export function ReviewAdsInterface({
  initialAds,
  totalPages,
  currentPage,
  project,
  clientDetails,
  initialFilters,
  totalCount,
  initialAd,
  itemsPerPage = 50,
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [ads, setAds] = useState(initialAds || [])
  const [selectedAd, setSelectedAd] = useState(initialAd || null)
  const [showFilters, setShowFilters] = useState(false)

  const filters = useMemo(
    () => ({ ...initialFilters, ...parseFilters(searchParams) }),
    [initialFilters, searchParams],
  )

  const [searchInput, setSearchInput] = useState(filters.search || '')

  const hasActiveFilters =
    filters.status !== 'pending' ||
    filters.platform !== 'all' ||
    filters.aiAnalyzed !== 'all' ||
    filters.visibility_status !== 'all' ||
    filters.aiRisk !== 'all' ||
    filters.is_active !== 'all' ||
    filters.display_format !== 'all' ||
    Boolean(filters.sourcingDateStart) ||
    Boolean(filters.sourcingDateEnd) ||
    Boolean(filters.startDateStart) ||
    Boolean(filters.startDateEnd) ||
    Boolean(filters.search)

  useEffect(() => {
    setAds(initialAds || [])
  }, [initialAds])

  useEffect(() => {
    if (initialAd) setSelectedAd(initialAd)
  }, [initialAd])

  useEffect(() => {
    setSearchInput(filters.search || '')
  }, [filters.search])

  const updateParams = useCallback(
    (updates, { replace = false } = {}) => {
      const params = new URLSearchParams(searchParams.toString())
      Object.entries(updates).forEach(([key, value]) => {
        if (value == null || value === '' || value === 'all' || value === false) {
          if (key === 'status' && value === 'all') {
            params.set(key, 'all')
          } else if (key === 'status') {
            params.delete(key)
          } else {
            params.delete(key)
          }
        } else {
          params.set(key, String(value))
        }
      })
      const qs = params.toString()
      startTransition(() => {
        const method = replace ? router.replace : router.push
        method(`${pathname}${qs ? `?${qs}` : ''}`)
      })
    },
    [pathname, router, searchParams],
  )

  const clearFilters = () => {
    setSearchInput('')
    updateParams({
      status: 'pending',
      platform: 'all',
      aiAnalyzed: 'all',
      visibility_status: 'all',
      aiRisk: 'all',
      is_active: 'all',
      display_format: 'all',
      sourcingDateStart: null,
      sourcingDateEnd: null,
      startDateStart: null,
      startDateEnd: null,
      search: null,
      page: 1,
    })
  }

  const submitSearch = () => {
    const val = searchInput.trim()
    updateParams({ search: val || null, page: 1 })
  }

  const openAd = (ad) => {
    setSelectedAd(ad)
    updateParams({ ad_id: ad._id }, { replace: true })
  }

  const closeAd = () => {
    setSelectedAd(null)
    updateParams({ ad_id: null }, { replace: true })
  }

  const selectedIndex = selectedAd
    ? ads.findIndex((a) => a._id === selectedAd._id)
    : -1

  const navigateAd = (dir) => {
    if (selectedIndex < 0) return
    const next = ads[selectedIndex + dir]
    if (next) openAd(next)
  }

  const rangeFrom = ads.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1
  const rangeTo = ads.length === 0 ? 0 : rangeFrom + ads.length - 1

  return (
    <div className="flex h-full overflow-hidden bg-[#f4f6f8]">
      {/* List / grid — full width until an ad is selected */}
      <div
        className={cn(
          'flex flex-col border-r border-slate-200/80',
          selectedAd
            ? 'hidden lg:flex lg:w-[min(420px,38%)] xl:w-[440px] shrink-0 bg-white'
            : 'flex w-full bg-white',
        )}
      >
        <div className="shrink-0 border-b border-slate-100 px-5 py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 mr-auto">
              <p className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums tracking-tight leading-none">
                {totalCount.toLocaleString()}
                <span className="ml-2 text-base sm:text-lg font-semibold text-slate-600">
                  {totalCount === 1 ? 'ad' : 'ads'}
                </span>
                {isPending && (
                  <Loader2 className="inline ml-2 h-4 w-4 animate-spin text-slate-400 align-middle" />
                )}
              </p>
            </div>

            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitSearch()
                }}
                placeholder="Search page, copy, or URL"
                className="w-full h-8 bg-slate-50 border border-slate-200 rounded-md pl-8 pr-8 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('')
                    updateParams({ search: null, page: 1 })
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 text-xs text-slate-500 hover:text-slate-800"
                >
                  Clear
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters((v) => !v)}
                className={cn(
                  'gap-1.5 h-8',
                  (showFilters || hasActiveFilters) && 'border-blue-300 bg-blue-50 text-blue-700',
                )}
              >
                <Filter className="h-3.5 w-3.5" />
                Filters
                {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
              </Button>
            </div>
          </div>

          {showFilters && (
            <div
              className={cn(
                'grid gap-x-2.5 gap-y-2.5 pt-1',
                selectedAd
                  ? 'grid-cols-2'
                  : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6',
              )}
            >
              <FilterField label="Review status">
                <Select
                  value={filters.status}
                  onValueChange={(v) => updateParams({ status: v, page: 1 })}
                >
                  <SelectTrigger size="sm" className={FILTER_TRIGGER}>
                    <SelectValue placeholder="Pending review" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending review</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>

              <FilterField label="Platform">
                <Select
                  value={filters.platform}
                  onValueChange={(v) => updateParams({ platform: v, page: 1 })}
                >
                  <SelectTrigger size="sm" className={FILTER_TRIGGER}>
                    <SelectValue placeholder="All platforms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All platforms</SelectItem>
                    <SelectItem value="meta">Meta</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>

              <FilterField label="Delivery">
                <Select
                  value={filters.is_active}
                  onValueChange={(v) => updateParams({ is_active: v, page: 1 })}
                >
                  <SelectTrigger size="sm" className={FILTER_TRIGGER}>
                    <SelectValue placeholder="All delivery" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All delivery</SelectItem>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>

              <FilterField label="Visibility">
                <Select
                  value={filters.visibility_status}
                  onValueChange={(v) => updateParams({ visibility_status: v, page: 1 })}
                >
                  <SelectTrigger size="sm" className={FILTER_TRIGGER}>
                    <SelectValue placeholder="All visibility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All visibility</SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="down">Taken down</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>

              <FilterField label="Format">
                <Select
                  value={filters.display_format}
                  onValueChange={(v) => updateParams({ display_format: v, page: 1 })}
                >
                  <SelectTrigger size="sm" className={FILTER_TRIGGER}>
                    <SelectValue placeholder="All formats" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All formats</SelectItem>
                    <SelectItem value="DPA">Dynamic product ad</SelectItem>
                    <SelectItem value="CAROUSEL">Carousel</SelectItem>
                    <SelectItem value="IMAGE">Image</SelectItem>
                    <SelectItem value="VIDEO">Video</SelectItem>
                    <SelectItem value="MULTI_IMAGES">Multi image</SelectItem>
                    <SelectItem value="MULTI_VIDEOS">Multi video</SelectItem>
                    <SelectItem value="SLIDESHOW">Slideshow</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>

              <FilterField label="AI analysis">
                <Select
                  value={filters.aiAnalyzed}
                  onValueChange={(v) => updateParams({ aiAnalyzed: v, page: 1 })}
                >
                  <SelectTrigger size="sm" className={FILTER_TRIGGER}>
                    <SelectValue placeholder="All AI" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All AI</SelectItem>
                    <SelectItem value="analyzed">Analyzed</SelectItem>
                    <SelectItem value="not_analyzed">Not analyzed</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>

              <FilterField label="Threat risk">
                <Select
                  value={filters.aiRisk}
                  onValueChange={(v) => updateParams({ aiRisk: v, page: 1 })}
                >
                  <SelectTrigger size="sm" className={FILTER_TRIGGER}>
                    <SelectValue placeholder="All risk" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All risk</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="safe">Safe</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>

              <FilterField label="Sourced date">
                <DateFilterPopover
                  title="Sourced date"
                  triggerClassName="h-8 w-full bg-slate-50 border-slate-200 hover:bg-slate-50 px-2.5"
                  initialFrom={filters.sourcingDateStart}
                  initialTo={filters.sourcingDateEnd}
                  onApply={(range) =>
                    updateParams({
                      sourcingDateStart: range?.from
                        ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX")
                        : null,
                      sourcingDateEnd: range?.to
                        ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX")
                        : null,
                      page: 1,
                    })
                  }
                />
              </FilterField>

              <FilterField label="Start date">
                <DateFilterPopover
                  title="Ad start date"
                  triggerClassName="h-8 w-full bg-slate-50 border-slate-200 hover:bg-slate-50 px-2.5"
                  initialFrom={filters.startDateStart}
                  initialTo={filters.startDateEnd}
                  onApply={(range) =>
                    updateParams({
                      startDateStart: range?.from
                        ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX")
                        : null,
                      startDateEnd: range?.to
                        ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX")
                        : null,
                      page: 1,
                    })
                  }
                />
              </FilterField>
            </div>
          )}
        </div>

        <div className={cn('flex-1 overflow-y-auto', !selectedAd && ads.length > 0 && 'bg-slate-50')}>
          {ads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-10 text-slate-500">
              <div className="h-14 w-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-4">
                <Megaphone className="h-6 w-6 text-slate-300" />
              </div>
              <p className="font-medium text-slate-800">No ads found</p>
              <p className="text-sm mt-1 max-w-xs text-slate-500">
                {filters.search
                  ? 'No ads match this search. Try a different page name, copy, or URL.'
                  : 'Adjust filters or wait for ingest to write Ads documents.'}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-blue-600 hover:underline text-sm mt-3 font-medium"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : selectedAd ? (
            <ul className="divide-y divide-slate-100">
              {ads.map((ad) => (
                <AdListRow
                  key={ad._id}
                  ad={ad}
                  isActive={selectedAd._id === ad._id}
                  onOpen={openAd}
                />
              ))}
            </ul>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-5">
              {ads.map((ad) => (
                <AdGridCard key={ad._id} ad={ad} onOpen={openAd} />
              ))}
            </div>
          )}
        </div>

        {ads.length > 0 && (
          <div className="shrink-0 border-t border-slate-100 px-4 py-2 flex items-center justify-between bg-white">
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage <= 1 || isPending}
              onClick={() => updateParams({ page: currentPage - 1 })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-slate-500 tabular-nums text-center">
              Showing {rangeFrom.toLocaleString()}–{rangeTo.toLocaleString()} of {totalCount.toLocaleString()}
              {totalPages > 1 && (
                <span className="text-slate-400">
                  {' · '}Page {currentPage} / {totalPages}
                </span>
              )}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage >= totalPages || isPending}
              onClick={() => updateParams({ page: currentPage + 1 })}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Detail only after selection — no empty placeholder pane */}
      {selectedAd && (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#f4f6f8] animate-in fade-in duration-200">
          <div className="lg:hidden shrink-0 flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200">
            <Button variant="ghost" size="sm" onClick={closeAd}>
              <X className="h-4 w-4 mr-1" /> Back
            </Button>
            {selectedAd.original_url && (
              <a
                href={selectedAd.original_url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-xs text-blue-600 flex items-center gap-1"
              >
                Ads Library <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <ReviewAdForm
            ad={selectedAd}
            project={project}
            clientDetails={clientDetails}
            onClose={closeAd}
            onNavigate={navigateAd}
            hasPrev={selectedIndex > 0}
            hasNext={selectedIndex >= 0 && selectedIndex < ads.length - 1}
            setAds={setAds}
            setSelectedAd={setSelectedAd}
          />
        </div>
      )}
    </div>
  )
}
