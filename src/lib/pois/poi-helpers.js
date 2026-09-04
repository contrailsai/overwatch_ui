/** Shared helpers for POI informatics matching and date ranges. */

export const POI_TIERS = ['primary', 'secondary', 'other']

export const MAX_POI_RANGE_DAYS = 90

export function normalizePoiNameKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Labels used to match posts for a POI doc (display_name + aliases). */
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
  if (Array.isArray(poi?.aliases)) {
    for (const a of poi.aliases) push(a)
  }
  return labels
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

/**
 * Resolve a date range from UI presets / custom bounds.
 * @returns {{ from: Date, to: Date, preset: string }}
 */
export function resolvePoiDateRange({ preset = '7d', from = null, to = null } = {}) {
  const now = new Date()

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

  if (preset === '24h') {
    return { from: new Date(now.getTime() - 86400000), to: now, preset: '24h' }
  }

  // default 7d
  return { from: new Date(now.getTime() - 7 * 86400000), to: now, preset: '7d' }
}

export function serializePoiForClient(poi, { signedImageUrl = null } = {}) {
  if (!poi) return null
  return {
    _id: poi._id?.toString?.() ?? String(poi._id),
    name: poi.name || '',
    display_name: poi.display_name || poi.name || '',
    aliases: Array.isArray(poi.aliases) ? poi.aliases : [],
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
    created_at: poi.created_at ? new Date(poi.created_at).toISOString() : null,
    updated_at: poi.updated_at ? new Date(poi.updated_at).toISOString() : null,
  }
}
