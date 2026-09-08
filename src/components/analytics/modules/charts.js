'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, BarChart, Bar,
} from 'recharts'
import { Layers, TrendingUp } from 'lucide-react'
import { ENTITY_LABELS } from '@/lib/analytics/dims'
import { MODULE_META } from '@/lib/analytics/packModules'
import { Card, ChartTooltip, Empty, SectionLabel, fmt, platformLabel, prettyDimLabel } from './chrome'

const CATEGORY_LINE_PALETTE = ['#2563eb', '#06b6d4', '#a855f7', '#f97316', '#10b981', '#eab308', '#ec4899']

const formatCategoryLabel = (name) =>
  String(name || '').replace(/_/g, '-').replace(/\s+/g, '-').toUpperCase()

function titleOf(id) {
  return MODULE_META[id]?.title || prettyDimLabel(id)
}

function DonutModule({ id, series, nameFormatter }) {
  const items = (series?.items || []).filter((i) => i.value > 0)
  const total = items.reduce((s, i) => s + i.value, 0)
  const colors = Object.fromEntries(items.map((i) => [i.name, i.color || i.fill]))
  return (
    <Card className="flex flex-col h-full">
      <SectionLabel>{titleOf(id)}</SectionLabel>
      {total === 0 ? (
        <Empty h={260} />
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="relative w-full flex-1 min-h-[200px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={items}
                  cx="50%" cy="50%"
                  innerRadius="58%" outerRadius="86%"
                  paddingAngle={2}
                  dataKey="value"
                  cornerRadius={3}
                  stroke="none"
                >
                  {items.map((entry, idx) => (
                    <Cell key={`${id}-${idx}`} fill={entry.color || entry.fill || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip colors={colors} nameFormatter={nameFormatter} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-3xl font-black text-slate-900 tabular-nums leading-none">{fmt(total)}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1.5">Total</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-y-2.5 mt-6">
            {(series?.items || []).map((p) => (
              <div key={p.name} className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color || p.fill }} />
                  <span className="text-slate-700 font-medium truncate">
                    {nameFormatter ? nameFormatter(p.name) : prettyDimLabel(p.name)}
                  </span>
                </div>
                <span className="text-slate-900 font-bold tabular-nums">{fmt(p.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function RankedModule({ id, series, nameFormatter }) {
  const items = series?.items || []
  const total = items.reduce((s, i) => s + (i.value || 0), 0)
  return (
    <Card className="flex flex-col h-full">
      <SectionLabel>{titleOf(id)}</SectionLabel>
      {total === 0 ? (
        <Empty h={220} />
      ) : (
        <div className="mt-4 space-y-3">
          {items.slice(0, 8).map((item) => (
            <div key={item.name}>
              <div className="flex items-center justify-between gap-2 text-sm mb-1">
                <span className="text-slate-700 font-medium truncate">
                  {nameFormatter ? nameFormatter(item.name) : prettyDimLabel(item.name)}
                </span>
                <span className="text-slate-900 font-bold tabular-nums">{fmt(item.value)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{
                    width: `${Math.max(4, (item.value / total) * 100)}%`,
                    backgroundColor: item.color || '#3b82f6',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function PlatformBarModule({ series }) {
  const platforms = series?.platforms || []
  const colors = series?.colors || {}
  const days = series?.days || []
  return (
    <Card className="flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="inline-flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-blue-500" strokeWidth={2.5} />
          <SectionLabel>Cases by Platform</SectionLabel>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          {platforms.map((p) => (
            <div
              key={p}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 border border-slate-200/60"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors[p] }} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                {platformLabel(p)}
              </span>
            </div>
          ))}
        </div>
      </div>
      {days.length === 0 || platforms.length === 0 || !series?.total ? (
        <Empty h={280} />
      ) : (
        <div className="flex-1 min-h-[280px] mt-6 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 10, right: 10, left: 0, bottom: 5 }} barCategoryGap="22%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} tickLine={false} axisLine={false} dy={6} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <Tooltip content={<ChartTooltip colors={colors} />} cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }} />
              {platforms.map((p, i) => (
                <Bar
                  key={p}
                  dataKey={p}
                  name={p}
                  stackId="cases"
                  fill={colors[p]}
                  radius={i === platforms.length - 1 ? [3, 3, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function EntityMixModule({ series }) {
  const keys = series?.keys || []
  const colors = series?.colors || {}
  const days = series?.days || []
  return (
    <Card className="flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <SectionLabel>Entity mix</SectionLabel>
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          {keys.map((k) => (
            <div key={k} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 border border-slate-200/60">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors[k] }} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                {ENTITY_LABELS[k] || k}
              </span>
            </div>
          ))}
        </div>
      </div>
      {!series?.total ? (
        <Empty h={260} />
      ) : (
        <div className="flex-1 min-h-[260px] mt-6 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 10, right: 10, left: 0, bottom: 5 }} barCategoryGap="22%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} tickLine={false} axisLine={false} dy={6} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <Tooltip content={<ChartTooltip colors={colors} nameFormatter={(n) => ENTITY_LABELS[n] || n} />} cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }} />
              {keys.map((k, i) => (
                <Bar
                  key={k}
                  dataKey={k}
                  name={k}
                  stackId="mix"
                  fill={colors[k]}
                  radius={i === keys.length - 1 ? [3, 3, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function DiscoveryTrendModule({ series, scannedLabel }) {
  const days = series?.days || []
  const keys = series?.keys || ['value']
  const colors = series?.colors || { value: '#3b82f6' }
  const total = series?.total || 0
  const peak = days.reduce((m, d) => Math.max(m, d.value || keys.reduce((s, k) => s + (d[k] || 0), 0)), 0)
  const avg = days.length ? Math.round(total / days.length) : 0
  const stacked = Boolean(series?.stacked)
  return (
    <Card className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.5} />
            <SectionLabel>Discovery Trend</SectionLabel>
          </div>
          <span className="text-[11px] font-semibold text-sky-600 mt-1.5">
            {scannedLabel || 'Items scanned per day'}
          </span>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-slate-900 tabular-nums leading-none">{fmt(total)}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">Total</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11px]">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-100">
          <span className="font-medium text-slate-500">Peak</span>
          <span className="font-bold text-slate-900 tabular-nums">{fmt(peak)}</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-100">
          <span className="font-medium text-slate-500">Avg/day</span>
          <span className="font-bold text-slate-900 tabular-nums">{fmt(avg)}</span>
        </div>
      </div>
      {total === 0 ? (
        <Empty h={240} />
      ) : (
        <div className="flex-1 min-h-[240px] mt-4 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={days} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
              <defs>
                {keys.map((k) => (
                  <linearGradient key={k} id={`discoveryFill-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors[k] || '#3b82f6'} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={colors[k] || '#3b82f6'} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} tickLine={false} axisLine={false} dy={8} minTickGap={24} />
              <YAxis tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={32} allowDecimals={false} tickCount={5} />
              <Tooltip
                content={<ChartTooltip colors={colors} nameFormatter={(n) => (n === 'value' ? 'Items' : ENTITY_LABELS[n] || n)} />}
                cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
              />
              {keys.map((k) => (
                <Area
                  key={k}
                  type="linear"
                  dataKey={k}
                  name={k}
                  stackId={stacked ? 'disc' : undefined}
                  stroke={colors[k] || '#3b82f6'}
                  strokeWidth={1.5}
                  fill={`url(#discoveryFill-${k})`}
                  dot={{ r: 2.5, fill: colors[k] || '#3b82f6', strokeWidth: 0 }}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: colors[k] || '#3b82f6' }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function CategoriesModule({ series, title = 'Violations' }) {
  const names = series?.names || []
  const days = series?.days || []
  const total = series?.total || 0
  const namesKey = names.join('\0')
  const categoryColors = useMemo(() => {
    const list = namesKey ? namesKey.split('\0') : []
    return list.reduce((acc, name, i) => {
      acc[name] = CATEGORY_LINE_PALETTE[i % CATEGORY_LINE_PALETTE.length]
      return acc
    }, {})
  }, [namesKey])
  const [hidden, setHidden] = useState(() => new Set())
  const [hiddenKey, setHiddenKey] = useState(namesKey)
  if (hiddenKey !== namesKey) {
    setHiddenKey(namesKey)
    setHidden(new Set())
  }

  const toggle = useCallback((name) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  return (
    <Card className="flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.5} />
            <SectionLabel>{title}</SectionLabel>
          </div>
          <span className="text-[11px] font-semibold text-sky-600 mt-1.5">Top tags over time</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 sm:justify-end">
          {names.map((c) => {
            const isHidden = hidden.has(c)
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                title={isHidden ? 'Show series' : 'Hide series'}
                aria-pressed={!isHidden}
                className={`flex items-center gap-1.5 max-w-[180px] rounded-md px-0.5 -mx-0.5 transition-opacity cursor-pointer hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${isHidden ? 'opacity-35' : ''}`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${isHidden ? '!bg-slate-300' : ''}`} style={isHidden ? undefined : { backgroundColor: categoryColors[c] }} />
                <span className={`text-[11px] font-bold tracking-wider uppercase truncate ${isHidden ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-700'}`}>
                  {formatCategoryLabel(c)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {days.length === 0 || names.length === 0 || total === 0 ? (
        <Empty h={280} />
      ) : (
        <div className="h-[280px] mt-4 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={days} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} tickLine={false} axisLine={false} dy={8} minTickGap={24} />
              <YAxis tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={32} allowDecimals={false} tickCount={5} />
              <Tooltip content={<ChartTooltip colors={categoryColors} uppercase nameFormatter={formatCategoryLabel} />} cursor={{ stroke: '#94a3b8', strokeWidth: 1 }} />
              {names.map((c) => (
                <Line
                  key={c}
                  type="linear"
                  dataKey={c}
                  name={c}
                  hide={hidden.has(c)}
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
  )
}

export function AnalyticsModule({ id, series, scannedLabel }) {
  if (id === 'platform_bar') return <PlatformBarModule series={series} />
  if (id === 'entity_mix') return <EntityMixModule series={series} />
  if (id === 'risk') return <DonutModule id={id} series={series} />
  if (id === 'discovery_trend') return <DiscoveryTrendModule series={series} scannedLabel={scannedLabel} />
  if (id === 'categories') return <CategoriesModule series={series} />
  if (id === 'domain_category') return <CategoriesModule series={series} title="Analyzer Category" />
  if (id === 'source_pie') return <DonutModule id={id} series={series} nameFormatter={platformLabel} />
  if (id === 'decisions') return <DonutModule id={id} series={series} />
  if (id === 'publisher_platforms' || id === 'display_format' || id === 'channel' || id === 'cloak'
    || id === 'hosting_country' || id === 'aigc' || id === 'poi' || id === 'language' || id === 'post_type'
    || id === 'is_active' || id === 'cta_type' || id === 'discovery_source' || id === 'ssl_reachable'
    || id === 'registrar' || id === 'whois_age' || id === 'legal_codes') {
    const useDonut = ['cloak', 'aigc', 'poi', 'is_active', 'channel'].includes(id)
    return useDonut
      ? <DonutModule id={id} series={series} />
      : <RankedModule id={id} series={series} />
  }
  return (
    <Card className="h-full">
      <SectionLabel>{titleOf(id)}</SectionLabel>
      <Empty h={200} />
    </Card>
  )
}
