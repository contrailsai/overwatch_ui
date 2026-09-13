/** Shared Nexus colors — family palette + violation (stance-substitute) axis. */

export const COLORS = {
  bg: '#FAFBFC',
  edge: '#D9DEE4',
  text: '#1F2937',
  mutedText: '#6B7280',
  selectionRing: '#2563EB',
  leafFallback: '#9AA5B1',
  leafNoData: '#E9ECF0',
  orphan: '#9AA5B1',
  orphanStroke: '#CBD2DA',
  dimAlpha: 0.22,
  hubActive: '#3b82f6',
  hubPassive: '#8b5cf6',
  clusterActive: '#3b82f6',
  clusterPassive: '#8b5cf6',
}

export const FAMILY_PALETTE = [
  '#3B82F6',
  '#F59E0B',
  '#10B981',
  '#8B5CF6',
  '#EF4444',
  '#06B6D4',
  '#F97316',
  '#EC4899',
  '#84CC16',
  '#6366F1',
  '#14B8A6',
  '#A855F7',
  '#EAB308',
]

/**
 * Violation fills are alarm hues only: red, orange, magenta, crimson.
 * No green, teal, cyan, lime, or blue — those read as success, safety, or info
 * and disappear into parent-node family colors.
 */
export const VIOLATION_COLORS = {
  misinformation: '#FF3B30',
  hate: '#FF6A00',
  hate_speech: '#FF6A00',
  nsfw: '#FF2D95',
  aigc: '#FF8A00',
  impersonation: '#D946EF',
  scam: '#FF1744',
  threat: '#E10600',
  harassment: '#FF4D00',
  defamation: '#FF2D55',
  violence: '#FF1744',
  anti_india_propaganda: '#E026D6',
  propaganda: '#E026D6',
  other: '#FB7185',
  none: '#E9ECF0',
  unknown: '#E9ECF0',
}

export const UNKNOWN_COLOR_KEY = 'unknown'
export const BLAND_GREY = '#E9ECF0'

/** Extra alarm hues for keys that are not in VIOLATION_COLORS. No success greens. */
const ALARM_PALETTE = [
  '#FF3B30',
  '#FF6A00',
  '#FF2D95',
  '#E10600',
  '#FF8A00',
  '#D946EF',
  '#FF1744',
  '#FF4D00',
  '#FF2D55',
  '#C0124A',
  '#E026D6',
  '#FB7185',
  '#F43F5E',
  '#FF5A1F',
]

export function violationSlug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function hashString(s) {
  let h = 0
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function darkenHex(hex, amount = 0.22) {
  const n = String(hex || '').replace('#', '')
  if (n.length < 6) return hex
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  const f = (c) => Math.max(0, Math.round(c * (1 - amount)))
  return `#${[f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

export function lightenHex(hex, amount = 0.35) {
  const n = String(hex || '').replace('#', '')
  if (n.length < 6) return hex
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  const f = (c) => Math.min(255, Math.round(c + (255 - c) * amount))
  return `#${[f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

export function hexToRgba(hex, alpha) {
  const n = String(hex || '').replace('#', '')
  if (n.length < 6) return `rgba(148, 163, 184, ${alpha})`
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function normalizeColorKey(raw) {
  const s = String(raw || '').trim()
  return s || null
}

export function colorKeyLabel(key) {
  if (!key || key === UNKNOWN_COLOR_KEY) return 'No violation'
  const slug = violationSlug(key)
  if (VIOLATION_COLORS[slug] && slug.includes('_')) {
    return slug
      .split('_')
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ')
  }
  return String(key)
}

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }
const UNRANKED_SEVERITY = 3

/** Caution → danger bands. One shade per label so the legend can still filter by type. */
const SEVERITY_PALETTES = {
  high: ['#E10600', '#FF1744', '#C0124A', '#FF2D55', '#B91C1C', '#9F1239'],
  medium: ['#FF6A00', '#FF8A00', '#FF5A1F', '#F97316', '#EA580C', '#FB923C'],
  low: ['#EAB308', '#F59E0B', '#FBBF24', '#D97706', '#CA8A04', '#FACC15'],
}

const UNMATCHED_PALETTE = ['#FB7185', '#F43F5E', '#FDA4AF', '#E11D48']

export function normalizeViolationLabels(labels) {
  if (!Array.isArray(labels)) return []
  return labels
    .map((label) => ({
      name: String(label?.name || '').trim(),
      severity: SEVERITY_RANK[label?.severity] != null ? label.severity : 'low',
    }))
    .filter((label) => label.name)
}

function labelLookup(labels) {
  const bySlug = new Map()
  const shadeCount = { high: 0, medium: 0, low: 0 }
  normalizeViolationLabels(labels).forEach((label, index) => {
    const slug = violationSlug(label.name)
    if (!slug || bySlug.has(slug)) return
    const shadeIndex = shadeCount[label.severity] || 0
    shadeCount[label.severity] = shadeIndex + 1
    bySlug.set(slug, {
      severity: label.severity,
      rank: SEVERITY_RANK[label.severity] ?? UNRANKED_SEVERITY,
      order: index,
      shadeIndex,
    })
  })
  return bySlug
}

/** Project-label priority: high, then medium, then low, then settings order. Unlisted last. */
export function rankColorKeys(keys, labels) {
  const unique = [...new Set((keys || []).filter(Boolean))]
  const lookup = labelLookup(labels)
  if (!lookup.size) {
    unique.sort((a, b) => a.localeCompare(b))
    return unique
  }
  unique.sort((a, b) => {
    const ra = lookup.get(violationSlug(a))
    const rb = lookup.get(violationSlug(b))
    const sa = ra ? ra.rank : UNRANKED_SEVERITY
    const sb = rb ? rb.rank : UNRANKED_SEVERITY
    if (sa !== sb) return sa - sb
    const oa = ra ? ra.order : 1e9
    const ob = rb ? rb.order : 1e9
    if (oa !== ob) return oa - ob
    return String(a).localeCompare(String(b))
  })
  return unique
}

export function orderColorKeys(keys, labels) {
  return rankColorKeys(keys, labels)
}

function shadeFromPalette(palette, index) {
  if (!palette?.length) return '#FB7185'
  return palette[((index % palette.length) + palette.length) % palette.length]
}

export function violationColor(key, labels) {
  const slug = violationSlug(key)
  if (!slug || slug === UNKNOWN_COLOR_KEY || slug === 'none' || slug === 'safe') return BLAND_GREY
  const lookup = labelLookup(labels)
  if (lookup.size) {
    const meta = lookup.get(slug)
    if (!meta) return shadeFromPalette(UNMATCHED_PALETTE, hashString(slug))
    return shadeFromPalette(SEVERITY_PALETTES[meta.severity], meta.shadeIndex)
  }
  if (VIOLATION_COLORS[slug]) return VIOLATION_COLORS[slug]
  return ALARM_PALETTE[hashString(slug) % ALARM_PALETTE.length]
}

function hexHue(hex) {
  const n = String(hex || '').replace('#', '')
  if (n.length < 6) return null
  const r = parseInt(n.slice(0, 2), 16) / 255
  const g = parseInt(n.slice(2, 4), 16) / 255
  const b = parseInt(n.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d < 0.08) return null
  let h
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  if (h < 0) h += 360
  return h
}

function hueDistance(a, b) {
  const d = Math.abs(a - b)
  return Math.min(d, 360 - d)
}

function paletteForKey(key, labels) {
  const lookup = labelLookup(labels)
  if (!lookup.size) return ALARM_PALETTE
  const meta = lookup.get(violationSlug(key))
  if (!meta) return UNMATCHED_PALETTE
  return SEVERITY_PALETTES[meta.severity] || UNMATCHED_PALETTE
}

/** Canonical violation color, shifted if it would blend into a parent family fill. */
export function violationColorDistinct(key, avoidHex, labels) {
  const base = violationColor(key, labels)
  if (!avoidHex || base === BLAND_GREY) return base
  const avoid = hexHue(avoidHex)
  const mine = hexHue(base)
  if (avoid == null || mine == null) return base
  const dist = hueDistance(avoid, mine)
  if (dist >= 42) return base
  let best = base
  let bestDist = dist
  for (const candidate of paletteForKey(key, labels)) {
    const h = hexHue(candidate)
    if (h == null) continue
    const d = hueDistance(avoid, h)
    if (d > bestDist) {
      best = candidate
      bestDist = d
    }
  }
  return best
}

/** Build a stable index → key map and return primary key index for a stub. */
export function buildColorAxis(keys) {
  const ordered = orderColorKeys(keys)
  const indexByKey = new Map(ordered.map((k, i) => [k, i]))
  return { keys: ordered, indexByKey }
}

export function primaryColorKey(colorKeys = [], labels) {
  const ranked = rankColorKeys(colorKeys, labels)
  return ranked[0] || UNKNOWN_COLOR_KEY
}
