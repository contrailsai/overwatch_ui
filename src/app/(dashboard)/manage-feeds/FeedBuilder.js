'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, Layers, Plus, X, Loader2, ImageOff, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { searchTopics, searchPostsForFeed, createFeed, updateFeed } from './actions'

function captionSnippet(post, max = 200) {
  const text = post?.caption || ''
  return text.length > max ? `${text.slice(0, max)}…` : text || 'No caption'
}

function PostThumb({ post, size = 'md' }) {
  const sizeClass = size === 'lg' ? 'h-20 w-20' : 'h-14 w-14'
  if (post?.signedImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={post.signedImageUrl}
        alt=""
        className={cn(sizeClass, 'shrink-0 rounded-lg border border-slate-200 object-cover')}
      />
    )
  }
  return (
    <div className={cn(sizeClass, 'flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400')}>
      <ImageOff className="h-6 w-6" />
    </div>
  )
}

function SelectedTopicChip({ topic, onRemove }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 py-1.5 pl-2.5 pr-1.5 text-xs font-medium text-blue-800">
      <span className="truncate">{topic.title}</span>
      <span className="shrink-0 text-blue-400">{topic.post_count} posts</span>
      <button
        type="button"
        onClick={() => onRemove(topic.topic_id)}
        className="shrink-0 rounded-md p-0.5 hover:bg-blue-100"
        aria-label={`Remove ${topic.title}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}

export function FeedBuilder({ open, onOpenChange, feed, loadingFeed, onSaved }) {
  const isEditing = Boolean(feed?._id)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTopics, setSelectedTopics] = useState([])
  const [selectedPosts, setSelectedPosts] = useState([])

  const [topicQuery, setTopicQuery] = useState('')
  const [topicResults, setTopicResults] = useState([])
  const [topicLoading, setTopicLoading] = useState(false)

  const [postQuery, setPostQuery] = useState('')
  const [postResults, setPostResults] = useState([])
  const [postLoading, setPostLoading] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('topics')

  useEffect(() => {
    if (!open) return
    setTitle(feed?.title || '')
    setDescription(feed?.description || '')
    setSelectedTopics(Array.isArray(feed?.topics) ? feed.topics : [])
    setSelectedPosts(Array.isArray(feed?.manualPosts) ? feed.manualPosts : [])
    setError('')
  }, [open, feed])

  useEffect(() => {
    if (open) return
    setTopicQuery('')
    setTopicResults([])
    setPostQuery('')
    setPostResults([])
    setActiveTab('topics')
  }, [open])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let active = true
    setTopicLoading(true)
    const handle = setTimeout(async () => {
      const res = await searchTopics(topicQuery)
      if (active) {
        setTopicResults(res)
        setTopicLoading(false)
      }
    }, 300)
    return () => {
      active = false
      clearTimeout(handle)
    }
  }, [topicQuery, open])

  useEffect(() => {
    if (!open) return
    const q = postQuery.trim()
    if (!q) {
      setPostResults([])
      setPostLoading(false)
      return
    }
    let active = true
    setPostLoading(true)
    const handle = setTimeout(async () => {
      const res = await searchPostsForFeed(q)
      if (active) {
        setPostResults(res)
        setPostLoading(false)
      }
    }, 400)
    return () => {
      active = false
      clearTimeout(handle)
    }
  }, [postQuery, open])

  const selectedTopicIds = useMemo(() => new Set(selectedTopics.map((t) => t.topic_id)), [selectedTopics])
  const selectedPostIds = useMemo(() => new Set(selectedPosts.map((p) => p._id)), [selectedPosts])

  const addTopic = useCallback((topic) => {
    setSelectedTopics((prev) => (prev.some((t) => t.topic_id === topic.topic_id) ? prev : [...prev, topic]))
  }, [])
  const removeTopic = useCallback((topicId) => {
    setSelectedTopics((prev) => prev.filter((t) => t.topic_id !== topicId))
  }, [])
  const addPost = useCallback((post) => {
    setSelectedPosts((prev) => (prev.some((p) => p._id === post._id) ? prev : [...prev, post]))
  }, [])
  const removePost = useCallback((postId) => {
    setSelectedPosts((prev) => prev.filter((p) => p._id !== postId))
  }, [])

  const handleSave = useCallback(async () => {
    setError('')
    if (!title.trim()) {
      setError('A feed title is required.')
      return
    }
    setSaving(true)
    const payload = {
      title,
      description,
      topic_ids: selectedTopics.map((t) => t.topic_id),
      manual_post_ids: selectedPosts.map((p) => p._id),
    }
    const res = isEditing ? await updateFeed(feed._id, payload) : await createFeed(payload)
    setSaving(false)
    if (res?.success) {
      onSaved()
    } else {
      setError(res?.error || 'Failed to save feed.')
    }
  }, [title, description, selectedTopics, selectedPosts, isEditing, feed, onSaved])

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-5xl flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        )}
        aria-hidden={!open}
      >
        {/* Header */}
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-9 w-9 shrink-0 rounded-full bg-slate-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-slate-900">
                  {isEditing ? 'Edit feed' : 'Create feed'}
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Topics stay live — new posts in a linked topic appear in this feed automatically.
                </p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || loadingFeed}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? 'Save changes' : 'Create feed'}
            </Button>
          </div>
        </header>

        {loadingFeed && (
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-blue-50 px-6 py-2 text-sm text-blue-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading feed details…
          </div>
        )}

        {error && (
          <div className="shrink-0 border-b border-red-100 bg-red-50 px-6 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Body: left = details + selection, right = browse/search */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Left column — feed metadata & current selection */}
          <div className="flex w-full shrink-0 flex-col border-b border-slate-200 lg:w-[340px] lg:border-b-0 lg:border-r">
            <div className="space-y-4 overflow-y-auto p-5 sm:p-6">
              <div className="space-y-1.5">
                <Label htmlFor="feed-title">Title</Label>
                <Input
                  id="feed-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Border dispute misinformation"
                  disabled={loadingFeed}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="feed-description">Description</Label>
                <Textarea
                  id="feed-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What should clients understand about this feed?"
                  rows={3}
                  disabled={loadingFeed}
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">In this feed</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="gap-1">
                    <Layers className="h-3 w-3" />
                    {selectedTopics.length} topics
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <FileText className="h-3 w-3" />
                    {selectedPosts.length} posts
                  </Badge>
                </div>
              </div>

              {selectedTopics.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected topics</p>
                  <div className="flex flex-col gap-2">
                    {selectedTopics.map((t) => (
                      <SelectedTopicChip key={t.topic_id} topic={t} onRemove={removeTopic} />
                    ))}
                  </div>
                </div>
              )}

              {selectedPosts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Added posts</p>
                  <ul className="space-y-2">
                    {selectedPosts.map((p) => (
                      <li
                        key={p._id}
                        className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5"
                      >
                        <PostThumb post={p} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-xs leading-snug text-slate-700">{captionSnippet(p, 100)}</p>
                          <p className="mt-1 text-[11px] capitalize text-slate-400">{p.platform}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => removePost(p._id)}
                          aria-label="Remove post"
                        >
                          <X className="h-3.5 w-3.5 text-slate-400" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedTopics.length === 0 && selectedPosts.length === 0 && (
                <p className="text-sm text-slate-400">
                  Use the panel on the right to search and add topics or individual posts.
                </p>
              )}
            </div>
          </div>

          {/* Right column — search & browse */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col gap-0">
              <div className="shrink-0 border-b border-slate-100 px-5 pt-4 sm:px-6">
                <TabsList className="w-full sm:w-auto">
                  <TabsTrigger value="topics" className="flex-1 gap-1.5 sm:flex-none">
                    <Layers className="h-4 w-4" />
                    Topics
                  </TabsTrigger>
                  <TabsTrigger value="posts" className="flex-1 gap-1.5 sm:flex-none">
                    <Search className="h-4 w-4" />
                    Posts
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="topics" className="mt-0 flex min-h-0 flex-1 flex-col px-5 py-4 sm:px-6">
                <div className="relative shrink-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={topicQuery}
                    onChange={(e) => setTopicQuery(e.target.value)}
                    placeholder="Search topics by title…"
                    className="h-11 pl-9"
                  />
                </div>
                <p className="mt-2 shrink-0 text-xs text-slate-400">
                  Adding a topic includes all of its reviewed posts. Leave search empty to browse recent topics.
                </p>

                <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200">
                  {topicLoading ? (
                    <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching topics…
                    </div>
                  ) : topicResults.length === 0 ? (
                    <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                      No topics found.
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {topicResults.map((t) => {
                        const added = selectedTopicIds.has(t.topic_id)
                        return (
                          <li
                            key={t.topic_id}
                            className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-slate-50"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium leading-snug text-slate-900">{t.title}</p>
                              <p className="mt-1 text-xs text-slate-400">{t.post_count} posts in topic</p>
                            </div>
                            <Button
                              variant={added ? 'secondary' : 'default'}
                              size="sm"
                              onClick={() => addTopic(t)}
                              disabled={added}
                              className="shrink-0"
                            >
                              {added ? 'Added' : (<><Plus className="h-4 w-4" /> Add topic</>)}
                            </Button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="posts" className="mt-0 flex min-h-0 flex-1 flex-col px-5 py-4 sm:px-6">
                <div className="relative shrink-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={postQuery}
                    onChange={(e) => setPostQuery(e.target.value)}
                    placeholder="Search reviewed posts by text, URL, or meaning…"
                    className="h-11 pl-9"
                  />
                </div>
                <p className="mt-2 shrink-0 text-xs text-slate-400">
                  Search uses the same hybrid text + semantic search as the content list.
                </p>

                <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200">
                  {!postQuery.trim() ? (
                    <div className="flex h-40 flex-col items-center justify-center gap-1 px-6 text-center text-sm text-slate-400">
                      <Search className="mb-1 h-8 w-8 text-slate-300" />
                      Type to search posts
                    </div>
                  ) : postLoading ? (
                    <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching posts…
                    </div>
                  ) : postResults.length === 0 ? (
                    <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                      No matching posts.
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {postResults.map((p) => {
                        const added = selectedPostIds.has(p._id)
                        return (
                          <li
                            key={p._id}
                            className="flex items-start gap-4 px-4 py-4 hover:bg-slate-50"
                          >
                            <PostThumb post={p} size="lg" />
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-3 text-sm leading-relaxed text-slate-800">
                                {captionSnippet(p, 280)}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="capitalize text-[11px]">
                                  {p.platform || 'unknown'}
                                </Badge>
                                {p.review_details?.threat_score != null && (
                                  <Badge variant="outline" className="text-[11px]">
                                    Score {p.review_details.threat_score}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Button
                              variant={added ? 'secondary' : 'default'}
                              size="sm"
                              onClick={() => addPost(p)}
                              disabled={added}
                              className="mt-1 shrink-0"
                            >
                              {added ? 'Added' : (<><Plus className="h-4 w-4" /> Add</>)}
                            </Button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </aside>
    </>
  )
}
