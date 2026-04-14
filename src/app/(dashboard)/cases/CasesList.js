'use client'

import { trackClientClick, getAllPostIds } from './actions'
import { CaseDetailPanel } from './CaseDetailPanel'
import { bulkAssignCasesTo } from './feature_actions'

// IMPORT UI THINGS 
// import { Skeleton } from "@/components/ui/skeleton"
import { useState, useEffect, useRef, useCallback, useMemo, useTransition } from 'react'
import {
  Filter, Search, ArrowUpDown, Loader2, CheckCircle,
  ExternalLink, Info, Siren, ArrowRight, Quote, X, FlagTriangleLeft,
  FileDown, ArrowUp, ArrowDown, ClockFading,
  ChevronLeft, ChevronRight, Smile, TrendingDown, TriangleAlert,
  Youtube, Instagram, Facebook, UserPlus, Check,
  AlertOctagon
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
// import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { DateFilterPopover } from './DateFilterPopover'
import { ViolationsFilter } from './ViolationsFilter'
// import SafeDate from '@/components/SafeDate'

export function CasesList({ cases, project, clientDetails, initialFilters, initialSort, currentPage, itemsPerPage, initialCase, projectEmails }) {

  // console.log(project)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const totalCount = cases?.totalCount || 0
  const totalPages = cases?.totalPages || 0
  const [isPending, startTransition] = useTransition()

  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)

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
      if (allowDoTakedown){
        return { label: 'Flag for Takedown', icon: FlagTriangleLeft, color: 'text-orange-500 bg-orange-50 border-orange-200' };
      }
      else{
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

  return (
    <div className="flex flex-col h-full bg-slate-50">

      {/* Filters & Controls */}
      <div className="px-3 sm:px-6 py-2 shrink-0">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-3 sm:px-4 py-3">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">

            {/* Left: Filters */}
            <div className="flex flex-col lg:flex-row gap-4 w-full">

              {/* Header Row: Title & Loading State */}
              <div className="flex flex-col justify-center items-center  w-full lg:max-w-48 gap-3 rounded-lg ">
                <div className="flex items-center justify-between lg:justify-start w-full lg:w-auto">
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="bg-blue-50 p-1.5 rounded-md text-blue-600">
                      <Filter className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider hidden lg:block">
                      Filters
                    </span>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
                      className="lg:hidden h-8 text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 ml-1"
                    >
                      {isMobileFiltersOpen ? 'Hide Controls' : 'Show Controls'}
                    </Button>
                  </div>

                  {/* Loading Indicator */}
                  {isPending && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-600 rounded border border-blue-100 animate-pulse">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        Updating
                      </span>
                    </div>
                  )}
                </div>

                {/* Total Count */}
                <div className="text-sm font-medium text-slate-500 w-full text-center">
                  <span className="font-bold text-slate-900 text-base mr-1">
                    {totalCount}
                  </span>
                  cases found
                </div>

                {/* Active Filters / Clear All Actions (Animated) */}
                <div
                  className={`grid transition-all duration-300 ease-in-out w-full ${selectedCount > 0
                    ? "grid-rows-[1fr] opacity-100 mt-1"
                    : "grid-rows-[0fr] opacity-0 mt-0"
                    }`}
                >
                  {/* overflow-hidden is crucial here to clip the content while height is 0 */}
                  <div className="overflow-hidden">
                    <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center text-xs font-bold text-blue-700 px-2 py-1 rounded-md">
                          {isAllFilterSelected ? `All ${totalCount}` : selectedCount} Selected
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleClearAllSelected}
                          className="h-7 px-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 font-semibold text-xs transition-colors cursor-pointer"
                        >
                          Clear All
                        </Button>
                      </div>

                      {/* Select All Filtered Option - Integrated here for better UX */}
                      {isAllCurrentPageSelected && totalCount > mergedPosts.length && !isAllFilterSelected && (
                        <Button
                          variant="Ghost"
                          size="sm"
                          onClick={handleSelectAllFiltered}
                          disabled={isSelectingAll}
                          className=" cursor-pointer h-8 p-0 w-full border border-blue-200 bg-blue-50/50 text-blue-700 hover:bg-blue-50 hover:text-blue-800 font-bold transition-all"
                        >
                          {isSelectingAll && (
                            <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                          )}
                          Select all {totalCount} cases
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <Separator orientation="vertical" className="h-8 bg-slate-100 hidden lg:block" />

              {/* FILTERS & BULK ACTIONS */}
              <div className={cn("flex flex-col gap-4 w-full transition-all overflow-hidden", !isMobileFiltersOpen && "hidden lg:flex")}>
                <div className=" flex flex-wrap items-start gap-4 lg:gap-6 w-full ">

                  {/* RISK LEVEL */}
                  <div className="space-y-1.5 w-fit min-w-32">
                    <Label className="text-[10px] uppercase font-bold text-slate-400">Risk Severity</Label>
                    <select
                      value={initialFilters.risk_priority || 'all'}
                      onChange={(e) => handleFilterChange('risk_priority', e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-md px-3 h-9 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="all">All Risks</option>
                      <option value="high">High Risk</option>
                      <option value="medium">Medium Risk</option>
                      <option value="low">Low Risk</option>
                      <option value="safe">Safe</option>
                    </select>
                  </div>

                  {/* PLATFORM */}
                  <div className="space-y-1.5 w-fit min-w-32">
                    <Label className="text-[10px] uppercase font-bold text-slate-400">Platform</Label>
                    <select
                      value={initialFilters.platform}
                      onChange={(e) => handleFilterChange('platform', e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-md px-3 h-9 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="all">All Platforms</option>
                      <option value="instagram">Instagram</option>
                      <option value="facebook">Facebook</option>
                      <option value="reddit">Reddit</option>
                      <option value="x">X (Twitter)</option>
                      <option value="youtube">Youtube</option>
                      <option value="website">Websites</option>
                    </select>
                  </div>

                  {/* STATUS */}
                  <div className="space-y-1.5 w-fit min-w-32">
                    <Label className="text-[10px] uppercase font-bold text-slate-400">Status</Label>
                    <select
                      value={initialFilters.client_status}
                      onChange={(e) => handleFilterChange('client_status', e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-md px-3 h-9 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="all">All Statuses</option>
                      <option value="To Be Reviewed">To Be Reviewed</option>
                      <option value="No Action">No Action</option>
                      <option value="Flag for Takedown">Flag for Takedown</option>
                    </select>
                  </div>

                  {/* violations */}
                  <div className="space-y-1.5 w-fit min-w-32">
                    <ViolationsFilter
                      projectLabels={project?.project_details?.labels || []}
                      initialViolations={initialFilters.violations}
                      onChange={(val) => handleFilterChange('violations', val)}
                    />
                  </div>

                  {/* Alert date  */}
                  <div className="space-y-1.5 w-fit min-w-32">
                    <Label className="text-[10px] uppercase font-bold text-slate-400">Alert Date</Label>
                    <DateFilterPopover
                      title="Alert Date"
                      initialFrom={initialFilters.processed_from}
                      initialTo={initialFilters.processed_to}
                      onApply={(range) => updateQueryParams({
                        processed_from: range?.from ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
                        processed_to: range?.to ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX") : null
                      })}
                    />
                  </div>

                  {/* Publishing date  */}
                  <div className="space-y-1.5 w-fit min-w-32">
                    <Label className="text-[10px] uppercase font-bold text-slate-400">Publish Date</Label>
                    <DateFilterPopover
                      title="Publish Date"
                      initialFrom={initialFilters.original_date_from}
                      initialTo={initialFilters.original_date_to}
                      onApply={(range) => updateQueryParams({
                        original_date_from: range?.from ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
                        original_date_to: range?.to ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX") : null
                      })}
                    />
                  </div>

                  {(initialFilters.platform !== 'all' || initialFilters.risk_priority !== 'all' || initialFilters.client_status !== 'all' || (initialFilters.violations && initialFilters.violations !== 'all') || initialFilters.original_date_from || initialFilters.original_date_to || initialFilters.processed_from || initialFilters.processed_to) && (
                    <div className=" mt-1">
                      <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold text-xs">
                        <X className="w-3.5 h-3.5 mr-1" /> Clear Filters
                      </Button>
                    </div>
                  )}
                </div>

                {/* BULK ASSIGN FUNCTIONALITY */}
                {
                  selectedCount > 0 && clientDetails?.permission === "client-admin" && (
                    <div className="flex items-center gap-4 pt-3 border-t border-slate-100 mt-2 animate-in fade-in slide-in-from-top-1">
                      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-md border border-blue-100 whitespace-nowrap">
                        <UserPlus className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Bulk Assignment</span>
                      </div>
                      <div className="flex items-center gap-3 w-full max-w-lg">
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
                          className="h-9 px-6 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-sm shrink-0"
                        >
                          {isBulkAssigning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                          Assign {selectedCount} {selectedCount === 1 ? 'Case' : 'Cases'}
                        </Button>
                      </div>
                    </div>
                  )
                }
              </div>
            </div>

            {/* Right: Actions & Counts */}
            <div className={cn("flex items-center gap-5 w-full lg:max-w-50 justify-start lg:justify-end mt-4 lg:mt-0 transition-all", !isMobileFiltersOpen && "hidden lg:flex")}>

              {/* REPORT DOWNLOAD BUTTONS */}
              <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0 w-full lg:ml-auto">
                <div className="w-full sm:w-auto" onClick={() => {
                  if (selectedCount === 0) alert("Select some cases before exporting");
                  trackClientClick('export_summary_report', { page: 'CasesList' });
                }}>
                  {selectedCount > 0 ? (
                    <ReportButton
                      posts={selectedPostsArray}
                      project={project}
                      className="flex w-full cursor-pointer items-center justify-start gap-2 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-md hover:bg-slate-50 transition-colors text-xs shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  ) : (
                    <button className="flex w-full cursor-pointer items-center justify-start gap-2 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-md hover:bg-slate-50 transition-colors text-xs shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
                      <FileDown className="w-3.5 h-3.5" />
                      Export Summary PDF
                    </button>
                  )}
                </div>
                <div onClick={() => {
                  if (selectedCount === 0) alert("Select some cases before exporting");
                  trackClientClick('export_detailed_report', { page: 'CasesList' });
                }}>
                  {selectedCount > 0 ? (
                    <DetailedReportButton
                      posts={selectedPostsArray}
                      project={project}
                      className="flex w-full cursor-pointer items-center justify-start gap-2 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-md hover:bg-slate-50 transition-colors text-xs shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  ) : (
                    <button className="flex w-full cursor-pointer items-center justify-start gap-2 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-md hover:bg-slate-50 transition-colors text-xs shadow-sm">
                      <FileDown className="w-3.5 h-3.5" />
                      Export Detailed PDF
                    </button>
                  )}
                </div>
                <div onClick={() => {
                  if (selectedCount === 0) alert("Select some cases before exporting");
                  trackClientClick('export_detailed_report_docx', { page: 'CasesList' });
                }}>
                  {selectedCount > 0 ? (
                    <DetailedReportDocxButton
                      posts={selectedPostsArray}
                      project={project}
                      className="flex w-full cursor-pointer items-center justify-start gap-2 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-md hover:bg-slate-50 transition-colors text-xs shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  ) : (
                    <button className="flex w-full cursor-pointer items-center justify-start gap-2 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-md hover:bg-slate-50 transition-colors text-xs shadow-sm">
                      <FileDown className="w-3.5 h-3.5" />
                      Export Detailed DOCX
                    </button>
                  )}
                </div>


              </div>

              {/* {(raisedCount > 0 || isInitialLoading) && (
                <Link
                  href="/takedowns"
                  className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 border border-rose-100 rounded-lg text-rose-700 hover:bg-rose-100 transition-colors group"
                >
                  <Siren className="w-4 h-4" />
                  <span className="text-xs font-bold">{isInitialLoading ? '...' : raisedCount} Raised</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
              )} */}
            </div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 pb-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed divide-y divide-slate-100">
              <thead className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  {/* ---  Checkbox Header --- */}
                  <th scope="col" className="w-10 sm:w-12 px-2 sm:px-4 py-3 text-left">
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
                    className="w-24 sm:w-30 px-2 sm:px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group select-none hidden sm:table-cell"
                    onClick={() => handleSortChange('threat_score')}
                  >
                    <div className="flex items-center">
                      Risk
                      <SortIcon field="threat_score" />
                    </div>
                  </th>
                  <th scope="col" className="w-28 sm:w-37.5 px-2 sm:px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">Status</th>
                  <th
                    scope="col"
                    className="px-2 sm:px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-full min-w-[200px]"
                  >
                    <div className="flex items-center">
                      Content
                    </div>
                  </th>
                  <th scope="col" className="w-42.5 px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Violations</th>
                  <th
                    scope="col"
                    className="w-30 px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group select-none hidden lg:table-cell"
                    onClick={() => handleSortChange('processed_date')}
                  >
                    <div className="flex items-center">
                      Alert Date
                      <SortIcon field="processed_date" />
                    </div>
                  </th>

                  <th
                    scope="col"
                    className="w-30 px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group select-none hidden xl:table-cell"
                    onClick={() => handleSortChange('original_date')}
                  >
                    <div className="flex items-center">
                      Publish Date
                      <SortIcon field="original_date" />
                    </div>
                  </th>
                  <th scope="col" className="w-16 sm:w-27.5 px-2 sm:px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider"></th>
                </tr>
              </thead>

              <tbody className="bg-white divide-y divide-slate-100">
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

                  return (
                    <tr
                      key={currentPost._id}
                      ref={el => postRefs.current[currentPost._id] = el}
                      onClick={() => setSelectedPost(currentPost)}
                      className={cn(
                        "transition-all cursor-pointer group",
                        isPanelOpen ? "bg-blue-50/60 ring-1 ring-inset ring-blue-200 z-10 relative" : "hover:bg-slate-50",
                        // Optional: lightly highlight rows that are checked
                        isSelectedRow && !isPanelOpen && "bg-slate-50"
                      )}
                    >
                      {/* SELECTED OR NOT  */}
                      <td className="px-2 sm:px-4 py-3 whitespace-nowrap align-middle" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelectedRow}
                          onChange={(e) => handleToggleCase(currentPost, e)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* Priority */}
                      <td className="px-2 sm:px-4 py-3 whitespace-nowrap align-middle hidden sm:table-cell">
                        <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border shadow-sm", risk.color)}>

                          {
                            risk.label === "High" ? (
                              <Siren className="w-3.5 h-3.5 sm:mr-1.5" />
                            ) : risk.label === "Medium" ? (
                              <TriangleAlert className="w-3.5 h-3.5 sm:mr-1.5" />
                            ) : risk.label === "Low" ? (
                              <TrendingDown className="w-3.5 h-3.5 sm:mr-1.5" />
                            ) : (
                              <Smile className="w-3.5 h-3.5 sm:mr-1.5" />
                            )
                          }

                          <span className="hidden sm:inline">{risk.label}</span>
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-2 sm:px-4 py-3 whitespace-nowrap align-middle hidden md:table-cell">
                        <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border shadow-sm", statusConfig.color)}>
                          <StatusIcon className="w-3.5 h-3.5 mr-1.5" />
                          {statusConfig.label}
                        </span>
                      </td>

                      {/* Content */}
                      <td className="px-2 sm:px-4 py-3 overflow-hidden align-middle">
                        <div className="flex gap-3 sm:gap-4 max-w-96">
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
                              <div
                                className="font-semibold text-slate-600 rounded-full bg-slate-50 max-w-5 flex items-center justify-center p-1 "
                                title={post.platform.charAt(0).toUpperCase() + post.platform.slice(1)}
                              >
                                {post.platform === 'instagram' ? <Instagram className="size-4 sm:size-5 text-pink-500" />
                                  : post.platform === 'facebook' ? <Facebook className="size-4 sm:size-5 shrink-0 text-blue-600" />
                                    : post.platform === 'x' ? <Twitter className="size-4 sm:size-5 text-slate-900" />
                                      : post.platform === 'youtube' ? <Youtube className="size-4 sm:size-5 text-red-600" />
                                        : post.platform === 'reddit' ? <Reddit className="size-4 sm:size-5 text-red-600" />
                                          : post.platform
                                }
                              </div>
                              <span className="text-xs text-slate-400">•</span>
                              <span className="font-bold text-slate-900 text-xs sm:text-sm truncate transition-colors max-w-[80px] sm:max-w-none">
                                {post.user?.username ? `@${post.user.username}` : 'Unknown User'}
                              </span>
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
                      <td className="px-4 py-3 whitespace-nowrap align-middle hidden lg:table-cell">
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
                      <td className="px-4 py-3 whitespace-nowrap align-middle hidden lg:table-cell">
                        <div className="flex flex-col gap-1 justify-center items-center text-sm font-semibold text-slate-500">
                          <span>{processed_date.split(' ')[0]}</span>
                          <span className="text-xs text-slate-400">
                            {processed_date.split(' ')[1] + ' ' + processed_date.split(' ')[2]}
                          </span>
                        </div>
                      </td>

                      {/* Original Date */}
                      <td className="px-4 py-3 whitespace-nowrap align-middle hidden xl:table-cell">
                        <div className="flex flex-col gap-1 justify-center items-center text-sm font-semibold text-slate-500">
                          <span>{posted_date.split(' ')[0]}</span>
                          <span className="text-xs text-slate-400">
                            {posted_date.split(' ')[1] + ' ' + posted_date.split(' ')[2]}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-2 sm:px-4 py-3 whitespace-nowrap text-right align-middle">
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

          {mergedPosts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 border border-slate-100">
                <Search className="w-8 h-8 opacity-20 text-slate-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-1">No active cases found</h3>
              <p className="text-sm text-slate-500 max-w-xs text-center">Try adjusting your filters or search for different criteria.</p>
              <Button variant="outline" onClick={clearFilters} className="mt-6 border-slate-200">
                Clear all filters
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Pagination Controls */}
      {totalCount > 0 && (
        <div className="px-3 sm:px-6 pb-2 pt-2">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-3 sm:px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
            <div className="flex items-center justify-between w-full sm:w-auto gap-4 sm:gap-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap hidden sm:inline">Show:</span>
                <div className="flex bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                  {[10, 25, 50, 75, 100].map((limit) => (
                    <button
                      key={limit}
                      onClick={() => updateQueryParams({ limit: limit.toString(), page: 1 })}
                      className={cn(
                        "px-2 sm:px-2.5 py-1 text-[10px] font-bold transition-all rounded-md cursor-pointer",
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

              <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                Page <span className="text-slate-900">{currentPage}</span> / <span className="text-slate-900">{totalPages || 1}</span>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto justify-between sm:justify-end mt-2 sm:mt-0">
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

      <CaseDetailPanel
        post={selectedPost ? { ...selectedPost, client_status: updatedCases[selectedPost._id] || selectedPost.client_status } : null}
        project={project}
        clientDetails={clientDetails}
        isOpen={!!selectedPost}
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
        onNavigate={navigatePost}
        hasPrev={mergedPosts.findIndex(p => p._id === selectedPost?._id) > 0}
        hasNext={mergedPosts.findIndex(p => p._id === selectedPost?._id) < mergedPosts.length - 1}
        onUpdatePost={handleUpdatePost}
        projectEmails={projectEmails}
      />
    </div>
  )
}
