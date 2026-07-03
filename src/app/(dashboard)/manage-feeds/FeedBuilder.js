'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import {
  Search,
  Layers,
  Plus,
  X,
  Loader2,
  ImageOff,
  FileText,
  ChevronDown,
  ChevronRight,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { getRiskLabel } from '@/app/(dashboard)/cases/riskBuckets'
import {
  parsePostSearchDork,
  hasStructuredPostFilters,
  removeDorkToken,
  getDorkAutocompleteContext,
  insertDorkValue,
  DORK_OPERATORS,
} from '@/lib/feeds/post-search-dork'
import { searchTopics, searchPostsForFeed, createFeed, updateFeed } from './actions'

function captionSnippet(post, max = 200) {
  const text = post?.caption || ''
  return text.length > max ? `${text.slice(0, max)}…` : text || 'No caption'
}

function formatTopicDate(iso) {
  if (!iso) return '—'
  try {
    return format(new Date(iso), 'MMM d, yyyy')
  } catch {
    return '—'
  }
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
    <div
      className={cn(
        sizeClass,
        'flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400'
      )}
    >
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

function TopicResultRow({ topic, added, expanded, onToggleExpand, onAdd, onRemove }) {
  return (
    <li className="border-b border-slate-100 last:border-b-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          aria-expanded={expanded}
        >
          <span className="mt-0.5 shrink-0 text-slate-400">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug text-slate-900">{topic.title}</p>
            <p className="mt-1 text-xs text-slate-400">{topic.post_count} posts in topic</p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {added ? (
            <>
              <Badge variant="secondary" className="text-[11px] font-medium">
                Added
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onRemove(topic.topic_id)}
                className="h-8 w-8 text-slate-400 hover:text-red-600"
                aria-label={`Remove ${topic.title} from feed`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button variant="default" size="sm" onClick={() => onAdd(topic)}>
              <Plus className="h-4 w-4" /> Add topic
            </Button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 pl-10">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
            <div>
              <dt className="font-medium text-slate-500">First post found</dt>
              <dd className="mt-0.5 text-slate-700">{formatTopicDate(topic.first_posted_at)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Last post found</dt>
              <dd className="mt-0.5 text-slate-700">{formatTopicDate(topic.last_posted_at)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Post count</dt>
              <dd className="mt-0.5 text-slate-700">{topic.post_count}</dd>
            </div>
          </dl>
        </div>
      )}
    </li>
  )
}

function PostSearchInput({ value, onChange, onSearch, searching }) {
  const inputRef = useRef(null)
  const [cursorPos, setCursorPos] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const parsed = useMemo(() => parsePostSearchDork(value), [value])
  const autocomplete = useMemo(
    () => getDorkAutocompleteContext(value, cursorPos),
    [value, cursorPos]
  )

  const canSearch = Boolean(parsed.freeText || hasStructuredPostFilters(parsed.filters))

  const hasSuggestions =
    showSuggestions &&
    (autocomplete.kind === 'operators' ||
      (autocomplete.kind === 'platform' && autocomplete.suggestions?.length > 0) ||
      (autocomplete.kind === 'threat' && autocomplete.suggestions?.length > 0) ||
      autocomplete.kind === 'date')

  const handleChange = (e) => {
    onChange(e.target.value)
    setCursorPos(e.target.selectionStart ?? e.target.value.length)
    setShowSuggestions(true)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSearch) onSearch()
    }
  }

  const handleSelect = (selectedValue) => {
    const { query, cursorPos: newPos } = insertDorkValue(value, cursorPos, selectedValue)
    onChange(query)
    setCursorPos(newPos)
    setShowSuggestions(false)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(newPos, newPos)
    })
  }

  const handleSelectOperator = (op) => {
    const before = value.slice(0, cursorPos)
    const after = value.slice(cursorPos)
    const partialMatch = before.match(/(?:^|\s)(\w*)$/)
    const prefix = partialMatch ? before.slice(0, partialMatch.index ?? before.length) : before
    const spacer = prefix.length > 0 && !prefix.endsWith(' ') ? ' ' : ''
    const newQuery = `${prefix}${spacer}${op}`.replace(/\s+/g, ' ').trimStart()
    onChange(newQuery)
    setShowSuggestions(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            ref={inputRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onSelect={(e) => setCursorPos(e.target.selectionStart ?? 0)}
            onKeyUp={(e) => setCursorPos(e.currentTarget.selectionStart ?? 0)}
            onClick={(e) => setCursorPos(e.currentTarget.selectionStart ?? 0)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Search posts… platform:instagram threat:high from:2024-01-01"
            className="h-11 pl-9"
          />
          {hasSuggestions && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              <Command>
                <CommandList>
                  {autocomplete.kind === 'operators' && (
                    <CommandGroup heading="Operators">
                      {autocomplete.suggestions.map((op) => (
                        <CommandItem key={op} value={op} onSelect={() => handleSelectOperator(op)} className="text-xs">
                          {op}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {autocomplete.kind === 'platform' && (
                    <CommandGroup heading="Platform">
                      {autocomplete.suggestions.map((p) => (
                        <CommandItem key={p.id} value={p.id} onSelect={() => handleSelect(p.id)} className="text-xs">
                          {p.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {autocomplete.kind === 'threat' && (
                    <CommandGroup heading="Threat level">
                      {autocomplete.suggestions.map((t) => (
                        <CommandItem key={t.id} value={t.id} onSelect={() => handleSelect(t.id)} className="text-xs">
                          {t.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {autocomplete.kind === 'date' && (
                    <CommandEmpty className="px-3 py-2 text-xs text-slate-500">
                      Enter date as YYYY-MM-DD (e.g. 2024-06-01)
                    </CommandEmpty>
                  )}
                </CommandList>
              </Command>
            </div>
          )}
        </div>
        <Button
          type="button"
          onClick={onSearch}
          disabled={!canSearch || searching}
          className="h-11 shrink-0 px-4"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
        </Button>
      </div>

      {parsed.tokens.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {parsed.tokens.map((token) => (
            <Badge
              key={token.raw}
              variant="secondary"
              className="gap-1 pr-1 text-[11px] font-normal"
            >
              {token.raw}
              <button
                type="button"
                onClick={() => onChange(removeDorkToken(value, token.raw))}
                className="rounded p-0.5 hover:bg-slate-200"
                aria-label={`Remove filter ${token.raw}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400">
        Press Enter or click Search. Hybrid text + semantic search. Filters:{' '}
        {DORK_OPERATORS.map((op) => op.aliases.map((a) => `${a}:`).join(' / ')).join(', ')}.
        Date-only filters work without keywords.
      </p>
    </div>
  )
}

function FeedCompositionPanel({ icon: Icon, title, count, emptyMessage, children }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3">
        <Icon className="h-4 w-4 text-slate-500" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
        <Badge variant="secondary" className="ml-auto text-[11px]">
          {count}
        </Badge>
      </div>
      <div className="min-h-[120px] flex-1 overflow-y-auto p-3">
        {count === 0 ? (
          <p className="px-1 py-6 text-center text-xs leading-relaxed text-slate-400">{emptyMessage}</p>
        ) : (
          children
        )}
      </div>
    </div>
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
  const [expandedTopicIds, setExpandedTopicIds] = useState(() => new Set())

  const [postQuery, setPostQuery] = useState('')
  const [postHasSearched, setPostHasSearched] = useState(false)
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
    setExpandedTopicIds(new Set())
    setPostQuery('')
    setPostHasSearched(false)
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

  const runTopicSearch = useCallback(async () => {
    setTopicLoading(true)
    try {
      const res = await searchTopics(topicQuery)
      setTopicResults(res)
    } finally {
      setTopicLoading(false)
    }
  }, [topicQuery])

  useEffect(() => {
    if (!open) return
    runTopicSearch()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps -- load recent topics when panel opens

  const runPostSearch = useCallback(async () => {
    const parsed = parsePostSearchDork(postQuery)
    const searchable = Boolean(parsed.freeText || hasStructuredPostFilters(parsed.filters))
    if (!searchable) return

    setPostLoading(true)
    setPostHasSearched(true)
    try {
      const res = await searchPostsForFeed(postQuery)
      setPostResults(res)
    } finally {
      setPostLoading(false)
    }
  }, [postQuery])

  const selectedTopicIds = useMemo(() => new Set(selectedTopics.map((t) => t.topic_id)), [selectedTopics])
  const selectedPostIds = useMemo(() => new Set(selectedPosts.map((p) => p._id)), [selectedPosts])

  const toggleTopicExpand = useCallback((topicId) => {
    setExpandedTopicIds((prev) => {
      const next = new Set(prev)
      if (next.has(topicId)) next.delete(topicId)
      else next.add(topicId)
      return next
    })
  }, [])

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
          <div className="shrink-0 border-b border-red-100 bg-red-50 px-6 py-2 text-sm text-red-600">{error}</div>
        )}

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Left — search & browse */}
          <div className="order-2 flex min-h-0 min-w-0 flex-1 flex-col lg:order-1">
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
                <div className="flex shrink-0 gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={topicQuery}
                      onChange={(e) => setTopicQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          runTopicSearch()
                        }
                      }}
                      placeholder="Search topics by title…"
                      className="h-11 pl-9"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={runTopicSearch}
                    disabled={topicLoading}
                    className="h-11 shrink-0 px-4"
                  >
                    {topicLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                  </Button>
                </div>
                <p className="mt-2 shrink-0 text-xs text-slate-400">
                  Press Enter or click Search. Adding a topic includes all reviewed posts — leave search empty to
                  browse recent topics. Expand a row for post dates.
                </p>

                <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200">
                  {topicLoading ? (
                    <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching topics…
                    </div>
                  ) : topicResults.length === 0 ? (
                    <div className="flex h-40 items-center justify-center text-sm text-slate-400">No topics found.</div>
                  ) : (
                    <ul>
                      {topicResults.map((t) => (
                        <TopicResultRow
                          key={t.topic_id}
                          topic={t}
                          added={selectedTopicIds.has(t.topic_id)}
                          expanded={expandedTopicIds.has(t.topic_id)}
                          onToggleExpand={() => toggleTopicExpand(t.topic_id)}
                          onAdd={addTopic}
                          onRemove={removeTopic}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="posts" className="mt-0 flex min-h-0 flex-1 flex-col px-5 py-4 sm:px-6">
                <PostSearchInput
                  value={postQuery}
                  onChange={setPostQuery}
                  onSearch={runPostSearch}
                  searching={postLoading}
                />

                <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200">
                  {!postHasSearched ? (
                    <div className="flex h-40 flex-col items-center justify-center gap-1 px-6 text-center text-sm text-slate-400">
                      <Search className="mb-1 h-8 w-8 text-slate-300" />
                      Enter keywords or filters, then press Search or Enter
                    </div>
                  ) : postLoading ? (
                    <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching posts…
                    </div>
                  ) : postResults.length === 0 ? (
                    <div className="flex h-40 items-center justify-center text-sm text-slate-400">No matching posts.</div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {postResults.map((p) => {
                        const added = selectedPostIds.has(p._id)
                        const risk = getRiskLabel(p.review_details?.threat_score)
                        return (
                          <li key={p._id} className="flex items-start gap-4 px-4 py-4 hover:bg-slate-50">
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
                                  <Badge
                                    variant="outline"
                                    className={cn('border text-[11px]', risk.color)}
                                    title={`Score: ${p.review_details.threat_score}`}
                                  >
                                    {risk.label}
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
                              {added ? 'Added' : (
                                <>
                                  <Plus className="h-4 w-4" /> Add
                                </>
                              )}
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

          {/* Right — feed metadata & composition (primary) */}
          <div className="order-1 flex w-full shrink-0 flex-col border-b border-slate-200 bg-slate-50/50 lg:order-2 lg:w-[400px] lg:border-b-0 lg:border-l">
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 sm:p-6">
              <div className="shrink-0 space-y-4">
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
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4">
                <FeedCompositionPanel
                  icon={Layers}
                  title="Topics in this feed"
                  count={selectedTopics.length}
                  emptyMessage="No topics linked yet. Search on the left to add."
                >
                  <div className="flex flex-wrap gap-2">
                    {selectedTopics.map((t) => (
                      <SelectedTopicChip key={t.topic_id} topic={t} onRemove={removeTopic} />
                    ))}
                  </div>
                </FeedCompositionPanel>

                <FeedCompositionPanel
                  icon={FileText}
                  title="Posts in this feed"
                  count={selectedPosts.length}
                  emptyMessage="No individual posts added yet. Search on the left to add."
                >
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
                </FeedCompositionPanel>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
