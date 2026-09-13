/**
 * Nexus L1/L2 query builders and stub helpers.
 * Strict projections only — never include content.* or signed URLs.
 * Server-only — do not import from Client Components.
 */

import { ObjectId } from 'mongodb'
import { REVIEWED_THREAT_SCORE_FILTER } from '@/lib/posts/reviewed-post-filter'
import { REVIEWED_ADS_FILTER } from '@/lib/ads/reviewed-ad-filter'
import { buildPoiPostMatch, getPoiMatchLabels } from '@/lib/pois/poi-helpers'
import {
  DEFAULT_LEAF_CAP_PER_PARENT,
  NODE_TYPES,
  emptyNexusGraph,
} from './schema'
import { FAMILY_PALETTE, UNKNOWN_COLOR_KEY, orderColorKeys, primaryColorKey } from './colors'
import {
  poiCategoryHubId,
  poiCategoryHubSlug,
  poiCategoryLabel,
  poiClusterId,
} from './poi-categories'

export function toObjectIds(ids = []) {
  const out = []
  for (const id of ids) {
    if (id instanceof ObjectId) {
      out.push(id)
      continue
    }
    const s = String(id || '').trim()
    if (/^[a-fA-F0-9]{24}$/.test(s)) {
      try {
        out.push(new ObjectId(s))
      } catch {
        /* skip */
      }
    }
  }
  return out
}

export function extractViolationKeys(doc, labels) {
  const lists = [
    doc?.list?.threat_types,
    doc?.list?.violation_flags,
    doc?.review_details?.threat_types,
    doc?.review_details?.violations,
  ]
  const keys = []
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      const v = typeof item === 'string' ? item : item?.name || item?.label
      if (v && String(v).trim() && String(v).toLowerCase() !== 'safe') {
        keys.push(String(v).trim())
      }
    }
  }
  return orderColorKeys(keys, labels)
}

export function postedDayUnix(doc) {
  const raw = doc?.list?.posted_at || doc?.list?.published_at || doc?.list?.start_date
  if (!raw) return null
  const d = raw instanceof Date ? raw : new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor(d.getTime() / 86400000)
}

/** Prefer reviewed leaf counts so hubs match client list pages. */
function profileLeafCount(p) {
  return (
    p.reviewed_post_count ??
    p.list?.reviewed_post_count ??
    p.post_count ??
    p.list?.post_count ??
    0
  )
}

function adProfileLeafCount(p) {
  return (
    p.reviewed_ad_count ??
    p.list?.reviewed_ad_count ??
    p.ad_count ??
    p.list?.ad_count ??
    0
  )
}

const LEAF_STUB_PROJECTION = {
  _id: 1,
  'list.threat_types': 1,
  'list.violation_flags': 1,
  'list.posted_at': 1,
  'list.published_at': 1,
  'list.start_date': 1,
  'list.effective_threat_score': 1,
  'review_details.threat_types': 1,
  'review_details.violations': 1,
}

/**
 * Build compact leaf stubs from Mongo docs.
 * @returns {{ leaves: Array, colorKeys: string[] }}
 */
export function docsToLeafStubs(docs, { leafKind = 'post', cap = DEFAULT_LEAF_CAP_PER_PARENT, labels } = {}) {
  const colorKeySet = new Set()
  const leaves = []
  const limited = docs.slice(0, cap)
  for (const doc of limited) {
    const colorKeys = extractViolationKeys(doc, labels)
    colorKeys.forEach((k) => colorKeySet.add(k))
    const primary = primaryColorKey(colorKeys, labels)
    leaves.push({
      id: doc._id.toString(),
      colorKeys,
      colorKey: primary,
      t: postedDayUnix(doc),
      leafKind,
    })
  }
  return {
    leaves,
    colorKeys: orderColorKeys([...colorKeySet], labels),
    omittedCount: Math.max(0, docs.length - limited.length),
  }
}

/**
 * Attach color axis indices (k) after global key list is known.
 */
export function indexLeafStubs(leaves, colorKeys) {
  const indexByKey = new Map(colorKeys.map((k, i) => [k, i]))
  return leaves.map((leaf) => ({
    id: leaf.id,
    k: indexByKey.has(leaf.colorKey) ? indexByKey.get(leaf.colorKey) : -1,
    t: leaf.t ?? null,
    leafKind: leaf.leafKind,
    colorKeys: leaf.colorKeys,
  }))
}

/**
 * Fetch post leaf stubs for topic parent ids.
 * Uses topics.posts[] then $in — not a full collection scan.
 */
export async function fetchPostLeafStubsForTopics(db, topicsColl, postsColl, parentTopicIds, {
  cap = DEFAULT_LEAF_CAP_PER_PARENT,
  filters = {},
  labels,
} = {}) {
  if (!parentTopicIds?.length) {
    return { clusters: [], colorAxis: { keys: [] } }
  }

  const topics = await topicsColl
    .find(
      { topic_id: { $in: parentTopicIds.map(String) } },
      { projection: { topic_id: 1, posts: 1, poi_names: 1, post_count: 1 } }
    )
    .toArray()

  const allColorKeys = new Set()
  const clusters = []

  for (const topic of topics) {
    const ids = toObjectIds(topic.posts || [])
    if (!ids.length) {
      clusters.push({
        id: String(topic.topic_id),
        familyId: Array.isArray(topic.poi_names) && topic.poi_names[0]
          ? String(topic.poi_names[0])
          : String(topic.topic_id),
        leafCount: 0,
        leaves: [],
        omittedCount: 0,
      })
      continue
    }

    const match = {
      _id: { $in: ids },
      ...REVIEWED_THREAT_SCORE_FILTER,
    }
    if (filters.from || filters.to) {
      match['list.posted_at'] = {}
      if (filters.from) match['list.posted_at'].$gte = new Date(filters.from)
      if (filters.to) match['list.posted_at'].$lte = new Date(filters.to)
    }

    // Fetch slightly over cap to compute omittedCount honestly
    const docs = await postsColl
      .find(match, { projection: LEAF_STUB_PROJECTION })
      .limit(cap + 1)
      .toArray()

    const { leaves, colorKeys, omittedCount } = docsToLeafStubs(docs, {
      leafKind: 'post',
      cap,
      labels,
    })
    colorKeys.forEach((k) => allColorKeys.add(k))

    clusters.push({
      id: String(topic.topic_id),
      familyId:
        Array.isArray(topic.poi_names) && topic.poi_names[0]
          ? String(topic.poi_names[0])
          : String(topic.topic_id),
      leafCount: topic.post_count ?? leaves.length,
      leaves,
      omittedCount: omittedCount + Math.max(0, ids.length - docs.length),
    })
  }

  const keys = orderColorKeys([...allColorKeys], labels)
  return {
    clusters: clusters.map((c) => ({
      ...c,
      leaves: indexLeafStubs(c.leaves, keys),
    })),
    colorAxis: { keys },
  }
}

/**
 * Fetch post leaf stubs grouped by profile_id (hub = profile).
 */
export async function fetchPostLeafStubsForProfiles(db, postsColl, profileIds, {
  cap = DEFAULT_LEAF_CAP_PER_PARENT,
  labels,
} = {}) {
  const oids = toObjectIds(profileIds)
  if (!oids.length) return { clusters: [], colorAxis: { keys: [] } }

  const allColorKeys = new Set()
  const clusters = []

  for (const profileId of oids) {
    const docs = await postsColl
      .find(
        { profile_id: profileId, ...REVIEWED_THREAT_SCORE_FILTER },
        { projection: LEAF_STUB_PROJECTION }
      )
      .limit(cap + 1)
      .toArray()

    const { leaves, colorKeys, omittedCount } = docsToLeafStubs(docs, { leafKind: 'post', cap, labels })
    colorKeys.forEach((k) => allColorKeys.add(k))
    clusters.push({
      id: profileId.toString(),
      familyId: profileId.toString(),
      leafCount: leaves.length + omittedCount,
      leaves,
      omittedCount,
    })
  }

  const keys = orderColorKeys([...allColorKeys], labels)
  return {
    clusters: clusters.map((c) => ({
      ...c,
      leaves: indexLeafStubs(c.leaves, keys),
    })),
    colorAxis: { keys },
  }
}

function poiAppearsInReviewedMentions(poi, mentionKeys) {
  if (!mentionKeys?.size) return false
  return getPoiMatchLabels(poi).some((label) => mentionKeys.has(String(label).trim().toLowerCase().replace(/\s+/g, ' ')))
}

function poiLabelKey(raw) {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Unique reviewed-post counts and sourced_at span per POI and per category.
 * A post that mentions two aliases of the same POI counts once. A post that
 * mentions two POIs in one category counts once on the hub.
 */
export function summarizeReviewedPoiMentions(pois = [], posts = []) {
  const labelToPois = new Map()
  for (const poi of pois) {
    const id = poi._id?.toString?.() || String(poi.id || '')
    if (!id) continue
    for (const label of getPoiMatchLabels(poi)) {
      const key = poiLabelKey(label)
      if (!key) continue
      if (!labelToPois.has(key)) labelToPois.set(key, [])
      labelToPois.get(key).push(poi)
    }
  }

  const poiStats = new Map()
  const hubStats = new Map()

  const bump = (map, key, at) => {
    const row = map.get(key) || { count: 0, firstSeen: null, lastSeen: null }
    row.count += 1
    if (at && !Number.isNaN(at.getTime())) {
      if (!row.firstSeen || at < row.firstSeen) row.firstSeen = at
      if (!row.lastSeen || at > row.lastSeen) row.lastSeen = at
    }
    map.set(key, row)
  }

  for (const post of posts) {
    const names = [
      ...(Array.isArray(post.review_details?.poi_names) ? post.review_details.poi_names : []),
      ...(Array.isArray(post.analysis_results?.poi_check?.poi_names)
        ? post.analysis_results.poi_check.poi_names
        : []),
      ...(Array.isArray(post.names) ? post.names : []),
    ]
    const hitPois = new Set()
    const hitHubs = new Set()
    for (const name of names) {
      const matches = labelToPois.get(poiLabelKey(name))
      if (!matches) continue
      for (const poi of matches) {
        const id = poi._id?.toString?.() || String(poi.id || '')
        if (!id || hitPois.has(id)) continue
        hitPois.add(id)
        const slug = poiCategoryHubSlug(poi.category)
        if (slug) hitHubs.add(slug)
      }
    }
    const at = post.sourced_at || post.list?.sourced_at
    const when = at ? new Date(at) : null
    for (const id of hitPois) bump(poiStats, id, when)
    for (const slug of hitHubs) bump(hubStats, slug, when)
  }

  return { poiStats, hubStats }
}

/**
 * L1: POI category hubs → POI clusters. Leaves load via fetchPostLeafStubsForPois.
 * Expects pois[].category slugs; skips POIs with no reviewed-post mention overlap.
 */
export function buildPoiCategoryGraph({ pois = [], mentionKeys = null, hubStats = null } = {}) {
  const graph = emptyNexusGraph({
    preset: 'posts-poi-categories',
    parentMode: 'poi',
    leafKind: 'post',
  })

  const scoped = pois.filter((p) => {
    const slug = String(p.category || '').trim()
    if (!slug) return false
    if (mentionKeys && !poiAppearsInReviewedMentions(p, mentionKeys)) return false
    return true
  })

  const byCategory = new Map()
  for (const poi of scoped) {
    const slug = poiCategoryHubSlug(poi.category)
    if (!byCategory.has(slug)) byCategory.set(slug, [])
    byCategory.get(slug).push(poi)
  }

  const hubSlugs = [...byCategory.keys()].sort((a, b) => {
    const ca = hubStats?.get(a)?.count ?? byCategory.get(a).reduce((sum, p) => sum + (p.post_count ?? 0), 0)
    const cb = hubStats?.get(b)?.count ?? byCategory.get(b).reduce((sum, p) => sum + (p.post_count ?? 0), 0)
    if (cb !== ca) return cb - ca
    return poiCategoryLabel(a).localeCompare(poiCategoryLabel(b))
  })

  hubSlugs.forEach((slug, i) => {
    const members = byCategory.get(slug)
    const hubId = poiCategoryHubId(slug)
    const stats = hubStats?.get(slug)
    const count = stats?.count ?? members.reduce((sum, p) => sum + (p.post_count ?? 0), 0)
    graph.nodes.push({
      id: hubId,
      type: NODE_TYPES.HUB,
      label: poiCategoryLabel(slug),
      parentId: null,
      familyId: hubId,
      count,
      firstSeen: stats?.firstSeen || null,
      lastSeen: stats?.lastSeen || null,
      hubKind: 'poi_category',
      category: slug,
      familyColor: FAMILY_PALETTE[i % FAMILY_PALETTE.length],
    })

    const familyColor = FAMILY_PALETTE[i % FAMILY_PALETTE.length]
    const ordered = [...members].sort((a, b) => {
      const ta = String(a.tier || '') === 'primary' ? 0 : 1
      const tb = String(b.tier || '') === 'primary' ? 0 : 1
      if (ta !== tb) return ta - tb
      return (b.post_count ?? 0) - (a.post_count ?? 0)
    })
    for (const poi of ordered) {
      const id = poiClusterId(poi._id?.toString?.() || String(poi.id))
      const isPrimary = String(poi.tier || '') === 'primary'
      graph.nodes.push({
        id,
        type: NODE_TYPES.CLUSTER,
        label: poi.display_name || poi.name || id,
        parentId: hubId,
        familyId: hubId,
        count: poi.post_count ?? 0,
        firstSeen: poi.first_seen || poi.firstSeen || null,
        lastSeen: poi.last_seen || poi.lastSeen || null,
        clusterKind: 'poi',
        familyColor,
        tier: poi.tier || 'other',
        isPrimary,
        imageUrl: poi.imageUrl || null,
        baseRadius: isPrimary ? 18 : undefined,
      })
      graph.links.push({ source: hubId, target: id, type: 'hub_cluster' })
    }
  })

  graph.meta.hubCount = hubSlugs.length
  graph.meta.clusterCount = graph.nodes.filter((n) => n.type === NODE_TYPES.CLUSTER).length
  return graph
}

/**
 * Fetch post leaf stubs for POI clusters (`poi:{ObjectId}`).
 */
export async function fetchPostLeafStubsForPois(poisColl, postsColl, parentIds, {
  cap = DEFAULT_LEAF_CAP_PER_PARENT,
  labels,
} = {}) {
  const poiHex = []
  for (const raw of parentIds || []) {
    const id = String(raw || '').replace(/^cluster:/, '')
    if (id.startsWith('poi-cat:')) continue
    const hex = id.startsWith('poi:') ? id.slice(4) : id
    if (/^[a-fA-F0-9]{24}$/.test(hex)) poiHex.push(hex)
  }
  const oids = toObjectIds(poiHex)
  if (!oids.length) return { clusters: [], colorAxis: { keys: [] } }

  const poiDocs = await poisColl
    .find({ _id: { $in: oids } }, { projection: { display_name: 1, name: 1, aliases: 1, alias_poi_names: 1, category: 1, post_count: 1 } })
    .toArray()

  const allColorKeys = new Set()
  const clusters = []

  for (const poi of poiDocs) {
    const match = buildPoiPostMatch(poi)
    if (match._id?.$exists === false) {
      clusters.push({
        id: poiClusterId(poi._id.toString()),
        familyId: poi.category ? poiCategoryHubId(poi.category) : poiClusterId(poi._id.toString()),
        leafCount: 0,
        leaves: [],
        omittedCount: 0,
      })
      continue
    }
    const reviewedMatch = { ...match, ...REVIEWED_THREAT_SCORE_FILTER }
    const [total, docs] = await Promise.all([
      postsColl.countDocuments(reviewedMatch),
      postsColl
        .find(reviewedMatch, { projection: LEAF_STUB_PROJECTION })
        .limit(cap + 1)
        .toArray(),
    ])

    const { leaves, colorKeys, omittedCount } = docsToLeafStubs(docs, { leafKind: 'post', cap, labels })
    colorKeys.forEach((k) => allColorKeys.add(k))
    clusters.push({
      id: poiClusterId(poi._id.toString()),
      familyId: poi.category ? poiCategoryHubId(poi.category) : poiClusterId(poi._id.toString()),
      leafCount: total,
      leaves,
      omittedCount,
    })
  }

  const keys = orderColorKeys([...allColorKeys], labels)
  return {
    clusters: clusters.map((c) => ({
      ...c,
      leaves: indexLeafStubs(c.leaves, keys),
    })),
    colorAxis: { keys },
  }
}

/** Reviewed posts whose poi_names overlap any of the given POI labels. */
export function buildReviewedPostsMatchForPois(pois = []) {
  const labels = []
  const seen = new Set()
  for (const poi of pois) {
    for (const label of getPoiMatchLabels(poi)) {
      const key = String(label).trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      labels.push(label)
    }
  }
  if (!labels.length) return { _id: { $exists: false } }
  return {
    ...REVIEWED_THREAT_SCORE_FILTER,
    $or: [
      { 'review_details.poi_names': { $in: labels } },
      { 'analysis_results.poi_check.poi_names': { $in: labels } },
    ],
  }
}

/**
 * L1 skeleton: parent topics (hubs) → topics (clusters) for posts understanding.
 *
 * Topic document contract (child topics carry reviewed post ids):
 * - topic_id: unique string like T00001
 * - title, type: active|passive
 * - parent hubs: parent_topic_id null/absent
 * - child topics: parent_topic_id = parent's topic_id string (not Mongo _id)
 * - posts: reviewed Posts._id hex strings on the child topic
 * - post_count: posts.length
 */
export function buildParentTopicTreeGraph({ topics = [] } = {}) {
  const graph = emptyNexusGraph({
    preset: 'posts-parent-topics',
    parentMode: 'parent_topic',
    leafKind: 'post',
  })
  const byId = new Map()

  for (const topic of topics) {
    const id = String(topic.topic_id)
    if (!id) continue
    byId.set(id, topic)
  }

  const hubs = []
  const clusters = []

  for (const topic of topics) {
    const id = String(topic.topic_id)
    const parentRef = topic.parent_topic_id
    const isPassive = String(topic.type || '').toLowerCase() === 'passive'
    const hasParent =
      parentRef != null &&
      String(parentRef) &&
      (byId.has(String(parentRef)) || String(parentRef) !== id)

    // Hubs = topics with no parent (or active top-level)
    if (!hasParent || !topic.parent_topic_id) {
      hubs.push({
        id,
        type: NODE_TYPES.HUB,
        label: topic.title || id,
        parentId: null,
        familyId: id,
        count: topic.post_count ?? 0,
        hubKind: 'parent_topic',
      })
    } else {
      const parentId = String(
        parentRef?.toString?.() || parentRef
      )
      // Resolve ObjectId parents via topic _id map if needed — caller should pass topic_id refs
      clusters.push({
        id,
        type: NODE_TYPES.CLUSTER,
        label: topic.title || id,
        parentId,
        familyId: parentId,
        count: topic.post_count ?? 0,
        topicType: isPassive ? 'passive' : 'active',
        clusterKind: 'topic',
      })
    }
  }

  // Topics that are both hubs and have children already listed
  const hubIds = new Set(hubs.map((h) => h.id))
  // Clusters whose parent isn't a hub become hubs themselves
  for (const c of clusters) {
    if (!hubIds.has(c.parentId) && byId.has(c.parentId)) {
      const t = byId.get(c.parentId)
      hubs.push({
        id: c.parentId,
        type: NODE_TYPES.HUB,
        label: t.title || c.parentId,
        parentId: null,
        familyId: c.parentId,
        count: t.post_count ?? 0,
        hubKind: 'parent_topic',
      })
      hubIds.add(c.parentId)
    } else if (!hubIds.has(c.parentId)) {
      // Dangling parent — treat cluster as its own hub family
      c.parentId = c.id
      c.familyId = c.id
      if (!hubIds.has(c.id)) {
        hubs.push({
          id: c.id,
          type: NODE_TYPES.HUB,
          label: c.label,
          parentId: null,
          familyId: c.id,
          count: c.count,
          hubKind: 'parent_topic',
        })
        hubIds.add(c.id)
      }
    }
  }

  hubs.forEach((h, i) => {
    h.familyColor = FAMILY_PALETTE[i % FAMILY_PALETTE.length]
  })
  const colorByFamily = new Map(hubs.map((h) => [h.id, h.familyColor]))
  for (const c of clusters) {
    c.familyColor = colorByFamily.get(c.familyId) || FAMILY_PALETTE[0]
  }

  // Don't duplicate: if a topic is both hub and would be cluster with parentId=self, skip cluster
  const clusterNodes = clusters.filter((c) => c.parentId !== c.id)

  graph.nodes = [...hubs, ...clusterNodes]
  graph.links = clusterNodes.map((c) => ({
    source: c.parentId,
    target: c.id,
    type: 'hub_cluster',
  }))
  graph.meta.hubCount = hubs.length
  graph.meta.clusterCount = clusterNodes.length
  return graph
}

/**
 * L1: profiles (hubs) with post counts — capped for cardinality.
 * Flat parent→leaf: one hub per profile (no synthetic cluster).
 *
 * AirForce / similar corpora: do not cluster by violation type (almost every
 * reviewed post shares Anti-India-Propaganda + Misinformation). Next 3-tier
 * to add when wanted: Platform → Profile → posts (profiles.platform already exists).
 */
export function buildProfileHubsGraph({ profiles = [], maxHubs = 80 } = {}) {
  const graph = emptyNexusGraph({
    preset: 'posts-profiles',
    parentMode: 'profile',
    leafKind: 'post',
  })

  const sorted = [...profiles]
    .sort((a, b) => profileLeafCount(b) - profileLeafCount(a))
    .slice(0, maxHubs)

  sorted.forEach((p, i) => {
    const id = p._id?.toString?.() || String(p.id)
    const count = profileLeafCount(p)
    graph.nodes.push({
      id,
      type: NODE_TYPES.HUB,
      label: p.display_name || p.username || p.handle || id,
      parentId: null,
      familyId: id,
      count,
      hubKind: 'profile',
      familyColor: FAMILY_PALETTE[i % FAMILY_PALETTE.length],
    })
  })

  graph.meta.hubCount = sorted.length
  graph.meta.clusterCount = 0
  graph.meta.capped = profiles.length > maxHubs
  return graph
}

/**
 * L1: ad profiles → ads (flat hub→leaf).
 */
export function buildAdProfileGraph({ profiles = [], maxHubs = 100 } = {}) {
  const graph = emptyNexusGraph({
    preset: 'ads-ad-profiles',
    parentMode: 'ad_profile',
    leafKind: 'ad',
  })

  const sorted = [...profiles]
    .sort((a, b) => adProfileLeafCount(b) - adProfileLeafCount(a))
    .slice(0, maxHubs)

  sorted.forEach((p, i) => {
    const id = p._id?.toString?.() || String(p.id)
    const count = adProfileLeafCount(p)
    const label = p.page_name || p.name || p.advertiser_snapshot?.page_name || id
    graph.nodes.push({
      id,
      type: NODE_TYPES.HUB,
      label,
      parentId: null,
      familyId: id,
      count,
      hubKind: 'ad_profile',
      familyColor: FAMILY_PALETTE[i % FAMILY_PALETTE.length],
    })
  })

  graph.meta.hubCount = sorted.length
  graph.meta.clusterCount = 0
  return graph
}

export function buildDomainAdsGraph({ domains = [], maxHubs = 100 } = {}) {
  const graph = emptyNexusGraph({
    preset: 'ads-domains',
    parentMode: 'domain',
    leafKind: 'ad',
  })

  const sorted = [...domains]
    .sort((a, b) => (b.ad_count || 0) - (a.ad_count || 0))
    .slice(0, maxHubs)

  sorted.forEach((d, i) => {
    const id = d._id?.toString?.() || String(d.id)
    const label = d.host || d.domain || d.domain_name || d.name || id
    const count = d.ad_count ?? 0
    graph.nodes.push({
      id,
      type: NODE_TYPES.HUB,
      label,
      parentId: null,
      familyId: id,
      count,
      hubKind: 'domain',
      familyColor: FAMILY_PALETTE[i % FAMILY_PALETTE.length],
    })
  })

  graph.meta.hubCount = sorted.length
  graph.meta.clusterCount = 0
  return graph
}

/**
 * Fetch ad leaf stubs for ad_profile clusters.
 */
export async function fetchAdLeafStubsForProfiles(adsColl, adProfileIds, {
  cap = DEFAULT_LEAF_CAP_PER_PARENT,
} = {}) {
  const oids = toObjectIds(adProfileIds)
  if (!oids.length) return { clusters: [], colorAxis: { keys: [] } }

  const allColorKeys = new Set()
  const clusters = []

  for (const profileId of oids) {
    const docs = await adsColl
      .find(
        { ad_profile_id: profileId, ...REVIEWED_ADS_FILTER },
        { projection: LEAF_STUB_PROJECTION }
      )
      .limit(cap + 1)
      .toArray()

    const { leaves, colorKeys, omittedCount } = docsToLeafStubs(docs, { leafKind: 'ad', cap })
    colorKeys.forEach((k) => allColorKeys.add(k))
    clusters.push({
      id: profileId.toString(),
      familyId: profileId.toString(),
      leafCount: leaves.length + omittedCount,
      leaves,
      omittedCount,
    })
  }

  const keys = orderColorKeys([...allColorKeys])
  return {
    clusters: clusters.map((c) => ({
      ...c,
      leaves: indexLeafStubs(c.leaves, keys),
    })),
    colorAxis: { keys },
  }
}

/**
 * Fetch ad leaf stubs for domain hubs (via linked_domain_ids).
 */
export async function fetchAdLeafStubsForDomains(adsColl, domainIds, {
  cap = DEFAULT_LEAF_CAP_PER_PARENT,
} = {}) {
  const oids = toObjectIds(domainIds)
  if (!oids.length) return { clusters: [], colorAxis: { keys: [] } }

  const allColorKeys = new Set()
  const clusters = []

  for (const domainId of oids) {
    const docs = await adsColl
      .find(
        { linked_domain_ids: domainId, ...REVIEWED_ADS_FILTER },
        { projection: LEAF_STUB_PROJECTION }
      )
      .limit(cap + 1)
      .toArray()

    const { leaves, colorKeys, omittedCount } = docsToLeafStubs(docs, { leafKind: 'ad', cap })
    colorKeys.forEach((k) => allColorKeys.add(k))
    clusters.push({
      id: domainId.toString(),
      familyId: domainId.toString(),
      leafCount: leaves.length + omittedCount,
      leaves,
      omittedCount,
    })
  }

  const keys = orderColorKeys([...allColorKeys])
  return {
    clusters: clusters.map((c) => ({
      ...c,
      leaves: indexLeafStubs(c.leaves, keys),
    })),
    colorAxis: { keys },
  }
}

/**
 * Fetch ad leaf stubs by explicit Ads._id list (feed manual_ad_ids).
 */
export async function fetchAdLeafStubsByIds(adsColl, adIds, {
  cap = DEFAULT_LEAF_CAP_PER_PARENT,
  clusterId = 'manual-ads',
  familyId = 'manual-ads',
} = {}) {
  const oids = toObjectIds(adIds)
  if (!oids.length) return { clusters: [], colorAxis: { keys: [] } }

  const docs = await adsColl
    .find(
      { _id: { $in: oids }, ...REVIEWED_ADS_FILTER },
      { projection: LEAF_STUB_PROJECTION }
    )
    .limit(cap + 1)
    .toArray()

  const { leaves, colorKeys, omittedCount } = docsToLeafStubs(docs, { leafKind: 'ad', cap })
  const keys = orderColorKeys(colorKeys)
  return {
    clusters: [
      {
        id: clusterId,
        familyId,
        leafCount: leaves.length + omittedCount,
        leaves: indexLeafStubs(leaves, keys),
        omittedCount,
      },
    ],
    colorAxis: { keys },
  }
}

export { LEAF_STUB_PROJECTION, DEFAULT_LEAF_CAP_PER_PARENT, UNKNOWN_COLOR_KEY }
