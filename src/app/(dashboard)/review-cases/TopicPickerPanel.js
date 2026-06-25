'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, X, Loader2, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { searchTopics } from '@/app/(dashboard)/manage-feeds/actions'
import { assignPostToTopic, createTopicForPost, clearPostTopic } from '@/lib/feeds/topic-membership-actions'

const Z = {
  pickerBackdrop: 'z-[55]',
  pickerPanel: 'z-[60]',
  createBackdrop: 'z-[65]',
  createPanel: 'z-[70]',
}

function preventEnterSubmit(e) {
  if (e.key === 'Enter') e.preventDefault()
}

/** Innermost panel — create a topic and assign this case (z-[65]/z-[70]). */
function CreateTopicPanel({
  open,
  postId,
  titleSuggestion = '',
  onOpenChange,
  onCreated,
  onError,
}) {
  const [newTitle, setNewTitle] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setNewTitle(titleSuggestion)
  }, [open, titleSuggestion])

  const handleCreate = useCallback(async () => {
    if (!postId || saving) return
    const trimmed = newTitle.trim()
    if (!trimmed) {
      onError?.('A topic title is required.')
      return
    }
    setSaving(true)
    const res = await createTopicForPost({ title: trimmed, postId })
    setSaving(false)
    if (res?.success) {
      onCreated?.(res.topic)
      onOpenChange(false)
    } else {
      onError?.(res?.error || 'Failed to create topic.')
    }
  }, [postId, newTitle, saving, onCreated, onOpenChange, onError])

  return (
    <>
      {open && (
        <div
          className={cn('fixed inset-0 bg-slate-900/50 backdrop-blur-sm', Z.createBackdrop)}
          onClick={() => !saving && onOpenChange(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-out',
          Z.createPanel,
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        )}
        aria-hidden={!open}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => !saving && onOpenChange(false)}
            className="h-9 w-9 shrink-0 rounded-full bg-slate-100"
            aria-label="Close"
            disabled={saving}
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-slate-900">Create topic</h2>
            <p className="mt-0.5 text-xs text-slate-500">This case becomes the first post in the new topic.</p>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col p-5">
          <div className="space-y-1.5">
            <Label htmlFor="new-topic-title">Topic title</Label>
            <Input
              id="new-topic-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                preventEnterSubmit(e)
                if (e.key === 'Enter' && newTitle.trim()) handleCreate()
              }}
              placeholder="e.g. Brand impersonation — summer campaign"
              disabled={saving}
              autoFocus
            />
          </div>
          <p className="mt-3 text-xs text-slate-400">1 post will be added to this topic.</p>
        </div>

        <footer className="flex shrink-0 gap-3 border-t border-slate-200 p-5">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={saving || !newTitle.trim()}
            className="flex-[2]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Plus className="mr-1.5 h-4 w-4" /> Create & assign</>)}
          </Button>
        </footer>
      </aside>
    </>
  )
}

/**
 * Pick an existing topic (z-[55]/z-[60]). Opens CreateTopicPanel on top for new topics.
 */
export function TopicPickerPanel({
  open,
  postId,
  currentTopic = null,
  titleSuggestion = '',
  onOpenChange,
  onAssigned,
  onCleared,
  onError,
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [topicQuery, setTopicQuery] = useState('')
  const [topicResults, setTopicResults] = useState([])
  const [topicLoading, setTopicLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const isEditing = Boolean(currentTopic?.topic_id)

  useEffect(() => {
    if (!open) {
      setCreateOpen(false)
      setTopicQuery('')
      setTopicResults([])
      return
    }
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const loadTopics = useCallback(async (query) => {
    setTopicLoading(true)
    try {
      const res = await searchTopics(query)
      setTopicResults(res)
    } finally {
      setTopicLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || createOpen) return
    let active = true
    const handle = setTimeout(async () => {
      await loadTopics(topicQuery)
      if (!active) return
    }, refreshKey > 0 && !topicQuery ? 0 : 400)
    return () => {
      active = false
      clearTimeout(handle)
    }
  }, [topicQuery, open, createOpen, refreshKey, loadTopics])

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  const handleSelectTopic = useCallback(async (topic) => {
    if (!postId || saving || topic.topic_id === currentTopic?.topic_id) return
    setSaving(true)
    const res = await assignPostToTopic(postId, topic.topic_id)
    setSaving(false)
    if (res?.success) {
      onAssigned?.(res.topic)
      onOpenChange(false)
    } else {
      onError?.(res?.error || 'Failed to assign topic.')
    }
  }, [postId, saving, currentTopic?.topic_id, onAssigned, onOpenChange, onError])

  const handleClear = useCallback(async () => {
    if (!postId || saving) return
    setSaving(true)
    const res = await clearPostTopic(postId)
    setSaving(false)
    if (res?.success) {
      onCleared?.()
      onOpenChange(false)
    } else {
      onError?.(res?.error || 'Failed to clear topic.')
    }
  }, [postId, saving, onCleared, onOpenChange, onError])

  const handleTopicCreated = useCallback((topic) => {
    setRefreshKey((k) => k + 1)
    onAssigned?.(topic)
    onOpenChange(false)
  }, [onAssigned, onOpenChange])

  return (
    <>
      {open && !createOpen && (
        <div
          className={cn('fixed inset-0 bg-slate-900/40 backdrop-blur-sm', Z.pickerBackdrop)}
          onClick={() => !saving && onOpenChange(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 right-0 flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-out',
          Z.pickerPanel,
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        )}
        aria-hidden={!open}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => !saving && onOpenChange(false)}
              className="h-9 w-9 shrink-0 rounded-full bg-slate-100"
              aria-label="Close"
              disabled={saving}
            >
              <X className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-slate-900">
                {isEditing ? 'Edit topic' : 'Add topic'}
              </h2>
              {currentTopic && (
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  Current: {currentTopic.title}
                </p>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={topicLoading || saving}
            className="h-9 w-9 shrink-0 text-slate-500"
            title="Refresh topics"
          >
            <RefreshCw className={cn('h-4 w-4', topicLoading && 'animate-spin')} />
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col p-5">
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={topicQuery}
              onChange={(e) => setTopicQuery(e.target.value)}
              onKeyDown={(e) => {
                preventEnterSubmit(e)
                if (e.key === 'Enter') handleRefresh()
              }}
              placeholder="Search topics by title…"
              className="h-10 pl-9"
              disabled={saving}
              autoFocus
            />
          </div>
          <p className="mt-2 shrink-0 text-xs text-slate-400">
            Empty search shows recent topics.
          </p>

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200">
            {topicLoading ? (
              <div className="flex h-32 items-center justify-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading topics…
              </div>
            ) : topicResults.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                No topics found.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {topicResults.map((t) => {
                  const isCurrent = t.topic_id === currentTopic?.topic_id
                  return (
                    <li
                      key={t.topic_id}
                      className={cn(
                        'flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50',
                        isCurrent && 'bg-violet-50/60'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-slate-900">{t.title}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {t.topic_id} · {t.post_count} posts
                          {isCurrent && ' · current'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant={isCurrent ? 'secondary' : 'default'}
                        size="sm"
                        onClick={() => handleSelectTopic(t)}
                        disabled={saving || isCurrent}
                        className="shrink-0"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isCurrent ? 'Current' : 'Select'}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <footer className="flex shrink-0 flex-col gap-2 border-t border-slate-200 p-5">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={saving}
              className="flex-[2]"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New topic
            </Button>
          </div>
          {isEditing && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleClear}
              disabled={saving}
              className="h-8 text-xs text-slate-500 hover:text-rose-600"
            >
              Remove from topic
            </Button>
          )}
        </footer>
      </aside>

      <CreateTopicPanel
        open={open && createOpen}
        postId={postId}
        titleSuggestion={titleSuggestion}
        onOpenChange={setCreateOpen}
        onCreated={handleTopicCreated}
        onError={onError}
      />
    </>
  )
}
