'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getPosts, approveTakedown, getPriorityTakedowns } from './actions'
import { CaseDetailPanel } from './CaseDetailPanel'
import {
  Filter, ChevronDown, Search, ArrowUpDown, Loader2,
  AlertTriangle, ShieldAlert, CheckCircle, ExternalLink,
  Info, Eye, LayoutGrid, List, Facebook, Instagram, Twitter
} from 'lucide-react'

import getPostLink from '@/components/GetPostLink'

export function CasesList() {
  const [posts, setPosts] = useState([])
  const [priorityPosts, setPriorityPosts] = useState([])
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
  const lastPostRef = useRef(null)

  // Fetch initial data or when filters/sort change
  useEffect(() => {
    const loadInitialData = async () => {
      setInitialLoading(true)
      setPage(1)
      setHasMore(true)
      setPosts([])

      try {
        const [postsResult, priorityResult] = await Promise.all([
          getPosts(1, 20, filters, sort),
          getPriorityTakedowns()
        ])

        setPosts(postsResult.posts)
        setTotalCount(postsResult.totalCount)
        setHasMore(1 < postsResult.totalPages)
        setPriorityPosts(priorityResult)

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
        setPosts(prev => prev.map(p => {
          if (p._id === post._id) {
            return { ...p, takedown_info: { ...p.takedown_info, takedown_status: 'requested' } };
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

  // Helper for duplicate removal if an item is in both lists
  const mergedPosts = [
    ...priorityPosts.map(p => ({ ...p, isPriority: true })),
    ...posts.filter(p => !priorityPosts.some(pr => pr._id === p._id))
  ];

  const getRiskLabel = (score) => {
    if (score >= 80) return { label: 'Critical', color: 'text-red-700 bg-red-50 border-red-200' };
    if (score >= 60) return { label: 'High', color: 'text-orange-700 bg-orange-50 border-orange-200' };
    if (score >= 40) return { label: 'Medium', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' };
    return { label: 'Low', color: 'text-green-700 bg-green-50 border-green-200' };
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

          <div className="text-sm text-gray-400 font-medium">
            Showing {mergedPosts.length} cases
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
                <th scope="col" className="px-6 py-4 text-left text-sm font-bold text-gray-500 uppercase -wider">Platform</th>
                <th scope="col" className="px-6 py-4 text-left text-sm font-bold text-gray-500 uppercase -wider">Threat Type</th>
                <th scope="col" className="px-6 py-4 text-left text-sm font-bold text-gray-500 uppercase -wider">Content</th>
                <th scope="col" className="px-6 py-4 text-left text-sm font-bold text-gray-500 uppercase -wider">Source</th>
                <th scope="col" className="px-6 py-4 text-right text-sm font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {mergedPosts.map((post, index) => {
                const isLastPost = index === mergedPosts.length - 1;
                const riskScore = post.review_details?.threat_score || post.analysis_results?.risk_score || 0;
                const risk = getRiskLabel(riskScore);
                const threatType = post.review_details?.threat_type?.replace(/_/g, ' ') || post.analysis_results?.category || 'Unknown';
                const status = post.takedown_info?.takedown_status || 'new';

                return (
                  <tr
                    key={index}
                    ref={isLastPost ? lastPostElementRef : null}
                    onClick={() => setSelectedPost(post)}
                    className="hover:bg-blue-50/30 cursor-pointer transition-colors group"
                  >
                    {/* Priority */}
                    <td className="px-6 py-5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border ${risk.color}`}>
                        <AlertTriangle className="w-3 h-3 mr-1.5" />
                        {risk.label}
                      </span>
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
                      <span className="text-gray-900 font-semibold capitalize">{threatType}</span>
                    </td>

                    {/* Content */}
                    <td className="px-6 py-5 max-w-md overflow-hidden">
                      <div className="flex flex-col">
                        {/* Using Username or a generic title if caption is weird */}
                        <span className="font-bold text-gray-900 text-sm mb-1 line-clamp-1">
                          {post.user?.username ? `@${post.user.username}` : 'Unknown User'}
                          {post.review_details?.threat_type ? `: ${post.review_details.threat_type.replace(/_/g, ' ')}` : ''}
                        </span>
                        <span className="text-sm text-gray-500 line-clamp-2 leading-relaxed">
                          {post.caption || 'No specific text content.'}
                        </span>
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
      />
    </div>
  )
}
