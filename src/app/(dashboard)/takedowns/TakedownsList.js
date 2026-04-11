'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Filter, Search, ChevronRight, AlertTriangle, CheckCircle,
  Clock, Mail, ArrowUpRight, ShieldAlert, User, ImageIcon, X, Loader2
} from 'lucide-react'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

import { DateFilterPopover } from "@/app/(dashboard)/cases/DateFilterPopover"

export default function TakedownsList({ initialTakedowns, initialFilters, isReviewer }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [takedowns, setTakedowns] = useState(initialTakedowns)

  useEffect(() => {
    setTakedowns(initialTakedowns)
  }, [initialTakedowns])

  const getStatusColor = (status) => {
    switch (status) {
      case 'accepted': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'rejected': return 'bg-rose-50 text-rose-700 border-rose-200'
      case 'under_review': return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'suspended': return 'bg-amber-50 text-amber-700 border-amber-200'
      default: return 'bg-slate-100 text-slate-700 border-slate-200'
    }
  }

  const updateQueryParams = useCallback((newParams) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === undefined || value === 'all' || value === '') {
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
    const params = new URLSearchParams(searchParams.toString())
    params.delete('status')
    params.delete('platform')
    params.delete('threat_type')
    params.delete('risk_score')
    params.delete('date_from')
    params.delete('date_to')
    router.push(`${pathname}?${params.toString()}`)
  }

  const hasActiveFilters = initialFilters.status !== 'all' || 
                           initialFilters.platform !== 'all' || 
                           initialFilters.threat_type !== 'all' || 
                           initialFilters.risk_score !== 'all' || 
                           initialFilters.date_from || 
                           initialFilters.date_to;

  return (
    <div className="flex flex-col h-full w-full bg-slate-50">

      {/* Filters & Controls */}
      <div className="px-8 py-6 shrink-0">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6">

            {/* Left: Filters */}
            <div className="flex items-start xl:items-center gap-6 w-full xl:w-auto overflow-x-auto pb-2 xl:pb-0">
              <div className="flex items-center gap-2.5 shrink-0 mt-6 xl:mt-0">
                <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                  <Filter className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Filters</span>
              </div>

              <Separator orientation="vertical" className="h-8 bg-slate-100 hidden xl:block" />

              <div className="flex flex-nowrap items-center gap-4 shrink-0">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Status</Label>
                  <Select
                    value={initialFilters.status}
                    onValueChange={(val) => handleFilterChange('status', val)}
                  >
                    <SelectTrigger className="w-[140px] bg-white border-slate-200 h-9 text-xs font-semibold">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="raised">Raised</SelectItem>
                      <SelectItem value="under_review">Under Review</SelectItem>
                      <SelectItem value="accepted">Accepted</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Platform</Label>
                  <Select
                    value={initialFilters.platform}
                    onValueChange={(val) => handleFilterChange('platform', val)}
                  >
                    <SelectTrigger className="w-[130px] bg-white border-slate-200 h-9 text-xs font-semibold">
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

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Threat Type</Label>
                  <Select
                    value={initialFilters.threat_type}
                    onValueChange={(val) => handleFilterChange('threat_type', val)}
                  >
                    <SelectTrigger className="w-[140px] bg-white border-slate-200 h-9 text-xs font-semibold">
                      <SelectValue placeholder="All Threats" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Threats</SelectItem>
                      <SelectItem value="scam">Scam</SelectItem>
                      <SelectItem value="hate_speech">Hate Speech</SelectItem>
                      <SelectItem value="violence">Violence</SelectItem>
                      <SelectItem value="nsfw">NSFW</SelectItem>
                      <SelectItem value="fake_news">Fake News</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Risk Score</Label>
                  <Select
                    value={initialFilters.risk_score}
                    onValueChange={(val) => handleFilterChange('risk_score', val)}
                  >
                    <SelectTrigger className="w-[120px] bg-white border-slate-200 h-9 text-xs font-semibold">
                      <SelectValue placeholder="All Scores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Scores</SelectItem>
                      <SelectItem value="high">High (80-100)</SelectItem>
                      <SelectItem value="medium">Medium (40-79)</SelectItem>
                      <SelectItem value="low">Low (0-39)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Date Range</Label>
                  <div className="w-[220px]">
                    <DateFilterPopover 
                      title="All Time" 
                      initialFrom={initialFilters.date_from} 
                      initialTo={initialFilters.date_to}
                      onApply={(range) => {
                        updateQueryParams({
                          date_from: range?.from ? range.from.toISOString() : null,
                          date_to: range?.to ? range.to.toISOString() : null
                        });
                      }}
                    />
                  </div>
                </div>

                {hasActiveFilters && (
                  <div className="pt-4 shrink-0">
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold text-xs">
                      <X className="w-3.5 h-3.5 mr-1" /> Clear
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
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
          <div className="grid grid-cols-1 gap-4">
            {takedowns.map((item) => (
              <Link
                key={item.id}
                href={`/takedowns/case/${item.id}`}
                className="group block bg-white rounded-xl shadow-sm border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 overflow-hidden"
              >
                <div className="flex h-32">

                  {/* Thumbnail / Left Accent */}
                  <div className="w-32 bg-slate-100 shrink-0 relative overflow-hidden flex items-center justify-center border-r border-slate-100">
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
                    <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded shadow-sm border border-white/20">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                        {item.platform?.slice(0, 1)}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 p-5 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-slate-900 truncate leading-tight group-hover:text-blue-600 transition-colors">
                            {item.enrichment?.username ? `@${item.enrichment.username}` : `Case #${item.post_platform_id.substring(0, 8)}`}
                          </h3>
                          <p className="text-sm text-slate-500 truncate mt-1">
                            {item.enrichment?.caption || <span className="italic opacity-50">No caption content</span>}
                          </p>
                        </div>
                        <Badge variant="outline" className={cn("shrink-0 uppercase text-[10px] font-bold h-6", getStatusColor(item.status))}>
                          {item.status?.replace('_', ' ')}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-xs text-slate-500 mt-2 border-t border-slate-50 pt-2">
                      <span className="flex items-center gap-1.5">
                        <div className={cn("w-1.5 h-1.5 rounded-full", item.risk_score > 80 ? 'bg-rose-500' : 'bg-orange-400')} />
                        Risk: <span className="font-bold text-slate-700">{item.risk_score}/100</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <ShieldAlert className="w-3 h-3 text-slate-400" />
                        <span className="font-medium text-slate-700 capitalize">{item.threat_type?.replace('_', ' ')}</span>
                      </span>
                      {item.last_update_date && (
                        <span className="text-slate-400 flex items-center gap-1.5 ml-auto font-medium">
                          <Clock className="w-3 h-3" />
                          Updated {new Date(item.last_update_date).toLocaleDateString()}
                        </span>
                      )}
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
