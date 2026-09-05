'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft, Pencil } from 'lucide-react'
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

const PLATFORM_COLORS = {
  instagram: '#e1306c',
  facebook: '#1877f2',
  x: '#0f172a',
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

export function PoiOverview({ poi, analytics, profiles, posts, range, isReviewer }) {
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
                      <Link href={`/profiles/${p.profile_id}`} className="block min-w-0 hover:underline">
                        <div className="font-medium text-slate-900 truncate max-w-[140px]">
                          {p.display_name || p.username}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate inline-flex items-center gap-1">
                          <PlatformIcon platform={p.platform} className="w-3 h-3" />
                          {platformLabel(p.platform)}
                        </div>
                      </Link>
                    ) : (
                      <>
                        <div className="font-medium text-slate-900 truncate max-w-[140px]">
                          {p.display_name || p.username}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate inline-flex items-center gap-1">
                          <PlatformIcon platform={p.platform} className="w-3 h-3" />
                          {platformLabel(p.platform)}
                        </div>
                      </>
                    )}
                  </td>
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
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 px-1">
        Recent Posts
      </h2>
      {posts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-8 text-center text-sm text-slate-400">
          No recent posts in this range
        </div>
      ) : (
        <ul className="columns-1 sm:columns-2 xl:columns-3 gap-3 [column-fill:_balance]">
          {posts.map((post) => (
            <PostCard key={post._id} post={post} href={`/cases?case_id=${post._id}`} />
          ))}
        </ul>
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
          preset={range.preset || '7d'}
          from={range.from}
          to={range.to}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 animate-in fade-in duration-500">
          {infoCard}
          {summaryCard}
        </div>

        <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in duration-500 [animation-delay:80ms]">
          <div className="lg:w-[40%] shrink-0 space-y-3 order-2 lg:order-1">
            {graphsBlock}
            {profileBlock}
          </div>
          <div className="flex-1 min-w-0 order-1 lg:order-2">
            {recentPostsBlock}
          </div>
        </div>
      </div>
    </main>
  )
}
