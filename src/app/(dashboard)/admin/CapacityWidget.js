"use client"

import React, { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts'
import { Card, CardContent } from "@/components/ui/card"
import { Inbox, CheckCheck, Gauge, TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown } from 'lucide-react'
import Sparkline from '@/components/Sparkline'

const pct = (reviewed, cases) => {
    if (!cases) return null
    return Math.round((reviewed / cases) * 100)
}

const ratioTone = (p) => {
    if (p === null) return { label: 'No incoming cases', color: 'text-slate-500', bg: 'bg-slate-100', accent: 'bg-slate-400' }
    if (p >= 80) return { label: 'Healthy', color: 'text-emerald-700', bg: 'bg-emerald-50', accent: 'bg-emerald-500' }
    if (p >= 50) return { label: 'Keeping up', color: 'text-amber-700', bg: 'bg-amber-50', accent: 'bg-amber-500' }
    return { label: 'Backlog risk', color: 'text-red-700', bg: 'bg-red-50', accent: 'bg-red-500' }
}

const TrendPill = ({ delta, unit = '%' }) => {
    if (delta === null || delta === undefined) return null
    const isUp = delta > 0
    const isFlat = delta === 0
    const Icon = isUp ? ArrowUp : ArrowDown
    const tone = isFlat
        ? 'bg-slate-50 text-slate-500 border-slate-200'
        : isUp
            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : 'bg-rose-50 text-rose-700 border-rose-100'
    return (
        <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md border ${tone}`}>
            {!isFlat && <Icon className="w-3 h-3" strokeWidth={2.5} />}
            <span>{isUp ? '+' : ''}{delta}{unit}</span>
        </span>
    )
}

const MiniKpiCard = ({ icon: Icon, label, value, valueSuffix, delta, deltaUnit = '%', sparkData, sparkLabel, color = '#3b82f6', valueClass = '' }) => (
    <div className="rounded-xl border border-slate-100 p-3 bg-slate-50/30">
        <div className="flex justify-between items-start gap-2">
            <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                <Icon className="w-4 h-4" strokeWidth={2} />
            </div>
            <div className="w-[55%] h-8">
                <Sparkline data={sparkData} color={color} label={sparkLabel} />
            </div>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
            <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">{label}</p>
                <p className={`text-xl font-black tracking-tight tabular-nums leading-none mt-1 ${valueClass || 'text-slate-900'}`}>
                    {value}{valueSuffix || ''}
                </p>
            </div>
            <TrendPill delta={delta} unit={deltaUnit} />
        </div>
    </div>
)

const TrendBadge = ({ current, previous, suffix = '' }) => {
    if (!previous) return null
    const diff = current - previous
    if (diff === 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500">
                <Minus className="w-3 h-3" /> Flat
            </span>
        )
    }
    const up = diff > 0
    const pctChange = previous > 0 ? Math.round((diff / previous) * 100) : 100
    return (
        <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${up ? 'text-emerald-600' : 'text-red-600'}`}>
            {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {up ? '+' : ''}{pctChange}%{suffix}
        </span>
    )
}

export default function CapacityWidget({ metrics }) {
    const summary = useMemo(() => {
        if (!metrics) return null
        const { dailySeries, last7, last30 } = metrics

        // Prior 7-day window for trend comparison
        const prior7 = dailySeries.slice(-14, -7)
        const prior7Sum = prior7.reduce(
            (acc, d) => ({ cases: acc.cases + (d.cases || 0), reviewed: acc.reviewed + (d.reviewed || 0) }),
            { cases: 0, reviewed: 0 }
        )

        const pctDelta = (curr, prev) => {
            if (!prev) return curr > 0 ? 100 : null
            return Math.round(((curr - prev) / prev) * 100)
        }

        const ratio7Prior = pct(prior7Sum.reviewed, prior7Sum.cases)
        const ratio7Curr = pct(last7.reviewed, last7.cases)

        // Rolling 7-day rate sparkline for "Rate 30d" — smooths daily noise
        const rollingRate = dailySeries.map((_, idx) => {
            const start = Math.max(0, idx - 6)
            const window = dailySeries.slice(start, idx + 1)
            const c = window.reduce((s, d) => s + (d.cases || 0), 0)
            const r = window.reduce((s, d) => s + (d.reviewed || 0), 0)
            return { date: dailySeries[idx].date, value: c > 0 ? Math.round((r / c) * 100) : 0 }
        })

        return {
            last7,
            last30,
            prior7: prior7Sum,
            ratio7: ratio7Curr,
            ratio30: pct(last30.reviewed, last30.cases),
            chartData: dailySeries.map(d => ({
                date: d.date,
                Incoming: d.cases,
                Reviewed: d.reviewed
            }))
            , sparks: {
                incoming: dailySeries.map(d => ({ date: d.date, value: d.cases || 0 })),
                reviewed: dailySeries.map(d => ({ date: d.date, value: d.reviewed || 0 })),
                rate: rollingRate
            },
            deltas: {
                incoming: pctDelta(last7.cases, prior7Sum.cases),
                reviewed: pctDelta(last7.reviewed, prior7Sum.reviewed),
                rate: (ratio7Curr !== null && ratio7Prior !== null) ? (ratio7Curr - ratio7Prior) : null
            }
        }
    }, [metrics])

    if (!summary) {
        return (
            <Card className="border-none shadow-sm bg-white">
                <CardContent className="p-4 md:p-6">
                    <p className="text-sm text-slate-500">No capacity data available yet.</p>
                </CardContent>
            </Card>
        )
    }

    const tone7 = ratioTone(summary.ratio7)
    const tone30 = ratioTone(summary.ratio30)

    return (
        <Card className="border-none shadow-sm bg-white overflow-hidden px-3 py-3">
            <CardContent className="p-1 md:p-2 space-y-5">
                <div className="flex flex-col lg:flex-col gap-4 lg:gap-6">
                    {/* Header + headline ratio */}
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-blue-50">
                                <Gauge className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-slate-900">Team Capacity</h3>
                                <p className="text-[11px] text-slate-500">Incoming vs reviewed cases</p>
                            </div>
                        </div>

                        <div className='flex gap-2'>



                        {/* Mini stats: 30d + last 7d breakdown */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-1 min-w-0">
                            <div className={`rounded-xl p-3 ${tone7.bg} border border-transparent`}>
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Last 7 days</span>
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${tone7.color}`}>{tone7.label}</span>
                                </div>
                                <div className="mt-1 flex items-baseline gap-1.5">
                                    <span className={`text-3xl font-bold ${tone7.color}`}>
                                        {summary.ratio7 === null ? '—' : `${summary.ratio7}%`}
                                    </span>
                                    <span className="text-xs text-slate-500">reviewed</span>
                                </div>
                                <div className="mt-2 h-1.5 w-full bg-white/60 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full ${tone7.accent} transition-all duration-500`}
                                        style={{ width: `${Math.min(100, summary.ratio7 || 0)}%` }}
                                    />
                                </div>
                                <div className="mt-2 text-[11px] text-slate-600 flex items-center justify-between">
                                    <span>{summary.last7.reviewed.toLocaleString()} of {summary.last7.cases.toLocaleString()} cases</span>
                                    <TrendBadge current={summary.last7.reviewed} previous={summary.prior7.reviewed} suffix=" wow" />
                                </div>
                            </div>
                            <MiniKpiCard
                                icon={Inbox}
                                label="Incoming 7d"
                                value={summary.last7.cases.toLocaleString()}
                                delta={summary.deltas.incoming}
                                sparkData={summary.sparks.incoming}
                                sparkLabel="cases"
                                color="#3b82f6"
                            />
                            <MiniKpiCard
                                icon={CheckCheck}
                                label="Reviewed 7d"
                                value={summary.last7.reviewed.toLocaleString()}
                                delta={summary.deltas.reviewed}
                                sparkData={summary.sparks.reviewed}
                                sparkLabel="cases"
                                color="#10b981"
                            />
                            <MiniKpiCard
                                icon={Gauge}
                                label="Rate 30d"
                                value={summary.ratio30 === null ? '—' : summary.ratio30}
                                valueSuffix={summary.ratio30 === null ? '' : '%'}
                                valueClass={tone30.color}
                                delta={summary.deltas.rate}
                                deltaUnit="pp"
                                sparkData={summary.sparks.rate}
                                sparkLabel="%"
                                color="#8b5cf6"
                            />
                        </div>
                        </div>
                    </div>

                {/* 30-day trend chart */}
                <div className="h-[140px] w-full -ml-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={summary.chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="cap-incoming" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="cap-reviewed" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(d) => { try { return format(parseISO(d), 'MMM d') } catch { return d } }}
                                stroke="#94a3b8"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={24}
                            />
                            <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null
                                    const items = payload.reduce((acc, p) => { acc[p.dataKey] = p.value; return acc }, {})
                                    let dateStr = label
                                    try { dateStr = format(parseISO(label), 'MMM d, yyyy') } catch { /* noop */ }
                                    return (
                                        <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl text-[11px] ring-1 ring-white/20 space-y-0.5">
                                            <p className="text-slate-300 text-[9px] uppercase tracking-wider">{dateStr}</p>
                                            <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-400" /> Incoming: <span className="font-bold tabular-nums">{(items.Incoming || 0).toLocaleString()}</span></p>
                                            <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Reviewed: <span className="font-bold tabular-nums">{(items.Reviewed || 0).toLocaleString()}</span></p>
                                        </div>
                                    )
                                }}
                                cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }}
                            />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                            <Area type="monotone" dataKey="Incoming" stroke="#3b82f6" strokeWidth={2} fill="url(#cap-incoming)" />
                            <Area type="monotone" dataKey="Reviewed" stroke="#10b981" strokeWidth={2} fill="url(#cap-reviewed)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
}
