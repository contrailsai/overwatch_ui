'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { getPosts, approveTakedown, getPriorityTakedowns, getRaisedCount, trackClientClick, getAllPostIds } from './actions'
import { CaseDetailPanel } from './CaseDetailPanel'
import { Skeleton } from "@/components/ui/skeleton"
import {
  Filter, ChevronDown, Search, ArrowUpDown, Loader2,
  AlertTriangle, ShieldAlert, CheckCircle, ExternalLink,
  Info, Eye, LayoutGrid, List, Facebook, Instagram,
  Activity, User, Siren, FileSignature, ArrowRight, Quote, X, Download, FileDown,
  ArrowUp, ArrowDown, Calendar, ClockFading, ChevronLeft, ChevronRight,
  ShieldCheck,
  Smile,
  TrendingDown,
  Zap,
  TriangleAlert,
  Youtube
} from 'lucide-react'

import { Twitter } from '@/utils/icons'

import { format } from "date-fns"

import getPostLink from '@/components/GetPostLink'
// import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ReportButton } from '@/components/pdf/ReportButton'
import { DetailedReportButton } from '@/components/pdf/DetailedReportButton'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
// import SafeDate from '@/components/SafeDate'

export function CasesList({ cases, project, clientDetails, initialFilters, initialSort, currentPage, initialCase, projectEmails }) {

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const totalCount = cases?.totalCount || 0
  const totalPages = cases?.totalPages || 0

  const [selectedPost, setSelectedPost] = useState(initialCase || null)
  const [updatedCases, setUpdatedCases] = useState({})
  const postRefs = useRef({})

  const [selectedCases, setSelectedCases] = useState({})
  const selectedCount = Object.keys(selectedCases).length

  // Select-all-filtered state
  const [isAllFilterSelected, setIsAllFilterSelected] = useState(false)
  const [isSelectingAll, setIsSelectingAll] = useState(false)

  // Memoize the selected posts array to stabilize the reference passed to report buttons
  const selectedPostsArray = useMemo(() => Object.values(selectedCases), [selectedCases])

  // Navigation Logic for URL params
  const updateQueryParams = useCallback((newParams) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === undefined || (value === 'all' && key !== 'status')) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })
    // Reset page on filter/sort change unless explicitly setting page
    if (!newParams.page) {
      params.delete('page')
    }
    router.push(`${pathname}?${params.toString()}`)
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
      return { label: 'To Be Reviewed', icon: ClockFading, color: 'text-slate-700 bg-slate-50 border-slate-200' };
    }
    if (status === 'No Action' || status === 'Pass') {
      return { label: 'No Action', icon: CheckCircle, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    }
    if (status === 'Flag for Takedown') {
      return { label: 'Flag for Takedown', icon: Siren, color: 'text-rose-700 bg-rose-50 border-rose-200' };
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

  return (
    <div className="flex flex-col h-full bg-slate-50">

      {/* Filters & Controls */}
      <div className="px-6 py-4 shrink-0">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">

            {/* Left: Filters */}
            <div className="flex items-center gap-6 w-full lg:w-auto">

              <div className='flex flex-col gap-2 items-center justify-center'>
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="bg-blue-50 p-1 rounded-lg text-blue-600">
                    <Filter className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Filters</span>
                </div>

                <div className="text-xs font-medium text-slate-500 whitespace-nowrap">
                  <span className="font-bold text-slate-900 text-base  px-1">{totalCount}</span> cases found
                </div>
              </div>

              <Separator orientation="vertical" className="h-8 bg-slate-100 hidden sm:block" />

              {/* FILTERS */}
              <div className="flex flex-wrap items-center gap-4">

                {/* RISK LEVEL */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Risk Severity</Label>
                  <Select
                    value={initialFilters.risk_priority || 'all'}
                    onValueChange={(val) => handleFilterChange('risk_priority', val)}
                  >
                    <SelectTrigger className="w-[140px] bg-white border-slate-200 h-9 text-xs font-semibold">
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

                {/* PLATFORM */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Platform</Label>
                  <Select
                    value={initialFilters.platform}
                    onValueChange={(val) => handleFilterChange('platform', val)}
                  >
                    <SelectTrigger className="w-[140px] bg-white border-slate-200 h-9 text-xs font-semibold">
                      <SelectValue placeholder="All Platforms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Platforms</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="x">X (Twitter)</SelectItem>
                      <SelectItem value="youtube">Youtube</SelectItem>
                      <SelectItem value="website">Websites</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* STATUS */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Status</Label>
                  <Select
                    value={initialFilters.client_status}
                    onValueChange={(val) => handleFilterChange('client_status', val)}
                  >
                    <SelectTrigger className="w-[160px] bg-white border-slate-200 h-9 text-xs font-semibold">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="To Be Reviewed">To Be Reviewed</SelectItem>
                      <SelectItem value="No Action">No Action</SelectItem>
                      <SelectItem value="Flag for Takedown">Flag for Takedown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* POSTED AFTER */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Posted After</Label>
                  <input
                    type="date"
                    value={initialFilters.posted_after || ''}
                    onChange={(e) => handleFilterChange('posted_after', e.target.value)}
                    className="w-[150px] bg-white border border-slate-200 rounded-md h-9 px-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                {/* <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Threat Type</Label>
                  <Select
                    value={initialFilters.threat_type}
                    onValueChange={(val) => handleFilterChange('threat_type', val)}
                  >
                    <SelectTrigger className="w-[160px] bg-white border-slate-200 h-9 text-xs font-semibold">
                      <SelectValue placeholder="All Threats" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Threat Types</SelectItem>
                      <SelectItem value="impersonation">Impersonation</SelectItem>
                      <SelectItem value="deepfake_video">Deepfake Video</SelectItem>
                      <SelectItem value="scam_ad">Scam Ad</SelectItem>
                      <SelectItem value="hate_speech">Hate Speech</SelectItem>
                    </SelectContent>
                  </Select>
                </div> */}

                {(initialFilters.platform !== 'all' || initialFilters.risk_priority !== 'all' || initialFilters.client_status !== 'To Be Reviewed' || initialFilters.posted_after) && (
                  <div className="pt-4">
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold text-xs">
                      <X className="w-3.5 h-3.5 mr-1" /> Clear
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Actions & Counts */}
            <div className="flex items-center gap-5 w-full lg:w-auto justify-end">

              {selectedCount > 0 && (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1 py-1 rounded-md border border-blue-100">
                    {selectedCount} Selected
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAllSelected}
                    className="h-8 px-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 font-bold text-xs cursor-pointer"
                  >
                    Clear All
                  </Button>
                </div>
              )}

              <div className="flex flex-col gap-2 shrink-0 ml-auto">
                <div onClick={() => {
                  if (selectedCount === 0) alert("Select some cases before exporting");
                  trackClientClick('export_summary_report', { page: 'CasesList' });
                }}>
                  {selectedCount > 0 ? (
                    <ReportButton
                      posts={selectedPostsArray}
                      project={project}
                      className="flex w-full cursor-pointer items-center justify-start gap-2 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-md hover:bg-slate-50 transition-colors text-xs shadow-sm"
                    />
                  ) : (
                    <button className="flex w-full cursor-pointer items-center justify-start gap-2 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-md hover:bg-slate-50 transition-colors text-xs shadow-sm">
                      <FileDown className="w-3.5 h-3.5" />
                      Export Summary Report
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
                      Export Detailed Report
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

      {/* Select-all-filtered banner */}
      {isAllCurrentPageSelected && totalCount > mergedPosts.length && (
        <div className="px-6 pb-2 shrink-0">
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
            {isAllFilterSelected ? (
              <>
                <span className="text-xs font-semibold text-blue-700">
                  All <span className="font-bold">{totalCount}</span> cases across all pages are selected.
                </span>
                <button
                  onClick={handleClearAllSelected}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                >
                  Clear selection
                </button>
              </>
            ) : (
              <>
                <span className="text-xs font-semibold text-blue-700">
                  Only the <span className="font-bold">{mergedPosts.length}</span> cases on this page are selected.
                </span>
                <button
                  onClick={handleSelectAllFiltered}
                  disabled={isSelectingAll}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer disabled:opacity-60 flex items-center gap-1"
                >
                  {isSelectingAll && <Loader2 className="w-3 h-3 animate-spin" />}
                  Select all {totalCount} cases
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="min-w-full table-fixed divide-y divide-slate-100">
            <thead className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                {/* ---  Checkbox Header --- */}
                <th scope="col" className="w-[48px] px-4 py-3 text-left">
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
                  className="w-[120px] px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                  onClick={() => handleSortChange('threat_score')}
                >
                  <div className="flex items-center">
                    Risk Severity
                    <SortIcon field="threat_score" />
                  </div>
                </th>
                <th scope="col" className="w-[150px] px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-full max-w-[100px]"
                >
                  <div className="flex items-center">
                    Content
                  </div>
                </th>
                <th scope="col" className="w-[120px] px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Platform</th>
                <th scope="col" className="w-[170px] px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Violations</th>
                <th
                  scope="col"
                  className="w-[120px] px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                  onClick={() => handleSortChange('posted_at')}
                >
                  <div className="flex items-center">
                    Post Date
                    <SortIcon field="posted_at" />
                  </div>
                </th>
                <th scope="col" className="w-[110px] px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
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

                if (post.posted_date)
                  posted_date = format(new Date(post.posted_date), "dd/MM/yyyy");
                else if (post.metadata?.posted_date)
                  posted_date = format(new Date(post.metadata.posted_date), "dd/MM/yyyy");
                else if (post.timestamp)
                  posted_date = format(new Date(post.timestamp), "dd/MM/yyyy");
                else if (post.sourcing_date)
                  posted_date = format(new Date(post.sourcing_date), "dd/MM/yyyy");

                if (post.metadata?.created_at)
                  sourced_date = format(new Date(post.metadata.created_at), "dd/MM/yyyy");
                else if (post.created_at)
                  sourced_date = format(new Date(post.created_at), "dd/MM/yyyy");

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
                    <td className="px-4 py-3 whitespace-nowrap align-middle" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelectedRow}
                        onChange={(e) => handleToggleCase(currentPost, e)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3 whitespace-nowrap align-middle">
                      <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border shadow-sm", risk.color)}>

                        {
                          risk.label === "High" ? (
                            <Siren className="w-3.5 h-3.5 mr-1.5" />
                          ) : risk.label === "Medium" ? (
                            <TriangleAlert className="w-3.5 h-3.5 mr-1.5" />
                          ) : risk.label === "Low" ? (
                            <TrendingDown className="w-3.5 h-3.5 mr-1.5" />
                          ) : (
                            <Smile className="w-3.5 h-3.5 mr-1.5" />
                          )
                        }

                        {risk.label}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap align-middle">
                      <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border shadow-sm", statusConfig.color)}>
                        <StatusIcon className="w-3.5 h-3.5 mr-1.5" />
                        {statusConfig.label}
                      </span>
                    </td>

                    {/* Content */}
                    <td className="px-4 py-3 overflow-hidden align-middle max-w-[300px]">
                      <div className="flex gap-4">
                        <div className="shrink-0 relative">
                          {post.signedImageUrl ? (
                            <div className="h-16 w-16 rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-slate-200 group-hover:shadow-md transition-all">
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
                            <span className="font-bold text-slate-900 text-sm truncate transition-colors">
                              {post.user?.username ? `@${post.user.username}` : 'Unknown User'}
                            </span>
                            <span className="text-xs text-slate-400">•</span>
                            <span className="text-xs text-slate-500 font-mono">
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
                          </div>
                          <span className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                            {post.caption || <span className="italic text-slate-400">No caption content.</span>}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Platform */}
                    <td className="px-4 py-3 whitespace-nowrap align-middle">
                      <Badge variant="outline" className="capitalize font-semibold text-slate-600 border-slate-300 gap-1.5 pl-2 h-7">
                        {post.platform === 'instagram' && <Instagram className="w-3.5 h-3.5 text-pink-500" />}
                        {post.platform === 'facebook' && <Facebook className="w-3.5 h-3.5 text-blue-600" />}
                        {post.platform === 'x' && <Twitter className="w-3.5 h-3.5 text-slate-900" />}
                        {post.platform === 'youtube' && <Youtube className="w-3.5 h-3.5 text-red-600" />}
                        {post.platform}
                      </Badge>
                    </td>

                    {/* Threat Type */}
                    <td className="px-4 py-3 whitespace-nowrap align-middle">
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

                    {/* Posted At */}
                    <td className="px-4 py-3 whitespace-nowrap align-middle text-sm font-semibold text-slate-500">
                      {posted_date}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 whitespace-nowrap text-right align-middle">
                      <Button
                        size="sm"
                        variant={isPanelOpen ? "default" : "secondary"}
                        className={cn(
                          "h-8 text-xs font-bold transition-all shadow-sm",
                          isPanelOpen ? "bg-blue-600 hover:bg-blue-700 shadow-blue-200" : "bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 group "
                        )}
                      >
                        <ArrowRight className="w-8 h-8 group-hover:translate-x-0.5 transition-all duration-200 " />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

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
      {totalPages > 1 && (
        <div className="px-6 pb-2 pt-2">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-3 flex items-center justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Page <span className="text-slate-900">{currentPage}</span> of <span className="text-slate-900">{totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                className="h-9 px-2 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                title="First Page"
              >
                &lt;&lt;
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-9 px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
              </Button>

              <div className="flex items-center gap-1 mx-1">
                {(() => {
                  const pages = [];
                  let start = Math.max(1, currentPage - 2);
                  let end = Math.min(totalPages, currentPage + 2);

                  if (currentPage <= 2) {
                    end = Math.min(totalPages, 5);
                  }
                  if (currentPage >= totalPages - 1) {
                    start = Math.max(1, totalPages - 4);
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
                        "h-9 w-9 p-0 text-xs font-bold",
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
                className="h-9 px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
                className="h-9 px-2 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                title="Last Page"
              >
                &gt;&gt;
              </Button>
            </div>
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
