'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Pencil,
  Facebook,
  Instagram,
  Youtube,
  Globe,
  ExternalLink,
  CalendarIcon,
  X,
} from 'lucide-react'
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
import { format, eachDayOfInterval, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import PageHeader from '@/components/PageHeader'
import { Twitter, Reddit } from '@/utils/icons'

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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

function PlatformIcon({ platform, className }) {
  const p = platform?.toLowerCase()
  if (p === 'instagram') return <Instagram className={cn('w-3.5 h-3.5 text-pink-500', className)} />
  if (p === 'facebook') return <Facebook className={cn('w-3.5 h-3.5 text-blue-600', className)} />
  if (p === 'x' || p === 'twitter') {
    return (
      <span className="w-3.5 h-3.5 inline-flex">
        <Twitter className={cn('max-w-3.5 max-h-3.5 text-slate-900', className)} />
      </span>
    )
  }
  if (p === 'reddit') {
    return (
      <span className="w-3.5 h-3.5 inline-flex">
        <Reddit className={cn('max-w-3.5 max-h-3.5', className)} />
      </span>
    )
  }
  if (p === 'youtube') return <Youtube className={cn('w-3.5 h-3.5 text-red-500', className)} />
  return <Globe className={cn('w-3.5 h-3.5 text-slate-400', className)} />
}

function platformLabel(p) {
  if (!p) return 'Unknown'
  const k = String(p).toLowerCase()
  if (k === 'x') return 'X'
  return k.charAt(0).toUpperCase() + k.slice(1)
}

function formatViolation(name) {
  return String(name || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
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

function DateRangeControls({ preset, from, to }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [hoveredDate, setHoveredDate] = useState(null)
  const isMobile = useIsMobile()

  const [internalRange, setInternalRange] = useState(() => ({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  }))

  const handleOpenChange = (open) => {
    if (open) {
      setInternalRange({
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      })
    }
    setIsPickerOpen(open)
  }

  const apply = (next) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next.preset === 'custom' && next.from) {
      params.set('range', 'custom')
      params.set('from', next.from)
      if (next.to) params.set('to', next.to)
      else params.delete('to')
    } else {
      params.set('range', next.preset)
      params.delete('from')
      params.delete('to')
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  const applyRange = (range) => {
    if (!range?.from || !range?.to) return
    apply({
      preset: 'custom',
      from: format(range.from, 'yyyy-MM-dd'),
      to: format(range.to, 'yyyy-MM-dd'),
    })
    setIsPickerOpen(false)
  }

  const handleSelect = (range, selectedDay) => {
    if (!selectedDay) return

    if (!internalRange?.from || (internalRange?.from && internalRange?.to)) {
      setInternalRange({ from: selectedDay, to: undefined })
      return
    }

    let newFrom = internalRange.from
    let newTo = selectedDay
    if (newTo < newFrom) {
      newFrom = selectedDay
      newTo = internalRange.from
    }

    const newRange = { from: newFrom, to: newTo }
    setInternalRange(newRange)
    applyRange(newRange)
  }

  const customLabel =
    preset === 'custom' && from && to
      ? `${format(new Date(from), 'MMM d')} – ${format(new Date(to), 'MMM d')}`
      : 'Custom'

  const pillBase =
    'h-9 px-4 rounded-full text-sm font-semibold transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60'
  const pillActive = 'bg-primary text-primary-foreground border border-primary'
  const pillIdle = 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'

  return (
    <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter by date range">
      {[
        { id: '24h', label: '24H', fullLabel: '24 Hours' },
        { id: '7d', label: '7D', fullLabel: '7 Days' },
      ].map((opt) => (
        <button
          key={opt.id}
          type="button"
          disabled={isPending}
          onClick={() => apply({ preset: opt.id })}
          aria-pressed={preset === opt.id}
          className={cn(pillBase, preset === opt.id ? pillActive : pillIdle)}
        >
          <span className="md:hidden">{opt.label}</span>
          <span className="hidden md:inline">{opt.fullLabel}</span>
        </button>
      ))}

      <Popover open={isPickerOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-pressed={preset === 'custom'}
            className={cn(pillBase, preset === 'custom' ? pillActive : pillIdle)}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span className="truncate max-w-[140px]">{customLabel}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 max-w-[100vw] rounded-md border border-slate-200 shadow-md overflow-hidden"
          align={isMobile ? 'center' : 'end'}
          sideOffset={6}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/80">
            <div className="text-sm">
              <p className="font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-0.5">Range</p>
              <p className="font-semibold text-slate-900">
                {internalRange?.from ? (
                  internalRange.to ? (
                    <>
                      {format(internalRange.from, 'MMM d, yyyy')} –{' '}
                      {format(internalRange.to, 'MMM d, yyyy')}
                    </>
                  ) : (
                    <>
                      {format(internalRange.from, 'MMM d, yyyy')} –{' '}
                      <span className="text-slate-400">end…</span>
                    </>
                  )
                ) : (
                  <span className="text-slate-400">Tap a start date</span>
                )}
              </p>
            </div>
            {internalRange?.from ? (
              <button
                type="button"
                onClick={() => setInternalRange({ from: undefined, to: undefined })}
                className="p-1.5 rounded hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition-colors"
                aria-label="Reset selection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={internalRange?.from}
            selected={internalRange}
            onSelect={handleSelect}
            onDayMouseEnter={(day) => setHoveredDate(day)}
            onDayMouseLeave={() => setHoveredDate(null)}
            numberOfMonths={isMobile ? 1 : 2}
            disabled={(date) => date > new Date()}
            className="rounded-none border-none p-3 w-full md:[--cell-size:--spacing(10)]"
            modifiers={{
              hoverRange: (date) => {
                if (!internalRange?.from || internalRange?.to || !hoveredDate) return false
                const min = internalRange.from < hoveredDate ? internalRange.from : hoveredDate
                const max = internalRange.from > hoveredDate ? internalRange.from : hoveredDate
                return date > min && date < max
              },
              hoverRangeEnd: (date) => {
                if (!internalRange?.from || internalRange?.to || !hoveredDate) return false
                return date.getTime() === hoveredDate.getTime() && hoveredDate > internalRange.from
              },
              hoverRangeStart: (date) => {
                if (!internalRange?.from || internalRange?.to || !hoveredDate) return false
                return date.getTime() === hoveredDate.getTime() && hoveredDate < internalRange.from
              },
              fromDateHover: (date) => {
                if (!internalRange?.from || internalRange?.to || !hoveredDate) return false
                return (
                  date.getTime() === internalRange.from.getTime() &&
                  hoveredDate.getTime() !== internalRange.from.getTime()
                )
              },
            }}
            modifiersClassNames={{
              hoverRange: 'bg-primary/10 text-primary !rounded-none',
              hoverRangeStart: 'bg-primary/10 text-primary !rounded-l-md !rounded-r-none',
              hoverRangeEnd: 'bg-primary/10 text-primary !rounded-r-md !rounded-l-none',
              fromDateHover:
                internalRange?.from < hoveredDate
                  ? '!rounded-l-md !rounded-r-none'
                  : '!rounded-r-md !rounded-l-none',
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function fillTimeline(timeline, fromIso, toIso) {
  const byDay = new Map((timeline || []).map((r) => [r.date, r.count]))
  if (!fromIso || !toIso) {
    return (timeline || []).map((r) => ({
      date: r.date,
      label: format(parseISO(r.date), 'MMM d'),
      count: r.count,
    }))
  }
  let start
  let end
  try {
    start = parseISO(fromIso.slice(0, 10))
    end = parseISO(toIso.slice(0, 10))
  } catch {
    return []
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return []

  return eachDayOfInterval({ start, end }).map((day) => {
    const key = format(day, 'yyyy-MM-dd')
    return {
      date: key,
      label: format(day, 'MMM d'),
      count: byDay.get(key) || 0,
    }
  })
}

function PostCard({ post }) {
  return (
    <li className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
      <Link href={`/cases?case_id=${post._id}`} className="block">
        {post.signedImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.signedImageUrl}
            alt=""
            className="h-28 w-full object-cover bg-slate-100"
          />
        ) : (
          <div className="h-16 w-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs">
            No media
          </div>
        )}
        <div className="p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <PlatformIcon platform={post.platform} />
              {platformLabel(post.platform)}
            </span>
            {post.effective_threat_score != null ? (
              <span className="text-xs font-semibold tabular-nums text-slate-700">
                {Math.round(post.effective_threat_score)}
              </span>
            ) : null}
          </div>
          <p className="text-xs sm:text-sm text-slate-700 line-clamp-2">
            {post.caption || 'No caption'}
          </p>
          <div className="flex flex-wrap gap-1">
            {(post.threat_types || []).slice(0, 2).map((t) => (
              <Badge key={t} variant="outline" className="text-[10px] capitalize">
                {formatViolation(t)}
              </Badge>
            ))}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
            <span className="truncate">
              {post.author?.display_name || post.author?.username || '—'}
            </span>
            {post.original_url ? (
              <span
                role="link"
                tabIndex={0}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  window.open(post.original_url, '_blank', 'noopener,noreferrer')
                }}
                className="inline-flex items-center gap-0.5 hover:text-slate-600"
              >
                Source <ExternalLink className="h-3 w-3" />
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
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
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Top Posting Profiles
        </h2>
      </div>
      {profiles.length === 0 ? (
        <p className="text-sm text-slate-400 px-5 py-8 text-center">No profiles in this range</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3 font-medium">Profile</th>
                <th className="px-3 py-3 font-medium">Platform</th>
                <th className="px-3 py-3 font-medium text-right">Posts</th>
                <th className="px-5 py-3 font-medium text-right">Engagement</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p, i) => (
                <tr
                  key={`${p.profile_id || p.username}-${i}`}
                  className="border-b border-slate-50 last:border-0"
                >
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900 truncate max-w-[180px]">
                      {p.display_name || p.username}
                    </div>
                    {p.username && p.display_name !== p.username ? (
                      <div className="text-xs text-slate-400 truncate">@{p.username}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <PlatformIcon platform={p.platform} />
                      {platformLabel(p.platform)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{p.posts}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-500">
                    {(p.engagement || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )

  const graphsBlock = (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
          Content Trend
        </h2>
        {timelineData.length === 0 || timelineData.every((d) => d.count === 0) ? (
          <p className="text-sm text-slate-400 py-10 text-center">No posts in this range</p>
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="poiPostsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  allowDecimals={false}
                  width={32}
                  tick={{ fontSize: 10, fill: '#64748b' }}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
            Platform Breakdown
          </h2>
          {platformData.length === 0 ? (
            <p className="text-sm text-slate-400 py-10 text-center">No posts in this range</p>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-36 w-36 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={platformData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={36}
                      outerRadius={58}
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
              <ul className="space-y-1.5 flex-1 min-w-0">
                {platformData.map((p) => (
                  <li key={p.name} className="flex items-center justify-between text-xs gap-2">
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

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
            Risk & Violation Breakdown
          </h2>
          {violationData.length === 0 ? (
            <p className="text-sm text-slate-400 py-10 text-center">No violations in this range</p>
          ) : (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={violationData} layout="vertical" margin={{ left: 4, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={96}
                    tick={{ fontSize: 10, fill: '#475569' }}
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
        <ul className="grid grid-cols-2 gap-3">
          {posts.map((post) => (
            <PostCard key={post._id} post={post} />
          ))}
        </ul>
      )}
    </section>
  )

  const infoCard = (
    <section className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-start gap-4">
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
          {isReviewer ? (
            <Button asChild size="sm" className="mt-3">
              <Link href={`/pois/${poi._id}/edit`}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Link>
            </Button>
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
          preset={range.preset || '7d'}
          from={range.from}
          to={range.to}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Info + Summary: stacked on mobile, 2-col on md+ */}
        <div className="grid gap-4 md:grid-cols-2 animate-in fade-in duration-500">
          {infoCard}
          {summaryCard}
        </div>

        {/* Desktop: graphs+profiles | recent posts. Mobile: linear */}
        <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in duration-500 [animation-delay:80ms]">
          <div className="flex-1 min-w-0 space-y-4 order-1">
            {graphsBlock}
            <div className="order-2 lg:order-none">{profileBlock}</div>
          </div>
          <div className="lg:w-[380px] xl:w-[420px] shrink-0 order-3 lg:order-2">
            {recentPostsBlock}
          </div>
        </div>
      </div>
    </main>
  )
}
