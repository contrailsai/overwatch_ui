import { ENTITY_TYPES } from './dims'

const ROW = 4

/** Chart-only budget. KPI strip is 3 cards on top. */
const PAGE_CHART_BUDGET = {
  1: 12,
  2: 12,
  3: 12,
}

/**
 * Module catalog. `requires` is a subset of enabled types (empty = shared).
 * Lower priorityByN[n] is packed first.
 */
export const MODULE_CATALOG = [
  { id: 'entity_mix', size: 2, requires: [], minTypes: 2, priorityByN: { 1: 99, 2: 1, 3: 1 }, sizeByN: { 2: 3, 3: 3 } },
  { id: 'platform_bar', size: 3, requires: ['post'], priorityByN: { 1: 1, 2: 5, 3: 4 }, sizeByN: { 2: 2, 3: 2 } },
  { id: 'source_pie', size: 1, requires: ['post'], priorityByN: { 1: 2, 2: 12, 3: 20 } },
  { id: 'publisher_platforms', size: 2, requires: ['ad'], priorityByN: { 1: 1, 2: 8, 3: 5 }, sizeByN: { 3: 1 } },
  { id: 'display_format', size: 1, requires: ['ad'], priorityByN: { 1: 2, 2: 13, 3: 8 } },
  { id: 'channel', size: 1, requires: ['ad'], priorityByN: { 1: 3, 2: 5, 3: 7 } },
  { id: 'cloak', size: 1, requires: ['domain'], priorityByN: { 1: 1, 2: 7, 3: 6 } },
  { id: 'domain_category', size: 2, requires: ['domain'], priorityByN: { 1: 2, 2: 14, 3: 20 } },
  { id: 'hosting_country', size: 1, requires: ['domain'], priorityByN: { 1: 3, 2: 9, 3: 20 } },
  { id: 'risk', size: 1, requires: [], priorityByN: { 1: 3, 2: 2, 3: 2 } },
  { id: 'discovery_trend', size: 2, requires: [], priorityByN: { 1: 4, 2: 4, 3: 4 }, sizeByN: { 2: 3, 3: 3 } },
  { id: 'decisions', size: 1, requires: [], priorityByN: { 1: 5, 2: 10, 3: 3 } },
  { id: 'categories', size: 2, requires: [], priorityByN: { 1: 6, 2: 6, 3: 8 } },
  { id: 'legal_codes', size: 1, requires: [], priorityByN: { 1: 7, 2: 7, 3: 9 } },
  { id: 'aigc', size: 1, requires: ['post'], priorityByN: { 1: 8, 2: 15, 3: 20 } },
  { id: 'poi', size: 1, requires: ['post'], priorityByN: { 1: 9, 2: 16, 3: 20 } },
  { id: 'language', size: 1, requires: ['post'], priorityByN: { 1: 10, 2: 17, 3: 20 } },
  { id: 'post_type', size: 1, requires: ['post'], priorityByN: { 1: 11, 2: 18, 3: 20 } },
  { id: 'is_active', size: 1, requires: ['ad'], priorityByN: { 1: 8, 2: 18, 3: 20 } },
  { id: 'cta_type', size: 1, requires: ['ad'], priorityByN: { 1: 9, 2: 19, 3: 20 } },
  { id: 'discovery_source', size: 1, requires: ['domain'], priorityByN: { 1: 8, 2: 15, 3: 20 } },
  { id: 'ssl_reachable', size: 1, requires: ['domain'], priorityByN: { 1: 9, 2: 16, 3: 20 } },
  { id: 'registrar', size: 1, requires: ['domain'], priorityByN: { 1: 10, 2: 17, 3: 20 } },
  { id: 'whois_age', size: 1, requires: ['domain'], priorityByN: { 1: 11, 2: 18, 3: 20 } },
]

export const MODULE_META = {
  entity_mix: { title: 'Entity mix' },
  platform_bar: { title: 'Cases by Platform' },
  source_pie: { title: 'Source Distribution' },
  publisher_platforms: { title: 'Publisher Platforms' },
  display_format: { title: 'Creative Format' },
  channel: { title: 'Ad Channel' },
  cloak: { title: 'Cloak vs Clean' },
  domain_category: { title: 'Analyzer Category' },
  hosting_country: { title: 'Hosting Country' },
  risk: { title: 'Risk Breakdown' },
  discovery_trend: { title: 'Discovery Trend' },
  decisions: { title: 'Review Decisions' },
  categories: { title: 'Violations' },
  legal_codes: { title: 'Legal Codes' },
  aigc: { title: 'AIGC Share' },
  poi: { title: 'POI Detected' },
  language: { title: 'Language' },
  post_type: { title: 'Post Type' },
  is_active: { title: 'Active vs Ended' },
  cta_type: { title: 'CTA Mix' },
  discovery_source: { title: 'Discovery Source' },
  ssl_reachable: { title: 'Reachable / SSL' },
  registrar: { title: 'Registrar' },
  whois_age: { title: 'Registration Age' },
}

export function kpiCopy(types = []) {
  const postsOnly = types.length === 1 && types[0] === 'post'
  return {
    noun: postsOnly ? 'Cases' : 'Items',
    reviewed: postsOnly ? 'Cases Reviewed' : 'Items Reviewed',
    discovered: postsOnly ? 'New Cases' : 'New Items',
    takedown: 'Takedown Count',
    scanned: postsOnly ? 'Cases scanned per day' : 'Items scanned per day',
  }
}

export function moduleSpanClass(size) {
  if (size >= 4) return 'md:col-span-2 lg:col-span-4'
  if (size === 3) return 'md:col-span-2 lg:col-span-3'
  if (size === 2) return 'md:col-span-2 lg:col-span-2'
  return 'md:col-span-1 lg:col-span-1'
}

function moduleSize(mod, n) {
  return mod.sizeByN?.[n] ?? mod.size
}

function typesInclude(requires, types) {
  if (!requires?.length) return true
  return requires.every((t) => types.includes(t))
}

function remainder(used) {
  return (ROW - (used % ROW)) % ROW
}

function fillRowRemainder(packed, candidates, budget) {
  let used = packed.reduce((s, m) => s + m.size, 0)
  let left = remainder(used)
  if (left === 0 || used >= budget) return packed

  const taken = new Set(packed.map((p) => p.id))
  const size1 = candidates.find((mod) => !taken.has(mod.id) && mod.size === 1 && used + 1 <= budget)
  if (size1 && left >= 1) {
    packed.push({ id: size1.id, size: 1 })
    used += 1
    left = remainder(used)
    if (left === 0 || used >= budget) return packed
  }

  for (let i = packed.length - 1; i >= 0; i--) {
    const growBy = Math.min(left, budget - used, ROW - packed[i].size)
    if (growBy <= 0) continue
    packed[i] = { ...packed[i], size: packed[i].size + growBy }
    used += growBy
    break
  }

  return packed
}

export function packModules(types, countsByModule = {}) {
  const uniqueTypes = ENTITY_TYPES.filter((t) => types.includes(t))
  const n = uniqueTypes.length || 1
  const budget = PAGE_CHART_BUDGET[n] || PAGE_CHART_BUDGET[1]

  const candidates = MODULE_CATALOG
    .filter((mod) => typesInclude(mod.requires, uniqueTypes))
    .filter((mod) => !mod.minTypes || uniqueTypes.length >= mod.minTypes)
    .map((mod) => ({
      ...mod,
      size: moduleSize(mod, n),
      priority: mod.priorityByN?.[n] ?? 50,
      hasData: (countsByModule[mod.id] || 0) > 0,
    }))
    .sort((a, b) => {
      if (a.hasData !== b.hasData) return a.hasData ? -1 : 1
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.id.localeCompare(b.id)
    })

  const packed = []
  let used = 0
  for (const mod of candidates) {
    if (used + mod.size > budget) continue
    packed.push({ id: mod.id, size: mod.size })
    used += mod.size
  }

  if (used < budget) {
    for (const mod of candidates) {
      if (packed.some((p) => p.id === mod.id)) continue
      if (used + mod.size > budget) continue
      packed.push({ id: mod.id, size: mod.size })
      used += mod.size
    }
  }

  fillRowRemainder(packed, candidates, budget)
  used = packed.reduce((s, m) => s + m.size, 0)

  return { types: uniqueTypes, budget, used, modules: packed }
}
