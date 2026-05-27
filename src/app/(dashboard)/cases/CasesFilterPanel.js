'use client'

import { useEffect } from 'react'
import { format } from 'date-fns'
import { Search, Info, X, UserPlus, Check, Loader2, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DateFilterPopover } from '@/components/DateFilterPopover'
import { ViolationsFilter } from './ViolationsFilter'
import { RiskFilter } from './RiskFilter'
import { StatusFilter } from './StatusFilter'
import { PlatformFilter } from './PlatformFilter'
import { cn } from '@/lib/utils'

function FilterSection({ title, showSections, children, className, compact }) {
  if (!showSections) {
    return <div className={className}>{children}</div>
  }
  return (
    <section
      className={cn(
        'border-b border-slate-100 last:border-0 last:mb-0 last:pb-0',
        compact ? 'pb-3 mb-3' : 'pb-4 mb-4',
        className
      )}
    >
      <h3
        className={cn(
          'text-[10px] font-bold uppercase tracking-wider text-slate-400',
          compact ? 'mb-2' : 'mb-3'
        )}
      >
        {title}
      </h3>
      <div className={cn('flex flex-col', compact ? 'gap-1.5' : 'gap-3')}>{children}</div>
    </section>
  )
}

function FilterField({ layout, children, className, compactInline }) {
  if (compactInline) {
    // Add horizontal padding on mobile (stacked) to make inputs feel less edge-to-edge.
    return <div className={cn('w-full px-1.5 sm:px-3', className)}>{children}</div>
  }
  const fieldClass =
    layout === 'row'
      ? 'space-y-1 w-full lg:w-auto lg:flex-1 lg:max-w-[160px]'
      : 'space-y-1 w-full'
  return <div className={cn(fieldClass, className)}>{children}</div>
}

function InlineFilterRow({ label, children, className }) {
  return (
    <div className={cn('flex items-center gap-2 w-full min-h-9', className)}>
      <Label className="shrink-0 w-[4.75rem] text-[10px] uppercase font-bold text-slate-400 leading-tight">
        {label}
      </Label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function ActiveFilterChip({ label, onRemove }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold shrink-0"
    >
      <span>{label}</span>
      <X className="w-3 h-3 text-slate-400" />
    </button>
  )
}

export function CasesFilterPanel({
  layout = 'row',
  showSections = false,
  compactInline: compactInlineProp,
  contextualPlacement = 'bottom',
  stickyContextual = false,
  mobileDrawerLayout = false,
  scrollPaddingBottom = false,
  onMobileDrawerDone,
  initialFilters,
  project,
  allowDoTakedown,
  handleFilterChange,
  updateQueryParams,
  searchTerm,
  setSearchTerm,
  handleSearchApply,
  searchParams,
  selectedCount,
  selectedCases,
  clientDetails,
  projectEmails,
  bulkAssignedEmail,
  setBulkAssignedEmail,
  handleBulkAssign,
  isBulkAssigning,
  applyWhenRangeComplete = false,
  debouncedSearch = false,
  showBulkActionPopover = false,
  actionMenuOpen,
  setActionMenuOpen,
  isAllFilterSelected,
  totalCount,
  isBulkTakedownProcessing,
  isBulkNoActionProcessing,
  isBulkFlagProcessing,
  onBulkTakedown,
  onBulkNoAction,
  onBulkFlag,
  BulkActionMenu,
  clearFilters,
}) {
  const isStacked = layout === 'stacked'
  const compactInline = compactInlineProp ?? isStacked

  useEffect(() => {
    if (!debouncedSearch) return
    const timer = setTimeout(() => {
      const val = searchTerm.trim()
      const current = searchParams.get('semantic_search') || ''
      if (val === current) return
      if (val) {
        updateQueryParams({ semantic_search: val, similar_to: null, search_type: null })
      } else if (current) {
        updateQueryParams({ semantic_search: null })
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [searchTerm, debouncedSearch, searchParams, updateQueryParams])

  const statusOptions = [
    { value: 'To Be Reviewed', label: 'To Be Reviewed' },
    allowDoTakedown && { value: 'Takedown', label: 'Takedown' },
    { value: 'No Action', label: 'No Action' },
    { value: 'Flag for Takedown', label: 'Flag for Takedown' },
  ].filter(Boolean)

  const activeChips = []

  if (initialFilters.risk_priority && initialFilters.risk_priority !== 'all') {
    activeChips.push({
      label: `Risk: ${initialFilters.risk_priority}`,
      onRemove: () => handleFilterChange('risk_priority', 'all'),
    })
  }
  if (initialFilters.platform && initialFilters.platform !== 'all') {
    activeChips.push({
      label: `Platform: ${initialFilters.platform}`,
      onRemove: () => handleFilterChange('platform', 'all'),
    })
  }
  if (initialFilters.client_status && initialFilters.client_status !== 'all') {
    activeChips.push({
      label: `Status: ${initialFilters.client_status}`,
      onRemove: () => handleFilterChange('client_status', 'all'),
    })
  }
  if (initialFilters.violations && initialFilters.violations !== 'all') {
    activeChips.push({
      label: `Violations: ${initialFilters.violations}`,
      onRemove: () => handleFilterChange('violations', 'all'),
    })
  }
  if (initialFilters.visibility_status && initialFilters.visibility_status !== 'all') {
    activeChips.push({
      label: `Visibility: ${initialFilters.visibility_status === 'active' ? 'Online' : 'Taken Down'}`,
      onRemove: () => handleFilterChange('visibility_status', 'all'),
    })
  }
  if (initialFilters.unique_clusters === 'true' || initialFilters.unique_clusters === true) {
    activeChips.push({
      label: 'Unique content',
      onRemove: () => handleFilterChange('unique_clusters', 'false'),
    })
  }
  if (initialFilters.processed_from || initialFilters.processed_to) {
    activeChips.push({
      label: 'Alert date',
      onRemove: () =>
        updateQueryParams({ processed_from: null, processed_to: null }),
    })
  }
  if (initialFilters.original_date_from || initialFilters.original_date_to) {
    activeChips.push({
      label: 'Publish date',
      onRemove: () =>
        updateQueryParams({ original_date_from: null, original_date_to: null }),
    })
  }

  const showContextualSection =
    showSections &&
    (activeChips.length > 0 ||
      searchParams.get('similar_to') ||
      searchParams.get('semantic_search') ||
      selectedCount === 1 ||
      (selectedCount > 0 && clientDetails?.permission === 'client-admin'))

  const filtersWrapClass = cn(
    showSections ? 'flex flex-col w-full' : 'flex flex-wrap items-center gap-2.5 sm:gap-3 w-full h-full'
  )

  const caseAttributes = (
    <>
      <FilterField layout={layout} compactInline={compactInline} className={!isStacked && 'lg:max-w-[160px]'}>
        <RiskFilter
          inline={compactInline}
          initialRisk={initialFilters.risk_priority || 'all'}
          onChange={(val) => handleFilterChange('risk_priority', val)}
        />
      </FilterField>
      <FilterField layout={layout} compactInline={compactInline} className={!isStacked && 'lg:max-w-[160px]'}>
        <PlatformFilter
          inline={compactInline}
          initialPlatform={initialFilters.platform}
          onChange={(val) => handleFilterChange('platform', val)}
        />
      </FilterField>
      <FilterField layout={layout} compactInline={compactInline} className={!isStacked && 'lg:max-w-[160px]'}>
        <StatusFilter
          inline={compactInline}
          initialStatus={initialFilters.client_status}
          onChange={(val) => handleFilterChange('client_status', val)}
          options={statusOptions}
        />
      </FilterField>
      <FilterField layout={layout} compactInline={compactInline} className={!isStacked && 'lg:min-w-[140px] lg:max-w-[180px]'}>
        <ViolationsFilter
          inline={compactInline}
          projectLabels={project?.project_details?.labels || []}
          initialViolations={initialFilters.violations}
          onChange={(val) => handleFilterChange('violations', val)}
        />
      </FilterField>
    </>
  )

  const dateFilters = (
    <>
      <FilterField layout={layout} compactInline={compactInline} className={!isStacked && 'lg:min-w-[140px] lg:max-w-[160px]'}>
        {compactInline ? (
          <InlineFilterRow label="Alert">
            <DateFilterPopover
              title="Alert Date"
              initialFrom={initialFilters.processed_from}
              initialTo={initialFilters.processed_to}
              applyWhenRangeComplete={applyWhenRangeComplete}
              onApply={(range) =>
                updateQueryParams({
                  processed_from: range?.from
                    ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX")
                    : null,
                  processed_to: range?.to
                    ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX")
                    : null,
                })
              }
            />
          </InlineFilterRow>
        ) : (
          <>
            <Label className="text-[10px] uppercase font-bold text-slate-400">Alert Date</Label>
            <DateFilterPopover
              title="Alert Date"
              initialFrom={initialFilters.processed_from}
              initialTo={initialFilters.processed_to}
              applyWhenRangeComplete={applyWhenRangeComplete}
              onApply={(range) =>
                updateQueryParams({
                  processed_from: range?.from
                    ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX")
                    : null,
                  processed_to: range?.to
                    ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX")
                    : null,
                })
              }
            />
          </>
        )}
      </FilterField>
      <FilterField layout={layout} compactInline={compactInline} className={!isStacked && 'lg:min-w-[140px] lg:max-w-[160px]'}>
        {compactInline ? (
          <InlineFilterRow label="Publish">
            <DateFilterPopover
              title="Publish Date"
              initialFrom={initialFilters.original_date_from}
              initialTo={initialFilters.original_date_to}
              applyWhenRangeComplete={applyWhenRangeComplete}
              onApply={(range) =>
                updateQueryParams({
                  original_date_from: range?.from
                    ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX")
                    : null,
                  original_date_to: range?.to
                    ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX")
                    : null,
                })
              }
            />
          </InlineFilterRow>
        ) : (
          <>
            <Label className="text-[10px] uppercase font-bold text-slate-400">Publish Date</Label>
            <DateFilterPopover
              title="Publish Date"
              initialFrom={initialFilters.original_date_from}
              initialTo={initialFilters.original_date_to}
              applyWhenRangeComplete={applyWhenRangeComplete}
              onApply={(range) =>
                updateQueryParams({
                  original_date_from: range?.from
                    ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX")
                    : null,
                  original_date_to: range?.to
                    ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX")
                    : null,
                })
              }
            />
          </>
        )}
      </FilterField>
    </>
  )

  const contentFilters = (
    <>
      <FilterField layout={layout} compactInline={compactInline} className={!isStacked && 'lg:max-w-[160px]'}>
        <StatusFilter
          inline={compactInline}
          label="Visibility"
          placeholder="All Visibility"
          initialStatus={initialFilters.visibility_status || 'all'}
          onChange={(val) => handleFilterChange('visibility_status', val)}
          options={[
            { value: 'active', label: 'Online' },
            { value: 'down', label: 'Taken Down' },
          ]}
        />
      </FilterField>
      <FilterField
        layout={layout}
        compactInline={compactInline}
        className={!isStacked && 'lg:max-w-[120px] flex flex-col justify-end'}
      >
        {compactInline ? (
          <InlineFilterRow label="Unique">
            <div className="flex items-center justify-start w-fit h-9 border border-slate-200 rounded-md px-2.5 bg-gray-50 shadow-sm">
              <Switch
                checked={
                  initialFilters.unique_clusters === 'true' ||
                  initialFilters.unique_clusters === true
                }
                onCheckedChange={(checked) =>
                  handleFilterChange('unique_clusters', checked ? 'true' : 'false')
                }
              />
            </div>
          </InlineFilterRow>
        ) : (
          <>
            <Label className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">
              Unique Content
            </Label>
            <div className="flex items-center gap-2 h-9 border border-slate-200 rounded-md px-2 bg-gray-50 shadow-sm">
              <Switch
                checked={
                  initialFilters.unique_clusters === 'true' ||
                  initialFilters.unique_clusters === true
                }
                onCheckedChange={(checked) =>
                  handleFilterChange('unique_clusters', checked ? 'true' : 'false')
                }
              />
              <span className="text-xs font-semibold text-slate-700">Unique</span>
            </div>
          </>
        )}
      </FilterField>
      <FilterField
        layout={layout}
        compactInline={compactInline}
        className={
          !isStacked
            ? 'w-full lg:w-auto lg:max-w-sm shrink-0'
            : undefined
        }
      >
        <Label className="text-[10px] uppercase font-bold text-slate-400 mb-2">Search</Label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by text..."
              className="w-full bg-white border border-slate-200 rounded-md pl-9 pr-3 h-9 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400 shadow-sm transition-all"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSearchApply()
                }
              }}
            />
          </div>
          <Button
            onClick={handleSearchApply}
            className="h-9 w-9 p-0 shrink-0 bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer transition-colors"
            title="Search"
          >
            <Search className="w-4 h-4" />
          </Button>
        </div>
        {debouncedSearch && (
          <p className="text-[9px] text-slate-400 mt-1">Search applies automatically as you type</p>
        )}
      </FilterField>
    </>
  )

  const desktopActiveBar =
    !showSections &&
    (initialFilters.unique_clusters === 'true' ||
      initialFilters.unique_clusters === true ||
      initialFilters.platform !== 'all' ||
      initialFilters.risk_priority !== 'all' ||
      initialFilters.client_status !== 'all' ||
      (initialFilters.visibility_status && initialFilters.visibility_status !== 'all') ||
      (initialFilters.violations && initialFilters.violations !== 'all') ||
      initialFilters.original_date_from ||
      initialFilters.original_date_to ||
      initialFilters.processed_from ||
      initialFilters.processed_to ||
      searchParams.get('similar_to') ||
      searchParams.get('semantic_search')) && (
      <div className="flex flex-wrap items-center gap-2 bg-slate-50/80 border border-slate-100 rounded-md px-3 h-9 shadow-sm shrink-0 w-full xl:w-auto mt-2 xl:mt-5">
        <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Active:</span>
        {searchParams.get('similar_to') && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-purple-50 text-purple-700 rounded font-bold text-[10px] uppercase tracking-wider border border-purple-100">
            <Info className="w-3 h-3" />
            Similarity: {searchParams.get('search_type')}
          </div>
        )}
        {searchParams.get('semantic_search') && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-purple-50 text-purple-700 rounded font-bold text-[10px] uppercase tracking-wider border border-purple-100">
            <Search className="w-3 h-3" />
            Text Search
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="h-6 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold text-[10px] uppercase tracking-wider cursor-pointer transition-colors ml-auto"
        >
          <X className="w-3.5 h-3.5 mr-1 text-rose-500" /> Clear Filters
        </Button>
      </div>
    )

  const contextualContent = (
    <>
      {(activeChips.length > 0 ||
        searchParams.get('similar_to') ||
        searchParams.get('semantic_search')) && (
        <div className="flex flex-wrap gap-2">
          {activeChips.map((chip) => (
            <ActiveFilterChip key={chip.label} label={chip.label} onRemove={chip.onRemove} />
          ))}
          {searchParams.get('similar_to') && (
            <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-purple-50 text-purple-700 rounded-md font-bold text-[10px] uppercase border border-purple-100">
              <Info className="w-3 h-3" />
              Similarity: {searchParams.get('search_type')}
              <button
                type="button"
                onClick={() =>
                  updateQueryParams({ similar_to: null, search_type: null })
                }
                className="ml-0.5"
                aria-label="Clear similarity filter"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {searchParams.get('semantic_search') && (
            <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-purple-50 text-purple-700 rounded-md font-bold text-[10px] uppercase border border-purple-100">
              <Search className="w-3 h-3" />
              Text: {searchParams.get('semantic_search').slice(0, 24)}
              {(searchParams.get('semantic_search')?.length ?? 0) > 24 ? '…' : ''}
              <button
                type="button"
                onClick={() => updateQueryParams({ semantic_search: null })}
                className="ml-0.5"
                aria-label="Clear text search"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {selectedCount === 1 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Find similar to selected case
          </p>
          <div className="flex gap-2">
            <Button
              variant={
                searchParams.get('similar_to') === Object.keys(selectedCases)[0] &&
                searchParams.get('search_type') === 'text'
                  ? 'default'
                  : 'outline'
              }
              size="sm"
              onClick={() => {
                const id = Object.keys(selectedCases)[0]
                if (id)
                  updateQueryParams({
                    similar_to: id,
                    search_type: 'text',
                    semantic_search: null,
                  })
              }}
              className={cn(
                'h-9 flex-1 text-[10px] font-bold uppercase tracking-wider shadow-sm',
                searchParams.get('similar_to') === Object.keys(selectedCases)[0] &&
                  searchParams.get('search_type') === 'text'
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50'
              )}
            >
              <Search className="w-3 h-3 mr-1.5" />
              Similar (Text)
            </Button>
            <Button
              variant={
                searchParams.get('similar_to') === Object.keys(selectedCases)[0] &&
                searchParams.get('search_type') === 'image'
                  ? 'default'
                  : 'outline'
              }
              size="sm"
              onClick={() => {
                const id = Object.keys(selectedCases)[0]
                if (id)
                  updateQueryParams({
                    similar_to: id,
                    search_type: 'image',
                    semantic_search: null,
                  })
              }}
              className={cn(
                'h-9 flex-1 text-[10px] font-bold uppercase tracking-wider shadow-sm',
                searchParams.get('similar_to') === Object.keys(selectedCases)[0] &&
                  searchParams.get('search_type') === 'image'
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50'
              )}
            >
              <Search className="w-3 h-3 mr-1.5" />
              Similar (Image)
            </Button>
          </div>
        </div>
      )}

      {clientDetails?.permission === 'client-admin' && selectedCount > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-md border border-blue-100 w-fit">
            <UserPlus className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Bulk Assignment</span>
          </div>
          <select
            value={bulkAssignedEmail}
            onChange={(e) => setBulkAssignedEmail(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-md px-3 h-9 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="">Select team member to assign these cases</option>
            {projectEmails?.map((userObj) => (
              <option key={userObj.email} value={userObj.email}>
                {userObj.alias || userObj.email}
              </option>
            ))}
          </select>
          <Button
            onClick={handleBulkAssign}
            disabled={!bulkAssignedEmail || isBulkAssigning}
            className="w-full h-9 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-sm"
          >
            {isBulkAssigning ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Assign {selectedCount} {selectedCount === 1 ? 'Case' : 'Cases'}
          </Button>
        </div>
      )}
    </>
  )

  const contextualSection = showContextualSection && (
    <FilterSection
      title="Active & related"
      showSections
      compact={compactInline}
      className={cn(
        mobileDrawerLayout && 'py-2 mb-1 border-0',
        stickyContextual &&
          !mobileDrawerLayout &&
          'sticky top-0 z-10 -mx-4 px-4 pt-0 pb-2 mb-2 bg-white backdrop-blur-sm border-b border-slate-100 shadow-[0_1px_0_rgba(0,0,0,0.04)]'
      )}
    >
      {contextualContent}
    </FilterSection>
  )

  const sectionedFilters = (
    <>
      {!mobileDrawerLayout && contextualPlacement === 'top' && contextualSection}
      <FilterSection title="Case attributes" showSections compact={compactInline}>
        {caseAttributes}
      </FilterSection>
      <FilterSection title="Dates" showSections compact={compactInline}>
        {dateFilters}
      </FilterSection>
      <FilterSection
        title="Content & search"
        showSections
        compact={compactInline}
        className={mobileDrawerLayout ? 'last:border-0 last:pb-0 last:mb-0' : undefined}
      >
        {contentFilters}
        {mobileDrawerLayout && onMobileDrawerDone && (
          <div className="flex justify-center px-6 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 cursor-pointer px-12 py-1 font-semibold shadow-sm "
              onClick={onMobileDrawerDone}
            >
              Done
            </Button>
          </div>
        )}
      </FilterSection>
      {!mobileDrawerLayout && contextualPlacement === 'bottom' && contextualSection}
    </>
  )

  if (mobileDrawerLayout) {
    return (
      <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden">
        {contextualPlacement === 'top' && contextualSection && (
          <div className="shrink-0 bg-white border-b border-slate-100">{contextualSection}</div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar pt-2">
          <div className={filtersWrapClass}>{sectionedFilters}</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col w-full',
        !showSections && 'lg:flex-row gap-6 lg:gap-4',
        scrollPaddingBottom && 'pb-24'
      )}
    >
      <div className={cn('flex flex-col gap-4 w-full', !showSections && 'lg:flex-1')}>
        <div className="flex flex-col gap-3 w-full">
          <div className={filtersWrapClass}>
            {showSections ? (
              sectionedFilters
            ) : (
              <>
                {caseAttributes}
                {dateFilters}
                {contentFilters}
                {showBulkActionPopover && selectedCount > 0 && BulkActionMenu && (
                  <FilterField layout={layout} className="hidden lg:block w-full sm:max-w-xs shrink-0">
                    <Label className="text-[10px] uppercase font-bold text-slate-400">Bulk Action</Label>
                    <Popover open={actionMenuOpen} onOpenChange={setActionMenuOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          disabled={
                            isBulkTakedownProcessing ||
                            isBulkNoActionProcessing ||
                            isBulkFlagProcessing
                          }
                          className={cn(
                            'h-9 font-bold text-white shadow-sm transition-all flex items-center justify-between gap-2',
                            'bg-red-400 hover:bg-red-500 cursor-pointer'
                          )}
                          title="Select an action for the selected cases"
                        >
                          <span className="flex items-center gap-2">
                            Select Action ({isAllFilterSelected ? totalCount : selectedCount})
                          </span>
                          <ChevronDown
                            className={cn(
                              'w-4 h-4 transition-transform',
                              actionMenuOpen && 'rotate-180'
                            )}
                          />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        sideOffset={6}
                        style={{ width: 'var(--radix-popover-trigger-width)' }}
                        className="min-w-[150px] p-1 rounded-md border border-slate-200 shadow-lg"
                      >
                        <BulkActionMenu
                          allowDoTakedown={allowDoTakedown}
                          isBulkTakedownProcessing={isBulkTakedownProcessing}
                          isBulkNoActionProcessing={isBulkNoActionProcessing}
                          isBulkFlagProcessing={isBulkFlagProcessing}
                          onDoTakedown={onBulkTakedown}
                          onNoAction={onBulkNoAction}
                          onFlagForTakedown={onBulkFlag}
                        />
                      </PopoverContent>
                    </Popover>
                  </FilterField>
                )}
                {desktopActiveBar}
              </>
            )}
          </div>
        </div>

        {!showSections && (
          <div
            className="grid transition-all duration-300 ease-in-out"
            style={{
              gridTemplateRows:
                selectedCount === 1 ||
                (selectedCount > 0 && clientDetails?.permission === 'client-admin')
                  ? '1fr'
                  : '0fr',
            }}
          >
            <div className="overflow-hidden">
              <div
                className={cn(
                  'flex flex-wrap items-center gap-4 transition-all duration-300 ease-in-out',
                  selectedCount === 1 ||
                    (selectedCount > 0 && clientDetails?.permission === 'client-admin')
                    ? 'pt-3 border-t border-slate-100 mt-2'
                    : 'pt-0 border-transparent mt-0'
                )}
              >
                <div
                  className={cn(
                    'flex items-center overflow-hidden transition-all duration-300 ease-in-out',
                    selectedCount === 1
                      ? 'max-w-[400px] opacity-100 pr-4 lg:border-r border-slate-100 mb-2 lg:mb-0'
                      : 'max-h-0 max-w-0 opacity-0 pr-0 border-transparent mb-0'
                  )}
                >
                  {selectedCount === 1 && (
                    <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">
                      <Button
                        variant={
                          searchParams.get('similar_to') === Object.keys(selectedCases)[0] &&
                          searchParams.get('search_type') === 'text'
                            ? 'default'
                            : 'outline'
                        }
                        size="sm"
                        onClick={() => {
                          const id = Object.keys(selectedCases)[0]
                          if (id)
                            updateQueryParams({
                              similar_to: id,
                              search_type: 'text',
                              semantic_search: null,
                            })
                        }}
                        className={cn(
                          'h-8 px-3 text-[10px] font-bold uppercase tracking-wider flex-1 lg:flex-none shadow-sm',
                          searchParams.get('similar_to') === Object.keys(selectedCases)[0] &&
                            searchParams.get('search_type') === 'text'
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50'
                        )}
                      >
                        <Search className="w-3 h-3 mr-1.5" />
                        Find Similar (Text)
                      </Button>
                      <Button
                        variant={
                          searchParams.get('similar_to') === Object.keys(selectedCases)[0] &&
                          searchParams.get('search_type') === 'image'
                            ? 'default'
                            : 'outline'
                        }
                        size="sm"
                        onClick={() => {
                          const id = Object.keys(selectedCases)[0]
                          if (id)
                            updateQueryParams({
                              similar_to: id,
                              search_type: 'image',
                              semantic_search: null,
                            })
                        }}
                        className={cn(
                          'h-8 px-3 text-[10px] font-bold uppercase tracking-wider flex-1 lg:flex-none shadow-sm',
                          searchParams.get('similar_to') === Object.keys(selectedCases)[0] &&
                            searchParams.get('search_type') === 'image'
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        )}
                      >
                        <Search className="w-3 h-3 mr-1.5" />
                        Find Similar (Image)
                      </Button>
                    </div>
                  )}
                </div>

                {clientDetails?.permission === 'client-admin' && selectedCount > 0 && (
                  <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3 w-full lg:max-w-lg">
                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-md border border-blue-100 whitespace-nowrap">
                      <UserPlus className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        Bulk Assignment
                      </span>
                    </div>
                    <select
                      value={bulkAssignedEmail}
                      onChange={(e) => setBulkAssignedEmail(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-md px-3 h-9 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="">Select team member to assign these cases</option>
                      {projectEmails?.map((userObj) => (
                        <option key={userObj.email} value={userObj.email}>
                          {userObj.alias || userObj.email}
                        </option>
                      ))}
                    </select>
                    <Button
                      onClick={handleBulkAssign}
                      disabled={!bulkAssignedEmail || isBulkAssigning}
                      className="w-full lg:w-auto h-9 px-6 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-sm shrink-0"
                    >
                      {isBulkAssigning ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      Assign {selectedCount} {selectedCount === 1 ? 'Case' : 'Cases'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
