'use client'

import { useState, useCallback, useEffect, useTransition, useMemo, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Filter, Search, ChevronRight, AlertTriangle, CheckCircle,
  Clock, ShieldAlert, ImageIcon, X, Loader2,
  Youtube, Instagram, Facebook, XCircle, Siren, TriangleAlert, TrendingDown, Smile,
  ChevronLeft, ExternalLink, Send, Info, Link2, Copy, ChevronDown
} from 'lucide-react'
import { Twitter, Reddit } from '@/utils/icons'
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import { trackClientClick, getAllTakedownIds, lookupTakedownsByUrls } from './actions'
import ReportGenerate from '@/components/ReportGenerate'
import { DateFilterPopover } from "@/components/DateFilterPopover"
import { ViolationsFilter } from "@/app/(dashboard)/cases/ViolationsFilter"
import { RiskFilter } from "@/app/(dashboard)/cases/RiskFilter"
import { StatusFilter } from "@/app/(dashboard)/cases/StatusFilter"
import { PlatformFilter } from "@/app/(dashboard)/cases/PlatformFilter"
import { PoiFilter } from "@/app/(dashboard)/cases/PoiFilter"
import { endOfDay, format, isSameDay, startOfDay, subDays } from "date-fns"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  detectUrlLookupMode,
  extractUrlsFromInput,
  TAKEDOWN_URL_LOOKUP_CAP,
} from '@/lib/takedowns/url-lookup'

const STATUS_OPTIONS = [
  { value: 'in_progress', label: 'In Progress' },
  { value: 'initiated', label: 'Initiated' },
  { value: 'under_review', label: 'Under Review' },
  { value: 're_appeal_takedown', label: 'Appealed Again' },
  { value: 'takedown_successful', label: 'Takedown Successful' },
  { value: 'takedown_failed', label: 'Takedown Failed' },
]

const EMPTY_LOOKUP = {
  inputCount: 0,
  foundCount: 0,
  notInTakedowns: [],
  hiddenByFilters: [],
  truncated: false,
  leftoverTokens: [],
}

const DATE_PARAM_FORMAT = "yyyy-MM-dd'T'HH:mm:ssXXX"

function todayStartRange(now = new Date()) {
  return { from: startOfDay(now), to: endOfDay(now) }
}

function last7DaysStartRange(now = new Date()) {
  return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) }
}

function sameCalendarDay(value, date) {
  if (!value || !date) return false
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  return isSameDay(parsed, date)
}

function isTakedownStartRangeActive(filters, range) {
  return sameCalendarDay(filters?.takedown_date_from, range.from)
    && sameCalendarDay(filters?.takedown_date_to, range.to)
}

function FiltersToggle({ active, open, onClick }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn(
        'gap-1.5 h-8 shrink-0',
        (open || active) && 'border-blue-300 bg-blue-50 text-blue-700',
      )}
    >
      <Filter className="h-3.5 w-3.5" />
      Filters
      {active && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
    </Button>
  )
}

function ListSelectionBar({
  className,
  selectedCount,
  totalCount,
  isAllFilterSelected,
  isSelectingAll,
  onSelectAllFiltered,
  onClearSelection,
  hasActiveFilters = false,
  onClearFilters,
}) {
  return (
    <div className={cn('flex items-center gap-2 min-w-0 flex-wrap justify-end', className)}>
      {hasActiveFilters && onClearFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-7 px-2 text-[10px] font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 shrink-0"
        >
          <X className="w-3 h-3 mr-1" />
          Clear filters
        </Button>
      )}
      {selectedCount === 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onSelectAllFiltered}
          disabled={isSelectingAll || totalCount === 0}
          className="h-7 px-2.5 text-[10px] font-bold text-slate-700 border-slate-200 shrink-0"
        >
          {isSelectingAll ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1 text-blue-600" />
          ) : (
            <CheckCircle className="w-3 h-3 mr-1 text-slate-400" />
          )}
          Select all {totalCount.toLocaleString()}
        </Button>
      ) : (
        <>
          <span className="inline-flex items-center text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded shrink-0">
            {isAllFilterSelected
              ? `All ${totalCount.toLocaleString()}`
              : selectedCount.toLocaleString()}{' '}
            selected
          </span>
          {!isAllFilterSelected && totalCount > selectedCount && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSelectAllFiltered}
              disabled={isSelectingAll}
              className="h-7 px-2 text-[10px] font-bold text-blue-600 hover:bg-blue-50 shrink-0"
            >
              {isSelectingAll ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Select all {totalCount.toLocaleString()}
            </Button>
          )}
          {onClearSelection && (
            <button
              type="button"
              onClick={onClearSelection}
              className="text-[10px] font-bold text-slate-500 underline shrink-0"
            >
              Clear
            </button>
          )}
        </>
      )}
    </div>
  )
}

export default function TakedownsList({
  initialTakedowns,
  initialFilters,
  isReviewer: _isReviewer,
  metrics: initialMetrics,
  project,
  projectLabels,
  poiOptions = [],
  totalCount: initialTotalCount,
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [takedowns, setTakedowns] = useState(initialTakedowns)
  const [totalCount, setTotalCount] = useState(initialTotalCount)
  const [metrics, setMetrics] = useState(initialMetrics)
  const [selectedCases, setSelectedCases] = useState({})
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [isAllFilterSelected, setIsAllFilterSelected] = useState(false)
  const [isSelectingAll, setIsSelectingAll] = useState(false)
  const [mounted, setMounted] = useState(false)

  const isUrlMode = initialFilters.mode === 'urls'
  const [searchTerm, setSearchTerm] = useState(
    isUrlMode ? '' : (initialFilters.q || '')
  )
  const [urlPaste, setUrlPaste] = useState('')
  const [urlModeActive, setUrlModeActive] = useState(isUrlMode)
  const [lookupMeta, setLookupMeta] = useState(EMPTY_LOOKUP)
  const [urlLookupPending, setUrlLookupPending] = useState(false)
  const [urlAllIds, setUrlAllIds] = useState([])
  const [missExpanded, setMissExpanded] = useState(false)
  const urlPasteRef = useRef('')

  const [summaryState, setSummaryState] = useState({ loading: false, statusText: '' })
  const [detailedPdfState, setDetailedPdfState] = useState({ loading: false, statusText: '' })
  const [detailedDocxState, setDetailedDocxState] = useState({ loading: false, statusText: '' })

  const [toast, setToast] = useState(null)
  const showToast = (message, type = 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  const selectedIds = useMemo(() => Object.keys(selectedCases), [selectedCases])
  const selectedPostsArray = useMemo(() => Object.values(selectedCases), [selectedCases])
  const selectedCount = selectedIds.length

  const currentPage = parseInt(initialFilters.page) || 1
  const pageSize = parseInt(initialFilters.pageSize) || 25
  const totalPages = Math.ceil(totalCount / pageSize) || 1

  const filtersForLookup = useMemo(() => ({
    status: initialFilters.status,
    platform: initialFilters.platform,
    violations: initialFilters.violations,
    risk_priority: initialFilters.risk_priority,
    visibility_status: initialFilters.visibility_status,
    pois: initialFilters.pois,
    original_date_from: initialFilters.original_date_from,
    original_date_to: initialFilters.original_date_to,
    takedown_date_from: initialFilters.takedown_date_from,
    takedown_date_to: initialFilters.takedown_date_to,
    takedown_successful_date_from: initialFilters.takedown_successful_date_from,
    takedown_successful_date_to: initialFilters.takedown_successful_date_to,
    page: initialFilters.page,
    pageSize: initialFilters.pageSize,
  }), [initialFilters])

  const runUrlLookup = useCallback(async (paste, filtersOverride) => {
    const filters = filtersOverride || filtersForLookup
    const { urls } = extractUrlsFromInput(paste)
    if (urls.length === 0) {
      setTakedowns([])
      setTotalCount(0)
      setLookupMeta(EMPTY_LOOKUP)
      setUrlAllIds([])
      return
    }
    setUrlLookupPending(true)
    try {
      const result = await lookupTakedownsByUrls(urls, filters)
      setTakedowns(result.takedowns || [])
      setTotalCount(result.totalCount || 0)
      setLookupMeta(result.lookup || EMPTY_LOOKUP)
      setUrlAllIds(result.allIds || [])
      if (result.metrics) setMetrics(result.metrics)
    } catch (err) {
      console.error(err)
      showToast('URL lookup failed')
    } finally {
      setUrlLookupPending(false)
    }
  }, [filtersForLookup])

  useEffect(() => {
    if (urlModeActive) return
    setTakedowns(initialTakedowns)
    setTotalCount(initialTotalCount)
    setMetrics(initialMetrics)
  }, [initialTakedowns, initialTotalCount, initialMetrics, urlModeActive])

  useEffect(() => {
    if (!urlModeActive) return
    const paste = urlPasteRef.current
    if (!paste.trim()) return
    runUrlLookup(paste, filtersForLookup)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filtersForLookup.status,
    filtersForLookup.platform,
    filtersForLookup.violations,
    filtersForLookup.risk_priority,
    filtersForLookup.visibility_status,
    filtersForLookup.pois,
    filtersForLookup.original_date_from,
    filtersForLookup.original_date_to,
    filtersForLookup.takedown_date_from,
    filtersForLookup.takedown_date_to,
    filtersForLookup.takedown_successful_date_from,
    filtersForLookup.takedown_successful_date_to,
    filtersForLookup.page,
    filtersForLookup.pageSize,
    urlModeActive,
  ])

  const updateQueryParams = useCallback((newParams) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '' || (value === 'all' && key !== 'status' && key !== 'platform')) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }, [router, pathname, searchParams])

  const handleFilterChange = (key, value) => {
    updateQueryParams({ [key]: value, page: 1 })
  }

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return
    updateQueryParams({ page: newPage })
  }

  const clearFilters = () => {
    setSearchTerm('')
    setUrlPaste('')
    urlPasteRef.current = ''
    setUrlModeActive(false)
    setLookupMeta(EMPTY_LOOKUP)
    setUrlAllIds([])
    startTransition(() => {
      router.push(pathname)
    })
  }

  const handleSearchApply = () => {
    const raw = searchTerm.trim()
    if (!raw) {
      setUrlModeActive(false)
      setUrlPaste('')
      urlPasteRef.current = ''
      setLookupMeta(EMPTY_LOOKUP)
      updateQueryParams({ q: null, mode: null, page: 1 })
      return
    }

    if (detectUrlLookupMode(raw) || urlModeActive) {
      const paste = urlModeActive && urlPaste.trim() ? urlPaste : raw
      setUrlModeActive(true)
      setUrlPaste(paste)
      urlPasteRef.current = paste
      updateQueryParams({ q: null, mode: 'urls', page: 1 })
      runUrlLookup(paste, { ...filtersForLookup, page: '1' })
      return
    }

    setUrlModeActive(false)
    setUrlPaste('')
    urlPasteRef.current = ''
    setLookupMeta(EMPTY_LOOKUP)
    updateQueryParams({ q: raw, mode: null, page: 1 })
  }

  const clearSearch = () => {
    setSearchTerm('')
    setUrlPaste('')
    urlPasteRef.current = ''
    setUrlModeActive(false)
    setLookupMeta(EMPTY_LOOKUP)
    setUrlAllIds([])
    updateQueryParams({ q: null, mode: null, page: 1 })
  }

  const handleKpiClick = (kpiStatus) => {
    const next = initialFilters.status === kpiStatus ? 'all' : kpiStatus
    handleFilterChange('status', next)
  }

  const showHiddenByFilters = () => {
    updateQueryParams({
      status: 'all',
      visibility_status: 'all',
      page: 1,
    })
  }

  const copyMissUrls = async (list) => {
    try {
      await navigator.clipboard.writeText(list.join('\n'))
      showToast(`Copied ${list.length} URL${list.length === 1 ? '' : 's'}`, 'success')
    } catch {
      showToast('Could not copy to clipboard')
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === takedowns.length) {
      setSelectedCases({})
      setIsAllFilterSelected(false)
    } else {
      const all = {}
      takedowns.forEach(t => { all[t.id] = { _id: t.id, ...t } })
      setSelectedCases(all)
    }
  }

  const handleSelectAllFiltered = async () => {
    setIsSelectingAll(true)
    try {
      let ids = []
      if (urlModeActive && urlAllIds.length > 0) {
        ids = urlAllIds
      } else {
        ids = await getAllTakedownIds({
          ...filtersForLookup,
          q: initialFilters.q,
        })
      }
      setSelectedCases(prev => {
        const next = { ...prev }
        ids.forEach(id => {
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
    setSelectedCases({})
    setIsAllFilterSelected(false)
  }

  const toggleSelectId = (item) => {
    setSelectedCases(prev => {
      const next = { ...prev }
      if (next[item.id]) {
        delete next[item.id]
      } else {
        next[item.id] = { _id: item.id, ...item }
      }
      return next
    })
  }

  const isAllCurrentPageSelected = takedowns.length > 0 && takedowns.every(item => !!selectedCases[item.id])
  const isSomeCurrentPageSelected = takedowns.some(item => !!selectedCases[item.id])

  const hasHiddenFilters =
    (initialFilters.violations && initialFilters.violations !== 'all') ||
    initialFilters.risk_priority !== 'all' ||
    (initialFilters.visibility_status && initialFilters.visibility_status !== 'all') ||
    initialFilters.original_date_from ||
    initialFilters.original_date_to ||
    initialFilters.takedown_successful_date_from ||
    initialFilters.takedown_successful_date_to ||
    (initialFilters.status && initialFilters.status !== 'all'
      && !['in_progress', 'takedown_successful', 're_appeal_takedown', 'takedown_failed'].includes(initialFilters.status))

  const hasActiveFilters = initialFilters.status !== 'all' ||
    initialFilters.platform !== 'all' ||
    (initialFilters.violations && initialFilters.violations !== 'all') ||
    initialFilters.risk_priority !== 'all' ||
    (initialFilters.visibility_status && initialFilters.visibility_status !== 'all') ||
    (initialFilters.pois && initialFilters.pois !== 'all') ||
    initialFilters.original_date_from ||
    initialFilters.original_date_to ||
    initialFilters.takedown_date_from ||
    initialFilters.takedown_date_to ||
    initialFilters.takedown_successful_date_from ||
    initialFilters.takedown_successful_date_to ||
    !!initialFilters.q ||
    urlModeActive

  const filtersKey = JSON.stringify({ ...initialFilters, urlModeActive })
  useEffect(() => {
    setIsAllFilterSelected(false)
    setSelectedCases({})
  }, [filtersKey])

  const openCaseInNewTab = (caseId) => {
    window.open(`/takedowns/case/${caseId}`, '_blank', 'noopener,noreferrer')
  }

  const getStatusConfig = (status) => {
    const s = status?.toLowerCase() || ''
    switch (s) {
      case 'takedown successful':
      case 'takedown_successful':
        return { label: 'Successful', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle }
      case 'takedown failed':
      case 'takedown_failed':
        return { label: 'Failed', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: XCircle }
      case 'under process':
      case 'under_review':
        return { label: 'Under Review', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock }
      case 'appealed again':
      case 're_appeal_takedown':
        return { label: 'Appealed', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle }
      case 'initiated':
        return { label: 'Initiated', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Send }
      default:
        return { label: status?.replace(/_/g, ' ') || 'Unknown', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Info }
    }
  }

  const getRiskLabel = (score) => {
    if (score >= 96) return { label: 'HIGH', color: 'text-rose-500 bg-rose-50 border-rose-200', icon: Siren }
    if (score >= 76) return { label: 'MEDIUM', color: 'text-orange-500 bg-orange-50 border-orange-200', icon: TriangleAlert }
    if (score >= 41) return { label: 'LOW', color: 'text-amber-500 bg-amber-50 border-amber-200', icon: TrendingDown }
    return { label: 'SAFE', color: 'text-slate-500 bg-slate-50 border-slate-200', icon: Smile }
  }

  const todayRange = todayStartRange()
  const last7Range = last7DaysStartRange()
  const todayActive = mounted && isTakedownStartRangeActive(initialFilters, todayRange)
  const last7Active = mounted && isTakedownStartRangeActive(initialFilters, last7Range)
  const stillOnline = initialFilters.visibility_status === 'active'

  const applyStartRange = (range) => {
    updateQueryParams({
      takedown_date_from: format(range.from, DATE_PARAM_FORMAT),
      takedown_date_to: format(range.to, DATE_PARAM_FORMAT),
      page: 1,
    })
  }

  const clearStartRange = () => {
    updateQueryParams({
      takedown_date_from: null,
      takedown_date_to: null,
      page: 1,
    })
  }

  const busy = isPending || urlLookupPending

  const statusBadges = [
    {
      key: 'in_progress',
      label: 'In Progress',
      value: metrics?.inProgress ?? 0,
      icon: Clock,
      activeClass: 'border-blue-300 bg-blue-50 text-blue-700',
      iconClass: 'text-blue-600',
    },
    {
      key: 'takedown_successful',
      label: 'Successful',
      value: metrics?.successful ?? 0,
      icon: CheckCircle,
      activeClass: 'border-emerald-300 bg-emerald-50 text-emerald-700',
      iconClass: 'text-emerald-600',
    },
    {
      key: 're_appeal_takedown',
      label: 'Re-appealed',
      value: metrics?.reAppeal ?? 0,
      icon: AlertTriangle,
      activeClass: 'border-amber-300 bg-amber-50 text-amber-800',
      iconClass: 'text-amber-600',
    },
    {
      key: 'takedown_failed',
      label: 'Failed',
      value: metrics?.failed ?? 0,
      icon: XCircle,
      activeClass: 'border-rose-300 bg-rose-50 text-rose-700',
      iconClass: 'text-rose-600',
    },
  ]

  const AdvancedFilters = () => (
    <div className="flex flex-wrap items-end gap-2.5 sm:gap-3 w-full">
      <div className="space-y-1 w-full sm:w-auto sm:min-w-[140px] sm:max-w-[160px]">
        <StatusFilter
          label="Takedown Status"
          placeholder="All Statuses"
          initialStatus={initialFilters.status}
          onChange={(val) => handleFilterChange('status', val)}
          options={STATUS_OPTIONS}
        />
      </div>
      <div className="space-y-1 w-full sm:w-auto sm:min-w-[140px] sm:max-w-[140px]">
        <StatusFilter
          label="Visibility"
          placeholder="All Visibility"
          initialStatus={initialFilters.visibility_status || 'all'}
          onChange={(val) => handleFilterChange('visibility_status', val)}
          options={[
            { value: 'active', label: 'Online' },
            { value: 'down', label: 'Taken Down' },
          ]}
        />
      </div>
      <div className="space-y-1 w-full sm:w-auto sm:min-w-[140px] sm:max-w-[180px]">
        <ViolationsFilter
          projectLabels={projectLabels}
          initialViolations={initialFilters.violations}
          onChange={(val) => handleFilterChange('violations', val)}
        />
      </div>
      <div className="space-y-1 w-full sm:w-auto sm:min-w-[120px] sm:max-w-[140px]">
        <RiskFilter
          initialRisk={initialFilters.risk_priority}
          onChange={(val) => handleFilterChange('risk_priority', val)}
        />
      </div>
      <div className="space-y-1 w-full sm:w-auto sm:min-w-[140px] sm:max-w-[160px]">
        <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Publish Date</Label>
        <DateFilterPopover
          title="Publish Date"
          initialFrom={initialFilters.original_date_from}
          initialTo={initialFilters.original_date_to}
          onApply={(range) => {
            updateQueryParams({
              original_date_from: range?.from ? format(range.from, DATE_PARAM_FORMAT) : null,
              original_date_to: range?.to ? format(range.to, DATE_PARAM_FORMAT) : null,
              page: 1,
            })
          }}
        />
      </div>
      <div className="space-y-1 w-full sm:w-auto sm:min-w-[140px] sm:max-w-[160px]">
        <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Takedown Start</Label>
        <DateFilterPopover
          title="Takedown Start Date"
          initialFrom={initialFilters.takedown_date_from}
          initialTo={initialFilters.takedown_date_to}
          onApply={(range) => {
            updateQueryParams({
              takedown_date_from: range?.from ? format(range.from, DATE_PARAM_FORMAT) : null,
              takedown_date_to: range?.to ? format(range.to, DATE_PARAM_FORMAT) : null,
              page: 1,
            })
          }}
        />
      </div>
      <div className="space-y-1 w-full sm:w-auto sm:min-w-[140px] sm:max-w-[160px]">
        <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Success Date</Label>
        <DateFilterPopover
          title="Takedown Success Date"
          initialFrom={initialFilters.takedown_successful_date_from}
          initialTo={initialFilters.takedown_successful_date_to}
          onApply={(range) => {
            updateQueryParams({
              takedown_successful_date_from: range?.from ? format(range.from, DATE_PARAM_FORMAT) : null,
              takedown_successful_date_to: range?.to ? format(range.to, DATE_PARAM_FORMAT) : null,
              page: 1,
            })
          }}
        />
      </div>
    </div>
  )

  const SearchControl = ({ className }) => (
    <div className={cn('min-w-0', className)}>
      {urlModeActive ? (
        <div className="relative">
          <Link2 className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-blue-500 pointer-events-none" />
          <textarea
            value={urlPaste}
            onChange={(e) => {
              setUrlPaste(e.target.value)
              urlPasteRef.current = e.target.value
              setSearchTerm(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSearchApply()
              }
            }}
            rows={2}
            placeholder={`Paste up to ${TAKEDOWN_URL_LOOKUP_CAP} post links…`}
            className="w-full bg-slate-50 border border-blue-200 rounded-md pl-8 pr-8 py-1.5 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y min-h-[3.25rem]"
          />
          {(urlPaste || searchTerm) && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-2 p-0.5 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              aria-label="Clear URL lookup"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold text-slate-400">
              {extractUrlsFromInput(urlPaste).urls.length}/{TAKEDOWN_URL_LOOKUP_CAP} URLs
            </span>
            <Button type="button" size="sm" onClick={handleSearchApply} className="h-7 px-2.5 text-[10px] font-bold">
              <Search className="w-3 h-3 mr-1" /> Lookup
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative flex gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                const val = e.target.value
                setSearchTerm(val)
                if (detectUrlLookupMode(val)) {
                  setUrlModeActive(true)
                  setUrlPaste(val)
                  urlPasteRef.current = val
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSearchApply()
                }
              }}
              placeholder="Search caption, @handle, post id…"
              className="w-full h-8 bg-slate-50 border border-slate-200 rounded-md pl-8 pr-8 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setUrlModeActive(true)
              if (searchTerm) {
                setUrlPaste(searchTerm)
                urlPasteRef.current = searchTerm
              }
            }}
            className="h-8 px-2 text-[10px] font-bold border-slate-200 shrink-0"
            title="Paste post links"
          >
            <Link2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  )

  const BadgeRow = ({ scroll = false }) => (
    <div className={cn('flex items-center gap-2 min-w-0', scroll && 'overflow-x-auto')}>
      <div className={cn('flex items-center gap-1.5 min-w-0 flex-1', scroll ? 'flex-nowrap' : 'flex-wrap')}>
        {statusBadges.map((badge) => {
          const Icon = badge.icon
          const selected = initialFilters.status === badge.key
          return (
            <button
              key={badge.key}
              type="button"
              aria-pressed={selected}
              onClick={() => handleKpiClick(badge.key)}
              className={cn(
                'inline-flex items-center gap-1 h-7 px-2 rounded-full border text-[11px] font-semibold shrink-0 transition-colors cursor-pointer',
                selected
                  ? badge.activeClass
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800',
              )}
            >
              <Icon className={cn('w-3 h-3', selected ? badge.iconClass : 'text-slate-400')} />
              <span>{badge.label}</span>
              <span className="tabular-nums font-bold">{badge.value}</span>
            </button>
          )
        })}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200" aria-hidden="true" />
        <button
          type="button"
          aria-pressed={todayActive}
          onClick={() => (todayActive ? clearStartRange() : applyStartRange(todayRange))}
          className={cn(
            'h-7 px-2.5 rounded-full border text-[11px] font-semibold shrink-0 transition-colors cursor-pointer',
            todayActive
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800',
          )}
        >
          Today
        </button>
        <button
          type="button"
          aria-pressed={last7Active}
          onClick={() => (last7Active ? clearStartRange() : applyStartRange(last7Range))}
          className={cn(
            'h-7 px-2.5 rounded-full border text-[11px] font-semibold shrink-0 transition-colors cursor-pointer',
            last7Active
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800',
          )}
        >
          Last 7 days
        </button>
        <button
          type="button"
          aria-pressed={stillOnline}
          onClick={() => handleFilterChange('visibility_status', stillOnline ? 'all' : 'active')}
          className={cn(
            'h-7 px-2.5 rounded-full border text-[11px] font-semibold shrink-0 transition-colors cursor-pointer',
            stillOnline
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800',
          )}
        >
          Still online
        </button>
      </div>
      <ListSelectionBar
        className="shrink-0 ml-auto"
        selectedCount={selectedCount}
        totalCount={totalCount}
        isAllFilterSelected={isAllFilterSelected}
        isSelectingAll={isSelectingAll}
        onSelectAllFiltered={handleSelectAllFiltered}
        onClearSelection={handleClearAllSelected}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
      />
    </div>
  )

  const showMissBanner = urlModeActive && lookupMeta.inputCount > 0 && (
    lookupMeta.notInTakedowns.length > 0
    || lookupMeta.hiddenByFilters.length > 0
    || lookupMeta.foundCount < lookupMeta.inputCount
  )

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
  }

  return (
    <div className="relative flex-1 flex flex-col bg-slate-50 overflow-hidden">
      {/* Mobile toolbar */}
      <div className="lg:hidden shrink-0 px-2 py-2 border-b border-slate-100 bg-white space-y-2">
        <div className="flex items-center gap-1.5">
          <div className="flex items-baseline gap-1 min-w-0 shrink-0">
            <span className="text-base font-black text-slate-800 tabular-nums leading-none">
              {totalCount.toLocaleString()}
            </span>
            <span className="text-[10px] font-semibold text-slate-500">takedowns</span>
            {busy && <Loader2 className="h-3 w-3 animate-spin text-blue-600 shrink-0" />}
          </div>
          <FiltersToggle
            active={hasHiddenFilters}
            open={isMobileFiltersOpen}
            onClick={() => setIsMobileFiltersOpen(true)}
          />
          <div className="ml-auto shrink-0">
            <ReportGenerate {...reportGenerateProps} showLabel={false} />
          </div>
        </div>
        <SearchControl />
        <div className="grid grid-cols-2 gap-1.5">
          <div className="min-w-0">
            <PoiFilter
              compact
              poiOptions={poiOptions}
              initialPois={initialFilters.pois}
              onChange={(val) => handleFilterChange('pois', val || 'all')}
            />
          </div>
          <div className="min-w-0">
            <PlatformFilter
              compact
              initialPlatform={initialFilters.platform}
              onChange={(val) => handleFilterChange('platform', val)}
              availablePlatforms={['instagram', 'facebook', 'x', 'reddit', 'youtube']}
            />
          </div>
        </div>
        <BadgeRow scroll />
      </div>

      <Drawer open={isMobileFiltersOpen} onOpenChange={setIsMobileFiltersOpen} shouldScaleBackground={false}>
        <DrawerContent className="lg:hidden max-h-[96dvh] p-0 gap-0 flex flex-col">
          <DrawerHeader className="shrink-0 px-4 pt-2 pb-3 border-b border-slate-100 text-left space-y-0">
            <div className="mx-auto w-10 h-1 rounded-full bg-slate-300 mb-3" aria-hidden />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DrawerTitle className="text-lg font-black text-slate-800">Filters</DrawerTitle>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-2xl font-black text-slate-800 tabular-nums leading-none">
                    {totalCount.toLocaleString()}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">takedowns</span>
                </div>
              </div>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="shrink-0 h-8 px-2 text-rose-600 hover:bg-rose-50 text-[10px] font-bold uppercase"
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </DrawerHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
            <AdvancedFilters />
            <Button
              type="button"
              className="w-full mt-4 h-10 font-bold"
              onClick={() => setIsMobileFiltersOpen(false)}
            >
              Done
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Desktop toolbar */}
      <div className="hidden lg:block shrink-0 border-b border-slate-100 bg-white">
        <div className="px-4 py-2 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="min-w-0 shrink-0 mr-1">
                <p className="font-bold text-slate-900 tabular-nums tracking-tight leading-none text-2xl">
                  {totalCount.toLocaleString()}
                  <span className="ml-1.5 text-base font-semibold text-slate-600">
                    {totalCount === 1 ? 'takedown' : 'takedowns'}
                  </span>
                  {busy && (
                    <Loader2 className="inline ml-2 h-4 w-4 animate-spin text-slate-400 align-middle" />
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <FiltersToggle
                  active={hasHiddenFilters}
                  open={showFilters}
                  onClick={() => setShowFilters((open) => !open)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
                <SearchControl className="flex-1 min-w-[160px] max-w-sm" />
                <div className="min-w-[140px] max-w-[200px] flex-1">
                  <PoiFilter
                    compact
                    poiOptions={poiOptions}
                    initialPois={initialFilters.pois}
                    onChange={(val) => handleFilterChange('pois', val || 'all')}
                  />
                </div>
                <div className="w-[140px] shrink-0">
                  <PlatformFilter
                    compact
                    initialPlatform={initialFilters.platform}
                    onChange={(val) => handleFilterChange('platform', val)}
                    availablePlatforms={['instagram', 'facebook', 'x', 'reddit', 'youtube']}
                  />
                </div>
              </div>
            </div>
            <div className="shrink-0">
              <ReportGenerate {...reportGenerateProps} showLabel={false} />
            </div>
          </div>

          <BadgeRow />

          {showFilters && (
            <div className="pt-1 border-t border-slate-100">
              <AdvancedFilters />
            </div>
          )}
        </div>
      </div>

      {showMissBanner && (
        <div className="shrink-0 px-3 sm:px-4 pt-2">
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-semibold text-slate-700">
              <span className="font-black text-slate-900">
                {lookupMeta.foundCount} of {lookupMeta.inputCount} found
              </span>
              {lookupMeta.notInTakedowns.length > 0 && (
                <span className="text-rose-700">{lookupMeta.notInTakedowns.length} not in takedowns</span>
              )}
              {lookupMeta.hiddenByFilters.length > 0 && (
                <span className="text-amber-800">
                  {lookupMeta.hiddenByFilters.length} hidden by filters
                </span>
              )}
              {lookupMeta.truncated && (
                <span className="text-slate-500">Capped at {TAKEDOWN_URL_LOOKUP_CAP} URLs</span>
              )}
              {lookupMeta.leftoverTokens?.length > 0 && (
                <span className="text-slate-500">
                  {lookupMeta.leftoverTokens.length} non-URL token{lookupMeta.leftoverTokens.length === 1 ? '' : 's'} ignored
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {lookupMeta.hiddenByFilters.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={showHiddenByFilters}
                    className="h-7 px-2 text-[10px] font-bold border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                  >
                    Show hidden
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => setMissExpanded(v => !v)}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 hover:text-slate-900"
                >
                  Details
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", missExpanded && "rotate-180")} />
                </button>
              </div>
            </div>
            {missExpanded && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {lookupMeta.notInTakedowns.length > 0 && (
                  <div className="rounded-lg border border-rose-100 bg-white p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-rose-700">Not in takedowns</p>
                      <button
                        type="button"
                        onClick={() => copyMissUrls(lookupMeta.notInTakedowns)}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-800"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                    <ul className="max-h-28 overflow-auto space-y-1 custom-scrollbar">
                      {lookupMeta.notInTakedowns.map((u) => (
                        <li key={u} className="text-[10px] font-mono text-slate-600 break-all">{u}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {lookupMeta.hiddenByFilters.length > 0 && (
                  <div className="rounded-lg border border-amber-100 bg-white p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-800">Hidden by filters</p>
                      <button
                        type="button"
                        onClick={() => copyMissUrls(lookupMeta.hiddenByFilters)}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-800"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mb-1.5">
                      These URLs are in the takedown pipeline but don&apos;t match the filters selected. Change filters to see them.
                    </p>
                    <ul className="max-h-28 overflow-auto space-y-1 custom-scrollbar">
                      {lookupMeta.hiddenByFilters.map((u) => (
                        <li key={u} className="text-[10px] font-mono text-slate-600 break-all">{u}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 min-h-0 flex flex-col pt-0">
        <div className={cn("flex-1 min-h-0 bg-white shadow-sm border border-slate-200 flex flex-col overflow-hidden transition-opacity duration-300 md:border-x-0 md:rounded-none", busy && "opacity-60")}>
          <div className="overflow-auto flex-1 relative custom-scrollbar">
            {takedowns.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-24 text-slate-400">
                <div className="w-16 sm:w-20 h-16 sm:h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 border border-slate-100">
                  <ShieldAlert className="w-6 h-6 sm:w-8 sm:h-8 opacity-20 text-slate-500" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-700 mb-1">
                  {urlModeActive ? 'No matching takedowns' : 'No active takedowns found'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm text-center px-4">
                  {urlModeActive && lookupMeta.hiddenByFilters.length > 0
                    ? 'Some pasted links match takedowns but are hidden by the current filters. Clear status/visibility or click Show hidden.'
                    : urlModeActive && lookupMeta.notInTakedowns.length > 0
                      ? 'None of these links are in the takedown pipeline for this project.'
                      : 'Try adjusting your filters or checking back later.'}
                </p>
                {hasActiveFilters && (
                  <Button variant="outline" onClick={clearFilters} className="mt-6 border-slate-200 font-bold text-[10px] sm:text-xs uppercase tracking-wider">
                    Clear all filters
                  </Button>
                )}
              </div>
            ) : (
              <table className="min-w-full table-fixed border-separate border-spacing-0">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50/90 backdrop-blur-md">
                    <th scope="col" className="w-10 sm:w-12 px-2 sm:px-4 py-3 text-center border-b border-slate-100">
                      <input
                        type="checkbox"
                        checked={isAllCurrentPageSelected}
                        ref={input => {
                          if (input) {
                            input.indeterminate = isSomeCurrentPageSelected && !isAllCurrentPageSelected
                          }
                        }}
                        onChange={() => toggleSelectAll()}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th scope="col" className="w-14 sm:w-16 px-2 sm:px-3 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell border-b border-slate-100">Risk</th>
                    <th scope="col" className="w-28 sm:w-32 px-2 sm:px-3 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell border-b border-slate-100">Status</th>
                    <th scope="col" className="px-2 sm:px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-full min-w-[200px] border-b border-slate-100">Content</th>
                    <th scope="col" className="w-64 px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell border-b border-slate-100">Violations</th>
                    <th scope="col" className="w-28 px-3 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden xl:table-cell border-b border-slate-100">Publish Date</th>
                    <th scope="col" className="w-28 px-3 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden xl:table-cell border-b border-slate-100">Takedown Start Date</th>
                    <th scope="col" className="w-28 px-3 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden xl:table-cell border-b border-slate-100">Takedown Success Date</th>
                    <th scope="col" className="w-10 sm:w-12 px-2 sm:px-4 py-3 text-right border-b border-slate-100"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {takedowns.map((item) => {
                    const statusConfig = getStatusConfig(item.status)
                    const risk = getRiskLabel(item.risk_score)
                    const RiskIcon = risk.icon
                    const StatusIcon = statusConfig.icon

                    return (
                      <tr
                        key={item.id}
                        className="group hover:bg-slate-50/80 transition-all cursor-pointer"
                        onClick={(e) => {
                          if (e.target.type === 'checkbox') return
                          openCaseInNewTab(item.id)
                        }}
                      >
                        <td className="px-2 sm:px-4 py-2 whitespace-nowrap align-middle text-center border-b border-slate-50" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={!!selectedCases[item.id]}
                            onChange={() => toggleSelectId(item)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-2 sm:px-3 py-2 whitespace-nowrap align-middle text-center hidden sm:table-cell border-b border-slate-50">
                          <div className={cn("flex flex-col items-center justify-center p-1.5 rounded-lg text-[10px] font-black tracking-wide border shadow-sm mx-auto w-12", risk.color)}>
                            <RiskIcon className="w-4 h-4 mb-1" />
                            <span className="uppercase text-[8px] leading-none">{risk.label}</span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 py-3 whitespace-nowrap align-middle hidden md:table-cell text-center border-b border-slate-50">
                          <div className="flex flex-col items-center gap-1.5">
                            <div className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md border shadow-sm", statusConfig.color)}>
                              <StatusIcon className="w-3 h-3 shrink-0" />
                              <span className="text-[10px] font-bold uppercase tracking-tight leading-none">
                                {statusConfig.label}
                              </span>
                            </div>
                            {item.visibility_status === 'down' ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-500 uppercase tracking-tighter shadow-sm">
                                Taken Down
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-100 text-emerald-700 uppercase tracking-tighter shadow-sm">
                                Online
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-1 overflow-hidden align-middle border-b border-slate-50">
                          <div className="flex gap-3 sm:gap-4">
                            <div className="w-18 h-18 sm:w-32 sm:h-32 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shadow-sm relative shrink-0">
                              {item.enrichment?.thumbnail ? (
                                <img
                                  src={item.enrichment.thumbnail}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                  alt=""
                                />
                              ) : (
                                <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                                  <ImageIcon className="h-6 w-6 sm:h-8 sm:w-8 text-slate-300" />
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0 gap-1">
                              <div className="flex items-center gap-2">
                                <div
                                  className="font-semibold text-slate-600 rounded-full bg-slate-50 max-w-5 flex items-center justify-center p-1"
                                  title={item.platform?.charAt(0).toUpperCase() + item.platform?.slice(1)}
                                >
                                  {item.platform?.toLowerCase() === 'instagram' ? <Instagram className="size-4 sm:size-5 text-pink-500" />
                                    : item.platform?.toLowerCase() === 'facebook' ? <Facebook className="size-4 sm:size-5 shrink-0 text-blue-600" />
                                      : item.platform?.toLowerCase() === 'x' ? <Twitter className="size-4 sm:size-5 text-slate-900" />
                                        : item.platform?.toLowerCase() === 'youtube' ? <Youtube className="size-4 sm:size-5 text-red-600" />
                                          : item.platform?.toLowerCase() === 'reddit' ? <Reddit className="size-4 sm:size-5" />
                                            : <span className="text-[10px] font-bold text-slate-400">{item.platform?.slice(0, 1).toUpperCase()}</span>
                                  }
                                </div>
                                <span className="text-xs text-slate-400">•</span>
                                <span className="font-bold text-slate-900 text-xs sm:text-sm truncate transition-colors max-w-[80px] sm:max-w-none">
                                  {item.enrichment?.username ? `@${item.enrichment.username}` : `Case #${item.id?.substring(0, 8)}`}
                                </span>
                                {item.url && (
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center tracking-tight text-blue-600 hover:text-blue-800 font-bold text-xs transition-colors hover:underline bg-blue-50 px-1.5 py-0.5 rounded-md shrink-0"
                                  >
                                    Source <ExternalLink className="w-3 h-3 ml-1" />
                                  </a>
                                )}
                                <span className="sm:hidden ml-auto">
                                  <span className={cn("inline-flex items-center p-1 rounded-md text-[10px] font-bold border shadow-sm", risk.color)}>
                                    <RiskIcon className="w-2.5 h-2.5" />
                                  </span>
                                </span>
                              </div>
                              <span className="text-[10px] sm:text-xs text-slate-600 line-clamp-2 leading-relaxed">
                                {item.enrichment?.caption || <span className="italic text-slate-400">No caption content.</span>}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 align-middle hidden lg:table-cell border-b border-slate-50">
                          <div className="flex flex-wrap gap-1.5">
                            {item.threat_types?.length > 0 ? item.threat_types.map((type, idx) => (
                              <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider shadow-sm text-slate-600 bg-slate-50 border-slate-200">
                                {type.replace(/_/g, ' ')}
                              </span>
                            )) : item.violations_unknown === false ? (
                              <span className="text-[9px] font-bold text-slate-400">-</span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Unknown</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap align-middle hidden xl:table-cell border-b border-slate-50">
                          <div className="flex flex-col gap-1 justify-center items-center text-sm font-semibold text-slate-500">
                            <span>{item.posted_at ? format(new Date(item.posted_at), "dd/MM/yyyy") : '-'}</span>
                            <span className="text-xs text-slate-400">
                              {item.posted_at ? format(new Date(item.posted_at), "hh:mm a") : ''}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap align-middle hidden xl:table-cell border-b border-slate-50">
                          <div className="flex flex-col gap-1 justify-center items-center text-sm font-semibold text-slate-500">
                            <span>{item.takedown_start_date ? format(new Date(item.takedown_start_date), "dd/MM/yyyy") : '-'}</span>
                            <span className="text-xs text-slate-400">
                              {item.takedown_start_date ? format(new Date(item.takedown_start_date), "hh:mm a") : ''}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap align-middle hidden xl:table-cell border-b border-slate-50">
                          <div className="flex flex-col gap-1 justify-center items-center text-sm font-semibold text-slate-500">
                            <span>{item.takedown_successful_date ? format(new Date(item.takedown_successful_date), "dd/MM/yyyy") : '-'}</span>
                            <span className="text-xs text-slate-400">
                              {item.takedown_successful_date ? format(new Date(item.takedown_successful_date), "hh:mm a") : ''}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 whitespace-nowrap align-middle text-right border-b border-slate-50">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 sm:h-8 sm:w-8 p-0 rounded-full hover:bg-slate-100 text-slate-300 hover:text-slate-900 transition-all"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {totalCount > 0 && (
        <div className="px-3 sm:px-6 pb-2 pt-2">
          <div className="px-3 sm:px-4 py-1 flex flex-col lg:flex-row items-center justify-between gap-3 lg:gap-0">
            <div className="flex items-center justify-between w-full lg:w-auto gap-4 sm:gap-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap hidden sm:inline">Show:</span>
                <div className="flex bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                  {[10, 25, 50, 75, 100].map((limit) => (
                    <button
                      key={limit}
                      onClick={() => updateQueryParams({ pageSize: limit.toString(), page: 1 })}
                      className={cn(
                        "px-2 sm:px-2.5 py-1 text-[10px] font-bold transition-all rounded-md cursor-pointer",
                        pageSize === limit
                          ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200"
                          : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                      )}
                    >
                      {limit}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                Page <span className="text-slate-900">{currentPage}</span> / <span className="text-slate-900">{totalPages || 1}</span>
              </div>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1 sm:gap-2 w-full lg:w-auto justify-between lg:justify-end mt-2 lg:mt-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="h-8 sm:h-9 px-2 sm:px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50 flex-1 sm:flex-none"
                >
                  <ChevronLeft className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Previous</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="h-8 sm:h-9 px-2 sm:px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50 flex-1 sm:flex-none"
                >
                  <span className="hidden sm:inline">Next</span> <ChevronRight className="w-4 h-4 sm:ml-1" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 -translate-x-1/2 z-100 w-[calc(100%-2.5rem)] max-w-[400px] md:w-auto px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300 border backdrop-blur-xl",
            toast.type === 'success'
              ? "bg-emerald-600/90 text-white border-emerald-400/50 shadow-emerald-900/20"
              : "bg-rose-600/90 text-white border-rose-400/50 shadow-rose-900/20"
          )}
        >
          <div className="flex items-center gap-3 w-full">
            <div className={cn(
              "shrink-0 p-1.5 rounded-xl bg-white/20",
              toast.type === 'success' ? "text-emerald-50" : "text-rose-50"
            )}>
              {toast.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight">{toast.message}</p>
            </div>
            <button onClick={() => setToast(null)} className="shrink-0 p-1 hover:bg-white/10 rounded-lg transition-colors">
              <X className="w-4 h-4 opacity-70 hover:opacity-100" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
