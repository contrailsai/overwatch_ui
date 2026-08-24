'use client'

import { useState, useCallback, useEffect, useTransition, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import {
  Globe, Search, X, ChevronLeft, ChevronRight, Calendar, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { getRiskLabel } from '@/app/(dashboard)/cases/riskBuckets'
import { domainScreenshotUrl, isDomainOnline } from '@/lib/domains/domain-display'
import { getDomainById } from './actions'
import ReviewDomainForm from './ReviewDomainDetails'

function DomainListRow({ domain, isActive, onOpen }) {
  const risk = getRiskLabel(domain.score)
  const thumb = domainScreenshotUrl(domain)
  const online = isDomainOnline(domain)
  const adCount = domain.occurrence_count ?? 0

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(domain)}
        className={cn(
          'w-full text-left px-3 py-2.5 flex gap-2.5 transition-colors duration-150',
          isActive
            ? 'bg-blue-50/90 border-l-2 border-l-blue-600'
            : 'hover:bg-slate-50/80 border-l-2 border-l-transparent',
        )}
      >
        <div className="h-11 w-11 rounded-lg border border-slate-200/80 bg-slate-100 overflow-hidden shrink-0">
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
            <span className="font-mono font-bold text-xs text-slate-800 truncate">{domain.domain_name}</span>
            {online ? (
              <span className="inline-flex px-1 py-0.5 rounded text-[7px] font-black bg-emerald-100 text-emerald-700 uppercase shrink-0">
                Online
              </span>
            ) : (
              <span className="inline-flex px-1 py-0.5 rounded text-[7px] font-black bg-slate-100 text-slate-500 uppercase shrink-0">
                Down
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500">
            <span className={cn('font-medium px-1 py-0.5 rounded border shrink-0', risk.color)}>
              {risk.label}
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

export function ReviewDomainsInterface({
  initialDomains,
  totalPages,
  currentPage,
  initialFilters,
  totalCount,
  initialDomain,
  itemsPerPage,
  project,
  clientDetails,
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [domains, setDomains] = useState(
    Array.isArray(initialDomains) ? initialDomains : (initialDomains?.domains || []),
  )
  const [searchInput, setSearchInput] = useState(initialFilters.search || '')
  const [selectedDomain, setSelectedDomain] = useState(initialDomain || null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const [listCollapsed, setListCollapsed] = useState(false)
  const detailRequestId = useRef(0)
  const [, startTransition] = useTransition()

  useEffect(() => {
    setDomains(Array.isArray(initialDomains) ? initialDomains : (initialDomains?.domains || []))
  }, [initialDomains])

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
      if (
        value === null ||
        value === undefined ||
        (key !== 'status' && value === 'all')
      ) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })
    if (!newParams.page) params.delete('page')
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }, [router, pathname, searchParams])

  const activeOnly = initialFilters.visibility_status === 'online'
  const toggleActiveOnly = () => {
    updateQueryParams({
      visibility_status: activeOnly ? 'all' : 'online',
      page: 1,
    })
  }

  const openDomain = async (domain) => {
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
  }

  const closeDomain = () => {
    setSelectedDomain(null)
    setDetailLoading(false)
    setDetailError(null)
    setListCollapsed(false)
    updateQueryParams({ domain_id: null })
  }

  const selectedIndex = selectedDomain
    ? domains.findIndex((d) => d._id === selectedDomain._id)
    : -1

  const navigateDomain = (dir) => {
    if (selectedIndex < 0) return
    const next = domains[selectedIndex + dir]
    if (next) openDomain(next)
  }

  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      updateQueryParams({ search: searchInput, page: 1 })
    }
  }

  const handlePageChange = (newPage) => newPage >= 1 && newPage <= totalPages && updateQueryParams({ page: newPage })

  const listCollapsedDesktop = Boolean(selectedDomain && listCollapsed)

  return (
    <div className="flex h-full overflow-hidden bg-[#f4f6f8]">
      <div
        className={cn(
          'flex flex-col border-r border-slate-200/80 transition-[width] duration-200',
          selectedDomain
            ? listCollapsedDesktop
              ? 'hidden lg:flex lg:w-12 shrink-0 bg-white'
              : 'hidden lg:flex lg:w-[min(280px,22%)] xl:w-[300px] shrink-0 bg-white'
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
                selectedDomain ? 'px-3 py-3 space-y-2' : 'px-5 py-4 space-y-3',
              )}>
              <div className="flex items-center gap-2">
                <div className="min-w-0 mr-auto">
                  <p className={cn(
                    'font-bold text-slate-900 tabular-nums tracking-tight leading-none',
                    selectedDomain ? 'text-lg' : 'text-2xl sm:text-3xl',
                  )}>
                    {totalCount.toLocaleString()}
                    <span className={cn(
                      'ml-1.5 font-semibold text-slate-600',
                      selectedDomain ? 'text-xs' : 'ml-2 text-base sm:text-lg',
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
                  <div className="relative flex-1 min-w-[180px] max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={handleSearchSubmit}
                      placeholder="Search domains…"
                      className="w-full h-8 bg-slate-50 border border-slate-200 rounded-md pl-8 pr-8 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    {searchInput && (
                      <button
                        type="button"
                        onClick={() => { setSearchInput(''); updateQueryParams({ search: null, page: 1 }) }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                        aria-label="Clear search"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {selectedDomain && (
                <div className="relative w-full">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleSearchSubmit}
                    placeholder="Search domains…"
                    className="w-full h-8 bg-slate-50 border border-slate-200 rounded-md pl-8 pr-8 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => { setSearchInput(''); updateQueryParams({ search: null, page: 1 }) }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      aria-label="Clear search"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {['pending', 'reviewed', 'all'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => updateQueryParams({ status: s, page: 1 })}
                    className={cn(
                      'px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-colors',
                      initialFilters.status === s ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                    )}
                  >
                    {s}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={toggleActiveOnly}
                  className={cn(
                    'ml-auto px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-colors',
                    activeOnly
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                  )}
                  title="Show only domains that are still online"
                >
                  Active only
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {domains.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 px-4 text-center">
                  <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-3 border border-slate-100">
                    <Globe className="w-6 h-6 opacity-30" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">No domains in this queue</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {domains.map((domain) => (
                    <DomainListRow
                      key={domain._id}
                      domain={domain}
                      isActive={selectedDomain?._id === domain._id}
                      onOpen={openDomain}
                    />
                  ))}
                </ul>
              )}
            </div>

            {totalPages > 1 && (
              <div className="p-2 border-t border-slate-100 flex items-center justify-between shrink-0">
                <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="h-8 px-2 text-xs">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Page {currentPage} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="h-8 px-2 text-xs">
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
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
                onClick={() => openDomain(domains.find((d) => d._id === selectedDomain._id) || selectedDomain)}
              >
                Retry
              </Button>
            </div>
          ) : (
            <ReviewDomainForm
              domain={selectedDomain}
              project={project}
              clientDetails={clientDetails}
              onClose={closeDomain}
              onNavigate={navigateDomain}
              hasPrev={selectedIndex > 0}
              hasNext={selectedIndex >= 0 && selectedIndex < domains.length - 1}
              setDomains={setDomains}
              setSelectedDomain={setSelectedDomain}
            />
          )}
        </div>
      )}
    </div>
  )
}
