'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Filter, Search, ChevronRight, AlertTriangle, CheckCircle,
  Clock, Mail, ArrowUpRight, ShieldAlert, User, ImageIcon, X, Loader2,
  Youtube, Instagram, Facebook, XCircle
} from 'lucide-react'
import { Twitter, Reddit } from '@/utils/icons'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

import { DateFilterPopover } from "@/app/(dashboard)/cases/DateFilterPopover"
import { ViolationsFilter } from "@/app/(dashboard)/cases/ViolationsFilter"
import { format } from "date-fns"

export default function TakedownsList({ initialTakedowns, initialFilters, isReviewer, metrics, projectLabels }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [takedowns, setTakedowns] = useState(initialTakedowns)

  useEffect(() => {
    setTakedowns(initialTakedowns)
  }, [initialTakedowns])

  const getStatusColor = (status) => {
    const s = status?.toLowerCase() || '';
    switch (s) {
      case 'takedown successful':
      case 'takedown_successful': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'takedown failed':
      case 'takedown_failed': return 'bg-rose-50 text-rose-700 border-rose-200'
      case 'under process':
      case 'under_review': return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'appealed again':
      case 're_appeal_takedown': return 'bg-amber-50 text-amber-700 border-amber-200'
      case 'initiated': return 'bg-indigo-50 text-indigo-700 border-indigo-200'
      default: return 'bg-slate-100 text-slate-700 border-slate-200'
    }
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
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  const handleFilterChange = (key, value) => {
    updateQueryParams({ [key]: value })
  }

  const clearFilters = () => {
    router.push(pathname)
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

  const totalCount = takedowns.length;

  return (
    <div className="flex flex-col h-full w-full bg-slate-50">

      {/* Filters & Controls */}
      <div className="px-8 py-6 shrink-0 space-y-4">

        {/* Metric Cards */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-2">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex items-center gap-5">
              <div className="bg-blue-50 p-3.5 rounded-xl">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-0.5">Takedowns in Progress</p>
                <p className="text-2xl font-bold text-slate-900">{metrics.inProgress}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex items-center gap-5">
              <div className="bg-emerald-50 p-3.5 rounded-xl">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-0.5">Takedowns Successful</p>
                <p className="text-2xl font-bold text-slate-900">{metrics.successful}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex items-center gap-5">
              <div className="bg-amber-50 p-3.5 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-0.5">Takedowns in Re-appeal</p>
                <p className="text-2xl font-bold text-slate-900">{metrics.reAppeal}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex items-center gap-5">
              <div className="bg-rose-50 p-3.5 rounded-xl">
                <XCircle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-0.5">Takedowns Failed</p>
                <p className="text-2xl font-bold text-slate-900">{metrics.failed}</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6">

            {/* Left: Filters */}
            <div className="flex flex-col xl:flex-row items-start xl:items-center gap-3 w-full flex-wrap pb-2 xl:pb-0">
              <div className="flex flex-row justify-between items-start w-full gap-1.5 shrink-0">
                <div className="flex flex-row justify-center items-start w-full lg:w-fit gap-1.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="bg-slate-100 p-1.5 rounded-md text-slate-600">
                      <Filter className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold text-slate-700 tracking-wide">Filters</span>
                  </div>
                  <div className="text-sm font-medium text-slate-500 flex items-center gap-1.5 pl-5">
                    <span className="font-bold text-slate-900 text-lg">{totalCount}</span>
                    cases found
                  </div>
                </div>


                {hasActiveFilters && (
                  <div className="shrink-0 mb-[1px]">
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-3 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold text-xs rounded-md">
                      <X className="w-3.5 h-3.5 mr-1.5" /> Clear All
                    </Button>
                  </div>
                )}
              </div>

              {/* <Separator orientation="vertical" className="h-10 bg-slate-200 hidden xl:block" /> */}

              <div className="flex items-end gap-4 flex-wrap w-full justify-evenly">
                <div className="space-y-1 w-fit min-w-[130px]">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Status</Label>
                  <Select
                    value={initialFilters.status}
                    onValueChange={(val) => handleFilterChange('status', val)}
                  >
                    <SelectTrigger className="w-full bg-white border-slate-200 h-9 text-xs font-semibold">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="initiated">Initiated</SelectItem>
                      <SelectItem value="under_review">Under Review</SelectItem>
                      <SelectItem value="re_appeal_takedown">Appealed Again</SelectItem>
                      <SelectItem value="takedown_successful">Takedown Successful</SelectItem>
                      <SelectItem value="takedown_failed">Takedown Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 w-fit min-w-[130px]">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Platform</Label>
                  <Select
                    value={initialFilters.platform}
                    onValueChange={(val) => handleFilterChange('platform', val)}
                  >
                    <SelectTrigger className="w-full bg-white border-slate-200 h-9 text-xs font-semibold">
                      <SelectValue placeholder="All Platforms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Platforms</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="x">X (Twitter)</SelectItem>
                      <SelectItem value="reddit">Reddit</SelectItem>
                      <SelectItem value="youtube">YouTube</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 w-fit min-w-[150px]">
                  <ViolationsFilter
                    projectLabels={projectLabels}
                    initialViolations={initialFilters.violations}
                    onChange={(val) => handleFilterChange('violations', val)}
                  />
                </div>

                <div className="space-y-1 w-fit min-w-[130px]">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Risk Severity</Label>
                  <Select
                    value={initialFilters.risk_priority}
                    onValueChange={(val) => handleFilterChange('risk_priority', val)}
                  >
                    <SelectTrigger className="w-full bg-white border-slate-200 h-9 text-xs font-semibold">
                      <SelectValue placeholder="All Risks" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Risks</SelectItem>
                      <SelectItem value="high">High Risk</SelectItem>
                      <SelectItem value="medium">Medium Risk</SelectItem>
                      <SelectItem value="low">Low Risk</SelectItem>
                      <SelectItem value="safe">Safe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 w-fit min-w-[140px]">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Alert Date</Label>
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

                <div className="space-y-1 w-fit min-w-[140px]">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Publish Date</Label>
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

                <div className="space-y-1 w-fit min-w-[140px]">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Takedown Date</Label>
                  <DateFilterPopover
                    title="Takedown start Date"
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
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 px-8 pb-8">
        {takedowns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 border border-slate-100">
              <ShieldAlert className="w-8 h-8 opacity-20 text-slate-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-1">No active takedowns found</h3>
            <p className="text-sm text-slate-500 max-w-xs text-center">Try adjusting your filters or checking back later.</p>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} className="mt-6 border-slate-200">
                Clear all filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 w-fit h-fit">
            {takedowns.map((item) => (
              <Link
                key={item.id}
                href={`/takedowns/case/${item.id}`}
                className="group block bg-white rounded-xl shadow-sm border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row min-h-[8rem]">

                  {/* Thumbnail / Left Accent */}
                  <div className="w-full sm:w-40 sm:h-auto h-32 bg-slate-100 shrink-0 relative overflow-hidden flex items-center justify-center border-b sm:border-b-0 sm:border-r border-slate-100">
                    {item.enrichment?.thumbnail ? (
                      <img
                        src={item.enrichment.thumbnail}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        alt="Evidence"
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-300" />
                    )}

                    {/* Platform Icon Overlay */}
                    <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm p-1.5 rounded shadow-sm border border-white/20 flex items-center justify-center">
                      {item.platform?.toLowerCase() === 'instagram' ? <Instagram className="w-3.5 h-3.5 text-pink-500" />
                        : item.platform?.toLowerCase() === 'facebook' ? <Facebook className="w-3.5 h-3.5 text-blue-600" />
                          : item.platform?.toLowerCase() === 'x' ? <span className='max-w-4 max-h-4' ><Twitter className="w-3.5 h-3.5 text-slate-900" /></span>
                            : item.platform?.toLowerCase() === 'youtube' ? <Youtube className="w-3.5 h-3.5 text-red-600" />
                              : item.platform?.toLowerCase() === 'reddit' ? <span className='max-w-4 max-h-4' > <Reddit className="w-3.5 h-3.5 text-orange-600" /> </span>
                                : <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">{item.platform?.slice(0, 1)}</span>
                      }
                    </div>
                  </div>

                  <div className="flex-1 p-5 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-slate-900 truncate leading-tight group-hover:text-blue-600 transition-colors">
                            {item.enrichment?.username ? `@${item.enrichment.username}` : `Case #${item.id?.substring(0, 8) || 'Unknown'}`}
                          </h3>
                          <p className="text-sm text-slate-500 truncate mt-1">
                            {item.enrichment?.caption || <span className="italic opacity-50">No caption content</span>}
                          </p>
                        </div>
                        <Badge variant="outline" className={cn("shrink-0 uppercase text-[11px] px-2.5 font-bold h-6 border", getStatusColor(item.status))}>
                          {item.status?.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-slate-500 mt-4 border-t border-slate-100 pt-3">
                      <span className="flex items-center gap-1.5">
                        <div className={cn("w-2 h-2 rounded-full", item.risk_score >= 96 ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' : item.risk_score >= 76 ? 'bg-orange-500' : item.risk_score >= 41 ? 'bg-amber-500' : 'bg-slate-400')} />
                        Risk: <span className="font-bold text-slate-700">{item.risk_score >= 96 ? 'High' : item.risk_score >= 76 ? 'Medium' : item.risk_score >= 41 ? 'Low' : 'Safe'}</span>
                      </span>
                      {/* <span className="flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-700 capitalize">{item.threat_type?.replace(/_/g, ' ')}</span>
                      </span> */}
                      <div className="flex flex-wrap items-center gap-4 sm:ml-auto">
                        {item.takedown_date && (
                          <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            Started: {format(new Date(item.takedown_date), "MMM d, yyyy")}
                          </span>
                        )}
                        {item.last_update_date && (
                          <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            Updated: {format(new Date(item.last_update_date), "MMM d, yyyy")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Action Area */}
                  <div className="w-12 border-l border-slate-100 flex items-center justify-center bg-slate-50/50 group-hover:bg-blue-50/50 transition-colors">
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-600 transition-colors" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
