'use client'

import { useState, useCallback, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Filter, Search, ChevronRight, AlertTriangle, CheckCircle,
  Clock, Mail, ArrowUpRight, ShieldAlert, User, ImageIcon, X, Loader2,
  Youtube, Instagram, Facebook, XCircle, Siren, TriangleAlert, TrendingDown, Smile,
  ChevronLeft, ChevronsLeft, ChevronsRight, ExternalLink, ChevronDown
} from 'lucide-react'
import { Twitter, Reddit } from '@/utils/icons'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

import { DateFilterPopover } from "@/app/(dashboard)/cases/DateFilterPopover"
import { ViolationsFilter } from "@/app/(dashboard)/cases/ViolationsFilter"
import { RiskFilter } from "@/app/(dashboard)/cases/RiskFilter"
import { StatusFilter } from "@/app/(dashboard)/cases/StatusFilter"
import { PlatformFilter } from "@/app/(dashboard)/cases/PlatformFilter"
import { format } from "date-fns"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function TakedownsList({ initialTakedowns, initialFilters, isReviewer, metrics, projectLabels, totalCount }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [takedowns, setTakedowns] = useState(initialTakedowns)
  const [selectedIds, setSelectedIds] = useState([])
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)

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
        return { label: 'Successful', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
      case 'takedown failed':
      case 'takedown_failed': 
        return { label: 'Failed', color: 'bg-rose-50 text-rose-700 border-rose-200' }
      case 'under process':
      case 'under_review': 
        return { label: 'Under Review', color: 'bg-blue-50 text-blue-700 border-blue-200' }
      case 'appealed again':
      case 're_appeal_takedown': 
        return { label: 'Appealed', color: 'bg-amber-50 text-amber-700 border-amber-200' }
      case 'initiated': 
        return { label: 'Initiated', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
      default: 
        return { label: status?.replace(/_/g, ' ') || 'Unknown', color: 'bg-slate-100 text-slate-700 border-slate-200' }
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
      setSelectedIds([])
    } else {
      setSelectedIds(takedowns.map(t => t.id))
    }
  }

  const toggleSelectId = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const hasActiveFilters = initialFilters.status !== 'all' ||
    initialFilters.platform !== 'all' ||
    (initialFilters.violations && initialFilters.violations !== 'all') ||
    initialFilters.risk_priority !== 'all' ||
    initialFilters.original_date_from ||
    initialFilters.original_date_to ||
    initialFilters.processed_from ||
    initialFilters.processed_to ||
    initialFilters.takedown_date_from ||
    initialFilters.takedown_date_to;

  const getPageNumbers = () => {
    const pages = []
    let start = Math.max(1, currentPage - 2)
    let end = Math.min(totalPages, start + 4)
    if (end === totalPages) start = Math.max(1, end - 4)
    
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }

  const FilterControls = ({ isMobile = false }) => (
    <div className={cn("grid gap-4", isMobile ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7")}>
      <div className="space-y-1.5">
        <StatusFilter
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

      <div className="space-y-1.5">
        <PlatformFilter
          initialPlatform={initialFilters.platform}
          onChange={(val) => {
            handleFilterChange('platform', val);
          }}
          availablePlatforms={['instagram', 'facebook', 'x', 'reddit', 'youtube']}
        />
      </div>

      <div className="space-y-1.5">
        <ViolationsFilter
          projectLabels={projectLabels}
          initialViolations={initialFilters.violations}
          onChange={(val) => {
            handleFilterChange('violations', val);
            // Don't close mobile filters on multi-select unless you want to
          }}
        />
      </div>

      <div className="space-y-1.5">
        <RiskFilter
          initialRisk={initialFilters.risk_priority}
          onChange={(val) => {
            handleFilterChange('risk_priority', val);
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Alert Date</Label>
        <DateFilterPopover
          title="Alert Date"
          initialFrom={initialFilters.processed_from}
          initialTo={initialFilters.processed_to}
          onApply={(range) => {
            updateQueryParams({
              processed_from: range?.from ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
              processed_to: range?.to ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX") : null
            });
          }}
        />
      </div>

      <div className="space-y-1.5">
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

      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Takedown Date</Label>
        <DateFilterPopover
          title="Takedown Date"
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
    </div>
  )

  return (
    <div className="relative flex-1 flex flex-col bg-slate-50 overflow-hidden">
      
      {/* Metrics Section */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 shrink-0">
        {metrics && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
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
      <div className="px-4 sm:px-6 py-2 shrink-0">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3 sm:p-4">
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
            
            {/* Filter Info Sidebar / Mobile Header */}
            <div className="flex items-center lg:items-start justify-between lg:flex-col w-full lg:w-[160px] shrink-0 lg:border-r border-slate-100 lg:pr-6">
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5 mb-0.5 lg:mb-2">
                  <Filter className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Filters</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">{totalCount}</span>
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-500">takedowns</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />}
                
                {/* Mobile Filter Trigger */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsMobileFiltersOpen(true)}
                  className="lg:hidden h-9 px-3 border-slate-200 text-slate-600 font-bold text-[10px] uppercase tracking-wider"
                >
                  <Filter className="w-3.5 h-3.5 mr-2" /> Filter
                </Button>

                {hasActiveFilters && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={clearFilters} 
                    className="h-8 hidden lg:flex w-full justify-start px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold text-[10px] uppercase tracking-wider mt-2"
                  >
                    <X className="w-3.5 h-3.5 mr-1.5" /> Clear All
                  </Button>
                )}
              </div>
            </div>

            {/* Desktop Filter Grid */}
            <div className="hidden lg:block flex-1">
              <FilterControls />
            </div>

            {/* Active Filters Display for Mobile */}
            {hasActiveFilters && (
               <div className="lg:hidden flex flex-wrap gap-2 pt-2 border-t border-slate-50">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={clearFilters} 
                    className="h-7 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold text-[9px] uppercase tracking-wider"
                  >
                    <X className="w-3 h-3 mr-1" /> Clear All Filters
                  </Button>
               </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Filters Dialog */}
      <Dialog open={isMobileFiltersOpen} onOpenChange={setIsMobileFiltersOpen}>
        <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
          <DialogHeader className="p-6 pb-0 bg-slate-50 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <Filter className="w-5 h-5 text-blue-600" /> Refine Results
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="p-6 pt-2 overflow-y-auto max-h-[70vh]">
            <FilterControls isMobile={true} />
          </div>
        </DialogContent>
      </Dialog>

      {/* List Section */}
      <div className="flex-1 overflow-hidden px-4 sm:px-6 pb-4 min-h-0">
        <div className={cn("h-full bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col transition-opacity overflow-hidden duration-300", isPending && "opacity-60")}>
          
          {/* Scrollable Table Area */}
          <div className="overflow-auto flex-1 relative">
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
              <table className="min-w-full divide-y divide-slate-100 table-fixed lg:table-auto">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th scope="col" className="w-14 sm:w-16 px-2 sm:px-4 py-3.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">Risk</th>
                    <th scope="col" className="w-20 sm:w-24 px-2 sm:px-4 py-3.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">Status</th>
                    <th scope="col" className="px-4 sm:px-6 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">Content</th>
                    <th scope="col" className="w-48 px-6 py-3.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 hidden lg:table-cell">Violations</th>
                    <th scope="col" className="w-32 px-6 py-3.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 hidden xl:table-cell">Alert Date</th>
                    <th scope="col" className="w-32 px-6 py-3.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 hidden xl:table-cell">Publish Date</th>
                    <th scope="col" className="w-10 sm:w-12 px-2 sm:px-4 py-3.5 text-right bg-slate-50"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {takedowns.map((item) => {
                    const statusConfig = getStatusConfig(item.status);
                    const risk = getRiskLabel(item.risk_score);
                    const RiskIcon = risk.icon;

                    return (
                      <tr 
                        key={item.id} 
                        className="group hover:bg-slate-50/80 transition-all cursor-pointer"
                        onClick={(e) => {
                          if (e.target.type === 'checkbox') return;
                          router.push(`/takedowns/case/${item.id}`)
                        }}
                      >

                        {/* Risk */}
                        <td className="px-2 sm:px-4 py-3 sm:py-4 whitespace-nowrap align-middle text-center">
                          <HoverCard openDelay={0} closeDelay={50}>
                            <HoverCardTrigger asChild>
                              <div className={cn("inline-flex flex-col items-center justify-center w-10 sm:w-12 py-1 rounded-lg border shadow-sm mx-auto transition-transform hover:scale-110", risk.color)}>
                                <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-tighter leading-none mb-0.5 sm:mb-1">{risk.label}</span>
                                <RiskIcon className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                              </div>
                            </HoverCardTrigger>
                            <HoverCardContent 
                              className="w-auto px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 shadow-xl rounded-lg"
                              sideOffset={8}
                            >
                              Risk Severity: {risk.label}
                            </HoverCardContent>
                          </HoverCard>
                        </td>

                        {/* Status */}
                        <td className="px-2 sm:px-4 py-3 sm:py-4 whitespace-nowrap align-middle text-center">
                          <HoverCard openDelay={0} closeDelay={50}>
                            <HoverCardTrigger asChild>
                              <div className="flex flex-col items-center gap-1 sm:gap-1.5 group/status cursor-pointer">
                                <div className="bg-slate-50 p-1 rounded-full border border-slate-100 transition-colors group-hover/status:bg-slate-100">
                                  <Clock className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-slate-400" />
                                </div>
                                {item.visibility_status === 'down' ? (
                                  <span className="text-[7px] sm:text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">Down</span>
                                ) : (
                                  <span className="text-[7px] sm:text-[8px] font-black text-emerald-600 uppercase tracking-widest leading-none">Online</span>
                                )}
                              </div>
                            </HoverCardTrigger>
                            <HoverCardContent 
                              className="w-auto px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 shadow-xl rounded-lg"
                              sideOffset={8}
                            >
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-400">Status:</span>
                                  <span className="capitalize">{statusConfig.label}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-400">Visibility:</span>
                                  <span className={item.visibility_status === 'down' ? "text-slate-500" : "text-emerald-600"}>
                                    {item.visibility_status === 'down' ? "Taken Down" : "Online"}
                                  </span>
                                </div>
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        </td>

                        {/* Content */}
                        <td className="px-4 sm:px-6 py-3 sm:py-4 align-middle overflow-hidden">
                          <div className="flex items-center gap-3 sm:gap-4">
                            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shadow-sm relative shrink-0">
                              {item.enrichment?.thumbnail ? (
                                <img
                                  src={item.enrichment.thumbnail}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                  alt=""
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5 text-slate-300" />
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex flex-col gap-0.5">
                              <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
                                <div
                                  className="font-semibold text-slate-600 rounded-full bg-slate-50 max-w-5 flex items-center justify-center p-1"
                                  title={item.platform?.charAt(0).toUpperCase() + item.platform?.slice(1)}
                                >
                                  {item.platform?.toLowerCase() === 'instagram' ? <Instagram className="size-4 sm:size-5 text-pink-500" />
                                    : item.platform?.toLowerCase() === 'facebook' ? <Facebook className="size-4 sm:size-5 shrink-0 text-blue-600" />
                                      : item.platform?.toLowerCase() === 'x' ? <Twitter className="size-4 sm:size-5 text-slate-900" />
                                        : item.platform?.toLowerCase() === 'youtube' ? <Youtube className="size-4 sm:size-5 text-red-600" />
                                          : item.platform?.toLowerCase() === 'reddit' ? <Reddit className="size-4 sm:size-5 text-orange-600" />
                                            : <span className="text-[10px] font-bold text-slate-400">{item.platform?.slice(0, 1).toUpperCase()}</span>
                                  }
                                </div>
                                <span className="text-xs text-slate-400">•</span>
                                <h4 className="text-xs sm:text-sm font-black text-slate-800 truncate leading-none max-w-[80px] sm:max-w-none">
                                  {item.enrichment?.username ? `@${item.enrichment.username}` : `Case #${item.id?.substring(0, 8)}`}
                                </h4>
                                {item.url && (
                                  <a 
                                    href={item.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 text-[8px] sm:text-[9px] font-bold hover:bg-blue-100 transition-colors shrink-0"
                                  >
                                    Source <ExternalLink className="w-2 sm:w-2.5 h-2 sm:h-2.5" />
                                  </a>
                                )}
                              </div>
                              <p className="text-[10px] sm:text-[11px] text-slate-500 line-clamp-2 leading-relaxed mt-0.5 sm:mt-1">
                                {item.enrichment?.caption || <span className="italic opacity-50 text-[10px]">No caption content</span>}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Violations */}
                        <td className="px-6 py-4 align-middle hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1.5">
                            {item.threat_types?.length > 0 ? item.threat_types.map((type, idx) => (
                              <span key={idx} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold uppercase tracking-wider border border-slate-200">
                                {type.replace(/_/g, ' ')}
                              </span>
                            )) : (
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic">Unknown</span>
                            )}
                          </div>
                        </td>

                        {/* Alert Date */}
                        <td className="px-6 py-4 whitespace-nowrap align-middle text-center hidden xl:table-cell">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-bold text-slate-700">
                              {item.processed_at ? format(new Date(item.processed_at), "dd/MM/yyyy") : '-'}
                            </span>
                            <span className="text-[10px] font-medium text-slate-400">
                              {item.processed_at ? format(new Date(item.processed_at), "hh:mm aa") : ''}
                            </span>
                          </div>
                        </td>

                        {/* Publish Date */}
                        <td className="px-6 py-4 whitespace-nowrap align-middle text-center hidden xl:table-cell">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-bold text-slate-400">
                              {item.posted_at ? format(new Date(item.posted_at), "dd/MM/yyyy") : '-'}
                            </span>
                            <span className="text-[10px] font-medium text-slate-300">
                              {item.posted_at ? format(new Date(item.posted_at), "hh:mm aa") : ''}
                            </span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-2 sm:px-4 py-3 sm:py-4 whitespace-nowrap align-middle text-right">
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

          {/* Pagination Footer */}
          <div className="shrink-0 px-4 sm:px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4 z-20">
            <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:inline">Show:</span>
                <div className="flex items-center gap-1">
                  {[10, 25, 50].map(size => (
                    <button
                      key={size}
                      onClick={() => handlePageSizeChange(size)}
                      className={cn(
                        "w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-[10px] sm:text-xs font-bold transition-all border",
                        pageSize === size 
                          ? "bg-white border-slate-200 text-blue-600 shadow-sm" 
                          : "text-slate-400 border-transparent hover:border-slate-200"
                      )}
                    >
                      {size}
                    </button>
                  ))}
                  <div className="hidden lg:flex items-center gap-1">
                    {[75, 100].map(size => (
                      <button
                        key={size}
                        onClick={() => handlePageSizeChange(size)}
                        className={cn(
                          "w-8 h-8 rounded-lg text-xs font-bold transition-all border",
                          pageSize === size 
                            ? "bg-white border-slate-200 text-blue-600 shadow-sm" 
                            : "text-slate-400 border-transparent hover:border-slate-200"
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-1.5 ml-2 sm:ml-4">
                <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Page</span>
                <span className="text-xs font-black text-slate-700">{currentPage}</span>
                <span className="text-[10px] font-bold text-slate-300">/</span>
                <span className="text-xs font-bold text-slate-400">{totalPages}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 w-full md:w-auto justify-center md:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0 border-slate-200 hidden sm:flex"
              >
                <ChevronsLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-8 px-2 sm:px-3 gap-1.5 border-slate-200 text-[10px] sm:text-xs font-bold text-slate-600 flex-1 sm:flex-none"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Previous</span>
              </Button>

              <div className="flex items-center gap-1 mx-1 sm:mx-2">
                {getPageNumbers().map(num => (
                  <button
                    key={num}
                    onClick={() => handlePageChange(num)}
                    className={cn(
                      "w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-[10px] sm:text-xs font-black transition-all",
                      currentPage === num 
                        ? "bg-slate-900 text-white shadow-lg" 
                        : "text-slate-500 hover:bg-slate-100"
                    )}
                  >
                    {num}
                  </button>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="h-8 px-2 sm:px-3 gap-1.5 border-slate-200 text-[10px] sm:text-xs font-bold text-slate-600 flex-1 sm:flex-none"
              >
                <span className="hidden sm:inline">Next</span> <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
                className="h-8 w-8 p-0 border-slate-200 hidden sm:flex"
              >
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
