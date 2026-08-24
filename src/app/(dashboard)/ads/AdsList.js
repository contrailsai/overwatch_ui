'use client'

import { useState, useCallback, useEffect, useMemo, useTransition } from 'react'
import {
  Filter, X, ChevronLeft, ChevronRight,
  Facebook, Instagram, Youtube, CheckCircle,
  Siren, ClockFading, Info, Globe, TriangleAlert,
  TrendingDown, Smile, ExternalLink, Search, Megaphone,
  Eye, Loader2, ArrowUpDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Twitter, Reddit } from '@/utils/icons'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { DateFilterPopover } from '@/app/(dashboard)/cases/DateFilterPopover'
import { RiskFilter } from '@/app/(dashboard)/cases/RiskFilter'
import { StatusFilter } from '@/app/(dashboard)/cases/StatusFilter'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getRiskLabel } from '@/app/(dashboard)/cases/riskBuckets'
import {
  formatDisplayFormat,
  formatAdDate,
  getAdDisplayTitle,
  getAdDisplayPreview,
  getAdImpressions,
  getAdVisibilityLabel,
} from '@/lib/ads/ad-display'
import ReportGenerate from '@/components/ReportGenerate'
import { getAllAdIds, trackClientClick } from './actions'
import AdDetailPanel from './AdDetails'

const FILTER_LABEL = 'text-[10px] font-bold text-slate-500 uppercase tracking-wide'
const FILTER_TRIGGER =
  'w-full h-8 text-xs bg-slate-50 border-slate-200 hover:border-slate-300 focus:ring-blue-500/20 px-2.5'

function FilterField({ label, children, className }) {
  return (
    <div className={cn('space-y-0.5 min-w-0', className)}>
      <Label className={FILTER_LABEL}>{label}</Label>
      {children}
    </div>
  )
}

function PlatformIcon({ platform, className }) {
  const p = platform?.toLowerCase()
  if (p === 'instagram') return <Instagram className={cn('w-3.5 h-3.5 text-pink-500', className)} />
  if (p === 'facebook' || p === 'meta') return <Facebook className={cn('w-3.5 h-3.5 text-blue-600', className)} />
  if (p === 'x') {
    return (
      <span className="w-3.5 h-3.5">
        <Twitter className={cn('max-w-3.5 max-h-3.5 text-slate-900', className)} />
      </span>
    )
  }
  if (p === 'reddit') {
    return (
      <span className="w-3.5 h-3.5">
        <Reddit className={cn('max-w-3.5 max-h-3.5', className)} />
      </span>
    )
  }
  if (p === 'youtube') return <Youtube className={cn('w-3.5 h-3.5 text-red-500', className)} />
  return <Globe className={cn('w-3.5 h-3.5 text-slate-400', className)} />
}

function getStatusConfig(status) {
  const s = status?.toLowerCase()
  if (s === 'to be reviewed' || s === 'pending' || !status) {
    return { label: 'To Be Reviewed', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: ClockFading }
  }
  if (s === 'no action' || s === 'pass') {
    return { label: 'No Action', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle }
  }
  if (s === 'flag for takedown') {
    return { label: 'Flag for Takedown', color: 'text-rose-700 bg-rose-50 border-rose-200', icon: Siren }
  }
  return { label: status, color: 'text-slate-600 bg-slate-50 border-slate-200', icon: Info }
}

function getAdListFields(ad) {
  const title = getAdDisplayTitle(ad)
  const preview = getAdDisplayPreview(ad)
  const statusCfg = getStatusConfig(ad.client_status)
  const visibility = getAdVisibilityLabel(ad)
  return {
    risk: getRiskLabel(ad.score),
    statusCfg,
    visibility,
    thumb: ad.signedImageUrl || ad.content?.media?.[0]?.signedUrl,
    title,
    preview: preview && preview !== title ? preview : null,
    formatLabel: formatDisplayFormat(ad.list?.display_format || ad.content?.display_format),
    formatRaw: ad.list?.display_format || ad.content?.display_format,
    impressions: getAdImpressions(ad),
    startDate: formatAdDate(ad.start_date || ad.list?.start_date),
    pageName: ad.page_name || 'Unknown page',
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
  const StatusIcon = fields.statusCfg.icon
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 flex-wrap text-[10px] text-slate-500',
        compact ? 'mt-1' : 'mt-1.5',
      )}
    >
      <span className={cn('font-medium px-1.5 py-0.5 rounded border', fields.risk.color)}>
        {fields.risk.label}
      </span>
      <span
        className={cn(
          'inline-flex items-center gap-0.5 font-medium px-1.5 py-0.5 rounded border',
          fields.statusCfg.color,
        )}
      >
        <StatusIcon className="h-2.5 w-2.5" />
        {fields.statusCfg.label}
      </span>
      <span
        className={cn(
          'font-medium px-1.5 py-0.5 rounded border',
          fields.visibility.down
            ? 'bg-slate-100 text-slate-600 border-slate-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-100',
        )}
      >
        {fields.visibility.label}
      </span>
      {fields.formatLabel && (
        <span className="text-slate-500 truncate max-w-[9rem]" title={fields.formatRaw}>
          {fields.formatLabel}
        </span>
      )}
      {fields.impressions.text && (
        <span className="inline-flex items-center gap-0.5 text-slate-600">
          <Eye className="h-3 w-3 text-slate-400" />
          <span className="tabular-nums">{fields.impressions.text}</span>
        </span>
      )}
      {fields.startDate && (
        <span className={cn('text-slate-400 tabular-nums', compact && 'ml-auto')}>
          {fields.startDate}
        </span>
      )}
    </div>
  )
}

function SelectionCheckbox({ checked, onChange, ariaLabel, className }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer',
        className,
      )}
      aria-label={ariaLabel}
    />
  )
}

function AdListRow({ ad, isActive, isChecked, onOpen, onToggle }) {
  const fields = getAdListFields(ad)

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(ad)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen(ad)
          }
        }}
        className={cn(
          'w-full text-left px-3 py-2.5 flex gap-2.5 transition-colors duration-150 cursor-pointer',
          isActive
            ? 'bg-blue-50/90 border-l-2 border-l-blue-600'
            : 'hover:bg-slate-50/80 border-l-2 border-l-transparent',
          isChecked && !isActive && 'bg-slate-50',
        )}
      >
        <div className="pt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <SelectionCheckbox
            checked={isChecked}
            onChange={(e) => onToggle(ad, e)}
            ariaLabel={`Select ad ${ad._id}`}
          />
        </div>
        <AdThumb
          src={fields.thumb}
          className="h-14 w-14 rounded-lg border border-slate-200/80"
          iconClassName="h-4 w-4"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <PlatformIcon platform={ad.platform} />
            <span className="text-[13px] font-semibold text-slate-900 truncate tracking-tight">
              {fields.pageName}
            </span>
            {ad.original_url && (
              <a
                href={ad.original_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-auto shrink-0 text-[10px] font-semibold text-blue-600 hover:underline inline-flex items-center gap-0.5"
              >
                Source <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
          <p className="text-[12px] text-slate-800 font-medium mt-0.5 line-clamp-1">
            {fields.title}
          </p>
          <AdMetaBadges fields={fields} compact />
        </div>
      </div>
    </li>
  )
}

function AdGridCard({ ad, isChecked, onOpen, onToggle }) {
  const fields = getAdListFields(ad)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(ad)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(ad)
        }
      }}
      className={cn(
        'group relative flex flex-col rounded-xl border bg-white text-left shadow-sm overflow-hidden cursor-pointer',
        'transition-all duration-150',
        isChecked
          ? 'border-blue-300 ring-1 ring-blue-100'
          : 'border-slate-200 hover:border-blue-200 hover:shadow-md hover:ring-1 hover:ring-blue-100',
      )}
    >
      <div className="absolute top-2.5 left-2.5 z-10" onClick={(e) => e.stopPropagation()}>
        <SelectionCheckbox
          checked={isChecked}
          onChange={(e) => onToggle(ad, e)}
          ariaLabel={`Select ad ${ad._id}`}
          className="bg-white/90 shadow-sm"
        />
      </div>
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
        </div>
        <p className="text-[13px] text-slate-800 font-medium mt-1.5 line-clamp-2 leading-snug">
          {fields.title}
        </p>
        {fields.preview && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{fields.preview}</p>
        )}
        <AdMetaBadges fields={fields} />
      </div>
    </div>
  )
}

export function AdsList({
  ads,
  project,
  initialFilters,
  initialSort = { field: 'risk', direction: 'desc' },
  currentPage,
  itemsPerPage,
  initialAd = null,
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const totalCount = ads?.totalCount || 0
  const totalPages = ads?.totalPages || 0
  const adList = ads?.ads || []

  const [localAds, setLocalAds] = useState(adList)
  const [selectedAd, setSelectedAd] = useState(initialAd || null)
  const [searchInput, setSearchInput] = useState(initialFilters.searchText || '')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedAds, setSelectedAds] = useState({})
  const [isAllFilterSelected, setIsAllFilterSelected] = useState(false)
  const [isSelectingAll, setIsSelectingAll] = useState(false)
  const [summaryState, setSummaryState] = useState({ loading: false, statusText: '' })
  const [detailedPdfState, setDetailedPdfState] = useState({ loading: false, statusText: '' })
  const [detailedDocxState, setDetailedDocxState] = useState({ loading: false, statusText: '' })
  const [toast, setToast] = useState(null)

  const showToast = (message, type = 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const selectedPostsArray = useMemo(() => Object.values(selectedAds), [selectedAds])
  const selectedCount = selectedPostsArray.length
  const isAllCurrentPageSelected = localAds.length > 0 && localAds.every((ad) => !!selectedAds[ad._id])
  const isSomeCurrentPageSelected = localAds.some((ad) => !!selectedAds[ad._id])

  useEffect(() => {
    setLocalAds(adList)
  }, [adList])

  useEffect(() => {
    setSearchInput(initialFilters.searchText || '')
  }, [initialFilters.searchText])

  useEffect(() => {
    if (initialAd) setSelectedAd(initialAd)
  }, [initialAd])

  const handleAdUpdate = (adId, updates) => {
    setLocalAds((prev) => prev.map((a) => (a._id === adId ? { ...a, ...updates } : a)))
    if (selectedAd?._id === adId) {
      setSelectedAd((prev) => ({ ...prev, ...updates }))
    }
    router.refresh()
  }

  const selectedIndex = selectedAd ? localAds.findIndex((a) => a._id === selectedAd._id) : -1

  const updateQueryParams = useCallback((newParams, { replace = false } = {}) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === undefined || value === 'all' || value === '') {
        params.delete(key)
      } else {
        params.set(key, String(value))
      }
    })
    const qs = params.toString()
    startTransition(() => {
      const method = replace ? router.replace : router.push
      method(`${pathname}${qs ? `?${qs}` : ''}`)
    })
  }, [router, pathname, searchParams])

  const openAd = useCallback((ad) => {
    setSelectedAd(ad)
    updateQueryParams({ ad_id: ad._id }, { replace: true })
  }, [updateQueryParams])

  const closeAd = useCallback(() => {
    setSelectedAd(null)
    if (searchParams.has('ad_id')) {
      updateQueryParams({ ad_id: null }, { replace: true })
    }
  }, [searchParams, updateQueryParams])

  const navigateAd = useCallback((direction) => {
    if (!selectedAd) return
    const currentIndex = localAds.findIndex((a) => a._id === selectedAd._id)
    if (currentIndex === -1) return
    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1
    if (nextIndex >= 0 && nextIndex < localAds.length) {
      openAd(localAds[nextIndex])
    }
  }, [selectedAd, localAds, openAd])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedAd) return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        navigateAd('prev')
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        navigateAd('next')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedAd, navigateAd])

  const handleFilterChange = (key, value) => updateQueryParams({ [key]: value, page: 1 })
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) updateQueryParams({ page: newPage })
  }

  const handleSortFieldChange = (field) => {
    updateQueryParams({
      sortField: field,
      sortDirection: initialSort.field === field ? initialSort.direction : 'desc',
      page: 1,
    })
  }

  const toggleSortDirection = () => {
    const next = initialSort.direction === 'desc' ? 'asc' : 'desc'
    updateQueryParams({
      sortField: initialSort.field || 'risk',
      sortDirection: next,
      page: 1,
    })
  }

  const clearFilters = () => {
    setSearchInput('')
    startTransition(() => {
      router.push(pathname)
    })
  }

  const submitSearch = () => {
    const val = searchInput.trim()
    updateQueryParams({ search: val || null, page: 1 })
  }

  const handleToggleAd = (ad, e) => {
    e?.stopPropagation?.()
    setSelectedAds((prev) => {
      const next = { ...prev }
      if (next[ad._id]) {
        delete next[ad._id]
        setIsAllFilterSelected(false)
      } else {
        next[ad._id] = { _id: ad._id }
      }
      return next
    })
  }

  const handleToggleAllOnPage = (e) => {
    const isChecked = e.target.checked
    if (!isChecked) {
      setSelectedAds({})
      setIsAllFilterSelected(false)
      return
    }
    setSelectedAds((prev) => {
      const next = { ...prev }
      localAds.forEach((ad) => {
        next[ad._id] = { _id: ad._id }
      })
      return next
    })
  }

  const handleSelectAllFiltered = async () => {
    setIsSelectingAll(true)
    try {
      const ids = await getAllAdIds(initialFilters)
      setSelectedAds((prev) => {
        const next = { ...prev }
        ids.forEach((id) => {
          if (!next[id]) next[id] = { _id: id }
        })
        return next
      })
      setIsAllFilterSelected(true)
    } finally {
      setIsSelectingAll(false)
    }
  }

  const handleClearAllSelected = () => {
    setSelectedAds({})
    setIsAllFilterSelected(false)
  }

  const filtersKey = JSON.stringify(initialFilters)
  useEffect(() => {
    setIsAllFilterSelected(false)
    setSelectedAds({})
  }, [filtersKey])

  const reportGenerateProps = {
    selectedPostsArray,
    selectedCount,
    summaryState,
    detailedPdfState,
    detailedDocxState,
    setSummaryState,
    setDetailedPdfState,
    setDetailedDocxState,
    showToast,
    trackClientClick,
    project,
    formatIds: ['summary-pdf', 'detailed-pdf'],
    entityLabel: 'ads',
    entityType: 'ads',
    analyticsPage: 'AdsList',
  }

  const hasActiveFilter = (
    initialFilters.platform !== 'all' ||
    initialFilters.status !== 'all' ||
    Boolean(initialFilters.searchText) ||
    Boolean(initialFilters.start_date_from) ||
    Boolean(initialFilters.start_date_to) ||
    (initialFilters.risk && initialFilters.risk !== 'all') ||
    (initialFilters.visibility_status && initialFilters.visibility_status !== 'all')
  )

  const rangeFrom = localAds.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1
  const rangeTo = localAds.length === 0 ? 0 : rangeFrom + localAds.length - 1

  const sortLabel =
    initialSort.field === 'start_date' ? 'Start date' : 'Risk'

  return (
    <div className="flex h-full overflow-hidden bg-[#f4f6f8]">
      <div
        className={cn(
          'flex flex-col border-r border-slate-200/80',
          selectedAd
            ? 'hidden lg:flex lg:w-[30%] lg:max-w-[380px] lg:min-w-[280px] shrink-0 bg-white'
            : 'flex w-full bg-white',
        )}
      >
        <div className={cn('shrink-0 border-b border-slate-100 space-y-2', selectedAd ? 'px-3 py-2.5' : 'px-5 py-4 space-y-3')}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 mr-auto">
              <p className={cn(
                'font-bold text-slate-900 tabular-nums tracking-tight leading-none',
                selectedAd ? 'text-xl' : 'text-2xl sm:text-3xl',
              )}>
                {totalCount.toLocaleString()}
                <span className={cn(
                  'ml-1.5 font-semibold text-slate-600',
                  selectedAd ? 'text-sm' : 'text-base sm:text-lg',
                )}>
                  {totalCount === 1 ? 'ad' : 'ads'}
                </span>
                {isPending && (
                  <Loader2 className="inline ml-2 h-4 w-4 animate-spin text-slate-400 align-middle" />
                )}
              </p>
            </div>

            <div className={cn('relative flex-1', selectedAd ? 'min-w-[120px]' : 'min-w-[180px] max-w-sm')}>
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
                    updateQueryParams({ search: null, page: 1 })
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {hasActiveFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 text-xs text-slate-500 hover:text-slate-800 px-2"
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
                  (showFilters || hasActiveFilter) && 'border-blue-300 bg-blue-50 text-blue-700',
                )}
              >
                <Filter className="h-3.5 w-3.5" />
                Filters
                {hasActiveFilter && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
              </Button>
            </div>
          </div>

          <div
            className={cn(
              'gap-2',
              selectedAd
                ? 'flex flex-col'
                : 'flex flex-wrap items-start justify-between',
            )}
          >
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              {selectedCount > 0 ? (
                <>
                  <span className="inline-flex items-center text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded shrink-0">
                    {isAllFilterSelected ? `All ${totalCount}` : selectedCount} selected
                  </span>
                  <button
                    type="button"
                    onClick={handleClearAllSelected}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-700 underline underline-offset-2 shrink-0"
                  >
                    Clear
                  </button>
                  {!isAllFilterSelected && totalCount > selectedCount && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectAllFiltered}
                      disabled={isSelectingAll}
                      className={cn(
                        'h-7 text-[10px] bg-blue-600 text-white hover:bg-blue-700 font-bold',
                        selectedAd ? 'w-full sm:w-auto' : '',
                      )}
                    >
                      {isSelectingAll ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                      ) : (
                        <CheckCircle className="w-3 h-3 mr-1.5 opacity-70" />
                      )}
                      Select all {totalCount.toLocaleString()}
                    </Button>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isAllCurrentPageSelected}
                    ref={(input) => {
                      if (input) {
                        input.indeterminate = isSomeCurrentPageSelected && !isAllCurrentPageSelected
                      }
                    }}
                    onChange={handleToggleAllOnPage}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    aria-label="Select all on this page"
                  />
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    disabled={isSelectingAll || totalCount === 0}
                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50"
                  >
                    {isSelectingAll ? 'Selecting…' : `Select all ${totalCount.toLocaleString()}`}
                  </button>
                </div>
              )}
            </div>
            <div className={cn('shrink-0', selectedAd ? 'w-full' : '')}>
              <ReportGenerate
                {...reportGenerateProps}
                compact={Boolean(selectedAd)}
                showLabel={!selectedAd}
              />
            </div>
          </div>

          {showFilters && (
            <div className="space-y-2.5 pt-1">
              <div
                className={cn(
                  'grid gap-x-2.5 gap-y-2.5',
                  selectedAd
                    ? 'grid-cols-2'
                    : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6',
                )}
              >
                <FilterField label="Platform">
                  <Select
                    value={initialFilters.platform || 'all'}
                    onValueChange={(val) => handleFilterChange('platform', val)}
                  >
                    <SelectTrigger size="sm" className={FILTER_TRIGGER}>
                      <SelectValue placeholder="All platforms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All platforms</SelectItem>
                      <SelectItem value="meta">Meta</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="google">Google</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                    </SelectContent>
                  </Select>
                </FilterField>

                <div className="min-w-0">
                  <StatusFilter
                    label="Status"
                    placeholder="All status"
                    initialStatus={initialFilters.status}
                    onChange={(val) => handleFilterChange('status', val)}
                    options={[
                      { value: 'No Action', label: 'No Action' },
                      { value: 'Flag for Takedown', label: 'Flag for Takedown' },
                      { value: 'To Be Reviewed', label: 'To Be Reviewed' },
                    ]}
                  />
                </div>

                <div className="min-w-0">
                  <RiskFilter
                    initialRisk={initialFilters.risk || 'all'}
                    onChange={(val) => handleFilterChange('risk', val)}
                  />
                </div>

                <FilterField label="Visibility">
                  <Select
                    value={initialFilters.visibility_status || 'all'}
                    onValueChange={(val) => handleFilterChange('visibility_status', val)}
                  >
                    <SelectTrigger size="sm" className={FILTER_TRIGGER}>
                      <SelectValue placeholder="All visibility" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All visibility</SelectItem>
                      <SelectItem value="available">Online</SelectItem>
                      <SelectItem value="down">Taken Down</SelectItem>
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField label="Start date">
                  <DateFilterPopover
                    title="Start Date"
                    initialFrom={initialFilters.start_date_from}
                    initialTo={initialFilters.start_date_to}
                    onApply={(range) => updateQueryParams({
                      start_date_from: range?.from ? range.from.toISOString() : null,
                      start_date_to: range?.to ? range.to.toISOString() : null,
                      page: 1,
                    })}
                  />
                </FilterField>

                <FilterField label="Sort">
                  <div className="flex gap-1.5">
                    <Select
                      value={initialSort.field || 'risk'}
                      onValueChange={handleSortFieldChange}
                    >
                      <SelectTrigger size="sm" className={cn(FILTER_TRIGGER, 'flex-1')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="risk">Risk</SelectItem>
                        <SelectItem value="start_date">Start date</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={toggleSortDirection}
                      className="h-8 w-8 p-0 shrink-0"
                      title={`Sort ${initialSort.direction === 'asc' ? 'ascending' : 'descending'}`}
                    >
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </FilterField>
              </div>

              {hasActiveFilter && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Active:</span>
                  {initialFilters.searchText && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-bold text-[10px] uppercase tracking-wider border border-blue-100">
                      Search
                    </span>
                  )}
                  {initialFilters.platform !== 'all' && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-bold text-[10px] uppercase tracking-wider border border-blue-100">
                      {initialFilters.platform}
                    </span>
                  )}
                  {initialFilters.status !== 'all' && (
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded font-bold text-[10px] uppercase tracking-wider border border-indigo-100">
                      {initialFilters.status}
                    </span>
                  )}
                  {initialFilters.risk && initialFilters.risk !== 'all' && (
                    <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded font-bold text-[10px] uppercase tracking-wider border border-rose-100">
                      {initialFilters.risk} risk
                    </span>
                  )}
                  {(initialFilters.start_date_from || initialFilters.start_date_to) && (
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded font-bold text-[10px] uppercase tracking-wider border border-amber-100">
                      Date range
                    </span>
                  )}
                  {initialFilters.visibility_status && initialFilters.visibility_status !== 'all' && (
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-bold text-[10px] uppercase tracking-wider border border-slate-200">
                      {initialFilters.visibility_status === 'down' ? 'Taken Down' : 'Online'}
                    </span>
                  )}
                </div>
              )}

              <p className="text-[10px] text-slate-400">
                Sorted by {sortLabel} ({initialSort.direction === 'asc' ? 'ascending' : 'descending'})
              </p>
            </div>
          )}
        </div>

        <div className={cn('flex-1 overflow-y-auto', !selectedAd && localAds.length > 0 && 'bg-slate-50')}>
          {localAds.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-10 text-slate-500">
              <div className="h-14 w-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-4">
                <Megaphone className="h-6 w-6 text-slate-300" />
              </div>
              <p className="font-medium text-slate-800">No ads found</p>
              <p className="text-sm mt-1 max-w-xs text-slate-500">
                {initialFilters.searchText
                  ? 'No ads match this search. Try a different page name, copy, or URL.'
                  : 'Reviewed ads will show up here. Try adjusting your filters.'}
              </p>
              {hasActiveFilter && (
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
              {localAds.map((ad) => (
                <AdListRow
                  key={ad._id}
                  ad={ad}
                  isActive={selectedAd._id === ad._id}
                  isChecked={!!selectedAds[ad._id]}
                  onOpen={openAd}
                  onToggle={handleToggleAd}
                />
              ))}
            </ul>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-5">
              {localAds.map((ad) => (
                <AdGridCard
                  key={ad._id}
                  ad={ad}
                  isChecked={!!selectedAds[ad._id]}
                  onOpen={openAd}
                  onToggle={handleToggleAd}
                />
              ))}
            </div>
          )}
        </div>

        {localAds.length > 0 && (
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
                      onClick={() => updateQueryParams({ limit: String(limit), page: 1 })}
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
                onClick={() => handlePageChange(1)}
                className="h-7 w-7 p-0 text-[10px] font-bold border-slate-200 disabled:opacity-40"
                title="First page"
              >
                «
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1 || isPending}
                onClick={() => handlePageChange(currentPage - 1)}
                className="h-7 w-7 p-0 border-slate-200 disabled:opacity-40"
                title="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>

              {(() => {
                const pages = []
                const safeTotal = Math.max(1, totalPages)
                const pageWindow = selectedAd ? 1 : 2
                let start = Math.max(1, currentPage - pageWindow)
                let end = Math.min(safeTotal, currentPage + pageWindow)
                if (currentPage <= pageWindow) end = Math.min(safeTotal, pageWindow * 2 + 1)
                if (currentPage >= safeTotal - pageWindow + 1) start = Math.max(1, safeTotal - pageWindow * 2)
                for (let i = start; i <= end; i++) pages.push(i)
                return pages.map((pageNum) => (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handlePageChange(pageNum)}
                    disabled={isPending}
                    className={cn(
                      'h-7 w-7 p-0 text-[10px] font-bold',
                      currentPage === pageNum
                        ? 'bg-slate-800 hover:bg-slate-900 text-white'
                        : 'border-slate-200 text-slate-600',
                    )}
                  >
                    {pageNum}
                  </Button>
                ))
              })()}

              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= Math.max(1, totalPages) || isPending}
                onClick={() => handlePageChange(currentPage + 1)}
                className="h-7 w-7 p-0 border-slate-200 disabled:opacity-40"
                title="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= Math.max(1, totalPages) || isPending}
                onClick={() => handlePageChange(Math.max(1, totalPages))}
                className="h-7 w-7 p-0 text-[10px] font-bold border-slate-200 disabled:opacity-40"
                title="Last page"
              >
                »
              </Button>
            </div>
          </div>
        )}
      </div>

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
          <AdDetailPanel
            ad={selectedAd}
            project={project}
            onClose={closeAd}
            onUpdate={handleAdUpdate}
            onNext={() => navigateAd('next')}
            onPrev={() => navigateAd('prev')}
            hasNext={selectedIndex >= 0 && selectedIndex < localAds.length - 1}
            hasPrev={selectedIndex > 0}
          />
        </div>
      )}

      {toast && (
        <div
          className={cn(
            'fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2.5rem)] max-w-[400px] md:w-auto px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300 border backdrop-blur-xl',
            toast.type === 'success'
              ? 'bg-emerald-600/90 text-white border-emerald-400/50 shadow-emerald-900/20'
              : 'bg-rose-600/90 text-white border-rose-400/50 shadow-rose-900/20',
          )}
        >
          <div className="flex items-center gap-3 w-full">
            <div className={cn(
              'shrink-0 p-1.5 rounded-xl bg-white/20',
              toast.type === 'success' ? 'text-emerald-50' : 'text-rose-50',
            )}>
              {toast.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <TriangleAlert className="w-5 h-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="shrink-0 p-1 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 opacity-70 hover:opacity-100" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
