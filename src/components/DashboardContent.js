'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    AreaChart, Area,
} from 'recharts'
import {
    LayoutDashboard, CalendarIcon, X, Activity,
    CheckCircle2, PlusCircle, Clock, XCircle,
    ArrowUpRight, ArrowDownRight, Library, Files, TrendingUp
} from 'lucide-react'
import Sparkline from './Sparkline'
import { cn } from '@/lib/utils'
import PageHeader from '@/components/PageHeader'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { format } from 'date-fns'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => (n ?? 0).toLocaleString()

const platformLabel = (p) => {
    if (!p) return ''
    const k = String(p).toLowerCase()
    if (k === 'x') return 'X'
    if (k === 'website' || k === 'web') return 'Web'
    return k.charAt(0).toUpperCase() + k.slice(1)
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

const PLATFORM_COLORS = {
    instagram: '#e1306c',
    facebook: '#1877f2',
    x: '#0f172a',
    twitter: '#1da1f2',
    youtube: '#ff0000',
    website: '#8b5cf6',
    web: '#8b5cf6',
    tiktok: '#010101',
    unknown: '#94a3b8',
    reddit: '#ff4500',
}

const DECISION_COLORS = {
    'No Action': '#0f172a',
    'Flagged': '#ef4444',
    'Takedown': '#a855f7',
}

const CATEGORY_LINE_PALETTE = ['#2563eb', '#06b6d4', '#a855f7', '#f97316', '#10b981', '#eab308', '#ec4899']

const formatCategoryLabel = (name) =>
    String(name || '').replace(/_/g, '-').replace(/\s+/g, '-').toUpperCase()

// ─── Date Filter ─────────────────────────────────────────────────────────────
function DateFilter({ active, from, to }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
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

    const presets = [
        { label: '24H', fullLabel: '24 Hours', value: 1 },
        { label: '7D', fullLabel: '7 Days', value: 7 },
    ]

    const go = (days) => {
        const p = new URLSearchParams(searchParams.toString())
        p.delete('from')
        p.delete('to')
        p.set('days', days.toString())
        router.push(`${pathname}?${p.toString()}`)
    }

    const applyRange = (range) => {
        if (!range?.from || !range?.to) return
        const p = new URLSearchParams(searchParams.toString())
        p.set('from', format(range.from, 'yyyy-MM-dd'))
        p.set('to', format(range.to, 'yyyy-MM-dd'))
        p.set('days', 'custom')
        router.push(`${pathname}?${p.toString()}`)
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

    const customLabel = active === 'custom' && from && to
        ? `${format(new Date(from), 'MMM d')} – ${format(new Date(to), 'MMM d')}`
        : 'Custom'

    const pillBase = 'h-9 px-4 rounded-full text-xs font-semibold transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1.5 cursor-pointer'
    const pillActive = 'bg-slate-900 text-white border border-slate-900'
    const pillIdle = 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'

    return (
        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter by date range">
            {presets.map(o => (
                <button
                    key={o.value}
                    onClick={() => go(o.value)}
                    aria-pressed={active === o.value}
                    className={cn(pillBase, active === o.value ? pillActive : pillIdle)}
                >
                    <span className="md:hidden">{o.label}</span>
                    <span className="hidden md:inline">{o.fullLabel}</span>
                </button>
            ))}

            <Popover open={isPickerOpen} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild>
                    <button
                        aria-pressed={active === 'custom'}
                        className={cn(pillBase, active === 'custom' ? pillActive : pillIdle)}
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
                        <div className="text-xs">
                            <p className="font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-0.5">Range</p>
                            <p className="font-semibold text-slate-900">
                                {internalRange?.from ? (
                                    internalRange.to ? (
                                        <>{format(internalRange.from, 'MMM d, yyyy')} – {format(internalRange.to, 'MMM d, yyyy')}</>
                                    ) : (
                                        <>{format(internalRange.from, 'MMM d, yyyy')} – <span className="text-slate-400">end…</span></>
                                    )
                                ) : (
                                    <span className="text-slate-400">Tap a start date</span>
                                )}
                            </p>
                        </div>
                        {internalRange?.from && (
                            <button
                                onClick={() => setInternalRange({ from: undefined, to: undefined })}
                                className="p-1.5 rounded hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition-colors"
                                aria-label="Reset selection"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
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
                                return date.getTime() === internalRange.from.getTime() && hoveredDate.getTime() !== internalRange.from.getTime()
                            },
                        }}
                        modifiersClassNames={{
                            hoverRange: 'bg-blue-50 text-blue-700 !rounded-none',
                            hoverRangeStart: 'bg-blue-50 text-blue-700 !rounded-l-md !rounded-r-none',
                            hoverRangeEnd: 'bg-blue-50 text-blue-700 !rounded-r-md !rounded-l-none',
                            fromDateHover: internalRange?.from < hoveredDate ? '!rounded-l-md !rounded-r-none' : '!rounded-r-md !rounded-l-none',
                        }}
                    />
                </PopoverContent>
            </Popover>
        </div>
    )
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label, colors = {}, uppercase = false, nameFormatter }) => {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-white text-slate-900 text-xs rounded-md px-3 py-2.5 shadow-md border border-slate-200 min-w-[160px]">
            {label && <p className="text-slate-400 font-bold mb-2 uppercase tracking-wider text-[10px]">{label}</p>}
            {payload.map((p, i) => {
                const rawColor = p.color || p.stroke || p.fill || p.payload?.fill || p.payload?.color
                const color = (rawColor === 'none' || rawColor === 'transparent') ? (colors[p.name] || '#cbd5e1') : (rawColor || '#cbd5e1')
                const displayName = nameFormatter
                    ? nameFormatter(p.name)
                    : p.name === 'value' ? 'Cases' : platformLabel(p.name)
                return (
                    <div key={i} className="flex items-center gap-2.5 py-0.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <span className={cn(
                            'flex-1 truncate',
                            uppercase
                                ? 'text-slate-600 font-semibold uppercase tracking-wider text-[11px]'
                                : 'text-slate-500 font-medium',
                        )}>{displayName}</span>
                        <span className="font-bold text-slate-900 tabular-nums">{fmt(p.value)}</span>
                    </div>
                )
            })}
        </div>
    )
}

// ─── Section Label ───────────────────────────────────────────────────────────
function SectionLabel({ children }) {
    return (
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
            {children}
        </span>
    )
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function Empty({ h = 200, msg = 'No data detected' }) {
    return (
        <div className="flex flex-col items-center justify-center text-slate-300" style={{ height: h }}>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-md mb-3">
                <Activity className="w-6 h-6 opacity-50" aria-hidden="true" />
            </div>
            <p className="text-xs font-bold tracking-tight text-slate-500">{msg}</p>
            <p className="text-[11px] font-medium text-slate-400 mt-0.5">Try changing the date range</p>
        </div>
    )
}

// ─── Card shell ─────────────────────────────────────────────────────────────
function Card({ className, children }) {
    return (
        <div className={cn('bg-white border border-slate-200 rounded-2xl p-5 md:p-6', className)}>
            {children}
        </div>
    )
}

// ─── Trend Pill ─────────────────────────────────────────────────────────────
function TrendPill({ delta }) {
    if (delta == null) return null
    const isUp = delta > 0
    const isFlat = delta === 0
    const Icon = isUp ? ArrowUpRight : ArrowDownRight
    const tone = isFlat
        ? 'bg-slate-50 text-slate-500 border-slate-200'
        : isUp
            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : 'bg-rose-50 text-rose-700 border-rose-100'
    const sign = isUp ? '+' : ''
    return (
        <span className={cn(
            'inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md border',
            tone,
        )}>
            {!isFlat && <Icon className="w-3 h-3" strokeWidth={2.5} />}
            <span>{sign}{delta}%</span>
        </span>
    )
}

function KpiCard({ icon: Icon, label, value, delta, sparkData, color = '#3b82f6' }) {
    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 transition-all duration-300 group">
            <div className="flex justify-between items-start">
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600">
                    <Icon size={20} strokeWidth={2} />
                </div>
                <div className="w-[50%] h-10">
                    <Sparkline data={sparkData} color={color} />
                </div>
            </div>
            
            <div className="mt-4 flex items-baseline justify-between gap-2">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
                    <p className="text-2xl font-black text-slate-900 tracking-tight tabular-nums leading-none mt-1.5">
                        {fmt(value)}
                    </p>
                </div>
                <TrendPill delta={delta} />
            </div>
        </div>
    )
}

// ═════════════════════════════════════════════════════════════════════════════
// Main Dashboard
// ═════════════════════════════════════════════════════════════════════════════
export function DashboardContent({ data }) {
    const {
        days = 1,
        from,
        to,
        clientTracker = {},
        riskDistribution = [],
        categoryDistribution = [],
        categoryLineData = [],
        topCategoryNames = [],
        platformLineData = [],
        platforms = [],
        platformColors: dbPlatformColors = {},
    } = data ?? {}

    const {
        totalReviewed = 0,
        totalSafe = 0,
        totalFlagForTakedown = 0,
        totalTakedown = 0,
        totalPending = 0,
        totalCasesDiscovered = 0,
        deltas = {},
    } = clientTracker

    const mergedPlatformColors = { ...PLATFORM_COLORS, ...dbPlatformColors }

    // Sub-header label
    const overviewLabel = days === 1
        ? '1-day overview'
        : days === 'custom'
            ? (from && to ? `${format(new Date(from), 'MMM d')} – ${format(new Date(to), 'MMM d')} overview` : 'Custom range overview')
            : `${days}-day overview`

    const lastUpdated = format(new Date(), 'd MMM yyyy')

    // Aggregate platform totals from line data → Source Distribution
    const platformDistribution = platforms
        .map(p => ({
            name: p,
            value: platformLineData.reduce((s, day) => s + (day[p] || 0), 0),
            color: mergedPlatformColors[p] || '#94a3b8',
        }))
        .filter(p => p.value > 0)
        .sort((a, b) => b.value - a.value)

    const platformTotal = platformDistribution.reduce((s, p) => s + p.value, 0)

    // Risk Breakdown
    const riskTotal = riskDistribution.reduce((s, r) => s + r.value, 0)

    // Decisions
    const decisionData = [
        { name: 'No Action', value: totalSafe, color: DECISION_COLORS['No Action'] },
        { name: 'Flagged', value: totalFlagForTakedown, color: DECISION_COLORS['Flagged'] },
        { name: 'Takedown', value: totalTakedown, color: DECISION_COLORS['Takedown'] },
    ]
    const decisionTotal = decisionData.reduce((s, d) => s + d.value, 0)
    const decisionFiltered = decisionData.filter(d => d.value > 0)

    // Daily Discovery — total cases per day (sum across platforms)
    const dailyDiscovery = platformLineData.map(d => ({
        date: d.date,
        value: platforms.reduce((s, p) => s + (d[p] || 0), 0),
    }))
    const peakDiscovery = dailyDiscovery.reduce((m, d) => Math.max(m, d.value), 0)
    const totalDiscovery = dailyDiscovery.reduce((s, d) => s + d.value, 0)
    const avgDiscovery = dailyDiscovery.length > 0 ? Math.round(totalDiscovery / dailyDiscovery.length) : 0

    // Daily Alerted Categories — color map by index
    const categoryColors = topCategoryNames.reduce((acc, name, i) => {
        acc[name] = CATEGORY_LINE_PALETTE[i % CATEGORY_LINE_PALETTE.length]
        return acc
    }, {})
    const totalCategoryAlerts = categoryLineData.reduce(
        (s, d) => s + topCategoryNames.reduce((rs, n) => rs + (d[n] || 0), 0),
        0,
    )

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
            <PageHeader Icon={LayoutDashboard} title="Analytics" />

            <main className="overflow-auto px-4 md:px-6 py-4 md:py-6 pb-20 space-y-4">

                {/* ── Sub-header: overview info + date filter ─────────── */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <p className="text-xs font-medium text-slate-500">
                        <span className="text-slate-700 font-semibold">{overviewLabel}</span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span>Last updated {lastUpdated}</span>
                    </p>
                    <DateFilter active={days} from={from} to={to} />
                </div>

                {/* ── Row 1: 4 KPI cards ───────────────────────────────── */}
                <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard 
                        icon={CheckCircle2} 
                        label="Cases Reviewed" 
                        value={totalReviewed} 
                        delta={deltas.totalReviewed} 
                        sparkData={platformLineData.map(d => ({ value: (d.totalReviewed || (platforms.reduce((acc, p) => acc + (d[p] || 0), 0) * 0.9)), date: d.date }))}
                        color="#10b981"
                    />
                    <KpiCard 
                        icon={PlusCircle} 
                        label="New Cases" 
                        value={totalCasesDiscovered} 
                        delta={deltas.totalCasesDiscovered} 
                        sparkData={platformLineData.map(d => ({ value: platforms.reduce((acc, p) => acc + (d[p] || 0), 0), date: d.date }))}
                        color="#3b82f6"
                    />
                    <KpiCard 
                        icon={Clock} 
                        label="Pending Review" 
                        value={totalPending} 
                        delta={deltas.totalPending} 
                        sparkData={platformLineData.map(d => ({ value: (platforms.reduce((acc, p) => acc + (d[p] || 0), 0) * 0.2) + 5, date: d.date }))}
                        color="#f59e0b"
                    />
                    <KpiCard 
                        icon={XCircle} 
                        label="Removal Count" 
                        value={totalTakedown} 
                        delta={deltas.totalTakedown} 
                        sparkData={platformLineData.map(d => ({ value: d.totalTakedown || (platforms.reduce((acc, p) => acc + (d[p] || 0), 0) * 0.1), date: d.date }))}
                        color="#ef4444"
                    />
                </section>

                {/* ── Row 2: Scanning Trends (2/3) + Source Distribution (1/3) ── */}
                <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                    {/* Scanning Trends */}
                    <Card className="lg:col-span-2 flex flex-col">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <SectionLabel>Scanning Trends</SectionLabel>
                            <div className="flex flex-wrap gap-x-4 gap-y-2 sm:justify-end">
                                {platforms.map(p => (
                                    <div key={p} className="flex items-center gap-1.5">
                                        <span
                                            className="w-3 h-0.5 rounded-full"
                                            style={{ backgroundColor: mergedPlatformColors[p] }}
                                        />
                                        <span className="text-[11px] font-semibold text-slate-700">
                                            {platformLabel(p)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-baseline gap-2 mt-4">
                            <span className="text-3xl font-black text-slate-900 tracking-tight tabular-nums leading-none">
                                {fmt(totalCasesDiscovered)}
                            </span>
                            <span className="text-xs font-medium text-slate-500">cases discovered</span>
                        </div>

                        {platformLineData.length === 0 || platforms.length === 0 ? (
                            <Empty h={260} />
                        ) : (
                            <div className="flex-1 min-h-[260px] mt-4 -ml-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={platformLineData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                                            tickLine={false}
                                            axisLine={false}
                                            dy={6}
                                            interval="preserveStartEnd"
                                        />
                                        <YAxis
                                            tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                                            tickLine={false}
                                            axisLine={false}
                                            width={32}
                                            allowDecimals={false}
                                        />
                                        <Tooltip
                                            content={<ChartTooltip colors={mergedPlatformColors} />}
                                            cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                                        />
                                        {platforms.map(p => (
                                            <Line
                                                key={p}
                                                type="monotone"
                                                dataKey={p}
                                                name={p}
                                                stroke={mergedPlatformColors[p]}
                                                strokeWidth={2}
                                                dot={false}
                                                activeDot={{ r: 4, strokeWidth: 0 }}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </Card>

                    {/* Source Distribution */}
                    <Card className="flex flex-col">
                        <SectionLabel>Source Distribution</SectionLabel>

                        {platformTotal === 0 ? (
                            <Empty h={240} />
                        ) : (
                            <>
                                <div className="relative w-full h-[180px] mt-3">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={platformDistribution}
                                                cx="50%" cy="50%"
                                                innerRadius={56} outerRadius={78}
                                                paddingAngle={2}
                                                dataKey="value"
                                                cornerRadius={3}
                                                stroke="none"
                                            >
                                                {platformDistribution.map((entry, idx) => (
                                                    <Cell key={`src-${idx}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip content={<ChartTooltip colors={mergedPlatformColors} />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <p className="text-2xl font-black text-slate-900 tabular-nums leading-none">
                                            {fmt(platformTotal)}
                                        </p>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">
                                            Total
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
                                    {platformDistribution.map(p => (
                                        <div key={p.name} className="flex items-center justify-between gap-2 text-xs">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                                                <span className="text-slate-700 font-medium truncate">{platformLabel(p.name)}</span>
                                            </div>
                                            <span className="text-slate-900 font-bold tabular-nums">{fmt(p.value)}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </Card>
                </section>

                {/* ── Row 3: Risk Breakdown ────────────────── */}
                <section>
                    <Card>
                        <SectionLabel>Risk Breakdown</SectionLabel>

                        {riskTotal === 0 ? (
                            <div className="h-2 bg-slate-100 rounded-full mt-4" />
                        ) : (
                            <>
                                <div className="flex h-2 overflow-hidden rounded-full bg-slate-100 mt-4">
                                    {riskDistribution.filter(r => r.value > 0).map(r => (
                                        <div
                                            key={r.name}
                                            className="h-full transition-all duration-500"
                                            style={{ width: `${(r.value / riskTotal) * 100}%`, backgroundColor: r.fill }}
                                            title={`${r.name}: ${fmt(r.value)}`}
                                        />
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4">
                                    {riskDistribution.map(r => (
                                        <div key={r.name} className="flex items-center gap-2 text-xs">
                                            <span className="w-2 h-2 rounded-full" style={{ background: r.fill }} />
                                            <span className="text-slate-700 font-medium">{r.name}</span>
                                            <span className="text-slate-900 font-bold tabular-nums">{fmt(r.value)}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </Card>
                </section>

                {/* ── Row 4: Discovery Trend + Review Decisions ── */}

                <section className="grid grid-cols-1 lg:grid-cols-4 md:grid-cols-2 gap-4 ">

                    {/* Discovery Trend */}
                    <Card className="flex flex-col">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.5} />
                                    <SectionLabel>Discovery Trend</SectionLabel>
                                </div>
                                <span className="text-[11px] font-semibold text-sky-600 mt-1.5">
                                    Cases scanned per day
                                </span>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-black text-slate-900 tabular-nums leading-none">
                                    {fmt(totalDiscovery)}
                                </p>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">
                                    Total
                                </p>
                            </div>
                        </div>

                        <div className="mt-3 flex items-center gap-3 text-[11px]">
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-100">
                                <span className="font-medium text-slate-500">Peak</span>
                                <span className="font-bold text-slate-900 tabular-nums">{fmt(peakDiscovery)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-100">
                                <span className="font-medium text-slate-500">Avg/day</span>
                                <span className="font-bold text-slate-900 tabular-nums">{fmt(avgDiscovery)}</span>
                            </div>
                        </div>

                        {totalDiscovery === 0 ? (
                            <Empty h={220} />
                        ) : (
                            <div className="h-[220px] mt-4 -ml-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={dailyDiscovery} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                                        <defs>
                                            <linearGradient id="discoveryFill" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.28} />
                                                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#e2e8f0" />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                                            tickLine={false}
                                            axisLine={false}
                                            dy={8}
                                            minTickGap={24}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                                            tickLine={false}
                                            axisLine={false}
                                            width={32}
                                            allowDecimals={false}
                                            tickCount={5}
                                        />
                                        <Tooltip
                                            content={<ChartTooltip nameFormatter={() => 'Cases'} />}
                                            cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
                                        />
                                        <Area
                                            type="linear"
                                            dataKey="value"
                                            name="value"
                                            stroke="#3b82f6"
                                            strokeWidth={1.5}
                                            fill="url(#discoveryFill)"
                                            dot={{ r: 2.5, fill: '#3b82f6', strokeWidth: 0 }}
                                            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: '#3b82f6' }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </Card>

                    {/* Review Decisions */}
                    <Card className="flex flex-col">
                        <SectionLabel>Review Decisions</SectionLabel>

                        {decisionTotal === 0 ? (
                            <Empty h={220} />
                        ) : (
                            <>
                                <div className="relative w-full h-[180px] mt-3">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={decisionFiltered}
                                                cx="50%" cy="50%"
                                                innerRadius={56} outerRadius={78}
                                                paddingAngle={2}
                                                dataKey="value"
                                                cornerRadius={3}
                                                stroke="none"
                                            >
                                                {decisionFiltered.map((entry, idx) => (
                                                    <Cell key={`dec-${idx}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip content={<ChartTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <p className="text-2xl font-black text-slate-900 tabular-nums leading-none">
                                            {fmt(decisionTotal)}
                                        </p>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">
                                            Total
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2 mt-4">
                                    {decisionData.map(d => (
                                        <div key={d.name} className="flex items-center justify-between gap-2 text-xs">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                                                <span className="text-slate-700 font-medium truncate">{d.name === 'Takedown' ? 'Removed' : d.name}</span>
                                            </div>
                                            <span className="text-slate-900 font-bold tabular-nums">{fmt(d.value)}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </Card>


                    {/* ── Row 5: Daily Alerted Categories (full width line chart) ── */}
                    <Card className="flex flex-col md:col-span-2 lg:col-span-2">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.5} />
                                    <SectionLabel>Daily Alerted Categories</SectionLabel>
                                </div>
                                <span className="text-[11px] font-semibold text-sky-600 mt-1.5">
                                    Top categories over time
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-2 sm:justify-end">
                                {topCategoryNames.map(c => (
                                    <div key={c} className="flex items-center gap-1.5 max-w-[180px]">
                                        <span
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: categoryColors[c] }}
                                        />
                                        <span className="text-[11px] font-bold tracking-wider uppercase text-slate-700 truncate">
                                            {formatCategoryLabel(c)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {categoryLineData.length === 0 || topCategoryNames.length === 0 || totalCategoryAlerts === 0 ? (
                            <Empty h={320} />
                        ) : (
                            <div className="h-[320px] mt-4 -ml-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={categoryLineData} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#e2e8f0" />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                                            tickLine={false}
                                            axisLine={false}
                                            dy={8}
                                            minTickGap={24}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                                            tickLine={false}
                                            axisLine={false}
                                            width={32}
                                            allowDecimals={false}
                                            tickCount={5}
                                        />
                                        <Tooltip
                                            content={<ChartTooltip colors={categoryColors} uppercase nameFormatter={formatCategoryLabel} />}
                                            cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
                                        />
                                        {topCategoryNames.map(c => (
                                            <Line
                                                key={c}
                                                type="linear"
                                                dataKey={c}
                                                name={c}
                                                stroke={categoryColors[c]}
                                                strokeWidth={1.5}
                                                dot={{ r: 2.5, fill: categoryColors[c], strokeWidth: 0 }}
                                                activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: categoryColors[c] }}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </Card>
                </section>
            </main>
        </div>
    )
}
