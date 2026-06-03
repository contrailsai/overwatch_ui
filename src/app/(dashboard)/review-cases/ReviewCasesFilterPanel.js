'use client'

import { format } from 'date-fns'
import { Sparkles, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { DateFilterPopover } from '@/components/DateFilterPopover'
import { cn } from '@/lib/utils'

const LABEL_CLASS = 'text-[10px] font-bold text-slate-500 uppercase tracking-wide'
const TRIGGER_CLASS =
  'w-full h-8 text-xs bg-slate-50 border-slate-200 hover:border-slate-300 focus:ring-blue-500/20 px-2.5'
const DATE_TRIGGER_CLASS = 'h-8 bg-slate-50 border-slate-200 hover:bg-slate-50 px-2.5'

function FilterField({ label, children, className, labelIcon }) {
  return (
    <div className={cn('space-y-0.5 min-w-0', className)}>
      <Label className={cn(LABEL_CLASS, labelIcon && 'flex items-center gap-1')}>
        {labelIcon}
        {label}
      </Label>
      {children}
    </div>
  )
}

export function ReviewCasesFilterPanel({
  currentFilters,
  handleFilterChange,
  updateQueryParams,
  layout = 'row',
  onFilterApplied,
  searchTerm = '',
  onSearchTermChange,
  onSearchApply,
}) {
  const isStacked = layout === 'stacked'
  const isRow = layout === 'row'

  const wrapClass = cn(
    isStacked && 'flex flex-col gap-3',
    isRow &&
      'grid w-full items-end gap-x-2 gap-y-1.5 grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(8.25rem,1fr))] xl:grid-cols-7'
  )

  const fieldClass = isStacked ? 'w-full' : undefined
  const dateFieldClass = isStacked ? 'w-full' : 'min-w-0'

  const applyAndClose = (fn) => {
    fn()
    onFilterApplied?.()
  }

  const searchFieldClass = isStacked
    ? 'w-full'
    : 'col-span-full sm:col-span-2 xl:col-span-2 min-w-[12rem]'

  return (
    <div className={wrapClass}>
      {(onSearchTermChange && onSearchApply) && (
        <div className={cn('space-y-0.5', searchFieldClass)}>
          <span className={LABEL_CLASS}>Search</span>
          <div className="flex gap-1.5">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchTermChange(e.target.value)}
                placeholder="URL, source link, or text..."
                className="w-full h-8 rounded-md border border-slate-200 bg-white pl-8 pr-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onSearchApply()
                    onFilterApplied?.()
                  }
                }}
              />
            </div>
            <Button
              type="button"
              onClick={() => {
                onSearchApply()
                onFilterApplied?.()
              }}
              className="h-8 w-8 p-0 shrink-0 bg-blue-600 hover:bg-blue-700 text-white"
              title="Search"
            >
              <Search className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      <FilterField label="Status" className={fieldClass}>
        <Select
          value={currentFilters.status || 'pending'}
          onValueChange={(val) => applyAndClose(() => handleFilterChange('status', val))}
        >
          <SelectTrigger size="sm" className={TRIGGER_CLASS}>
            <SelectValue placeholder="Select Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending Review</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="all">All Items</SelectItem>
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label="Platform" className={fieldClass}>
        <Select
          value={currentFilters.platform || 'all'}
          onValueChange={(val) => applyAndClose(() => handleFilterChange('platform', val))}
        >
          <SelectTrigger size="sm" className={TRIGGER_CLASS}>
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
      </FilterField>

      <FilterField label="Sourcing Date" className={dateFieldClass}>
        <DateFilterPopover
          title="Sourcing Date"
          triggerClassName={DATE_TRIGGER_CLASS}
          initialFrom={currentFilters.sourcingDateStart}
          initialTo={currentFilters.sourcingDateEnd}
          onApply={(range) => applyAndClose(() => updateQueryParams({
            sourcingDateStart: range?.from ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
            sourcingDateEnd: range?.to ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
            page: 1,
          }))}
        />
      </FilterField>

      <FilterField label="Publish Date" className={dateFieldClass}>
        <DateFilterPopover
          title="Publish Date"
          triggerClassName={DATE_TRIGGER_CLASS}
          initialFrom={currentFilters.postingDateStart}
          initialTo={currentFilters.postingDateEnd}
          onApply={(range) => applyAndClose(() => updateQueryParams({
            postingDateStart: range?.from ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
            postingDateEnd: range?.to ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
            page: 1,
          }))}
        />
      </FilterField>

      <FilterField label="Visibility" className={fieldClass}>
        <Select
          value={currentFilters.visibility_status || 'all'}
          onValueChange={(val) => applyAndClose(() => handleFilterChange('visibility_status', val === 'all' ? null : val))}
        >
          <SelectTrigger size="sm" className={TRIGGER_CLASS}>
            <SelectValue placeholder="All Visibility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Visibility</SelectItem>
            <SelectItem value="active">Online</SelectItem>
            <SelectItem value="down">Taken Down</SelectItem>
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label="Threat Risk" className={fieldClass}>
        <Select
          value={currentFilters.aiRisk || 'all'}
          onValueChange={(val) => applyAndClose(() => handleFilterChange('aiRisk', val === 'all' ? null : val))}
        >
          <SelectTrigger size="sm" className={TRIGGER_CLASS}>
            <SelectValue placeholder="All Risk Levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Levels</SelectItem>
            <SelectItem value="high">High Risk</SelectItem>
            <SelectItem value="medium">Medium Risk</SelectItem>
            <SelectItem value="low">Low Risk</SelectItem>
            <SelectItem value="safe">Safe</SelectItem>
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField
        label="AI Analysis"
        className={fieldClass}
        labelIcon={<Sparkles className="w-3 h-3 text-blue-500 shrink-0" />}
      >
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
          <SelectTrigger size="sm" className={TRIGGER_CLASS}>
            <SelectValue placeholder="All Cases" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cases</SelectItem>
            <SelectItem value="analyzed">AI Analyzed Only</SelectItem>
            <SelectItem value="not_analyzed">Not Analyzed by AI</SelectItem>
          </SelectContent>
        </Select>
      </FilterField>
    </div>
  )
}
