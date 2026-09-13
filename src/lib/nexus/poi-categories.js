/**
 * Posts Nexus POI mode: category (hub) → POI (cluster) → reviewed posts (leaves).
 * Persist `pois.category` (slug) and optional `pois.category_label`.
 */

export const POI_CATEGORY_SLUGS = [
  'politician',
  'military_official',
  'adversary_military',
  'armed_force',
  'adversary_force',
  'journalist',
  'company',
  'platform_weapon',
  'country_place',
  'other',
]

/** Stored slugs that share a parent hub. Kept so older docs still group. */
export const POI_CATEGORY_HUB = {
  political_party: 'politician',
  celebrity: 'other',
  operation: 'other',
}

export const POI_CATEGORY_LABELS = {
  politician: 'Politicians and parties',
  military_official: 'Indian military officials',
  adversary_military: 'Opposition military officials',
  armed_force: 'Indian armed forces',
  adversary_force: 'Opposition forces and agencies',
  journalist: 'Journalists and commentators',
  company: 'Companies',
  platform_weapon: 'Aircraft and weapons',
  country_place: 'Countries and places',
  other: 'Other',
}

export const POI_CAT_HUB_PREFIX = 'poi-cat:'
export const POI_CLUSTER_PREFIX = 'poi:'

export function poiCategoryHubSlug(slug) {
  const key = String(slug || '').trim()
  return POI_CATEGORY_HUB[key] || key
}

export function poiCategoryLabel(slug) {
  const key = poiCategoryHubSlug(slug)
  return POI_CATEGORY_LABELS[key] || key || POI_CATEGORY_LABELS.other
}

/** Every stored slug that belongs on this parent hub. */
export function poiCategorySlugsForHub(slug) {
  const hub = poiCategoryHubSlug(slug)
  const slugs = [hub]
  for (const [child, parent] of Object.entries(POI_CATEGORY_HUB)) {
    if (parent === hub) slugs.push(child)
  }
  return slugs
}

export function poiCategoryHubId(slug) {
  return `${POI_CAT_HUB_PREFIX}${poiCategoryHubSlug(slug) || 'other'}`
}

export function poiClusterId(objectId) {
  return `${POI_CLUSTER_PREFIX}${objectId}`
}

export function parsePoiNexusId(raw) {
  const id = String(raw || '').replace(/^cluster:/, '')
  if (id.startsWith(POI_CAT_HUB_PREFIX)) {
    return { kind: 'category', slug: id.slice(POI_CAT_HUB_PREFIX.length) }
  }
  if (id.startsWith(POI_CLUSTER_PREFIX)) {
    return { kind: 'poi', poiId: id.slice(POI_CLUSTER_PREFIX.length) }
  }
  return { kind: null }
}
