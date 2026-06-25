'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Layers, Loader2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getTopicForPost } from '@/lib/feeds/topic-membership-actions'
import { TopicPickerPanel } from './TopicPickerPanel'

function captionSuggestion(post) {
  const text = post?.caption || post?.post_content?.caption || ''
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

/** Compact topic control — sits inline with Re-run / Reset toolbar buttons. */
export function TopicAssignmentSection({ post, onShowToast }) {
  const [topic, setTopic] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)

  const postId = post?._id
  const titleSuggestion = useMemo(() => captionSuggestion(post), [post])

  const loadTopic = useCallback(async () => {
    if (!postId) {
      setTopic(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const res = await getTopicForPost(postId)
    setLoading(false)
    if (res?.success) {
      setTopic(res.topic)
    } else {
      onShowToast?.(res?.error || 'Failed to load topic.', 'error')
    }
  }, [postId, onShowToast])

  useEffect(() => {
    loadTopic()
  }, [loadTopic])

  const handleAssigned = (assignedTopic) => {
    setTopic(assignedTopic)
    onShowToast?.(`Assigned to "${assignedTopic.title}".`, 'success')
  }

  const handleCleared = () => {
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
