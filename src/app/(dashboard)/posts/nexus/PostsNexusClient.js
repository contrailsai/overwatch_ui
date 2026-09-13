'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { X, ChevronLeft, ChevronRight, ArrowUpRight } from 'lucide-react'
import { NexusGraphShell } from '@/components/nexus/NexusGraphShell'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FeedPostRow } from '@/app/(dashboard)/feeds/FeedPostRow'
import { CaseDetailPanel } from '@/app/(dashboard)/cases/CaseDetailPanel'
import { getPostById } from '@/app/(dashboard)/cases/actions'
import { cn } from '@/lib/utils'
import { normalizeViolationLabels } from '@/lib/nexus/colors'
import { parsePoiNexusId } from '@/lib/nexus/poi-categories'
import {
  getNexusLeafStubs,
  getPostsNexusGraph,
  getNexusClusterPosts,
} from '@/app/(dashboard)/nexus/actions'

const PARENT_MODES = [
  { id: 'parent_topic', label: 'Themes' },
  { id: 'poi', label: 'POIs' },
  { id: 'profile', label: 'Profiles' },
]

function graphWithoutEmptyTopics(graph) {
  if (!graph?.nodes?.length) return graph
  const hidden = new Set(
    graph.nodes
      .filter((node) => node.type === 'cluster' && !(node.count > 0))
      .map((node) => node.id)
  )
  if (!hidden.size) return graph
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => !hidden.has(node.id)),
    links: (graph.links || []).filter((link) => {
      const source = typeof link.source === 'object' ? link.source.id : link.source
      const target = typeof link.target === 'object' ? link.target.id : link.target
      return !hidden.has(String(source)) && !hidden.has(String(target))
    }),
    meta: {
      ...graph.meta,
      clusterCount: graph.nodes.filter((node) => node.type === 'cluster' && !hidden.has(node.id)).length,
    },
  }
}

function entityDetailsHref(node, kind) {
  if (!node?.id) return null
  if (kind === 'poi' || node.clusterKind === 'poi') {
    const parsed = parsePoiNexusId(node.id)
    return parsed.kind === 'poi' && parsed.poiId ? `/pois/${parsed.poiId}` : null
  }
  if (kind === 'profile' || node.hubKind === 'profile') {
    const id = String(node.id).replace(/^cluster:/, '')
    return /^[a-fA-F0-9]{24}$/.test(id) ? `/profiles/${id}` : null
  }
  return null
}

function PostListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading posts">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex gap-2.5 rounded-lg border border-slate-200 p-2.5">
          <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2 py-0.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

function PostDetailPane({
  post,
  loading = false,
  error = false,
  onBack,
  onClose,
  onNavigate,
  hasPrev = false,
  hasNext = false,
  project,
  clientDetails,
  projectEmails,
  onUpdateStatus,
  onUpdatePost,
  onShowToast,
}) {
  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          {onBack && (
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-slate-100" onClick={onBack} title="Back">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">Post</h2>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-slate-100" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4">
          <PostListSkeleton />
        </div>
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          {onBack && (
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-slate-100" onClick={onBack} title="Back">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">Post</h2>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-slate-100" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="px-4 py-8 text-center text-sm text-rose-500">Could not load this post.</p>
      </div>
    )
  }

  return (
    <CaseDetailPanel
      post={post}
      isOpen
      onBack={onBack}
      onClose={onClose}
      onNavigate={onNavigate}
      hasPrev={hasPrev}
      hasNext={hasNext}
      project={project}
      clientDetails={clientDetails}
      projectEmails={projectEmails}
      onUpdateStatus={onUpdateStatus}
      onUpdatePost={onUpdatePost}
      onShowToast={onShowToast}
    />
  )
}

function ClusterPostsPanel({
  node,
  onClose,
  onOpenPost,
  eyebrow = 'Cluster',
  onBack = null,
  detailsHref = null,
  activePost = null,
  postLoading = false,
  postError = false,
  onBackFromPost = null,
  project = null,
  clientDetails = null,
  projectEmails = null,
  onUpdateStatus = null,
  onUpdatePost = null,
  onShowToast = null,
}) {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [isPending, startTransition] = useTransition()
  const listRef = useRef(null)
  const pendingOpen = useRef(null)

  const load = useCallback((clusterId, nextPage) => {
    startTransition(async () => {
      try {
        const data = await getNexusClusterPosts(clusterId, nextPage, 25)
        setResult(data || { posts: [], totalCount: 0, totalPages: 0, meta: null })
      } catch (err) {
        console.error('getNexusClusterPosts failed', err)
        setResult({ posts: [], totalCount: 0, totalPages: 0, meta: null, error: true })
      }
    })
  }, [])

  useEffect(() => {
    if (!node?.id) return
    pendingOpen.current = null
    setPage(1)
    load(node.id, 1)
  }, [node?.id, load])

  const posts = result?.posts || []
  const totalPages = result?.totalPages || 0
  const expanded = Boolean(activePost || postLoading || postError)
  const activeId = activePost?._id
  const activeIndex = posts.findIndex((post) => String(post._id) === String(activeId))

  useEffect(() => {
    if (!pendingOpen.current || isPending || !posts.length) return
    const pick = pendingOpen.current === 'last' ? posts.at(-1) : posts[0]
    pendingOpen.current = null
    if (pick) onOpenPost?.(pick)
  }, [posts, isPending, onOpenPost])

  useEffect(() => {
    if (!expanded || activeId == null || !listRef.current) return
    const row = listRef.current.querySelector(`[data-post-id="${activeId}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [expanded, activeId, posts])

  const openPageEdge = useCallback((nextPage, edge) => {
    pendingOpen.current = edge
    setPage(nextPage)
    load(node.id, nextPage)
  }, [load, node?.id])

  const navigatePost = useCallback((dir) => {
    if (dir === 'next') {
      if (activeIndex >= 0 && activeIndex < posts.length - 1) {
        onOpenPost?.(posts[activeIndex + 1])
        return
      }
      if (page < totalPages) {
        openPageEdge(page + 1, 'first')
        return
      }
      if (activeIndex === -1 && posts[0]) onOpenPost?.(posts[0])
      return
    }
    if (activeIndex > 0) {
      onOpenPost?.(posts[activeIndex - 1])
      return
    }
    if (page > 1) {
      openPageEdge(page - 1, 'last')
      return
    }
    if (activeIndex === -1 && posts.length) onOpenPost?.(posts.at(-1))
  }, [activeIndex, posts, page, totalPages, onOpenPost, openPageEdge])

  const hasPrev = activeIndex > 0 || page > 1 || (activeIndex === -1 && (page > 1 || posts.length > 0))
  const hasNext = (activeIndex >= 0 && activeIndex < posts.length - 1) || page < totalPages || (activeIndex === -1 && (posts.length > 0 || page < totalPages))

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className={cn('flex h-full min-h-0 min-w-0 flex-col', expanded ? 'w-[280px] shrink-0 border-r border-slate-200' : 'flex-1')}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-start gap-1">
          {onBack && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-0.5 -ml-1 h-8 w-8 shrink-0"
              onClick={onBack}
              title="Back"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {eyebrow}
            </p>
            <h3 className="truncate text-sm font-bold text-slate-900">
              {result?.meta?.title || node?.label || node?.id}
            </h3>
            <p className="truncate text-xs text-slate-500">
              {result?.totalCount ?? node?.count ?? 0} posts
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {detailsHref && !expanded && (
            <Button asChild variant="outline" size="xs" className="shrink-0">
              <Link href={detailsHref} title="Show more details">
                Details
                <ArrowUpRight />
              </Link>
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
        {isPending && !posts.length ? (
          <PostListSkeleton />
        ) : result?.error ? (
          <p className="py-8 text-center text-sm text-rose-500">
            Could not load posts for this node. Try again.
          </p>
        ) : posts.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No posts in this cluster.</p>
        ) : (
          posts.map((post) => (
            <div key={post._id} data-post-id={post._id}>
              <FeedPostRow
                post={post}
                compact
                hideUnreviewedStatus
                isOpen={expanded && String(post._id) === String(activeId)}
                onOpen={() => onOpenPost?.(post)}
              />
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={page <= 1 || isPending}
            onClick={() => {
              const next = page - 1
              setPage(next)
              load(node.id, next)
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-slate-500">
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={page >= totalPages || isPending}
            onClick={() => {
              const next = page + 1
              setPage(next)
              load(node.id, next)
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      </div>
      {expanded && (
        <div className="h-full min-h-0 min-w-0 flex-1">
          <PostDetailPane
            post={activePost}
            loading={postLoading}
            error={postError}
            onBack={onBackFromPost}
            onClose={onBackFromPost}
            onNavigate={posts.length || totalPages > 1 ? navigatePost : null}
            hasPrev={hasPrev}
            hasNext={hasNext}
            project={project}
            clientDetails={clientDetails}
            projectEmails={projectEmails}
            onUpdateStatus={onUpdateStatus}
            onUpdatePost={onUpdatePost}
            onShowToast={onShowToast}
          />
        </div>
      )}
    </div>
  )
}

/** Parent-topic hub → list of child topics. Selecting a topic focuses that graph node. */
function ParentTopicPanel({ hub, topics, onClose, onSelectTopic }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Parent topic
          </p>
          <h3 className="truncate text-sm font-bold text-slate-900">
            {hub?.label || hub?.id}
          </h3>
          <p className="text-xs text-slate-500">
            {topics.length} topic{topics.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {topics.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No topics under this parent.</p>
        ) : (
          <ul className="space-y-0.5">
            {topics.map((topic) => (
              <li key={topic.id}>
                <button
                  type="button"
                  onClick={() => onSelectTopic?.(topic)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50 transition-colors"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: topic.familyColor || '#64748b' }}
                  >
                    {(topic.label || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {topic.label || topic.id}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {topic.count ?? 0} post{(topic.count ?? 0) === 1 ? '' : 's'}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Category hub → list of POI clusters. Selecting a POI focuses that graph node. */
function PoiCategoryPanel({ hub, pois, onClose, onSelectPoi }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Category
          </p>
          <h3 className="truncate text-sm font-bold text-slate-900">
            {hub?.label || hub?.id}
          </h3>
          <p className="truncate text-xs text-slate-500">
            {pois.length} POI{pois.length === 1 ? '' : 's'}
            {hub?.count ? ` · ${hub.count} post${hub.count === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {pois.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No POIs in this category.</p>
        ) : (
          <ul className="space-y-0.5">
            {pois.map((poi) => {
              const detailsHref = entityDetailsHref(poi, 'poi')
              return (
                <li key={poi.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-lg pr-1 hover:bg-slate-50">
                  <button
                    type="button"
                    onClick={() => onSelectPoi?.(poi)}
                    className="w-full min-w-0 rounded-lg px-2 py-2 text-left transition-colors"
                  >
                    <span className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                      {poi.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={poi.imageUrl}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover bg-slate-100"
                        />
                      ) : (
                        <span
                          className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ background: poi.familyColor || '#64748b' }}
                        >
                          {(poi.label || '?').slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {poi.label || poi.id}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {poi.count ?? 0} post{(poi.count ?? 0) === 1 ? '' : 's'}
                          {poi.isPrimary ? ' · Primary' : ''}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </span>
                  </button>
                  {detailsHref && (
                    <Link
                      href={detailsHref}
                      title="Show more details"
                      className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
                    >
                      Details
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export function PostsNexusClient({
  initialGraph,
  initialMode = 'parent_topic',
  project,
  clientDetails,
  projectEmails,
}) {
  const [parentMode, setParentMode] = useState(initialMode)
  const [graphData, setGraphData] = useState(initialGraph)
  const [selected, setSelected] = useState(null)
  const [showcasePost, setShowcasePost] = useState(null)
  const [caseOpen, setCaseOpen] = useState(false)
  const [caseReturn, setCaseReturn] = useState(null)
  const [postLoading, setPostLoading] = useState(false)
  const [postError, setPostError] = useState(false)
  const [toast, setToast] = useState(null)
  const [isPending, startTransition] = useTransition()
  const postReq = useRef(0)
  const toastTimer = useRef(null)
  const engineRef = useRef(null)
  const violationLabels = useMemo(
    () => normalizeViolationLabels(project?.project_details?.labels),
    [project]
  )
  const visibleGraph = useMemo(
    () => (parentMode === 'parent_topic' ? graphWithoutEmptyTopics(graphData) : graphData),
    [graphData, parentMode]
  )

  const showToast = useCallback((message, type = 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ message, type })
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const handleUpdatePost = useCallback((updatedPost) => {
    setShowcasePost((prev) => (
      prev && String(prev._id) === String(updatedPost?._id)
        ? { ...prev, ...updatedPost }
        : prev
    ))
  }, [])

  const handleUpdateStatus = useCallback((id, status) => {
    setShowcasePost((prev) => (
      prev && String(prev._id) === String(id)
        ? { ...prev, client_status: status }
        : prev
    ))
  }, [])

  const openPost = useCallback((post, returnNode = null) => {
    postReq.current += 1
    setPostLoading(false)
    setPostError(false)
    setCaseReturn(returnNode)
    setCaseOpen(true)
    setShowcasePost(post)
  }, [])

  const handleModeChange = useCallback((mode) => {
    postReq.current += 1
    setPostLoading(false)
    setPostError(false)
    setCaseOpen(false)
    setCaseReturn(null)
    setParentMode(mode)
    setSelected(null)
    setShowcasePost(null)
    startTransition(async () => {
      const next = await getPostsNexusGraph(mode)
      setGraphData(next)
    })
  }, [])

  const nodeById = useCallback(
    (id) => (graphData?.nodes || []).find((n) => n.id === id) || null,
    [graphData]
  )

  const focusNode = useCallback((id) => {
    engineRef.current?.selectById?.(id)
  }, [])

  const closeDetail = useCallback(() => {
    postReq.current += 1
    engineRef.current?.clearSelection?.()
    setSelected(null)
    setCaseOpen(false)
    setCaseReturn(null)
    setShowcasePost(null)
    setPostLoading(false)
    setPostError(false)
  }, [])

  const backFromCase = useCallback(() => {
    postReq.current += 1
    const parent = caseReturn
    setCaseOpen(false)
    setCaseReturn(null)
    setShowcasePost(null)
    setPostLoading(false)
    setPostError(false)
    setSelected(parent || null)
  }, [caseReturn])

  const handleSelectNode = useCallback((node) => {
    setPostError(false)
    if (node?.type !== 'leaf') {
      postReq.current += 1
      setCaseOpen(false)
      setCaseReturn(null)
      setShowcasePost(null)
      setPostLoading(false)
      setSelected(node)
      return
    }
    const parent = node.parentId ? nodeById(node.parentId) : null
    setCaseReturn(parent)
    setSelected(parent)
    setCaseOpen(true)
    setShowcasePost(null)
    const seq = postReq.current + 1
    postReq.current = seq
    setPostLoading(true)
    getPostById(project, node.id)
      .then((post) => {
        if (postReq.current !== seq) return
        setPostLoading(false)
        if (post) setShowcasePost(post)
        else setPostError(true)
      })
      .catch(() => {
        if (postReq.current !== seq) return
        setPostLoading(false)
        setPostError(true)
      })
  }, [project, nodeById])

  useEffect(() => {
    if (!caseOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') backFromCase()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [caseOpen, backFromCase])

  useEffect(() => {
    const id = setTimeout(() => {
      engineRef.current?.refocusSelection?.()
    }, 320)
    return () => clearTimeout(id)
  }, [caseOpen])

  const handleNeedLeaves = useCallback(
    (args, api) => {
      startTransition(async () => {
        const preset =
          parentMode === 'profile'
            ? 'posts-profiles'
            : parentMode === 'poi'
              ? 'posts-poi-categories'
              : 'posts-parent-topics'
        const stubs = await getNexusLeafStubs({
          preset,
          parentIds: args?.parentIds || [],
          labels: violationLabels,
        })
        api?.setLeaves?.(stubs)
      })
    },
    [parentMode, violationLabels]
  )

  let detailPanel = null
  if (parentMode === 'poi' && selected?.type === 'hub') {
    const pois = (graphData?.nodes || [])
      .filter((n) => n.type === 'cluster' && n.parentId === selected.id)
      .slice()
      .sort((a, b) => {
        if (Boolean(b.isPrimary) !== Boolean(a.isPrimary)) return b.isPrimary ? 1 : -1
        return (b.count ?? 0) - (a.count ?? 0)
      })
    detailPanel = (
      <PoiCategoryPanel
        hub={selected}
        pois={pois}
        onClose={closeDetail}
        onSelectPoi={(poi) => focusNode(poi.id)}
      />
    )
  } else if (parentMode === 'parent_topic' && selected?.type === 'hub') {
    const topics = (visibleGraph?.nodes || [])
      .filter((n) => n.type === 'cluster' && n.parentId === selected.id)
      .slice()
      .sort(
        (a, b) =>
          (b.count ?? 0) - (a.count ?? 0) ||
          String(a.label || a.id).localeCompare(String(b.label || b.id))
      )
    detailPanel = (
      <ParentTopicPanel
        hub={selected}
        topics={topics}
        onClose={closeDetail}
        onSelectTopic={(topic) => focusNode(topic.id)}
      />
    )
  } else if (selected?.type === 'cluster' || selected?.type === 'hub') {
    const parentHub =
      (parentMode === 'poi' || parentMode === 'parent_topic') && selected?.type === 'cluster'
        ? nodeById(selected.parentId)
        : null
    detailPanel = (
      <ClusterPostsPanel
        node={selected}
        eyebrow={
          parentMode === 'poi'
            ? 'POI'
            : parentMode === 'parent_topic' && selected?.type === 'cluster'
              ? 'Topic'
              : selected?.type === 'hub'
                ? 'Hub'
                : 'Cluster'
        }
        detailsHref={
          parentMode === 'poi'
            ? entityDetailsHref(selected, 'poi')
            : parentMode === 'profile'
              ? entityDetailsHref(selected, 'profile')
              : null
        }
        onBack={parentHub?.type === 'hub' ? () => focusNode(parentHub.id) : null}
        onClose={closeDetail}
        onOpenPost={(post) => openPost(post, selected)}
        activePost={caseOpen ? showcasePost : null}
        postLoading={caseOpen && postLoading}
        postError={caseOpen && postError}
        onBackFromPost={backFromCase}
        project={project}
        clientDetails={clientDetails}
        projectEmails={projectEmails}
        onUpdateStatus={handleUpdateStatus}
        onUpdatePost={handleUpdatePost}
        onShowToast={showToast}
      />
    )
  } else if (caseOpen) {
    detailPanel = (
      <PostDetailPane
        post={showcasePost}
        loading={postLoading}
        error={postError}
        onBack={backFromCase}
        onClose={backFromCase}
        project={project}
        clientDetails={clientDetails}
        projectEmails={projectEmails}
        onUpdateStatus={handleUpdateStatus}
        onUpdatePost={handleUpdatePost}
        onShowToast={showToast}
      />
    )
  }

  const postExpanded = caseOpen && (selected?.type === 'cluster' || selected?.type === 'hub' || !selected)
  const detailSize = postExpanded
    ? 'expanded'
    : selected?.type === 'hub' && (parentMode === 'poi' || parentMode === 'parent_topic')
      ? 'narrow'
      : selected?.type === 'cluster' || selected?.type === 'hub'
        ? 'medium'
        : null

  const emptyCopy =
    parentMode === 'profile'
      ? {
          title: 'No profile hubs yet',
          description:
            'Profiles appear once they are reviewed on review-profiles and have at least one reviewed post.',
        }
      : parentMode === 'poi'
        ? {
            title: 'No POI graph yet',
            description:
              'POI hubs are category types (Indian forces vs opposition, politicians, …) with POI clusters. Label pois.category on unique POIs from reviewed posts.',
          }
        : {
            title: 'No parent topics yet',
            description:
              'Create topics with parent_topic_id on children and reviewed post ids on child topics.posts[]. Switch to POIs or Profiles if those exist.',
          }

  return (
    <div className="relative flex flex-1 min-h-0 flex-col">
      {isPending && !caseOpen && (
        <div className="absolute right-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1 text-xs text-slate-500 shadow">
          Updating…
        </div>
      )}
      <NexusGraphShell
        graphData={visibleGraph}
        title="Nexus-posts"
        subtitle="Leaves = posts · colors = violations"
        emptyTitle={emptyCopy.title}
        emptyDescription={emptyCopy.description}
        parentModes={PARENT_MODES}
        parentMode={parentMode}
        onParentModeChange={handleModeChange}
        onNeedLeaves={handleNeedLeaves}
        onSelectNode={handleSelectNode}
        engineRef={engineRef}
        detailPanel={detailPanel}
        detailSize={detailSize}
        violationLabels={violationLabels}
        defaultShowColors
      />
      {toast && (
        <div
          className={cn(
            'fixed bottom-6 left-1/2 z-[60] w-[calc(100%-2.5rem)] max-w-md -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm font-medium text-white shadow-2xl',
            toast.type === 'success'
              ? 'border-emerald-400/50 bg-emerald-600/90'
              : 'border-rose-400/50 bg-rose-600/90'
          )}
          role="status"
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
