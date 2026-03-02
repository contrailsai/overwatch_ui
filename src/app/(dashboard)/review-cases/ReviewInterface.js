'use client'

import * as React from "react"
import { useState, useMemo, useEffect, useCallback, useRef, useActionState } from 'react'
import { format } from "date-fns"
import { submitCaseReview, getPosts, getAllPostsForExport } from './actions'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Skeleton } from "@/components/ui/skeleton"
import {
  Loader2, X, Filter, Download, ChevronLeft, ChevronRight,
  Search, Sparkles, Calendar, Database,
  Instagram, Facebook, Youtube, AlertCircle, Quote,
  Globe
} from 'lucide-react'
import { Twitter } from "@/utils/icons"

import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

import { DatePicker } from "@/components/ui/date-picker"

import ReviewForm from "./ReviewDetails"

export function ReviewInterface({ initialPosts, totalPages: initialTotalPages, currentPage: initialCurrentPage, project, initialFilters }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [selectedPost, setSelectedPost] = useState(null)
  const [posts, setPosts] = useState(initialPosts)
  const [page, setPage] = useState(initialCurrentPage)
  const [loading, setLoading] = useState(false)
  // const [hasMore, setHasMore] = useState(initialCurrentPage < initialTotalPages) 

  // Sync with props when navigation occurs
  useEffect(() => {
    setPosts(initialPosts)
    setPage(initialCurrentPage)
    setFilters(initialFilters)
  }, [initialPosts, initialCurrentPage, initialFilters])

  // Filters State
  const [filters, setFilters] = useState(initialFilters || {
    platform: 'all',
    status: 'pending',
    sourcingDateStart: undefined,
    sourcingDateEnd: undefined,
    dbDateStart: undefined,
    dbDateEnd: undefined,
    aiAnalyzed: true,
    poiDetected: true
  })

  const postRefs = useRef({})

  // Navigation Logic for URL params
  const updateQueryParams = useCallback((newParams) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === 'all' || value === null || value === undefined || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })
    if (!newParams.page) {
      params.delete('page')
    }
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > initialTotalPages) return
    updateQueryParams({ page: newPage })
  }

  const handleFilterChange = (key, value) => {
    updateQueryParams({ [key]: value, page: 1 })
  }

  const handleExportCSV = async () => {
    setLoading(true)
    try {
      const { posts: allPosts } = await getAllPostsForExport(project.mongo_db_map, filters)

      if (!allPosts || allPosts.length === 0) {
        alert("No posts found to export.")
        return
      }

      const headers = [
        "MongoDB ID", "Post ID", "Original URL", "Caption", "Platform",
        "Author URL", "Author Username", "Author Full Name", "Timestamp",
        "Likes", "Comments", "Views", "Shares", "Retweets", "Quotes", "Replies"
      ]

      const csvRows = [
        headers.join(','),
        ...allPosts.map(post => {
          const row = [
            `"${post._id}"`, `"${post.post_id}"`, `"${post.url}"`,
            `"${(post.caption || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
            `"${post.platform}"`, `"${post.author_url}"`, `"${post.author_username}"`,
            `"${post.author_name}"`, `"${post.posted_at}"`,
            post.likes, post.comments, post.views, post.shares, post.retweets, post.quotes, post.replies
          ]
          return row.join(',')
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
      setLoading(false)
    }
  }

  const clearFilters = () => {
    router.push(pathname)
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
    if (score >= 96) return { label: 'High', color: 'text-rose-500 bg-rose-50 border-rose-200' };
    if (score >= 76) return { label: 'Medium', color: 'text-orange-500 bg-orange-50 border-orange-200' };
    if (score >= 41) return { label: 'Low', color: 'text-amber-500 bg-amber-50 border-amber-200' };
    return { label: 'Safe', color: 'text-slate-500 bg-slate-50 border-slate-200' };
  }

  // const getPostLink = (post) => {
  //   const id = post.post_id || post.code
  //   if (post.platform === 'instagram') return `https://www.instagram.com/p/${id}/`
  //   if (post.platform === 'facebook') return `https://www.facebook.com/${id}`
  //   if (post.platform === 'x') return `https://twitter.com/${post.user?.username}/status/${id}`
  //   return '#'
  // }

  return (
    <div className="flex h-full relative bg-slate-50">

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-8 py-6 transition-all duration-300">

        {/* Filters Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-8">
          <div className="space-y-6">

            {/* Header Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                  <Filter className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Filters</h3>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={loading || posts.length === 0}
                  className="h-9 text-xs font-bold text-slate-600 hover:text-blue-600 border-slate-200 hover:bg-blue-50 transition-all"
                >
                  <Download className="h-3.5 w-3.5 mr-2" />
                  Export CSV
                </Button>

                {(filters.status !== 'pending' || filters.platform !== 'all' || !filters.aiAnalyzed || filters.poiDetected || filters.sourcingDate || filters.dbDate) && (
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
              </div>
            </div>

            <Separator className="bg-slate-100" />

            {/* Controls Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Status</Label>
                <Select
                  value={filters.status}
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
                  value={filters.platform}
                  onValueChange={(val) => handleFilterChange('platform', val)}
                >
                  <SelectTrigger className="w-full bg-slate-50 border-slate-200 hover:border-slate-300 focus:ring-blue-500/20">
                    <SelectValue placeholder="All Platforms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="x">X (Twitter)</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="website">Websites</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Sourced After
                </Label>
                <DatePicker
                  date={filters.sourcingDateStart ? new Date(filters.sourcingDateStart) : undefined}
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
                  date={filters.dbDateStart ? new Date(filters.dbDateStart) : undefined}
                  setDate={(date) => handleFilterChange('dbDateStart', date ? format(date, 'yyyy-MM-dd') : '')}
                  placeholder="Select Date"
                  className="w-full"
                />
              </div>
            </div>

            {/* Toggles & Count */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-6">
                <div className="flex items-center space-x-2.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/50">
                  <Checkbox
                    id="aiAnalyzed"
                    checked={filters.aiAnalyzed !== false}
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
                    checked={filters.poiDetected !== false}
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

              <div className="flex items-center gap-3">
                {loading && (
                  <div className="flex items-center gap-2 text-blue-600 text-xs font-medium animate-pulse">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Refreshing...
                  </div>
                )}
                <Badge variant="secondary" className="px-3 py-1 bg-slate-100 text-slate-600 border-slate-200">
                  {posts.length} Results Found
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/80">
                <tr>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Risk Level</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Content</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Platform</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Threat Type</th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {loading && posts.length === 0 ? (
                  Array.from({ length: 10 }).map((_, index) => (
                    <tr key={index}>
                      {/* Risk Level */}
                      <td className="px-6 py-4 whitespace-nowrap align-top">
                        <Skeleton className="h-6 w-20 rounded-md" />
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
                        <Skeleton className="h-6 w-24 rounded-md" />
                      </td>
                      {/* Threat Type */}
                      <td className="px-6 py-4 whitespace-nowrap align-top">
                        <Skeleton className="h-6 w-28 rounded-md" />
                      </td>
                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-right align-top">
                        <Skeleton className="h-9 w-24 ml-auto rounded-md" />
                      </td>
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
                  posts.map((post, index) => {
                    const isSelected = selectedPost?._id === post._id
                    const riskScore = post.review_details?.threat_score || post.analysis_results?.risk_score || 0;
                    const risk = getRiskLabel(riskScore);
                    const threatType = post.review_details?.threat_types?.join(', ').replace(/_/g, ' ') || post.review_details?.threat_type?.replace(/_/g, ' ') || post.analysis_results?.category || 'Unknown';

                    return (
                      <tr
                        key={post._id}
                        ref={(el) => {
                          postRefs.current[post._id] = el
                        }}
                        className={cn(
                          "group transition-all cursor-pointer",
                          isSelected ? "bg-blue-50/60" : "hover:bg-slate-50"
                        )}
                        onClick={() => setSelectedPost(post)}
                      >
                        {/* Risk Level */}
                        <td className="px-6 py-4 whitespace-nowrap align-top">
                          <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border", risk.color)}>
                            <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
                            {risk.label}
                          </span>
                        </td>

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
                              {post.platform.toLowerCase() === 'x' && <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm"> <span className="inline-block size-4 text-black">
                                <Twitter />
                              </span> </div>}
                              {post.platform.toLowerCase() === 'youtube' && <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm"><Youtube className="w-4 h-4 text-red-600 fill-red-50" /></div>}
                              {post.platform.toLowerCase() === 'website' && <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm"><Globe className="w-4 h-4 text-slate-500" /></div>}
                            </div>

                            <div className="flex flex-col gap-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 text-sm truncate max-w-[150px]">
                                  {post.user?.username || 'Unknown User'}
                                </span>
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

                        {/* Threat Type */}
                        <td className="px-6 py-4 whitespace-nowrap align-top">
                          <span className="text-sm font-semibold text-slate-700 capitalize">
                            {threatType}
                          </span>
                        </td>

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
        {initialTotalPages > 1 && (
          <div className="pt-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Page <span className="text-slate-900">{page}</span> of <span className="text-slate-900">{initialTotalPages}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1}
                  className="h-9 px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === initialTotalPages}
                  className="h-9 px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                >
                  Next <ChevronRight className="w-4 h-4 ml-1" />
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
          "fixed inset-y-0 right-0 w-[1150px] bg-white shadow-2xl transform transition-transform duration-300 ease-out border-l border-slate-200 z-50 flex flex-col",
          selectedPost ? "translate-x-0" : "translate-x-full"
        )}
      >
        {selectedPost && (
          <ReviewForm
            key={selectedPost._id}
            post={selectedPost}
            project_details={project.project_details}
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


