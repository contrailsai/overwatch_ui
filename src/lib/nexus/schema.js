/**
 * Canonical Nexus graph contract helpers (browser-safe — no mongodb).
 * Canvas engine imports NODE_TYPES from ./constants, not from here.
 *
 * Topology only — no body/media/S3:
 * {
 *   meta: { preset, parentMode, leafKind, colorAxis },
 *   nodes: [{ id, type: 'hub'|'cluster'|'leaf', label?, parentId, familyId, colorKeys?, leafKind?, count? }],
 *   links: [{ source, target, type }],
 *   clusters?: [{ id, familyId, leafCount, leaves: [{ id, k, t, leafKind? }], omittedCount? }],
 *   aggregates?: { byFamily: { [id]: { leafCount, colorCounts } } },
 *   colorAxis?: { keys: string[] },
 *   poiConfig?: { primary, secondary, selected } // feeds-specific optional
 * }
 */
import {
  FAMILY_PALETTE,
  UNKNOWN_COLOR_KEY,
  buildColorAxis,
  darkenHex,
  hexToRgba,
  orderColorKeys,
  primaryColorKey,
} from './colors'
import { DEFAULT_LEAF_CAP_PER_PARENT, NODE_TYPES } from './constants'

export { DEFAULT_LEAF_CAP_PER_PARENT, NODE_TYPES }

export function emptyNexusGraph(meta = {}) {
  return {
    meta: {
      preset: meta.preset || 'generic',
      parentMode: meta.parentMode || null,
      leafKind: meta.leafKind || 'post',
      colorAxis: meta.colorAxis || 'violation',
      generatedAt: new Date().toISOString(),
      ...meta,
    },
    nodes: [],
    links: [],
    clusters: [],
    aggregates: { byFamily: {} },
    colorAxis: { keys: [] },
  }
}

/**
 * Convert legacy feeds POI→Topics payload into the canonical Nexus contract (L1 only).
 * Leaves are omitted; load via L2 stubs.
 */
export function fromPoiTopicsGraph(poiTopicsGraph) {
  const src = poiTopicsGraph || {}
  const nodes = []
  const links = []
  const byFamily = {}

  for (const n of src.nodes || []) {
    if (n.type === 'poi') {
      nodes.push({
        id: String(n.id),
        type: NODE_TYPES.HUB,
        label: String(n.id),
        parentId: null,
        familyId: String(n.id),
        count: n.postCount ?? 0,
        orgPoi: Boolean(n.orgPoi),
        hubKind: 'poi',
      })
      byFamily[String(n.id)] = { leafCount: n.postCount ?? 0, colorCounts: {} }
    } else if (n.type === 'topic') {
      const poiParent = (src.links || []).find(
        (l) => l.type === 'poi_topic' && String(l.target) === String(n.id)
      )
      const familyId = poiParent ? String(poiParent.source) : n.parentTopicId || String(n.id)
      nodes.push({
        id: String(n.id),
        type: NODE_TYPES.CLUSTER,
        label: n.title || String(n.id),
        parentId: poiParent ? String(poiParent.source) : n.parentTopicId || null,
        familyId: String(familyId),
        count: n.postCount ?? 0,
        topicType: n.topicType || 'active',
        category: n.category || 'other',
        parentTopicId: n.parentTopicId || null,
        clusterKind: 'topic',
      })
    }
  }

  for (const l of src.links || []) {
    links.push({
      source: String(l.source),
      target: String(l.target),
      type: l.type === 'topic_parent' ? 'cluster_parent' : 'hub_cluster',
    })
  }

  // Assign family colors by hub order
  const hubs = nodes.filter((n) => n.type === NODE_TYPES.HUB)
  hubs.forEach((h, i) => {
    h.familyColor = FAMILY_PALETTE[i % FAMILY_PALETTE.length]
  })
  const colorByFamily = new Map(hubs.map((h) => [h.familyId, h.familyColor]))
  for (const n of nodes) {
    if (n.type === NODE_TYPES.CLUSTER) {
      n.familyColor = colorByFamily.get(n.familyId) || FAMILY_PALETTE[0]
    }
  }

  // Plain JSON only — callers that still hold Mongo values must serializeForClient upstream.
  return {
    meta: {
      preset: 'feeds-poi-topics',
      parentMode: 'poi',
      leafKind: 'post',
      colorAxis: 'violation',
      generatedAt: src.meta?.generatedAt || new Date().toISOString(),
      hubCount: hubs.length,
      clusterCount: nodes.filter((n) => n.type === NODE_TYPES.CLUSTER).length,
      leafCount: src.meta?.postCount ?? 0,
      activeTopicCount: src.meta?.activeTopicCount,
      passiveTopicCount: src.meta?.passiveTopicCount,
      graphType: 'nexus',
    },
    nodes,
    links,
    clusters: [],
    aggregates: { byFamily },
    colorAxis: { keys: [] },
    poiConfig: src.poiConfig || null,
  }
}

/**
 * Expand nested L2 cluster stubs into leaf nodes on a graph copy.
 * Does not mutate the original structural graph.
 */
export function mergeLeafStubs(graph, stubPayload) {
  const next = {
    ...graph,
    nodes: [...(graph.nodes || [])],
    links: [...(graph.links || [])],
    clusters: stubPayload?.clusters || graph.clusters || [],
  }

  const axisKeys = stubPayload?.colorAxis?.keys || graph.colorAxis?.keys || []
  const { keys, indexByKey } = buildColorAxis(axisKeys)
  next.colorAxis = { keys }

  // Drop existing leaves before merge
  next.nodes = next.nodes.filter((n) => n.type !== NODE_TYPES.LEAF)
  next.links = next.links.filter((l) => l.type !== 'cluster_leaf' && l.type !== 'hub_leaf')

  const leafNodes = []
  const leafLinks = []
  const byFamily = { ...(graph.aggregates?.byFamily || {}) }

  for (const cluster of next.clusters) {
    const parentId = cluster.id
    const familyId = cluster.familyId || parentId
    const leaves = Array.isArray(cluster.leaves) ? cluster.leaves : []
    if (!byFamily[familyId]) byFamily[familyId] = { leafCount: 0, colorCounts: {} }

    for (const leaf of leaves) {
      const colorKey =
        leaf.k != null && keys[leaf.k] != null
          ? keys[leaf.k]
          : primaryColorKey(leaf.colorKeys) || UNKNOWN_COLOR_KEY
      const id = String(leaf.id)
      leafNodes.push({
        id,
        type: NODE_TYPES.LEAF,
        label: leaf.label || id,
        parentId,
        familyId,
        colorKey,
        colorKeys: leaf.colorKeys || (colorKey !== UNKNOWN_COLOR_KEY ? [colorKey] : []),
        colorIndex: indexByKey.has(colorKey) ? indexByKey.get(colorKey) : -1,
        leafKind: leaf.leafKind || graph.meta?.leafKind || 'post',
        t: leaf.t ?? null,
      })
      leafLinks.push({ source: parentId, target: id, type: 'cluster_leaf' })
      byFamily[familyId].leafCount += 1
      byFamily[familyId].colorCounts[colorKey] =
        (byFamily[familyId].colorCounts[colorKey] || 0) + 1
    }
  }

  next.nodes = [...next.nodes, ...leafNodes]
  next.links = [...next.links, ...leafLinks]
  next.aggregates = { byFamily }
  next.meta = {
    ...next.meta,
    leafCount: leafNodes.length,
    omittedLeafCount: (stubPayload?.clusters || []).reduce(
      (sum, c) => sum + (c.omittedCount || 0),
      0
    ),
  }
  return next
}

export function collectColorKeysFromLeaves(leaves = []) {
  const keys = []
  for (const leaf of leaves) {
    if (Array.isArray(leaf.colorKeys)) keys.push(...leaf.colorKeys)
    else if (leaf.colorKey) keys.push(leaf.colorKey)
  }
  return orderColorKeys(keys)
}

export function strokeForFamily(familyColor) {
  return {
    fill: familyColor,
    stroke: darkenHex(familyColor, 0.22),
    link: hexToRgba(familyColor, 0.28),
  }
}
