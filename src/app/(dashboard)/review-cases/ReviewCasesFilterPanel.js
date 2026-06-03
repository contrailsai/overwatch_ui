'use client'

import { format } from 'date-fns'
import { Sparkles } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { DateFilterPopover } from './DateFilterPopover'
import { cn } from '@/lib/utils'

export function ReviewCasesFilterPanel({
  currentFilters,
  handleFilterChange,
  updateQueryParams,
  layout = 'grid',
  onFilterApplied,
}) {
  const isStacked = layout === 'stacked'

  const wrapClass = cn(
    isStacked ? 'flex flex-col gap-4' : 'grid grid-cols-1 items-end md:grid-cols-5 gap-5'
  )

  const applyAndClose = (fn) => {
    fn()
    onFilterApplied?.()
  }

  return (
    <div className={wrapClass}>
      <div className="space-y-2">
        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Status</Label>
        <Select
          value={currentFilters.status || 'pending'}
          onValueChange={(val) => applyAndClose(() => handleFilterChange('status', val))}
        >
          <SelectTrigger className="w-full bg-slate-50 border-slate-200 hover:border-slate-300 focus:ring-blue-500/20">
            <SelectValue placeholder="Select Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending Review</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="all">All Items</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Platform</Label>
        <Select
          value={currentFilters.platform || 'all'}
          onValueChange={(val) => applyAndClose(() => handleFilterChange('platform', val))}
        >
          <SelectTrigger className="w-full bg-slate-50 border-slate-200 hover:border-slate-300 focus:ring-blue-500/20">
            <SelectValue placeholder="All Platforms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="reddit">Reddit</SelectItem>
            <SelectItem value="x">X (Twitter)</SelectItem>
            <SelectItem value="youtube">YouTube</SelectItem>
            <SelectItem value="website">Websites</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 w-full min-w-32">
        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Sourcing Date</Label>
        <DateFilterPopover
          title="Sourcing Date"
          initialFrom={currentFilters.sourcingDateStart}
          initialTo={currentFilters.sourcingDateEnd}
          onApply={(range) => applyAndClose(() => updateQueryParams({
            sourcingDateStart: range?.from ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
            sourcingDateEnd: range?.to ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
            page: 1,
          }))}
        />
      </div>

      <div className="space-y-1.5 w-full min-w-32">
        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Publish Date</Label>
        <DateFilterPopover
          title="Publish Date"
          initialFrom={currentFilters.postingDateStart}
          initialTo={currentFilters.postingDateEnd}
          onApply={(range) => applyAndClose(() => updateQueryParams({
            postingDateStart: range?.from ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
            postingDateEnd: range?.to ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
            page: 1,
          }))}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
          AI Analysis
        </Label>
        <Select
          value={
            currentFilters.aiAnalyzed === 'analyzed' || currentFilters.aiAnalyzed === true || currentFilters.aiAnalyzed === 'true'
              ? 'analyzed'
              : currentFilters.aiAnalyzed === 'not_analyzed'
                ? 'not_analyzed'
                : 'all'
          }
          onValueChange={(val) => applyAndClose(() => handleFilterChange('aiAnalyzed', val === 'all' ? null : val))}
        >
          <SelectTrigger className="w-full bg-slate-50 border-slate-200 hover:border-slate-300 focus:ring-blue-500/20">
            <SelectValue placeholder="All Cases" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cases</SelectItem>
            <SelectItem value="analyzed">AI Analyzed Only</SelectItem>
            <SelectItem value="not_analyzed">Not Analyzed by AI</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
