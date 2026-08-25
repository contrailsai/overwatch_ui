'use client'

import { useState, useCallback, useEffect, useTransition, useRef } from 'react'
import {
  Globe, Search, X, ChevronLeft, ChevronRight, Calendar, Loader2,
  CheckCircle, ClockFading, Info, Siren, ArrowUpDown, Filter,
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
} from '@/lib/domains/domain-display'
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

const SORT_OPTIONS = [
  { field: 'last_seen', label: 'Last seen' },
  { field: 'risk', label: 'Risk' },
  { field: 'occurrences', label: 'Seen' },
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
    <div className={cn('space-y-0.5 min-w-0', className)}>
      <Label className={FILTER_LABEL}>{label}</Label>
      {children}
    </div>
  )
}

const getRiskBadge = (risk) => {
  const v = typeof risk === 'string' ? risk.toLowerCase() : risk
  if (v === 'high') return { label: 'High', className: 'text-rose-600 bg-rose-50 border-rose-200' }
  if (v === 'mid' || v === 'medium') return { label: 'Medium', className: 'text-orange-600 bg-orange-50 border-orange-200' }
  if (v === 'low') return { label: 'Low', className: 'text-amber-600 bg-amber-50 border-amber-200' }
  return { label: 'Safe', className: 'text-emerald-600 bg-emerald-50 border-emerald-200' }
}

const getStatusConfig = (status) => {
  if (status === 'To Be Reviewed' || !status) {
    return { label: 'To Review', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: ClockFading }
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
            <span className="tabular-nums font-semibold text-slate-600 shrink-0">
              {adCount.toLocaleString()} {adCount === 1 ? 'ad' : 'ads'}
            </span>
            {domain.last_seen_at && (
              <span className="ml-auto flex items-center gap-0.5 text-slate-400 tabular-nums shrink-0">
                <Calendar className="w-2.5 h-2.5" /> {format(new Date(domain.last_seen_at), 'dd MMM')}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
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

  const handleSortFieldChange = (field) => {
    updateQueryParams({
      sortField: field,
      sortDirection: initialSort.field === field ? initialSort.direction : 'desc',
      page: 1,
    })
  }

  const toggleSortDirection = () => {
    const next = initialSort.direction === 'asc' ? 'desc' : 'asc'
    updateQueryParams({
      sortField: initialSort.field || 'last_seen',
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

  const hasActiveFilter = (
    initialFilters.status !== 'all'
    || Boolean(initialFilters.searchText)
    || (initialFilters.risk && initialFilters.risk !== 'all')
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
                    className="flex-1 min-w-[180px] max-w-sm"
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
                <div className={cn(
                  'grid gap-x-2.5 gap-y-2.5 pt-1',
                  compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
                )}>
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

                  <FilterField label="Sort">
                    <div className="flex gap-1.5">
                      <Select
                        value={initialSort.field || 'last_seen'}
                        onValueChange={handleSortFieldChange}
                      >
                        <SelectTrigger size="sm" className={cn(FILTER_TRIGGER, 'flex-1')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SORT_OPTIONS.map((opt) => (
                            <SelectItem key={opt.field} value={opt.field}>{opt.label}</SelectItem>
                          ))}
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
              ) : (
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
