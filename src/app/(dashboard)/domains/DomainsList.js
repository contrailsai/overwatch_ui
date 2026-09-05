'use client'

import { useState, useCallback, useEffect, useTransition, useRef } from 'react'
import {
  Globe, Search, X, ChevronLeft, ChevronRight, Loader2,
  CheckCircle, ClockFading, Info, Siren, ArrowUpDown, ArrowUp, ArrowDown, ArrowRight, Filter,
  TriangleAlert, TrendingDown, Smile,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  domainScreenshotUrl,
  isDomainOnline,
  domainHasCloaking,
  collectDomainViolations,
} from '@/lib/domains/domain-display'
import { DateFilterPopover } from '@/components/DateFilterPopover'
import { getDomainById } from './actions'
import DomainDetailPanel from './DomainDetails'

const CLIENT_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'To Be Reviewed', label: 'To Review' },
  { value: 'No Action', label: 'No Action' },
  { value: 'Flag for Takedown', label: 'Takedown' },
]

const RISK_OPTIONS = [
  { value: 'all', label: 'All risk' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'safe', label: 'Safe' },
]

const VISIBILITY_OPTIONS = [
  { value: 'all', label: 'All visibility' },
  { value: 'online', label: 'Active only' },
]

const FILTER_LABEL = 'text-[10px] font-bold text-slate-500 uppercase tracking-wide'
const FILTER_TRIGGER =
  'w-full h-8 text-xs bg-slate-50 border-slate-200 hover:border-slate-300 focus:ring-blue-500/20 px-2.5'

function FilterField({ label, children, className }) {
  return (
    <div className={cn('space-y-0.5 min-w-[140px] flex-1', className)}>
      <Label className={FILTER_LABEL}>{label}</Label>
      {children}
    </div>
  )
}

const getRiskBadge = (risk) => {
  const v = typeof risk === 'string' ? risk.toLowerCase() : risk
  if (v === 'high') return { label: 'High', className: 'text-rose-700 bg-rose-50 border-rose-300' }
  if (v === 'mid' || v === 'medium') return { label: 'Medium', className: 'text-orange-800 bg-orange-100 border-orange-300' }
  if (v === 'low') return { label: 'Low', className: 'text-amber-800 bg-amber-100 border-amber-300' }
  return { label: 'Safe', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
}

const getStatusConfig = (status) => {
  if (status === 'To Be Reviewed' || !status) {
    return { label: 'To Review', color: 'text-slate-700 bg-slate-100 border-slate-200', icon: ClockFading }
  }
  if (status === 'No Action' || status === 'Pass') {
    return { label: 'No Action', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle }
  }
  if (status === 'Flag for Takedown') {
    return { label: 'Takedown', color: 'text-rose-700 bg-rose-50 border-rose-200', icon: Siren }
  }
  return { label: status, color: 'text-slate-600 bg-slate-50 border-slate-200', icon: Info }
}

function DomainListRow({ domain, isActive, onOpen, compact }) {
  const risk = getRiskBadge(domain.risk_rank || domain.list?.risk_rank)
  const thumb = domainScreenshotUrl(domain)
  const online = isDomainOnline(domain)
  const cloaked = domain.isCloaked || domainHasCloaking(domain) || domain.discovery?.cloak_unlocked
  const adCount = domain.occurrence_count ?? 0
  const statusCfg = getStatusConfig(domain.client_status)
  const StatusIcon = statusCfg.icon
  const alertDate = domain.reviewed_at || domain.list?.reviewed_at

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(domain)}
        className={cn(
          'w-full text-left flex gap-2.5 transition-colors duration-150',
          compact ? 'px-3 py-2.5' : 'px-4 py-3',
          isActive
            ? 'bg-blue-50/90 border-l-2 border-l-blue-600'
            : 'hover:bg-slate-50/80 border-l-2 border-l-transparent',
        )}
      >
        <div className={cn(
          'rounded-lg border border-slate-200/80 bg-slate-100 overflow-hidden shrink-0',
          compact ? 'h-11 w-11' : 'h-14 w-14',
        )}>
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-full w-full object-cover object-top" />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <Globe className="h-4 w-4 text-slate-300" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <span className={cn(
              'font-mono font-bold text-slate-800 truncate',
              compact ? 'text-xs' : 'text-sm',
            )}>
              {domain.domain_name}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {cloaked && (
                <span className="inline-flex px-1 py-0.5 rounded text-[7px] font-black bg-violet-100 text-violet-700 uppercase">
                  Cloak
                </span>
              )}
              {online ? (
                <span className="inline-flex px-1 py-0.5 rounded text-[7px] font-black bg-emerald-100 text-emerald-700 uppercase">
                  Online
                </span>
              ) : (
                <span className="inline-flex px-1 py-0.5 rounded text-[7px] font-black bg-slate-100 text-slate-500 uppercase">
                  Down
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 flex-wrap">
            <span className={cn('font-medium px-1 py-0.5 rounded border shrink-0', risk.className)}>
              {risk.label}
            </span>
            <span className={cn(
              'inline-flex items-center gap-0.5 font-medium px-1 py-0.5 rounded border shrink-0',
              statusCfg.color,
            )}>
              <StatusIcon className="w-2.5 h-2.5" />
              {statusCfg.label}
            </span>
            {collectDomainViolations(domain).slice(0, 2).map((v) => (
              <span
                key={v}
                className="font-medium px-1 py-0.5 rounded border shrink-0 text-slate-600 bg-slate-50 border-slate-200 uppercase"
              >
                {v.replace(/[-_]/g, ' ')}
              </span>
            ))}
            <span className="tabular-nums font-semibold text-slate-600 shrink-0">
              {adCount.toLocaleString()} {adCount === 1 ? 'ad' : 'ads'}
            </span>
            {alertDate && (
              <span className="ml-auto text-slate-400 tabular-nums shrink-0">
                {format(new Date(alertDate), 'dd MMM')}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  )
}

function DomainRiskCell({ risk }) {
  return (
    <div className={cn('flex flex-col items-center justify-center p-1.5 rounded-lg text-[10px] font-black tracking-wide border shadow-sm mx-auto w-12', risk.className)}>
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

function DomainTableRow({ domain, onOpen }) {
  const risk = getRiskBadge(domain.risk_rank || domain.list?.risk_rank)
  const thumb = domainScreenshotUrl(domain)
  const online = isDomainOnline(domain)
  const cloaked = domain.isCloaked || domainHasCloaking(domain) || domain.discovery?.cloak_unlocked
  const adCount = domain.occurrence_count ?? 0
  const statusCfg = getStatusConfig(domain.client_status)
  const StatusIcon = statusCfg.icon
  const alertDate = domain.reviewed_at || domain.list?.reviewed_at
  const violations = collectDomainViolations(domain)

  return (
    <tr onClick={() => onOpen(domain)} className="transition-all cursor-pointer group hover:bg-slate-50">
      <td className="px-2 sm:px-3 whitespace-nowrap align-middle hidden sm:table-cell border-b border-slate-50">
        <DomainRiskCell risk={risk} />
      </td>
      <td className="px-2 sm:px-3 whitespace-nowrap align-middle hidden md:table-cell text-center border-b border-slate-50">
        <div
          className={cn('inline-flex items-center justify-center w-8 h-8 rounded-full border shadow-sm mx-auto', statusCfg.color)}
          title={statusCfg.label}
        >
          <StatusIcon className="w-4 h-4" />
        </div>
      </td>
      <td className="px-2 sm:px-4 py-2.5 align-middle border-b border-slate-50 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-12 w-12 rounded-lg border border-slate-200/80 bg-slate-100 overflow-hidden shrink-0">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="h-full w-full object-cover object-top" />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Globe className="h-4 w-4 text-slate-300" />
              </div>
            )}
          </div>
          <span className="font-mono text-[13px] font-bold text-slate-800 truncate">{domain.domain_name}</span>
        </div>
      </td>
      <td className="px-2 py-2.5 align-middle hidden lg:table-cell border-b border-slate-50">
        <div className="flex flex-wrap gap-1 max-w-[180px]">
          {violations.length > 0 ? (
            violations.slice(0, 3).map((v) => (
              <span
                key={v}
                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider text-slate-700 bg-slate-50 border-slate-200"
              >
                {v.replace(/[-_]/g, ' ')}
              </span>
            ))
          ) : (
            <span className="text-[11px] text-slate-300">—</span>
          )}
          {violations.length > 3 && (
            <span className="text-[10px] font-semibold text-slate-400">+{violations.length - 3}</span>
          )}
        </div>
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap align-middle hidden lg:table-cell border-b border-slate-50">
        {cloaked ? (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-violet-50 text-violet-700 border-violet-200">Cloak</span>
        ) : (
          <span className="text-[11px] text-slate-300">—</span>
        )}
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap align-middle hidden lg:table-cell border-b border-slate-50">
        <span className={cn(
          'text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase',
          online
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-slate-100 text-slate-500 border-slate-200',
        )}>
          {online ? 'Online' : 'Down'}
        </span>
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap align-middle hidden xl:table-cell border-b border-slate-50">
        <span className="text-[11px] text-slate-600 tabular-nums font-semibold">
          {adCount.toLocaleString()}
        </span>
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap align-middle hidden lg:table-cell border-b border-slate-50">
        <span className="text-[11px] text-slate-600 tabular-nums">
          {alertDate ? format(new Date(alertDate), 'dd MMM yyyy') : '—'}
        </span>
      </td>
      <td className="px-2 sm:px-4 py-2.5 whitespace-nowrap align-middle border-b border-slate-50 text-right">
        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 inline-block" />
      </td>
    </tr>
  )
}

function SearchField({ value, onChange, onSubmit, onClear, className }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onSubmit}
        placeholder="Search domains…"
        className="w-full h-8 bg-slate-50 border border-slate-200 rounded-md pl-8 pr-8 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

export function DomainsList({
  domains,
  project,
  initialFilters,
  initialSort = { field: null, direction: 'desc' },
  currentPage,
  itemsPerPage,
  initialDomain = null,
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const totalCount = domains?.totalCount || 0
  const totalPages = domains?.totalPages || 0
  const domainList = domains?.domains || []

  const [localDomains, setLocalDomains] = useState(domainList)
  const [selectedDomain, setSelectedDomain] = useState(initialDomain || null)
  const [searchInput, setSearchInput] = useState(initialFilters.searchText || '')
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const [listCollapsed, setListCollapsed] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const detailRequestId = useRef(0)
  const [, startTransition] = useTransition()

  useEffect(() => {
    setLocalDomains(domainList)
  }, [domainList])

  useEffect(() => {
    setSearchInput(initialFilters.searchText || '')
  }, [initialFilters.searchText])

  useEffect(() => {
    if (initialDomain) {
      setSelectedDomain(initialDomain)
      setDetailError(null)
      setDetailLoading(false)
    }
  }, [initialDomain])

  const updateQueryParams = useCallback((newParams) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === undefined || value === 'all' || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }, [router, pathname, searchParams])

  const activeOnly = initialFilters.visibility_status === 'online'

  const openDomain = useCallback(async (domain) => {
    if (!domain?._id) return
    const requestId = ++detailRequestId.current
    setSelectedDomain(domain)
    setDetailError(null)
    setDetailLoading(true)
    updateQueryParams({ domain_id: domain._id })

    try {
      const full = await getDomainById(domain._id)
      if (requestId !== detailRequestId.current) return
      if (!full) {
        setDetailError('Failed to load domain details')
        return
      }
      setSelectedDomain(full)
    } catch {
      if (requestId !== detailRequestId.current) return
      setDetailError('Failed to load domain details')
    } finally {
      if (requestId === detailRequestId.current) {
        setDetailLoading(false)
      }
    }
  }, [updateQueryParams])

  const closeDomain = useCallback(() => {
    setSelectedDomain(null)
    setDetailLoading(false)
    setDetailError(null)
    setListCollapsed(false)
    updateQueryParams({ domain_id: null })
  }, [updateQueryParams])

  const handleDomainUpdate = (domainId, updates) => {
    setLocalDomains((prev) => prev.map((d) => (d._id === domainId ? { ...d, ...updates } : d)))
    if (selectedDomain?._id === domainId) {
      setSelectedDomain((prev) => ({ ...prev, ...updates }))
    }
    router.refresh()
  }

  const selectedIndex = selectedDomain
    ? localDomains.findIndex((d) => d._id === selectedDomain._id)
    : -1

  const navigateDomain = useCallback((dir) => {
    if (selectedIndex < 0) return
    const next = localDomains[selectedIndex + dir]
    if (next) openDomain(next)
  }, [selectedIndex, localDomains, openDomain])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedDomain) return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); navigateDomain(-1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); navigateDomain(1) }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedDomain, navigateDomain])

  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      updateQueryParams({ search: searchInput, page: 1 })
    }
  }

  const handlePageChange = (newPage) => (
    newPage >= 1 && newPage <= totalPages && updateQueryParams({ page: newPage })
  )

  const handleSortChange = (field) => {
    const direction = (initialSort.field === field && initialSort.direction === 'desc') ? 'asc' : 'desc'
    updateQueryParams({
      sortField: field,
      sortDirection: direction,
      page: 1,
    })
  }

  const clearFilters = () => {
    setSearchInput('')
    startTransition(() => {
      router.push(pathname)
    })
  }

  const SortIcon = ({ field }) => {
    if (initialSort.field !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 ml-1.5" />
    if (initialSort.direction === 'asc') return <ArrowUp className="w-3.5 h-3.5 text-blue-600 ml-1.5" />
    return <ArrowDown className="w-3.5 h-3.5 text-blue-600 ml-1.5" />
  }

  const hasActiveFilter = (
    initialFilters.status !== 'all'
    || Boolean(initialFilters.searchText)
    || (initialFilters.risk && initialFilters.risk !== 'all')
    || Boolean(initialFilters.alert_date_from)
    || Boolean(initialFilters.alert_date_to)
    || activeOnly
  )

  const listCollapsedDesktop = Boolean(selectedDomain && listCollapsed)
  const compact = Boolean(selectedDomain)

  return (
    <div className="flex h-full overflow-hidden bg-[#f4f6f8]">
      <div
        className={cn(
          'flex flex-col border-r border-slate-200/80 transition-[width] duration-200',
          selectedDomain
            ? listCollapsedDesktop
              ? 'hidden lg:flex lg:w-12 shrink-0 bg-white'
              : 'hidden lg:flex lg:w-[min(300px,26%)] xl:w-[320px] shrink-0 bg-white'
            : 'flex w-full bg-white',
        )}
      >
        {listCollapsedDesktop ? (
          <div className="flex flex-col items-center py-3 gap-2 h-full">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-500"
              onClick={() => setListCollapsed(false)}
              title="Show domain queue"
              aria-label="Show domain queue"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span
              className="text-[9px] font-bold text-slate-400 uppercase tracking-widest [writing-mode:vertical-lr] rotate-180"
              aria-hidden
            >
              Queue
            </span>
          </div>
        ) : (
          <>
            <div className={cn(
              'shrink-0 border-b border-slate-100',
              compact ? 'px-3 py-3 space-y-3' : 'px-5 py-4 space-y-3',
            )}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 mr-auto">
                  <p className={cn(
                    'font-bold text-slate-900 tabular-nums tracking-tight leading-none',
                    compact ? 'text-lg' : 'text-2xl sm:text-3xl',
                  )}>
                    {totalCount.toLocaleString()}
                    <span className={cn(
                      'ml-1.5 font-semibold text-slate-600',
                      compact ? 'text-xs' : 'ml-2 text-base sm:text-lg',
                    )}>
                      {totalCount === 1 ? 'domain' : 'domains'}
                    </span>
                  </p>
                </div>
                {selectedDomain && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-slate-400 hover:text-slate-700"
                    onClick={() => setListCollapsed(true)}
                    title="Collapse queue"
                    aria-label="Collapse queue"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                {!selectedDomain && (
                  <SearchField
                    value={searchInput}
                    onChange={setSearchInput}
                    onSubmit={handleSearchSubmit}
                    onClear={() => { setSearchInput(''); updateQueryParams({ search: null, page: 1 }) }}
                    className="flex-1 min-w-[180px] max-w-xl"
                  />
                )}
                <div className="flex items-center gap-2 shrink-0">
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

              {selectedDomain && (
                <SearchField
                  value={searchInput}
                  onChange={setSearchInput}
                  onSubmit={handleSearchSubmit}
                  onClear={() => { setSearchInput(''); updateQueryParams({ search: null, page: 1 }) }}
                  className="w-full"
                />
              )}

              {showFilters && (
                <div className="flex flex-wrap gap-x-2.5 gap-y-2.5 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                  <FilterField label="Status">
                    <Select
                      value={initialFilters.status || 'all'}
                      onValueChange={(val) => updateQueryParams({ status: val, page: 1 })}
                    >
                      <SelectTrigger size="sm" className={FILTER_TRIGGER}>
                        <SelectValue placeholder="All status" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLIENT_STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>

                  <FilterField label="Risk">
                    <Select
                      value={initialFilters.risk || 'all'}
                      onValueChange={(val) => updateQueryParams({ risk: val, page: 1 })}
                    >
                      <SelectTrigger size="sm" className={FILTER_TRIGGER}>
                        <SelectValue placeholder="All risk" />
                      </SelectTrigger>
                      <SelectContent>
                        {RISK_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>

                  <FilterField label="Visibility">
                    <Select
                      value={activeOnly ? 'online' : 'all'}
                      onValueChange={(val) => updateQueryParams({ visibility_status: val, page: 1 })}
                    >
                      <SelectTrigger size="sm" className={FILTER_TRIGGER}>
                        <SelectValue placeholder="All visibility" />
                      </SelectTrigger>
                      <SelectContent>
                        {VISIBILITY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>

                  <FilterField label="Alert date" className="min-w-[160px]">
                    <DateFilterPopover
                      title="Alert date"
                      triggerClassName="h-8 w-full bg-slate-50 border-slate-200 hover:bg-slate-50 px-2.5"
                      initialFrom={initialFilters.alert_date_from}
                      initialTo={initialFilters.alert_date_to}
                      onApply={(range) => updateQueryParams({
                        alert_date_from: range?.from ? range.from.toISOString() : null,
                        alert_date_to: range?.to ? range.to.toISOString() : null,
                        page: 1,
                      })}
                    />
                  </FilterField>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {localDomains.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 px-4 text-center">
                  <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-3 border border-slate-100">
                    <Globe className="w-6 h-6 opacity-30" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">No domains found</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-[240px]">
                    Domains appear here once reviewed. Try clearing filters.
                  </p>
                  {hasActiveFilter && (
                    <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4 h-8 text-xs">
                      <X className="w-3.5 h-3.5 mr-1.5" /> Clear filters
                    </Button>
                  )}
                </div>
              ) : selectedDomain ? (
                <ul className="divide-y divide-slate-100">
                  {localDomains.map((domain) => (
                    <DomainListRow
                      key={domain._id}
                      domain={domain}
                      isActive={selectedDomain?._id === domain._id}
                      onOpen={openDomain}
                      compact={compact}
                    />
                  ))}
                </ul>
              ) : (
                <>
                  <div className="md:hidden divide-y divide-slate-100">
                    {localDomains.map((domain) => (
                      <DomainListRow
                        key={domain._id}
                        domain={domain}
                        isActive={false}
                        onOpen={openDomain}
                        compact={false}
                      />
                    ))}
                  </div>
                  <div className="hidden md:block overflow-auto custom-scrollbar relative min-h-full">
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
                          <th scope="col" className="px-2 sm:px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider min-w-[180px] border-b border-slate-100">
                            Domain
                          </th>
                          <th scope="col" className="w-44 px-2 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell border-b border-slate-100">
                            Violations
                          </th>
                          <th scope="col" className="w-20 px-2 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell border-b border-slate-100">
                            Cloak
                          </th>
                          <th scope="col" className="w-24 px-2 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell border-b border-slate-100">
                            Online
                          </th>
                          <th
                            scope="col"
                            className="w-20 px-2 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors group select-none hidden xl:table-cell border-b border-slate-100"
                            onClick={() => handleSortChange('occurrences')}
                          >
                            <div className="flex items-center">
                              Ads
                              <SortIcon field="occurrences" />
                            </div>
                          </th>
                          <th
                            scope="col"
                            className="w-28 px-2 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors group select-none hidden lg:table-cell border-b border-slate-100"
                            onClick={() => handleSortChange('reviewed_at')}
                          >
                            <div className="flex items-center">
                              Alert
                              <SortIcon field="reviewed_at" />
                            </div>
                          </th>
                          <th scope="col" className="w-12 sm:w-14 px-2 sm:px-4 py-3 text-right border-b border-slate-100" />
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {localDomains.map((domain) => (
                          <DomainTableRow
                            key={domain._id}
                            domain={domain}
                            onOpen={openDomain}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {(totalPages > 1 || totalCount > 0) && (
              <div className="p-2 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1">
                  {[10, 25, 50].map((limit) => (
                    <button
                      key={limit}
                      type="button"
                      onClick={() => updateQueryParams({ limit: String(limit), page: 1 })}
                      className={cn(
                        'px-1.5 py-0.5 text-[9px] font-bold rounded transition-colors',
                        itemsPerPage === limit
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100',
                      )}
                    >
                      {limit}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="h-7 px-2 text-xs"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider tabular-nums">
                    {currentPage} / {totalPages || 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="h-7 px-2 text-xs"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedDomain && (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#f4f6f8] animate-in fade-in duration-200">
          <div className="lg:hidden shrink-0 flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200">
            <Button variant="ghost" size="sm" onClick={closeDomain}>
              <X className="h-4 w-4 mr-1" /> Back
            </Button>
          </div>
          {detailLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              <p className="text-sm font-medium">Loading domain details…</p>
              {selectedDomain.domain_name && (
                <p className="text-xs text-slate-400 font-mono">{selectedDomain.domain_name}</p>
              )}
            </div>
          ) : detailError ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-rose-600">{detailError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openDomain(
                  localDomains.find((d) => d._id === selectedDomain._id) || selectedDomain,
                )}
              >
                Retry
              </Button>
            </div>
          ) : (
            <DomainDetailPanel
              domain={selectedDomain}
              project={project}
              onClose={closeDomain}
              onUpdate={handleDomainUpdate}
              onNavigate={navigateDomain}
              hasNext={selectedIndex >= 0 && selectedIndex < localDomains.length - 1}
              hasPrev={selectedIndex > 0}
            />
          )}
        </div>
      )}
    </div>
  )
}
