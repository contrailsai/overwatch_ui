'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  User,
  BadgeCheck,
  MapPin,
  Calendar,
  Link2,
  Hash,
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Siren,
  TriangleAlert,
  TrendingDown,
  Smile,
  Fingerprint,
  MessageSquareWarning,
  Laugh,
  EyeOff,
  ShieldX,
  ShieldQuestion,
  FishingHook,
  UserRoundX,
  AlertCircle,
  TrendingUp,
} from 'lucide-react'
import {
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
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import NotificationsBell from '@/components/NotificationsBell'
import { DateRangeControls } from '@/components/analytics/DateRangeControls'
import {
  PostCard,
  PlatformIcon,
  platformLabel,
  formatViolation,
} from '@/components/analytics/PostCard'
import { fillTimeline } from '@/components/analytics/fillTimeline'
import { ProfileExportButton } from '@/components/pdf/ProfileExportButton'
import { ProfileExportDocxButton } from '@/components/docx/ProfileExportDocxButton'
import { addProfileClientNote, updateProfileClientStatus } from '../actions'

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

const RISK_RANK_COLORS = {
  high: '#e11d48',
  medium: '#ea580c',
  mid: '#ea580c',
  low: '#d97706',
  safe: '#64748b',
  unknown: '#94a3b8',
}

const VIOLATION_COLOR_MAP = {
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
}

function getLabelConfig(labelName) {
  const name = String(labelName || '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
  if (name.includes('scam') || name.includes('fraud')) return { icon: Fingerprint, color: 'rose' }
  if (name.includes('investment')) return { icon: TrendingUp, color: 'emerald' }
  if (name.includes('misinformation') || name.includes('fake')) return { icon: ShieldX, color: 'orange' }
  if (name.includes('hate')) return { icon: MessageSquareWarning, color: 'red' }
  if (name.includes('satire') || name.includes('humor')) return { icon: Laugh, color: 'blue' }
  if (name.includes('nsfw')) return { icon: EyeOff, color: 'indigo' }
  if (name.includes('violence') || name.includes('terrorism')) return { icon: Siren, color: 'red' }
  if (name.includes('asset')) return { icon: ShieldQuestion, color: 'amber' }
  if (name.includes('spam')) return { icon: ShieldX, color: 'blue' }
  if (name.includes('phishing')) return { icon: FishingHook, color: 'indigo' }
  if (name.includes('propaganda')) return { icon: UserRoundX, color: 'red' }
  return { icon: AlertCircle, color: 'amber' }
}

function getProfileRiskBadge(risk) {
  const v = typeof risk === 'string' ? risk.toLowerCase() : risk
  if (v === 'high' || (typeof v === 'number' && v >= 96)) {
    return { label: 'High', className: 'bg-rose-50 text-rose-700 border-rose-200' }
  }
  if (v === 'mid' || v === 'medium' || (typeof v === 'number' && v >= 76)) {
    return { label: 'Medium', className: 'bg-orange-50 text-orange-700 border-orange-200' }
  }
  if (v === 'low' || (typeof v === 'number' && v >= 41)) {
    return { label: 'Low', className: 'bg-amber-50 text-amber-700 border-amber-200' }
  }
  return { label: 'Safe', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
}

function RiskIcon({ label }) {
  if (label === 'High') return <Siren className="w-3 h-3" />
  if (label === 'Medium') return <TriangleAlert className="w-3 h-3" />
  if (label === 'Low') return <TrendingDown className="w-3 h-3" />
  return <Smile className="w-3 h-3" />
}

function SafeDate({ date }) {
  if (!date) return <span>—</span>
  try {
    return <span>{format(new Date(date), 'dd MMM yyyy, HH:mm')}</span>
  } catch {
    return <span>—</span>
  }
}

function ProfileAvatar({ profile }) {
  const src = profile.metadata?.profile_pic
  const initial = (profile.display_name || profile.username || '?').charAt(0).toUpperCase()
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="h-16 w-16 sm:h-20 sm:w-20 rounded-full object-cover border border-slate-200 bg-slate-100 shrink-0"
      />
    )
  }
  return (
    <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-semibold border border-slate-300 shrink-0 text-xl sm:text-2xl">
      {initial || <User className="w-7 h-7 text-slate-400" />}
    </div>
  )
}

export function ProfileOverview({ profile, project, analytics, posts, reportCaseIds, range }) {
  const router = useRouter()
  const [localNotes, setLocalNotes] = useState(() => profile.client_notes || [])
  const [noteText, setNoteText] = useState('')
  const [isSubmittingNote, setIsSubmittingNote] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [clientStatus, setClientStatus] = useState(() => profile.client_status || 'To Be Reviewed')
  const [showProcessed, setShowProcessed] = useState(false)
  const [isBioExpanded, setIsBioExpanded] = useState(false)

  const review = profile.review_details || {}
  const riskScore = review.risk || 'safe'
  const reasoning = review.reasoning || 'No profile reasoning provided.'
  const violations = review.violations || []
  const profileRisk = getProfileRiskBadge(riskScore)
  const inRangeCount = analytics?.totalInRange ?? 0
  const meta = profile.metadata || {}

  const timelineData = useMemo(
    () => fillTimeline(analytics?.timeline, analytics?.from, analytics?.to),
    [analytics]
  )

  const riskData = useMemo(
    () =>
      (analytics?.riskRanks || []).map((r) => ({
        name: formatViolation(r.rank === 'mid' ? 'medium' : r.rank),
        count: r.count,
        fill: RISK_RANK_COLORS[String(r.rank || '').toLowerCase()] || RISK_RANK_COLORS.unknown,
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

  const handleAddNote = async () => {
    if (!noteText.trim() || isSubmittingNote) return
    setIsSubmittingNote(true)
    const res = await addProfileClientNote(profile._id, noteText)
    if (res.success) {
      setLocalNotes((prev) => [...prev, res.note])
      setNoteText('')
      router.refresh()
    }
    setIsSubmittingNote(false)
  }

  const handleUpdateStatus = async (newStatus) => {
    if (isUpdatingStatus) return
    setIsUpdatingStatus(true)
    const res = await updateProfileClientStatus(profile._id, newStatus)
    if (res.success) {
      setClientStatus(newStatus)
      setShowProcessed(true)
      setTimeout(() => setShowProcessed(false), 3000)
      router.refresh()
    }
    setIsUpdatingStatus(false)
  }

  const infoCard = (
    <section className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-start gap-4">
        <ProfileAvatar profile={profile} />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight truncate">
                {profile.display_name}
              </h2>
              {profile.is_verified ? <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" /> : null}
              {meta.is_business ? (
                <Badge
                  variant="outline"
                  className="h-5 px-1.5 text-[9px] font-bold bg-slate-50 text-slate-600 border-slate-200 uppercase tracking-wider"
                >
                  Business
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-sm flex-wrap">
              {profile.username ? (
                <span className="font-medium text-slate-500">@{profile.username}</span>
              ) : null}
              {profile.username ? <span className="text-slate-300">·</span> : null}
              <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium">
                <PlatformIcon platform={profile.platform} />
                {platformLabel(profile.platform === 'x' ? 'x' : profile.platform)}
              </span>
            </div>
            {meta.full_name && meta.full_name !== profile.display_name ? (
              <p className="text-xs text-slate-400 mt-0.5">{meta.full_name}</p>
            ) : null}
          </div>

          {meta.biography ? (
            <div className="flex flex-col gap-1 items-start">
              <p
                className={cn(
                  'text-sm text-slate-700 leading-relaxed whitespace-pre-wrap',
                  !isBioExpanded && 'line-clamp-3'
                )}
              >
                {meta.biography}
              </p>
              {(meta.biography.length > 80 || meta.biography.includes('\n')) && (
                <button
                  type="button"
                  onClick={() => setIsBioExpanded((v) => !v)}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wider"
                >
                  {isBioExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {meta.location ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200/60">
                <MapPin className="w-3 h-3 text-slate-400" />
                {meta.location}
              </div>
            ) : null}
            {meta.category ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200/60">
                <Hash className="w-3 h-3 text-slate-400" />
                {meta.category}
              </div>
            ) : null}
            {meta.account_creation_date ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200/60">
                <Calendar className="w-3 h-3 text-slate-400" />
                Joined {format(new Date(meta.account_creation_date), 'dd MMM yyyy')}
              </div>
            ) : null}
            {profile.profile_url ? (
              <a
                href={profile.profile_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold border border-blue-100"
              >
                <Link2 className="w-3 h-3 text-blue-500" />
                View Profile
              </a>
            ) : null}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
            <div>
              <p className="text-lg font-bold text-slate-900 tracking-tight tabular-nums">
                {(meta.follower_count ?? 0).toLocaleString()}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Followers
              </p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 tracking-tight tabular-nums">
                {(meta.following_count ?? 0).toLocaleString()}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Following
              </p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 tracking-tight tabular-nums">
                {(meta.media_count ?? 0).toLocaleString()}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Posts
              </p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 tracking-tight tabular-nums">
                {(profile.cases_count ?? 0).toLocaleString()}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Cases
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-400 tabular-nums">
            {inRangeCount.toLocaleString()} posts in selected range
          </p>
        </div>
      </div>
    </section>
  )

  const reviewCard = (
    <section className="bg-white border border-slate-200 rounded-xl p-5 h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Profile Risk</h2>
          <Badge
            variant="outline"
            className={cn('text-xs shadow-none font-bold px-3 py-1.5 gap-1.5', profileRisk.className)}
          >
            <RiskIcon label={profileRisk.label} />
            {profileRisk.label} Risk
          </Badge>
        </div>
        <div className="flex gap-2 shrink-0">
          <ProfileExportButton
            profile={profile}
            project={project}
            posts={reportCaseIds}
            className="cursor-pointer rounded-md border border-slate-200 text-slate-600 hover:border-blue-500 hover:text-blue-600 flex items-center justify-center gap-1.5 text-xs font-bold transition-all bg-white px-3 py-1.5"
          />
          <ProfileExportDocxButton
            profile={profile}
            project={project}
            posts={reportCaseIds}
            className="cursor-pointer rounded-md border border-slate-200 text-slate-600 hover:border-blue-500 hover:text-blue-600 flex items-center justify-center gap-1.5 text-xs font-bold transition-all bg-white px-3 py-1.5 h-auto"
          />
        </div>
      </div>

      <div className="space-y-3 py-3 border-t border-slate-100">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
          Review Analysis
        </h3>
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
          {reasoning}
        </p>
      </div>

      <div className="space-y-3 py-3 border-t border-slate-100">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
          Detected Violations
        </h3>
        {violations.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {violations.map((v, idx) => {
              const config = getLabelConfig(v)
              const colorMap = VIOLATION_COLOR_MAP[config.color] || 'bg-slate-50 text-slate-700 border-slate-200'
              return (
                <Badge
                  key={`${v}-${idx}`}
                  variant="outline"
                  className={cn('text-xs shadow-none px-3 py-1.5 capitalize font-semibold', colorMap)}
                >
                  {String(v).replace(/[-_]/g, ' ')}
                </Badge>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No specific violations identified.</p>
        )}
      </div>
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
                  <linearGradient id="profilePostsFill" x1="0" y1="0" x2="0" y2="1">
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
                <YAxis allowDecimals={false} width={24} tick={{ fontSize: 9, fill: '#64748b' }} />
                <Tooltip formatter={(value) => [value, 'Posts']} labelFormatter={(label) => label} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#profilePostsFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
          Risk Breakdown
        </h2>
        {riskData.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">No posts in this range</p>
        ) : (
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskData} layout="vertical" margin={{ left: 0, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 9, fill: '#64748b' }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={56}
                  tick={{ fontSize: 9, fill: '#475569' }}
                />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {riskData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
          Violation Breakdown
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

  const postsBlock = (
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
            <PostCard
              key={post._id}
              post={post}
              href={`/cases/${post._id}`}
              showAuthor={false}
            />
          ))}
        </ul>
      )}
    </section>
  )

  const workflowCard = (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Comments & Actions</h2>
      </div>
      <div className="p-5 space-y-4">
        {localNotes?.length > 0 ? (
          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {localNotes.map((note, idx) => (
              <div key={`${note.created_at}-${idx}`} className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold text-slate-400">{note.email || 'Unknown User'}</span>
                  <span className="text-[10px] text-slate-400">
                    <SafeDate date={note.created_at} />
                  </span>
                </div>
                <p className="text-sm text-slate-700 font-medium whitespace-pre-wrap">{note.text}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="relative">
          <Textarea
            placeholder="Comments"
            className="min-h-[100px] pr-12 text-sm resize-none bg-white border-slate-200 focus-visible:ring-blue-500"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleAddNote()
              }
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            className="absolute cursor-pointer bottom-2 right-2 h-8 w-8 hover:text-blue-600 bg-white transition-colors disabled:opacity-50"
            onClick={handleAddNote}
            disabled={!noteText.trim() || isSubmittingNote}
          >
            {isSubmittingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        {showProcessed ? (
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-800">Profile Updated</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                The client status has been successfully updated.
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex gap-3 pt-1">
          <Button
            onClick={() => {
              if (clientStatus !== 'No Action' && clientStatus !== 'Pass') handleUpdateStatus('No Action')
            }}
            disabled={isUpdatingStatus}
            className={cn(
              'flex-1 h-11 font-bold text-white transition-all shadow-emerald-900/20 bg-emerald-500 opacity-50 hover:opacity-100',
              clientStatus === 'No Action' || clientStatus === 'Pass'
                ? 'opacity-100 cursor-default hover:bg-emerald-500 ring-2 ring-emerald-600 ring-offset-2'
                : 'cursor-pointer hover:bg-emerald-600'
            )}
          >
            {isUpdatingStatus ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            No Action
          </Button>
          <Button
            onClick={() => {
              if (clientStatus !== 'Flag for Takedown') handleUpdateStatus('Flag for Takedown')
            }}
            disabled={isUpdatingStatus}
            className={cn(
              'flex-1 h-11 font-bold text-white transition-all opacity-50 hover:opacity-100',
              project?.project_details?.do_takedowns
                ? 'shadow-amber-900/20 bg-amber-500'
                : 'shadow-rose-900/20 bg-rose-600',
              clientStatus === 'Flag for Takedown'
                ? cn(
                    'opacity-100 cursor-default ring-2 ring-offset-2',
                    project?.project_details?.do_takedowns
                      ? 'hover:bg-amber-500 ring-amber-600'
                      : 'hover:bg-rose-600 ring-rose-700'
                  )
                : cn(
                    'cursor-pointer',
                    project?.project_details?.do_takedowns ? 'hover:bg-amber-600' : 'hover:bg-rose-700'
                  )
            )}
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            Flag for Takedown
          </Button>
        </div>
      </div>
    </section>
  )

  const titleName = profile.display_name || profile.username || 'Profile'

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <header className="bg-white border-b border-slate-200 pt-[15px] pb-3 px-4 sm:px-6 lg:px-8 shrink-0 flex justify-between items-center z-10">
        <Link
          href="/profiles"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Profiles
        </Link>
        <NotificationsBell />
      </header>

      <div className="shrink-0 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight truncate">
              {titleName}
            </h1>
            {profile.is_verified ? <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" /> : null}
          </div>
          {profile.username ? (
            <p className="text-sm text-slate-500 font-medium truncate">@{profile.username}</p>
          ) : null}
        </div>
        <DateRangeControls
          preset={range.preset || 'all'}
          from={range.from}
          to={range.to}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 animate-in fade-in duration-500">
          {infoCard}
          {reviewCard}
        </div>

        <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in duration-500 [animation-delay:80ms]">
          <div className="lg:w-[40%] shrink-0 space-y-3 order-2 lg:order-1">
            {graphsBlock}
            {workflowCard}
          </div>
          <div className="flex-1 min-w-0 order-1 lg:order-2">
            {postsBlock}
          </div>
        </div>
      </div>
    </main>
  )
}
