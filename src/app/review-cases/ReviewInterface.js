'use client'

import { useState, useActionState, useEffect, useRef, useCallback } from 'react'
import { submitCaseReview, getUnreviewedPosts, getCaseMetadata } from './actions'
import {
  Loader2, X, CheckCircle, AlertTriangle, ExternalLink,
  ThumbsUp, MessageCircle, Eye, ChevronLeft, ChevronRight, Filter, Share2, Repeat, Quote, Calendar, Database, Sparkles, Brain, Search, ShieldAlert, Bot
} from 'lucide-react'
import ProfilePic from '@/components/ProfilePic'

// shadcn/ui components
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

const initialState = {
  success: false,
  error: null,
}

// ... (existing helper functions and components)
// ...

export function ReviewInterface({ initialPosts, totalPages: initialTotalPages, currentPage: initialCurrentPage }) {
  // ... (same as before)
  const [selectedPost, setSelectedPost] = useState(null)
  const [posts, setPosts] = useState(initialPosts)
  const [page, setPage] = useState(initialCurrentPage)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialCurrentPage < initialTotalPages)

        // Expanded filter state
        const [filters, setFilters] = useState({ 
          platform: 'all', 
          sourcingDateStart: '', 
          sourcingDateEnd: '',
          dbDateStart: '',
          dbDateEnd: '',
          aiAnalyzed: true,
          poiDetected: false
        })    
      const observer = useRef()
      const postRefs = useRef({})
  const loadMorePosts = useCallback(async () => {
    setLoading(true)
    const nextPage = page + 1
    const response = await getUnreviewedPosts(nextPage, 20, filters)

    if (response.posts.length > 0) {
      setPosts(prev => [...prev, ...response.posts])
      setPage(nextPage)
      setHasMore(nextPage < response.totalPages)
    } else {
      setHasMore(false)
    }
    setLoading(false)
  }, [page, filters])

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
    const response = await getUnreviewedPosts(1, 20, filters)
    setPosts(response.posts)
    setPage(1)
    setHasMore(1 < response.totalPages)
    setLoading(false)
  }, [filters])

  const clearFilters = () => {
      setFilters({ 
        platform: 'all', 
        sourcingDateStart: '', 
        sourcingDateEnd: '',
        dbDateStart: '',
        dbDateEnd: '',
        aiAnalyzed: true,
        poiDetected: false
      })
    }

  // Apply filters when they change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applyFilters()
  }, [applyFilters])

  // Navigation logic
  const navigatePost = (direction) => {
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
  }

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

  // Scroll selected post into view when first selected
  useEffect(() => {
    if (selectedPost) {
      const postElement = postRefs.current[selectedPost._id]
      if (postElement) {
        postElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [selectedPost, selectedPost?._id])

  return (
    <div className="flex h-full relative">
      {/* Main Content - Table */}
      <div className="flex-1 overflow-y-auto p-6 transition-all duration-300">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow border border-gray-100 p-4 mb-4">
          <div className="flex flex-col space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Search Filters</span>
              {Object.entries(filters).some(([key, val]) => (key === 'aiAnalyzed' ? val === true : val !== 'all' && val !== '')) && (
                <button
                  onClick={clearFilters}
                  className="ml-auto text-xs font-medium text-red-600 hover:text-red-800 flex items-center gap-1 bg-red-50 px-2 py-1 rounded"
                >
                  <X className="h-3 w-3" />
                  Reset All
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-6">
              {/* Platform */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase block">Platform</label>
                <select
                  value={filters.platform}
                  onChange={(e) => setFilters({ ...filters, platform: e.target.value })}
                  className="px-3 py-2 text-sm border-gray-200 focus:ring-blue-500 focus:border-blue-500 rounded-lg border bg-gray-50 min-w-[140px]"
                >
                  <option value="all">All Platforms</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="x">X (Twitter)</option>
                </select>
              </div>

                              {/* AI Filter */}
                              <div className="flex items-center gap-6 self-center pt-4">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id="aiAnalyzed"
                                    checked={filters.aiAnalyzed}
                                    onChange={(e) => setFilters({ ...filters, aiAnalyzed: e.target.checked })}
                                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                  />
                                  <label htmlFor="aiAnalyzed" className="text-xs font-bold text-gray-600 uppercase flex items-center gap-1 cursor-pointer">
                                    <Sparkles className="w-3 h-3 text-indigo-500" />
                                    AI Analyzed Only
                                  </label>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id="poiDetected"
                                    checked={filters.poiDetected}
                                    onChange={(e) => setFilters({ ...filters, poiDetected: e.target.checked })}
                                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                  />
                                  <label htmlFor="poiDetected" className="text-xs font-bold text-gray-600 uppercase flex items-center gap-1 cursor-pointer">
                                    <Search className="w-3 h-3 text-indigo-500" />
                                    POI Detected
                                  </label>
                                </div>
                              </div>
                
                              {/* Sourcing Date Range */}              <div className="space-y-1">
                <div className="flex items-center gap-1 mb-1">
                  <Calendar className="w-3 h-3 text-gray-400" />
                  <label className="text-xs font-bold text-gray-500 uppercase block">Sourcing Date</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={filters.sourcingDateStart}
                    onChange={(e) => setFilters({ ...filters, sourcingDateStart: e.target.value })}
                    className="px-3 py-2 text-sm border-gray-200 focus:ring-blue-500 focus:border-blue-500 rounded-lg border bg-gray-50"
                    placeholder="Start"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="date"
                    value={filters.sourcingDateEnd}
                    onChange={(e) => setFilters({ ...filters, sourcingDateEnd: e.target.value })}
                    className="px-3 py-2 text-sm border-gray-200 focus:ring-blue-500 focus:border-blue-500 rounded-lg border bg-gray-50"
                    placeholder="End"
                  />
                </div>
              </div>

              {/* DB Date Range */}
              <div className="space-y-1">
                <div className="flex items-center gap-1 mb-1">
                  <Database className="w-3 h-3 text-gray-400" />
                  <label className="text-xs font-bold text-gray-500 uppercase block">DB Ingest Date</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={filters.dbDateStart}
                    onChange={(e) => setFilters({ ...filters, dbDateStart: e.target.value })}
                    className="px-3 py-2 text-sm border-gray-200 focus:ring-blue-500 focus:border-blue-500 rounded-lg border bg-gray-50"
                    placeholder="Start"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="date"
                    value={filters.dbDateEnd}
                    onChange={(e) => setFilters({ ...filters, dbDateEnd: e.target.value })}
                    className="px-3 py-2 text-sm border-gray-200 focus:ring-blue-500 focus:border-blue-500 rounded-lg border bg-gray-50"
                    placeholder="End"
                  />
                </div>
              </div>

              <div className="ml-auto text-sm text-gray-500 flex items-center gap-2 self-center h-full pt-4">
                {loading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                <span className="font-medium bg-gray-100 px-3 py-1 rounded-full">{posts.length} posts loaded</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Platform
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Profile
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sourcing Date
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {posts.map((post, index) => {
                const isSelected = selectedPost?._id === post._id
                const isLast = posts.length === index + 1
                return (
                  <tr
                    key={index}
                    ref={(el) => {
                      postRefs.current[post._id] = el
                      if (isLast) lastPostElementRef(el)
                    }}
                    className={`transition-colors cursor-pointer ${isSelected ? 'bg-blue-100 ring-2 ring-inset ring-blue-400' : 'hover:bg-gray-50'}`}
                    onClick={() => setSelectedPost(post)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${post.platform === 'facebook' ? 'bg-blue-100 text-blue-800' :
                        post.platform === 'x' ? 'bg-gray-900 text-white' :
                          'bg-pink-100 text-pink-800'
                        }`}>
                        {post.platform || 'Instagram'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex items-center">
                      <ProfilePic user={post.user?.username} size={28} />
                      <span className="ml-3 font-medium text-gray-700">{post.user?.username || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {post.sourcing_date ? new Date(post.sourcing_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        className={`text-sm ${isSelected ? 'text-blue-700' : 'text-blue-600 hover:text-blue-900'}`}
                      >
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
          />
        )}
      </div>
    </div>
  )
}

function ReviewForm({ post, onClose, onNavigate, hasPrev, hasNext }) {
  const [state, formAction, isPending] = useActionState(submitCaseReview, initialState)
  const [existingMetadata, setExistingMetadata] = useState(null)
  const [loadingMetadata, setLoadingMetadata] = useState(true)

  // Fetch existing metadata when post changes
  useEffect(() => {
    async function fetchMetadata() {
      setLoadingMetadata(true)
      const metadata = await getCaseMetadata(post.post_id || post.code)
      setExistingMetadata(metadata)
      setLoadingMetadata(false)
    }
    fetchMetadata()
  }, [post.post_id, post.code])

  const getPostLink = () => {
    const id = post.post_id || post.code
    if (post.platform === 'instagram') return `https://www.instagram.com/p/${id}/`
    if (post.platform === 'facebook') return `https://www.facebook.com/${id}`
    if (post.platform === 'x') return `https://twitter.com/${post.user?.username}/status/${id}`
    return null
  }

  // Pre-fill values logic
  const defaultThreatScore = existingMetadata?.review_details?.threat_score
    ?? post.analysis_results?.risk_score
    ?? 0;

  // Determine threat type based on AI specific boolean checks
  const getAiThreatType = (results) => {
    if (!results) return 'safe';

    // Priority 1: High confidence checks
    if (results.truth_check?.is_credible === false) return 'fake_news';
    if (results.hate_speech_check?.is_safe === false) return 'hate_speech';
    if (results.nsfw_check?.is_safe === false) return 'nsfw';

    // Priority 2: Category text matching (fallback)
    const cat = (results.category || '').toLowerCase();
    if (cat.includes('scam') || cat.includes('fraud')) return 'scam';
    if (cat.includes('hate')) return 'hate_speech';
    if (cat.includes('violence') || cat.includes('gore')) return 'violence';
    if (cat.includes('fake') || cat.includes('misinformation')) return 'fake_news';
    if (cat.includes('nsfw') || cat.includes('sexual')) return 'nsfw';

    return 'safe'; // Default to safe if checks pass
  };

  const defaultThreatType = existingMetadata?.review_details?.threat_type
    ?? getAiThreatType(post.analysis_results);


  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-6 py-4 border-b flex items-center justify-between bg-background sticky top-0 z-10">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-bold">Review Case</h2>
          {existingMetadata && (
            <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">
              Previously Reviewed
            </Badge>
          )}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onNavigate('prev')}
              disabled={!hasPrev}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onNavigate('next')}
              disabled={!hasNext}
              className="h-8 w-8"
            >
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
        <div className="h-full border-r overflow-y-auto">
            <div className="p-8 space-y-6">

          {/* User Info */}
          <div className="flex items-center space-x-4 bg-muted/40 p-4 rounded-xl border">
            <ProfilePic user={post.user?.username} size={56} />
            <div className="flex-1">
              <p className="text-base font-bold leading-none">{post.user?.username || 'Unknown'}</p>
              <p className="text-sm text-muted-foreground mt-1">{post.user?.full_name}</p>
              <div className="flex items-center mt-2 space-x-2 flex-wrap gap-1">
                <Badge variant="secondary" className="uppercase text-[10px]">
                  {post.platform || 'Instagram'}
                </Badge>
                {post.user?.is_verified && <Badge variant="outline" className="text-[10px] bg-green-50 text-green-800 border-green-200">Verified</Badge>}
                <Badge variant="outline" className="text-[10px]">{post.post_id || post.code}</Badge>
              </div>
            </div>
          </div>

          {/* Post Image/Video */}
          <div className="rounded-xl overflow-hidden border bg-muted/20 flex items-center justify-center min-h-[300px]">
            {post.signedImageUrl ? (
              <img src={post.signedImageUrl} alt="Post content" className="max-w-full max-h-[500px] object-contain" />
            ) : (
              <div className="text-muted-foreground text-sm flex flex-col items-center">
                <AlertTriangle className="h-8 w-8 mb-2 opacity-20" />
                No Image Available
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-muted/40 p-3 rounded-lg text-center border">
              <ThumbsUp className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-sm font-bold">{post.stats?.like_count || 0}</p>
              <p className="text-[10px] text-muted-foreground uppercase font-bold">Likes</p>
            </div>
            <div className="bg-muted/40 p-3 rounded-lg text-center border">
              <MessageCircle className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-sm font-bold">{post.stats?.comment_count || 0}</p>
              <p className="text-[10px] text-muted-foreground uppercase font-bold">Comments</p>
            </div>
            
            {post.stats?.view_count !== null && post.stats?.view_count > 0 && (
              <div className="bg-muted/40 p-3 rounded-lg text-center border">
                <Eye className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-bold">{post.stats.view_count.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Views</p>
              </div>
            )}
             {post.platform === 'facebook' && post.stats?.share_count > 0 && (
              <div className="bg-muted/40 p-3 rounded-lg text-center border">
                <Share2 className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-bold">{post.stats.share_count}</p>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Shares</p>
              </div>
            )}
          </div>

          {/* Caption */}
          <div>
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Post Caption</h3>
            <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-muted/30 p-4 rounded-xl border">
              {post.caption || 'No caption provided.'}
            </div>
          </div>

          {/* Extra Details Section */}
          <Card>
             <CardHeader className="py-3">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Metadata</CardTitle>
             </CardHeader>
             <CardContent className="grid grid-cols-2 gap-4 text-xs">
                 <div>
                    <span className="text-muted-foreground block mb-1">Source Date</span>
                    <span className="font-medium">{post.sourcing_date ? new Date(post.sourcing_date).toLocaleDateString() : 'N/A'}</span>
                 </div>
                 <div>
                    <span className="text-muted-foreground block mb-1">Ingest Date</span>
                    <span className="font-medium">{post.created_at ? new Date(post.created_at).toLocaleDateString() : 'N/A'}</span>
                 </div>
                 <div className="col-span-2">
                    <a href={getPostLink()} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-bold inline-flex items-center">
                        Open Original Post <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                 </div>
             </CardContent>
          </Card>
          </div>
        </div>

        {/* Right Column: Form */}
        <div className="h-full bg-muted/10 overflow-y-auto">
            <div className="p-8">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-6">Takedown Assessment</h3>

          {/* AI ANALYSIS SECTION */}
          {post.analysis_results && Object.keys(post.analysis_results).length > 0 && (
            <Card className="mb-8 border-indigo-100 shadow-sm bg-gradient-to-br from-indigo-50/50 to-background">
              <CardHeader className="py-3 border-b border-indigo-100 bg-indigo-50/30">
                <CardTitle className="flex items-center text-xs font-bold text-indigo-900 uppercase tracking-wide">
                    <Sparkles className="w-4 h-4 text-indigo-600 mr-2" />
                    AI Analysis Report
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {/* Top Row: Score & Category */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Risk Level</div>
                    <Badge variant="outline" className={`
                        ${(post.analysis_results.risk_score || 0) > 80 ? 'bg-red-50 text-red-700 border-red-100' :
                        (post.analysis_results.risk_score || 0) > 50 ? 'bg-orange-50 text-orange-700 border-orange-100' :
                          'bg-green-50 text-green-700 border-green-100'}
                    `}>
                        {post.analysis_results.category || 'Unknown'}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">AI Score</div>
                    <div className="text-2xl font-bold leading-none">
                      {post.analysis_results.risk_score || 0}
                      <span className="text-sm text-muted-foreground font-normal">/100</span>
                    </div>
                  </div>
                </div>

                {/* Reason */}
                {post.analysis_results.categorization_reason && (
                  <div className="bg-background/80 p-3 rounded-lg border border-indigo-100/50">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1 flex items-center">
                      <Brain className="w-3 h-3 mr-1" /> Reasoning
                    </div>
                    <p className="text-sm text-foreground/80 leading-snug">
                      {post.analysis_results.categorization_reason}
                    </p>
                  </div>
                )}

                {/* Checks Grid - CONDITIONAL RENDERING */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  
                  {/* 1. POI Check - Only if exists */}
                  {post.analysis_results.poi_check && (
                      <div className={`p-2 rounded-lg border ${post.analysis_results.poi_check?.poi_name_found ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1 flex items-center">
                          <Search className="w-3 h-3 mr-1" /> POI Detected
                        </div>
                        <div className="text-sm font-medium">
                          {post.analysis_results.poi_check?.poi_name_found ? (
                            <span className="text-red-700">Yes: {post.analysis_results.poi_check.poi_names?.join(', ')}</span>
                          ) : <span className="text-green-700">None</span>}
                        </div>
                      </div>
                  )}

                  {/* 2. Credibility Check - Only if exists */}
                  {post.analysis_results.truth_check && (
                      <div className={`p-2 rounded-lg border ${post.analysis_results.truth_check?.is_credible === false ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1 flex items-center">
                          <ShieldAlert className="w-3 h-3 mr-1" /> Credibility
                        </div>
                        <div className="text-sm">
                          <span className={`font-bold ${post.analysis_results.truth_check?.is_credible === false ? 'text-red-700' : 'text-green-700'}`}>
                            {post.analysis_results.truth_check?.is_credible === false ? 'Misinformation' : 'Credible'}
                          </span>
                        </div>
                      </div>
                  )}

                  {/* 3. Hate Speech Check - Only if exists */}
                  {post.analysis_results.hate_speech_check && (
                      <div className={`p-2 rounded-lg border ${post.analysis_results.hate_speech_check?.is_safe === false ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1 flex items-center">
                          <AlertTriangle className="w-3 h-3 mr-1" /> Hate Speech
                        </div>
                        <div className="text-sm font-medium">
                          {post.analysis_results.hate_speech_check?.is_safe === false ? (
                            <span className="text-red-700">Detected</span>
                          ) : <span className="text-green-700">Safe</span>}
                        </div>
                      </div>
                  )}

                  {/* 4. NSFW Check - Only if exists */}
                  {post.analysis_results.nsfw_check && (
                      <div className={`p-2 rounded-lg border ${post.analysis_results.nsfw_check?.is_safe === false ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1 flex items-center">
                          <Eye className="w-3 h-3 mr-1" /> NSFW
                        </div>
                        <div className="text-sm font-medium">
                          {post.analysis_results.nsfw_check?.is_safe === false ? (
                            <span className="text-red-700">Detected</span>
                          ) : <span className="text-green-700">Safe</span>}
                        </div>
                      </div>
                  )}

                  {/* 5. AIGC Check - Only if exists */}
                  {post.analysis_results.aigc_check && (
                      <div className={`p-2 rounded-lg border col-span-1 sm:col-span-2 ${post.analysis_results.aigc_check?.is_aigc ? 'bg-purple-50 border-purple-100' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1 flex items-center">
                          <Bot className="w-3 h-3 mr-1" /> AI Generated Content
                        </div>
                        <div className="text-sm font-medium">
                          {post.analysis_results.aigc_check?.is_aigc ? (
                            <span className="text-purple-700">Likely AI Generated ({Math.round((post.analysis_results.aigc_check.score || 0) * 100)}%)</span>
                          ) : 'Human Generated'}
                        </div>
                      </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {loadingMetadata ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : (
            <form action={formAction} className="space-y-6">
              {/* Hidden Fields */}
              <input type="hidden" name="mongo_id" value={post._id || ''} />
              <input type="hidden" name="post_id" value={post.post_id || post.code || ''} />
              <input type="hidden" name="platform" value={post.platform || 'Instagram'} />
              <input type="hidden" name="image_key" value={post.signedImageUrl || ''} />
              <input type="hidden" name="profile_username" value={post.user?.username || 'unknown'} />
              <input type="hidden" name="caption" value={post.caption || ''} />
              <input type="hidden" name="sourcing_date" value={post.sourcing_date || new Date().toISOString()} />
              <input type="hidden" name="posting_time" value={post.taken_at ? new Date(post.taken_at * 1000).toISOString() : new Date().toISOString()} />

              <div className="space-y-2">
                <Label>Threat Type</Label>
                <Select name="threat_type" defaultValue={defaultThreatType}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select threat type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="safe">Safe</SelectItem>
                      <SelectItem value="scam">Scam / Fraud</SelectItem>
                      <SelectItem value="hate_speech">Hate Speech</SelectItem>
                      <SelectItem value="violence">Violence / Gore</SelectItem>
                      <SelectItem value="fake_news">Fake News / Disinformation</SelectItem>
                      <SelectItem value="nsfw">NSFW</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label>Risk Score</Label>
                  <Badge variant="outline" className="font-mono text-base">
                     <span id="score-display">{defaultThreatScore}</span>
                  </Badge>
                </div>
                <div className="bg-muted/40 p-4 rounded-xl border">
                    {/* Fallback to standard range input as shadcn Slider needs installation/setup */}
                  <input
                    type="range"
                    name="threat_score_range"
                    min="0"
                    max="100"
                    defaultValue={defaultThreatScore}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    onInput={(e) => {
                      document.getElementById('score-val').value = e.target.value;
                      document.getElementById('score-display').innerText = e.target.value;
                    }}
                  />
                  <input
                    id="score-val"
                    type="hidden"
                    name="threat_score"
                    defaultValue={defaultThreatScore}
                  />
                </div>
              </div>

              <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100">
                <div className="flex items-start gap-3">
                  <div className="flex items-center h-5 mt-0.5">
                    <input
                      id="takedown"
                      name="is_in_takedown"
                      type="checkbox"
                      defaultChecked={existingMetadata?.takedown_info?.is_in_takedown || false}
                      className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <Label htmlFor="takedown" className="text-indigo-900 font-bold cursor-pointer">Initiate Takedown Process</Label>
                    <p className="text-indigo-700/80 text-xs mt-1">Marking this will add the case to the active takedown queue for legal action.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Initial Status</Label>
                <Select name="takedown_status" defaultValue={existingMetadata?.takedown_info?.takedown_status || 'None'}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="None">None</SelectItem>
                      <SelectItem value="raised">Raised (Reviewer Checked)</SelectItem>
                      <SelectItem value="under_review">Under Review</SelectItem>
                      <SelectItem value="accepted">Accepted</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                {state?.error && (
                  <div className="text-red-700 bg-red-50 p-3 rounded-lg text-sm flex items-center border border-red-100 font-medium">
                    <AlertTriangle className="h-4 w-4 mr-2 shrink-0" /> {state.error}
                  </div>
                )}

                {state?.success && (
                  <div className="text-green-700 bg-green-50 p-3 rounded-lg text-sm flex items-center border border-green-100 font-medium animate-in fade-in zoom-in duration-300">
                    <CheckCircle className="h-4 w-4 mr-2 shrink-0" /> Review Submitted Successfully
                  </div>
                )}
              </div>

              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={isPending}
                  className="w-full h-12 text-base font-bold shadow-md bg-indigo-600 hover:bg-indigo-700"
                >
                  {isPending ? <Loader2 className="animate-spin h-5 w-5" /> : existingMetadata ? 'Update Review' : 'Complete Review'}
                </Button>
              </div>
            </form>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}
