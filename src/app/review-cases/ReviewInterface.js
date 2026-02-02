'use client'

import { useState, useActionState, useEffect, useRef, useCallback } from 'react'
import { submitCaseReview, getUnreviewedPosts, getCaseMetadata } from './actions'
import {
  Loader2, X, CheckCircle, AlertTriangle, ExternalLink,
  ThumbsUp, MessageCircle, Eye, ChevronLeft, ChevronRight, Filter, Share2, Repeat, Quote
} from 'lucide-react'
import ProfilePic from '@/components/ProfilePic'

const initialState = {
  success: false,
  error: null,
}

export function ReviewInterface({ initialPosts, totalPages: initialTotalPages, currentPage: initialCurrentPage }) {
  const [selectedPost, setSelectedPost] = useState(null)
  const [posts, setPosts] = useState(initialPosts)
  const [page, setPage] = useState(initialCurrentPage)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialCurrentPage < initialTotalPages)
  const [filters, setFilters] = useState({ platform: 'all', startDate: '', endDate: '' })
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
    setFilters({ platform: 'all', startDate: '', endDate: '' })
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
  }, [selectedPost, posts])

  // Scroll selected post into view when first selected
  useEffect(() => {
    if (selectedPost) {
      const postElement = postRefs.current[selectedPost._id]
      if (postElement) {
        postElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [selectedPost?._id])

  return (
    <div className="flex h-full relative">
      {/* Main Content - Table */}
      <div className="flex-1 overflow-y-auto p-6 transition-all duration-300">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow border border-gray-100 p-4 mb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <span className="text-xs font-bold text-gray-500 uppercase">Filters:</span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-500 uppercase">Platform:</label>
              <select
                value={filters.platform}
                onChange={(e) => setFilters({ ...filters, platform: e.target.value })}
                className="px-3 py-2 text-sm border-gray-200 focus:ring-blue-500 focus:border-blue-500 rounded-lg border bg-gray-50"
              >
                <option value="all">All Platforms</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="x">X (Twitter)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-500 uppercase">From:</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="px-3 py-2 text-sm border-gray-200 focus:ring-blue-500 focus:border-blue-500 rounded-lg border bg-gray-50"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-500 uppercase">To:</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="px-3 py-2 text-sm border-gray-200 focus:ring-blue-500 focus:border-blue-500 rounded-lg border bg-gray-50"
              />
            </div>

            {(filters.platform !== 'all' || filters.startDate || filters.endDate) && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                Clear Filters
              </button>
            )}

            <div className="ml-auto text-sm text-gray-500 flex items-center gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {posts.length} posts
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
                  Date Found
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
                      <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                        post.platform === 'facebook' ? 'bg-blue-100 text-blue-800' :
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
                      {post.taken_at ? new Date(post.taken_at * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
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
        className={`fixed inset-y-0 right-0 w-[800px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out border-l border-gray-200 overflow-y-auto ${selectedPost ? 'translate-x-0' : 'translate-x-full'
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
      const metadata = await getCaseMetadata(post.code)
      setExistingMetadata(metadata)
      setLoadingMetadata(false)
    }
    fetchMetadata()
  }, [post.code])

  const getPostLink = () => {
    if (post.platform === 'instagram') return `https://www.instagram.com/p/${post.code}/`
    if (post.platform === 'facebook') return `https://www.facebook.com/${post.code}`
    if (post.platform === 'x') return `https://twitter.com/${post.user?.username}/status/${post.code}`
    return null
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-bold text-gray-900">Review Case</h2>
          {existingMetadata && (
            <span className="text-xs bg-green-100 text-green-800 px-3 py-1 rounded-full font-bold uppercase tracking-wider">
              Previously Reviewed
            </span>
          )}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => onNavigate('prev')}
              disabled={!hasPrev}
              className="p-1.5 rounded-md hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-all"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => onNavigate('next')}
              disabled={!hasNext}
              className="p-1.5 rounded-md hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-all"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors p-2 rounded-full hover:bg-gray-100">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="flex-1 p-8 grid grid-cols-2 gap-8 bg-white">
        {/* Left Column: Post Details */}
        <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar">

          {/* User Info */}
          <div className="flex items-center space-x-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
            <ProfilePic user={post.user?.username} size={56} />
            <div className="flex-1">
              <p className="text-base font-bold text-gray-900 leading-none">{post.user?.username || 'Unknown'}</p>
              <p className="text-sm text-gray-500 mt-1">{post.user?.full_name}</p>
              <div className="flex items-center mt-2 space-x-2 flex-wrap gap-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  post.platform === 'facebook' ? 'bg-blue-100 text-blue-800' :
                  post.platform === 'x' ? 'bg-gray-900 text-white' :
                  'bg-pink-100 text-pink-800'
                }`}>
                  {post.platform || 'Instagram'}
                </span>
                {post.user?.is_verified && <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Verified</span>}
                <span className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{post.code}</span>
              </div>
            </div>
          </div>

          {/* Post Image/Video */}
          <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-900 flex items-center justify-center min-h-[300px] shadow-inner">
            {post.signedImageUrl ? (
              <img src={post.signedImageUrl} alt="Post content" className="max-w-full max-h-[500px] object-contain" />
            ) : (
              <div className="text-gray-400 text-sm flex flex-col items-center">
                <AlertTriangle className="h-8 w-8 mb-2 opacity-20" />
                No Image Available
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 border-b border-gray-100 pb-6">
            <div className="bg-gray-50 p-3 rounded-lg text-center">
              <ThumbsUp className="h-4 w-4 mx-auto mb-1 text-gray-400" />
              <p className="text-sm font-bold text-gray-900">{post.stats?.like_count || 0}</p>
              <p className="text-[10px] text-gray-500 uppercase font-bold">Likes</p>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg text-center">
              <MessageCircle className="h-4 w-4 mx-auto mb-1 text-gray-400" />
              <p className="text-sm font-bold text-gray-900">{post.stats?.comment_count || 0}</p>
              <p className="text-[10px] text-gray-500 uppercase font-bold">{post.platform === 'x' ? 'Replies' : 'Comments'}</p>
            </div>

            {/* X-specific stats */}
            {post.platform === 'x' && post.stats?.retweet_count > 0 && (
              <div className="bg-gray-50 p-3 rounded-lg text-center">
                <Repeat className="h-4 w-4 mx-auto mb-1 text-gray-400" />
                <p className="text-sm font-bold text-gray-900">{post.stats.retweet_count}</p>
                <p className="text-[10px] text-gray-500 uppercase font-bold">Retweets</p>
              </div>
            )}
            {post.platform === 'x' && post.stats?.quote_count > 0 && (
              <div className="bg-gray-50 p-3 rounded-lg text-center">
                <Quote className="h-4 w-4 mx-auto mb-1 text-gray-400" />
                <p className="text-sm font-bold text-gray-900">{post.stats.quote_count}</p>
                <p className="text-[10px] text-gray-500 uppercase font-bold">Quotes</p>
              </div>
            )}

            {/* Views (Instagram and X) */}
            {post.stats?.view_count !== null && post.stats?.view_count > 0 && (
              <div className="bg-gray-50 p-3 rounded-lg text-center">
                <Eye className="h-4 w-4 mx-auto mb-1 text-gray-400" />
                <p className="text-sm font-bold text-gray-900">{post.stats.view_count.toLocaleString()}</p>
                <p className="text-[10px] text-gray-500 uppercase font-bold">Views</p>
              </div>
            )}

            {/* Shares (Facebook) */}
            {post.platform === 'facebook' && post.stats?.share_count > 0 && (
              <div className="bg-gray-50 p-3 rounded-lg text-center">
                <Share2 className="h-4 w-4 mx-auto mb-1 text-gray-400" />
                <p className="text-sm font-bold text-gray-900">{post.stats.share_count}</p>
                <p className="text-[10px] text-gray-500 uppercase font-bold">Shares</p>
              </div>
            )}
          </div>

          {/* Caption */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Post Caption</h3>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100 shadow-sm">
              {post.caption || 'No caption provided.'}
            </div>
          </div>

          {/* Extra Details Section */}
          <div>
             <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Extra Details</h3>
             <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">External Link</span>
                    <a
                      href={getPostLink()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-blue-600 hover:text-blue-800 text-xs font-bold"
                    >
                      Open Post <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </div>
                   <div>
                    <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Post ID</span>
                    <span className="text-xs font-mono text-gray-700">{post.code}</span>
                  </div>
                   <div>
                    <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Sourcing Date</span>
                    <span className="text-xs text-gray-700">{post.sourcing_date ? new Date(post.sourcing_date).toLocaleDateString() : 'N/A'}</span>
                  </div>
                   <div>
                    <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">DB Created At</span>
                    <span className="text-xs text-gray-700">{post.created_at ? new Date(post.created_at).toLocaleDateString() : 'N/A'}</span>
                  </div>
                </div>
                <details className="group">
                  <summary className="px-4 py-2 bg-gray-100 cursor-pointer text-xs font-bold text-gray-600 hover:bg-gray-200 transition-colors flex justify-between items-center">
                    <span>Raw JSON Data</span>
                    <span className="transform group-open:rotate-180 transition-transform text-[10px]">▼</span>
                  </summary>
                  <div className="p-4 bg-gray-900 overflow-x-auto">
                    <pre className="text-[10px] text-green-400 font-mono">
                      {JSON.stringify(post, null, 2)}
                    </pre>
                  </div>
                </details>
             </div>
          </div>
        </div>

        {/* Right Column: Form */}
        <div className="border-l border-gray-100 pl-8">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Takedown Assessment</h3>

          {loadingMetadata ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <form action={formAction} className="space-y-6">
              {/* Hidden Fields */}
              <input type="hidden" name="mongo_id" value={post._id || ''} />
              <input type="hidden" name="post_id" value={post.code || ''} />
              <input type="hidden" name="platform" value={post.platform || 'Instagram'} />
              <input type="hidden" name="image_key" value={post.signedImageUrl || ''} />
              <input type="hidden" name="profile_username" value={post.user?.username || 'unknown'} />
              <input type="hidden" name="caption" value={post.caption || ''} />
              <input type="hidden" name="sourcing_date" value={post.sourcing_date || new Date().toISOString()} />
              <input type="hidden" name="posting_time" value={post.taken_at ? new Date(post.taken_at * 1000).toISOString() : new Date().toISOString()} />

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Threat Type</label>
                <select
                  name="threat_type"
                  defaultValue={existingMetadata?.threat_type || 'safe'}
                  className="block w-full px-4 py-3 text-sm border-gray-200 focus:ring-blue-500 focus:border-blue-500 rounded-xl border bg-gray-50 transition-colors"
                >
                  <option value="safe">Safe</option>
                  <option value="scam">Scam / Fraud</option>
                  <option value="hate_speech">Hate Speech</option>
                  <option value="violence">Violence / Gore</option>
                  <option value="fake_news">Fake News / Disinformation</option>
                  <option value="nsfw">nsfw</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase">Risk Score</label>
                  <span id="score-display" className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                    {existingMetadata?.threat_score ?? 0}
                  </span>
                </div>
                <div className="flex items-center space-x-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <input
                    type="range"
                    name="threat_score_range"
                    min="0"
                    max="100"
                    defaultValue={existingMetadata?.threat_score ?? 0}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    onInput={(e) => {
                      document.getElementById('score-val').value = e.target.value;
                      document.getElementById('score-display').innerText = e.target.value;
                    }}
                  />
                  <input
                    id="score-val"
                    type="number"
                    name="threat_score"
                    min="0"
                    max="100"
                    defaultValue={existingMetadata?.threat_score ?? 0}
                    className="w-16 border border-gray-200 rounded-lg py-2 px-2 text-center text-sm font-bold bg-white"
                  />
                </div>
              </div>

              <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 shadow-sm">
                <div className="flex items-start">
                  <div className="flex items-center h-5 mt-0.5">
                    <input
                      id="takedown"
                      name="is_in_takedown"
                      type="checkbox"
                      defaultChecked={existingMetadata?.is_in_takedown || false}
                      className="focus:ring-blue-500 h-5 w-5 text-blue-600 border-gray-300 rounded-lg transition-all"
                    />
                  </div>
                  <div className="ml-4 text-sm">
                    <label htmlFor="takedown" className="font-bold text-blue-900 block leading-none mb-1">Initiate Takedown Process</label>
                    <p className="text-blue-700 text-xs opacity-80 leading-relaxed">Marking this will add the case to the active takedown queue for legal action.</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Initial Status</label>
                <select
                  name="takedown_status"
                  defaultValue={existingMetadata?.takedown_status || 'None'}
                  className="block w-full px-4 py-3 text-sm border-gray-200 focus:ring-blue-500 focus:border-blue-500 rounded-xl border bg-gray-50 transition-colors"
                >
                  <option value="None">None</option>
                  <option value="reviewer-checked">Reviewer Checked</option>
                  <option value="sent-to-platform">Sent to Platform</option>
                  <option value="under-investigation">Under Investigation</option>
                </select>
              </div>

              <div className="space-y-3">
                {state?.error && (
                  <div className="text-red-700 bg-red-50 p-4 rounded-xl text-sm flex items-center border border-red-100 font-medium">
                    <AlertTriangle className="h-5 w-5 mr-3 shrink-0" /> {state.error}
                  </div>
                )}

                {state?.success && (
                  <div className="text-green-700 bg-green-50 p-4 rounded-xl text-sm flex items-center border border-green-100 font-medium animate-in fade-in zoom-in duration-300">
                    <CheckCircle className="h-5 w-5 mr-3 shrink-0" /> Review Submitted Successfully
                  </div>
                )}
              </div>

              <div className="pt-6">
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-500/50 disabled:opacity-50 transition-all duration-200 transform active:scale-[0.98]"
                >
                  {isPending ? <Loader2 className="animate-spin h-5 w-5" /> : existingMetadata ? 'Update Review' : 'Complete Review'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
