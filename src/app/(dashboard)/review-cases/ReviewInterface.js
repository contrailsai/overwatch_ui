'use client'

import * as React from "react"
import { useState, useEffect, useCallback, useRef, useTransition } from 'react'
import { format } from "date-fns"
import { getAllPostsForExport } from './actions'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Skeleton } from "@/components/ui/skeleton"
import {
  Loader2, X, Filter, Download, ChevronLeft, ChevronRight,
  Search, Quote, Globe, FileJson,
  Instagram, Facebook, Youtube,
} from 'lucide-react'
import { Twitter, Reddit } from "@/utils/icons"

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useIsMobile } from '@/hooks/use-media-query'

import ReviewForm from "./ReviewDetails"
import { ReviewCasesFilterPanel } from "./ReviewCasesFilterPanel"
import { MobileReviewCasesFilterDrawer } from "./MobileReviewCasesFilterDrawer"

function PostPlatformBadge({ platform, size = 'md' }) {
  const p = platform?.toLowerCase() || ''
  const iconClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  const wrapClass = size === 'sm' ? 'p-0.5' : 'p-0.5'

  if (p === 'instagram') return <div className={cn('bg-white rounded-full shadow-sm', wrapClass)}><Instagram className={cn(iconClass, 'text-pink-500 fill-pink-50')} /></div>
  if (p === 'facebook') return <div className={cn('bg-white rounded-full shadow-sm', wrapClass)}><Facebook className={cn(iconClass, 'text-blue-600 fill-blue-50')} /></div>
  if (p === 'x') return <div className={cn('bg-white rounded-full shadow-sm', size === 'sm' ? 'p-0.5' : 'p-1')}><span className={cn('block text-black', size === 'sm' ? 'size-3.5' : 'size-4')}><Twitter /></span></div>
  if (p === 'reddit') return <div className={cn('bg-white rounded-full shadow-sm', wrapClass)}><span className={cn('block text-black', size === 'sm' ? 'size-4' : 'size-6')}><Reddit /></span></div>
  if (p === 'youtube') return <div className={cn('bg-white rounded-full shadow-sm', wrapClass)}><Youtube className={cn(iconClass, 'text-red-600 fill-red-50')} /></div>
  if (p === 'website') return <div className={cn('bg-white rounded-full shadow-sm', wrapClass)}><Globe className={cn(iconClass, 'text-slate-500')} /></div>
  return null
}

function getPostDates(post) {
  const rawPostedDate = post.posted_date || post.metadata?.posted_date || post.timestamp || post.sourcing_date
  const rawSourcedDate = post.metadata?.created_at || post.created_at
  return {
    posted: rawPostedDate ? format(new Date(rawPostedDate), "dd/MM/yyyy HH:mm a") : "N/A",
    sourced: rawSourcedDate ? format(new Date(rawSourcedDate), "dd/MM/yyyy HH:mm a") : "N/A",
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function ExportSelect({ selectKey, onExportDone, exportingType, posts, onExportCSV, onExportJSON, className }) {
  return (
    <Select
      key={selectKey}
      disabled={!!exportingType || posts.length === 0}
      onValueChange={(val) => {
        if (val !== 'csv' && val !== 'json') return
        void (async () => {
          try {
            if (val === 'csv') await onExportCSV()
            else await onExportJSON()
          } finally {
            onExportDone()
          }
        })()
      }}
    >
      <SelectTrigger className={cn("h-9 text-xs font-bold text-slate-600 border-slate-200 hover:border-blue-300 transition-all focus:ring-0", className)}>
        <div className="flex items-center gap-2">
          {exportingType ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          <span>Export Data</span>
        </div>
      </SelectTrigger>
      <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
        <SelectItem value="csv" className="text-xs font-medium">
          <div className="flex items-center gap-2">
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </div>
        </SelectItem>
        <SelectItem value="json" className="text-xs font-medium">
          <div className="flex items-center gap-2">
            <FileJson className="h-3.5 w-3.5" />
            <span>Export JSON</span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

export function ReviewInterface({
  initialPosts,
  totalPages,
  currentPage,
  project,
  clientDetails,
  initialFilters,
  totalCount,
  initialCase
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()

  const [selectedPost, setSelectedPost] = useState(initialCase || null)
  const [posts, setPosts] = useState(initialPosts)
  const [exportingType, setExportingType] = useState(null)
  const [exportSelectKey, setExportSelectKey] = useState(0)
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)

  const [isPending, startTransition] = useTransition()
  const postRefs = useRef({})

  useEffect(() => {
    setPosts(initialPosts)
  }, [initialPosts])

  const updateQueryParams = useCallback((newParams) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })

    if (!newParams.page) {
      params.delete('page')
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }, [router, pathname, searchParams])

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return
    updateQueryParams({ page: newPage })
  }

  const handleFilterChange = (key, value) => {
    updateQueryParams({ [key]: value, page: 1 })
  }

  const handleExportCSV = async () => {
    setExportingType('csv')
    try {
      const { posts: allPosts } = await getAllPostsForExport(project.mongo_db_map, initialFilters)

      if (!allPosts || allPosts.length === 0) {
        alert("No posts found to export.")
        return
      }

      const headers = [
        "MongoDB ID", "Post ID", "Original URL", "Caption", "Platform",
        "Author URL", "Author Username", "Author Full Name", "Timestamp",
        "Likes", "Comments", "Views", "Shares", "Retweets", "Quotes", "Replies",
        "reviewer-reasoning"
      ]

      const csvRows = [
        headers.join(','),
        ...allPosts.map(post => {
          const rowData = [
            post._id?.$oid || '',
            post.code || '',
            post.url || '',
            post.content || '',
            post.platform || '',
            post.profile?.profile_url || '',
            post.profile?.username || '',
            post.profile?.display_name || '',
            post.engagement?.posted_at?.$date || '',
            post.engagement?.likes || 0,
            post.engagement?.comments || 0,
            post.engagement?.views || 0,
            post.engagement?.shares || 0,
            post.engagement?.retweets || 0,
            post.engagement?.quotes || 0,
            post.engagement?.replies || 0,
            post.review_details?.reasoning || ''
          ]
          return rowData
            .map(val => `"${String(val ?? '').replace(/"/g, '""').replace(/\n/g, ' ')}"`)
            .join(',')
        })
      ]

      const csvString = csvRows.join('\n')
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
      downloadBlob(blob, `cases_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`)
    } catch (error) {
      console.error('Export Error:', error)
      alert('Failed to export CSV. Please try again.')
    } finally {
      setExportingType(null)
    }
  }

  const handleExportJSON = async () => {
    setExportingType('json')
    try {
      const { posts: allPosts } = await getAllPostsForExport(project.mongo_db_map, initialFilters)

      if (!allPosts || allPosts.length === 0) {
        alert("No posts found to export.")
        return
      }

      const jsonString = JSON.stringify(allPosts, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      downloadBlob(blob, `cases_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`)
    } catch (error) {
      console.error('Export Error:', error)
      alert('Failed to export JSON. Please try again.')
    } finally {
      setExportingType(null)
    }
  }

  const handleDownloadSingleJSON = (post) => {
    try {
      const exportData = {
        _id: { $oid: post._id },
        code: post.code || post.post_id || "",
        content: post.content || post.post_content?.content || post.caption || "",
        created_at: { $date: post.created_at || "" },
        engagement: {
          likes: post.engagement?.likes ?? post.stats?.like_count ?? 0,
          comments: post.engagement?.comments ?? post.stats?.comment_count ?? 0,
          shares: post.engagement?.shares ?? post.stats?.share_count ?? 0,
          retweets: post.engagement?.retweets ?? post.stats?.retweet_count ?? 0,
          quotes: post.engagement?.quotes ?? post.stats?.quote_count ?? 0,
          replies: post.engagement?.replies ?? post.stats?.reply_count ?? 0,
          views: post.engagement?.views ?? post.stats?.view_count ?? 0,
          posted_at: { $date: post.posted_date || "" }
        },
        media_urls: post.media_urls || post.post_content?.media_urls || [],
        platform: post.platform || "",
        profile: {
          platform_user_id: post.profile?.platform_user_id || null,
          username: post.profile?.username || post.user?.username || "",
          display_name: post.profile?.display_name || post.user?.full_name || "",
          profile_url: post.profile?.profile_url || post.user?.profile_pic_url || "",
          is_verified: post.profile?.is_verified ?? post.user?.is_verified ?? false
        },
        sourcing_date: { $date: post.sourcing_date || "" },
        url: post.original_url || post.url || "",
        analysis_results: post.analysis_results || {},
        review_details: post.review_details || {}
      }

      const jsonString = JSON.stringify(exportData, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      downloadBlob(blob, `case_${post._id}_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`)
    } catch (error) {
      console.error('Download Error:', error)
      alert('Failed to download JSON. Please try again.')
    }
  }

  const clearFilters = () => {
    startTransition(() => {
      router.push(pathname, { scroll: false })
    })
  }

  const navigatePost = useCallback((direction) => {
    if (!selectedPost) return
    const currentIndex = posts.findIndex(p => p._id === selectedPost._id)
    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1

    if (nextIndex >= 0 && nextIndex < posts.length) {
      const nextPost = posts[nextIndex]
      setSelectedPost(nextPost)
      setTimeout(() => {
        const postElement = postRefs.current[nextPost._id]
        if (postElement) {
          postElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
    }
  }, [selectedPost, posts])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedPost) return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        navigatePost('prev')
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        navigatePost('next')
      } else if (e.key === 'Escape') {
        setSelectedPost(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedPost, posts, navigatePost])

  const currentFilters = initialFilters || {}

  const hasActiveFilters =
    currentFilters.status !== 'pending' ||
    currentFilters.platform !== 'all' ||
    (currentFilters.aiAnalyzed && currentFilters.aiAnalyzed !== 'all') ||
    (currentFilters.visibility_status && currentFilters.visibility_status !== 'all') ||
    (currentFilters.aiRisk && currentFilters.aiRisk !== 'all') ||
    currentFilters.poiDetected ||
    currentFilters.sourcingDateStart ||
    currentFilters.sourcingDateEnd ||
    currentFilters.postingDateStart ||
    currentFilters.postingDateEnd

  const filterPanelProps = {
    currentFilters,
    handleFilterChange,
    updateQueryParams,
  }

  const exportSelectProps = {
    selectKey: exportSelectKey,
    onExportDone: () => setExportSelectKey((k) => k + 1),
    exportingType,
    posts,
    onExportCSV: handleExportCSV,
    onExportJSON: handleExportJSON,
  }

  const renderEmptyState = () => (
    <div className="px-4 py-12 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3">
        <Search className="w-6 h-6 text-slate-300" />
      </div>
      <p className="text-slate-500 font-medium">No posts found matching your filters.</p>
      <button onClick={clearFilters} className="text-blue-600 hover:underline text-sm mt-2 font-medium">Clear all filters</button>
    </div>
  )

  const formatMobileCardDate = (dateStr) => {
    if (!dateStr || dateStr === 'N/A') return '—'
    return dateStr.split(' ')[0]
  }

  const renderMobileCard = (post) => {
    const isSelected = selectedPost?._id === post._id
    const { posted, sourced } = getPostDates(post)
    const sourcedLabel = formatMobileCardDate(sourced)
    const publishedLabel = formatMobileCardDate(posted)

    return (
      <div
        key={post._id}
        ref={(el) => { postRefs.current[post._id] = el }}
        role="button"
        tabIndex={0}
        onClick={() => setSelectedPost(post)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedPost(post) }}
        className={cn(
          "p-3 border-b border-slate-100 transition-colors cursor-pointer active:bg-slate-50",
          isSelected ? "bg-blue-50/60" : "bg-white"
        )}
      >
        <div className="flex gap-3">
          <div className="shrink-0">
            {post.signedImageUrl ? (
              <div className="h-14 w-14 rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                <img src={post.signedImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              </div>
            ) : (
              <div className="h-14 w-14 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">
                <Quote className="h-5 w-5 text-slate-300" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="shrink-0">
                <PostPlatformBadge platform={post.platform} size="sm" />
              </span>
              <span className="font-bold text-slate-900 text-sm truncate min-w-0">
                {post.user?.username || 'Unknown User'}
              </span>
              {post.visibility_status === 'down' ? (
                <span className="shrink-0 inline-flex px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-500 uppercase">Taken Down</span>
              ) : (
                <span className="shrink-0 inline-flex px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-100 text-emerald-700 uppercase">Online</span>
              )}
            </div>
            <p className="text-sm text-slate-600 line-clamp-2 mt-0.5 leading-snug">
              {post.caption || <span className="italic text-slate-400">No caption</span>}
            </p>

            <div className="flex items-center justify-between gap-2 mt-2">
              <p className="text-[10px] text-slate-500 leading-tight min-w-0">
                <span className="text-slate-400">Ingested</span>{' '}
                <span className="font-semibold text-slate-600 tabular-nums">{sourcedLabel}</span>
                <span className="text-slate-300 mx-1">·</span>
                <span className="text-slate-400">Posted</span>{' '}
                <span className="font-semibold text-slate-600 tabular-nums">{publishedLabel}</span>
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); handleDownloadSingleJSON(post) }}
                  className="h-8 px-2.5 text-[11px] font-bold text-slate-600 border border-slate-200"
                >
                  JSON
                </Button>
                <Button
                  size="sm"
                  variant={isSelected ? "default" : "secondary"}
                  className={cn("h-8 px-3 text-[11px] font-bold", isSelected && "bg-blue-600 hover:bg-blue-700")}
                >
                  {isSelected ? 'Reviewing…' : 'Review'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderTableRow = (post) => {
    const isSelected = selectedPost?._id === post._id
    const { posted, sourced } = getPostDates(post)

    return (
      <tr
        key={post._id}
        ref={(el) => { postRefs.current[post._id] = el }}
        className={cn("group transition-all cursor-pointer", isSelected ? "bg-blue-50/60" : "hover:bg-slate-50")}
        onClick={() => setSelectedPost(post)}
      >
        <td className="px-6 py-3 max-w-lg align-top">
          <div className="flex gap-4">
            <div className="shrink-0 relative">
              {post.signedImageUrl ? (
                <div className="h-16 w-16 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shadow-sm">
                  <img src={post.signedImageUrl} alt="Post" className="h-full w-full object-cover" loading="lazy" />
                </div>
              ) : (
                <div className="h-16 w-16 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">
                  <Quote className="h-6 w-6 text-slate-300" />
                </div>
              )}
              <div className="absolute -bottom-1 -right-1">
                <PostPlatformBadge platform={post.platform} />
              </div>
            </div>

            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-900 text-sm truncate max-w-[150px]">
                  {post.user?.username || 'Unknown User'}
                </span>
                {post.visibility_status === 'down' ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-500 uppercase tracking-tighter shadow-sm">Taken Down</span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-100 text-emerald-700 uppercase tracking-tighter shadow-sm">Online</span>
                )}
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs text-slate-500">
                  {post.taken_at ? format(new Date(post.taken_at * 1000), "dd/MM/yyyy") : 'N/A'}
                </span>
              </div>
              <p className="text-sm text-slate-600 line-clamp-1 leading-relaxed">
                {post.caption || <span className="italic text-slate-400">No caption available</span>}
              </p>
            </div>
          </div>
        </td>

        <td className="px-6 py-4 flex flex-col items-center whitespace-nowrap align-top">
          <PostPlatformBadge platform={post.platform} />
          <span className="mt-1 capitalize">{post.platform?.toLowerCase() || 'Unknown'}</span>
        </td>

        <td className="px-6 py-4 whitespace-nowrap align-top">
          <span className="text-sm font-semibold text-slate-700 capitalize">
            {sourced.split(' ')[0]}<br />{sourced.split(' ').slice(1).join(' ')}
          </span>
        </td>

        <td className="px-6 py-4 whitespace-nowrap align-top">
          <span className="text-sm font-semibold text-slate-700 capitalize">
            {posted.split(' ')[0]}<br />{posted.split(' ').slice(1).join(' ')}
          </span>
        </td>

        <td className="px-6 py-4 whitespace-nowrap text-right align-top">
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); handleDownloadSingleJSON(post) }}
              className={cn("font-bold transition-all shadow-sm", isSelected ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-white border border-slate-200 hover:bg-slate-50 hover:border-blue-300 text-slate-600")}
              title="Download JSON"
            >
              Export JSON
            </Button>
            <Button
              size="sm"
              variant={isSelected ? "default" : "secondary"}
              className={cn("font-bold transition-all shadow-sm", isSelected ? "bg-blue-600 hover:bg-blue-700" : "bg-white border border-slate-200 hover:bg-slate-50 hover:border-blue-300 text-slate-600")}
            >
              {isSelected ? 'Reviewing...' : 'Review Case'}
            </Button>
          </div>
        </td>
      </tr>
    )
  }

  const listHiddenOnMobile = isMobile && selectedPost

  return (
    <div className="flex h-full relative bg-slate-50">

      <div className={cn(
        "flex-1 flex flex-col h-full overflow-hidden transition-all duration-300",
        listHiddenOnMobile && "hidden"
      )}>

        {/* Mobile compact toolbar */}
        <div className="lg:hidden shrink-0 px-3 py-2 border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-lg font-black text-slate-800 tabular-nums leading-none">
                {totalCount.toLocaleString()}
              </span>
              <span className="text-[10px] font-semibold text-slate-500">cases</span>
              {isPending && <Loader2 className="h-3 w-3 animate-spin text-blue-600 shrink-0" />}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileFiltersOpen(true)}
                className="h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 gap-1.5"
              >
                <Filter className="w-3.5 h-3.5" />
                Filters
                {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
              </Button>
              <ExportSelect {...exportSelectProps} className="w-[130px]" />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Showing {posts.length} on this page
          </p>
        </div>

        {/* Desktop filters */}
        <div className="hidden lg:block py-3 px-4 mb-1">
          <div className="space-y-2">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                  <Filter className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Filters</h3>
                <div className="flex items-center gap-3">
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                      <X className="h-3.5 w-3.5 mr-1.5" /> Reset
                    </Button>
                  )}
                  {isPending && (
                    <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 text-blue-600 rounded-md border border-blue-100 animate-pulse">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Updating...</span>
                    </div>
                  )}
                  <Badge variant="secondary" className="px-3 py-1 bg-slate-100 text-slate-600 border-slate-200">
                    {posts.length} of {totalCount.toLocaleString()} results
                  </Badge>
                </div>
              </div>
              <ExportSelect {...exportSelectProps} className="w-[150px]" />
            </div>
            <ReviewCasesFilterPanel {...filterPanelProps} layout="grid" />
          </div>
        </div>

        {/* Mobile card list */}
        <div className={cn("md:hidden flex-1 min-h-0 bg-white border-t border-slate-200 overflow-hidden flex flex-col transition-opacity", isPending && "opacity-60")}>
          <div className="overflow-y-auto flex-1">
            {isPending && posts.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-3 border-b border-slate-100 flex gap-3">
                  <Skeleton className="h-14 w-14 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))
            ) : posts.length === 0 ? (
              renderEmptyState()
            ) : (
              posts.map(renderMobileCard)
            )}
          </div>
        </div>

        {/* Desktop table */}
        <div className={cn("hidden md:flex flex-1 min-h-0 bg-white shadow-sm border border-slate-200 overflow-hidden transition-opacity flex-col", isPending && "opacity-60")}>
          <div className="overflow-auto flex-1">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Content</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Platform</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Sourcing Date</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Publish Date</th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {isPending && posts.length === 0 ? (
                  Array.from({ length: 10 }).map((_, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 max-w-lg align-top">
                        <div className="flex gap-4">
                          <Skeleton className="h-16 w-16 rounded-lg shrink-0" />
                          <div className="flex flex-col gap-2 w-full">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-full" />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><Skeleton className="h-6 w-24" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-6 w-28" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-6 w-28" /></td>
                      <td className="px-6 py-4 text-right"><Skeleton className="h-9 w-24 ml-auto" /></td>
                    </tr>
                  ))
                ) : posts.length === 0 ? (
                  <tr><td colSpan="5">{renderEmptyState()}</td></tr>
                ) : (
                  posts.map(renderTableRow)
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="shrink-0 border-t border-slate-200 bg-white">
            <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                Page <span className="text-slate-900">{currentPage}</span> of <span className="text-slate-900">{totalPages}</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-center">
                <Button variant="outline" size="sm" onClick={() => handlePageChange(1)} disabled={currentPage === 1} className="hidden sm:inline-flex h-8 sm:h-9 px-2 text-xs font-bold" title="First Page">&lt;&lt;</Button>
                <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="h-8 sm:h-9 px-2 sm:px-3 text-xs font-bold">
                  <ChevronLeft className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Previous</span>
                </Button>
                <div className="hidden sm:flex items-center gap-1 mx-1">
                  {(() => {
                    const pages = []
                    let start = Math.max(1, currentPage - 2)
                    let end = Math.min(totalPages, currentPage + 2)
                    if (currentPage <= 2) end = Math.min(totalPages, 5)
                    if (currentPage >= totalPages - 1) start = Math.max(1, totalPages - 4)
                    for (let i = start; i <= end; i++) pages.push(i)
                    return pages.map(pageNum => (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePageChange(pageNum)}
                        className={cn("h-9 w-9 p-0 text-xs font-bold", currentPage === pageNum ? "bg-slate-800 hover:bg-slate-900 text-white" : "border-slate-200 text-slate-600")}
                      >
                        {pageNum}
                      </Button>
                    ))
                  })()}
                </div>
                <span className="sm:hidden text-xs font-bold text-slate-600 px-1 tabular-nums">{currentPage}/{totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="h-8 sm:h-9 px-2 sm:px-3 text-xs font-bold">
                  <span className="hidden sm:inline">Next</span><ChevronRight className="w-4 h-4 sm:ml-1" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages} className="hidden sm:inline-flex h-9 px-2 text-xs font-bold" title="Last Page">&gt;&gt;</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <MobileReviewCasesFilterDrawer
        open={isMobileFiltersOpen}
        onOpenChange={setIsMobileFiltersOpen}
        totalCount={totalCount}
        isPending={isPending}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        filterPanelProps={filterPanelProps}
      />

      {/* Detail drawer backdrop — desktop only; mobile drawer is full-screen */}
      {selectedPost && !isMobile && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40" onClick={() => setSelectedPost(null)} />
      )}

      <div
        className={cn(
          "fixed inset-y-0 right-0 w-full max-w-[1200px] bg-white shadow-2xl transform transition-transform duration-300 ease-out border-l border-slate-200 z-50 flex flex-col",
          selectedPost ? "translate-x-0" : "translate-x-full"
        )}
      >
        {selectedPost && (
          <ReviewForm
            key={selectedPost._id}
            post={selectedPost}
            project={project}
            clientDetails={clientDetails}
            onClose={() => setSelectedPost(null)}
            onNavigate={navigatePost}
            hasPrev={posts.findIndex(p => p._id === selectedPost._id) > 0}
            hasNext={posts.findIndex(p => p._id === selectedPost._id) < posts.length - 1}
            setPosts={setPosts}
          />
        )}
      </div>
    </div>
  )
}
