'use client'

import { trackClientClick, getAllPostIds, updateClientStatus } from './actions'
import { CaseDetailPanel } from './CaseDetailPanel'
import { bulkAssignCasesTo } from './feature_actions'
import { initiateTakedown } from './takedown_actions'

// IMPORT UI THINGS 
// import { Skeleton } from "@/components/ui/skeleton"
import { useState, useEffect, useRef, useCallback, useMemo, useTransition } from 'react'
import {
  Filter, Search, ArrowUpDown, Loader2, CheckCircle,
  ExternalLink, Info, Siren, ArrowRight, Quote, X, FlagTriangleLeft,
  FileDown, ArrowUp, ArrowDown, ClockFading,
  ChevronLeft, ChevronRight, Smile, TrendingDown, TriangleAlert,
  Youtube, Instagram, Facebook, UserPlus, Check,
  AlertOctagon, ChevronDown,
  DownloadIcon, ShieldAlert, MoreHorizontal
} from 'lucide-react'

import { Twitter, Reddit } from '@/utils/icons'
import { format } from "date-fns"

import getPostLink from '@/components/GetPostLink'
// import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ReportButton } from '@/components/pdf/ReportButton'
import { DetailedReportButton } from '@/components/pdf/DetailedReportButton'
import { DetailedReportDocxButton } from '@/components/docx/DetailedReportDocxButton'
import { Button } from "@/components/ui/button"
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
// import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import ReportGenerate from '@/components/ReportGenerate'
import { useIsMobile, useIsSmallScreen } from '@/hooks/use-media-query'
import { CasesFilterPanel } from './CasesFilterPanel'
import { MobileCasesFilterDrawer } from './MobileCasesFilterDrawer'
// import SafeDate from '@/components/SafeDate'

function ListSelectionBar({
  className,
  showPageCheckbox = true,
  showSelectAllActions = true,
  selectedCount,
  totalCount,
  isAllFilterSelected,
  isSelectingAll,
  isAllCurrentPageSelected,
  isSomeCurrentPageSelected,
  onToggleAllOnPage,
  onSelectAllFiltered,
  onClearSelection,
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 flex-wrap',
        className
      )}
    >
      {showPageCheckbox && (
        <label className="flex items-center gap-2 min-w-0 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={isAllCurrentPageSelected}
            ref={(input) => {
              if (input) {
                input.indeterminate =
                  isSomeCurrentPageSelected && !isAllCurrentPageSelected
              }
            }}
            onChange={onToggleAllOnPage}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
            aria-label="Select all on this page"
          />
          <span className="text-[10px] font-bold text-slate-500">This page</span>
        </label>
      )}

      {showSelectAllActions && (
      <div className="flex items-center gap-2 ml-auto min-w-0 flex-wrap justify-end">
        {selectedCount === 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSelectAllFiltered}
            disabled={isSelectingAll || totalCount === 0}
            className="h-8 px-2.5 text-[10px] font-bold text-slate-700 border-slate-200 shrink-0"
          >
            {isSelectingAll ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1 text-blue-600" />
            ) : (
              <CheckCircle className="w-3 h-3 mr-1 text-slate-400" />
            )}
            Select all {totalCount.toLocaleString()} cases
          </Button>
        ) : (
          <>
            <span className="inline-flex items-center text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded shrink-0">
              {isAllFilterSelected
                ? `All ${totalCount.toLocaleString()}`
                : selectedCount.toLocaleString()}{' '}
              selected
            </span>
            {!isAllFilterSelected && totalCount > selectedCount && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onSelectAllFiltered}
                disabled={isSelectingAll}
                className="h-8 px-2 text-[10px] font-bold text-blue-600 hover:bg-blue-50 shrink-0"
              >
                {isSelectingAll ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : null}
                Select all {totalCount.toLocaleString()}
              </Button>
            )}
            {onClearSelection && (
              <button
                type="button"
                onClick={onClearSelection}
                className="text-[10px] font-bold text-slate-500 underline shrink-0"
              >
                Clear
              </button>
            )}
          </>
        )}
      </div>
      )}
    </div>
  )
}

function BulkActionMenu({
  allowDoTakedown,
  isBulkTakedownProcessing,
  isBulkNoActionProcessing,
  isBulkFlagProcessing,
  onDoTakedown,
  onNoAction,
  onFlagForTakedown,
}) {
  const anyProcessing = isBulkTakedownProcessing || isBulkNoActionProcessing || isBulkFlagProcessing

  const itemBase = "w-full flex items-center gap-2.5 px-2.5 py-3 min-h-11 rounded-lg text-xs font-bold text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"

  return (
    <div className="flex flex-col gap-1">
      {allowDoTakedown && (
        <button
          type="button"
          onClick={onDoTakedown}
          disabled={anyProcessing}
          className={cn(itemBase, "text-rose-700 hover:bg-rose-50")}
        >
          {isBulkTakedownProcessing
            ? <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
            : <ShieldAlert className="w-4 h-4 text-rose-600" />}
          <span className="flex-1">Do Takedown</span>
        </button>
      )}

      <button
        type="button"
        onClick={onNoAction}
        disabled={anyProcessing}
        className={cn(itemBase, "text-emerald-700 hover:bg-emerald-50")}
      >
        {isBulkNoActionProcessing
          ? <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
          : <CheckCircle className="w-4 h-4 text-emerald-600" />}
        <span className="flex-1">No Action</span>
      </button>

      {!allowDoTakedown && (
        <button
          type="button"
          onClick={onFlagForTakedown}
          disabled={anyProcessing}
          className={cn(itemBase, "text-orange-700 hover:bg-orange-50")}
        >
          {isBulkFlagProcessing
            ? <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
            : <FlagTriangleLeft className="w-4 h-4 text-orange-600" />}
          <span className="flex-1">Flag for Takedown</span>
        </button>
      )}
    </div>
  )
}

export function CasesList({ cases, project, clientDetails, initialFilters, initialSort, currentPage, itemsPerPage, initialCase, projectEmails }) {
  // console.log(cases)

  // console.log(project)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const totalCount = cases?.totalCount || 0
  const totalPages = cases?.totalPages || 0
  const [isPending, startTransition] = useTransition()

  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)
  const isMobile = useIsMobile()
  const isSmallScreen = useIsSmallScreen()

  const [selectedPost, setSelectedPost] = useState(initialCase || null)
  const [updatedCases, setUpdatedCases] = useState({})
  const postRefs = useRef({})

  const [selectedCases, setSelectedCases] = useState({})
  const selectedCount = Object.keys(selectedCases).length

  // Select-all-filtered state
  const [isAllFilterSelected, setIsAllFilterSelected] = useState(false)
  const [isSelectingAll, setIsSelectingAll] = useState(false)

  const [bulkAssignedEmail, setBulkAssignedEmail] = useState("")
  const [isBulkAssigning, setIsBulkAssigning] = useState(false)

  const [showBulkTakedownConfirm, setShowBulkTakedownConfirm] = useState(false)
  const [isBulkTakedownProcessing, setIsBulkTakedownProcessing] = useState(false)

  const [showBulkNoActionConfirm, setShowBulkNoActionConfirm] = useState(false)
  const [isBulkNoActionProcessing, setIsBulkNoActionProcessing] = useState(false)

  const [showBulkFlagConfirm, setShowBulkFlagConfirm] = useState(false)
  const [isBulkFlagProcessing, setIsBulkFlagProcessing] = useState(false)

  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [mobileActionMenuOpen, setMobileActionMenuOpen] = useState(false)

  // Search state
  const [searchTerm, setSearchTerm] = useState(searchParams.get('semantic_search') || '')
  const [exportFormat, setExportFormat] = useState("")

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

  useEffect(() => {
    setSearchTerm(searchParams.get('semantic_search') || '')
  }, [searchParams])

  const handleSearchApply = () => {
    const val = searchTerm.trim();
    if (val) {
      updateQueryParams({ semantic_search: val, similar_to: null, search_type: null });
    } else {
      updateQueryParams({ semantic_search: null });
    }
  }

  // Memoize the selected posts array to stabilize the reference passed to report buttons
  const selectedPostsArray = useMemo(() => Object.values(selectedCases), [selectedCases])

  // Navigation Logic for URL params
  const updateQueryParams = useCallback((newParams) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === undefined || (value === 'all' && key !== 'status' && key !== 'platform')) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })
    // Reset page on filter/sort change unless explicitly setting page
    if (!newParams.page) {
      params.delete('page')
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }, [router, pathname, searchParams])

  const handleFilterChange = (key, value) => {
    const paramKey = key === 'client_status' ? 'status' : key
    updateQueryParams({ [paramKey]: value })
  }

  const handleSortChange = (field) => {
    const direction = (initialSort.field === field && initialSort.direction === 'desc') ? 'asc' : 'desc'
    updateQueryParams({ sortField: field, sortDirection: direction })
  }

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return
    updateQueryParams({ page: newPage })
  }

  const clearFilters = () => {
    setSearchTerm('')
    router.push(pathname)
  }

  // Merged posts for current page view
  const [mergedPosts, setMergedPosts] = useState([])

  useEffect(() => {
    setMergedPosts(cases?.posts || [])
  }, [cases?.posts])

  const handleUpdatePost = useCallback((updatedPost) => {
    setMergedPosts(prev => prev.map(p => p._id === updatedPost._id ? updatedPost : p))
    setSelectedPost(prev => prev && prev._id === updatedPost._id ? { ...prev, ...updatedPost } : prev)
  }, [])

  // --- Selection Handlers ---
  const handleToggleCase = (post, e) => {
    e.stopPropagation() // Prevents the detail panel from opening when clicking the checkbox
    setSelectedCases(prev => {
      const newSelections = { ...prev }
      if (newSelections[post._id]) {
        delete newSelections[post._id]
        setIsAllFilterSelected(false)
      } else {
        newSelections[post._id] = post
      }
      return newSelections
    })
  }
  const handleToggleAllOnPage = (e) => {
    const isChecked = e.target.checked
    if (!isChecked) {
      // Clear everything — including any cross-page selection
      setSelectedCases({})
      setIsAllFilterSelected(false)
      return
    }
    setSelectedCases(prev => {
      const newSelections = { ...prev }
      mergedPosts.forEach(post => {
        newSelections[post._id] = post
      })
      return newSelections
    })
  }

  const handleSelectAllFiltered = async () => {
    setIsSelectingAll(true)
    try {
      const ids = await getAllPostIds(project, initialFilters)
      // We store lightweight placeholder objects keyed by id.
      // The id is enough for the export actions.
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
    setBulkAssignedEmail("")
  }

  const handleBulkAssign = async () => {
    const postIds = Object.keys(selectedCases)
    if (postIds.length === 0 || !bulkAssignedEmail) return

    setIsBulkAssigning(true)
    try {
      const result = await bulkAssignCasesTo(project, clientDetails, postIds, bulkAssignedEmail)
      if (result.success) {
        // Update local state for all selected posts
        setMergedPosts(prev => prev.map(post =>
          selectedCases[post._id]
            ? { ...post, assigned_to: bulkAssignedEmail }
            : post
        ))

        // Update updatedCases to reflect changes in the table immediately
        const newUpdatedCases = { ...updatedCases }
        postIds.forEach(id => {
          newUpdatedCases[id] = updatedCases[id] || 'Updated' // Dummy value to trigger refresh if needed
        })
        setUpdatedCases(newUpdatedCases)

        alert(`Successfully assigned ${result.count} cases to ${bulkAssignedEmail}`)
        handleClearAllSelected()
      } else {
        alert("Bulk assign failed: " + result.error)
      }
    } catch (error) {
      alert("Error during bulk assignment")
    } finally {
      setIsBulkAssigning(false)
    }
  }

  const handleBulkTakedown = async () => {
    const postIds = Object.keys(selectedCases)
    if (postIds.length === 0) return

    setIsBulkTakedownProcessing(true)
    trackClientClick('bulk_do_takedown', { page: 'CasesList', count: postIds.length })
    try {
      const result = await initiateTakedown(postIds, clientDetails.email)
      if (result.success) {
        setMergedPosts(prev => prev.map(post =>
          selectedCases[post._id]
            ? {
              ...post,
              client_status: 'Takedown',
              takedown_info: {
                ...(post.takedown_info || {}),
                in_takedown_process: true,
                status: 'initiated'
              }
            }
            : post
        ))

        const newUpdatedCases = { ...updatedCases }
        postIds.forEach(id => { newUpdatedCases[id] = 'Takedown' })
        setUpdatedCases(newUpdatedCases)

        const skippedNote = result.skipped > 0 ? ` (${result.skipped} already in takedown)` : ''
        showToast(`Takedown initiated for ${result.count} ${result.count === 1 ? 'case' : 'cases'}${skippedNote}`, 'success')
        setShowBulkTakedownConfirm(false)
        handleClearAllSelected()
      } else {
        showToast("Bulk takedown failed: " + result.error, 'error')
      }
    } catch (error) {
      showToast("Error during bulk takedown", 'error')
    } finally {
      setIsBulkTakedownProcessing(false)
    }
  }

  const applyBulkClientStatus = async (status, opts = {}) => {
    const postIds = Object.keys(selectedCases)
    if (postIds.length === 0) return

    const { setProcessing, closeDialog, trackEvent, successVerb } = opts
    setProcessing(true)
    if (trackEvent) {
      trackClientClick(trackEvent, { page: 'CasesList', count: postIds.length })
    }
    try {
      const result = await updateClientStatus(postIds, status, clientDetails.email)
      if (result.success) {
        setMergedPosts(prev => prev.map(post =>
          selectedCases[post._id]
            ? { ...post, client_status: status }
            : post
        ))

        const newUpdatedCases = { ...updatedCases }
        postIds.forEach(id => { newUpdatedCases[id] = status })
        setUpdatedCases(newUpdatedCases)

        const count = result.count ?? postIds.length
        showToast(`${successVerb} ${count} ${count === 1 ? 'case' : 'cases'}`, 'success')
        closeDialog?.()
        handleClearAllSelected()
      } else {
        showToast(`Bulk update failed: ${result.error || 'Unknown error'}`, 'error')
      }
    } catch (e) {
      showToast(`Error during bulk ${status.toLowerCase()}`, 'error')
    } finally {
      setProcessing(false)
    }
  }

  const handleBulkNoAction = () =>
    applyBulkClientStatus('No Action', {
      setProcessing: setIsBulkNoActionProcessing,
      closeDialog: () => setShowBulkNoActionConfirm(false),
      trackEvent: 'bulk_no_action',
      successVerb: 'Marked No Action for'
    })

  const handleBulkFlagForTakedown = () =>
    applyBulkClientStatus('Flag for Takedown', {
      setProcessing: setIsBulkFlagProcessing,
      closeDialog: () => setShowBulkFlagConfirm(false),
      trackEvent: 'bulk_flag_for_takedown',
      successVerb: 'Flagged for takedown:'
    })

  // Check if all items on the *current page* are selected for the header checkbox
  const isAllCurrentPageSelected = mergedPosts.length > 0 && mergedPosts.every(post => !!selectedCases[post._id])
  const isSomeCurrentPageSelected = mergedPosts.some(post => !!selectedCases[post._id])

  // Navigation Logic for CaseDetailPanel
  const navigatePost = useCallback((direction) => {
    if (!selectedPost) return

    const currentIndex = mergedPosts.findIndex(p => p._id === selectedPost._id)
    if (currentIndex === -1) return

    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1

    if (nextIndex >= 0 && nextIndex < mergedPosts.length) {
      const nextPost = mergedPosts[nextIndex]
      setSelectedPost(nextPost)

      // Scroll into view
      setTimeout(() => {
        const el = postRefs.current[nextPost._id]
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 0)
    }
  }, [selectedPost, mergedPosts])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedPost) return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        navigatePost('prev')
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        navigatePost('next')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedPost, navigatePost])

  const getRiskLabel = (score) => {
    if (score >= 96) return { label: 'High', color: 'text-rose-500 bg-rose-50 border-rose-200' };
    if (score >= 76) return { label: 'Medium', color: 'text-orange-500 bg-orange-50 border-orange-200' };
    if (score >= 41) return { label: 'Low', color: 'text-amber-500 bg-amber-50 border-amber-200' };
    return { label: 'Safe', color: 'text-slate-500 bg-slate-50 border-slate-200' };
  }

  const getStatusConfig = (post) => {
    const status = post.client_status || 'To Be Reviewed';
    if (status === 'To Be Reviewed') {
      return { label: 'To Be Reviewed', icon: ClockFading, color: 'text-slate-500 bg-slate-50 border-slate-200' };
    }
    if (status === 'No Action' || status === 'Pass') {
      return { label: 'No Action', icon: CheckCircle, color: 'text-emerald-500 bg-emerald-50 border-emerald-200' };
    }
    if (status === 'Flag for Takedown') {
      if (allowDoTakedown) {
        return { label: 'Flag for Takedown', icon: FlagTriangleLeft, color: 'text-orange-500 bg-orange-50 border-orange-200' };
      }
      else {
        return { label: 'Flag for Takedown', icon: FlagTriangleLeft, color: 'text-rose-500 bg-rose-50 border-rose-200' };
      }
    }

    if (status === 'Takedown') {
      return { label: 'Takedown', icon: AlertOctagon, color: 'text-rose-500 bg-rose-50 border-rose-200' };
    }
    return { label: status, icon: Info, color: 'text-slate-600 bg-slate-50 border-slate-200' };
  }

  const SortIcon = ({ field }) => {
    if (initialSort.field !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 ml-1.5" />
    if (initialSort.direction === 'asc') return <ArrowUp className="w-3.5 h-3.5 text-blue-600 ml-1.5" />
    return <ArrowDown className="w-3.5 h-3.5 text-blue-600 ml-1.5" />
  }

  // Reset isAllFilterSelected when filters change
  const filtersKey = JSON.stringify(initialFilters)
  useEffect(() => {
    setIsAllFilterSelected(false)
    setSelectedCases({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])


  let allowDoTakedown = false;
  try {
    if (project && project.project_details) {
      const details = project.project_details;
      if (details.do_takedowns === true || details.do_takedowns === undefined) {
        allowDoTakedown = true;
      } else {
        allowDoTakedown = false;
      }
    } else {
      allowDoTakedown = true;
    }
  } catch (e) {
    console.error(e)
    allowDoTakedown = true;
  }

  const hasActiveFilters =
    initialFilters.unique_clusters === 'true' ||
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
    searchParams.get('semantic_search')

  const filterPanelProps = {
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
    isAllFilterSelected,
    totalCount,
    isBulkTakedownProcessing,
    isBulkNoActionProcessing,
    isBulkFlagProcessing,
    actionMenuOpen,
    setActionMenuOpen,
    onBulkTakedown: () => {
      setActionMenuOpen(false)
      setShowBulkTakedownConfirm(true)
    },
    onBulkNoAction: () => {
      setActionMenuOpen(false)
      setShowBulkNoActionConfirm(true)
    },
    onBulkFlag: () => {
      setActionMenuOpen(false)
      setShowBulkFlagConfirm(true)
    },
    BulkActionMenu,
    clearFilters,
  }

  return (
    <div className='flex flex-row h-full min-h-0 overflow-hidden p-0 m-0'>

      <div className={cn(" flex flex-col h-full bg-slate-50 transition-all duration-300 overflow-hidden", selectedPost ? "hidden md:flex w-[280px] lg:w-[320px] shrink-0 border-r border-slate-200" : "flex-1 w-full")}>

        {!selectedPost ? (
          <>
            {/* Mobile compact toolbar */}
            <div className="lg:hidden shrink-0 px-2 py-1.5 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-2">
                <div className="flex items-baseline gap-1 min-w-0 shrink">
                  <span className="text-base font-black text-slate-800 tabular-nums leading-none">
                    {totalCount.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500">cases</span>
                  {isPending && <Loader2 className="h-3 w-3 animate-spin text-blue-600 shrink-0" />}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMobileFiltersOpen(true)}
                  className="h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 gap-1.5 shrink-0"
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filters
                  {hasActiveFilters && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  )}
                </Button>
                <div className="ml-auto shrink-0">
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
                    compact
                  />
                </div>
              </div>
              {mergedPosts.length > 0 && totalCount > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                  <ListSelectionBar
                    showPageCheckbox={false}
                    selectedCount={selectedCount}
                    totalCount={totalCount}
                    isAllFilterSelected={isAllFilterSelected}
                    isSelectingAll={isSelectingAll}
                    isAllCurrentPageSelected={isAllCurrentPageSelected}
                    isSomeCurrentPageSelected={isSomeCurrentPageSelected}
                    onToggleAllOnPage={handleToggleAllOnPage}
                    onSelectAllFiltered={handleSelectAllFiltered}
                    onClearSelection={handleClearAllSelected}
                  />
                  {(selectedCount > 0 || hasActiveFilters) && (
                    <div className="flex items-center gap-2 mt-1.5 overflow-x-auto">
                      {hasActiveFilters && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearFilters}
                          className="h-7 px-2 text-rose-600 hover:bg-rose-50 text-[10px] font-bold uppercase shrink-0"
                        >
                          <X className="w-3 h-3 mr-0.5" /> Clear filters
                        </Button>
                      )}
                      {selectedCount > 0 && (
                        <Popover open={mobileActionMenuOpen} onOpenChange={setMobileActionMenuOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              size="sm"
                              disabled={isBulkTakedownProcessing || isBulkNoActionProcessing || isBulkFlagProcessing}
                              className="h-7 px-2.5 text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 shrink-0"
                            >
                              Action ({isAllFilterSelected ? totalCount : selectedCount})
                              <ChevronDown className={cn("w-3 h-3 ml-0.5", mobileActionMenuOpen && "rotate-180")} />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="min-w-[140px] p-1 z-50">
                            <BulkActionMenu
                              allowDoTakedown={allowDoTakedown}
                              isBulkTakedownProcessing={isBulkTakedownProcessing}
                              isBulkNoActionProcessing={isBulkNoActionProcessing}
                              isBulkFlagProcessing={isBulkFlagProcessing}
                              onDoTakedown={() => { setMobileActionMenuOpen(false); setShowBulkTakedownConfirm(true) }}
                              onNoAction={() => { setMobileActionMenuOpen(false); setShowBulkNoActionConfirm(true) }}
                              onFlagForTakedown={() => { setMobileActionMenuOpen(false); setShowBulkFlagConfirm(true) }}
                            />
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <MobileCasesFilterDrawer
              open={isMobileFiltersOpen}
              onOpenChange={setIsMobileFiltersOpen}
              totalCount={totalCount}
              isPending={isPending}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearFilters}
              filterPanelProps={filterPanelProps}
            />

            {/* Filters & Controls (desktop) */}
            <div className="hidden lg:block px-3 shrink-0">
              <div className="px-3 py-3">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">

                  {/* Left: Filters */}
                  <div className="flex flex-col lg:flex-row gap-4 w-full">

                    {/* Header Row: Title & Summary Box */}
                    <div className="flex flex-col w-full lg:w-[160px] xl:w-[180px] shrink-0 rounded-xl p-3 relative ">
                      <div className="flex items-start justify-between pb-1">
                        <div className="flex flex-col items-start gap-2">
                          <div className="flex items-center gap-1.5">
                            <Filter className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              Filter
                            </span>
                            <span
                              className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center overflow-visible"
                              aria-hidden={!isPending}
                            >
                              <Loader2
                                className={cn(
                                  "absolute h-5 w-5 animate-spin text-blue-600 stroke-[2.5]",
                                  isPending ? "opacity-100" : "opacity-0",
                                )}
                              />
                            </span>
                          </div>
                          <div className="flex items-baseline gap-1.5 mb-3">
                            <span className="text-2xl font-black text-slate-800 tracking-tight leading-none">
                              {totalCount}
                            </span>
                            <span className="text-[11px] font-bold text-slate-500 leading-none">
                              cases found
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Selection Controls */}
                      <div className="mt-auto border-t border-slate-200/80 pt-3 relative min-h-[40px]">
                        <div
                          className="grid transition-all duration-300 ease-in-out"
                          style={{ gridTemplateRows: selectedCount > 0 ? '1fr' : '0fr' }}
                        >
                          <div className="overflow-hidden">
                            <div className={cn("flex flex-col transition-all duration-300", selectedCount > 0 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2")}>
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

                              <div
                                className="grid transition-all duration-300 ease-in-out"
                                style={{ gridTemplateRows: (!isAllFilterSelected && totalCount > selectedCount) ? '1fr' : '0fr' }}
                              >
                                <div className="overflow-hidden">
                                  <div className="pt-2">
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
                                      Select all {totalCount} cases
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div
                          className={cn(
                            "absolute inset-x-0 bottom-0 transition-all duration-300 ease-in-out",
                            selectedCount === 0 ? "opacity-100 pointer-events-auto translate-y-0" : "opacity-0 pointer-events-none translate-y-2"
                          )}
                        >
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
                            Select all cases
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="hidden lg:flex w-full">
                      <CasesFilterPanel
                        layout="row"
                        showBulkActionPopover
                        {...filterPanelProps}
                      />
                    </div>

                    {/* Right: Actions & Counts */}
                    {/* Report Download - hidden on mobile dialog as it's now outside */}
                    <div className="hidden lg:flex flex-col gap-2 w-full lg:w-auto lg:flex-1 lg:max-w-[280px] lg:min-w-[240px]">
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

            {/* Main list */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 bg-white shadow-sm border-x-0 border-t border-b border-slate-200 md:border flex flex-col overflow-hidden md:mx-0 md:rounded-none">
                {mergedPosts.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center py-16 px-6 text-slate-400">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 border border-slate-100">
                      <Search className="w-8 h-8 opacity-20 text-slate-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 mb-1">No active cases found</h3>
                    <p className="text-sm text-slate-500 max-w-xs text-center">Try adjusting your filters or search for different criteria.</p>
                    <Button variant="outline" onClick={clearFilters} className="mt-6 min-h-11 border-slate-200">
                      Clear all filters
                    </Button>
                  </div>
                ) : (
                <>
                {/* Mobile card list */}
                <div className="md:hidden flex-1 overflow-y-auto custom-scrollbar">
                  <div className="sticky top-0 z-20 px-2 py-1.5 bg-slate-50/95 backdrop-blur-md border-b border-slate-100">
                    <ListSelectionBar
                      showSelectAllActions={false}
                      selectedCount={selectedCount}
                      totalCount={totalCount}
                      isAllFilterSelected={isAllFilterSelected}
                      isSelectingAll={isSelectingAll}
                      isAllCurrentPageSelected={isAllCurrentPageSelected}
                      isSomeCurrentPageSelected={isSomeCurrentPageSelected}
                      onToggleAllOnPage={handleToggleAllOnPage}
                      onSelectAllFiltered={handleSelectAllFiltered}
                      onClearSelection={selectedCount > 0 ? handleClearAllSelected : undefined}
                    />
                  </div>
                  <div className="divide-y divide-slate-100">
                    {mergedPosts.map((post) => {
                      const currentPost = { ...post, client_status: updatedCases[post._id] || post.client_status }
                      const riskScore = currentPost.review_details?.threat_score
                      const risk = getRiskLabel(riskScore)
                      const statusConfig = getStatusConfig(currentPost)
                      const StatusIcon = statusConfig.icon
                      const isSelectedRow = !!selectedCases[currentPost._id]
                      const isPanelOpen = selectedPost?._id === currentPost._id
                      const isSourcePost = searchParams.get('similar_to') === currentPost._id

                      return (
                        <article
                          key={currentPost._id}
                          ref={el => { postRefs.current[currentPost._id] = el }}
                          className={cn(
                            "flex items-stretch gap-2 px-2 py-2 transition-colors active:bg-slate-100",
                            isPanelOpen && "bg-blue-50/60 ring-1 ring-inset ring-blue-200",
                            isSelectedRow && !isPanelOpen && "bg-slate-50",
                            isSourcePost && "border-l-[3px] border-l-blue-600"
                          )}
                        >
                          <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelectedRow}
                              onChange={(e) => handleToggleCase(currentPost, e)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              aria-label={`Select case ${currentPost._id}`}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedPost(currentPost)}
                            className="flex-1 min-w-0 text-left flex gap-2.5 items-stretch"
                          >
                            <div className="shrink-0 w-[4.25rem] self-stretch min-h-[4.25rem]">
                              {post.signedImageUrl ? (
                                <div className="h-full w-full rounded-lg overflow-hidden border border-slate-200 bg-slate-200">
                                  <img src={post.signedImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                                </div>
                              ) : (
                                <div className="h-full w-full min-h-[4.25rem] rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">
                                  <Quote className="h-6 w-6 text-slate-300" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5 py-0.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase border shrink-0", risk.color)}>
                                  {risk.label}
                                </span>
                                <span className={cn("inline-flex items-center justify-center w-6 h-6 rounded-full border shrink-0", statusConfig.color)}>
                                  <StatusIcon className="w-3 h-3" />
                                </span>
                                {isSourcePost && (
                                  <span className="text-[8px] font-black bg-blue-600 text-white px-1 py-0.5 rounded uppercase shrink-0">Src</span>
                                )}
                                <span className="flex items-center gap-1 min-w-0 flex-1">
                                  {post.platform === 'instagram' ? <Instagram className="size-3.5 text-pink-500 shrink-0" />
                                    : post.platform === 'facebook' ? <Facebook className="size-3.5 text-blue-600 shrink-0" />
                                      : post.platform === 'x' ? <Twitter className="size-3.5 text-slate-900 shrink-0" />
                                        : post.platform === 'youtube' ? <Youtube className="size-3.5 text-red-600 shrink-0" />
                                          : post.platform === 'reddit' ? <Reddit className="size-3.5 text-red-600 shrink-0" />
                                            : null}
                                  <span className="font-bold text-slate-900 text-xs truncate">
                                    @{post.user?.username || 'unknown'}
                                  </span>
                                </span>
                                <a
                                  href={post.original_url ? post.original_url : getPostLink(post)}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="shrink-0 p-1 -mr-1 text-blue-600 hover:bg-blue-50 rounded-md"
                                  aria-label="Open source post"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                              <p className="text-[11px] text-slate-600 line-clamp-2 leading-[1.35]">
                                {post.caption || <span className="italic text-slate-400">No caption</span>}
                              </p>
                            </div>
                            <ChevronRight className={cn("w-4 h-4 shrink-0 self-center", isPanelOpen ? "text-blue-600" : "text-slate-300")} />
                          </button>
                        </article>
                      )
                    })}
                  </div>
                </div>

                {/* Tablet: table without desktop sidebar — selection bar */}
                <div className="hidden md:flex lg:hidden shrink-0 px-2 py-1.5 bg-slate-50/95 border-b border-slate-100">
                  <ListSelectionBar
                    className="w-full"
                    selectedCount={selectedCount}
                    totalCount={totalCount}
                    isAllFilterSelected={isAllFilterSelected}
                    isSelectingAll={isSelectingAll}
                    isAllCurrentPageSelected={isAllCurrentPageSelected}
                    isSomeCurrentPageSelected={isSomeCurrentPageSelected}
                    onToggleAllOnPage={handleToggleAllOnPage}
                    onSelectAllFiltered={handleSelectAllFiltered}
                    onClearSelection={selectedCount > 0 ? handleClearAllSelected : undefined}
                  />
                </div>

                {/* Desktop table */}
                <div className="hidden md:block flex-1 overflow-auto custom-scrollbar relative">
                  <table className="min-w-full table-fixed border-separate border-spacing-0">
                    <thead className="sticky top-0 z-20">
                      <tr className="bg-slate-50/90 backdrop-blur-md">
                        {/* ---  Checkbox Header --- */}
                        <th scope="col" className="w-10 sm:w-12 px-2 sm:px-4 py-3 text-left border-b border-slate-100">
                          <input
                            type="checkbox"
                            checked={isAllCurrentPageSelected}
                            ref={input => {
                              if (input) {
                                // Optional: Show a dash in the checkbox if only some are selected
                                input.indeterminate = isSomeCurrentPageSelected && !isAllCurrentPageSelected;
                              }
                            }}
                            onChange={handleToggleAllOnPage}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </th>
                        <th
                          scope="col"
                          className="w-16 sm:w-20 px-2 sm:px-3 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors group select-none hidden sm:table-cell border-b border-slate-100"
                          onClick={() => handleSortChange('threat_score')}
                        >
                          <div className="flex items-center justify-center">
                            Risk
                            <SortIcon field="threat_score" />
                          </div>
                        </th>
                        <th scope="col" className="w-14 sm:w-16 px-2 sm:px-3 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell border-b border-slate-100">Status</th>
                        <th
                          scope="col"
                          className="px-2 sm:px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-full min-w-[200px] border-b border-slate-100"
                        >
                          <div className="flex items-center">
                            Content
                          </div>
                        </th>
                        <th scope="col" className="w-42.5 px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell border-b border-slate-100">Violations</th>
                        <th
                          scope="col"
                          className="w-30 px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors group select-none hidden lg:table-cell border-b border-slate-100"
                          onClick={() => handleSortChange('processed_date')}
                        >
                          <div className="flex items-center">
                            Alert Date
                            <SortIcon field="processed_date" />
                          </div>
                        </th>

                        <th
                          scope="col"
                          className="w-30 px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors group select-none hidden xl:table-cell border-b border-slate-100"
                          onClick={() => handleSortChange('original_date')}
                        >
                          <div className="flex items-center">
                            Publish Date
                            <SortIcon field="original_date" />
                          </div>
                        </th>
                        <th scope="col" className="w-16 sm:w-27.5 px-2 sm:px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100"></th>
                      </tr>
                    </thead>

                    <tbody className="bg-white">
                      {mergedPosts.map((post, index) => {
                        const currentPost = { ...post, client_status: updatedCases[post._id] || post.client_status };
                        const riskScore = currentPost.review_details?.threat_score;
                        const risk = getRiskLabel(riskScore);

                        const review = currentPost.review_details || {};
                        const analysis = currentPost.analysis_results || {};

                        // 1. Resolve Global Flags
                        const isAigc = review.is_aigc ?? review.flags?.is_aigc ?? analysis.aigc_check?.is_aigc ?? false;

                        // 2. Resolve Dynamic Labels and Legacy Flags
                        const projectLabels = project?.project_details?.labels || [];
                        const resolvedThreats = [];

                        if (isAigc) resolvedThreats.push({ label: "AIGC", type: 'aigc' });

                        // Check Project Labels (New Format)
                        projectLabels.forEach(label => {
                          if (review.flags?.[label.name] === true) {
                            resolvedThreats.push({
                              label: label.name,
                              type: label.severity === 'high' ? 'hate_speech' : label.severity === 'medium' ? 'scam' : 'nsfw'
                            });
                          }
                        });

                        // Check Legacy Flags (Backward Compatibility)
                        const legacyMapping = {
                          is_nsfw: { label: "NSFW", type: 'nsfw' },
                          is_hate_speech: { label: "Hate Speech", type: 'hate_speech' },
                          is_fake_news: { label: "Fake News", type: 'fake_news' },
                          is_fraud: { label: "Fraud", type: 'fake_news' },
                          is_asset_misuse: { label: "Asset Misuse", type: 'scam' },
                          is_humor: { label: "Satire", type: 'nsfw' },
                          is_terrorism: { label: "Terrorism", type: 'fake_news' },
                          is_violence: { label: "Violence", type: 'fake_news' }
                        };

                        Object.entries(legacyMapping).forEach(([key, config]) => {
                          if (review.flags?.[key] === true && !resolvedThreats.some(t => t.label === config.label)) {
                            resolvedThreats.push(config);
                          }
                        });

                        const statusConfig = getStatusConfig(currentPost);

                        const StatusIcon = statusConfig.icon;
                        // const isPanelOpen = selectedPost?._id === currentPost._id

                        let posted_date = ""
                        let sourced_date = ""
                        let processed_date = ""

                        // POSTED AT ---> ORIGINAL DATE FILTER ( WHEN IT WAS POSTED ON THE SOCIAL MEDIA PLATFORM)
                        if (post.posted_date)
                          posted_date = format(new Date(post.posted_date), "dd/MM/yyyy hh:mm a");
                        else if (post.metadata?.posted_date)
                          posted_date = format(new Date(post.metadata.posted_date), "dd/MM/yyyy hh:mm a");
                        else if (post.timestamp)
                          posted_date = format(new Date(post.timestamp), "dd/MM/yyyy hh:mm a");
                        else if (post.sourcing_date)
                          posted_date = format(new Date(post.sourcing_date), "dd/MM/yyyy hh:mm a");

                        // SOURCED AT ---> (NOT BEING USED WELL BUT ITS WHEN WE GOT THE POST)
                        if (post.metadata?.created_at)
                          sourced_date = format(new Date(post.metadata.created_at), "dd/MM/yyyy hh:mm a");
                        else if (post.created_at)
                          sourced_date = format(new Date(post.created_at), "dd/MM/yyyy hh:mm a");

                        // REVIEWED AT. --> PROCESSED DATE FILTER
                        if (post?.reviewed_at)
                          processed_date = format(new Date(post.reviewed_at), "dd/MM/yyyy hh:mm a");
                        else if (post.review_details?.reviewed_at)
                          processed_date = format(new Date(post.review_details.reviewed_at), "dd/MM/yyyy hh:mm a");

                        const isSelectedRow = !!selectedCases[currentPost._id];
                        const isPanelOpen = selectedPost?._id === currentPost._id;
                        const isSourcePost = searchParams.get('similar_to') === currentPost._id;

                        return (
                          <tr
                            key={currentPost._id}
                            ref={el => postRefs.current[currentPost._id] = el}
                            onClick={() => setSelectedPost(currentPost)}
                            className={cn(
                              "transition-all cursor-pointer group",
                              isPanelOpen ? "bg-blue-50/60 ring-1 ring-inset ring-blue-200 z-10 relative" : "hover:bg-slate-50",
                              // Optional: lightly highlight rows that are checked
                              isSelectedRow && !isPanelOpen && "bg-slate-50",
                              isSourcePost && "border-l-4 border-l-blue-600 bg-blue-50/30"
                            )}
                          >
                            {/* SELECTED OR NOT  */}
                            <td className="px-2 sm:px-4 whitespace-nowrap align-middle border-b border-slate-50" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelectedRow}
                                onChange={(e) => handleToggleCase(currentPost, e)}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>

                            {/* Priority */}
                            <td className="px-2 sm:px-3 whitespace-nowrap align-middle hidden sm:table-cell border-b border-slate-50">
                              <div className={cn("flex flex-col items-center justify-center p-1.5 rounded-lg text-[10px] font-black tracking-wide border shadow-sm mx-auto w-12", risk.color)}>
                                {
                                  risk.label === "High" ? (
                                    <Siren className="w-4 h-4 mb-1" />
                                  ) : risk.label === "Medium" ? (
                                    <TriangleAlert className="w-4 h-4 mb-1" />
                                  ) : risk.label === "Low" ? (
                                    <TrendingDown className="w-4 h-4 mb-1" />
                                  ) : (
                                    <Smile className="w-4 h-4 mb-1" />
                                  )
                                }
                                <span className="uppercase text-[8px] leading-none">{risk.label}</span>
                              </div>
                            </td>

                            {/* Status */}
                            <td className="px-2 sm:px-3 whitespace-nowrap align-middle hidden md:table-cell text-center border-b border-slate-50">
                              <div className="flex flex-col items-center gap-1.5">
                                <HoverCard openDelay={0} closeDelay={50}>
                                  <HoverCardTrigger asChild>
                                    <div
                                      className={cn("inline-flex items-center justify-center w-8 h-8 rounded-full border shadow-sm cursor-pointer transition-transform hover:scale-110", statusConfig.color)}
                                    >
                                      <StatusIcon className="w-4 h-4" />
                                    </div>
                                  </HoverCardTrigger>
                                  <HoverCardContent
                                    className="w-auto px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 shadow-xl rounded-lg"
                                    sideOffset={8}
                                  >
                                    {statusConfig.label}
                                  </HoverCardContent>
                                </HoverCard>
                                {currentPost.visibility_status === 'down' ? (
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
                                <div className="shrink-0 relative">
                                  {post.signedImageUrl ? (
                                    <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-slate-200 group-hover:shadow-md transition-all">
                                      <img
                                        src={post.signedImageUrl}
                                        alt="Content"
                                        /* text-transparent hides the alt text while loading */
                                        className="h-full w-full object-cover text-transparent"
                                        loading="lazy"
                                      />
                                    </div>
                                  ) : (
                                    <div className="h-16 w-16 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">
                                      <Quote className="h-6 w-6 text-slate-300" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col min-w-0 gap-1">
                                  <div className="flex items-center gap-2">
                                    <HoverCard openDelay={0} closeDelay={50}>
                                      <HoverCardTrigger asChild>
                                        <div
                                          className="font-semibold text-slate-600 rounded-full bg-slate-50 max-w-5 flex items-center justify-center p-1 cursor-pointer transition-transform hover:scale-110"
                                        >
                                          {post.platform === 'instagram' ? <Instagram className="size-4 sm:size-5 text-pink-500" />
                                            : post.platform === 'facebook' ? <Facebook className="size-4 sm:size-5 shrink-0 text-blue-600" />
                                              : post.platform === 'x' ? <Twitter className="size-4 sm:size-5 text-slate-900" />
                                                : post.platform === 'youtube' ? <Youtube className="size-4 sm:size-5 text-red-600" />
                                                  : post.platform === 'reddit' ? <Reddit className="size-4 sm:size-5 text-red-600" />
                                                    : post.platform
                                          }
                                        </div>
                                      </HoverCardTrigger>
                                      <HoverCardContent
                                        className="w-auto px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 shadow-xl rounded-lg"
                                        sideOffset={8}
                                      >
                                        {post.platform === 'x' ? 'X' : post.platform.charAt(0).toUpperCase() + post.platform.slice(1)}
                                      </HoverCardContent>
                                    </HoverCard>
                                    <span className="text-xs text-slate-400">•</span>
                                    <span className="font-bold text-slate-900 text-xs sm:text-sm truncate transition-colors max-w-[80px] sm:max-w-none">
                                      {post.user?.username ? `@${post.user.username}` : 'Unknown User'}
                                    </span>
                                    {isSourcePost && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-blue-600 text-white uppercase tracking-tighter shadow-sm">
                                        Source Case
                                      </span>
                                    )}
                                    <span className="text-xs text-slate-400 hidden sm:inline">•</span>
                                    <span className="text-xs text-slate-500 font-mono hidden sm:inline">
                                      <a
                                        href={post.original_url ? post.original_url : getPostLink(post)}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center tracking-tight text-blue-600 hover:text-blue-800 font-bold text-xs transition-colors hover:underline bg-blue-50 px-1.5 py-0.5 rounded-md"
                                      >
                                        Source <ExternalLink className="w-3 h-3 ml-1" />
                                      </a>
                                    </span>

                                    {/* Mobile Risk Icon (visible only when risk column is hidden) */}
                                    <span className="sm:hidden ml-auto">
                                      <span className={cn("inline-flex items-center p-1 rounded-md text-xs font-bold border shadow-sm", risk.color)}>
                                        {
                                          risk.label === "High" ? <Siren className="w-3 h-3" /> :
                                            risk.label === "Medium" ? <TriangleAlert className="w-3 h-3" /> :
                                              risk.label === "Low" ? <TrendingDown className="w-3 h-3" /> :
                                                <Smile className="w-3 h-3" />
                                        }
                                      </span>
                                    </span>
                                  </div>
                                  <span className="text-[10px] sm:text-xs text-slate-600 line-clamp-2 leading-relaxed">
                                    {post.caption || <span className="italic text-slate-400">No caption content.</span>}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Threat Type */}
                            <td className="px-4 py-3 whitespace-nowrap align-middle hidden lg:table-cell border-b border-slate-50">
                              <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                                {resolvedThreats.map((threat, idx) => {
                                  return (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider shadow-sm text-slate-600 bg-slate-50 border-slate-200"
                                    >
                                      {threat.label.replace(/[-_]/g, ' ')}
                                    </span>
                                  );
                                })}
                                {resolvedThreats.length === 0 && <span className="text-xs text-slate-400 italic"></span>}
                              </div>
                            </td>

                            {/* Processed Date */}
                            <td className="px-4 py-3 whitespace-nowrap align-middle hidden lg:table-cell border-b border-slate-50">
                              <div className="flex flex-col gap-1 justify-center items-center text-sm font-semibold text-slate-500">
                                <span>{processed_date.split(' ')[0]}</span>
                                <span className="text-xs text-slate-400">
                                  {processed_date.split(' ')[1] + ' ' + processed_date.split(' ')[2]}
                                </span>
                              </div>
                            </td>

                            {/* Original Date */}
                            <td className="px-4 py-3 whitespace-nowrap align-middle hidden xl:table-cell border-b border-slate-50">
                              <div className="flex flex-col gap-1 justify-center items-center text-sm font-semibold text-slate-500">
                                <span>{posted_date.split(' ')[0]}</span>
                                <span className="text-xs text-slate-400">
                                  {posted_date.split(' ')[1] + ' ' + posted_date.split(' ')[2]}
                                </span>
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="px-2 sm:px-4 py-3 whitespace-nowrap text-right align-middle border-b border-slate-50">
                              <Button
                                size="sm"
                                variant={isPanelOpen ? "default" : "secondary"}
                                className={cn(
                                  "h-8 w-8 sm:w-auto px-0 sm:px-3 text-xs font-bold transition-all shadow-sm",
                                  isPanelOpen ? "bg-blue-600 hover:bg-blue-700 shadow-blue-200" : "bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 group "
                                )}
                              >
                                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-0.5 transition-all duration-200 " />
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                </>
                )}
              </div>
            </div>

            {/* Pagination Controls */}
            {totalCount > 0 && (
              <div className="px-2 sm:px-6 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 md:pt-2 shrink-0 border-t border-slate-100 bg-white md:bg-transparent md:border-t-0">
                <div className="px-1 sm:px-4 py-0.5 md:py-1 flex flex-col lg:flex-row items-center justify-between gap-2 lg:gap-0">
                  <div className="flex items-center justify-between w-full lg:w-auto gap-2 sm:gap-6">
                    <div className="flex items-center gap-1.5 sm:gap-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap hidden sm:inline">Show:</span>
                      <div className="flex bg-slate-50 border border-slate-200 rounded-md p-0.5">
                        {[10, 25, 50, 75, 100].map((limit) => (
                          <button
                            key={limit}
                            onClick={() => updateQueryParams({ limit: limit.toString(), page: 1 })}
                            className={cn(
                              "px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-bold transition-all rounded cursor-pointer",
                              itemsPerPage === limit
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

                    <div className="text-[9px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap tabular-nums">
                      <span className="md:hidden">{currentPage}/{totalPages || 1}</span>
                      <span className="hidden md:inline">Page <span className="text-slate-900">{currentPage}</span> / <span className="text-slate-900">{totalPages || 1}</span></span>
                    </div>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center gap-0.5 sm:gap-2 w-full lg:w-auto justify-between lg:justify-end mt-0 lg:mt-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(1)}
                        disabled={currentPage === 1}
                        className="h-7 sm:h-9 px-2 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50 hidden sm:flex"
                        title="First Page"
                      >
                        &lt;&lt;
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="h-7 w-8 sm:h-9 sm:w-auto p-0 sm:px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>

                      <div className="flex items-center gap-1 mx-0 sm:mx-1">
                        {(() => {
                          const pages = [];
                          let start = Math.max(1, currentPage - 2);
                          let end = Math.min(totalPages, currentPage + 2);

                          if (isSmallScreen) {
                            start = Math.max(1, currentPage - 1);
                            end = Math.min(totalPages, currentPage + 1);
                          }

                          if (currentPage <= (isSmallScreen ? 1 : 2)) {
                            end = Math.min(totalPages, isSmallScreen ? 3 : 5);
                          }
                          if (currentPage >= totalPages - (isSmallScreen ? 0 : 1)) {
                            start = Math.max(1, totalPages - (isSmallScreen ? 2 : 4));
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
                                "h-7 w-7 sm:h-9 sm:w-9 p-0 text-[10px] sm:text-xs font-bold",
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
                        className="h-7 w-8 sm:h-9 sm:w-auto p-0 sm:px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(totalPages)}
                        disabled={currentPage === totalPages}
                        className="h-7 sm:h-9 px-2 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50 hidden sm:flex"
                        title="Last Page"
                      >
                        &gt;&gt;
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col h-full bg-white">
            {/* Queue Navigation Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Queue Navigation</h3>
              <span className="text-xs text-slate-400 font-medium">
                {mergedPosts.findIndex(p => p._id === selectedPost._id) + 1 + (currentPage - 1) * itemsPerPage}/{totalCount}
              </span>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {mergedPosts.map((post, idx) => {
                const isSelected = post._id === selectedPost._id;

                return (
                  <div
                    key={post._id}
                    ref={el => postRefs.current[post._id] = el}
                    onClick={() => setSelectedPost(post)}
                    className={cn(
                      "flex gap-3 p-4 cursor-pointer border-b border-slate-50 transition-colors",
                      isSelected ? "bg-slate-100 border-l-4 border-l-slate-800" : "hover:bg-slate-50 border-l-4 border-l-transparent"
                    )}
                  >
                    {/* Image */}
                    <div className="w-12 h-12 shrink-0 bg-slate-200 rounded-md overflow-hidden border border-slate-200">
                      {post.signedImageUrl ? (
                        <img src={post.signedImageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-100">
                          <Quote className="w-4 h-4 text-slate-400" />
                        </div>
                      )}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {post.platform === 'x' ? 'X' : post.platform.charAt(0).toUpperCase() + post.platform.slice(1)} @{post.user?.username || 'Unknown'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 line-clamp-2 leading-snug">
                        {post.caption || "No caption"}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            <div className="p-3 border-t border-slate-100 flex items-center justify-between gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="h-8 w-8 p-0">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex gap-1">
                {(() => {
                  const pages = [];
                  let start = Math.max(1, currentPage - 1);
                  let end = Math.min(totalPages, currentPage + 1);

                  if (currentPage <= 1) end = Math.min(totalPages, 3);
                  if (currentPage >= totalPages) start = Math.max(1, totalPages - 2);

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
                        "h-8 w-8 p-0 text-xs font-bold",
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
              <Button variant="ghost" size="sm" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="h-8 w-8 p-0">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

      </div>

      <CaseDetailPanel
        post={selectedPost ? { ...selectedPost, client_status: updatedCases[selectedPost._id] || selectedPost.client_status } : null}
        project={project}
        clientDetails={clientDetails}
        isOpen={!!selectedPost}
        isMobileLayout={isMobile}
        onClose={() => {
          setSelectedPost(null)

          if (searchParams.has('case_id')) {
            updateQueryParams({ case_id: null })
          }

          if (Object.keys(updatedCases).length > 0) {
            router.refresh()
            setUpdatedCases({})
          }
        }}
        onUpdateStatus={(id, status) => setUpdatedCases(prev => ({ ...prev, [id]: status }))}
        onShowToast={showToast}
        onNavigate={navigatePost}
        hasPrev={mergedPosts.findIndex(p => p._id === selectedPost?._id) > 0}
        hasNext={mergedPosts.findIndex(p => p._id === selectedPost?._id) < mergedPosts.length - 1}
        onUpdatePost={handleUpdatePost}
        projectEmails={projectEmails}
      />

      {/* Bulk Takedown Confirmation Dialog */}
      <Dialog
        open={showBulkTakedownConfirm}
        onOpenChange={(open) => {
          if (!isBulkTakedownProcessing) setShowBulkTakedownConfirm(open)
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="shrink-0 p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <DialogTitle className="text-lg font-black text-slate-800">
                Initiate Takedown
              </DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-sm text-slate-600 leading-relaxed">
              You&apos;re about to initiate a takedown for{' '}
              <span className="font-bold text-slate-900">
                {isAllFilterSelected ? totalCount : selectedCount}{' '}
                {(isAllFilterSelected ? totalCount : selectedCount) === 1 ? 'case' : 'cases'}
              </span>
              . Cases already in a takedown process will be skipped. This action cannot be easily undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowBulkTakedownConfirm(false)}
              disabled={isBulkTakedownProcessing}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkTakedown}
              disabled={isBulkTakedownProcessing}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
            >
              {isBulkTakedownProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <ShieldAlert className="w-4 h-4 mr-2" />
              )}
              Confirm Takedown
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk No Action Confirmation Dialog */}
      <Dialog
        open={showBulkNoActionConfirm}
        onOpenChange={(open) => {
          if (!isBulkNoActionProcessing) setShowBulkNoActionConfirm(open)
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="shrink-0 p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                <CheckCircle className="w-5 h-5" />
              </div>
              <DialogTitle className="text-lg font-black text-slate-800">
                Mark as No Action
              </DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-sm text-slate-600 leading-relaxed">
              You&apos;re about to mark{' '}
              <span className="font-bold text-slate-900">
                {isAllFilterSelected ? totalCount : selectedCount}{' '}
                {(isAllFilterSelected ? totalCount : selectedCount) === 1 ? 'case' : 'cases'}
              </span>{' '}
              as <span className="font-bold text-slate-900">No Action</span>. This will close them out of review.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowBulkNoActionConfirm(false)}
              disabled={isBulkNoActionProcessing}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkNoAction}
              disabled={isBulkNoActionProcessing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
            >
              {isBulkNoActionProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Confirm No Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Flag for Takedown Confirmation Dialog */}
      <Dialog
        open={showBulkFlagConfirm}
        onOpenChange={(open) => {
          if (!isBulkFlagProcessing) setShowBulkFlagConfirm(open)
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="shrink-0 p-2 rounded-xl bg-orange-50 text-orange-600 border border-orange-100">
                <FlagTriangleLeft className="w-5 h-5" />
              </div>
              <DialogTitle className="text-lg font-black text-slate-800">
                Flag for Takedown
              </DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-sm text-slate-600 leading-relaxed">
              You&apos;re about to flag{' '}
              <span className="font-bold text-slate-900">
                {isAllFilterSelected ? totalCount : selectedCount}{' '}
                {(isAllFilterSelected ? totalCount : selectedCount) === 1 ? 'case' : 'cases'}
              </span>{' '}
              as <span className="font-bold text-slate-900">Flag for Takedown</span>. The takedown team will pick these up for review.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowBulkFlagConfirm(false)}
              disabled={isBulkFlagProcessing}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkFlagForTakedown}
              disabled={isBulkFlagProcessing}
              className="bg-orange-600 hover:bg-orange-700 text-white font-bold cursor-pointer"
            >
              {isBulkFlagProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <FlagTriangleLeft className="w-4 h-4 mr-2" />
              )}
              Confirm Flag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Toast Notification */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2.5rem)] max-w-[400px] md:w-auto px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300 border backdrop-blur-xl",
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
                <AlertOctagon className="w-5 h-5" />
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
