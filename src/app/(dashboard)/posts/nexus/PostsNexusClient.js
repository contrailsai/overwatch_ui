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
import { formatPoiActivityRange } from '@/lib/pois/poi-helpers'
import { parsePoiNexusId } from '@/lib/nexus/poi-categories'
import {
  getNexusLeafStubs,
  getPostsNexusGraph,
  getNexusClusterPosts,
} from '@/app/(dashboard)/nexus/actions'

const PARENT_MODES = [
  { id: 'parent_topic', label: 'Parent topics' },
  { id: 'poi', label: 'POIs' },
  { id: 'profile', label: 'Profiles' },
]

const SHOWCASE_MS = 280

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

function CaseChrome({ title, onBack, onClose, children }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full bg-slate-100"
            onClick={onBack}
            title="Back to parent"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        <h2 className="min-w-0 flex-1 truncate text-base font-bold text-slate-900">{title}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full bg-slate-100"
          onClick={onClose}
          title="Close"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}

/** Full-area post content. Back returns to the parent node; close dismisses everything. */
function PostShowcaseOverlay({
  post,
  loading = false,
  error = false,
  onBack,
  onClose,
  project,
  clientDetails,
  projectEmails,
  onUpdateStatus,
  onUpdatePost,
  onShowToast,
}) {
  const [open, setOpen] = useState(false)
  const closingRef = useRef(false)
  const closeTimerRef = useRef(null)

  useEffect(() => {
    closingRef.current = false
    setOpen(false)
    const id = requestAnimationFrame(() => setOpen(true))
    return () => {
      cancelAnimationFrame(id)
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  const dismiss = useCallback((done) => {
    if (closingRef.current) return
    closingRef.current = true
    setOpen(false)
    closeTimerRef.current = setTimeout(() => {
      done?.()
    }, SHOWCASE_MS)
  }, [])

  const handleClose = useCallback(() => dismiss(onClose), [dismiss, onClose])
  const handleBack = useCallback(() => {
    if (onBack) dismiss(onBack)
  }, [dismiss, onBack])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  return (
    <div
      className={cn(
        'absolute inset-0 z-50 flex min-h-0 flex-col overflow-hidden bg-white shadow-xl',
        'transition-[opacity,transform] ease-out',
        open ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.985]'
      )}
      style={{ transitionDuration: `${SHOWCASE_MS}ms` }}
      role="dialog"
      aria-modal="true"
      aria-label="Post content"
    >
      {loading ? (
        <CaseChrome title="Post" onBack={onBack ? handleBack : null} onClose={handleClose}>
          <div className="p-4">
            <PostListSkeleton />
          </div>
        </CaseChrome>
      ) : error || !post ? (
        <CaseChrome title="Post" onBack={onBack ? handleBack : null} onClose={handleClose}>
          <p className="px-4 py-8 text-center text-sm text-rose-500">Could not load this post.</p>
        </CaseChrome>
      ) : (
        <CaseDetailPanel
          post={post}
          isOpen
          onBack={onBack ? handleBack : null}
          onClose={handleClose}
          project={project}
          clientDetails={clientDetails}
          projectEmails={projectEmails}
          onUpdateStatus={onUpdateStatus}
          onUpdatePost={onUpdatePost}
          onShowToast={onShowToast}
        />
      )}
    </div>
  )
}

function ClusterPostsPanel({
  node,
  onClose,
  onOpenPost,
  eyebrow = 'Cluster',
  onBack = null,
  detailsHref = null,
}) {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [isPending, startTransition] = useTransition()

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
    setPage(1)
    load(node.id, 1)
  }, [node?.id, load])

  const posts = result?.posts || []
  const totalPages = result?.totalPages || 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 gap-2">
        <div className="min-w-0 flex items-start gap-1">
          {onBack && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 -ml-1 mt-0.5"
              onClick={onBack}
              title="Back"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {eyebrow}
            </p>
            <h3 className="truncate text-sm font-bold text-slate-900">
              {result?.meta?.title || node?.label || node?.id}
            </h3>
            <p className="text-xs text-slate-500">
              {result?.totalCount ?? node?.count ?? 0} posts
              {formatPoiActivityRange(node?.firstSeen, node?.lastSeen)
                ? ` · ${formatPoiActivityRange(node.firstSeen, node.lastSeen)}`
                : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {detailsHref && (
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

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
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
            <FeedPostRow
              key={post._id}
              post={post}
              compact
              onOpen={() => onOpenPost?.(post)}
            />
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
  )
}

/** Parent-topic hub → list of child topics → posts for a topic. */
function ParentTopicPanel({ hub, topics, onClose, onOpenPost }) {
  const [selectedTopic, setSelectedTopic] = useState(null)

  useEffect(() => {
    setSelectedTopic(null)
  }, [hub?.id])

  if (selectedTopic) {
    return (
      <ClusterPostsPanel
        node={selectedTopic}
        eyebrow="Topic"
        onBack={() => setSelectedTopic(null)}
        onClose={onClose}
        onOpenPost={onOpenPost}
      />
    )
  }

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
                  onClick={() => setSelectedTopic(topic)}
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

/** Category hub → list of POI clusters → posts for a POI. */
function PoiCategoryPanel({ hub, pois, onClose, onOpenPost }) {
  const [selectedPoi, setSelectedPoi] = useState(null)

  useEffect(() => {
    setSelectedPoi(null)
  }, [hub?.id])

  if (selectedPoi) {
    return (
      <ClusterPostsPanel
        node={selectedPoi}
        eyebrow="POI"
        detailsHref={entityDetailsHref(selectedPoi, 'poi')}
        onBack={() => setSelectedPoi(null)}
        onClose={onClose}
        onOpenPost={onOpenPost}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Category
          </p>
          <h3 className="truncate text-sm font-bold text-slate-900">
            {hub?.label || hub?.id}
          </h3>
          <p className="text-xs text-slate-500">
            {pois.length} POI{pois.length === 1 ? '' : 's'}
            {hub?.count ? ` · ${hub.count} post${hub.count === 1 ? '' : 's'}` : ''}
            {formatPoiActivityRange(hub?.firstSeen, hub?.lastSeen)
              ? ` · ${formatPoiActivityRange(hub.firstSeen, hub.lastSeen)}`
              : ''}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose}>
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
                <li key={poi.id} className="flex items-center gap-1 rounded-lg pr-1 hover:bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setSelectedPoi(poi)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors"
                  >
                    {poi.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={poi.imageUrl}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full object-cover bg-slate-100"
                      />
                    ) : (
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ background: poi.familyColor || '#64748b' }}
                      >
                        {(poi.label || '?').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {poi.label || poi.id}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {poi.count ?? 0} post{(poi.count ?? 0) === 1 ? '' : 's'}
                        {formatPoiActivityRange(poi.firstSeen, poi.lastSeen)
                          ? ` · ${formatPoiActivityRange(poi.firstSeen, poi.lastSeen)}`
                          : ''}
                        {poi.isPrimary ? ' · Primary' : ''}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
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
  const violationLabels = useMemo(
    () => normalizeViolationLabels(project?.project_details?.labels),
    [project]
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

  const closeCase = useCallback(() => {
    postReq.current += 1
    setCaseOpen(false)
    setCaseReturn(null)
    setShowcasePost(null)
    setPostLoading(false)
    setPostError(false)
    setSelected(null)
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
        onClose={() => setSelected(null)}
        onOpenPost={(post) => openPost(post, selected)}
      />
    )
  } else if (parentMode === 'parent_topic' && selected?.type === 'hub') {
    const topics = (graphData?.nodes || [])
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
        onClose={() => setSelected(null)}
        onOpenPost={(post) => openPost(post, selected)}
      />
    )
  } else if (selected?.type === 'cluster' || selected?.type === 'hub') {
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
        onClose={() => setSelected(null)}
        onOpenPost={(post) => openPost(post, selected)}
      />
    )
  }

  const detailSize =
    selected?.type === 'hub' && (parentMode === 'poi' || parentMode === 'parent_topic')
      ? 'narrow'
      : selected?.type === 'cluster' || selected?.type === 'hub'
        ? 'medium'
        : null

  const emptyCopy =
    parentMode === 'profile'
      ? {
          title: 'No profile hubs yet',
          description:
            'Profiles appear once client-visible profiles exist (reviewed or with reviewed posts).',
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
        graphData={graphData}
        title="Posts understanding"
        subtitle="Leaves = posts · colors = violations"
        emptyTitle={emptyCopy.title}
        emptyDescription={emptyCopy.description}
        parentModes={PARENT_MODES}
        parentMode={parentMode}
        onParentModeChange={handleModeChange}
        onNeedLeaves={handleNeedLeaves}
        onSelectNode={handleSelectNode}
        detailPanel={detailPanel}
        detailSize={detailSize}
        violationLabels={violationLabels}
        defaultShowColors
      />
      {caseOpen && (
        <PostShowcaseOverlay
          post={showcasePost}
          loading={postLoading}
          error={postError}
          onBack={caseReturn ? backFromCase : null}
          onClose={closeCase}
          project={project}
          clientDetails={clientDetails}
          projectEmails={projectEmails}
          onUpdateStatus={handleUpdateStatus}
          onUpdatePost={handleUpdatePost}
          onShowToast={showToast}
        />
      )}
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
