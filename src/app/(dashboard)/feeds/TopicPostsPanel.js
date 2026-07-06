'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { CaseDetailPanel } from '@/app/(dashboard)/cases/CaseDetailPanel'
import { getTopicPosts } from './actions'
import { FeedPostRow } from './FeedPostRow'
import { TopicPublishingChart } from './TopicPublishingChart'

const PUBLISH_DATE_SORT = { field: 'published_date', direction: 'desc' }

export function TopicPostsPanel({
  topic,
  onClose,
  project,
  clientDetails,
  projectEmails,
}) {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [mergedPosts, setMergedPosts] = useState([])
  const [selectedPost, setSelectedPost] = useState(null)
  const [updatedCases, setUpdatedCases] = useState({})
  const [isPending, startTransition] = useTransition()

  const loadPosts = useCallback((topicId, nextPage) => {
    startTransition(async () => {
      const data = await getTopicPosts(topicId, nextPage, 25, PUBLISH_DATE_SORT)
      setResult(data)
      setMergedPosts(data.posts || [])
      setSelectedPost(null)
      setUpdatedCases({})
    })
  }, [])

  useEffect(() => {
    if (!topic?.id) {
      setResult(null)
      setMergedPosts([])
      setSelectedPost(null)
      setUpdatedCases({})
      return
    }
    setPage(1)
    loadPosts(topic.id, 1)
  }, [topic?.id, loadPosts])

  const handleClosePanel = useCallback(() => {
    setSelectedPost(null)
    setUpdatedCases({})
    onClose?.()
  }, [onClose])

  const handleUpdatePost = useCallback((updatedPost) => {
    setMergedPosts((prev) => prev.map((p) => (p._id === updatedPost._id ? updatedPost : p)))
    setSelectedPost((prev) =>
      prev && prev._id === updatedPost._id ? { ...prev, ...updatedPost } : prev
    )
  }, [])

  const openCase = useCallback((post) => {
    setSelectedPost(post)
  }, [])

  const navigatePost = useCallback(
    (direction) => {
      if (!selectedPost) return
      const currentIndex = mergedPosts.findIndex((p) => p._id === selectedPost._id)
      if (currentIndex === -1) return
      const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1
      if (nextIndex < 0 || nextIndex >= mergedPosts.length) return
      setSelectedPost(mergedPosts[nextIndex])
    },
    [selectedPost, mergedPosts]
  )

  if (!topic) return null

  const posts = mergedPosts
  const totalCount = result?.totalCount || topic.postCount || 0
  const totalPages = result?.totalPages || 0
  const topicMeta = result?.topic
  const histogram = result?.histogram || []
  const allowDoTakedown = clientDetails?.permission === 'reviewer' || clientDetails?.do_takedown === true

  const handlePageChange = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages) return
    setPage(nextPage)
    loadPosts(topic.id, nextPage)
  }

  const selectedIndex = selectedPost ? posts.findIndex((p) => p._id === selectedPost._id) : -1

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="flex h-full min-h-0 flex-col px-4 py-3">
        <div className="shrink-0 border-b border-slate-200 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {topicMeta?.topicType || topic.topicType || 'active'}
                {(topicMeta?.category || topic.category) && (
                  <span> · {topicMeta?.category || topic.category}</span>
                )}
              </div>
              <h2 className="mt-1 text-base font-bold leading-snug text-slate-900">
                {topicMeta?.title || topic.title}
              </h2>
              <p className="mt-1 text-[11px] font-medium text-slate-500">{topic.id}</p>
            </div>
            <button
              type="button"
              onClick={handleClosePanel}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {topicMeta?.narrative && (
            <p className="mt-2 text-xs leading-relaxed text-slate-600">{topicMeta.narrative}</p>
          )}
          <p className="mt-2 text-xs font-semibold text-slate-500">
            {totalCount} {totalCount === 1 ? 'post' : 'posts'} · sorted by publish date
          </p>
        </div>

        {histogram.length > 0 && (
          <div className="shrink-0 border-b border-slate-200 py-2">
            <TopicPublishingChart data={histogram} />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto py-3">
          {isPending && !posts.length ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : posts.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No reviewed posts in this topic yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {posts.map((post) => (
                <FeedPostRow
                  key={post._id}
                  post={post}
                  allowDoTakedown={allowDoTakedown}
                  renderAs="compact"
                  isOpen={selectedPost?._id === post._id}
                  onOpen={openCase}
                />
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="shrink-0 flex items-center justify-between border-t border-slate-200 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || isPending}
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className={cn('text-xs font-medium text-slate-500', isPending && 'opacity-60')}>
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isPending}
              onClick={() => handlePageChange(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {selectedPost && (
        <div className="absolute inset-0 z-40 flex h-full w-full flex-col overflow-hidden bg-white">
          <CaseDetailPanel
            post={{
              ...selectedPost,
              client_status: updatedCases[selectedPost._id] || selectedPost.client_status,
            }}
            project={project}
            clientDetails={clientDetails}
            projectEmails={projectEmails}
            isOpen
            isMobileLayout={false}
            stackedLayout
            onClose={() => setSelectedPost(null)}
            onNavigate={navigatePost}
            hasPrev={selectedIndex > 0}
            hasNext={selectedIndex >= 0 && selectedIndex < posts.length - 1}
            onUpdateStatus={(id, status) => setUpdatedCases((prev) => ({ ...prev, [id]: status }))}
            onUpdatePost={handleUpdatePost}
            onShowToast={(msg) => window.alert(msg)}
          />
        </div>
      )}
    </div>
  )
}
