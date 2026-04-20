'use client'

import * as React from "react"
import { useState, useEffect, useCallback, useRef, useTransition } from 'react'
import { format } from "date-fns"
import { submitCaseReview, getPosts, getAllPostsForExport } from './actions'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Skeleton } from "@/components/ui/skeleton"
import {
  Loader2, X, Filter, Download, ChevronLeft, ChevronRight,
  Search, Sparkles, Calendar, Database,
  Instagram, Facebook, Youtube,
  AlertCircle, Quote, Globe,
} from 'lucide-react'
import { Twitter, Reddit } from "@/utils/icons"

import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

import { DatePicker } from "@/components/ui/date-picker"

import ReviewForm from "./ReviewDetails"
import { DateFilterPopover } from "./DateFilterPopover"

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

  // UI States
  const [selectedPost, setSelectedPost] = useState(initialCase || null)
  const [posts, setPosts] = useState(initialPosts)
  const [isExporting, setIsExporting] = useState(false) // Renamed for clarity

  // useTransition gives us a loading state when Next.js is fetching new URL params!
  const [isPending, startTransition] = useTransition()
  const postRefs = useRef({})

  // Keep local posts in sync when the server sends new ones (filtering/pagination)
  useEffect(() => {
    setPosts(initialPosts)
  }, [initialPosts])

  // Navigation Logic for URL params
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

    // Wrap router.push in startTransition to trigger the isPending loading state
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
    setIsExporting(true)
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
            post._id,
            post.post_id,
            post.url,
            post.caption || '',
            post.platform,
            post.author_url,
            post.author_username,
            post.author_name,
            post.posted_at,
            post.likes,
            post.comments,
            post.views,
            post.shares,
            post.retweets,
            post.quotes,
            post.replies,
            post.review_details?.reasoning || ''
          ]
          // Sanitize each field: escape quotes, replace newlines, and wrap in double quotes
          return rowData
            .map(val => `"${String(val ?? '').replace(/"/g, '""').replace(/\n/g, ' ')}"`)
            .join(',')
        })
      ]

      const csvString = csvRows.join('\n')
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `cases_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Export Error:', error)
      alert('Failed to export CSV. Please try again.')
    } finally {
      setIsExporting(false)
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

  const getRiskLabel = (score) => {
    if (score > 95) return { label: 'High', color: 'text-rose-500 bg-rose-50 border-rose-200' }
    if (score > 75) return { label: 'Medium', color: 'text-orange-500 bg-orange-50 border-orange-200' }
    if (score > 40) return { label: 'Low', color: 'text-amber-500 bg-amber-50 border-amber-200' }
    return { label: 'Safe', color: 'text-slate-500 bg-slate-50 border-slate-200' }
  }

  // Fallback defaults for safety during destructing
  const currentFilters = initialFilters || {}

  return (
    <div className="flex h-full relative bg-slate-50">

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-8 py-6 transition-all duration-300">

        {/* Filters Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-8">
          <div className="space-y-6">

            {/* Header Row */}
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2.5">
                <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                  <Filter className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Filters</h3>

                {/* RESET, NUMBERS */}
                <div className="flex items-center gap-3">
                  {(currentFilters.status !== 'pending' ||
                    currentFilters.platform !== 'all' ||
                    currentFilters.aiAnalyzed ||
                    currentFilters.poiDetected ||
                    currentFilters.sourcingDateStart ||
                    currentFilters.sourcingDateEnd ||
                    currentFilters.postingDateStart ||
                    currentFilters.postingDateEnd) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="h-9 text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                      >
                        <X className="h-3.5 w-3.5 mr-1.5" />
                        Reset
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

                  {/* ITEMS VISIBLE ON THE PAGE ? */}
                  {/* <Badge variant="secondary" className="px-3 py-1 bg-slate-100 text-slate-600 border-slate-200">
                    {posts.length} Results Found
                  </Badge> */}
                </div>

              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={isExporting || posts.length === 0}
                  className="h-9 text-xs font-bold text-slate-600 hover:text-blue-600 border-slate-200 hover:bg-blue-50 transition-all"
                >
                  {isExporting ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-2" />}
                  Export CSV
                </Button>
              </div>
            </div>

            {/* <Separator className="bg-slate-100" /> */}

            {/* Controls Grid */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-5">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Status</Label>
                <Select
                  value={currentFilters.status || 'pending'}
                  onValueChange={(val) => handleFilterChange('status', val)}
                >
                  <SelectTrigger className="w-full bg-slate-50 border-slate-200 hover:border-slate-300 focus:ring-blue-500/20">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending Review</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="all">All Items</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Platform</Label>
                <Select
                  value={currentFilters.platform || 'all'}
                  onValueChange={(val) => handleFilterChange('platform', val)}
                >
                  <SelectTrigger className="w-full bg-slate-50 border-slate-200 hover:border-slate-300 focus:ring-blue-500/20">
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
              </div>
              {/* 
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Sourced After
                </Label>
                <DatePicker
                  date={currentFilters.sourcingDateStart ? new Date(currentFilters.sourcingDateStart) : undefined}
                  setDate={(date) => handleFilterChange('sourcingDateStart', date ? format(date, 'yyyy-MM-dd') : '')}
                  placeholder="Select Date"
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" /> Ingested After
                </Label>
                <DatePicker
                  date={currentFilters.dbDateStart ? new Date(currentFilters.dbDateStart) : undefined}
                  setDate={(date) => handleFilterChange('dbDateStart', date ? format(date, 'yyyy-MM-dd') : '')}
                  placeholder="Select Date"
                  className="w-full"
                />
              </div> */}

              {/* sourcing date  */}
              <div className="space-y-1.5 w-full min-w-32">
                <Label className="text-[10px] uppercase font-bold text-slate-400">Sourcing Date</Label>
                <DateFilterPopover
                  title="Sourcing Date"
                  initialFrom={currentFilters.sourcingDateStart}
                  initialTo={currentFilters.sourcingDateEnd}
                  onApply={(range) => updateQueryParams({
                    sourcingDateStart: range?.from ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
                    sourcingDateEnd: range?.to ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX") : null
                  })}
                />
              </div>

              {/* posting date  */}
              <div className="space-y-1.5 w-full min-w-32">
                <Label className="text-[10px] uppercase font-bold text-slate-400">Publish Date</Label>
                <DateFilterPopover
                  title="Publish Date"
                  initialFrom={currentFilters.postingDateStart}
                  initialTo={currentFilters.postingDateEnd}
                  onApply={(range) => updateQueryParams({
                    postingDateStart: range?.from ? format(range.from, "yyyy-MM-dd'T'HH:mm:ssXXX") : null,
                    postingDateEnd: range?.to ? format(range.to, "yyyy-MM-dd'T'HH:mm:ssXXX") : null
                  })}
                />
              </div>
              <div className="flex items-center space-x-2.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/50">
                <Checkbox
                  id="aiAnalyzed"
                  checked={currentFilters.aiAnalyzed === 'true' || currentFilters.aiAnalyzed === true}
                  onCheckedChange={(checked) => handleFilterChange('aiAnalyzed', checked.toString())}
                  className="border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                />
                <label
                  htmlFor="aiAnalyzed"
                  className="text-sm font-medium leading-none cursor-pointer text-slate-700 flex items-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                  AI Analyzed Only
                </label>
              </div>

              <div className="flex items-center space-x-2.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/50">
                <Checkbox
                  id="poiDetected"
                  checked={currentFilters.poiDetected !== 'false' && currentFilters.poiDetected !== false}
                  onCheckedChange={(checked) => handleFilterChange('poiDetected', checked.toString())}
                  className="border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                />
                <label
                  htmlFor="poiDetected"
                  className="text-sm font-medium leading-none cursor-pointer text-slate-700 flex items-center gap-2"
                >
                  <Search className="w-3.5 h-3.5 text-blue-500" />
                  POI Detected
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className={cn("bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-opacity", isPending && "opacity-60")}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/80">
                <tr>
                  {/* <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Risk Level</th> */}
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Content</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Platform</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Sourcing Date</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Publish Date</th>
                  {/* <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Threat Type</th> */}
                  <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {isPending && posts.length === 0 ? (
                  Array.from({ length: 10 }).map((_, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap align-top"><Skeleton className="h-6 w-20 rounded-md" /></td>
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
                      <td className="px-6 py-4 whitespace-nowrap align-top"><Skeleton className="h-6 w-24 rounded-md" /></td>
                      <td className="px-6 py-4 whitespace-nowrap align-top"><Skeleton className="h-6 w-28 rounded-md" /></td>
                      <td className="px-6 py-4 whitespace-nowrap text-right align-top"><Skeleton className="h-9 w-24 ml-auto rounded-md" /></td>
                    </tr>
                  ))
                ) : posts.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center">
                      <div className="mx-auto w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                        <Search className="w-6 h-6 text-slate-300" />
                      </div>
                      <p className="text-slate-500 font-medium">No posts found matching your filters.</p>
                      <button onClick={clearFilters} className="text-blue-600 hover:underline text-sm mt-2 font-medium">Clear all filters</button>
                    </td>
                  </tr>
                ) : (
                  posts.map((post) => {
                    const isSelected = selectedPost?._id === post._id
                    const riskScore = post.review_details?.threat_score || post.analysis_results?.risk_score || 0
                    const risk = getRiskLabel(riskScore)
                    const threatType = post.review_details?.threat_types?.join(', ').replace(/_/g, ' ') || post.review_details?.threat_type?.replace(/_/g, ' ') || post.analysis_results?.category || 'Unknown'

                    // Dates
                    const rawPostedDate = post.posted_date || post.metadata?.posted_date || post.timestamp || post.sourcing_date
                    const rawSourcedDate = post.metadata?.created_at || post.created_at
                    const posted_date = rawPostedDate ? format(new Date(rawPostedDate), "dd/MM/yyyy HH:mm a") : "N/A"
                    const sourced_date = rawSourcedDate ? format(new Date(rawSourcedDate), "dd/MM/yyyy HH:mm a") : "N/A"

                    return (
                      <tr
                        key={post._id}
                        ref={(el) => { postRefs.current[post._id] = el }}
                        className={cn(
                          "group transition-all cursor-pointer",
                          isSelected ? "bg-blue-50/60" : "hover:bg-slate-50"
                        )}
                        onClick={() => setSelectedPost(post)}
                      >
                        {/* Risk Level */}
                        {/* <td className="px-6 py-4 whitespace-nowrap align-top">
                          <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border", risk.color)}>
                            <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
                            {risk.label}
                          </span>
                        </td> */}

                        {/* Content */}
                        <td className="px-6 py-4 max-w-lg align-top">
                          <div className="flex gap-4">
                            <div className="shrink-0 relative">
                              {post.signedImageUrl ? (
                                <div className="h-16 w-16 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shadow-sm">
                                  <img
                                    src={post.signedImageUrl}
                                    alt="Post"
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                </div>
                              ) : (
                                <div className="h-16 w-16 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">
                                  <Quote className="h-6 w-6 text-slate-300" />
                                </div>
                              )}
                              {post.platform.toLowerCase() === 'instagram' && <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm"><Instagram className="w-4 h-4 text-pink-500 fill-pink-50" /></div>}
                              {post.platform.toLowerCase() === 'facebook' && <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm"><Facebook className="w-4 h-4 text-blue-600 fill-blue-50" /></div>}
                              {post.platform.toLowerCase() === 'x' && <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow-sm"> <span className="block size-4 text-black"><Twitter /></span> </div>}
                              {post.platform.toLowerCase() === 'reddit' && <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm"> <span className="block size-6 text-black"><Reddit /></span> </div>}
                              {post.platform.toLowerCase() === 'youtube' && <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm"><Youtube className="w-4 h-4 text-red-600 fill-red-50" /></div>}
                              {post.platform.toLowerCase() === 'website' && <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm"><Globe className="w-4 h-4 text-slate-500" /></div>}
                            </div>

                            <div className="flex flex-col gap-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 text-sm truncate max-w-[150px]">
                                  {post.user?.username || 'Unknown User'}
                                </span>
                                {post.visibility_status === 'down' ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-500 uppercase tracking-tighter shadow-sm">
                                    Taken Down
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-100 text-emerald-700 uppercase tracking-tighter shadow-sm">
                                    Online
                                  </span>
                                )}
                                <span className="text-xs text-slate-400">•</span>
                                <span className="text-xs text-slate-500">
                                  {post.taken_at ? format(new Date(post.taken_at * 1000), "dd/MM/yyyy") : 'N/A'}
                                </span>
                              </div>
                              <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                                {post.caption || <span className="italic text-slate-400">No caption available</span>}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Platform */}
                        <td className="px-6 py-4 whitespace-nowrap align-top">
                          <Badge variant="outline" className="capitalize font-semibold text-slate-600 border-slate-300">
                            {post.platform.toLowerCase() || 'Unknown'}
                          </Badge>
                        </td>

                        {/* Ingestion Date */}
                        <td className="px-6 py-4 whitespace-nowrap align-top">
                          <span className="text-sm font-semibold text-slate-700 capitalize">
                            {sourced_date.split(' ')[0]}
                            <br />
                            {sourced_date.split(' ').slice(1).join(' ')}
                          </span>
                        </td>

                        {/* Upload Date */}
                        <td className="px-6 py-4 whitespace-nowrap align-top">
                          <span className="text-sm font-semibold text-slate-700 capitalize">
                            {posted_date.split(' ')[0]}
                            <br />
                            {posted_date.split(' ').slice(1).join(' ')}
                          </span>
                        </td>

                        {/* Threat Type */}
                        {/* <td className="px-6 py-4 whitespace-nowrap align-top">
                          <span className="text-sm font-semibold text-slate-700 capitalize">
                            {threatType}
                          </span>
                        </td> */}

                        {/* Actions */}
                        <td className="px-6 py-4 whitespace-nowrap text-right align-top">
                          <Button
                            size="sm"
                            variant={isSelected ? "default" : "secondary"}
                            className={cn(
                              "font-bold transition-all shadow-sm",
                              isSelected ? "bg-blue-600 hover:bg-blue-700" : "bg-white border border-slate-200 hover:bg-slate-50 hover:border-blue-300 text-slate-600"
                            )}
                          >
                            {isSelected ? 'Reviewing...' : 'Review Case'}
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="pb-2 pt-4">
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
      </div>

      {/* Detail Panel Drawer */}
      {selectedPost && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40"
          onClick={() => setSelectedPost(null)}
        />
      )}

      <div
        className={cn(
          "fixed inset-y-0 right-0 w-[1200px] bg-white shadow-2xl transform transition-transform duration-300 ease-out border-l border-slate-200 z-50 flex flex-col",
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