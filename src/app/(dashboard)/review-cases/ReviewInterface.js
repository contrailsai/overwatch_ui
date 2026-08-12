'use client'

import { handleDownloadJSON,formatExportData } from '@/utils/exportJson'
import * as React from "react"
import { useState, useEffect, useCallback, useRef, useTransition, useMemo } from 'react'
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
import { isTypingTarget } from './keyboard-utils'
import { warmTopicCacheForPosts, prefetchTopicsForPosts } from './topic-cache'

function parseReviewFiltersFromSearchParams(searchParams) {
  const aiAnalyzedRaw = searchParams.get('aiAnalyzed')
  let aiAnalyzed = 'all'
  if (aiAnalyzedRaw === 'analyzed' || aiAnalyzedRaw === 'true') aiAnalyzed = 'analyzed'
  else if (aiAnalyzedRaw === 'not_analyzed') aiAnalyzed = 'not_analyzed'

  return {
    platform: searchParams.get('platform') || 'all',
    status: searchParams.get('status') || 'pending',
    aiAnalyzed,
    poiDetected: searchParams.get('poiDetected') === 'true',
    visibility_status: searchParams.get('visibility_status') || 'all',
    aiRisk: searchParams.get('aiRisk') || 'all',
    sourcingDateStart: searchParams.get('sourcingDateStart') || undefined,
    sourcingDateEnd: searchParams.get('sourcingDateEnd') || undefined,
    postingDateStart: searchParams.get('postingDateStart') || undefined,
    postingDateEnd: searchParams.get('postingDateEnd') || undefined,
  }
}

function PostPlatformBadge({ platform, size = 'md' }) {
  const p = platform?.toLowerCase() || ''
  const iconClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  const wrapClass = size === 'sm' ? 'p-0.5' : 'p-0.5'

  if (p === 'instagram') return <div className={cn('bg-white rounded-full shadow-sm', wrapClass)}><Instagram className={cn(iconClass, 'text-pink-500 fill-pink-50')} /></div>
  if (p === 'facebook') return <div className={cn('bg-white rounded-full shadow-sm', wrapClass)}><Facebook className={cn(iconClass, 'text-blue-600 fill-blue-50')} /></div>
  if (p === 'x') return <div className={cn('bg-white rounded-full shadow-sm', size === 'sm' ? 'p-0.5' : 'p-1')}><span className={cn('block text-black', size === 'sm' ? 'size-3.5' : 'size-4')}><Twitter /></span></div>
  if (p === 'reddit') return <div className={cn('bg-white rounded-full shadow-sm', wrapClass)}><span className={cn('block', size === 'sm' ? 'size-4' : 'size-6')}><Reddit className="size-full" /></span></div>
  if (p === 'youtube') return <div className={cn('bg-white rounded-full shadow-sm', wrapClass)}><Youtube className={cn(iconClass, 'text-red-600 fill-red-50')} /></div>
  if (p === 'website') return <div className={cn('bg-white rounded-full shadow-sm', wrapClass)}><Globe className={cn(iconClass, 'text-slate-500')} /></div>
  return null
}

function getPostDates(post) {
  const rawPostedDate = post.posted_date || post.metadata?.posted_date || post.timestamp || post.sourcing_date
  // Must match sourcing date filter field: list.sourced_at → sourcing_date (not system.created_at)
  const rawSourcedDate =
    post.sourcing_date ||
    post.list?.sourced_at ||
    post.metadata?.sourcing_date ||
    post.metadata?.created_at ||
    post.created_at
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

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value == null) continue
    if (typeof value === 'string' && value.trim() === '') continue
    return value
  }
  return ''
}

function stringifyCsvScalar(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function getFuzzyResultOriginFields(resultOrigin) {
  const origin = resultOrigin && typeof resultOrigin === 'object' ? resultOrigin : {}
  const typeRaw = String(origin.type || '').toLowerCase()

  let searchType = 'manual_or_unknown'
  if (typeRaw.includes('web_search')) {
    searchType = 'web_search'
  } else if (typeRaw.includes('profile') || typeRaw.includes('screenshot')) {
    searchType = 'profile_search'
  } else if (typeRaw.includes('search')) {
    searchType = 'platform_search'
  } else if (origin.search_phrase || origin.query || origin.keyword || origin.mode || origin.search_tab || origin.facebook_search_tab || origin.x_search_tab || origin.instagram_search_mode) {
    searchType = 'platform_search'
  } else if (origin.profile_url || origin.username) {
    searchType = 'profile_search'
  }

  const keyword = firstNonEmpty(origin.keyword, origin.actual_keyword, origin.query)
  const query = firstNonEmpty(origin.query, origin.search_phrase)
  const searchPhrase = firstNonEmpty(origin.search_phrase, origin.query, origin.keyword)
  const profileUrl = firstNonEmpty(origin.profile_url)
  const sourceUrl = firstNonEmpty(origin.source_url, origin.source, origin.url)
  const searchUrl = firstNonEmpty(origin.search_url)
  const siteKey = firstNonEmpty(origin.site_key)
  const modeOrTab = firstNonEmpty(
    origin.mode,
    origin.search_tab,
    origin.facebook_search_tab,
    origin.x_search_tab,
    origin.instagram_search_mode,
    origin.tab,
  )
  const engines = firstNonEmpty(origin.searxng_engines, origin.search_engines, origin.engines)
  const searchInput = firstNonEmpty(keyword, query, searchPhrase, profileUrl, sourceUrl, searchUrl)

  return {
    searchType,
    searchInput,
    typeRaw,
    keyword,
    query,
    searchPhrase,
    profileUrl,
    sourceUrl,
    searchUrl,
    siteKey,
    modeOrTab,
    engines,
  }
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
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('semantic_search') || '')

  const [isPending, startTransition] = useTransition()
  const postRefs = useRef({})

  useEffect(() => {
    setPosts(initialPosts)
  }, [initialPosts])

  useEffect(() => {
    void warmTopicCacheForPosts(posts.map((p) => p._id))
  }, [posts])

  useEffect(() => {
    setSearchTerm(searchParams.get('semantic_search') || '')
  }, [searchParams])

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

  const handleSearchApply = useCallback(() => {
    const val = searchTerm.trim()
    if (val) {
      updateQueryParams({ semantic_search: val, page: 1 })
    } else {
      updateQueryParams({ semantic_search: null, page: 1 })
    }
  }, [searchTerm, updateQueryParams])

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
      const { posts: allPosts } = await getAllPostsForExport(project.mongo_db_map, currentFilters)

      if (!allPosts || allPosts.length === 0) {
        alert("No posts found to export.")
        return
      }

      const headers = [
        "Case ID", "Post ID", "Original URL", "Caption", "Platform",
        "Author URL", "Author Username", "Author Full Name", "Publishing Date",
        "Likes", "Comments", "Views", "Shares", "Retweets", "Quotes", "Replies",
        "result_origin_search_type", "result_origin_search_input", "result_origin_type_raw",
        // "result_origin_keyword", "result_origin_query", "result_origin_search_phrase",
        // "result_origin_profile_url", "result_origin_source_url", "result_origin_search_url",
        // "result_origin_site_key", "result_origin_mode_or_tab", "result_origin_engines",
        "reviewer-reasoning",
        "simple-report-description"
      ]

      const csvRows = [
        headers.join(','),
        ...allPosts.map(post => {
          const fuzzyOrigin = getFuzzyResultOriginFields(post.result_origin)
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
            fuzzyOrigin.searchType,
            stringifyCsvScalar(fuzzyOrigin.searchInput),
            fuzzyOrigin.typeRaw,
            // stringifyCsvScalar(fuzzyOrigin.keyword),
            // stringifyCsvScalar(fuzzyOrigin.query),
            // stringifyCsvScalar(fuzzyOrigin.searchPhrase),
            // stringifyCsvScalar(fuzzyOrigin.profileUrl),
            // stringifyCsvScalar(fuzzyOrigin.sourceUrl),
            // stringifyCsvScalar(fuzzyOrigin.searchUrl),
            // stringifyCsvScalar(fuzzyOrigin.siteKey),
            // stringifyCsvScalar(fuzzyOrigin.modeOrTab),
            // stringifyCsvScalar(fuzzyOrigin.engines),
            post.review_details?.reasoning || '',
            post.review_details?.simple_report_description || ''
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
      const { posts: allPosts } = await getAllPostsForExport(project.mongo_db_map, currentFilters)

      if (!allPosts || allPosts.length === 0) {
        alert("No posts found to export.")
        return
      }

      const exportData = allPosts.map(formatExportData)

      const jsonString = JSON.stringify(exportData, null, 2)
      
      const blob = new Blob([jsonString], { type: 'application/json' })
      downloadBlob(blob, `cases_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`)
    } catch (error) {
      console.error('Export Error:', error)
      alert('Failed to export JSON. Please try again.')
    } finally {
      setExportingType(null)
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

      const neighborIds = [
        posts[nextIndex - 1]?._id,
        posts[nextIndex + 1]?._id,
      ].filter(Boolean)
      prefetchTopicsForPosts(neighborIds)

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
      if (isTypingTarget(e.target)) return

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

  const currentFilters = useMemo(
    () => parseReviewFiltersFromSearchParams(searchParams),
    [searchParams]
  )

  const hasFilterBesidesSearch =
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

  const activeSearch = searchParams.get('semantic_search')?.trim() || ''

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
    currentFilters.postingDateEnd ||
    !!activeSearch

  const filterPanelProps = {
    currentFilters,
    handleFilterChange,
    updateQueryParams,
    searchTerm,
    onSearchTermChange: setSearchTerm,
    onSearchApply: handleSearchApply,
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
      <p className="text-slate-500 font-medium">
        {activeSearch ? 'No posts found for this search.' : 'No posts found matching your filters.'}
      </p>
      {activeSearch && hasFilterBesidesSearch && (
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          Search runs within your current filters. Try Status → All Items if the post may already be reviewed.
        </p>
      )}
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
                  onClick={(e) => { e.stopPropagation(); handleDownloadJSON(post) }}
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
              onClick={(e) => { e.stopPropagation(); handleDownloadJSON(post) }}
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
            {activeSearch
              ? `${posts.length} search result${posts.length === 1 ? '' : 's'}`
              : `Showing ${posts.length} on this page`}
          </p>
        </div>

        {/* Desktop filters */}
        <div className="hidden lg:block shrink-0 border-b border-slate-200 bg-white px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 mb-1.5">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <Filter className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filters</span>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-7 px-2 text-[10px] font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <X className="h-3 w-3 mr-1" /> Reset
                </Button>
              )}
              {isPending && (
                <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-100">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Updating</span>
                </div>
              )}
              {activeSearch && (
                <Badge variant="outline" className="h-6 px-2 text-[10px] font-semibold bg-purple-50 text-purple-700 border-purple-200 gap-1">
                  <Search className="w-3 h-3" />
                  <span className="truncate max-w-[140px]">{activeSearch}</span>
                </Badge>
              )}
              <Badge variant="secondary" className="h-6 px-2 text-[10px] font-semibold bg-slate-100 text-slate-600 border-slate-200">
                {activeSearch ? `${posts.length} results` : `${posts.length} of ${totalCount.toLocaleString()}`}
              </Badge>
            </div>
            <ExportSelect {...exportSelectProps} className="w-[140px] shrink-0" />
          </div>
          <ReviewCasesFilterPanel {...filterPanelProps} layout="row" />
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
