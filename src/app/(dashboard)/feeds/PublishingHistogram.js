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

export function PublishingHistogram({
  data = [],
  activeDate,
  onDayClick,
  className,
  compact = false,
}) {
  if (!data.length) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-xs text-slate-400',
          compact ? 'h-20' : 'h-28',
          className
        )}
      >
        No publish-date data for the current filters
      </div>
    )
  }

  return (
    <div className={cn(compact ? 'py-1' : 'py-2', className)}>
      <div className={cn('flex flex-wrap items-center justify-between gap-2', compact ? 'mb-1.5' : 'mb-3')}>
        <div className="min-w-0">
          <h3 className={cn('font-bold text-slate-900', compact ? 'text-xs' : 'text-sm')}>
            Publishing timeline
          </h3>
          {!compact && (
            <p className="text-xs text-slate-500">Click a bar to filter by publish date</p>
          )}
        </div>
        {activeDate && (
          <button
            type="button"
            onClick={() => onDayClick?.(null)}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 shrink-0"
          >
            Clear date
          </button>
        )}
      </div>

      <div className={cn('w-full', compact ? 'h-[120px]' : 'h-[160px]')}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fontWeight: 600, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={32}
            />
            <YAxis
              tick={{ fontSize: 9, fontWeight: 600, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              width={28}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }} />
            <Bar
              dataKey="count"
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
              onClick={(bar) => onDayClick?.(bar?.date ?? null)}
              className="cursor-pointer"
            >
              {data.map((entry) => (
                <Cell
                  key={entry.date}
                  fill={activeDate === entry.date ? '#2563eb' : '#93c5fd'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
