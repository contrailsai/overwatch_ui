'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Pencil, Quote, Sparkles } from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import PageHeader from '@/components/PageHeader'
import { DateRangeControls } from '@/components/analytics/DateRangeControls'
import {
  PostCard,
  PlatformIcon,
  platformLabel,
  formatViolation,
} from '@/components/analytics/PostCard'
import { fillTimeline } from '@/components/analytics/fillTimeline'
import { CaseDetailPanel } from '@/app/(dashboard)/cases/CaseDetailPanel'
import { getPostById } from '@/app/(dashboard)/cases/actions'
import { getPoiAigcPosts, getPoiRecentPosts } from '../actions'
import { useIsMobile } from '@/hooks/use-media-query'
import { DEFAULT_INFORMATICS_RANGE_PRESET, POI_POSTS_PAGE_SIZE } from '@/lib/pois/poi-helpers'

const PLATFORM_COLORS = {
  instagram: '#e1306c',
  facebook: '#1877f2',
  x: '#475569',
  twitter: '#1da1f2',
  youtube: '#ff0000',
  reddit: '#ff4500',
  unknown: '#94a3b8',
}

const VIOLATION_COLORS = [
  'var(--primary)',
  '#dc2626',
  '#ea580c',
  '#2563eb',
  '#0891b2',
  '#7c3aed',
  '#db2777',
  '#65a30d',
]

const TIER_STYLES = {
  primary: 'bg-primary text-primary-foreground border-primary',
  secondary: 'bg-sky-50 text-sky-800 border-sky-200',
  other: 'bg-slate-100 text-slate-600 border-slate-200',
}

function PoiAvatar({ poi, size = 'lg' }) {
  const src = poi.image?.signed_url
  const initial = (poi.display_name || '?').charAt(0).toUpperCase()
  const sizeClass = size === 'lg' ? 'h-16 w-16 sm:h-20 sm:w-20 text-xl sm:text-2xl' : 'h-10 w-10 text-sm'
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={cn(sizeClass, 'rounded-full object-cover border border-slate-200 bg-slate-100 shrink-0')}
      />
    )
  }
  return (
    <div
      className={cn(
        sizeClass,
        'rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-semibold border border-slate-300 shrink-0'
      )}
    >
      {initial}
    </div>
  )
}

function formatFollowers(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '-'
  return Number(value).toLocaleString()
}

function ProfileAvatar({ profile }) {
  const initial = (profile.display_name || profile.username || '?').charAt(0).toUpperCase()
  if (profile.profile_pic) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profile.profile_pic}
        alt=""
        className="h-8 w-8 rounded-full object-cover border border-slate-200 bg-slate-100 shrink-0"
      />
    )
  }
  return (
    <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-semibold border border-slate-300 shrink-0">
      {initial}
    </div>
  )
}

function pagerPages(current, total) {
  if (total <= 1) return []
  let start = Math.max(1, current - 1)
  let end = Math.min(total, current + 1)
  if (current <= 1) end = Math.min(total, 3)
  if (current >= total) start = Math.max(1, total - 2)
  const pages = []
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
}

export function PoiOverview({
  poi,
  analytics,
  profiles = [],
  posts = [],
  postsMeta = {},
  aigcPosts = [],
  aigcMeta = {},
  range = {},
  isReviewer,
  project,
  clientDetails,
  projectEmails,
}) {
  const isMobile = useIsMobile()
  const [showDeepfakes, setShowDeepfakes] = useState(false)
  const [loadedPosts, setLoadedPosts] = useState(posts)
  const [postsPage, setPostsPage] = useState(postsMeta.page || 1)
  const [postsHasMore, setPostsHasMore] = useState(Boolean(postsMeta.hasMore))
  const [postsTotal, setPostsTotal] = useState(postsMeta.total || posts.length)
  const [loadedAigc, setLoadedAigc] = useState(aigcPosts)
  const [aigcPage, setAigcPage] = useState(aigcMeta.page || 1)
  const [aigcHasMore, setAigcHasMore] = useState(Boolean(aigcMeta.hasMore))
  const [aigcTotal, setAigcTotal] = useState(aigcMeta.total || aigcPosts.length)
  const [loadingMore, setLoadingMore] = useState(false)
  const [caseOpen, setCaseOpen] = useState(false)
  const [openPage, setOpenPage] = useState(1)
  const [openPosts, setOpenPosts] = useState([])
  const [listLoading, setListLoading] = useState(false)
  const [detailPost, setDetailPost] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (message, type = 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const displayedPosts = showDeepfakes ? loadedAigc : loadedPosts
  const displayedHasMore = showDeepfakes ? aigcHasMore : postsHasMore
  const displayedTotal = showDeepfakes ? aigcTotal : postsTotal
  const openTotalPages = Math.max(1, Math.ceil(displayedTotal / POI_POSTS_PAGE_SIZE))
  const platformData = useMemo(
    () =>
      (analytics?.platforms || []).map((p) => ({
        name: platformLabel(p.platform),
        value: p.count,
        platform: p.platform,
        color: PLATFORM_COLORS[String(p.platform || '').toLowerCase()] || PLATFORM_COLORS.unknown,
      })),
    [analytics]
  )

  const violationData = useMemo(
    () =>
      (analytics?.violations || []).map((v, i) => ({
        name: formatViolation(v.type),
        count: v.count,
        fill: VIOLATION_COLORS[i % VIOLATION_COLORS.length],
      })),
    [analytics]
  )

  const timelineData = useMemo(
    () => fillTimeline(analytics?.timeline, analytics?.from, analytics?.to),
    [analytics]
  )

  const totalPlatform = platformData.reduce((s, d) => s + d.value, 0)
  const inRangeCount = analytics?.totalInRange ?? 0

  const loadDetail = useCallback(async (postId) => {
    if (!postId) return
    setDetailLoading(true)
    try {
      const full = await getPostById(project, postId)
      setDetailPost(full)
    } catch {
      setDetailPost(null)
    } finally {
      setDetailLoading(false)
    }
  }, [project])

  const openCase = useCallback((post, pagePosts, page) => {
    setCaseOpen(true)
    setOpenPage(page)
    setOpenPosts(pagePosts)
    loadDetail(post?._id)
  }, [loadDetail])

  const selectFromGrid = (post) => {
    const index = displayedPosts.findIndex((item) => item._id === post._id)
    const page = Math.floor(Math.max(index, 0) / POI_POSTS_PAGE_SIZE) + 1
    const start = (page - 1) * POI_POSTS_PAGE_SIZE
    openCase(post, displayedPosts.slice(start, start + POI_POSTS_PAGE_SIZE), page)
  }

  const fetchPage = useCallback(async (page, deepfakes = showDeepfakes) => {
    const fetcher = deepfakes ? getPoiAigcPosts : getPoiRecentPosts
    return fetcher(poi._id, range, { page, limit: POI_POSTS_PAGE_SIZE })
  }, [poi._id, range, showDeepfakes])

  const goToOpenPage = async (page) => {
    if (page < 1 || page > openTotalPages || listLoading) return
    setListLoading(true)
    try {
      const res = await fetchPage(page)
      setOpenPage(res?.page || page)
      setOpenPosts(res?.posts || [])
    } finally {
      setListLoading(false)
    }
  }

  const loadMore = async () => {
    if (!displayedHasMore || loadingMore) return
    const nextPage = (showDeepfakes ? aigcPage : postsPage) + 1
    setLoadingMore(true)
    try {
      const res = await fetchPage(nextPage)
      const nextPosts = res?.posts || []
      if (showDeepfakes) {
        setLoadedAigc((prev) => [...prev, ...nextPosts])
        setAigcPage(res?.page || nextPage)
        setAigcHasMore(Boolean(res?.hasMore))
        if (typeof res?.total === 'number') setAigcTotal(res.total)
      } else {
        setLoadedPosts((prev) => [...prev, ...nextPosts])
        setPostsPage(res?.page || nextPage)
        setPostsHasMore(Boolean(res?.hasMore))
        if (typeof res?.total === 'number') setPostsTotal(res.total)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  const closeCase = () => {
    setCaseOpen(false)
    setDetailPost(null)
  }

  const selectedIndex = openPosts.findIndex((item) => item._id === detailPost?._id)

  const navigateCase = async (dir) => {
    const nextIndex = selectedIndex + (dir === 'next' ? 1 : -1)
    if (nextIndex >= 0 && nextIndex < openPosts.length) {
      loadDetail(openPosts[nextIndex]._id)
      return
    }
    if (dir === 'next' && openPage < openTotalPages) {
      setListLoading(true)
      try {
        const res = await fetchPage(openPage + 1)
        const next = res?.posts || []
        setOpenPage(res?.page || openPage + 1)
        setOpenPosts(next)
        if (next[0]) loadDetail(next[0]._id)
      } finally {
        setListLoading(false)
      }
      return
    }
    if (dir === 'prev' && openPage > 1) {
      setListLoading(true)
      try {
        const res = await fetchPage(openPage - 1)
        const prev = res?.posts || []
        setOpenPage(res?.page || openPage - 1)
        setOpenPosts(prev)
        if (prev.length) loadDetail(prev[prev.length - 1]._id)
      } finally {
        setListLoading(false)
      }
    }
  }

  const toggleDeepfakes = async () => {
    const next = !showDeepfakes
    setShowDeepfakes(next)
    if (!caseOpen) return
    setListLoading(true)
    try {
      const res = await fetchPage(1, next)
      setOpenPage(res?.page || 1)
      setOpenPosts(res?.posts || [])
    } finally {
      setListLoading(false)
    }
  }

  const profileBlock = (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-100">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Top Posting Profiles
        </h2>
      </div>
      {profiles.length === 0 ? (
        <p className="text-xs text-slate-400 px-3 py-6 text-center">No profiles in this range</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-3 py-2 font-medium">Profile</th>
                <th className="px-2 py-2 font-medium text-right">Followers</th>
                <th className="px-2 py-2 font-medium text-right">Posts</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p, i) => (
                <tr
                  key={`${p.profile_id || p.username}-${i}`}
                  className="border-b border-slate-50 last:border-0"
                >
                  <td className="px-3 py-2">
                    {p.profile_id ? (
                      <Link href={`/profiles/${p.profile_id}`} className="flex items-center gap-2 min-w-0 hover:underline">
                        <ProfileAvatar profile={p} />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate max-w-[120px]">
                            {p.display_name || p.username}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate inline-flex items-center gap-1">
                            <PlatformIcon platform={p.platform} className="w-3 h-3" />
                            {platformLabel(p.platform)}
                          </div>
                        </div>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0">
                        <ProfileAvatar profile={p} />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate max-w-[120px]">
                            {p.display_name || p.username}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate inline-flex items-center gap-1">
                            <PlatformIcon platform={p.platform} className="w-3 h-3" />
                            {platformLabel(p.platform)}
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-500">{formatFollowers(p.follower_count)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-700">{p.posts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )

  const graphsBlock = (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
          Content Trend
        </h2>
        {timelineData.length === 0 || timelineData.every((d) => d.count === 0) ? (
          <p className="text-xs text-slate-400 py-6 text-center">No posts in this range</p>
        ) : (
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="poiPostsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: '#64748b' }}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  allowDecimals={false}
                  width={24}
                  tick={{ fontSize: 9, fill: '#64748b' }}
                />
                <Tooltip
                  formatter={(value) => [value, 'Posts']}
                  labelFormatter={(label) => label}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#poiPostsFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
          Platform Breakdown
        </h2>
        {platformData.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">No posts in this range</p>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-28 w-28 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={platformData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={28}
                    outerRadius={44}
                    paddingAngle={2}
                  >
                    {platformData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [
                      `${value} (${totalPlatform ? Math.round((value / totalPlatform) * 100) : 0}%)`,
                      name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1 flex-1 min-w-0">
              {platformData.map((p) => (
                <li key={p.name} className="flex items-center justify-between text-[11px] gap-2">
                  <span className="flex items-center gap-1.5 text-slate-700 min-w-0">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: p.color }}
                    />
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="tabular-nums text-slate-500 shrink-0">
                    {p.value} · {totalPlatform ? Math.round((p.value / totalPlatform) * 100) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
          Risk & Violation Breakdown
        </h2>
        {violationData.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">No violations in this range</p>
        ) : (
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={violationData} layout="vertical" margin={{ left: 0, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 9, fill: '#64748b' }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={72}
                  tick={{ fontSize: 9, fill: '#475569' }}
                />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {violationData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )

  const recentPostsBlock = (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3 px-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Recent Posts
        </h2>
        <Button
          type="button"
          size="sm"
          variant={showDeepfakes ? 'default' : 'outline'}
          className="h-7 px-2.5 text-[11px]"
          onClick={toggleDeepfakes}
          aria-pressed={showDeepfakes}
        >
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          Deepfakes
          {aigcTotal > 0 ? (
            <span className="ml-1.5 tabular-nums opacity-80">{aigcTotal}</span>
          ) : null}
        </Button>
      </div>
      {displayedPosts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-8 text-center text-sm text-slate-400">
          {showDeepfakes ? 'No AI-generated posts in this range' : 'No recent posts in this range'}
        </div>
      ) : (
        <>
        <ul className="columns-1 sm:columns-2 xl:columns-3 gap-3 [column-fill:_balance]">
          {displayedPosts.map((post, idx) => (
            <PostCard
              key={post?._id || post?.original_url || `poi-post-${idx}`}
              post={post}
              onSelect={selectFromGrid}
            />
          ))}
        </ul>
        {displayedHasMore ? (
          <div className="flex justify-center pt-2 pb-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Load more posts
            </Button>
          </div>
        ) : null}
        </>
      )}
    </section>
  )

  const infoCard = (
    <section className="relative bg-white border border-slate-200 rounded-xl p-5">
      {isReviewer ? (
        <Button asChild size="sm" className="absolute top-4 right-4 z-10">
          <Link href={`/pois/${poi._id}/edit`}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Link>
        </Button>
      ) : null}
      <div className={cn('flex items-start gap-4', isReviewer && 'pr-20')}>
        <PoiAvatar poi={poi} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight truncate">
              {poi.display_name}
            </h2>
            <Badge variant="outline" className={cn('capitalize', TIER_STYLES[poi.tier])}>
              {poi.tier}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {[poi.meta?.title, poi.meta?.organization, poi.meta?.state].filter(Boolean).join(' · ') ||
              'Person of interest'}
          </p>
          <p className="text-xs text-slate-400 mt-2 tabular-nums">
            {inRangeCount.toLocaleString()} posts in range
          </p>
          {(poi.linked_aliases || []).length > 0 || (poi.alias_poi_names || []).length > 0 ? (
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Also known as
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(poi.linked_aliases?.length
                  ? poi.linked_aliases
                  : (poi.alias_poi_names || []).map((name) => ({ name, display_name: name }))
                ).map((alias) => (
                  <Badge
                    key={alias._id || alias.name}
                    variant="outline"
                    className="text-xs font-normal text-slate-600 border-slate-200 bg-slate-50"
                  >
                    {alias.display_name || alias.name}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )

  const summaryCard = (
    <section className="bg-white border border-slate-200 rounded-xl p-5 h-full">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
        Executive Summary
      </h2>
      {poi.summary ? (
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{poi.summary}</p>
      ) : (
        <p className="text-sm text-slate-400 italic">
          No summary yet.
          {isReviewer ? (
            <>
              {' '}
              <Link
                href={`/pois/${poi._id}/edit`}
                className="text-primary underline underline-offset-2 not-italic"
              >
                Add one
              </Link>
            </>
          ) : null}
        </p>
      )}
    </section>
  )

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <PageHeader title={poi.display_name} />

      <div className="shrink-0 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <Link
          href="/pois"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to POIs
        </Link>
        <DateRangeControls
          preset={range.preset || DEFAULT_INFORMATICS_RANGE_PRESET}
          from={range.from}
          to={range.to}
        />
      </div>

      {caseOpen ? (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <aside className={cn(
            'w-[280px] lg:w-[320px] shrink-0 border-r border-slate-200 bg-white flex-col min-h-0',
            'hidden md:flex'
          )}>
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-slate-100 shrink-0">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Recent cases</h3>
              <Button
                type="button"
                size="sm"
                variant={showDeepfakes ? 'default' : 'outline'}
                className="h-6 px-2 text-[10px]"
                onClick={toggleDeepfakes}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                Deepfakes
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {listLoading ? (
                <div className="flex items-center justify-center py-10 text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : openPosts.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-slate-400">No cases on this page</p>
              ) : (
                openPosts.map((post) => {
                  const selected = detailPost?._id === post._id
                  return (
                    <button
                      key={post._id}
                      type="button"
                      onClick={() => loadDetail(post._id)}
                      className={cn(
                        'flex w-full gap-3 p-3 text-left border-b border-slate-50 cursor-pointer',
                        selected ? 'bg-slate-100 border-l-4 border-l-slate-800' : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                      )}
                    >
                      <div className="w-12 h-12 shrink-0 bg-slate-200 rounded-md overflow-hidden border border-slate-200">
                        {post.signedImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={post.signedImageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-100">
                            <Quote className="w-4 h-4 text-slate-400" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {platformLabel(post.platform)} @{post.author?.username || 'Unknown'}
                        </div>
                        <p className="text-[10px] text-slate-500 line-clamp-2 leading-snug mt-0.5">
                          {post.caption || 'No caption'}
                        </p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
            {openTotalPages > 1 ? (
              <div className="p-2 border-t border-slate-100 flex items-center justify-between gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => goToOpenPage(openPage - 1)} disabled={openPage <= 1 || listLoading} className="h-8 w-8 p-0">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex gap-1">
                  {pagerPages(openPage, openTotalPages).map((pageNum) => (
                    <Button
                      key={pageNum}
                      variant={openPage === pageNum ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => goToOpenPage(pageNum)}
                      disabled={listLoading}
                      className={cn(
                        'h-8 w-8 p-0 text-xs font-bold',
                        openPage === pageNum ? 'bg-slate-800 hover:bg-slate-900 text-white' : 'border-slate-200 text-slate-600'
                      )}
                    >
                      {pageNum}
                    </Button>
                  ))}
                </div>
                <Button variant="ghost" size="sm" onClick={() => goToOpenPage(openPage + 1)} disabled={openPage >= openTotalPages || listLoading} className="h-8 w-8 p-0">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            ) : null}
          </aside>
          <div className="flex-1 min-w-0 min-h-0 relative flex">
            {detailLoading && !detailPost ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : detailPost ? (
              <CaseDetailPanel
                post={detailPost}
                project={project}
                clientDetails={clientDetails}
                projectEmails={projectEmails}
                isOpen
                isMobileLayout={isMobile}
                onClose={closeCase}
                onBack={closeCase}
                onNavigate={navigateCase}
                hasPrev={selectedIndex > 0 || openPage > 1}
                hasNext={selectedIndex < openPosts.length - 1 || openPage < openTotalPages}
                onUpdatePost={setDetailPost}
                onUpdateStatus={(id, status) => {
                  setDetailPost((prev) => (prev && prev._id === id ? { ...prev, client_status: status } : prev))
                }}
                onShowToast={showToast}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                Could not load this case.
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="shrink-0 px-4 sm:px-6 lg:px-8 pt-6">
            <div className="grid gap-4 md:grid-cols-2">
              {infoCard}
              {summaryCard}
            </div>
          </div>
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6 px-4 sm:px-6 lg:px-8 py-6 overflow-y-auto lg:overflow-hidden">
            <div className="lg:w-[40%] shrink-0 space-y-3 order-2 lg:order-1 lg:overflow-y-auto lg:min-h-0 lg:pr-1">
              {graphsBlock}
              {profileBlock}
            </div>
            <div className="flex-1 min-w-0 order-1 lg:order-2 lg:overflow-y-auto lg:min-h-0 lg:pl-1">
              {recentPostsBlock}
            </div>
          </div>
        </>
      )}

      {toast ? (
        <div className={cn(
          'fixed bottom-4 right-4 z-[60] px-3 py-2 rounded-md text-sm shadow-lg text-white',
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
        )}>
          {toast.message}
        </div>
      ) : null}
    </main>
  )
}
