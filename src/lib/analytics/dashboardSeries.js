import { eachDayOfInterval, format, parseISO } from 'date-fns'
import { ENTITY_COLORS, ENTITY_SHORT, ENTITY_TYPES } from './dims'
import { kpiCopy, packModules } from './packModules'
import { resolveAnalyticsTypes } from './server'
import clientPromise from '@/utils/mongodb/client'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'

const PAGE_SIZE = 1000
const TOP_N_CATEGORIES = 5

const RISK_COLORS = {
  high: '#ff0000',
  medium: '#ffaa00',
  low: '#2c43f5',
  safe: '#10b981',
}

const PLATFORM_COLORS = {
  instagram: '#e1306c',
  facebook: '#1877f2',
  meta: '#1877f2',
  x: '#0f172a',
  twitter: '#1da1f2',
  reddit: '#ff4500',
  youtube: '#ff0000',
  website: '#8b5cf6',
  web: '#8b5cf6',
  tiktok: '#010101',
  unknown: '#94a3b8',
}

const DECISION_COLORS = {
  'No Action': '#0f172a',
  Flagged: '#ef4444',
  Takedown: '#a855f7',
}

const DIM_PALETTE = ['#2563eb', '#06b6d4', '#a855f7', '#f97316', '#10b981', '#eab308', '#ec4899', '#64748b']

function parseJsonField(field) {
  if (!field) return {}
  if (typeof field === 'string') {
    try { return JSON.parse(field) } catch { return {} }
  }
  return field
}

function rowDate(value) {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}

function emptyByType() {
  return { post: 0, ad: 0, domain: 0 }
}

function isMissingRelation(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || /does not exist/i.test(error?.message || '')
}

function isMissingEntityType(error) {
  return error?.code === '42703' || /entity_type/i.test(error?.message || '')
}

function buildDateAxis(startStr, endStr) {
  const start = parseISO(startStr)
  const end = parseISO(endStr)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return []
  return eachDayOfInterval({ start, end }).map((d) => ({
    rawDate: format(d, 'yyyy-MM-dd'),
    date: format(d, 'MMM d'),
  }))
}

async function fetchAll(makeQuery) {
  const rows = []
  let from = 0
  while (from < 50000) {
    const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1)
    if (error) return { data: rows, error }
    const chunk = data || []
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { data: rows, error: null }
}

function scopedQuery(supabase, table, start, end, projectName, types, withEntityType) {
  return () => {
    let q = supabase
      .from(table)
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
      .order('id', { ascending: true })
    if (projectName) q = q.eq('project_name', projectName)
    if (withEntityType && types?.length) q = q.in('entity_type', types)
    return q
  }
}

async function loadDailyTable(supabase, table, start, end, projectName, types) {
  const first = await fetchAll(scopedQuery(supabase, table, start, end, projectName, types, true))
  if (!first.error) return first.data || []
  if (isMissingEntityType(first.error)) {
    const fallback = await fetchAll(scopedQuery(supabase, table, start, end, projectName, types, false))
    if (fallback.error) {
      logActionError({
        loki_stream: LOKI_STREAMS.dashboard,
        app_action: 'getDashboardData',
        message: `Error fetching ${table}`,
      }, fallback.error)
      return []
    }
    return fallback.data || []
  }
  logActionError({
    loki_stream: LOKI_STREAMS.dashboard,
    app_action: 'getDashboardData',
    message: `Error fetching ${table}`,
  }, first.error)
  return []
}

async function loadDims(supabase, start, end, projectName, types) {
  const make = (withEntityType) => () => {
    let q = supabase
      .from('daily_metric_dims')
      .select('id, date, entity_type, dim, value, count')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
      .order('id', { ascending: true })
    if (projectName) q = q.eq('project_name', projectName)
    if (withEntityType && types?.length) q = q.in('entity_type', types)
    return q
  }

  const first = await fetchAll(make(true))
  if (!first.error) return first.data || []
  if (isMissingRelation(first.error) || isMissingEntityType(first.error)) return []
  logActionError({
    loki_stream: LOKI_STREAMS.dashboard,
    app_action: 'getDashboardData',
    message: 'Error fetching daily_metric_dims',
  }, first.error)
  return []
}

function sumDim(dimRows, dim, extraFilter) {
  const totals = new Map()
  for (const row of dimRows) {
    if (row.dim !== dim) continue
    if (extraFilter && !extraFilter(row)) continue
    const key = row.value || 'unknown'
    totals.set(key, (totals.get(key) || 0) + (row.count || 0))
  }
  return [...totals.entries()]
    .map(([name, value], i) => ({
      name,
      value,
      color: DIM_PALETTE[i % DIM_PALETTE.length],
    }))
    .sort((a, b) => b.value - a.value)
}

function rankedSeries(items) {
  const total = items.reduce((s, i) => s + (i.value || 0), 0)
  return { items, total }
}

function dimDaySeries(axis, dimRows, dim, topNames) {
  const byDay = new Map(axis.map((d) => [d.rawDate, { date: d.date, rawDate: d.rawDate }]))
  for (const name of topNames) {
    byDay.forEach((entry) => { entry[name] = 0 })
  }
  for (const row of dimRows) {
    if (row.dim !== dim) continue
    const day = byDay.get(rowDate(row.date))
    if (!day || !topNames.includes(row.value)) continue
    day[row.value] = (day[row.value] || 0) + (row.count || 0)
  }
  const days = axis.map((d) => {
    const entry = byDay.get(d.rawDate)
    const { rawDate, ...rest } = entry
    return rest
  })
  const total = days.reduce((s, d) => s + topNames.reduce((rs, n) => rs + (d[n] || 0), 0), 0)
  return { days, names: topNames, total }
}

function calcDelta(curr, prev) {
  if (prev === 0) return curr === 0 ? 0 : 100
  return Math.round(((curr - prev) / prev) * 1000) / 10
}

function typeSplit(byType, types) {
  return types
    .map((t) => `${ENTITY_SHORT[t]} ${(byType[t] || 0).toLocaleString()}`)
    .join(' · ')
}

function buildSeries({ axis, types, casesData, reviewedData, dimRows }) {
  const byTypeReviewed = emptyByType()
  const byTypeTakedown = emptyByType()
  const byTypeDiscovered = emptyByType()

  const platformsSet = new Set()
  const categoryTotals = {}
  let caseRiskSafe = 0
  let caseRiskLow = 0
  let caseRiskMedium = 0
  let caseRiskHigh = 0
  let totalReviewed = 0
  let totalSafe = 0
  let totalFlagForTakedown = 0
  let totalTakedown = 0
  let totalCasesDiscovered = 0

  const platformByDay = new Map(axis.map((d) => [d.rawDate, { date: d.date }]))
  const entityByDay = new Map(axis.map((d) => {
    const entry = { date: d.date, value: 0 }
    types.forEach((t) => { entry[t] = 0 })
    return [d.rawDate, entry]
  }))
  const kpiByDay = new Map(axis.map((d) => [d.rawDate, {
    date: d.date,
    discovered: 0,
    reviewed: 0,
    takedown: 0,
  }]))

  for (const row of casesData) {
    const type = ENTITY_TYPES.includes(row.entity_type) ? row.entity_type : 'post'
    const date = rowDate(row.date)
    const platform = (row.platform || 'unknown').toLowerCase()
    const total = row.total_cases || 0
    totalCasesDiscovered += total
    byTypeDiscovered[type] = (byTypeDiscovered[type] || 0) + total
    platformsSet.add(platform)

    const risk = parseJsonField(row.risk)
    caseRiskSafe += risk.safe || 0
    caseRiskLow += risk.low || 0
    caseRiskMedium += risk.medium || 0
    caseRiskHigh += risk.high || 0

    const cats = parseJsonField(row.categories)
    Object.entries(cats).forEach(([cat, count]) => {
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (count || 0)
    })

    const day = platformByDay.get(date)
    if (day) day[platform] = (day[platform] || 0) + total
    const entityDay = entityByDay.get(date)
    if (entityDay) {
      entityDay[type] = (entityDay[type] || 0) + total
      entityDay.value += total
    }
    const kpiDay = kpiByDay.get(date)
    if (kpiDay) kpiDay.discovered += total
  }

  for (const row of reviewedData) {
    const type = ENTITY_TYPES.includes(row.entity_type) ? row.entity_type : 'post'
    const date = rowDate(row.date)
    const total = row.total_reviewed || 0
    totalReviewed += total
    byTypeReviewed[type] = (byTypeReviewed[type] || 0) + total
    const reviewed = parseJsonField(row.reviewed)
    totalSafe += reviewed['no-action'] || 0
    totalFlagForTakedown += reviewed['Flag for Takedown'] || 0
    const td = reviewed.Takedown || 0
    totalTakedown += td
    byTypeTakedown[type] = (byTypeTakedown[type] || 0) + td
    const kpiDay = kpiByDay.get(date)
    if (kpiDay) {
      kpiDay.reviewed += total
      kpiDay.takedown += td
    }
  }

  const platforms = [...platformsSet]
  const platformLineData = axis.map((d) => {
    const entry = { date: d.date, ...(platformByDay.get(d.rawDate) || {}) }
    platforms.forEach((p) => { if (entry[p] == null) entry[p] = 0 })
    return entry
  })

  const threatItems = sumDim(dimRows, 'threat_type')
  const categoryNames = (threatItems.length
    ? threatItems
    : Object.entries(categoryTotals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  ).slice(0, TOP_N_CATEGORIES).map((c) => c.name)

  const categoryLine = threatItems.length
    ? dimDaySeries(axis, dimRows, 'threat_type', categoryNames)
    : (() => {
      const byDay = new Map(axis.map((d) => [d.rawDate, { date: d.date }]))
      categoryNames.forEach((n) => byDay.forEach((e) => { e[n] = 0 }))
      for (const row of casesData) {
        const day = byDay.get(rowDate(row.date))
        if (!day) continue
        const cats = parseJsonField(row.categories)
        categoryNames.forEach((n) => { day[n] = (day[n] || 0) + (cats[n] || 0) })
      }
      const days = axis.map((d) => byDay.get(d.rawDate))
      const total = days.reduce((s, day) => s + categoryNames.reduce((rs, n) => rs + (day[n] || 0), 0), 0)
      return { days, names: categoryNames, total }
    })()

  const entityDays = axis.map((d) => entityByDay.get(d.rawDate))
  const entityTotal = entityDays.reduce((s, d) => s + (d.value || 0), 0)

  const riskItems = [
    { name: 'High', value: caseRiskHigh, fill: RISK_COLORS.high },
    { name: 'Medium', value: caseRiskMedium, fill: RISK_COLORS.medium },
    { name: 'Low', value: caseRiskLow, fill: RISK_COLORS.low },
    { name: 'Safe', value: caseRiskSafe, fill: RISK_COLORS.safe },
  ]

  const decisionItems = [
    { name: 'No Action', value: totalSafe, color: DECISION_COLORS['No Action'] },
    { name: 'Flagged', value: totalFlagForTakedown, color: DECISION_COLORS.Flagged },
    { name: 'Takedown', value: totalTakedown, color: DECISION_COLORS.Takedown },
  ]

  const platformItems = platforms
    .map((p) => ({
      name: p,
      value: platformLineData.reduce((s, day) => s + (day[p] || 0), 0),
      color: PLATFORM_COLORS[p] || '#94a3b8',
    }))
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value)

  const sslItems = [
    ...sumDim(dimRows, 'ssl_valid').map((i) => ({
      ...i,
      name: i.name === 'true' ? 'SSL valid' : i.name === 'false' ? 'SSL invalid' : `SSL ${i.name}`,
    })),
    ...sumDim(dimRows, 'is_reachable').map((i) => ({
      ...i,
      name: i.name === 'true' ? 'Reachable' : i.name === 'false' ? 'Unreachable' : `Reachable ${i.name}`,
    })),
  ]

  const whoisOrder = ['0-7d', '8-30d', '31-90d', '90d+', 'unknown']
  const whoisItems = sumDim(dimRows, 'whois_age_bucket').sort((a, b) => {
    const ia = whoisOrder.indexOf(a.name)
    const ib = whoisOrder.indexOf(b.name)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  const series = {
    entity_mix: {
      days: entityDays.map(({ rawDate, ...rest }) => rest),
      keys: types,
      colors: ENTITY_COLORS,
      total: entityTotal,
    },
    platform_bar: {
      days: platformLineData,
      platforms,
      colors: PLATFORM_COLORS,
      total: platformItems.reduce((s, i) => s + i.value, 0),
    },
    source_pie: rankedSeries(platformItems),
    publisher_platforms: rankedSeries(sumDim(dimRows, 'publisher_platform')),
    display_format: rankedSeries(sumDim(dimRows, 'display_format')),
    channel: rankedSeries(sumDim(dimRows, 'channel')),
    cloak: rankedSeries(sumDim(dimRows, 'cloak')),
    domain_category: {
      ...dimDaySeries(axis, dimRows, 'category', sumDim(dimRows, 'category').slice(0, TOP_N_CATEGORIES).map((i) => i.name)),
      mode: 'lines',
    },
    hosting_country: rankedSeries(sumDim(dimRows, 'hosting_country').slice(0, 8)),
    risk: { items: riskItems, total: riskItems.reduce((s, i) => s + i.value, 0) },
    discovery_trend: {
      days: entityDays.map(({ rawDate, ...rest }) => rest),
      keys: types.length > 1 ? types : ['value'],
      colors: types.length > 1 ? ENTITY_COLORS : { value: '#3b82f6' },
      stacked: types.length > 1,
      total: entityTotal,
    },
    decisions: { items: decisionItems, total: decisionItems.reduce((s, i) => s + i.value, 0) },
    categories: categoryLine,
    legal_codes: rankedSeries(sumDim(dimRows, 'legal_code').slice(0, 8)),
    aigc: rankedSeries(sumDim(dimRows, 'is_aigc').map((i) => ({
      ...i,
      name: i.name === 'true' ? 'AIGC' : 'Not AIGC',
    }))),
    poi: rankedSeries(sumDim(dimRows, 'poi_detected').map((i) => ({
      ...i,
      name: i.name === 'true' ? 'POI detected' : 'No POI',
    }))),
    language: rankedSeries(sumDim(dimRows, 'language').slice(0, 8)),
    post_type: rankedSeries(sumDim(dimRows, 'post_type')),
    is_active: rankedSeries(sumDim(dimRows, 'is_active').map((i) => ({
      ...i,
      name: i.name === 'true' ? 'Active' : 'Ended',
    }))),
    cta_type: rankedSeries(sumDim(dimRows, 'cta_type')),
    discovery_source: rankedSeries(sumDim(dimRows, 'discovery_source')),
    ssl_reachable: rankedSeries(sslItems),
    registrar: rankedSeries(sumDim(dimRows, 'registrar').slice(0, 8)),
    whois_age: rankedSeries(whoisItems),
  }

  const dailyKpiData = axis.map((d) => kpiByDay.get(d.rawDate))

  return {
    series,
    totals: {
      totalReviewed,
      totalSafe,
      totalFlagForTakedown,
      totalTakedown,
      totalCasesDiscovered,
      byTypeReviewed,
      byTypeDiscovered,
      byTypeTakedown,
    },
    dailyKpiData,
  }
}

export async function buildDashboardPayload(supabase, project, range) {
  const projectName = typeof project === 'string' ? project : project?.project_name
  const projectDetails = typeof project === 'object' ? project?.project_details : null
  const mongoDb = typeof project === 'object' ? project?.mongo_db_map : null

  let db = null
  if (mongoDb) {
    try {
      const client = await clientPromise
      db = client.db(mongoDb)
    } catch (err) {
      logActionError({
        loki_stream: LOKI_STREAMS.dashboard,
        app_action: 'getDashboardData',
        message: 'Failed to open tenant Mongo for analytics types',
      }, err)
    }
  }

  const types = await resolveAnalyticsTypes(db, projectDetails)
  const resolvedTypes = types.length ? types : ['post']

  const { startDateStr, endDateStr, priorStartStr, priorEndStr, days } = range
  const axis = buildDateAxis(startDateStr, endDateStr)

  const [casesData, reviewedData, dimRows, priorCasesData, priorReviewedData] = await Promise.all([
    loadDailyTable(supabase, 'daily_case_metrics', startDateStr, endDateStr, projectName, resolvedTypes),
    loadDailyTable(supabase, 'daily_reviewed_metrics', startDateStr, endDateStr, projectName, resolvedTypes),
    loadDims(supabase, startDateStr, endDateStr, projectName, resolvedTypes),
    loadDailyTable(supabase, 'daily_case_metrics', priorStartStr, priorEndStr, projectName, resolvedTypes),
    loadDailyTable(supabase, 'daily_reviewed_metrics', priorStartStr, priorEndStr, projectName, resolvedTypes),
  ])

  const built = buildSeries({
    axis,
    types: resolvedTypes,
    casesData,
    reviewedData,
    dimRows,
  })

  const countsByModule = {}
  Object.entries(built.series).forEach(([id, series]) => {
    countsByModule[id] = series?.total || 0
  })
  const packed = packModules(resolvedTypes, countsByModule)
  const seriesByModule = {}
  packed.modules.forEach((mod) => {
    seriesByModule[mod.id] = built.series[mod.id] || { items: [], days: [], total: 0 }
  })

  let priorReviewed = 0
  let priorTakedown = 0
  let priorDiscovered = 0
  for (const row of priorReviewedData) {
    priorReviewed += row.total_reviewed || 0
    priorTakedown += parseJsonField(row.reviewed).Takedown || 0
  }
  for (const row of priorCasesData) {
    priorDiscovered += row.total_cases || 0
  }

  const copy = kpiCopy(resolvedTypes)
  const showSplit = resolvedTypes.length > 1

  return {
    days: days || 'custom',
    from: startDateStr,
    to: endDateStr,
    types: resolvedTypes,
    modules: packed.modules,
    kpiCopy: copy,
    clientTracker: {
      totalReviewed: built.totals.totalReviewed,
      totalSafe: built.totals.totalSafe,
      totalFlagForTakedown: built.totals.totalFlagForTakedown,
      totalTakedown: built.totals.totalTakedown,
      totalCasesDiscovered: built.totals.totalCasesDiscovered,
      deltas: {
        totalReviewed: calcDelta(built.totals.totalReviewed, priorReviewed),
        totalCasesDiscovered: calcDelta(built.totals.totalCasesDiscovered, priorDiscovered),
        totalTakedown: calcDelta(built.totals.totalTakedown, priorTakedown),
      },
      split: showSplit ? {
        reviewed: typeSplit(built.totals.byTypeReviewed, resolvedTypes),
        discovered: typeSplit(built.totals.byTypeDiscovered, resolvedTypes),
        takedown: typeSplit(built.totals.byTypeTakedown, resolvedTypes),
      } : null,
      dailyKpiData: built.dailyKpiData,
    },
    seriesByModule,
  }
}
