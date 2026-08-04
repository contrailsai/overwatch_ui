'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { cn } from '@/lib/utils'

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-slate-800">{row.label}</p>
      <p className="mt-0.5 text-slate-500">
        <span className="font-bold text-slate-900 tabular-nums">{row.count}</span> posts
      </p>
    </div>
  )
}

export function TopicPublishingChart({ data = [], className }) {
  if (!data.length) {
    return (
      <div className={cn('flex h-16 items-center justify-center text-xs text-slate-400', className)}>
        No publish-date data
      </div>
    )
  }

  const chartData = [...data]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map((row) => ({
      ...row,
      shortLabel: row.label?.replace(/, \d{4}$/, '') || row.date,
    }))

  return (
    <div className={cn('py-1', className)}>
      <h3 className="mb-1.5 text-xs font-bold text-slate-900">Publishing frequency</h3>
      <div className="h-[80px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="shortLabel"
              tick={{ fontSize: 8, fontWeight: 600, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              tick={{ fontSize: 8, fontWeight: 600, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              width={22}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }} />
            <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={20}>
              {chartData.map((entry) => (
                <Cell key={entry.date} fill="#93c5fd" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
