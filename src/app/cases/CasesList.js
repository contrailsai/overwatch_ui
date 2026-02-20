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
  ArrowUp, ArrowDown, Calendar
} from 'lucide-react'

import getPostLink from '@/components/GetPostLink'
import Link from 'next/link'
import { ReportButton } from '@/components/pdf/ReportButton'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export function CasesList() {
  const [posts, setPosts] = useState([])
  const [priorityPosts, setPriorityPosts] = useState([])
  const [raisedCount, setRaisedCount] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  // Filters State
  const [filters, setFilters] = useState({
    platform: 'all',
    status: 'all',
    threat_type: 'all'
  })

  // Sort State
  const [sort, setSort] = useState({
    field: 'threat_score',
    direction: 'desc'
  })

  const [selectedPost, setSelectedPost] = useState(null)

  const observer = useRef()
  const postRefs = useRef({})

  // Fetch initial data or when filters/sort change
  useEffect(() => {
    const loadInitialData = async () => {
      setInitialLoading(true)
      setPage(1)
      setHasMore(true)
      setPosts([])

      try {
        const [postsResult, priorityResult, countResult] = await Promise.all([
          getPosts(1, 20, filters, sort),
          getPriorityTakedowns(),
          getRaisedCount()
        ])

        setPosts(postsResult.posts)
        setTotalCount(postsResult.totalCount)
        setHasMore(1 < postsResult.totalPages)
        setPriorityPosts(priorityResult)
        setRaisedCount(countResult)

      } catch (error) {
        console.error('Failed to fetch posts:', error)
      } finally {
        setInitialLoading(false)
      }
    }

    loadInitialData()
  }, [filters, sort])

  // Load more posts function
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || initialLoading) return

    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const result = await getPosts(nextPage, 20, filters, sort)

      if (result.posts.length > 0) {
        setPosts(prev => {
          return [...prev, ...result.posts]
        })
        setPage(nextPage)
        setHasMore(nextPage < result.totalPages)
      } else {
        setHasMore(false)
      }
    } catch (error) {
      console.error('Failed to load more posts:', error)
    } finally {
      setLoadingMore(false)
    }
  }, [page, loadingMore, hasMore, initialLoading, filters, sort])

  // Helper for duplicate removal if an item is in both lists
  const mergedPosts = useMemo(() => [
    ...priorityPosts.map(p => ({ ...p, isPriority: true })),
    ...posts.filter(p => !priorityPosts.some(pr => pr._id === p._id))
  ], [priorityPosts, posts]);

  // Navigation Logic
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
    } else if (direction === 'next' && nextIndex >= mergedPosts.length && hasMore) {
      loadMore()
    }
  }, [selectedPost, mergedPosts, hasMore, loadMore])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only navigate if a post is selected (panel is open)
      if (!selectedPost) return

      // Ignore inputs
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

  // Intersection Observer
  const lastPostElementRef = useCallback(node => {
    if (initialLoading || loadingMore) return
    if (observer.current) observer.current.disconnect()
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMore()
      }
    }, { threshold: 0.1, rootMargin: '100px' })
    if (node) observer.current.observe(node)
  }, [initialLoading, loadingMore, hasMore, loadMore])

  const handleFilterChange = (key, value) => setFilters(prev => ({ ...prev, [key]: value }))

  const clearFilters = () => {
    setFilters({
      platform: 'all',
      status: 'all',
      threat_type: 'all'
    })
  }

  const handleSortChange = (field) => {
    setSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
    }))
  }

  const getRiskLabel = (score) => {
    if (score >= 80) return { label: 'Critical', color: 'text-rose-700 bg-rose-50 border-rose-200' };
    if (score >= 60) return { label: 'High', color: 'text-orange-700 bg-orange-50 border-orange-200' };
    if (score >= 40) return { label: 'Medium', color: 'text-amber-700 bg-amber-50 border-amber-200' };
    return { label: 'Low', color: 'text-slate-700 bg-slate-50 border-slate-200' };
  }

  const getStatusConfig = (post) => {
    const takedownStatus = post.takedown_info?.takedown_status;

    if (takedownStatus === 'requested') {
      return { label: 'Takedown Suggested', icon: FileSignature, color: 'text-orange-800 bg-orange-50 border-orange-200 ring-1 ring-orange-300' };
    }
    if (takedownStatus === 'raised') {
      return { label: 'Takedown Raised', icon: Siren, color: 'text-rose-700 bg-rose-50 border-rose-200' };
    }
    if (post.review_details && Object.keys(post.review_details).length > 0) {
      return { label: 'Reviewed', icon: User, color: 'text-blue-700 bg-blue-50 border-blue-200' };
    }
    if (post.analysis_results && Object.keys(post.analysis_results).length > 0) {
      return { label: 'AI Analysed', icon: Activity, color: 'text-purple-700 bg-purple-50 border-purple-200' };
    }
    return { label: 'Unprocessed', icon: AlertTriangle, color: 'text-slate-600 bg-slate-50 border-slate-200' };
  }

  const SortIcon = ({ field }) => {
    if (sort.field !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 ml-1.5" />
    if (sort.direction === 'asc') return <ArrowUp className="w-3.5 h-3.5 text-blue-600 ml-1.5" />
    return <ArrowDown className="w-3.5 h-3.5 text-blue-600 ml-1.5" />
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">

      {/* Filters & Controls */}
      <div className="px-8 py-6 shrink-0">
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
                    value={filters.platform}
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
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Threat Type</Label>
                  <Select
                    value={filters.threat_type}
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
                </div>

                {(filters.platform !== 'all' || filters.threat_type !== 'all' || filters.status !== 'all') && (
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

              {raisedCount > 0 && (
                <Link
                  href="/takedowns"
                  className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 border border-rose-100 rounded-lg text-rose-700 hover:bg-rose-100 transition-colors group"
                >
                  <Siren className="w-4 h-4" />
                  <span className="text-xs font-bold">{raisedCount} Raised</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
              )}

              <Separator orientation="vertical" className="h-8 bg-slate-100 hidden sm:block" />

              <div className="text-xs font-medium text-slate-500 whitespace-nowrap">
                <span className="font-bold text-slate-900 text-sm">{totalCount}</span> cases found
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                  onClick={() => handleSortChange('threat_score')}
                >
                  <div className="flex items-center">
                    Risk Priority
                    <SortIcon field="threat_score" />
                  </div>
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th
                  scope="col"
                  className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                  onClick={() => handleSortChange('created_at')}
                >
                  <div className="flex items-center">
                    Content & Date
                    <SortIcon field="created_at" />
                  </div>
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Platform</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Threat Type</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Source</th>
                <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-slate-100">
              {initialLoading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={index}>
                    {/* Priority */}
                    <td className="px-6 py-4 whitespace-nowrap align-top">
                      <Skeleton className="h-6 w-20" />
                    </td>
                    {/* Status */}
                    <td className="px-6 py-4 whitespace-nowrap align-top">
                      <Skeleton className="h-6 w-24" />
                    </td>
                    {/* Content */}
                    <td className="px-6 py-4 max-w-lg align-top">
                      <div className="flex gap-4">
                        <Skeleton className="h-16 w-16 rounded-lg shrink-0" />
                        <div className="flex flex-col gap-2 w-full">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-2/3" />
                        </div>
                      </div>
                    </td>
                    {/* Platform */}
                    <td className="px-6 py-4 whitespace-nowrap align-top">
                      <Skeleton className="h-6 w-20" />
                    </td>
                    {/* Threat Type */}
                    <td className="px-6 py-4 whitespace-nowrap align-top">
                      <div className="flex gap-1">
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-5 w-16" />
                      </div>
                    </td>
                    {/* Source */}
                    <td className="px-6 py-4 whitespace-nowrap align-top">
                      <Skeleton className="h-5 w-16" />
                    </td>
                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap text-right align-top">
                      <Skeleton className="h-8 w-20 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : (
                mergedPosts.map((post, index) => {
                  // ... (existing map logic)

                  const isLastPost = index === mergedPosts.length - 1;
                  const riskScore = post.review_details?.threat_score || post.analysis_results?.risk_score || 0;
                  const risk = getRiskLabel(riskScore);
                  const threatTypes = post.review_details?.threat_types;
                  const statusConfig = getStatusConfig(post);
                  const StatusIcon = statusConfig.icon;
                  const isSelected = selectedPost?._id === post._id

                  return (
                    <tr
                      key={index}
                      ref={el => {
                        postRefs.current[post._id] = el
                        if (isLastPost) lastPostElementRef(el)
                      }}
                      onClick={() => setSelectedPost(post)}
                      className={cn(
                        "transition-all cursor-pointer group",
                        isSelected ? "bg-blue-50/60 ring-1 ring-inset ring-blue-200 z-10 relative" : "hover:bg-slate-50"
                      )}
                    >
                      {/* Priority */}
                      <td className="px-6 py-4 whitespace-nowrap align-top">
                        <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border shadow-sm", risk.color)}>
                          <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                          {risk.label}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 whitespace-nowrap align-top">
                        <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border shadow-sm", statusConfig.color)}>
                          <StatusIcon className="w-3.5 h-3.5 mr-1.5" />
                          {statusConfig.label}
                        </span>
                      </td>

                      {/* Content */}
                      <td className="px-6 py-4 max-w-lg overflow-hidden align-top">
                        <div className="flex gap-4">
                          <div className="shrink-0 relative">
                            {post.signedImageUrl ? (
                              <div className="h-16 w-16 rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-slate-50 group-hover:shadow-md transition-all">
                                <img
                                  src={post.signedImageUrl}
                                  alt="Content"
                                  className="h-full w-full object-cover"
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
                                {post.taken_at ? new Date(post.taken_at * 1000).toLocaleDateString() : 'N/A'}
                              </span>
                            </div>
                            <span className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                              {post.caption || <span className="italic text-slate-400">No caption content.</span>}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Platform */}
                      <td className="px-6 py-4 whitespace-nowrap align-top">
                        <Badge variant="outline" className="capitalize font-semibold text-slate-600 border-slate-300 gap-1.5 pl-2 h-7">
                          {post.platform === 'instagram' && <Instagram className="w-3.5 h-3.5 text-pink-500" />}
                          {post.platform === 'facebook' && <Facebook className="w-3.5 h-3.5 text-blue-600" />}
                          {post.platform === 'x' && <Twitter className="w-3.5 h-3.5 text-slate-900" />}
                          {post.platform}
                        </Badge>
                      </td>

                      {/* Threat Type */}
                      <td className="px-6 py-4 whitespace-nowrap align-top">
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
                          {(!threatTypes || threatTypes.length === 0) && <span className="text-xs text-slate-400 italic">None</span>}
                        </div>
                      </td>

                      {/* Source */}
                      <td className="px-6 py-4 whitespace-nowrap align-top">
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
                      <td className="px-6 py-4 whitespace-nowrap text-right align-top">
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
                }))}
            </tbody>
          </table>

          {mergedPosts.length === 0 && !initialLoading && (
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

          {loadingMore && (
            <div className="py-8 flex justify-center bg-slate-50/50 border-t border-slate-100">
              <div className="flex items-center gap-2 text-blue-600 text-sm font-bold animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading more cases...
              </div>
            </div>
          )}

          {!hasMore && mergedPosts.length > 0 && (
            <div className="py-6 text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest bg-slate-50/30 border-t border-slate-100">
              End of List
            </div>
          )}
        </div>
      </div>

      <CaseDetailPanel
        post={selectedPost}
        isOpen={!!selectedPost}
        onClose={() => setSelectedPost(null)}
        onNavigate={navigatePost}
        hasPrev={mergedPosts.findIndex(p => p._id === selectedPost?._id) > 0}
        hasNext={mergedPosts.findIndex(p => p._id === selectedPost?._id) < mergedPosts.length - 1 || hasMore}
      />
    </div>
  )
}
