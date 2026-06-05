'use client'

import { useState, useCallback, useEffect, useTransition, useMemo } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Filter, Search, ChevronRight, AlertTriangle, CheckCircle,
  Clock, Mail, ArrowUpRight, ShieldAlert, User, ImageIcon, X, Loader2,
  Youtube, Instagram, Facebook, XCircle, Siren, TriangleAlert, TrendingDown, Smile,
  ChevronLeft, ChevronsLeft, ChevronsRight, ExternalLink, ChevronDown, Send, Info
} from 'lucide-react'
import { Twitter, Reddit } from '@/utils/icons'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

import { trackClientClick, getAllTakedownIds } from './actions'
import ReportGenerate from '@/components/ReportGenerate'
import { DateFilterPopover } from "@/components/DateFilterPopover"
import { ViolationsFilter } from "@/app/(dashboard)/cases/ViolationsFilter"
import { RiskFilter } from "@/app/(dashboard)/cases/RiskFilter"
import { StatusFilter } from "@/app/(dashboard)/cases/StatusFilter"
import { PlatformFilter } from "@/app/(dashboard)/cases/PlatformFilter"
import { format } from "date-fns"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function TakedownsList({ initialTakedowns, initialFilters, isReviewer, metrics, project, projectLabels, totalCount }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [takedowns, setTakedowns] = useState(initialTakedowns)
  const [selectedCases, setSelectedCases] = useState({})
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)
  const [isAllFilterSelected, setIsAllFilterSelected] = useState(false)
  const [isSelectingAll, setIsSelectingAll] = useState(false)
  const [searchTerm, setSearchTerm] = useState(initialFilters.search || '')

  // Track report states
  const [summaryState, setSummaryState] = useState({ loading: false, statusText: '' });
  const [detailedPdfState, setDetailedPdfState] = useState({ loading: false, statusText: '' });
  const [detailedDocxState, setDetailedDocxState] = useState({ loading: false, statusText: '' });

  // Toast state
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const selectedIds = useMemo(() => Object.keys(selectedCases), [selectedCases]);
  const selectedPostsArray = useMemo(() => Object.values(selectedCases), [selectedCases]);
  const selectedCount = selectedIds.length;

  useEffect(() => {
    setTakedowns(initialTakedowns)
  }, [initialTakedowns])

  const currentPage = parseInt(initialFilters.page) || 1
  const pageSize = parseInt(initialFilters.pageSize) || 25
  const totalPages = Math.ceil(totalCount / pageSize)

  const getStatusConfig = (status) => {
    const s = status?.toLowerCase() || '';
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
    if (score >= 96) return { label: 'HIGH', color: 'text-rose-500 bg-rose-50 border-rose-200', icon: Siren };
    if (score >= 76) return { label: 'MEDIUM', color: 'text-orange-500 bg-orange-50 border-orange-200', icon: TriangleAlert };
    if (score >= 41) return { label: 'LOW', color: 'text-amber-500 bg-amber-50 border-amber-200', icon: TrendingDown };
    return { label: 'SAFE', color: 'text-slate-500 bg-slate-50 border-slate-200', icon: Smile };
  }

  const updateQueryParams = useCallback((newParams) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === undefined || (value === 'all' && key !== 'status' && key !== 'platform')) {
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

  const handlePageSizeChange = (newSize) => {
    updateQueryParams({ pageSize: newSize, page: 1 })
  }

  const clearFilters = () => {
    startTransition(() => {
        router.push(pathname)
    })
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
      const ids = await getAllTakedownIds(initialFilters)
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

  const hasActiveFilters = initialFilters.status !== 'all' ||
    initialFilters.platform !== 'all' ||
    (initialFilters.violations && initialFilters.violations !== 'all') ||
    initialFilters.risk_priority !== 'all' ||
    initialFilters.original_date_from ||
    initialFilters.original_date_to ||
    initialFilters.takedown_date_from ||
    initialFilters.takedown_date_to ||
    initialFilters.takedown_successful_date_from ||
    initialFilters.takedown_successful_date_to;

  // Reset isAllFilterSelected when filters change
  const filtersKey = JSON.stringify(initialFilters)
  useEffect(() => {
    setIsAllFilterSelected(false)
    setSelectedCases({})
  }, [filtersKey])

  const getPageNumbers = () => {
    const pages = []
    let start = Math.max(1, currentPage - 2)
    let end = Math.min(totalPages, start + 4)
    if (end === totalPages) start = Math.max(1, end - 4)
    
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }

  const openCaseInNewTab = (caseId) => {
    window.open(`/takedowns/case/${caseId}`, '_blank', 'noopener,noreferrer')
  }

  const FilterControls = ({ isMobile = false }) => (
    <div className={cn("flex flex-wrap items-end gap-2.5 sm:gap-3 w-full", isMobile && "flex-col items-stretch")}>
      <div className="space-y-1 w-full lg:w-auto lg:flex-1 lg:max-w-[180px]">
        <StatusFilter
          label="Takedown Status"
          placeholder="All Statuses"
          initialStatus={initialFilters.status}
          onChange={(val) => {
            handleFilterChange('status', val);
          }}
          options={[
            { value: 'initiated', label: 'Initiated' },
            { value: 'under_review', label: 'Under Review' },
            { value: 're_appeal_takedown', label: 'Appealed Again' },
            { value: 'takedown_successful', label: 'Takedown Successful' },
            { value: 'takedown_failed', label: 'Takedown Failed' },
          ]}
        />
      </div>

      <div className="space-y-1 w-full lg:w-auto lg:flex-1 lg:max-w-[160px]">
        <PlatformFilter
          initialPlatform={initialFilters.platform}
          onChange={(val) => {
            handleFilterChange('platform', val);
          }}
          availablePlatforms={['instagram', 'facebook', 'x', 'reddit', 'youtube']}
        />
      </div>

      <div className="space-y-1 w-full lg:w-auto lg:min-w-[140px] lg:max-w-[180px]">
        <ViolationsFilter
          projectLabels={projectLabels}
          initialViolations={initialFilters.violations}
          onChange={(val) => {
            handleFilterChange('violations', val);
          }}
        />
      </div>

      <div className="space-y-1 w-full lg:w-auto lg:flex-1 lg:max-w-[160px]">
        <RiskFilter
          initialRisk={initialFilters.risk_priority}
          onChange={(val) => {
            handleFilterChange('risk_priority', val);
          }}
        />
      </div>

      <div className="space-y-1 w-full lg:w-auto lg:min-w-[140px] lg:max-w-[160px]">
        <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Publish Date</Label>
        <DateFilterPopover
          title="Publish Date"
          initialFrom={initialFilters.original_date_from}
          initialTo={initialFilters.original_date_to}
          onApply={(range) => {
            updateQueryParams({
              original_date_from: range?.from ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
              original_date_to: range?.to ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX") : null
            });
          }}
        />
      </div>

      <div className="space-y-1 w-full lg:w-auto lg:min-w-[140px] lg:max-w-[160px]">
        <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Takedown Start Date</Label>
        <DateFilterPopover
          title="Takedown Start Date"
          initialFrom={initialFilters.takedown_date_from}
          initialTo={initialFilters.takedown_date_to}
          onApply={(range) => {
            updateQueryParams({
              takedown_date_from: range?.from ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
              takedown_date_to: range?.to ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX") : null
            });
          }}
        />
      </div>

      <div className="space-y-1 w-full lg:w-auto lg:min-w-[140px] lg:max-w-[160px]">
        <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Takedown Success Date</Label>
        <DateFilterPopover
          title="Takedown Success Date"
          initialFrom={initialFilters.takedown_successful_date_from}
          initialTo={initialFilters.takedown_successful_date_to}
          onApply={(range) => {
            updateQueryParams({
              takedown_successful_date_from: range?.from ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
              takedown_successful_date_to: range?.to ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX") : null
            });
          }}
        />
      </div>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="h-9 px-3 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold text-[10px] uppercase tracking-wider cursor-pointer transition-colors w-full lg:w-auto shrink-0"
        >
          <X className="w-3.5 h-3.5 mr-1 text-rose-500" /> Clear Filters
        </Button>
      )}
    </div>
  )

  return (
    <div className="relative flex-1 flex flex-col bg-slate-50 overflow-hidden">
      
      {/* Metrics Section */}
      <div className="px-4 sm:px-6 pt-2 shrink-0">
        {metrics && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:shadow-md transition-shadow">
              <div className="bg-blue-50 p-2 sm:p-3 rounded-xl">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">In Progress</p>
                <p className="text-lg sm:text-xl font-black text-slate-900 leading-none">{metrics.inProgress}</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:shadow-md transition-shadow">
              <div className="bg-emerald-50 p-2 sm:p-3 rounded-xl">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">Successful</p>
                <p className="text-lg sm:text-xl font-black text-slate-900 leading-none">{metrics.successful}</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:shadow-md transition-shadow">
              <div className="bg-amber-50 p-2 sm:p-3 rounded-xl">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">Re-appealed</p>
                <p className="text-lg sm:text-xl font-black text-slate-900 leading-none">{metrics.reAppeal}</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:shadow-md transition-shadow">
              <div className="bg-rose-50 p-2 sm:p-3 rounded-xl">
                <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">Failed</p>
                <p className="text-lg sm:text-xl font-black text-slate-900 leading-none">{metrics.failed}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filters Section */}
         <div className="px-3 sm:px-6 pt-5 shrink-0">
           <div>
             <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">

               {/* Left: Filters */}
               <div className="flex flex-col lg:flex-row lg:items-end gap-4 w-full">

                 {/* Header Row: Title & Summary Box */}
                 <div className="flex flex-col w-full lg:w-[160px] xl:w-[180px] shrink-0 relative">
                   <div className="flex items-center justify-between mb-2">
                     <div className="flex flex-col items-start gap-2">
                     <div className="flex items-center gap-1.5">
                       <Filter className="w-3.5 h-3.5 text-blue-600" />
                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                         Filter
                       </span>
                     </div>
                     <div className="flex items-baseline gap-1.5 mb-3">
                     <span className="text-2xl font-black text-slate-800 tracking-tight leading-none">
                       {totalCount}
                     </span>
                     <span className="text-[11px] font-bold text-slate-500 leading-none">
                       takedowns found
                     </span>
                   </div>
                     </div>
                     {isPending && (
                       <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                     )}
                     <div className="lg:hidden flex flex-col gap-2">
                       <Button
                         variant="ghost"
                         onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
                         className="bg-white border border-slate-200 rounded-md px-3 h-9 text-xs font-semibold text-slate-700 flex items-center gap-2 shadow-sm hover:border-blue-500 transition-all"
                       >
                         <Filter className="w-3.5 h-3.5 text-slate-500" />
                         {isMobileFiltersOpen ? 'Hide' : 'Filters'}
                       </Button>
                       
                       <ReportGenerate
                         selectedPostsArray={selectedPostsArray}
                         selectedCount={selectedCount}
                         summaryState={summaryState}
                         detailedPdfState={detailedPdfState}
                         detailedDocxState={detailedDocxState}
                         setSummaryState={setSummaryState}
                         setDetailedPdfState={setDetailedPdfState}
                         setDetailedDocxState={setDetailedDocxState}
                         showToast={showToast}
                         trackClientClick={trackClientClick}
                         project={project}
                         showLabel={false}
                       />
                     </div>
                   </div>
 
                   {/* Selection Controls */}
                   <div className="mt-auto border-t border-slate-200/80 pt-3">
                     {selectedCount > 0 ? (
                       <div className="flex flex-col gap-2">
                         <div className="flex items-center justify-between">
                           <span className="inline-flex items-center text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                             {isAllFilterSelected ? `All ${totalCount}` : selectedCount} Selected
                           </span>
                           <button
                             onClick={handleClearAllSelected}
                             className="text-[10px] font-bold text-slate-400 hover:text-slate-700 transition-colors cursor-pointer underline underline-offset-2"
                           >
                             Clear
                           </button>
                         </div>
 
                         {!isAllFilterSelected && totalCount > selectedCount && (
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={handleSelectAllFiltered}
                             disabled={isSelectingAll}
                             className="w-full h-7 text-[10px] bg-blue-600 text-white hover:bg-blue-700 font-bold shadow-sm cursor-pointer transition-colors"
                           >
                             {isSelectingAll ? (
                               <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                             ) : (
                               <CheckCircle className="w-3 h-3 mr-1.5 opacity-70" />
                             )}
                             Select all {totalCount} takedowns
                           </Button>
                         )}
                       </div>
                     ) : (
                       <Button
                         variant="outline"
                         size="sm"
                         onClick={handleSelectAllFiltered}
                         disabled={isSelectingAll || totalCount === 0}
                         className="w-full h-7 text-[10px] bg-white text-slate-700 hover:bg-slate-100 font-bold shadow-none cursor-pointer transition-colors"
                       >
                         {isSelectingAll ? (
                           <Loader2 className="w-3 h-3 animate-spin mr-1.5 text-blue-600" />
                         ) : (
                           <CheckCircle className="w-3 h-3 mr-1.5 text-slate-400" />
                         )}
                         Select all takedowns
                       </Button>
                     )}
                   </div>
                 </div>
 
                 {(() => {
 
                   return (
                     <>
                       {/* Desktop View */}
                       <div className="hidden lg:flex w-full">
                         <FilterControls />
                       </div>
 
                       {/* Mobile View (Dialog) */}
                       <Dialog open={isMobileFiltersOpen} onOpenChange={setIsMobileFiltersOpen}>
                         <DialogContent className="lg:hidden w-[95vw] max-w-md rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
                           <DialogHeader className="mb-2 text-left">
                             <DialogTitle className="text-xl font-black text-slate-800">Filters & Options</DialogTitle>
                           </DialogHeader>
                           <FilterControls isMobile={true} />
                         </DialogContent>
                       </Dialog>
                     </>
                   );
                 })()}
 
                 {/* Right: Actions & Counts */}
                 {/* Report Download - hidden on mobile dialog as it's now outside */}
                 <div className="hidden lg:block space-y-1 w-full lg:w-auto lg:flex-1 lg:max-w-[280px] lg:min-w-[240px]">
                   <ReportGenerate
                     selectedPostsArray={selectedPostsArray}
                     selectedCount={selectedCount}
                     summaryState={summaryState}
                     detailedPdfState={detailedPdfState}
                     detailedDocxState={detailedDocxState}
                     setSummaryState={setSummaryState}
                     setDetailedPdfState={setDetailedPdfState}
                     setDetailedDocxState={setDetailedDocxState}
                     showToast={showToast}
                     trackClientClick={trackClientClick}
                     project={project}
                     showLabel={true}
                   />
                 </div>
               </div>
             </div>
           </div>
         </div>

      {/* List Section */}
      <div className="flex-1 min-h-0 flex flex-col pt-2">
        <div className={cn("flex-1 min-h-0 bg-white shadow-sm border border-slate-200 flex flex-col overflow-hidden transition-opacity duration-300", isPending && "opacity-60")}>

          {/* Scrollable Table Area */}
          <div className="overflow-auto flex-1 relative custom-scrollbar">
            {takedowns.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-24 text-slate-400">
                <div className="w-16 sm:w-20 h-16 sm:h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 border border-slate-100">
                  <ShieldAlert className="w-6 h-6 sm:w-8 sm:h-8 opacity-20 text-slate-500" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-700 mb-1">No active takedowns found</h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-xs text-center px-4">Try adjusting your filters or checking back later.</p>
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
                            input.indeterminate = isSomeCurrentPageSelected && !isAllCurrentPageSelected;
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
                    const statusConfig = getStatusConfig(item.status);
                    const risk = getRiskLabel(item.risk_score);
                    const RiskIcon = risk.icon;
                    const StatusIcon = statusConfig.icon;

                    return (
                      <tr 
                        key={item.id} 
                        className="group hover:bg-slate-50/80 transition-all cursor-pointer"
                        onClick={(e) => {
                          if (e.target.type === 'checkbox') return;
                          openCaseInNewTab(item.id)
                        }}
                      >
                        {/* Checkbox */}
                        <td className="px-2 sm:px-4 py-2 whitespace-nowrap align-middle text-center border-b border-slate-50" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={!!selectedCases[item.id]}
                            onChange={() => toggleSelectId(item)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>

                        {/* Risk */}
                        <td className="px-2 sm:px-3 py-2 whitespace-nowrap align-middle text-center hidden sm:table-cell border-b border-slate-50">
                          <div className={cn("flex flex-col items-center justify-center p-1.5 rounded-lg text-[10px] font-black tracking-wide border shadow-sm mx-auto w-12", risk.color)}>
                            <RiskIcon className="w-4 h-4 mb-1" />
                            <span className="uppercase text-[8px] leading-none">{risk.label}</span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-2 sm:px-3 py-3 whitespace-nowrap align-middle hidden md:table-cell text-center border-b border-slate-50">
                          <div className="flex flex-col items-center gap-1.5">
                            <div
                              className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md border shadow-sm", statusConfig.color)}
                            >
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

                        
                        {/* Content */}
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

                                {/* Mobile Risk Icon */}
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

                        {/* Violations */}
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

                        {/* Publish Date */}
                        <td className="px-3 py-2 whitespace-nowrap align-middle hidden xl:table-cell border-b border-slate-50">
                          <div className="flex flex-col gap-1 justify-center items-center text-sm font-semibold text-slate-500">
                            <span>{item.posted_at ? format(new Date(item.posted_at), "dd/MM/yyyy") : '-'}</span>
                            <span className="text-xs text-slate-400">
                              {item.posted_at ? format(new Date(item.posted_at), "hh:mm a") : ''}
                            </span>
                          </div>
                        </td>

                        {/* Takedown Start Date */}
                        <td className="px-3 py-2 whitespace-nowrap align-middle hidden xl:table-cell border-b border-slate-50">
                          <div className="flex flex-col gap-1 justify-center items-center text-sm font-semibold text-slate-500">
                            <span>{item.takedown_start_date ? format(new Date(item.takedown_start_date), "dd/MM/yyyy") : '-'}</span>
                            <span className="text-xs text-slate-400">
                              {item.takedown_start_date ? format(new Date(item.takedown_start_date), "hh:mm a") : ''}
                            </span>
                          </div>
                        </td>

                        {/* Takedown Success Date */}
                        <td className="px-3 py-2 whitespace-nowrap align-middle hidden xl:table-cell border-b border-slate-50">
                          <div className="flex flex-col gap-1 justify-center items-center text-sm font-semibold text-slate-500">
                            <span>{item.takedown_successful_date ? format(new Date(item.takedown_successful_date), "dd/MM/yyyy") : '-'}</span>
                            <span className="text-xs text-slate-400">
                              {item.takedown_successful_date ? format(new Date(item.takedown_successful_date), "hh:mm a") : ''}
                            </span>
                          </div>
                        </td>

                        {/* Actions */}
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

      {/* Pagination Controls */}
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
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap hidden sm:inline">per page</span>
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
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    className="h-8 sm:h-9 px-2 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50 hidden sm:flex"
                    title="First Page"
                  >
                    &lt;&lt;
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="h-8 sm:h-9 px-2 sm:px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50 flex-1 sm:flex-none"
                  >
                    <ChevronLeft className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Previous</span>
                  </Button>

                  <div className="flex items-center gap-1 mx-0 sm:mx-1">
                    {(() => {
                      const pages = [];
                      let start = Math.max(1, currentPage - 2);
                      let end = Math.min(totalPages, currentPage + 2);

                      // For mobile, show fewer pages
                      let isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
                      if (isMobile) {
                        start = Math.max(1, currentPage - 1);
                        end = Math.min(totalPages, currentPage + 1);
                      }

                      if (currentPage <= (isMobile ? 1 : 2)) {
                        end = Math.min(totalPages, isMobile ? 3 : 5);
                      }
                      if (currentPage >= totalPages - (isMobile ? 0 : 1)) {
                        start = Math.max(1, totalPages - (isMobile ? 2 : 4));
                      }

                      for (let i = start; i <= end; i++) {
                        pages.push(i);
                      }

                      return pages.map(pageNum => (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePageChange(pageNum)}
                          className={cn(
                            "h-8 w-8 sm:h-9 sm:w-9 p-0 text-xs font-bold",
                            currentPage === pageNum
                              ? "bg-slate-800 hover:bg-slate-900 text-white shadow-sm"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          {pageNum}
                        </Button>
                      ));
                    })()}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="h-8 sm:h-9 px-2 sm:px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50 flex-1 sm:flex-none"
                  >
                    <span className="hidden sm:inline">Next</span> <ChevronRight className="w-4 h-4 sm:ml-1" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className="h-8 sm:h-9 px-2 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50 hidden sm:flex"
                    title="Last Page"
                  >
                    &gt;&gt;
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Floating Toast Notification */}
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
              {toast.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight">
                {toast.message}
              </p>
            </div>
            <button 
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
