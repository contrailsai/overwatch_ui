'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    LineChart, Line, AreaChart, Area,
} from 'recharts'
import { Clock, Eye, Activity, TrendingUp, ShieldCheck, Filter, ChevronDown, LayoutDashboard, Siren, CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import PageHeader from '@/components/PageHeader'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n) => (n ?? 0).toLocaleString()

const PLATFORM_COLORS = {
    instagram: '#e1306c',
    facebook: '#1877f2',
    x: '#0f172a',
    twitter: '#1da1f2',
    youtube: '#ff0000',
    website: '#8b5cf6',
    tiktok: '#010101',
    unknown: '#94a3b8',
    reddit: '#ff4500',
}

// ─── Date Filter ─────────────────────────────────────────────────────────────
function DateFilter({ active, from, to }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isPickerOpen, setIsPickerOpen] = useState(false)
    const [hoveredDate, setHoveredDate] = useState(null)

    // Internal range state to track selection before both dates are picked
    const [internalRange, setInternalRange] = useState({
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined
    })

    // Sync internal range when props change (e.g. from URL or preset buttons)
    useEffect(() => {
        setInternalRange({
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined
        })
    }, [from, to])

    const opts = [
        { label: 'Past 24 Hours', value: 1 },
        { label: '7 Days', value: 7 },
    ]

    const go = (days) => {
        const p = new URLSearchParams(searchParams.toString())
        p.delete('from')
        p.delete('to')
        p.set('days', days.toString())
        router.push(`${pathname}?${p.toString()}`)
    }

    const applyRange = (range) => {
        const p = new URLSearchParams(searchParams.toString())
        if (range?.from && range?.to) {
            p.set('from', format(range.from, 'yyyy-MM-dd'))
            p.set('to', format(range.to, 'yyyy-MM-dd'))
            p.set('days', 'custom')
            router.push(`${pathname}?${p.toString()}`)
            setIsPickerOpen(false)
        }
    }

    const handleSelect = (range, selectedDay) => {
        if (!selectedDay) return

        // Requirement 1: If we already have a full range, or no range at all, start over with the new click as "from"
        if (!internalRange?.from || (internalRange?.from && internalRange?.to)) {
            setInternalRange({ from: selectedDay, to: undefined })
            return
        }

        // Requirement 2: We have a 'from' but no 'to'. The second click completes the range.
        let newFrom = internalRange.from
        let newTo = selectedDay

        // Ensure dates are chronologically ordered
        if (newTo < newFrom) {
            newFrom = selectedDay
            newTo = internalRange.from
        }

        const newRange = { from: newFrom, to: newTo }
        setInternalRange(newRange)
        applyRange(newRange)
    }

    return (
        <div className="flex flex-col gap-3">
            <div
                className="flex rounded-3xl items-center gap-1 bg-white backdrop-blur-md p-2 border w-full shadow-sm"
                role="group"
                aria-label="Filter by date range"
            >
                {opts.map(o => (
                    <button
                        key={o.value}
                        onClick={() => go(o.value)}
                        aria-pressed={active === o.value}
                        className={cn(
                            'px-5 py-2 rounded-2xl text-sm font-bold transition-all duration-300 w-full',
                            active === o.value
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200/50 scale-[1.02]'
                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 cursor-pointer'
                        )}
                    >
                        {o.label}
                    </button>
                ))}

                <button
                    onClick={() => setIsPickerOpen(true)}
                    aria-pressed={active === 'custom'}
                    className={cn(
                        'px-5 py-2 rounded-2xl text-sm font-bold transition-all duration-300 w-full flex justify-center',
                        active === 'custom'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200/50 scale-[1.02]'
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 cursor-pointer'
                    )}
                >
                    Custom
                </button>
            </div>

            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            className={cn(
                                "w-full justify-start text-left font-bold text-sm h-12 rounded-2xl hover:bg-slate-50 px-5",
                                active === 'custom' && "text-blue-600 bg-blue-50/50"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {internalRange?.from ? (
                                internalRange.to ? (
                                    <>
                                        {format(internalRange.from, "MMM dd, yyyy")} - {format(internalRange.to, "MMM dd, yyyy")}
                                    </>
                                ) : (
                                    <>
                                        {format(internalRange.from, "MMM dd, yyyy")} - Select end date...
                                    </>
                                )
                            ) : (
                                <span className="text-slate-400">Set custom range...</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={internalRange?.from}
                            selected={internalRange}
                            onSelect={handleSelect}
                            onDayMouseEnter={(day) => setHoveredDate(day)}
                            onDayMouseLeave={() => setHoveredDate(null)}
                            numberOfMonths={2}
                            disabled={(date) => date > new Date()}
                            className="rounded-md border-none p-1.5 w-full flex-1 md:[--cell-size:--spacing(10)]"
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
                                }
                            }}
                            modifiersClassNames={{
                                hoverRange: "bg-blue-600/10 text-slate-900 !rounded-none ",
                                hoverRangeStart: "bg-blue-600/10 text-slate-900 !rounded-l-md !rounded-r-none",
                                hoverRangeEnd: "bg-blue-600/10 text-slate-900 !rounded-r-md !rounded-l-none",
                                fromDateHover: internalRange?.from < hoveredDate ? "!rounded-l-md !rounded-r-none" : "!rounded-r-md !rounded-l-none"
                            }}
                        />
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    )
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label, colors = {} }) => {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-white/90 backdrop-blur-md text-slate-900 text-xs rounded-2xl px-4 py-3 shadow-2xl border border-white/80 min-w-[140px]">
            {label && <p className="text-slate-400 font-bold mb-2 uppercase tracking-tighter">{label}</p>}
            {payload.map((p, i) => {
                // Prioritize color/stroke over fill (which might be 'none' for line charts)
                const rawColor = p.color || p.stroke || p.fill || p.payload?.fill || p.payload?.color
                const color = (rawColor === 'none' || rawColor === 'transparent') ? (colors[p.name] || '#cbd5e1') : (rawColor || '#cbd5e1')

                // Clean up name for display
                const displayName = p.name === 'value' ? 'Cases' : p.name?.toString().replace(/_/g, ' ').toUpperCase()

                return (
                    <div key={i} className="flex items-center gap-3 py-1">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ background: color }} />
                        <span className="text-slate-500 font-medium flex-1">{displayName}</span>
                        <span className="font-black text-slate-900">{fmt(p.value)}</span>
                    </div>
                )
            })}
        </div>
    )
}

// ─── Section Label ───────────────────────────────────────────────────────────
function SectionLabel({ icon: Icon, text }) {
    return (
        <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-slate-900/5 rounded-lg">
                <Icon className="w-3.5 h-3.5 text-slate-900" aria-hidden="true" />
            </div>
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-800">{text}</span>
        </div>
    )
}

// ─── Statistic Bar ───────────────────────────────────────────────────────────
// Small vertical bar chart for hero cards
function StatisticBar({ data, height = 120 }) {
    return (
        <div style={{ height }} className="min-w-[140px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, left: 10, right: 10, bottom: 0 }}>
                    <XAxis dataKey="name" hide />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={24}>
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Bar>
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}

// ─── Segmented Metric Bar ────────────────────────────────────────────────────
function SegmentedMetricBar({ segments, className }) {
    const total = segments.reduce((s, seg) => s + (seg.value || 0), 0)
    if (total === 0) return <div className={cn('h-3 bg-slate-100 rounded-full', className)} />
    return (
        <div className={cn('flex h-3 overflow-hidden rounded-full shadow-inner bg-slate-100', className)}>
            {segments.filter(s => s.value > 0).map((s, i) => (
                <div
                    key={i}
                    className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-700"
                    style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
                    title={`${s.label}: ${fmt(s.value)}`}
                />
            ))}
        </div>
    )
}

// ─── Pie/Donut Label ──────────────────────────────────────────────────────────
const RADIAN = Math.PI / 180
const PieLbl = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null
    const r = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + r * Math.cos(-midAngle * RADIAN)
    const y = cy + r * Math.sin(-midAngle * RADIAN)
    return (
        <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={900}>
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    )
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function Empty({ h = 200 }) {
    return (
        <div className="flex flex-col items-center justify-center text-slate-300" style={{ height: h }}>
            <div className="p-4 bg-slate-50 rounded-3xl mb-3">
                <Activity className="w-8 h-8 opacity-40" aria-hidden="true" />
            </div>
            <p className="text-sm font-bold tracking-tight">No data detected</p>
            <p className="text-xs font-medium text-slate-400">Try changing the date range</p>
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
        platformLineData = [],
        platforms = [],
        platformColors: dbPlatformColors = {},
        riskColors = {},
    } = data ?? {}

    const {
        totalReviewed = 0,
        totalSafe = 0,
        totalFlagForTakedown = 0,
        totalTakedown = 0,
        totalPending = 0,
        pendingRisk = {},
        totalCasesDiscovered = 0,
    } = clientTracker

    const daysLabel = days === 1 ? 'Past 24 Hours' : days === 'custom' ? (from && to ? `${format(new Date(from), 'MMM d, yyyy')} - ${format(new Date(to), 'MMM d, yyyy')}` : 'Custom Range') : `Last ${days} Days`

    const decisionData = useMemo(() => [
        { name: 'No Action', value: totalSafe, color: '#10b981' },
        { name: 'Flagged', value: totalFlagForTakedown, color: '#f43f5e' },
        { name: 'Takedown', value: totalTakedown, color: '#f97316' },
    ], [totalSafe, totalFlagForTakedown, totalTakedown])

    const pendingRiskSegments = useMemo(() => [
        { label: 'High', value: pendingRisk?.high ?? 0, color: '#f43f5e' },
        { label: 'Medium', value: pendingRisk?.medium ?? 0, color: '#f97316' },
        { label: 'Low', value: pendingRisk?.low ?? 0, color: '#f59e0b' },
        { label: 'Safe', value: pendingRisk?.safe ?? 0, color: '#64748b' },
    ], [pendingRisk])

    const mergedPlatformColors = useMemo(() => ({ ...PLATFORM_COLORS, ...dbPlatformColors }), [dbPlatformColors])

    const BLUE_SHADES = [
        '#1d4ed8', // blue-700
        '#2563eb', // blue-600
        '#3b82f6', // blue-500
        '#60a5fa', // blue-400
        '#93c5fd', // blue-300
        '#bfdbfe', // blue-200
        '#dbeafe', // blue-100
        '#eff6ff', // blue-50
    ];

    const categoryDataWithColors = useMemo(() => {
        const topCategories = categoryDistribution.slice(0, 8);
        const count = topCategories.length;
        return topCategories.map((c, i) => {
            const shadeIndex = count <= 1 ? 0 : Math.round((i / (count - 1)) * 7);
            return {
                ...c,
                fill: BLUE_SHADES[shadeIndex] || '#1d4ed8'
            };
        });
    }, [categoryDistribution]);

    return (
        <div className="min-h-full bg-[#f8f9fa]">

            {/* ── Header ────────────────────────────────────────────── */}

            <PageHeader Icon={LayoutDashboard} title="Analytics" />
            {/* <header className="bg-white border-b border-slate-200 py-5 px-8 shrink-0 flex justify-between items-center z-10"> */}
            {/* <div>
                    <h1 className="text-2xl flex items-center gap-2 font-bold text-slate-900 tracking-tight">
                        <LayoutDashboard className="w-6 h-6 stroke-3 text-slate-900" />
                        Home
                    </h1> */}
            {/* <p className="text-sm text-slate-500 mt-0.5">Overview of all cases</p> */}
            {/* </div> */}
            {/* </header> */}

            {/* ── Main Content ────────────────────────────────────────── */}
            <main className="px-6 pt-6 pb-20 relative z-10 space-y-8">

                <section>
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Card 1: Main Review Progress */}
                        <div className="lg:col-span-6 bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row gap-8">

                            {/* Left Side: Main Stats & Progress */}
                            <div className="flex-1 flex flex-col justify-center">
                                <div className=' h-full flex flex-col justify-between'>
                                    <div className="flex items-center gap-2 mb-6">
                                        <div className="p-1.5 bg-slate-900/5 rounded-lg">
                                            <ShieldCheck className="w-3.5 h-3.5 text-slate-900" />
                                        </div>
                                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-800">Review Activity</span>
                                    </div>
                                    <div className='flex flex-col gap-8 flex-1 justify-center py-4'>
                                        <div>
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Cases Reviewed</span>
                                            <div className="flex items-baseline gap-3">
                                                <span className="text-7xl font-black text-slate-900 tracking-tighter tabular-nums leading-none">
                                                    {fmt(totalReviewed)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="w-full h-px bg-slate-100" />
                                        <div>
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">New Cases Discovered</span>
                                            <div className="flex items-baseline gap-3">
                                                <span className="text-5xl font-black text-slate-400 tracking-tighter tabular-nums leading-none">
                                                    {fmt(totalCasesDiscovered)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Bottom Info Section */}
                                <div className="mt-6 pt-6 border-t border-slate-100">
                                    <p className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                                        <Activity className="w-3.5 h-3.5 text-blue-500" />
                                        Activity recorded for {daysLabel.toLowerCase()}
                                    </p>
                                </div>
                            </div>

                            {/* Right Side: Decision Distribution Visual */}
                            <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 flex flex-col min-w-[220px]">
                                <div className="mb-auto"> {/* Pushes content to top/bottom with balance */}
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8 text-center">
                                        Review Decisions
                                    </p>

                                    {/* Graph Area */}
                                    <div className="relative py-2">
                                        <StatisticBar data={decisionData} height={160} />
                                    </div>
                                </div>

                                {/* Legend Items */}
                                <div className="space-y-2 mt-8">
                                    {decisionData.map(d => (
                                        <div
                                            key={d.name}
                                            className="flex items-center justify-between bg-white px-4 py-2.5 rounded-2xl border border-slate-200/40 shadow-sm"
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <span
                                                    className="w-2.5 h-2.5 rounded-full ring-4 ring-slate-50"
                                                    style={{ backgroundColor: d.color }}
                                                />
                                                <span className="text-[11px] font-bold text-slate-600">{d.name}</span>
                                            </div>
                                            <span className="text-[11px] font-black text-slate-900 tabular-nums">
                                                {fmt(d.value)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Date Filter + Queue Status */}
                        <div className="lg:col-span-6 flex flex-col gap-6">
                            {/* Date Filter Card */}
                            <DateFilter active={days} from={from} to={to} />

                            {/* Queue Status Card */}
                            <div className="bg-white border border-slate-200/60 rounded-3xl p-8 shadow-sm flex-1 flex flex-col">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Queue Status</h3>
                                    <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                        <Clock className="w-4 h-4 text-slate-400" />
                                    </div>
                                </div>

                                <div className="flex-1 flex flex-col justify-center">
                                    <div className="bg-amber-400/10 text-amber-600 self-start px-2 py-0.5 rounded-md text-[10px] font-black mb-4 uppercase tracking-widest">Pending Review</div>
                                    <div className="text-6xl font-black text-slate-900 tabular-nums border-b-4 border-amber-400 inline-block mb-10">{fmt(totalPending)}</div>

                                    <div className="space-y-5">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Risk Breakdown</p>
                                        <SegmentedMetricBar segments={pendingRiskSegments} />

                                        <div className="grid grid-cols-2 gap-4">
                                            {pendingRiskSegments.map(s => (
                                                <div key={s.label} className="flex items-center justify-between border-b border-slate-50 pb-2">
                                                    <span className="text-[11px] font-bold text-slate-400">{s.label}</span>
                                                    <span className="text-[11px] font-black text-slate-900">{fmt(s.value)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </section>

                <section className="space-y-8">
                    {/* Trends Over Time */}
                    <div className="bg-white border border-slate-200/60 rounded-3xl p-8 shadow-sm">
                        <div className="flex flex-col md:flex-row justify-between md:items-start gap-8 mb-8">
                            <div>
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="p-1.5 bg-slate-900/5 rounded-lg">
                                        <TrendingUp className="w-3.5 h-3.5 text-slate-900" />
                                    </div>
                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-800">Scanning Trends</span>
                                </div>
                                <h2 className="text-5xl font-black text-slate-900 tracking-tighter tabular-nums">{fmt(totalCasesDiscovered)}</h2>
                                <p className="text-slate-400 font-bold mt-1">Total cases discovered</p>
                            </div>
                            <div className="flex flex-wrap gap-4 pt-2">
                                {platforms.map(p => (
                                    <div key={p} className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: mergedPlatformColors[p] }} />
                                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{p}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {platformLineData.length === 0 ? <Empty h={240} /> : (
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    {platformLineData.length === 1 ? (
                                        <BarChart data={platformLineData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="date" tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} tickLine={false} axisLine={false} dy={10} />
                                            <YAxis hide domain={['auto', 'auto']} />
                                            <Tooltip content={<ChartTooltip colors={mergedPlatformColors} />} cursor={{ fill: '#f8f9fa' }} />
                                            {platforms.map(p => (
                                                <Bar
                                                    key={p}
                                                    dataKey={p}
                                                    name={p}
                                                    fill={mergedPlatformColors[p]}
                                                    radius={[4, 4, 0, 0]}
                                                    barSize={40}
                                                />
                                            ))}
                                        </BarChart>
                                    ) : (
                                        <LineChart data={platformLineData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="date" tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} tickLine={false} axisLine={false} dy={10} />
                                            <YAxis hide domain={['auto', 'auto']} />
                                            <Tooltip content={<ChartTooltip colors={mergedPlatformColors} />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }} />
                                            {platforms.map(p => (
                                                <Line
                                                    key={p}
                                                    type="monotone"
                                                    dataKey={p}
                                                    name={p}
                                                    stroke={mergedPlatformColors[p]}
                                                    strokeWidth={3}
                                                    dot={false}
                                                    activeDot={{ r: 4, strokeWidth: 0 }}
                                                />
                                            ))}
                                        </LineChart>
                                    )}
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Category Analysis */}
                        <div className="lg:col-span-8 bg-white border border-slate-200/60 rounded-3xl p-8 shadow-sm">
                            <h3 className="text-[12px] font-black text-slate-900 uppercase tracking-widest mb-6 px-1">Top Categories</h3>
                            {categoryDataWithColors.length === 0 ? <Empty h={300} /> : (
                                <div className="h-[300px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            layout="vertical"
                                            data={categoryDataWithColors}
                                            margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                            <XAxis
                                                type="number"
                                                hide
                                                domain={[0, 'auto']}
                                            />
                                            <YAxis
                                                type="category"
                                                dataKey="name"
                                                tick={{ fontSize: 10, fontWeight: 800, fill: '#64748b' }}
                                                tickLine={false}
                                                axisLine={false}
                                                width={140}
                                                tickFormatter={(val) => val.replace(/_/g, ' ').toUpperCase()}
                                            />
                                            <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f8f9fa' }} />
                                            <Bar
                                                dataKey="value"
                                                radius={[0, 6, 6, 0]}
                                                barSize={20}
                                            >
                                                {categoryDataWithColors.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>

                        {/* Source Distribution (Now positioned away from Hero Queue Status) */}
                        <div className="lg:col-span-4 bg-white border border-slate-200/60 rounded-3xl p-8 shadow-sm">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Source Distribution</h3>
                                <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                    <Filter className="w-4 h-4 text-slate-400" />
                                </div>
                            </div>

                            <div className="relative h-[200px] flex items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={riskDistribution.filter(r => r.value > 0)}
                                            cx="50%" cy="50%"
                                            innerRadius={60} outerRadius={85}
                                            paddingAngle={5}
                                            dataKey="value"
                                            labelLine={false}
                                            label={PieLbl}
                                        >
                                            {riskDistribution.filter(r => r.value > 0).map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} strokeWidth={0} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<ChartTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-xl font-black text-slate-900">{fmt(totalCasesDiscovered)}</span>
                                </div>
                            </div>

                            <div className="space-y-4 pt-6">
                                {riskDistribution.map(r => (
                                    <div key={r.name} className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2.5 h-2.5 rounded-full border border-white shadow-sm" style={{ background: r.fill }} />
                                            <span className="text-xs font-bold text-slate-500">{r.name}</span>
                                        </div>
                                        <span className="text-xs font-black text-slate-900">{fmt(r.value)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    )
}