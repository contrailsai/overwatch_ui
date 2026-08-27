'use client'

import * as React from 'react'
import { useState, useEffect, useCallback, useTransition, useMemo } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import {
  Loader2, Filter, ChevronLeft, ChevronRight, Megaphone, ExternalLink, X, Eye, Search,
  Siren, TriangleAlert, TrendingDown, Smile, ArrowUpDown, ArrowUp, ArrowDown, ArrowRight,
  ClockFading, CheckCircle,
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
  getAdListThumb,
} from '@/lib/ads/ad-display'
import { AdMediaThumb } from '@/components/ads/AdMediaThumb'
import { AdAdvertiserAvatar } from '@/components/ads/AdAdvertiserAvatar'
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
  const thumb = getAdListThumb(ad)
  const reviewStatus = ad.workflow?.review_status || ad.list?.review_status || 'pending'
  return {
    risk: getRiskLabel(ad.score),
    thumb,
    title,
    preview: preview && preview !== title ? preview : null,
    formatLabel: formatDisplayFormat(ad.list?.display_format),
    formatRaw: ad.list?.display_format,
    impressions: getAdImpressions(ad),
    sourced: formatAdDate(ad.sourcing_date),
    startDate: formatAdDate(ad.start_date || ad.posted_date || ad.list?.start_date),
    pageName: ad.page_name || 'Unknown page',
    avatarSrc: ad.advertiser_snapshot?.signed_profile_pic || null,
    isActive: Boolean(ad.list?.is_active),
    reviewStatus,
    reviewLabel: reviewStatus === 'reviewed' ? 'Reviewed' : 'Pending',
  }
}

function RiskCell({ risk }) {
  return (
    <div className={cn('flex flex-col items-center justify-center p-1.5 rounded-lg text-[10px] font-black tracking-wide border shadow-sm mx-auto w-12', risk.color)}>
      {risk.label === 'High' ? (
        <Siren className="w-4 h-4 mb-1" />
      ) : risk.label === 'Medium' ? (
        <TriangleAlert className="w-4 h-4 mb-1" />
      ) : risk.label === 'Low' ? (
        <TrendingDown className="w-4 h-4 mb-1" />
      ) : (
        <Smile className="w-4 h-4 mb-1" />
      )}
      <span className="uppercase text-[8px] leading-none">{risk.label}</span>
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
        <AdMediaThumb
          kind={fields.thumb.kind}
          src={fields.thumb.url}
          className="h-16 w-16 rounded-xl border border-slate-200/80 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.03)]"
          iconClassName="h-5 w-5"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <AdAdvertiserAvatar
              src={fields.avatarSrc}
              name={fields.pageName}
              className="h-5 w-5 rounded-md"
              iconClassName="h-3 w-3"
            />
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

function AdMobileCard({ ad, onOpen }) {
  const fields = getAdListFields(ad)

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(ad)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(ad)
        }
      }}
      className="flex gap-3 p-3 bg-white border-b border-slate-100 cursor-pointer"
    >
      <AdMediaThumb
        kind={fields.thumb.kind}
        src={fields.thumb.url}
        className="h-14 w-14 rounded-lg border border-slate-200/80 shrink-0"
        iconClassName="h-4 w-4"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <AdAdvertiserAvatar
            src={fields.avatarSrc}
            name={fields.pageName}
            className="h-5 w-5 rounded-md"
            iconClassName="h-3 w-3"
          />
          <PlatformIcon platform={ad.platform} />
          <span className="text-[13px] font-semibold text-slate-900 truncate tracking-tight">
            {fields.pageName}
          </span>
          <ArrowRight className="ml-auto h-4 w-4 text-slate-300 shrink-0" />
        </div>
        <p className="text-[12px] text-slate-800 font-medium mt-0.5 line-clamp-2">{fields.title}</p>
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[10px]">
          <span className={cn('font-medium px-1.5 py-0.5 rounded border', fields.risk.color)}>
            {fields.risk.label}
          </span>
          <span className={cn(
            'font-medium px-1.5 py-0.5 rounded border',
            fields.reviewStatus === 'reviewed'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-slate-100 text-slate-700 border-slate-200',
          )}>
            {fields.reviewLabel}
          </span>
          {fields.sourced && (
            <span className="text-slate-400 tabular-nums ml-auto">{fields.sourced}</span>
          )}
        </div>
      </div>
    </article>
  )
}

function AdTableRow({ ad, onOpen }) {
  const fields = getAdListFields(ad)
  const ReviewIcon = fields.reviewStatus === 'reviewed' ? CheckCircle : ClockFading

  return (
    <tr onClick={() => onOpen(ad)} className="transition-all cursor-pointer group hover:bg-slate-50">
      <td className="px-2 sm:px-3 whitespace-nowrap align-middle hidden sm:table-cell border-b border-slate-50">
        <RiskCell risk={fields.risk} />
      </td>
      <td className="px-2 sm:px-3 whitespace-nowrap align-middle hidden md:table-cell text-center border-b border-slate-50">
        <div
          className={cn(
            'inline-flex items-center justify-center w-8 h-8 rounded-full border shadow-sm mx-auto',
            fields.reviewStatus === 'reviewed'
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : 'text-slate-700 bg-slate-100 border-slate-200',
          )}
          title={fields.reviewLabel}
        >
          <ReviewIcon className="w-4 h-4" />
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2.5 align-middle border-b border-slate-50 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <AdMediaThumb
            kind={fields.thumb.kind}
            src={fields.thumb.url}
            className="h-12 w-12 rounded-lg border border-slate-200/80 shrink-0"
            iconClassName="h-4 w-4"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <AdAdvertiserAvatar
                src={fields.avatarSrc}
                name={fields.pageName}
                className="h-5 w-5 rounded-md shrink-0"
                iconClassName="h-3 w-3"
              />
              <span className="text-[13px] font-semibold text-slate-900 truncate">{fields.pageName}</span>
            </div>
            <p className="text-[12px] text-slate-700 mt-0.5 line-clamp-1">{fields.title}</p>
          </div>
        </div>
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap align-middle hidden lg:table-cell border-b border-slate-50 text-center">
        <span className="inline-flex justify-center"><PlatformIcon platform={ad.platform} /></span>
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap align-middle hidden lg:table-cell border-b border-slate-50">
        <span className="text-[11px] text-slate-600 truncate block max-w-[7rem]" title={fields.formatRaw}>
          {fields.formatLabel || '—'}
        </span>
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap align-middle hidden xl:table-cell border-b border-slate-50">
        <span
          className={cn(
            'text-[10px] font-medium px-1.5 py-0.5 rounded border',
            fields.isActive
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-slate-100 text-slate-600 border-slate-200',
          )}
        >
          {fields.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap align-middle hidden xl:table-cell border-b border-slate-50">
        {fields.impressions.text ? (
          <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-600 tabular-nums">
            <Eye className="h-3 w-3 text-slate-400" />
            {fields.impressions.text}
          </span>
        ) : (
          <span className="text-[11px] text-slate-300">—</span>
        )}
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap align-middle hidden lg:table-cell border-b border-slate-50">
        <span className="text-[11px] text-slate-600 tabular-nums">{fields.sourced || '—'}</span>
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap align-middle hidden xl:table-cell border-b border-slate-50">
        <span className="text-[11px] text-slate-600 tabular-nums">{fields.startDate || '—'}</span>
      </td>
      <td className="px-2 sm:px-4 py-2.5 whitespace-nowrap align-middle border-b border-slate-50 text-right">
        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 inline-block" />
      </td>
    </tr>
  )
}

export function ReviewAdsInterface({
  initialAds,
  totalPages,
  currentPage,
  project,
  clientDetails,
  initialFilters,
  initialSort = { field: 'sourced_at', direction: 'desc' },
  totalCount,
  initialAd,
  itemsPerPage = 25,
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

  const handleSortChange = (field) => {
    const direction = (initialSort.field === field && initialSort.direction === 'desc') ? 'asc' : 'desc'
    updateParams({
      sortField: field,
      sortDirection: direction,
      page: 1,
    })
  }

  const SortIcon = ({ field }) => {
    if (initialSort.field !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 ml-1.5" />
    if (initialSort.direction === 'asc') return <ArrowUp className="w-3.5 h-3.5 text-blue-600 ml-1.5" />
    return <ArrowDown className="w-3.5 h-3.5 text-blue-600 ml-1.5" />
  }

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

        <div className={cn('flex-1 overflow-y-auto', !selectedAd && ads.length > 0 && 'bg-white')}>
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
            <>
              <div className="md:hidden divide-y divide-slate-100">
                {ads.map((ad) => (
                  <AdMobileCard key={ad._id} ad={ad} onOpen={openAd} />
                ))}
              </div>
              <div className="hidden md:block flex-1 overflow-auto custom-scrollbar relative min-h-full">
                <table className="min-w-full table-fixed border-separate border-spacing-0">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-slate-50/90 backdrop-blur-md">
                      <th
                        scope="col"
                        className="w-16 sm:w-20 px-2 sm:px-3 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors group select-none hidden sm:table-cell border-b border-slate-100"
                        onClick={() => handleSortChange('risk')}
                      >
                        <div className="flex items-center justify-center">
                          Risk
                          <SortIcon field="risk" />
                        </div>
                      </th>
                      <th scope="col" className="w-14 sm:w-16 px-2 sm:px-3 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell border-b border-slate-100">
                        Status
                      </th>
                      <th scope="col" className="px-2 sm:px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider min-w-[200px] border-b border-slate-100">
                        Ad
                      </th>
                      <th scope="col" className="w-14 px-2 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell border-b border-slate-100">
                        Plat.
                      </th>
                      <th scope="col" className="w-24 px-2 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell border-b border-slate-100">
                        Format
                      </th>
                      <th scope="col" className="w-24 px-2 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider hidden xl:table-cell border-b border-slate-100">
                        Delivery
                      </th>
                      <th scope="col" className="w-24 px-2 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider hidden xl:table-cell border-b border-slate-100">
                        Impr.
                      </th>
                      <th
                        scope="col"
                        className="w-28 px-2 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors group select-none hidden lg:table-cell border-b border-slate-100"
                        onClick={() => handleSortChange('sourced_at')}
                      >
                        <div className="flex items-center">
                          Sourced
                          <SortIcon field="sourced_at" />
                        </div>
                      </th>
                      <th
                        scope="col"
                        className="w-28 px-2 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors group select-none hidden xl:table-cell border-b border-slate-100"
                        onClick={() => handleSortChange('start_date')}
                      >
                        <div className="flex items-center">
                          Start
                          <SortIcon field="start_date" />
                        </div>
                      </th>
                      <th scope="col" className="w-12 sm:w-14 px-2 sm:px-4 py-3 text-right border-b border-slate-100" />
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {ads.map((ad) => (
                      <AdTableRow key={ad._id} ad={ad} onOpen={openAd} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {ads.length > 0 && (
          <div className="shrink-0 border-t border-slate-100 px-3 py-2 bg-white space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                  Show
                </span>
                <div className="flex bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                  {[10, 25, 50, 75, 100].map((limit) => (
                    <button
                      key={limit}
                      type="button"
                      onClick={() => updateParams({ limit: String(limit), page: 1 })}
                      className={cn(
                        'px-1.5 py-1 text-[10px] font-bold transition-all rounded-md cursor-pointer tabular-nums',
                        itemsPerPage === limit
                          ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
                      )}
                    >
                      {limit}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] font-medium text-slate-500 tabular-nums shrink-0">
                {rangeFrom.toLocaleString()}–{rangeTo.toLocaleString()} of {totalCount.toLocaleString()}
              </p>
            </div>
            <div className="flex items-center justify-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1 || isPending}
                onClick={() => updateParams({ page: currentPage - 1 })}
                className="h-7 w-7 p-0 border-slate-200 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[11px] text-slate-500 tabular-nums px-2">
                Page {currentPage} / {Math.max(1, totalPages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages || isPending}
                onClick={() => updateParams({ page: currentPage + 1 })}
                className="h-7 w-7 p-0 border-slate-200 disabled:opacity-40"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
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
