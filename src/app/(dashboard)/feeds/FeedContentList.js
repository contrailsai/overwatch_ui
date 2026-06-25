'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo, useTransition } from 'react'
import {
  Filter,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  ArrowUpDown,
  ExternalLink,
  Quote,
  Instagram,
  Facebook,
  Youtube,
  ClockFading,
  CheckCircle,
  FlagTriangleLeft,
  AlertOctagon,
  Info,
} from 'lucide-react'
import { format } from 'date-fns'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Twitter, Reddit } from '@/utils/icons'
import getPostLink from '@/components/GetPostLink'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import ReportGenerate from '@/components/ReportGenerate'
import { useIsMobile } from '@/hooks/use-media-query'
import { CaseDetailPanel } from '@/app/(dashboard)/cases/CaseDetailPanel'
import { MobileCasesFilterDrawer } from '@/app/(dashboard)/cases/MobileCasesFilterDrawer'
import { getRiskLabel } from '@/app/(dashboard)/cases/riskBuckets'
import { trackClientClick } from '@/app/(dashboard)/cases/actions'
import { getFeedPostIds } from './actions'
import { PublishingHistogram } from './PublishingHistogram'

function getStatusConfig(post, allowDoTakedown) {
  const status = post.client_status || 'To Be Reviewed'
  if (status === 'To Be Reviewed') {
    return { label: 'To Be Reviewed', icon: ClockFading, color: 'text-slate-500 bg-slate-50 border-slate-200' }
  }
  if (status === 'No Action' || status === 'Pass') {
    return { label: 'No Action', icon: CheckCircle, color: 'text-emerald-500 bg-emerald-50 border-emerald-200' }
  }
  if (status === 'Flag for Takedown') {
    return {
      label: 'Flag for Takedown',
      icon: FlagTriangleLeft,
      color: allowDoTakedown
        ? 'text-orange-500 bg-orange-50 border-orange-200'
        : 'text-rose-500 bg-rose-50 border-rose-200',
    }
  }
  if (status === 'Takedown') {
    return { label: 'Takedown', icon: AlertOctagon, color: 'text-rose-500 bg-rose-50 border-rose-200' }
  }
  return { label: status, icon: Info, color: 'text-slate-600 bg-slate-50 border-slate-200' }
}

function PostTableRow({
  post,
  allowDoTakedown,
  isOpen,
  isSelected,
  onOpen,
  onToggle,
}) {
  const risk = getRiskLabel(post.review_details?.threat_score)
  const statusConfig = getStatusConfig(post, allowDoTakedown)
  const StatusIcon = statusConfig.icon

  return (
    <tr
      className={cn(
        'border-b border-slate-50 hover:bg-slate-50/80 cursor-pointer transition-colors',
        isOpen && 'bg-blue-50/60',
        isSelected && !isOpen && 'bg-slate-50'
      )}
      onClick={() => onOpen(post)}
    >
      <td className="px-3 py-2.5 align-top" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggle(post, e)}
          className="h-4 w-4 rounded border-slate-300 text-blue-600"
        />
      </td>
      <td className="px-3 py-2.5 align-top text-center">
        <span className={cn('inline-flex rounded border px-1.5 py-0.5 text-[10px] font-black uppercase', risk.color)}>
          {risk.label}
        </span>
      </td>
      <td className="px-3 py-2.5 align-top">
        <div className="flex gap-2.5">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
            {post.signedImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.signedImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Quote className="h-4 w-4 text-slate-300" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {post.platform === 'instagram' ? <Instagram className="h-3.5 w-3.5 text-pink-500" />
                : post.platform === 'facebook' ? <Facebook className="h-3.5 w-3.5 text-blue-600" />
                  : post.platform === 'x' ? <Twitter className="h-3.5 w-3.5" />
                    : post.platform === 'youtube' ? <Youtube className="h-3.5 w-3.5 text-red-500" />
                      : post.platform === 'reddit' ? <Reddit className="h-3.5 w-3.5" />
                        : null}
              <span className="text-xs font-bold text-slate-800 truncate">
                @{post.user?.username || 'unknown'}
              </span>
              <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full border', statusConfig.color)}>
                <StatusIcon className="h-2.5 w-2.5" />
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-600">
              {post.caption || <span className="italic text-slate-400">No caption</span>}
            </p>
          </div>
        </div>
      </td>
      <td className="hidden lg:table-cell px-3 py-2.5 align-top text-xs text-slate-500 whitespace-nowrap">
        {post.posted_date ? format(new Date(post.posted_date), 'MMM d, yyyy') : '—'}
      </td>
      <td className="px-2 py-2.5 align-top" onClick={(e) => e.stopPropagation()}>
        <a
          href={post.original_url || getPostLink(post)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-md p-1 text-blue-600 hover:bg-blue-50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </td>
    </tr>
  )
}

export function FeedContentList({
  feedId,
  feed,
  postsResult,
  histogramData,
  project,
  clientDetails,
  projectEmails,
  initialFilters,
  initialSort,
  currentPage,
  itemsPerPage,
  initialCase,
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isMobileQuery = useIsMobile()
  const [mounted, setMounted] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setMounted(true)
  }, [])

  const isMobile = mounted && isMobileQuery

  const totalCount = postsResult?.totalCount || 0
  const totalPages = postsResult?.totalPages || 0
  const [mergedPosts, setMergedPosts] = useState(postsResult?.posts || [])
  const [selectedPost, setSelectedPost] = useState(initialCase || null)
  const [selectedCases, setSelectedCases] = useState({})
  const [isAllFilterSelected, setIsAllFilterSelected] = useState(false)
  const [isSelectingAll, setIsSelectingAll] = useState(false)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [summaryState, setSummaryState] = useState({ loading: false, statusText: '' })
  const [detailedPdfState, setDetailedPdfState] = useState({ loading: false, statusText: '' })
  const [detailedDocxState, setDetailedDocxState] = useState({ loading: false, statusText: '' })

  const selectedCount = Object.keys(selectedCases).length
  const selectedPostsArray = useMemo(() => Object.values(selectedCases), [selectedCases])

  const allowDoTakedown = project?.project_details?.do_takedowns !== false

  useEffect(() => {
    setMergedPosts(postsResult?.posts || [])
  }, [postsResult?.posts])

  useEffect(() => {
    setSelectedPost(initialCase || null)
  }, [initialCase])

  const filtersKey = JSON.stringify(initialFilters)
  useEffect(() => {
    setIsAllFilterSelected(false)
    setSelectedCases({})
  }, [filtersKey])

  const updateQueryParams = useCallback(
    (updates) => {
      const params = new URLSearchParams(searchParams.toString())
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') {
          params.delete(key)
        } else {
          params.set(key, String(value))
        }
      })
      if (!('page' in updates) && Object.keys(updates).some((k) => k !== 'case_id')) {
        params.delete('page')
      }
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`)
      })
    },
    [pathname, router, searchParams]
  )

  const handleFilterChange = useCallback(
    (key, value) => updateQueryParams({ [key]: value }),
    [updateQueryParams]
  )

  const handleSortChange = useCallback(
    (field) => {
      const direction =
        initialSort.field === field && initialSort.direction === 'desc' ? 'asc' : 'desc'
      updateQueryParams({ sortField: field, sortDirection: direction })
    },
    [initialSort, updateQueryParams]
  )

  const handlePageChange = useCallback(
    (newPage) => {
      if (newPage < 1 || newPage > totalPages) return
      updateQueryParams({ page: newPage })
    },
    [totalPages, updateQueryParams]
  )

  const clearFilters = useCallback(() => {
    router.push(pathname)
  }, [pathname, router])

  const handleHistogramDayClick = useCallback(
    (isoDay) => {
      if (!isoDay) {
        updateQueryParams({ original_date_from: null, original_date_to: null })
        return
      }
      updateQueryParams({
        original_date_from: new Date(`${isoDay}T00:00:00.000Z`).toISOString(),
        original_date_to: new Date(`${isoDay}T23:59:59.999Z`).toISOString(),
      })
    },
    [updateQueryParams]
  )

  const activePublishDay = useMemo(() => {
    const from = initialFilters.original_date_from
    const to = initialFilters.original_date_to
    if (!from || !to) return null
    try {
      const fromDay = new Date(from).toISOString().slice(0, 10)
      const toDay = new Date(to).toISOString().slice(0, 10)
      return fromDay === toDay ? fromDay : null
    } catch {
      return null
    }
  }, [initialFilters.original_date_from, initialFilters.original_date_to])

  const handleToggleCase = useCallback((post, e) => {
    e?.stopPropagation?.()
    setSelectedCases((prev) => {
      const next = { ...prev }
      if (next[post._id]) {
        delete next[post._id]
        setIsAllFilterSelected(false)
      } else {
        next[post._id] = post
      }
      return next
    })
  }, [])

  const isAllCurrentPageSelected =
    mergedPosts.length > 0 && mergedPosts.every((p) => selectedCases[p._id])
  const isSomeCurrentPageSelected = mergedPosts.some((p) => selectedCases[p._id])

  const handleToggleAllOnPage = useCallback(
    (e) => {
      if (!e.target.checked) {
        setSelectedCases({})
        setIsAllFilterSelected(false)
        return
      }
      setSelectedCases((prev) => {
        const next = { ...prev }
        mergedPosts.forEach((post) => {
          next[post._id] = post
        })
        return next
      })
    },
    [mergedPosts]
  )

  const handleSelectAllFiltered = useCallback(async () => {
    setIsSelectingAll(true)
    try {
      const ids = await getFeedPostIds(feedId, initialFilters)
      setSelectedCases((prev) => {
        const next = { ...prev }
        ids.forEach((id) => {
          if (!next[id]) next[id] = { _id: id }
        })
        return next
      })
      setIsAllFilterSelected(true)
    } finally {
      setIsSelectingAll(false)
    }
  }, [feedId, initialFilters])

  const handleClearAllSelected = useCallback(() => {
    setSelectedCases({})
    setIsAllFilterSelected(false)
  }, [])

  const handleUpdatePost = useCallback((updatedPost) => {
    setMergedPosts((prev) => prev.map((p) => (p._id === updatedPost._id ? updatedPost : p)))
    setSelectedPost((prev) =>
      prev && prev._id === updatedPost._id ? { ...prev, ...updatedPost } : prev
    )
  }, [])

  const openCase = useCallback(
    (post) => {
      setSelectedPost(post)
      updateQueryParams({ case_id: post._id })
    },
    [updateQueryParams]
  )

  const closeCase = useCallback(() => {
    setSelectedPost(null)
    updateQueryParams({ case_id: null })
  }, [updateQueryParams])

  const hasActiveFilters =
    initialFilters.unique_clusters === 'true' ||
    initialFilters.platform !== 'all' ||
    initialFilters.risk_priority !== 'all' ||
    initialFilters.client_status !== 'all' ||
    (initialFilters.visibility_status && initialFilters.visibility_status !== 'all') ||
    (initialFilters.violations && initialFilters.violations !== 'all') ||
    initialFilters.original_date_from ||
    initialFilters.original_date_to ||
    initialFilters.processed_from ||
    initialFilters.processed_to

  const filterPanelProps = {
    initialFilters,
    project,
    allowDoTakedown,
    handleFilterChange,
    updateQueryParams,
    searchTerm: '',
    setSearchTerm: () => {},
    handleSearchApply: () => {},
    searchParams,
    selectedCount,
    selectedCases,
    clientDetails,
    projectEmails,
    bulkAssignedEmail: '',
    setBulkAssignedEmail: () => {},
    handleBulkAssign: () => {},
    isBulkAssigning: false,
    isAllFilterSelected,
    totalCount,
    isBulkTakedownProcessing: false,
    isBulkNoActionProcessing: false,
    isBulkFlagProcessing: false,
    actionMenuOpen: false,
    setActionMenuOpen: () => {},
    onBulkTakedown: () => {},
    onBulkNoAction: () => {},
    onBulkFlag: () => {},
    BulkActionMenu: null,
    clearFilters,
    hideSearch: true,
  }

  const SortIcon = ({ field }) => {
    if (initialSort.field !== field) return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1" />
    if (initialSort.direction === 'asc') return <ArrowUp className="w-3 h-3 text-blue-600 ml-1" />
    return <ArrowDown className="w-3 h-3 text-blue-600 ml-1" />
  }

  const navigatePost = useCallback(
    (direction) => {
      if (!selectedPost) return
      const currentIndex = mergedPosts.findIndex((p) => p._id === selectedPost._id)
      if (currentIndex === -1) return
      const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1
      if (nextIndex >= 0 && nextIndex < mergedPosts.length) {
        openCase(mergedPosts[nextIndex])
      }
    },
    [mergedPosts, openCase, selectedPost]
  )

  const showToast = (msg) => window.alert(msg)

  const pagination = totalPages > 1 && (
    <div className="sticky bottom-0 z-10 flex shrink-0 items-center justify-between border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur-md sm:px-6">
      <p className="text-xs font-medium text-slate-500">Page {currentPage} of {totalPages}</p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1 || isPending}
          onClick={() => handlePageChange(currentPage - 1)}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {(() => {
          const pages = []
          let start = Math.max(1, currentPage - 1)
          let end = Math.min(totalPages, currentPage + 1)
          if (currentPage <= 1) end = Math.min(totalPages, 3)
          if (currentPage >= totalPages) start = Math.max(1, totalPages - 2)
          for (let i = start; i <= end; i++) pages.push(i)
          return pages.map((pageNum) => (
            <Button
              key={pageNum}
              variant={currentPage === pageNum ? 'default' : 'outline'}
              size="sm"
              disabled={isPending}
              onClick={() => handlePageChange(pageNum)}
              className={cn(
                'h-8 w-8 p-0 text-xs font-bold',
                currentPage === pageNum
                  ? 'bg-slate-800 hover:bg-slate-900 text-white'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              )}
            >
              {pageNum}
            </Button>
          ))
        })()}
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= totalPages || isPending}
          onClick={() => handlePageChange(currentPage + 1)}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )

  const feedFilterDrawer = (
    <MobileCasesFilterDrawer
      open={isFiltersOpen}
      onOpenChange={setIsFiltersOpen}
      totalCount={totalCount}
      isPending={isPending}
      hasActiveFilters={hasActiveFilters}
      onClearFilters={clearFilters}
      alwaysShow
      countLabel="posts"
      elevated={!!selectedPost}
      filterPanelProps={{
        ...filterPanelProps,
        layout: 'stacked',
        showSections: true,
        mobileDrawerLayout: true,
        onMobileDrawerDone: () => setIsFiltersOpen(false),
      }}
    />
  )

  const reportControls = (
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
      toolbar
    />
  )

  const filterButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setIsFiltersOpen(true)}
      className="h-8 shrink-0 gap-1.5 text-xs"
    >
      <Filter className="h-3.5 w-3.5" />
      Filters
      {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
    </Button>
  )

  const toolbar = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-baseline gap-1.5 shrink-0">
        <span className="text-lg font-black text-slate-800 tabular-nums leading-none">
          {totalCount.toLocaleString()}
        </span>
        <span className="text-[11px] font-semibold text-slate-500">posts</span>
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />}
      </div>

      {filterButton}
      <div className="shrink-0 ml-auto">{reportControls}</div>
    </div>
  )

  const selectionBar = selectedCount > 0 && (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-xs">
      <span className="rounded bg-blue-100 px-2 py-1 font-bold text-blue-700">
        {isAllFilterSelected ? `All ${totalCount.toLocaleString()}` : selectedCount} selected
      </span>
      <button type="button" onClick={handleClearAllSelected} className="font-semibold text-slate-500 hover:text-slate-700">
        Clear
      </button>
      {selectedCount < totalCount && !isAllFilterSelected && (
        <button
          type="button"
          onClick={handleSelectAllFiltered}
          disabled={isSelectingAll}
          className="font-semibold text-blue-600 hover:text-blue-700"
        >
          {isSelectingAll ? 'Selecting…' : `Select all ${totalCount.toLocaleString()}`}
        </button>
      )}
    </div>
  )

  const postsTable = (
    <div className="bg-white border-t border-slate-200">
      {mergedPosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-14 text-center text-slate-400">
          <h3 className="text-base font-bold text-slate-700">No posts in this feed</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            {hasActiveFilters
              ? 'Try adjusting filters or clear them to see all feed content.'
              : 'This feed has no reviewed posts yet.'}
          </p>
          {hasActiveFilters && (
            <Button variant="outline" onClick={clearFilters} className="mt-4" size="sm">
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <table className="min-w-full table-fixed border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-md">
            <tr>
              <th className="w-10 px-3 py-2 border-b border-slate-100">
                <input
                  type="checkbox"
                  checked={isAllCurrentPageSelected}
                  ref={(input) => {
                    if (input) {
                      input.indeterminate = isSomeCurrentPageSelected && !isAllCurrentPageSelected
                    }
                  }}
                  onChange={handleToggleAllOnPage}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
              </th>
              <th
                className="w-16 px-2 py-2 text-center text-[10px] font-bold uppercase text-slate-500 border-b border-slate-100 cursor-pointer"
                onClick={() => handleSortChange('threat_score')}
              >
                <span className="inline-flex items-center">Risk <SortIcon field="threat_score" /></span>
              </th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-slate-500 border-b border-slate-100">
                Content
              </th>
              <th
                className="hidden lg:table-cell w-28 px-3 py-2 text-left text-[10px] font-bold uppercase text-slate-500 border-b border-slate-100 cursor-pointer"
                onClick={() => handleSortChange('original_date')}
              >
                <span className="inline-flex items-center">Published <SortIcon field="original_date" /></span>
              </th>
              <th className="w-8 border-b border-slate-100" />
            </tr>
          </thead>
          <tbody>
            {mergedPosts.map((post) => (
              <PostTableRow
                key={post._id}
                post={post}
                allowDoTakedown={allowDoTakedown}
                isOpen={selectedPost?._id === post._id}
                isSelected={!!selectedCases[post._id]}
                onOpen={openCase}
                onToggle={handleToggleCase}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  const postQueue = (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      {mergedPosts.map((post) => {
        const isSelected = post._id === selectedPost?._id
        const risk = getRiskLabel(post.review_details?.threat_score)
        return (
          <div
            key={post._id}
            onClick={() => openCase(post)}
            className={cn(
              'flex cursor-pointer gap-3 border-b border-slate-50 p-3 transition-colors',
              isSelected
                ? 'border-l-4 border-l-slate-800 bg-slate-100'
                : 'border-l-4 border-l-transparent hover:bg-slate-50'
            )}
          >
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
              {post.signedImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.signedImageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Quote className="h-4 w-4 text-slate-300" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-1.5">
                <span className={cn('inline-flex rounded border px-1 py-0.5 text-[9px] font-black uppercase', risk.color)}>
                  {risk.label}
                </span>
                <span className="truncate text-xs font-bold text-slate-900">
                  @{post.user?.username || 'unknown'}
                </span>
              </div>
              <p className="line-clamp-2 text-[10px] leading-snug text-slate-500">
                {post.caption || 'No caption'}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )

  if (selectedPost) {
    return (
      <div className="flex h-full min-h-0 flex-row overflow-hidden bg-slate-50">
        <div className="hidden md:flex w-[280px] lg:w-[320px] shrink-0 flex-col min-h-0 border-r border-slate-200 bg-white">
          <div className="shrink-0 space-y-2 border-b border-slate-100 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className="text-base font-black text-slate-800 tabular-nums leading-none">
                  {totalCount.toLocaleString()}
                </span>
                <span className="text-[10px] font-semibold text-slate-500">posts</span>
              </div>
              {filterButton}
            </div>
            <div className="w-full">{reportControls}</div>
            {selectionBar}
          </div>

          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Queue</h3>
            <span className="text-xs font-medium text-slate-400">
              {mergedPosts.findIndex((p) => p._id === selectedPost._id) + 1 + (currentPage - 1) * itemsPerPage}
              /{totalCount}
            </span>
          </div>

          {postQueue}
          {pagination}
        </div>

        <CaseDetailPanel
          post={selectedPost}
          project={project}
          clientDetails={clientDetails}
          isOpen={!!selectedPost}
          isMobileLayout={isMobile}
          onClose={closeCase}
          onUpdateStatus={() => {}}
          onShowToast={showToast}
          onNavigate={navigatePost}
          hasPrev={mergedPosts.findIndex((p) => p._id === selectedPost?._id) > 0}
          hasNext={mergedPosts.findIndex((p) => p._id === selectedPost?._id) < mergedPosts.length - 1}
          onUpdatePost={handleUpdatePost}
          projectEmails={projectEmails}
        />

        {isMobile && (
          <div className="fixed top-[4.25rem] right-3 z-[60] md:hidden">
            {filterButton}
          </div>
        )}

        {feedFilterDrawer}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="shrink-0 px-4 pt-3 pb-2 sm:px-6">
        <Link
          href="/feeds"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 transition-colors hover:text-blue-600"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All feeds
        </Link>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="text-base font-bold text-slate-900 sm:text-lg">{feed?.title}</h1>
          {feed?.description && (
            <p className="line-clamp-1 text-xs text-slate-500 sm:max-w-[50%]">{feed.description}</p>
          )}
        </div>
      </div>

      <div className="shrink-0 px-4 pb-3 sm:px-6">
        <PublishingHistogram
          data={histogramData}
          activeDate={activePublishDay}
          onDayClick={handleHistogramDayClick}
          compact
        />
      </div>

      <div className="sticky top-0 z-20 shrink-0 border-y border-slate-200 bg-white/95 px-4 py-2 backdrop-blur-md sm:px-6">
        {toolbar}
        {selectionBar}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          {postsTable}
        </div>
        {pagination}
      </div>

      {feedFilterDrawer}
    </div>
  )
}
