'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { getPosts, approveTakedown, getPriorityTakedowns, getRaisedCount } from './actions'
import { CaseDetailPanel } from './CaseDetailPanel'
import {
  Filter, ChevronDown, Search, ArrowUpDown, Loader2,
  AlertTriangle, ShieldAlert, CheckCircle, ExternalLink,
  Info, Eye, LayoutGrid, List, Facebook, Instagram, Twitter,
  Activity, User, Siren, FileSignature, ArrowRight, Quote
} from 'lucide-react'

import getPostLink from '@/components/GetPostLink'
import Link from 'next/link'

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
          // Filter out any that might be in priority to avoid absolute duplicates (though rare if pagination flows naturally)
          // But priority posts are "pinned" to top visually. 
          // Ideally we dedupe by ID if we merged, but here we keep lists separate and merge in render
          // Just appending normally here.
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

  const handleSortChange = (field) => {
    setSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
    }))
  }

  const handleApproveTakedown = async (e, post) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to approve the takedown for this case? This will trigger an alert.`)) return;

    try {
      const result = await approveTakedown(post._id);
      if (result.success) {
        setPriorityPosts(prev => prev.filter(p => p._id !== post._id));
        setRaisedCount(prev => prev + 1);
        setPosts(prev => prev.map(p => {
          if (p._id === post._id) {
            return { ...p, takedown_info: { ...p.takedown_info, takedown_status: 'raised' } };
          }
          return p;
        }));
      } else {
        alert("Failed: " + result.error);
      }
    } catch (err) {
      console.error(err);
    }
  }

  const getRiskLabel = (score) => {
    if (score >= 80) return { label: 'Critical', color: 'text-red-700 bg-red-50 border-red-200' };
    if (score >= 60) return { label: 'High', color: 'text-orange-700 bg-orange-50 border-orange-200' };
    if (score >= 40) return { label: 'Medium', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' };
    return { label: 'Low', color: 'text-green-700 bg-green-50 border-green-200' };
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
    return { label: 'Unprocessed', icon: AlertTriangle, color: 'text-gray-600 bg-gray-50 border-gray-200' };
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Filters */}
      <div className="border-b border-gray-100 px-8 py-6 bg-white">

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-900">Filters</span>
            </div>

            {/* Filters */}
            <select
              className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 min-w-[140px]"
              value={filters.platform}
              onChange={(e) => handleFilterChange('platform', e.target.value)}
            >
              <option value="all">All Platforms</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="x">X (Twitter)</option>
            </select>

            <select
              className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 min-w-[140px]"
              value={filters.threat_type}
              onChange={(e) => handleFilterChange('threat_type', e.target.value)}
            >
              <option value="all">All Threat Types</option>
              <option value="impersonation">Impersonation</option>
              <option value="deepfake_video">Deepfake Video</option>
              <option value="scam_ad">Scam Ad</option>
              <option value="hate_speech">Hate Speech</option>
            </select>

          </div>

          <div className="flex items-center gap-6">
            {raisedCount > 0 && (
              <Link
                href="/takedowns"
                className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 border border-rose-100 rounded-lg text-rose-700 hover:bg-rose-100 transition-colors group"
              >
                <Siren className="w-4 h-4" />
                <span className="text-sm font-bold">{raisedCount} Raised Cases</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            )}
            <div className="text-sm text-gray-400 font-medium">
              Showing {mergedPosts.length} cases
            </div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-sm font-bold text-gray-500 uppercase -wider">Priority</th>
                <th scope="col" className="px-6 py-4 text-left text-sm font-bold text-gray-500 uppercase -wider">Status</th>
                <th scope="col" className="px-6 py-4 text-left text-sm font-bold text-gray-500 uppercase -wider">Content</th>
                <th scope="col" className="px-6 py-4 text-left text-sm font-bold text-gray-500 uppercase -wider">Platform</th>
                <th scope="col" className="px-6 py-4 text-left text-sm font-bold text-gray-500 uppercase -wider">Threat Type</th>
                <th scope="col" className="px-6 py-4 text-left text-sm font-bold text-gray-500 uppercase -wider">Source</th>
                <th scope="col" className="px-6 py-4 text-right text-sm font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {mergedPosts.map((post, index) => {
                const isLastPost = index === mergedPosts.length - 1;
                const riskScore = post.review_details?.threat_score || post.analysis_results?.risk_score || 0;
                const risk = getRiskLabel(riskScore);
                const threatTypes = post.review_details?.threat_types  //|| post.analysis_results?.category || 'Unknown';
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
                    className={`transition-colors cursor-pointer group ${isSelected ? 'bg-blue-100 ring-2 ring-inset ring-blue-400 z-10 relative' : 'hover:bg-blue-50/30'}`}
                  >
                    {/* Priority */}
                    <td className="px-6 py-5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border ${risk.color}`}>
                        <AlertTriangle className="w-3 h-3 mr-1.5" />
                        {risk.label}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border ${statusConfig.color}`}>
                        <StatusIcon className="w-3 h-3 mr-1.5" />
                        {statusConfig.label}
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
                            {post.review_details?.threat_type ? `: ${post.review_details.threat_type.replace(/_/g, ' ')}` : ''}
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
                        <span className="capitalize">{post.platform}</span>
                      </div>
                    </td>

                    {/* Threat Type */}
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1.5">
                        {Array.isArray(threatTypes) && threatTypes.map((type, idx) => {
                          const colorMap = {
                            scam: 'text-orange-700 bg-orange-50 border-orange-200',
                            aigc: 'text-purple-700 bg-purple-50 border-purple-200',
                            fake_news: 'text-red-700 bg-red-50 border-red-200',
                            hate_speech: 'text-rose-700 bg-rose-50 border-rose-200',
                            nsfw: 'text-yellow-700 bg-yellow-50 border-yellow-200',

                          };
                          return (
                            <span
                              key={idx}
                              className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold border uppercase tracking-wider ${colorMap[type] || 'text-gray-600 bg-gray-50 border-gray-200'}`}
                            >
                              {type.replace(/_/g, ' ')}
                            </span>
                          );
                        })}
                      </div>
                    </td>

                    {/* Source */}
                    <td className="px-6 py-5 whitespace-nowrap">
                      <a
                        href={post.original_url ? post.original_url : getPostLink(post)}
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
                      <button className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-sm transition-colors inline-flex items-center">
                        Go Deep
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {mergedPosts.length === 0 && !initialLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Search className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-lg font-medium">No cases found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          )}

          {loadingMore && (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
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
