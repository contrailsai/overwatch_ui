/** Shared helpers for POI informatics matching and date ranges. */

export const POI_TIERS = ['primary', 'secondary', 'other']

export const MAX_POI_RANGE_DAYS = 90

export function normalizePoiNameKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function isPoiMerged(poi) {
  if (!poi) return false
  return (
    poi.status === 'merged' ||
    Boolean(poi.merged_into) ||
    Boolean(poi.merged_into_name)
  )
}

export function parentPoiFilter() {
  return {
    status: { $ne: 'merged' },
    merged_into: null,
    merged_into_name: null,
  }
}

export function uniquePoiStrings(values, limit = 200) {
  const labels = []
  const seen = new Set()
  for (const raw of values || []) {
    const s = String(raw || '').trim()
    if (!s) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    labels.push(s)
    if (labels.length >= limit) break
  }
  return labels
}

export function poiTextSearchOr(re) {
  return [
    { display_name: re },
    { name: re },
    { aliases: re },
    { alias_poi_names: re },
    { 'meta.title': re },
    { summary: re },
  ]
}

/** Labels used to match posts for a POI doc (display_name + aliases + linked alias names). */
export function getPoiMatchLabels(poi) {
  const labels = []
  const seen = new Set()
  const push = (v) => {
    const s = String(v || '').trim()
    if (!s) return
    const key = s.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    labels.push(s)
  }
  push(poi?.display_name)
  push(poi?.name)
  if (Array.isArray(poi?.aliases)) {
    for (const a of poi.aliases) push(a)
  }
  if (Array.isArray(poi?.alias_poi_names)) {
    for (const a of poi.alias_poi_names) push(a)
  }
  return labels
}

export function mergeAliasFieldsIntoParent(parent, alias) {
  const summary =
    String(parent?.summary || '').trim()
      ? parent.summary
      : (alias?.summary || parent?.summary || '')

  const parentHasImage = Boolean(parent?.image?.s3_url || parent?.image?.s3_key)
  const aliasHasImage = Boolean(alias?.image?.s3_url || alias?.image?.s3_key)
  const image = parentHasImage
    ? (parent.image || { s3_url: null, s3_key: null })
    : aliasHasImage
      ? alias.image
      : (parent?.image || { s3_url: null, s3_key: null })

  const parentMeta = parent?.meta && typeof parent.meta === 'object' ? parent.meta : {}
  const aliasMeta = alias?.meta && typeof alias.meta === 'object' ? alias.meta : {}
  const meta = {
    title: String(parentMeta.title || '').trim() ? parentMeta.title : (aliasMeta.title || parentMeta.title || ''),
    organization: String(parentMeta.organization || '').trim()
      ? parentMeta.organization
      : (aliasMeta.organization || parentMeta.organization || ''),
    state: String(parentMeta.state || '').trim() ? parentMeta.state : (aliasMeta.state || parentMeta.state || ''),
    notes: String(parentMeta.notes || '').trim() ? parentMeta.notes : (aliasMeta.notes || parentMeta.notes || ''),
  }

  const aliases = uniquePoiStrings([
    ...(Array.isArray(parent?.aliases) ? parent.aliases : []),
    alias?.display_name,
    alias?.name,
    ...(Array.isArray(alias?.aliases) ? alias.aliases : []),
  ], 80)

  const topicKeys = new Map()
  for (const t of [...(parent?.topics || []), ...(alias?.topics || [])]) {
    if (t == null) continue
    topicKeys.set(t.toString?.() ?? String(t), t)
  }
  const topics = Array.from(topicKeys.values())

  const aliasPoiNames = uniquePoiStrings([
    ...(Array.isArray(parent?.alias_poi_names) ? parent.alias_poi_names : []),
    ...(Array.isArray(alias?.alias_poi_names) ? alias.alias_poi_names : []),
    alias?.name,
  ])

  return {
    summary,
    image,
    meta,
    aliases,
    topics,
    topic_count: topics.length,
    alias_poi_names: aliasPoiNames,
  }
}

export function buildPoiPostMatch(poi, { from, to } = {}) {
  const labels = getPoiMatchLabels(poi)
  if (!labels.length) {
    return { _id: { $exists: false } }
  }

  const match = {
    $or: [
      { 'review_details.poi_names': { $in: labels } },
      { 'analysis_results.poi_check.poi_names': { $in: labels } },
    ],
  }

  if (from || to) {
    match['list.sourced_at'] = {}
    if (from) match['list.sourced_at'].$gte = from
    if (to) match['list.sourced_at'].$lte = to
  }

  return match
}

const AIGC_LABEL_RE = /ai[-_ ]?generated|\baigc\b/i
const AIGC_LABEL_MONGO_RE = /ai[-_ ]?generated|aigc/i

export function isAigcLabel(name) {
  return AIGC_LABEL_RE.test(String(name || ''))
}

export function isMisinfoLabel(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[-_\s]/g, '')
    .includes('misinformation')
}

export function collectPostThreatLabels(post) {
  const lists = [
    post?.list?.threat_types,
    post?.list?.violation_flags,
    post?.review_details?.threat_types,
    post?.analysis_results?.threat_types,
    post?.threat_types,
  ]
  const out = []
  const seen = new Set()
  for (const arr of lists) {
    if (!Array.isArray(arr)) continue
    for (const raw of arr) {
      const s = String(raw || '').trim()
      if (!s) continue
      const key = s.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(s)
    }
  }
  return out
}

export function isAigcPost(post) {
  if (
    post?.review_details?.is_aigc === true ||
    post?.analysis_results?.is_aigc === true ||
    post?.analysis_results?.aigc_check?.is_aigc === true ||
    post?.is_aigc === true
  ) {
    return true
  }
  return collectPostThreatLabels(post).some(isAigcLabel)
}

/** Mongo fragment: post is flagged or labeled as AI-generated. */
export function isAigcPostMatch() {
  return {
    $or: [
      { 'review_details.is_aigc': true },
      { 'analysis_results.is_aigc': true },
      { 'analysis_results.aigc_check.is_aigc': true },
      { 'list.threat_types': AIGC_LABEL_MONGO_RE },
      { 'list.violation_flags': AIGC_LABEL_MONGO_RE },
      { 'review_details.threat_types': AIGC_LABEL_MONGO_RE },
      { 'analysis_results.threat_types': AIGC_LABEL_MONGO_RE },
    ],
  }
}

export function buildPoiAigcPostMatch(poi, { from, to } = {}) {
  const base = buildPoiPostMatch(poi, { from, to })
  if (base._id?.$exists === false) return base

  const { $or, ...rest } = base
  return {
    ...rest,
    $and: [{ $or }, isAigcPostMatch()],
  }
}

/**
 * 0 = AI + misinformation, 1 = AI + other labels, 2 = AI only.
 */
export function aigcPriorityRank(post) {
  const labels = collectPostThreatLabels(post)
  if (labels.some(isMisinfoLabel)) return 0
  if (labels.some((label) => !isAigcLabel(label) && !isMisinfoLabel(label))) return 1
  return 2
}

export function compareAigcPosts(a, b) {
  const rankDiff = aigcPriorityRank(a) - aigcPriorityRank(b)
  if (rankDiff !== 0) return rankDiff
  const ta = new Date(a.list?.sourced_at || a.sourced_at || 0).getTime()
  const tb = new Date(b.list?.sourced_at || b.sourced_at || 0).getTime()
  return tb - ta
}

/**
 * Resolve a date range from UI presets / custom bounds.
 * @returns {{ from: Date | null, to: Date | null, preset: string }}
 */
export function resolvePoiDateRange({ preset = '7d', from = null, to = null } = {}) {
  const now = new Date()

  if (preset === 'all' || preset === 'all_time') {
    return { from: null, to: null, preset: 'all' }
  }

  if (preset === 'custom' && from) {
    let start = new Date(from)
    let endDate = to ? new Date(to) : now
    if (Number.isNaN(start.getTime())) start = new Date(now.getTime() - 7 * 86400000)
    if (Number.isNaN(endDate.getTime())) endDate = now
    // Date-only strings → inclusive end of day
    if (typeof to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      endDate = new Date(`${to}T23:59:59.999Z`)
    }
    if (typeof from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      start = new Date(`${from}T00:00:00.000Z`)
    }
    const maxMs = MAX_POI_RANGE_DAYS * 86400000
    if (endDate.getTime() - start.getTime() > maxMs) {
      start = new Date(endDate.getTime() - maxMs)
    }
    return { from: start, to: endDate, preset: 'custom' }
  }

  // legacy bookmark support
  if (preset === '24h') {
    return { from: new Date(now.getTime() - 86400000), to: now, preset: '24h' }
  }

  // default 7d
  return { from: new Date(now.getTime() - 7 * 86400000), to: now, preset: '7d' }
}

export function serializePoiForClient(poi, extra = {}) {
  if (!poi) return null
  const signedImageUrl = extra.signedImageUrl || null
  return {
    _id: poi._id?.toString?.() ?? String(poi._id),
    name: poi.name || '',
    display_name: poi.display_name || poi.name || '',
    aliases: Array.isArray(poi.aliases) ? poi.aliases : [],
    alias_poi_names: Array.isArray(poi.alias_poi_names) ? poi.alias_poi_names : [],
    linked_aliases: Array.isArray(extra.linkedAliases) ? extra.linkedAliases : [],
    tier: POI_TIERS.includes(poi.tier) ? poi.tier : 'other',
    summary: poi.summary || '',
    image: {
      s3_url: poi.image?.s3_url || null,
      s3_key: poi.image?.s3_key || null,
      signed_url: signedImageUrl || null,
    },
    meta: {
      title: poi.meta?.title || '',
      organization: poi.meta?.organization || '',
      state: poi.meta?.state || '',
      notes: poi.meta?.notes || '',
    },
    post_count: typeof poi.post_count === 'number' ? poi.post_count : 0,
    topic_count: typeof poi.topic_count === 'number' ? poi.topic_count : 0,
    status: poi.status || 'active',
    merged_into: poi.merged_into?.toString?.() ?? poi.merged_into ?? null,
    merged_into_name: poi.merged_into_name || null,
    created_at: poi.created_at ? new Date(poi.created_at).toISOString() : null,
    updated_at: poi.updated_at ? new Date(poi.updated_at).toISOString() : null,
  }
}
