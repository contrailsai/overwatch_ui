'use client'

import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts'

export default function Sparkline({ data, color = '#3b82f6', label = 'cases' }) {
    if (!data || data.length === 0) return <div className="h-full w-full bg-slate-50 rounded-md animate-pulse" />

    return (
        <div className="w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                    <defs>
                        <linearGradient id="gradient-${color}" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.1} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#gradient-${color})"
                        isAnimationActive={true}
                    />
                    <Tooltip
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                return (
                                    <div className="bg-slate-900 text-white border-none px-2 py-1.5 rounded-lg shadow-xl text-[10px] font-bold ring-1 ring-white/20">
                                        {payload[0].payload.date && (
                                            <p className="text-slate-400 text-[8px] uppercase tracking-wider mb-0.5">
                                                {payload[0].payload.date}
                                            </p>
                                        )}
                                        <p className="tabular-nums">{payload[0].value.toLocaleString()} {label}</p>
                                    </div>
                                )
                            }
                            return null
                        }}
                        cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3', opacity: 0.5 }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    )
}
