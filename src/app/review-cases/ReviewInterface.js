'use client'

import { useState, useActionState, useEffect, useRef, useCallback } from 'react'
import { submitCaseReview, getPosts, getCaseMetadata } from './actions'
import {
  Loader2, X, CheckCircle, AlertTriangle, ExternalLink,
  ThumbsUp, MessageCircle, Eye, ChevronLeft, ChevronRight, Filter, Share2,
  Search, ShieldAlert, Bot, Sparkles, Brain, Calendar, Database, Plus,
  Instagram, Facebook, Twitter, Heart, Activity, BadgeCheck, Quote, User
} from 'lucide-react'
import ProfilePic from '@/components/ProfilePic'

import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

import { DatePickerWithRange } from "@/components/ui/date-range-picker"
import { format } from "date-fns"

const initialState = {
  success: false,
  error: null,
}

export function ReviewInterface({ initialPosts, totalPages: initialTotalPages, currentPage: initialCurrentPage, projectName }) {
  const [selectedPost, setSelectedPost] = useState(null)
  const [posts, setPosts] = useState(initialPosts)
  const [page, setPage] = useState(initialCurrentPage)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialCurrentPage < initialTotalPages)

  // Filters State
  const [filters, setFilters] = useState({
    platform: 'all',
    status: 'pending',
    sourcingDate: undefined, // { from: Date, to: Date }
    dbDate: undefined,       // { from: Date, to: Date }
    aiAnalyzed: true,
    poiDetected: true
  })

  const observer = useRef()
  const postRefs = useRef({})

  const loadMorePosts = useCallback(async () => {
    setLoading(true)
    const nextPage = page + 1

    // Transform dates for API
    // Logic: If only 'from' is selected, range is 'from' -> 'today'
    // If 'to' is selected, range is 'from' -> 'to'
    const sourcingEnd = filters.sourcingDate?.to
      ? format(filters.sourcingDate.to, 'yyyy-MM-dd')
      : (filters.sourcingDate?.from ? format(new Date(), 'yyyy-MM-dd') : '')

    const dbEnd = filters.dbDate?.to
      ? format(filters.dbDate.to, 'yyyy-MM-dd')
      : (filters.dbDate?.from ? format(new Date(), 'yyyy-MM-dd') : '')

    const apiFilters = {
      ...filters,
      sourcingDateStart: filters.sourcingDate?.from ? format(filters.sourcingDate.from, 'yyyy-MM-dd') : '',
      sourcingDateEnd: sourcingEnd,
      dbDateStart: filters.dbDate?.from ? format(filters.dbDate.from, 'yyyy-MM-dd') : '',
      dbDateEnd: dbEnd,
    }

    const response = await getPosts(projectName, nextPage, 20, apiFilters)

    if (response.posts.length > 0) {
      setPosts(prev => [...prev, ...response.posts])
      setPage(nextPage)
      setHasMore(nextPage < response.totalPages)
    } else {
      setHasMore(false)
    }
    setLoading(false)
  }, [page, filters, projectName])

  // Infinite Scroll Observer
  const lastPostElementRef = useCallback(node => {
    if (loading) return
    if (observer.current) observer.current.disconnect()
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMorePosts()
      }
    })
    if (node) observer.current.observe(node)
  }, [loading, hasMore, loadMorePosts])

  const applyFilters = useCallback(async () => {
    setLoading(true)
    setSelectedPost(null)

    // Transform dates for API
    // Logic: If only 'from' is selected, range is 'from' -> 'today'
    // If 'to' is selected, range is 'from' -> 'to'
    const sourcingEnd = filters.sourcingDate?.to
      ? format(filters.sourcingDate.to, 'yyyy-MM-dd')
      : (filters.sourcingDate?.from ? format(new Date(), 'yyyy-MM-dd') : '')

    const dbEnd = filters.dbDate?.to
      ? format(filters.dbDate.to, 'yyyy-MM-dd')
      : (filters.dbDate?.from ? format(new Date(), 'yyyy-MM-dd') : '')

    const apiFilters = {
      ...filters,
      sourcingDateStart: filters.sourcingDate?.from ? format(filters.sourcingDate.from, 'yyyy-MM-dd') : '',
      sourcingDateEnd: sourcingEnd,
      dbDateStart: filters.dbDate?.from ? format(filters.dbDate.from, 'yyyy-MM-dd') : '',
      dbDateEnd: dbEnd,
    }

    const response = await getPosts(projectName, 1, 20, apiFilters)
    setPosts(response.posts)
    setPage(1)
    setHasMore(1 < response.totalPages)
    setLoading(false)
  }, [filters, projectName])

  const clearFilters = () => {
    setFilters({
      platform: 'all',
      status: 'pending',
      sourcingDate: undefined,
      dbDate: undefined,
      aiAnalyzed: true,
      poiDetected: false
    })
  }

  const isFirstRender = useRef(true)
  // Apply filters when they change
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    // Debounce filter application to prevent rapid API calls while picking dates
    const timer = setTimeout(() => {
      applyFilters()
    }, 500)
    return () => clearTimeout(timer)
  }, [applyFilters])

  // Navigation logic
  const navigatePost = useCallback((direction) => {
    if (!selectedPost) return
    const currentIndex = posts.findIndex(p => p._id === selectedPost._id)
    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1

    if (nextIndex >= 0 && nextIndex < posts.length) {
      const nextPost = posts[nextIndex]
      setSelectedPost(nextPost)

      // Scroll the post into view, centered
      setTimeout(() => {
        const postElement = postRefs.current[nextPost._id]
        if (postElement) {
          postElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
    }
  }, [selectedPost, posts])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only handle arrow keys if the review panel is open and not typing in an input
      if (!selectedPost) return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return

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
  }, [selectedPost, posts, navigatePost])

  const getRiskLabel = (score) => {
    if (score >= 80) return { label: 'Critical', color: 'text-red-700 bg-red-50 border-red-200' };
    if (score >= 60) return { label: 'High', color: 'text-orange-700 bg-orange-50 border-orange-200' };
    if (score >= 40) return { label: 'Medium', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' };
    return { label: 'Low', color: 'text-green-700 bg-green-50 border-green-200' };
  }

  const getPostLink = (post) => {
    const id = post.post_id || post.code
    if (post.platform === 'instagram') return `https://www.instagram.com/p/${id}/`
    if (post.platform === 'facebook') return `https://www.facebook.com/${id}`
    if (post.platform === 'x') return `https://twitter.com/${post.user?.username}/status/${id}`
    return '#'
  }

  return (
    <div className="flex h-full relative bg-slate-50/50">
      {/* Main Content - Table */}
      <div className="flex-1 overflow-y-auto p-6 transition-all duration-300">

        {/* Filters Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
          <div className="flex flex-col space-y-5">

            {/* Header & Reset */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-blue-50 p-1.5 rounded-md">
                  <Filter className="h-4 w-4 text-blue-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Filters</h3>
              </div>

              {/* Active Filter Counter / Reset */}
              {(filters.status !== 'pending' || filters.platform !== 'all' || !filters.aiAnalyzed || filters.poiDetected || filters.sourcingDate || filters.dbDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 transition-colors"
                >
                  <X className="h-3 w-3 mr-1.5" />
                  Reset Filters
                </Button>
              )}
            </div>

            <Separator className="bg-slate-100" />

            <div className="flex flex-col gap-6">

              {/* Primary Filters Row */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Status Filter */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Review Status</Label>
                  <Select
                    value={filters.status}
                    onValueChange={(val) => setFilters({ ...filters, status: val })}
                  >
                    <SelectTrigger className="w-full bg-white border-slate-200">
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending Review</SelectItem>
                      <SelectItem value="reviewed">Reviewed</SelectItem>
                      <SelectItem value="all">All Items</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Platform Filter */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Platform</Label>
                  <Select
                    value={filters.platform}
                    onValueChange={(val) => setFilters({ ...filters, platform: val })}
                  >
                    <SelectTrigger className="w-full bg-white border-slate-200">
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

                {/* Sourcing Date Range */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Sourcing Date
                  </Label>
                  <DatePickerWithRange
                    date={filters.sourcingDate}
                    setDate={(date) => setFilters({ ...filters, sourcingDate: date })}
                    placeholder="Select sourcing dates"
                    className="w-full"
                  />
                </div>

                {/* DB Date Range */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" /> Ingest Date
                  </Label>
                  <DatePickerWithRange
                    date={filters.dbDate}
                    setDate={(date) => setFilters({ ...filters, dbDate: date })}
                    placeholder="Select ingest dates"
                    className="w-full"
                  />
                </div>
              </div>

              {/* Secondary Filters (Toggles) */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                <div className="flex items-center gap-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="aiAnalyzed"
                      checked={filters.aiAnalyzed}
                      onCheckedChange={(checked) => setFilters({ ...filters, aiAnalyzed: checked })}
                    />
                    <label
                      htmlFor="aiAnalyzed"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1.5 text-slate-700"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                      AI Analyzed Only
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="poiDetected"
                      checked={filters.poiDetected}
                      onCheckedChange={(checked) => setFilters({ ...filters, poiDetected: checked })}
                    />
                    <label
                      htmlFor="poiDetected"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1.5 text-slate-700"
                    >
                      <Search className="w-3.5 h-3.5 text-blue-500" />
                      POI Detected
                    </label>
                  </div>
                </div>

                {/* Results Count */}
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  {loading && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                  <span className="font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs border border-slate-200">
                    {posts.length} results
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Post List Table */}
        <div className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-sm font-bold text-gray-500 uppercase tracking-wider">Priority</th>
                <th scope="col" className="px-6 py-4 text-left text-sm font-bold text-gray-500 uppercase tracking-wider">Content</th>
                <th scope="col" className="px-6 py-4 text-left text-sm font-bold text-gray-500 uppercase tracking-wider">Platform</th>
                <th scope="col" className="px-6 py-4 text-left text-sm font-bold text-gray-500 uppercase tracking-wider">Threat Type</th>
                <th scope="col" className="px-6 py-4 text-left text-sm font-bold text-gray-500 uppercase tracking-wider">Source</th>
                <th scope="col" className="px-6 py-4 text-right text-sm font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {posts.map((post, index) => {
                const isSelected = selectedPost?._id === post._id
                const isLast = posts.length === index + 1

                const riskScore = post.review_details?.threat_score || post.analysis_results?.risk_score || 0;
                const risk = getRiskLabel(riskScore);
                const threatType = post.review_details?.threat_types?.join(', ').replace(/_/g, ' ') || post.review_details?.threat_type?.replace(/_/g, ' ') || post.analysis_results?.category || 'Unknown';

                return (
                  <tr
                    key={index}
                    ref={(el) => {
                      postRefs.current[post._id] = el
                      if (isLast) lastPostElementRef(el)
                    }}
                    className={`transition-colors cursor-pointer group ${isSelected ? 'bg-blue-100 ring-2 ring-inset ring-blue-400' : 'hover:bg-blue-50/30'}`}
                    onClick={() => setSelectedPost(post)}
                  >
                    {/* Priority */}
                    <td className="px-6 py-5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border ${risk.color}`}>
                        <AlertTriangle className="w-3 h-3 mr-1.5" />
                        {risk.label}
                      </span>
                    </td>

                    {/* Content */}
                    <td className="px-6 py-5 max-w-md overflow-hidden">
                      <div className="flex items-center gap-4">
                        {post.signedImageUrl ? (
                          <div className="h-12 w-12 rounded-lg overflow-hidden flex-shrink-0 border border-gray-100 shadow-sm bg-gray-50">
                            <img
                              src={post.signedImageUrl}
                              alt="Content"
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100">
                            <Quote className="h-5 w-5 text-gray-300" />
                          </div>
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-gray-900 text-sm mb-0.5 truncate">
                            {post.user?.username ? `@${post.user.username}` : 'Unknown User'}
                          </span>
                          <span className="text-xs text-gray-500 line-clamp-2 leading-snug">
                            {post.caption || 'No specific text content.'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Platform */}
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center text-gray-700 font-medium">
                        {post.platform === 'instagram' && <Instagram className=" size-6 stroke-pink-500 mr-2" />}
                        {post.platform === 'facebook' && <Facebook className=" size-6 stroke-blue-500 mr-2" />}
                        {post.platform === 'x' && <Twitter className=" size-6 stroke-black mr-2" />}
                        <span className="capitalize">{post.platform || 'Instagram'}</span>
                      </div>
                    </td>

                    {/* Threat Type */}
                    <td className="px-6 py-5 whitespace-nowrap">
                      <span className="text-gray-900 font-semibold capitalize">{threatType}</span>
                    </td>

                    {/* Source */}
                    <td className="px-6 py-5 whitespace-nowrap">
                      <a
                        href={post.original_url || getPostLink(post)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center text-blue-600 hover:text-blue-800 font-semibold text-sm transition-colors hover:border-blue-500 border-b-2 border-transparent"
                      >
                        View <ExternalLink className="w-3.5 h-3.5 ml-1" />
                      </a>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-5 whitespace-nowrap text-right">
                      <button className={`text-xs font-bold py-2 px-4 rounded-lg shadow-sm transition-colors inline-flex items-center ${isSelected ? 'bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                        {isSelected ? 'Reviewing...' : 'Review'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {loading && (
            <div className="py-8 flex justify-center items-center bg-white border-t border-gray-100">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
              <span className="text-sm text-gray-500 font-medium">Loading more posts...</span>
            </div>
          )}

          {!hasMore && posts.length > 0 && (
            <div className="py-8 text-center text-sm text-gray-400 bg-gray-50 border-t border-gray-100">
              No more posts to review.
            </div>
          )}
        </div>
      </div>

      {/* Backdrop */}
      {selectedPost && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 transition-opacity"
          onClick={() => setSelectedPost(null)}
          aria-hidden="true"
        />
      )}

      {/* Side Panel */}
      <div
        className={`fixed inset-y-0 right-0 w-[1000px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out border-l border-gray-200 overflow-y-auto ${selectedPost ? 'translate-x-0' : 'translate-x-full'
          }`}
        style={{ top: '0', zIndex: 60 }}
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

  // 1. Derive Initial Values
  const review = post.review_details || {}
  const analysis = post.analysis_results || {}
  const existingFlags = review.flags || {}
  const analysisPoi = analysis.poi_check || {}
  const hasReview = review && Object.keys(review).length > 0

  // POI Logic
  const savedFace = hasReview ? (review.face_present === true) : (analysisPoi.face_present === true)
  const savedName = hasReview ? (review.name_present === true) : (analysisPoi.poi_name_found === true)
  const savedPoiNames = (hasReview && review.poi_names) ? review.poi_names : (analysisPoi.poi_names || [])

  // Threat Scores
  const savedScore = review.threat_score ?? analysis.risk_score ?? 0

  // Threat Types
  let savedTypes = review.threat_types || []

  // If NOT reviewed, derive threat types from analysis logic
  if (!hasReview && savedTypes.length === 0 && analysis) {
    const aiCategory = (analysis.category || '').toLowerCase()
    const aiReasoning = (analysis.categorization_reason || '').toLowerCase()

    // A. Text Heuristics from category/reasoning
    if (analysis.threat_category) savedTypes.push(analysis.threat_category)
    if (aiCategory.includes('scam') || aiReasoning.includes('scam')) savedTypes.push('scam')
    if (aiCategory.includes('hate') || aiReasoning.includes('hate')) savedTypes.push('hate_speech')
    if (aiCategory.includes('fake') || aiCategory.includes('misinformation') || aiReasoning.includes('misinformation') || aiReasoning.includes('fake')) savedTypes.push('fake_news')
    if (aiCategory.includes('nsfw') || aiReasoning.includes('nsfw')) savedTypes.push('nsfw')
    if (aiCategory.includes('aigc') || aiReasoning.includes('aigc') || aiReasoning.includes('ai generated')) savedTypes.push('aigc')

    // B. Structure Check Objects
    if (analysis.aigc_check?.is_aigc) savedTypes.push('aigc')
    if (analysis.nsfw_check?.is_safe === false) savedTypes.push('nsfw')
    if (analysis.hate_speech_check?.is_safe === false) savedTypes.push('hate_speech')
    if (analysis.truth_check?.is_credible === false) savedTypes.push('fake_news')

    // C. Fallback
    savedTypes = [...new Set(savedTypes)]
    if (savedTypes.length === 0) {
      if (savedScore > 50) savedTypes.push('other')
      else savedTypes.push('safe')
    }
  }

  // Takedown
  const savedTakedown = post.takedown_info?.takedown_status === "requested"

  // 2. Initialize State
  const [facePresent, setFacePresent] = useState(savedFace)
  const [namePresent, setNamePresent] = useState(savedName)
  const [poiNames, setPoiNames] = useState(savedPoiNames)
  const [newPoiInput, setNewPoiInput] = useState('')
  const [threatScore, setThreatScore] = useState(savedScore)
  const [threatTypes, setThreatTypes] = useState(savedTypes)
  // const [isTakedown, setIsTakedown] = useState(savedTakedown)
  const [suggestTakedown, setSuggestTakedown] = useState(savedTakedown)

  // Derived Accessors
  const poiPresent = facePresent || namePresent
  const defaultReasoning = review.reasoning || analysis.categorization_reason || '';
  const defaultComments = review.reviewer_comments || '';

  const getPostLink = () => {
    const id = post.post_id || post.code
    if (post.platform === 'instagram') return `https://www.instagram.com/p/${id}/`
    if (post.platform === 'facebook') return `https://www.facebook.com/${id}`
    if (post.platform === 'x') return `https://twitter.com/${post.user?.username}/status/${id}`
    return null
  }

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
    <div className="h-full flex flex-col bg-background">
      <div className="px-6 py-4 border-b flex items-center justify-between bg-background sticky top-0 z-10">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-bold text-slate-900">Review Case</h2>
          {hasReview && (
            <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">
              Previously Reviewed
            </Badge>
          )}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => onNavigate('prev')} disabled={!hasPrev} className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => onNavigate('next')} disabled={!hasNext} className="h-8 w-8">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2">
        {/* Left Column: Post Details */}
        <div className="h-full border-r overflow-y-auto w-full">
          <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6 scrollbar-hide">

            {/* User Context Card */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-5">
              <div className="relative shrink-0">
                <ProfilePic user={post.user?.username || 'Unknown'} size={64} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-slate-900 truncate flex items-center gap-2">
                  {post.user?.username || 'Unknown User'}
                  {post.user?.is_verified && <BadgeCheck className="w-5 h-5 text-blue-500 fill-blue-50" />}
                </h3>
                <p className="text-slate-500 font-medium truncate">{post.user?.full_name}</p>
              </div>
              <a
                href={getPostLink()}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                <span className="hidden sm:inline">View Source</span>
              </a>
            </div>

            {/* Media Display */}
            <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-lg border border-slate-800 relative group flex items-center justify-center min-h-[400px]">
              {post.signedImageUrl ? (
                <img
                  src={post.signedImageUrl}
                  alt="Evidence"
                  className="w-full h-auto max-h-[600px] object-contain"
                />
              ) : (
                <div className="text-center p-12">
                  <Quote className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium text-lg">Text-Only Content</p>
                </div>
              )}
            </div>

            {/* Caption & Stats */}
            <div className="grid grid-cols-1 gap-6">
              <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h4 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                  <MessageCircle className="w-3 h-3" /> Post Caption
                </h4>
                <div className="text-slate-800 leading-relaxed whitespace-pre-wrap font-medium text-base">
                  {post.caption || <span className="italic text-slate-400">No caption content available.</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-50 text-rose-500 rounded-lg">
                      <Heart className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase">Likes</span>
                  </div>
                  <span className="font-bold text-slate-900 text-lg">{post.stats?.like_count?.toLocaleString() || 0}</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 text-blue-500 rounded-lg">
                      <MessageCircle className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase">Comments</span>
                  </div>
                  <span className="font-bold text-slate-900 text-lg">{post.stats?.comment_count?.toLocaleString() || 0}</span>
                </div>

                {/* Dates */}
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-50 text-slate-500 rounded-lg">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase">Sourcing Date</span>
                  </div>
                  <span className="font-bold text-slate-900 text-sm">{post.sourcing_date ? new Date(post.sourcing_date).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-50 text-slate-500 rounded-lg">
                      <Activity className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase">Extraction Date</span>
                  </div>
                  <span className="font-bold text-slate-900 text-sm">{post.created_at ? new Date(post.created_at).toLocaleDateString() : 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Form */}
        <div className="h-full bg-muted/10 overflow-y-auto">
          <div className="p-8">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-6">Review & Analysis Form</h3>

            <form action={formAction} className="space-y-8 pb-20">
              {/* Hidden Fields */}
              <input type="hidden" name="mongo_id" value={post._id || ''} />
              <input type="hidden" name="post_id" value={post.post_id || post.code || ''} />
              <input type="hidden" name="platform" value={post.platform || 'Instagram'} />
              <input type="hidden" name="image_key" value={post.signedImageUrl || ''} />
              <input type="hidden" name="profile_username" value={post.user?.username || 'unknown'} />
              <input type="hidden" name="caption" value={post.caption || ''} />
              <input type="hidden" name="sourcing_date" value={post.sourcing_date || new Date().toISOString()} />
              <input type="hidden" name="posting_time" value={post.taken_at ? new Date(post.taken_at * 1000).toISOString() : new Date().toISOString()} />

              <input type="hidden" name="poi_names" value={poiNames.join(',')} />

              {/* Flags expected by backend actions.js (must use 'on' for true) */}
              <input type="hidden" name="poi_present" value={poiPresent.toString()} />
              <input type="hidden" name="poi_confirmed" value={poiPresent ? 'on' : 'off'} />

              <input type="hidden" name="is_hate_speech" value={threatTypes.includes('hate_speech') ? 'on' : 'off'} />
              <input type="hidden" name="is_nsfw" value={threatTypes.includes('nsfw') ? 'on' : 'off'} />
              <input type="hidden" name="is_fake_news" value={threatTypes.includes('fake_news') ? 'on' : 'off'} />
              <input type="hidden" name="is_aigc" value={threatTypes.includes('aigc') ? 'on' : 'off'} />

              <input type="hidden" name="face_present" value={facePresent.toString()} />
              <input type="hidden" name="name_present" value={namePresent.toString()} />
              <input type="hidden" name="threat_score" value={threatScore} />
              <input type="hidden" name="takedown_status" value={post.takedown_info?.takedown_status || 'None'} />

              {/* Section 1: POI */}
              <div className="space-y-4">
                <Label className="text-base font-bold text-blue-900 uppercase tracking-wide">Section 1: POI Verification</Label>
                <div className="bg-white p-6 rounded-xl border-2 border-slate-100 shadow-sm space-y-6">

                  {/* Main POI Toggle (Read Only Display) */}
                  <div className="flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="space-y-0.5">
                      <Label className="text-base font-bold text-slate-900">Is POI present/relevant?</Label>
                      <p className="text-xs text-muted-foreground">Derived from Face and Name detections below.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${poiPresent ? 'text-blue-600' : 'text-slate-400'}`}>{poiPresent ? 'YES' : 'NO'}</span>
                      <Switch disabled checked={poiPresent} />
                    </div>
                  </div>

                  {/* Sub Toggles */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 bg-white border-2 border-slate-100 rounded-xl hover:border-blue-100 transition-colors">
                      <Label className="text-sm font-bold text-slate-700">Face Detected</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{facePresent ? 'Yes' : 'No'}</span>
                        <Switch checked={facePresent} onCheckedChange={setFacePresent} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white border-2 border-slate-100 rounded-xl hover:border-blue-100 transition-colors">
                      <Label className="text-sm font-bold text-slate-700">Name Detected</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{namePresent ? 'Yes' : 'No'}</span>
                        <Switch checked={namePresent} onCheckedChange={setNamePresent} />
                      </div>
                    </div>
                  </div>

                  {/* POI Tag Manager */}
                  <div className="space-y-3 pt-2">
                    <Label className="text-sm font-bold text-slate-700">Identified Persons</Label>
                    <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-lg min-h-[50px] border border-dashed border-slate-300">
                      {poiNames.map((name, index) => (
                        <Badge key={index} variant="secondary" className="pl-3 pr-1 py-1.5 flex items-center bg-white text-blue-700 border-2 border-blue-100">
                          <span className="font-bold">{name}</span>
                          <button type="button" onClick={() => handleRemovePoi(index)} className="ml-2 hover:bg-red-50 hover:text-red-600 rounded-full p-0.5 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </Badge>
                      ))}
                      {poiNames.length === 0 && <span className="text-xs text-slate-400 italic my-auto">No subjects tagged yet.</span>}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Type name and press Add..."
                        variant="secondary"
                        value={newPoiInput}
                        onChange={(e) => setNewPoiInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPoi())}
                        className="h-10 text-sm border-2 text-slate-100 focus:border-blue-500"
                      />
                      <Button type="button" onClick={handleAddPoi} className="h-10 px-4 bg-blue-600 hover:bg-blue-700">
                        <Plus className="h-4 w-4 mr-2" /> Add
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Threat Analysis */}
              <div className="space-y-4">
                <Label className="text-base font-bold text-blue-900 uppercase tracking-wide">Section 2: Threat Analysis</Label>
                <div className="bg-white p-6 rounded-xl border-2 border-slate-100 shadow-sm space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { id: 'scam', label: 'Scam / Fraud' },
                      { id: 'hate_speech', label: 'Hate Speech' },
                      { id: 'nsfw', label: 'NSFW' },
                      { id: 'aigc', label: 'AI Generated' },
                      { id: 'fake_news', label: 'Fake News' },
                      { id: 'humor', label: 'Humor / Satire' }
                    ].map((item) => (
                      <div
                        key={item.id}
                        onClick={() => toggleThreatType(item.id)}
                        className={cn(
                          "flex items-center space-x-3 p-4 rounded-xl border-2 transition-all cursor-pointer",
                          threatTypes.includes(item.id)
                            ? "border-blue-600 bg-blue-50/50"
                            : "border-slate-100 bg-white hover:border-slate-200"
                        )}
                      >
                        <Checkbox
                          id={`type-${item.id}`}
                          name="threat_types"
                          value={item.id}
                          checked={threatTypes.includes(item.id)}
                          onCheckedChange={() => { }} // Controlled by parent div
                        />
                        <Label className="text-sm font-bold text-slate-700 cursor-pointer flex-1">
                          {item.label}
                        </Label>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reasoning" className="text-sm font-bold text-slate-700">Analysis & Reasoning</Label>
                    <Textarea
                      id="reasoning"
                      name="reasoning"
                      defaultValue={defaultReasoning}
                      placeholder="Describe the findings and analysis..."
                      className="min-h-[120px] bg-white border-2 border-slate-100 focus:border-blue-500 text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Verdict */}
              <div className="space-y-4">
                <Label className="text-base font-bold text-blue-900 uppercase tracking-wide">Section 3: Final Verdict</Label>
                <div className="bg-white p-6 rounded-xl border-2 border-slate-100 shadow-sm space-y-8">

                  {/* Risk Score */}
                  <div className="space-y-5">
                    <div className="flex justify-between items-end">
                      <div className="space-y-1">
                        <Label className="text-sm font-bold text-slate-700">Calculated Risk Score</Label>
                        <p className="text-xs text-muted-foreground">Adjust based on visual & contextual evidence.</p>
                      </div>
                      <div className={cn(
                        "text-3xl font-black px-5 py-2 rounded-2xl border-4 shadow-sm font-mono",
                        threatScore > 75 ? "bg-red-50 text-red-600 border-red-200" :
                          threatScore > 40 ? "bg-orange-50 text-orange-600 border-orange-200" :
                            "bg-green-50 text-green-600 border-green-200"
                      )}>
                        {threatScore}
                      </div>
                    </div>

                    <div className="relative pt-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={threatScore}
                        onChange={(e) => setThreatScore(parseInt(e.target.value))}
                        className="w-full h-3 rounded-lg appearance-none cursor-pointer bg-slate-200 accent-blue-600"
                        style={{
                          background: `linear-gradient(to right, #86efac 0%, #fde047 50%, #f87171 100%)`
                        }}
                      />
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2 px-1">
                        <span>Safe</span>
                        <span>Moderate Risk</span>
                        <span>Critical Threat</span>
                      </div>
                    </div>
                  </div>

                  {/* Reviewer Note */}
                  <div className="space-y-2">
                    <Label htmlFor="reviewer_comments" className="text-sm font-bold text-slate-700">Reviewer Note (Visible to Client)</Label>
                    <Textarea
                      id="reviewer_comments"
                      name="reviewer_comments"
                      defaultValue={defaultComments}
                      placeholder="Add internal notes or context for the client..."
                      className="min-h-[100px] bg-white border-2 border-slate-100 focus:border-blue-500 text-slate-900"
                    />
                  </div>

                  <Separator className="bg-slate-100" />

                  {/* Takedown Suggestion */}
                  <div
                    className={cn(
                      "flex items-start space-x-4 p-5 rounded-2xl border-2 transition-all cursor-pointer",
                      suggestTakedown
                        ? "bg-red-50 border-red-200 ring-4 ring-red-50"
                        : "bg-slate-50 border-slate-100 hover:border-slate-200"
                    )}
                  >
                    <Checkbox
                      id="takedown"
                      name="suggest_takedown"
                      checked={suggestTakedown}
                      onCheckedChange={() => setSuggestTakedown(!suggestTakedown)}
                      className={suggestTakedown ? "border-red-600 bg-red-600" : "border-slate-400"}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor="takedown" className={cn(
                        "text-base font-black cursor-pointer",
                        suggestTakedown ? "text-red-900" : "text-slate-900"
                      )}>
                        Suggest Takedown
                      </Label>
                      <p className={cn(
                        "text-sm",
                        suggestTakedown ? "text-red-700 font-medium" : "text-slate-500"
                      )}>
                        This flags the content for immediate legal removal workflow.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button Area */}
              <div className="sticky bottom-0 bg-background/95 backdrop-blur-md pb-6 px-6 border-t-2 border-slate-100 mt-auto flex flex-col gap-4">

                {/* Server Response Feedback */}
                <div className="space-y-3">
                  {state?.error && (
                    <div className="text-red-700 bg-red-50 p-4 rounded-xl text-sm font-bold flex items-center border-2 border-red-100">
                      <AlertTriangle className="h-5 w-5 mr-3 shrink-0" /> {state.error}
                    </div>
                  )}
                  {state?.success && (
                    <div className="text-green-700 bg-green-50 p-4 mt-4 rounded-xl text-sm font-bold flex items-center border-2 border-green-100 animate-in fade-in zoom-in">
                      <CheckCircle className="h-5 w-5 mr-3 shrink-0" /> Review Submitted Successfully
                    </div>
                  )}
                </div>

                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    className="h-14 px-8 text-base font-bold border-2"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 h-14 text-lg font-black shadow-lg bg-blue-600 hover:bg-blue-700 hover:shadow-blue-200 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    {isPending ? <Loader2 className="animate-spin h-6 w-6" /> : hasReview ? 'UPDATE REVIEW' : 'COMPLETE REVIEW'}
                  </Button>
                </div>

              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
