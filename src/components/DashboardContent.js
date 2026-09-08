'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
    LayoutDashboard, CalendarIcon, X,
    CheckCircle2, PlusCircle, XCircle,
    ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import Sparkline from './Sparkline'
import { cn } from '@/lib/utils'
import PageHeader from '@/components/PageHeader'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { format } from 'date-fns'
import { AnalyticsModule } from '@/components/analytics/modules/charts'
import { moduleSpanClass, kpiCopy } from '@/lib/analytics/packModules'

const fmt = (n) => (n ?? 0).toLocaleString()

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

    const pillBase = 'h-9 px-4 rounded-full text-sm font-semibold transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1.5 cursor-pointer'
    const pillActive = 'bg-blue-600 text-white border border-blue-600'
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
                        <div className="text-sm">
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

function KpiCard({ icon: Icon, label, value, delta, sparkData, color = '#3b82f6', split }) {
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
                    {split ? (
                        <p className="text-[10px] font-semibold text-slate-400 tabular-nums mt-1.5">{split}</p>
                    ) : null}
                </div>
                <TrendPill delta={delta} />
            </div>
        </div>
    )
}

export function DashboardContent({ data }) {
    const {
        days = 1,
        from,
        to,
        types = ['post'],
        modules = [],
        kpiCopy: copyFromServer,
        clientTracker = {},
        seriesByModule = {},
    } = data ?? {}

    const copy = copyFromServer || kpiCopy(types)
    const {
        totalReviewed = 0,
        totalTakedown = 0,
        totalCasesDiscovered = 0,
        deltas = {},
        split = null,
        dailyKpiData = [],
    } = clientTracker

    const overviewLabel = days === 1
        ? '1-day overview'
        : days === 'custom'
            ? (from && to ? `${format(new Date(from), 'MMM d')} – ${format(new Date(to), 'MMM d')} overview` : 'Custom range overview')
            : `${days}-day overview`

    const lastUpdated = format(new Date(), 'd MMM yyyy')

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
            <PageHeader Icon={LayoutDashboard} title="Analytics" />

            <main className="overflow-auto px-4 md:px-6 py-4 md:py-6 pb-20 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <p className="text-sm font-medium text-slate-500">
                        <span className="text-slate-700 font-semibold">{overviewLabel}</span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span>Last updated {lastUpdated}</span>
                    </p>
                    <DateFilter active={days} from={from} to={to} />
                </div>

                <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <KpiCard
                        icon={CheckCircle2}
                        label={copy.reviewed}
                        value={totalReviewed}
                        delta={deltas.totalReviewed}
                        split={split?.reviewed}
                        sparkData={dailyKpiData.map(d => ({ value: d.reviewed, date: d.date }))}
                        color="#10b981"
                    />
                    <KpiCard
                        icon={PlusCircle}
                        label={copy.discovered}
                        value={totalCasesDiscovered}
                        delta={deltas.totalCasesDiscovered}
                        split={split?.discovered}
                        sparkData={dailyKpiData.map(d => ({ value: d.discovered, date: d.date }))}
                        color="#3b82f6"
                    />
                    <KpiCard
                        icon={XCircle}
                        label={copy.takedown}
                        value={totalTakedown}
                        delta={deltas.totalTakedown}
                        split={split?.takedown}
                        sparkData={dailyKpiData.map(d => ({ value: d.takedown, date: d.date }))}
                        color="#ef4444"
                    />
                </section>

                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {modules.map((mod) => (
                        <div key={mod.id} className={moduleSpanClass(mod.size)}>
                            <AnalyticsModule
                                id={mod.id}
                                series={seriesByModule[mod.id]}
                                scannedLabel={copy.scanned}
                            />
                        </div>
                    ))}
                </section>
            </main>
        </div>
    )
}
