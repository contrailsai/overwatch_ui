'use client'

import * as React from "react"
import { useState, useMemo, useEffect, useCallback, useRef, useActionState } from 'react'
import { format } from "date-fns"
import { submitCaseReview, getPosts, getAllPostsForExport } from './actions'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Skeleton } from "@/components/ui/skeleton"
import {
  Loader2, X, CheckCircle, AlertTriangle, ExternalLink,
  Filter, Download, ChevronLeft, ChevronRight,
  Search, Sparkles, Calendar, Database, Plus,
  Instagram, Facebook, Twitter, Youtube, Heart, MessageCircle, AlertCircle, Quote,
  Image as ImageIcon, ShieldAlert, BadgeCheck, Eye, History
} from 'lucide-react'
import ProfilePic from '@/components/ProfilePic'

import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

import { DatePicker } from "@/components/ui/date-picker"

const initialState = {
  success: false,
  error: null,
}

export function ReviewInterface({ initialPosts, totalPages: initialTotalPages, currentPage: initialCurrentPage, projectName, initialFilters }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [selectedPost, setSelectedPost] = useState(null)
  const [posts, setPosts] = useState(initialPosts)
  const [page, setPage] = useState(initialCurrentPage)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialCurrentPage < initialTotalPages)

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
      const { posts: allPosts } = await getAllPostsForExport(projectName, filters)

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

  const getPostLink = (post) => {
    const id = post.post_id || post.code
    if (post.platform === 'instagram') return `https://www.instagram.com/p/${id}/`
    if (post.platform === 'facebook') return `https://www.facebook.com/${id}`
    if (post.platform === 'x') return `https://twitter.com/${post.user?.username}/status/${id}`
    return '#'
  }

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
                              {post.platform === 'instagram' && <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm"><Instagram className="w-4 h-4 text-pink-500 fill-pink-50" /></div>}
                              {post.platform === 'facebook' && <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm"><Facebook className="w-4 h-4 text-blue-600 fill-blue-50" /></div>}
                              {post.platform === 'x' && <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm"><Twitter className="w-4 h-4 text-slate-900 fill-slate-50" /></div>}
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
                            {post.platform || 'Unknown'}
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
          "fixed inset-y-0 right-0 w-[1100px] bg-white shadow-2xl transform transition-transform duration-300 ease-out border-l border-slate-200 z-50 flex flex-col",
          selectedPost ? "translate-x-0" : "translate-x-full"
        )}
      >
        {selectedPost && (
          <ReviewForm
            key={selectedPost._id}
            post={selectedPost}
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

function ReviewForm({ post, onClose, onNavigate, hasPrev, hasNext, setPosts }) {
  console.log(post)
  const [state, formAction, isPending] = useActionState(submitCaseReview, initialState)

  // Update local state when submission succeeds
  useEffect(() => {
    if (state?.success && state?.updatedFields && setPosts) {
      setPosts(prevPosts => prevPosts.map(p =>
        p._id === post._id
          ? { ...p, ...state.updatedFields }
          : p
      ))
    }
  }, [state, post._id, setPosts])

  // Initial Values
  const review = post.review_details || {}
  const analysis = post.analysis_results || {}
  const analysisPoi = analysis.poi_check || {}
  const hasReview = review && Object.keys(review).length > 0

  const savedFace = hasReview ? (review.face_present === true) : (analysisPoi.face_present === true)
  const savedName = hasReview ? (review.name_present === true) : (analysisPoi.poi_name_found === true)
  const savedPoiNames = (hasReview && review.poi_names) ? review.poi_names : (analysisPoi.poi_names || [])
  const savedScore = review.threat_score ?? analysis.risk_score ?? 0

  let savedTypes = review.threat_types || []
  if (!hasReview && savedTypes.length === 0 && analysis) {
    const aiCategory = (analysis.category || '').toLowerCase()
    // Simple heuristic fallback if empty
    if (analysis.threat_category) savedTypes.push(analysis.threat_category)
    if (savedTypes.length === 0 && savedScore > 50) savedTypes.push('other')
  }

  const savedTakedown = post.takedown_info?.takedown_status === "requested"

  const [facePresent, setFacePresent] = useState(savedFace)
  const [namePresent, setNamePresent] = useState(savedName)
  const [poiNames, setPoiNames] = useState(savedPoiNames)
  const [newPoiInput, setNewPoiInput] = useState('')
  const [threatScore, setThreatScore] = useState(savedScore)
  const [threatTypes, setThreatTypes] = useState(savedTypes)
  const [suggestTakedown, setSuggestTakedown] = useState(savedTakedown)

  const poiPresent = facePresent || namePresent
  const defaultComments = review.reviewer_comments || '';

  const full_analysis_reasonning = `REASONING: ${analysis?.reasoning || ""} ${analysis?.categorization_reason || ""}
  ${analysis?.threat_category ? "\nCategory: " + analysis.threat_category : ""}
  ${analysis?.nsfw_check?.reasoning ? "\nNSFW: " + analysis.nsfw_check.reasoning : ""}
  ${analysis?.hate_speech_check?.reasoning ? "\nHate Speech: " + analysis.hate_speech_check.reasoning : ""}
  `.trim();

  const handleAddPoi = () => {
    if (newPoiInput.trim()) {
      if (!(poiNames.map(name => name.toLowerCase())).includes(newPoiInput.trim().toLowerCase())) {
        setPoiNames([...poiNames, newPoiInput.trim()])
      }
      setNewPoiInput('')
    }
  }

  const handleRemovePoi = (index) => {
    setPoiNames(poiNames.filter((_, i) => i !== index))
  }

  const toggleThreatType = (type) => {
    setThreatTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Panel Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Review Case</h2>
          {hasReview && (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 pl-2">
              <CheckCircle className="w-3.5 h-3.5" />
              Reviewed
            </Badge>
          )}
          <div className="h-4 w-px bg-slate-200 mx-2" />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => onNavigate('prev')} disabled={!hasPrev} className="h-8 w-8 text-slate-500 hover:text-blue-600">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-1">Nav</span>
            <Button variant="ghost" size="icon" onClick={() => onNavigate('next')} disabled={!hasNext} className="h-8 w-8 text-slate-500 hover:text-blue-600">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-slate-100 text-slate-500">
          <X className="h-6 w-6" />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden flex divide-x divide-slate-100">

        {/* LEFT COLUMN: Evidence & Context */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50">
          <div className="p-8 space-y-8">

            {/* User Card */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
              <ProfilePic user={post.user?.username || 'Unknown'} size={48} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <div className="">
                      {
                        post.platform === "twitter" ? (
                          <Twitter className="w-6 h-6 text-blue-500" />
                        ) : post.platform === "instagram" ? (
                          <Instagram className="w-6 h-6 text-pink-500" />
                        ) : post.platform === "facebook" ? (
                          <Facebook className="w-6 h-6 text-blue-500" />
                        ) : post.platform === "youtube" ? (
                          <Youtube className="w-6 h-6 text-red-500 fill-red-500 stroke-white stroke-[1px]" />
                        ) : (
                          <p className="text-slate-500 font-medium truncate">{post.platform}</p>
                        )
                      }
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 truncate">{post.user?.username}</h3>

                  </div>
                  {post.user?.is_verified && <BadgeCheck className="w-5 h-5 text-blue-500" />}
                </div>
                <p className="text-sm text-slate-500">{post.user?.full_name}</p>
              </div>
              <a
                href={post.original_url || '#'}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors"
              >
                Original Post <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Media Viewer */}
            <div className="rounded-2xl overflow-hidden bg-slate-900 shadow-lg border border-slate-800 flex items-center justify-center min-h-[400px] relative group">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800/50 to-slate-950 pointer-events-none" />
              {post.signedImageUrl ? (
                <img
                  src={post.signedImageUrl}
                  alt="Evidence"
                  className="max-w-full h-auto max-h-[600px] object-contain relative z-10"
                />
              ) : (
                <div className="text-center p-12 relative z-10">
                  <Quote className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No media content available</p>
                </div>
              )}
              {/* Platform Tag Overlay */}
              <div className="absolute top-4 right-4 z-20">
                <Badge className="bg-black/50 backdrop-blur-md border-white/10 text-white hover:bg-black/60 capitalize">
                  {post.platform}
                </Badge>
              </div>
            </div>

            {/* Caption & Metadata */}
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <MessageCircle className="w-3.5 h-3.5" /> Post Caption
                </h4>
                <div className="text-slate-800 leading-relaxed whitespace-pre-wrap font-medium text-base font-sans">
                  {post.caption || <span className="text-slate-400 italic">No caption provided.</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase">Likes</span>
                  <span className="font-bold text-lg text-slate-900">{post.stats?.like_count?.toLocaleString() || 0}</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase">Comments</span>
                  <span className="font-bold text-lg text-slate-900">{post.stats?.comment_count?.toLocaleString() || 0}</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between col-span-2">
                  {/* <div className="flex gap-6"> */}
                  <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" /> Posted: <span className="font-mono text-slate-700">{post.metadata?.sourcing_date ? format(new Date(post.metadata.sourcing_date), "dd/MM/yyyy") : 'N/A'}</span>
                  </span>
                  <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <History className="w-3.5 h-3.5" /> Sourced: <span className="font-mono text-slate-700">{post.metadata?.created_at ? format(new Date(post.metadata.created_at), "dd/MM/yyyy") : 'N/A'}</span>
                  </span>
                  {/* </div> */}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* RIGHT COLUMN: Action Form */}
        <div className="w-[500px] shrink-0 overflow-y-auto bg-white">
          <form action={formAction} className="flex flex-col min-h-full">
            {/* Hidden Inputs */}
            <input type="hidden" name="mongo_id" value={post._id || ''} />
            <input type="hidden" name="platform" value={post.platform || 'Instagram'} />
            <input type="hidden" name="poi_names" value={poiNames.join(',')} />
            <input type="hidden" name="poi_present" value={poiPresent.toString()} />
            <input type="hidden" name="poi_confirmed" value={poiPresent ? 'on' : 'off'} />
            <input type="hidden" name="is_fake_news" value={threatTypes.includes('fake_news') ? 'on' : 'off'} />
            <input type="hidden" name="is_aigc" value={threatTypes.includes('aigc') ? 'on' : 'off'} />
            <input type="hidden" name="is_nsfw" value={threatTypes.includes('nsfw') ? 'on' : 'off'} />
            <input type="hidden" name="is_hate_speech" value={threatTypes.includes('hate_speech') ? 'on' : 'off'} />
            <input type="hidden" name="is_fraud" value={threatTypes.includes('fraud') ? 'on' : 'off'} />
            <input type="hidden" name="is_humor" value={threatTypes.includes('humor') ? 'on' : 'off'} />
            <input type="hidden" name="is_asset_misuse" value={threatTypes.includes('asset_misuse') ? 'on' : 'off'} />
            <input type="hidden" name="face_present" value={facePresent.toString()} />
            <input type="hidden" name="name_present" value={namePresent.toString()} />
            <input type="hidden" name="threat_score" value={threatScore} />
            <input type="hidden" name="takedown_status" value={post.takedown_info?.takedown_status || 'None'} />

            <div className="p-6 space-y-8 flex-1">

              {/* 1. POI Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">1</span>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">POI Identification</h3>
                </div>

                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-slate-700">Face Detected</Label>
                    <Switch checked={facePresent} onCheckedChange={setFacePresent} />
                  </div>
                  <Separator className="bg-slate-200" />
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-slate-700">Name Mentioned</Label>
                    <Switch checked={namePresent} onCheckedChange={setNamePresent} />
                  </div>

                  <div className="pt-2 space-y-3">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Tagged Subjects</Label>
                    <div className="flex flex-wrap gap-2">
                      {poiNames.map((name, index) => (
                        <Badge key={index} variant="secondary" className="pl-2.5 pr-1 py-1 h-7 bg-white border border-blue-200 text-blue-700 shadow-sm flex items-center gap-1">
                          {name}
                          <button type="button" onClick={() => handleRemovePoi(index)} className="hover:bg-red-50 hover:text-red-600 rounded-full p-0.5 transition-colors"><X className="w-3 h-3" /></button>
                        </Badge>
                      ))}
                      {poiNames.length === 0 && <span className="text-xs text-slate-400 italic py-1">No tags added</span>}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newPoiInput}
                        onChange={(e) => setNewPoiInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPoi())}
                        placeholder="Add name..."
                        className="h-9 bg-white text-sm"
                      />
                      <Button type="button" onClick={handleAddPoi} size="sm" className="h-9 px-3 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"><Plus className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </div>
              </section>

              {/* 2. Threat Analysis */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">2</span>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Threat Classification</h3>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'aigc', label: 'AI Generated' },
                    { id: 'nsfw', label: 'NSFW Content' },
                    { id: 'hate_speech', label: 'Hate Speech' },
                    { id: 'fraud', label: 'Fraud / Scam' },
                    { id: 'fake_news', label: 'Misinformation' },
                    { id: 'humor', label: 'Satire' },
                    { id: 'asset_misuse', label: 'Asset Misuse' }
                  ].map((item) => (
                    <div
                      key={item.id}
                      onClick={() => toggleThreatType(item.id)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm",
                        threatTypes.includes(item.id)
                          ? "bg-blue-50 border-blue-200 ring-1 ring-blue-200"
                          : "bg-white border-slate-200 hover:border-blue-200"
                      )}
                    >
                      <Checkbox
                        checked={threatTypes.includes(item.id)}
                        onCheckedChange={() => { }}
                        className="border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                      />
                      <span className={cn("text-xs font-bold uppercase", threatTypes.includes(item.id) ? "text-blue-700" : "text-slate-600")}>{item.label}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 pt-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Analysis Notes</Label>
                  <Textarea
                    name="reasoning"
                    defaultValue={full_analysis_reasonning}
                    placeholder="Detailed analysis..."
                    className="min-h-[250px] bg-slate-50 border-slate-200 text-sm focus:bg-white transition-colors"
                  />
                </div>
              </section>

              {/* 3. Verdict */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">3</span>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Verdict & Action</h3>
                </div>

                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-6">
                  {/* RISK LEVEL */}
                  <div className="space-y-3">
                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Risk Level Selection</Label>
                    <div className="flex gap-2">
                      {[
                        { label: "Safe", val: 0, active: threatScore < 41, color: "bg-emerald-500 border-emerald-600 shadow-emerald-200" },
                        { label: "Low Risk", val: 41, active: threatScore > 40 && threatScore < 76, color: "bg-amber-400 border-amber-500 shadow-amber-200" },
                        { label: "Medium Risk", val: 76, active: threatScore > 75 && threatScore < 96, color: "bg-orange-400 border-orange-500 shadow-orange-200" },
                        { label: "High Risk", val: 96, active: threatScore > 95, color: "bg-rose-500 border-rose-600 shadow-rose-200" },
                      ].map((level) => (
                        <button
                          key={level.label}
                          type="button"
                          onClick={() => setThreatScore(level.val)}
                          className={cn(
                            "flex-1 py-2 px-3 rounded-lg border cursor-pointer text-xs font-bold transition-all",
                            level.active
                              ? `${level.color} text-white border-b-0`
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          {level.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* REVIEWER's MESSAGE */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Client Notes</Label>
                    <Textarea
                      name="reviewer_comments"
                      defaultValue={defaultComments}
                      placeholder="Add context for the client..."
                      className="h-20 bg-white border-slate-200 text-sm focus:border-blue-500"
                    />
                  </div>

                  {/* NO TAKEDOWN REQUESTS FOR NOW */}

                  {/* <div className={cn(
                    "flex items-start gap-3 p-4 rounded-lg border transition-all",
                    suggestTakedown ? "bg-rose-50 border-rose-200" : "bg-white border-slate-200"
                  )}>
                    <Checkbox
                      id="takedown"
                      name="suggest_takedown"
                      checked={suggestTakedown}
                      onCheckedChange={() => setSuggestTakedown(!suggestTakedown)}
                      className="mt-1 data-[state=checked]:bg-rose-600 data-[state=checked]:border-rose-600"
                    />
                    <div>
                      <Label htmlFor="takedown" className={cn("text-sm font-bold block cursor-pointer", suggestTakedown ? "text-rose-900" : "text-slate-900")}>Request Takedown</Label>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">Flag for immediate legal removal workflow.</p>
                    </div>
                  </div> */}
                </div>
              </section>

            </div>

            {/* Sticky Footer */}
            <div className="p-6 bg-white border-t border-slate-100 sticky bottom-0 z-10 flex gap-3">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1 font-bold border-slate-200 text-slate-600">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="flex-[2] font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20"
              >
                {isPending ? <Loader2 className="animate-spin" /> : (hasReview ? 'Update Review' : 'Submit to Client')}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
