'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Layers, Loader2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TopicPickerPanel } from './TopicPickerPanel'
import {
  fetchTopicForPost,
  getCachedTopicForPost,
  setCachedTopicForPost,
} from './topic-cache'

function captionSuggestion(post) {
  const text = post?.caption || post?.post_content?.caption || ''
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

/** Compact topic control — sits inline with Re-run / Reset toolbar buttons. */
export function TopicAssignmentSection({ post, onShowToast }) {
  const postId = post?._id
  const cachedTopic = postId ? getCachedTopicForPost(postId) : undefined

  const [topic, setTopic] = useState(() => (cachedTopic !== undefined ? cachedTopic : null))
  const [loading, setLoading] = useState(() => cachedTopic === undefined && Boolean(postId))
  const [pickerOpen, setPickerOpen] = useState(false)

  const titleSuggestion = useMemo(() => captionSuggestion(post), [post])

  const loadTopic = useCallback(async () => {
    if (!postId) {
      setTopic(null)
      setLoading(false)
      return
    }

    const cached = getCachedTopicForPost(postId)
    if (cached !== undefined) {
      setTopic(cached)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const nextTopic = await fetchTopicForPost(postId)
      setTopic(nextTopic)
    } catch (err) {
      onShowToast?.(err.message || 'Failed to load topic.', 'error')
    } finally {
      setLoading(false)
    }
  }, [postId, onShowToast])

  useEffect(() => {
    loadTopic()
  }, [loadTopic])

  const handleAssigned = (assignedTopic) => {
    setCachedTopicForPost(postId, assignedTopic)
    setTopic(assignedTopic)
    onShowToast?.(`Assigned to "${assignedTopic.title}".`, 'success')
  }

  const handleCleared = () => {
    setCachedTopicForPost(postId, null)
    setTopic(null)
    onShowToast?.('Topic assignment cleared.', 'success')
  }

  const hasTopic = Boolean(topic?.topic_id)

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setPickerOpen(true)}
        disabled={loading}
        title={hasTopic ? `${topic.title} (${topic.topic_id})` : 'Assign this case to a topic'}
        className={cn(
          'cursor-pointer h-7 w-full px-3 text-xs rounded-full border transition-colors',
          hasTopic
            ? 'bg-violet-50/80 text-violet-700 border-violet-200 hover:bg-violet-100 hover:text-violet-800'
            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-800'
        )}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
        ) : hasTopic ? (
          <Pencil className="w-3 h-3 mr-1.5" />
        ) : (
          <Plus className="w-3 h-3 mr-1.5" />
        )}
        {!loading && (hasTopic ? 'Edit topic' : 'Add topic')}
        {hasTopic && !loading && (
          <Layers className="w-3 h-3 ml-1.5 opacity-60" />
        )}
      </Button>

      <TopicPickerPanel
        open={pickerOpen}
        postId={postId}
        currentTopic={topic}
        titleSuggestion={titleSuggestion}
        onOpenChange={setPickerOpen}
        onAssigned={handleAssigned}
        onCleared={handleCleared}
        onError={(msg) => onShowToast?.(msg, 'error')}
      />
    </>
  )
}
