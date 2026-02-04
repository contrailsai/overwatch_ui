'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getPosts } from './actions'
import { CaseDetailPanel } from './CaseDetailPanel'
import { Filter, ChevronDown, Search, ArrowUpDown, Loader2, AlertTriangle, Heart, MessageCircle } from 'lucide-react'

export function CasesList() {
  const [posts, setPosts] = useState([])
  const [initialLoading, setInitialLoading] = useState(true) // For first load / filter change
  const [loadingMore, setLoadingMore] = useState(false) // For infinite scroll
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
    field: 'created_at',
    direction: 'desc'
  })

  const [selectedPost, setSelectedPost] = useState(null)
  
  const observer = useRef()
  const lastPostRef = useRef(null)

  // Fetch initial data or when filters/sort change
  useEffect(() => {
    const loadInitialData = async () => {
      setInitialLoading(true)
      // Reset state for new query
      setPage(1)
      setHasMore(true)
      setPosts([]) 

      try {
        const result = await getPosts(1, 20, filters, sort)
        setPosts(result.posts)
        setTotalCount(result.totalCount)
        setHasMore(1 < result.totalPages)
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
        setPosts(prev => [...prev, ...result.posts])
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

  // Intersection Observer Callback for the last element
  const lastPostElementRef = useCallback(node => {
    if (initialLoading || loadingMore) return
    
    if (observer.current) observer.current.disconnect()
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMore()
      }
    }, {
        threshold: 0.1, // Trigger when just slightly visible
        rootMargin: '100px', // Trigger a bit before reaching the bottom
    })
    
    if (node) observer.current.observe(node)
  }, [initialLoading, loadingMore, hasMore, loadMore])

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleSortChange = (field) => {
    setSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
    }))
  }

  const getThreatColor = (score) => {
    if (!score && score !== 0) return 'text-gray-500 bg-gray-100 border-gray-200' // Pending
    if (score >= 80) return 'text-red-600 bg-red-50 border-red-100'
    if (score >= 50) return 'text-orange-600 bg-orange-50 border-orange-100'
    return 'text-green-600 bg-green-50 border-green-100'
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters Bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 overflow-x-auto pb-2 sm:pb-0">
            {/* Platform Filter */}
            <div className="relative inline-block text-left">
              <select 
                className="block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm bg-gray-50 border"
                value={filters.platform}
                onChange={(e) => handleFilterChange('platform', e.target.value)}
              >
                <option value="all">All Platforms</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="x">X (Twitter)</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="relative inline-block text-left">
              <select 
                className="block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm bg-gray-50 border"
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending Review</option>
                <option value="reviewed">Reviewed</option>
              </select>
            </div>
            
            <div className="h-6 w-px bg-gray-300 mx-2 hidden sm:block"></div>

            <button 
                onClick={() => handleSortChange('threat_score')}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${sort.field === 'threat_score' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
            >
                <ArrowUpDown className="w-4 h-4 mr-2" />
                Risk Score
            </button>
             <button 
                onClick={() => handleSortChange('created_at')}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${sort.field === 'created_at' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
            >
                <ArrowUpDown className="w-4 h-4 mr-2" />
                Date
            </button>
          </div>

          <div className="text-sm text-gray-500">
            Showing {posts.length} of {totalCount} results
          </div>
        </div>
      </div>

      {/* Main List Area */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden min-h-[500px] flex flex-col">
          <table className="min-w-full divide-y divide-gray-200 flex-1">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stats</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Risk Assessment</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {posts.map((post, index) => {
                const isLastPost = index === posts.length - 1;
                return (
                  <tr 
                      key={post._id} 
                      ref={isLastPost ? lastPostElementRef : null}
                      onClick={() => setSelectedPost(post)}
                      className="hover:bg-blue-50 cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0 bg-gray-100 rounded overflow-hidden border border-gray-200 flex items-center justify-center">
                          {post.signedImageUrl ? (
                              <img className="h-10 w-10 object-cover" src={post.signedImageUrl} alt="" />
                          ) : (
                              <AlertTriangle className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm text-gray-900 truncate max-w-[200px]">{post.caption || 'No caption'}</div>
                          <div className={`text-xs inline-flex items-center px-1.5 py-0.5 rounded capitalize mt-1
                              ${post.platform === 'facebook' ? 'bg-blue-100 text-blue-800' : 
                                post.platform === 'x' ? 'bg-gray-900 text-white' : 
                                'bg-pink-100 text-pink-800'}`}>
                              {post.platform}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{post.user.username}</div>
                      {post.user.is_verified && <span className="text-xs text-blue-500">Verified</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex flex-col space-y-1">
                          <div className="flex items-center space-x-1.5">
                              <Heart className="w-3 h-3 text-gray-400" />
                              <span>{post.stats.like_count.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                              <MessageCircle className="w-3 h-3 text-gray-400" />
                              <span>{post.stats.comment_count.toLocaleString()}</span>
                          </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {post.review_details ? (
                          <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getThreatColor(post.review_details.threat_score)}`}>
                              {post.review_details.threat_score}/100
                          </div>
                      ) : (
                          <span className="text-xs text-gray-400 italic">Pending Review</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${post.processed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {post.processed ? 'Reviewed' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {post.created_at ? new Date(post.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          
          {initialLoading && (
             <div className="flex-1 flex flex-col items-center justify-center py-20 bg-white">
                 <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                 <p className="text-sm text-gray-500">Loading cases...</p>
             </div>
          )}
          
          {posts.length === 0 && !initialLoading && (
             <div className="flex-1 flex flex-col items-center justify-center py-20 bg-white text-gray-500">
                 <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                 <p>No posts found matching your filters.</p>
             </div>
          )}

          {/* Infinite Scroll Loader / End Message */}
          <div className="py-4 border-t border-gray-100 bg-gray-50">
             {loadingMore ? (
                <div className="flex justify-center items-center">
                   <Loader2 className="h-5 w-5 animate-spin text-blue-600 mr-2" />
                   <span className="text-sm text-gray-600 font-medium">Loading more posts...</span>
                </div>
             ) : !hasMore && posts.length > 0 ? (
                <div className="text-center text-sm text-gray-400">
                   End of results
                </div>
             ) : (
               // Placeholder to maintain height and prevent jitter if needed, 
               // but usually empty is fine if logic is correct.
               // We keep it minimal to avoid whitespace if not loading.
               <div className="h-5"></div> 
             )}
          </div>
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
