'use client'

import { useState, useCallback, useTransition } from 'react'
import { Plus, Rss, Layers, FileText, Pencil, Trash2, Loader2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listFeeds, getFeed, deleteFeed } from './actions'
import { FeedBuilder } from './FeedBuilder'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

function FeedCard({ feed, onEdit, onDelete, deleting }) {
  return (
    <div className="group relative flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Rss className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon-sm" onClick={() => onEdit(feed)} aria-label="Edit feed">
            <Pencil className="h-4 w-4 text-slate-500" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(feed)}
            disabled={deleting}
            aria-label="Delete feed"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : (
              <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
            )}
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onEdit(feed)}
        className="mt-4 text-left"
      >
        <h3 className="line-clamp-1 text-base font-semibold text-slate-900">{feed.title}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-slate-500">
          {feed.description || 'No description provided.'}
        </p>
      </button>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          <Layers className="h-3.5 w-3.5" />
          {feed.topic_count} {feed.topic_count === 1 ? 'topic' : 'topics'}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          <FileText className="h-3.5 w-3.5" />
          {feed.manual_post_count} added {feed.manual_post_count === 1 ? 'post' : 'posts'}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-400">
        <Clock className="h-3.5 w-3.5" />
        Updated {formatDate(feed.updated_at)}
      </div>
    </div>
  )
}

export function ManageFeedsClient({ initialFeeds }) {
  const [feeds, setFeeds] = useState(initialFeeds || [])
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editingFeed, setEditingFeed] = useState(null)
  const [loadingFeed, setLoadingFeed] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [, startTransition] = useTransition()

  const refreshFeeds = useCallback(async () => {
    const fresh = await listFeeds()
    setFeeds(fresh)
  }, [])

  const handleNew = useCallback(() => {
    setEditingFeed(null)
    setBuilderOpen(true)
  }, [])

  const handleEdit = useCallback(async (feed) => {
    setLoadingFeed(true)
    setBuilderOpen(true)
    setEditingFeed({ _id: feed._id, title: feed.title, description: feed.description, topics: [], manualPosts: [], topic_ids: feed.topic_ids, manual_post_ids: feed.manual_post_ids })
    try {
      const full = await getFeed(feed._id)
      if (full) setEditingFeed(full)
    } finally {
      setLoadingFeed(false)
    }
  }, [])

  const handleDelete = useCallback((feed) => {
    if (!window.confirm(`Delete the feed "${feed.title}"? This cannot be undone.`)) return
    setDeletingId(feed._id)
    startTransition(async () => {
      const res = await deleteFeed(feed._id)
      if (res?.success) {
        setFeeds((prev) => prev.filter((f) => f._id !== feed._id))
      } else {
        window.alert(res?.error || 'Failed to delete feed.')
      }
      setDeletingId(null)
    })
  }, [])

  const handleSaved = useCallback(async () => {
    setBuilderOpen(false)
    setEditingFeed(null)
    await refreshFeeds()
  }, [refreshFeeds])

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Feeds</h2>
          <p className="text-sm text-slate-500">
            {feeds.length} {feeds.length === 1 ? 'feed' : 'feeds'} curated for this project.
          </p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4" />
          New Feed
        </Button>
      </div>

      {feeds.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Rss className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-900">No feeds yet</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Build a feed by combining topics and individually selected posts so clients can review related content together.
          </p>
          <Button className="mt-6" onClick={handleNew}>
            <Plus className="h-4 w-4" />
            Create your first feed
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {feeds.map((feed) => (
            <FeedCard
              key={feed._id}
              feed={feed}
              onEdit={handleEdit}
              onDelete={handleDelete}
              deleting={deletingId === feed._id}
            />
          ))}
        </div>
      )}

      <FeedBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        feed={editingFeed}
        loadingFeed={loadingFeed}
        onSaved={handleSaved}
      />
    </div>
  )
}
