'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { getPosts, approveTakedown, getPriorityTakedowns, getRaisedCount } from './actions'
import { CaseDetailPanel } from './CaseDetailPanel'
import { Skeleton } from "@/components/ui/skeleton"
import {
  Filter, ChevronDown, Search, ArrowUpDown, Loader2,
  AlertTriangle, ShieldAlert, CheckCircle, ExternalLink,
  Info, Eye, LayoutGrid, List, Facebook, Instagram, Twitter,
  Activity, User, Siren, FileSignature, ArrowRight, Quote, X, Download,
  ArrowUp, ArrowDown, Calendar, ClockFading, ChevronLeft, ChevronRight,
  ShieldCheck,
  Smile,
  TrendingDown,
  Zap,
  TriangleAlert
} from 'lucide-react'

import getPostLink from '@/components/GetPostLink'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ReportButton } from '@/components/pdf/ReportButton'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import SafeDate from '@/components/SafeDate'

export function CasesList({ cases, project, initialFilters, initialSort, currentPage, initialCase }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [priorityPosts, setPriorityPosts] = useState([])
  const [raisedCount, setRaisedCount] = useState(0)
  const [isInitialLoading, setIsInitialLoading] = useState(true)

  const posts = cases?.posts || []
  const totalCount = cases?.totalCount || 0
  const totalPages = cases?.totalPages || 0

  const [selectedPost, setSelectedPost] = useState(initialCase || null)
  const [updatedCases, setUpdatedCases] = useState({})
  const postRefs = useRef({})

  // Sync Priority and Raised Count
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [priorityResult, countResult] = await Promise.all([
          getPriorityTakedowns(),
          getRaisedCount()
        ])
        setPriorityPosts(priorityResult)
        setRaisedCount(countResult)
      } catch (error) {
        console.error('Failed to fetch metadata:', error)
      } finally {
        setIsInitialLoading(false)
      }
    }
    fetchMetadata()
  }, [])

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
  const mergedPosts = useMemo(() => {
    const currentPosts = cases?.posts || []
    // Priority posts only show on page 1 by convention or if we want them everywhere
    // Given the previous logic merged them, let's keep it similar
    return [
      ...priorityPosts.map(p => ({ ...p, isPriority: true })),
      ...currentPosts.filter(p => !priorityPosts.some(pr => pr._id === p._id))
    ]
  }, [priorityPosts, cases?.posts])

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
    if (status === 'Pass') {
      return { label: 'Pass', icon: CheckCircle, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
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

  return (
    <div className="flex flex-col h-full bg-slate-50">

      {/* Filters & Controls */}
      <div className="px-6 py-4 shrink-0">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">

            {/* Left: Filters */}
            <div className="flex items-center gap-6 w-full lg:w-auto">
              <div className="flex items-center gap-2.5 shrink-0">
                <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                  <Filter className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Filters</span>
              </div>

              <Separator orientation="vertical" className="h-8 bg-slate-100 hidden sm:block" />

              <div className="flex flex-wrap items-center gap-4">
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
                    </SelectContent>
                  </Select>
                </div>

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
                      <SelectItem value="Pass">Pass</SelectItem>
                      <SelectItem value="Flag for Takedown">Flag for Takedown</SelectItem>
                    </SelectContent>
                  </Select>
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

                {(initialFilters.platform !== 'all' || initialFilters.threat_type !== 'all' || initialFilters.client_status !== 'To Be Reviewed') && (
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
              <ReportButton posts={mergedPosts} />

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

              <Separator orientation="vertical" className="h-8 bg-slate-100 hidden sm:block" />

              <div className="text-xs font-medium text-slate-500 whitespace-nowrap">
                <span className="font-bold text-slate-900 text-sm">{totalCount}</span> cases found
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="min-w-full table-fixed divide-y divide-slate-100">
            <thead className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th
                  scope="col"
                  className="w-[120px] px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                  onClick={() => handleSortChange('threat_score')}
                >
                  <div className="flex items-center">
                    Risk Priority
                    <SortIcon field="threat_score" />
                  </div>
                </th>
                <th scope="col" className="w-[150px] px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                  onClick={() => handleSortChange('created_at')}
                >
                  <div className="flex items-center">
                    Content & Date
                    <SortIcon field="created_at" />
                  </div>
                </th>
                <th scope="col" className="w-[120px] px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Platform</th>
                <th scope="col" className="w-[170px] px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Threat Type</th>
                <th scope="col" className="w-[90px] px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Source</th>
                <th scope="col" className="w-[110px] px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-slate-100">
              {mergedPosts.map((post, index) => {
                const currentPost = { ...post, client_status: updatedCases[post._id] || post.client_status };
                const riskScore = currentPost.review_details?.threat_score;
                const risk = getRiskLabel(riskScore);

                const review = currentPost.review_details;
                const analysis = currentPost.analysis;

                // const isPoiPresent = review.flags?.poi_confirmed ?? (analysis.poi_check?.poi_name_found || analysis.poi_check?.face_present) ?? false;
                const isNsfw = review.flags?.is_nsfw ?? false;
                const isHateSpeech = review.flags?.is_hate_speech ?? false;
                const isFakeNews = review.flags?.is_fake_news ?? false;
                const isAigc = review.flags?.is_aigc ?? false;
                const isFraud = review.flags?.is_fraud ?? false;
                const isAssetMisuse = review.flags?.is_asset_misuse ?? false;
                const isSatire = review.flags?.is_humor ?? false;

                let threatTypes = [isNsfw && "NSFW", isHateSpeech && "Hate Speech", isFakeNews && "Fake News", isAigc && "AIGC", isFraud && "Fraud", isAssetMisuse && "Asset Misuse", isSatire && "Satire"];
                threatTypes = threatTypes.filter(Boolean);

                const statusConfig = getStatusConfig(currentPost);
                const StatusIcon = statusConfig.icon;
                const isSelected = selectedPost?._id === currentPost._id

                return (
                  <tr
                    key={currentPost._id}
                    ref={el => postRefs.current[currentPost._id] = el}
                    onClick={() => setSelectedPost(currentPost)}
                    className={cn(
                      "transition-all cursor-pointer group",
                      isSelected ? "bg-blue-50/60 ring-1 ring-inset ring-blue-200 z-10 relative" : "hover:bg-slate-50"
                    )}
                  >
                    {/* Priority */}
                    <td className="px-4 py-3 whitespace-nowrap align-top">
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
                    <td className="px-4 py-3 whitespace-nowrap align-top">
                      <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border shadow-sm", statusConfig.color)}>
                        <StatusIcon className="w-3.5 h-3.5 mr-1.5" />
                        {statusConfig.label}
                      </span>
                    </td>

                    {/* Content */}
                    <td className="px-4 py-3 overflow-hidden align-top">
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
                            <span className="font-bold text-slate-900 text-sm truncate hover:text-blue-600 transition-colors">
                              {post.user?.username ? `@${post.user.username}` : 'Unknown User'}
                            </span>
                            <span className="text-xs text-slate-400">•</span>
                            <span className="text-xs text-slate-500 font-mono">
                              <SafeDate date={post.taken_at ? post.taken_at * 1000 : null} />
                            </span>
                          </div>
                          <span className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                            {post.caption || <span className="italic text-slate-400">No caption content.</span>}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Platform */}
                    <td className="px-4 py-3 whitespace-nowrap align-top">
                      <Badge variant="outline" className="capitalize font-semibold text-slate-600 border-slate-300 gap-1.5 pl-2 h-7">
                        {post.platform === 'instagram' && <Instagram className="w-3.5 h-3.5 text-pink-500" />}
                        {post.platform === 'facebook' && <Facebook className="w-3.5 h-3.5 text-blue-600" />}
                        {post.platform === 'x' && <Twitter className="w-3.5 h-3.5 text-slate-900" />}
                        {post.platform}
                      </Badge>
                    </td>

                    {/* Threat Type */}
                    <td className="px-4 py-3 whitespace-nowrap align-top">
                      <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                        {Array.isArray(threatTypes) && threatTypes.map((type, idx) => {
                          const colorMap = {
                            scam: 'text-orange-700 bg-orange-50 border-orange-200',
                            aigc: 'text-purple-700 bg-purple-50 border-purple-200',
                            fake_news: 'text-red-700 bg-red-50 border-red-200',
                            hate_speech: 'text-rose-700 bg-rose-50 border-rose-200',
                            nsfw: 'text-amber-700 bg-amber-50 border-amber-200',
                          };
                          const style = colorMap[type] || 'text-slate-600 bg-slate-100 border-slate-200';
                          return (
                            <span
                              key={idx}
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider shadow-sm ${style}`}
                            >
                              {type.replace(/_/g, ' ')}
                            </span>
                          );
                        })}
                        {(!threatTypes || threatTypes.length === 0) && <span className="text-xs text-slate-400 italic"></span>}
                      </div>
                    </td>

                    {/* Source */}
                    <td className="px-4 py-3 whitespace-nowrap align-top">
                      <a
                        href={post.original_url ? post.original_url : getPostLink(post)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center text-blue-600 hover:text-blue-800 font-bold text-xs transition-colors hover:underline bg-blue-50 px-2 py-1 rounded-md"
                      >
                        Source <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 whitespace-nowrap text-right align-top">
                      <Button
                        size="sm"
                        variant={isSelected ? "default" : "secondary"}
                        className={cn(
                          "h-8 text-xs font-bold transition-all shadow-sm",
                          isSelected ? "bg-blue-600 hover:bg-blue-700 shadow-blue-200" : "bg-white border border-slate-200 hover:bg-slate-50 text-slate-600"
                        )}
                      >
                        {isSelected ? 'Inspect' : 'Details'}
                        <ArrowRight className="w-3 h-3 ml-1.5 opacity-50" />
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
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-9 px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
              </Button>
              <div className="flex items-center gap-1">
                {/* Simple page numbers could go here if needed, but Prev/Next is cleaner for 20 items */}
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
            </div>
          </div>
        </div>
      )}

      <CaseDetailPanel
        post={selectedPost ? { ...selectedPost, client_status: updatedCases[selectedPost._id] || selectedPost.client_status } : null}
        project={project}
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
      />
    </div>
  )
}
