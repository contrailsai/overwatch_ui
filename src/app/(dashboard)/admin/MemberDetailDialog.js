"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Mail, UserCheck, Building2, ShieldCheck, Users, Clock, Activity, FileDown, Loader2 } from 'lucide-react'
import { fetch_client_activity_history } from './actions'

const roleLabel = (permission) => {
    if (permission === 'client-admin') return 'Admin'
    if (permission === 'client-reviewer') return 'Reviewer'
    return 'Analyst'
}

const formatTime = (timeStr) => {
    if (!timeStr) return '--:--'
    try {
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        let normalized = timeStr
        if (normalized.endsWith('+00')) normalized = normalized.replace('+00', 'Z')
        else if (normalized.match(/[+-]\d{2}$/)) normalized = normalized + ':00'
        else if (normalized.match(/[+-]\d{4}$/)) normalized = normalized.slice(0, -2) + ':' + normalized.slice(-2)
        const d = parseISO(`${todayStr}T${normalized}`)
        return isNaN(d.getTime()) ? timeStr : format(d, 'HH:mm')
    } catch {
        return timeStr
    }
}

const heatTone = (count, max) => {
    if (!count || count <= 0) return 'bg-slate-100 border-slate-200/60'
    const ratio = max > 0 ? count / max : 0
    if (ratio > 0.75) return 'bg-emerald-600 border-emerald-700/40'
    if (ratio > 0.5) return 'bg-emerald-500 border-emerald-600/40'
    if (ratio > 0.25) return 'bg-emerald-400 border-emerald-500/40'
    return 'bg-emerald-200 border-emerald-300/40'
}

export default function MemberDetailDialog({ client, onClose }) {
    return (
        <Dialog open={!!client} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="p-0 overflow-hidden bg-white shadow-2xl border-slate-100 rounded-2xl sm:max-w-[760px] max-h-[90vh] flex flex-col">
                {client && <MemberHistoryView key={client.id} client={client} />}
            </DialogContent>
        </Dialog>
    )
}

function MemberHistoryView({ client }) {
    // Initial state already represents "loading" — no sync setState needed in effect
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState(null)
    const [error, setError] = useState(null)

    useEffect(() => {
        let cancelled = false
        fetch_client_activity_history(client.id, 30)
            .then(res => {
                if (cancelled) return
                if (res?.error) setError(res.error)
                else setData(res)
            })
            .catch(err => {
                if (!cancelled) setError(err?.message || 'Failed to load activity history.')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => { cancelled = true }
    }, [client.id])

    const chartData = useMemo(() => {
        if (!data?.series) return []
        return data.series.map(d => ({
            date: d.date,
            Cases: d.cases || 0,
            Profiles: d.profiles || 0
        }))
    }, [data])

    const heatmap = useMemo(() => {
        if (!data?.series) return { weeks: [], max: 0 }
        const series = data.series.map(d => ({ ...d, total: (d.cases || 0) + (d.profiles || 0) }))
        const max = series.reduce((m, d) => Math.max(m, d.total), 0)
        const weeks = []
        for (let i = 0; i < series.length; i += 7) {
            weeks.push(series.slice(i, i + 7))
        }
        return { weeks, max }
    }, [data])

    return (
        <>
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                <DialogHeader>
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-blue-50 text-blue-600 shrink-0 mt-0.5">
                            <Mail className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-lg font-bold text-slate-900 break-all leading-tight">
                                {client.email}
                            </DialogTitle>
                            <DialogDescription asChild>
                                <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px]">
                                    <Badge variant={client.permission === 'client-admin' ? 'default' : 'secondary'} className="px-1.5 py-0 text-[10px] font-bold tracking-wide">
                                        {roleLabel(client.permission)}
                                    </Badge>
                                    {client.alias && (
                                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md border border-blue-100/50">
                                            <UserCheck className="w-3 h-3" /> {client.alias}
                                        </span>
                                    )}
                                    {client.organization && (
                                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-md border border-slate-200">
                                            <Building2 className="w-3 h-3 text-purple-500" /> {client.organization}
                                        </span>
                                    )}
                                </div>
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>
            </div>

            <div className="overflow-y-auto p-6 space-y-6">
                {loading && (
                    <div className="flex items-center justify-center py-12 text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        <span className="text-sm">Loading activity history…</span>
                    </div>
                )}

                {error && !loading && (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">
                        {error}
                    </div>
                )}

                {!loading && !error && data && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <Stat label="Cases (30d)" value={data.totals.cases} icon={ShieldCheck} color="text-emerald-600" bg="bg-emerald-50" />
                            <Stat label="Profiles (30d)" value={data.totals.profiles} icon={Users} color="text-blue-600" bg="bg-blue-50" />
                            <Stat label="Active days" value={`${data.totals.activeDays}/${data.days}`} icon={Activity} color="text-violet-600" bg="bg-violet-50" />
                            <Stat label="Today" value={`${client.activityStats?.todayCases || 0}c · ${client.activityStats?.todayProfiles || 0}p`} icon={Clock} color="text-amber-600" bg="bg-amber-50" small />
                        </div>

                        <section>
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Activity heatmap · last {data.days} days</h4>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                    <span>Less</span>
                                    <span className="w-2.5 h-2.5 rounded-sm bg-slate-100 border border-slate-200/60" />
                                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-200 border border-emerald-300/40" />
                                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 border border-emerald-500/40" />
                                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 border border-emerald-600/40" />
                                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 border border-emerald-700/40" />
                                    <span>More</span>
                                </div>
                            </div>
                            <div className="flex gap-1 overflow-x-auto pb-1">
                                {heatmap.weeks.map((week, wi) => (
                                    <div key={wi} className="flex flex-col gap-1 shrink-0">
                                        {week.map(day => (
                                            <div
                                                key={day.date}
                                                title={`${day.date}: ${day.cases} cases, ${day.profiles} profiles`}
                                                className={`w-4 h-4 rounded-sm border ${heatTone(day.total, heatmap.max)} transition-transform hover:scale-125 cursor-default`}
                                            />
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section>
                            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Daily review volume</h4>
                            <div className="h-[180px] w-full -ml-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
                                        <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                                        <Tooltip
                                            content={({ active, payload, label }) => {
                                                if (!active || !payload?.length) return null
                                                const items = payload.reduce((acc, p) => { acc[p.dataKey] = p.value; return acc }, {})
                                                let dateStr = label
                                                try { dateStr = format(parseISO(label), 'MMM d, yyyy') } catch { /* noop */ }
                                                return (
                                                    <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl text-[11px] ring-1 ring-white/20 space-y-0.5">
                                                        <p className="text-slate-300 text-[9px] uppercase tracking-wider">{dateStr}</p>
                                                        <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Cases: <span className="font-bold tabular-nums">{(items.Cases || 0).toLocaleString()}</span></p>
                                                        <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-400" /> Profiles: <span className="font-bold tabular-nums">{(items.Profiles || 0).toLocaleString()}</span></p>
                                                    </div>
                                                )
                                            }}
                                            cursor={{ fill: '#f1f5f9' }}
                                        />
                                        <Legend iconType="circle" wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                                        <Bar dataKey="Cases" stackId="a" fill="#10b981" radius={[2, 2, 0, 0]} />
                                        <Bar dataKey="Profiles" stackId="a" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </section>

                        <section>
                            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <FileDown className="w-3.5 h-3.5" /> Reports downloaded · last {data.days} days
                            </h4>
                            {Object.keys(data.totals.reports || {}).length === 0 ? (
                                <p className="text-xs text-slate-400 italic">No reports downloaded in this window.</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(data.totals.reports).map(([type, count]) => (
                                        <Badge key={type} variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-200 text-[11px]">
                                            <span className="capitalize mr-1">{type.replace(/_/g, ' ')}:</span>
                                            <span className="font-bold">{count}</span>
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section>
                            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Recent active days</h4>
                            <div className="rounded-lg border border-slate-100 overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50">
                                        <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                                            <th className="px-3 py-2 font-semibold">Date</th>
                                            <th className="px-3 py-2 font-semibold">First login</th>
                                            <th className="px-3 py-2 font-semibold">Last activity</th>
                                            <th className="px-3 py-2 font-semibold text-right">Cases</th>
                                            <th className="px-3 py-2 font-semibold text-right">Profiles</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {data.series.filter(d => d.cases > 0 || d.profiles > 0 || d.loginTime).slice().reverse().slice(0, 10).map(d => (
                                            <tr key={d.date} className="hover:bg-slate-50/60">
                                                <td className="px-3 py-2 text-slate-700 font-medium">{(() => { try { return format(parseISO(d.date), 'MMM d, yyyy') } catch { return d.date } })()}</td>
                                                <td className="px-3 py-2 text-slate-600 tabular-nums">{formatTime(d.loginTime)}</td>
                                                <td className="px-3 py-2 text-slate-600 tabular-nums">{formatTime(d.lastActivity)}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-slate-800 tabular-nums">{d.cases}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-slate-800 tabular-nums">{d.profiles}</td>
                                            </tr>
                                        ))}
                                        {data.series.every(d => !(d.cases > 0 || d.profiles > 0 || d.loginTime)) && (
                                            <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400 italic">No activity recorded.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </>
    )
}

function Stat({ label, value, icon: Icon, color, bg, small }) {
    return (
        <div className="rounded-xl border border-slate-100 p-3 bg-white">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 truncate">{label}</span>
                <div className={`p-1.5 rounded-lg ${bg} shrink-0`}>
                    <Icon className={`w-3.5 h-3.5 ${color}`} />
                </div>
            </div>
            <div className={`mt-1 font-bold text-slate-900 tabular-nums ${small ? 'text-base' : 'text-xl'}`}>
                {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
        </div>
    )
}
