'use client'

import { Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

export const fmt = (n) => (n ?? 0).toLocaleString()

export function platformLabel(p) {
  if (!p) return ''
  const k = String(p).toLowerCase()
  if (k === 'x') return 'X'
  if (k === 'website' || k === 'web') return 'Web'
  if (k === 'meta') return 'Meta'
  return k.charAt(0).toUpperCase() + k.slice(1)
}

export function prettyDimLabel(name) {
  return String(name || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function ChartTooltip({ active, payload, label, colors = {}, uppercase = false, nameFormatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white text-slate-900 text-sm rounded-md px-3 py-2.5 shadow-md border border-slate-200 min-w-[160px]">
      {label && <p className="text-slate-400 font-bold mb-2 uppercase tracking-wider text-[10px]">{label}</p>}
      {payload.map((p, i) => {
        const rawColor = p.color || p.stroke || p.fill || p.payload?.fill || p.payload?.color
        const color = (rawColor === 'none' || rawColor === 'transparent') ? (colors[p.name] || '#cbd5e1') : (rawColor || '#cbd5e1')
        const displayName = nameFormatter
          ? nameFormatter(p.name)
          : p.name === 'value' ? 'Items' : platformLabel(p.name)
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

export function SectionLabel({ children }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
      {children}
    </span>
  )
}

export function Empty({ h = 200, msg = 'No data detected' }) {
  return (
    <div className="flex flex-col items-center justify-center text-slate-300" style={{ height: h }}>
      <div className="p-3 bg-slate-50 border border-slate-100 rounded-md mb-3">
        <Activity className="w-6 h-6 opacity-50" aria-hidden="true" />
      </div>
      <p className="text-sm font-bold tracking-tight text-slate-500">{msg}</p>
      <p className="text-[11px] font-medium text-slate-400 mt-0.5">Try changing the date range</p>
    </div>
  )
}

export function Card({ className, children }) {
  return (
    <div className={cn('bg-white border border-slate-200 rounded-2xl p-5 md:p-6', className)}>
      {children}
    </div>
  )
}
