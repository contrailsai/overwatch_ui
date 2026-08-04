/**
 * Build POI → Topics graph payload for the feeds nexus visualization.
 * Reads live data from MongoDB `topics` and `pois` collections.
 */

import { ObjectId } from 'mongodb'
import { serializeForClient } from '@/utils/mongodb/v3-schema'

function poiNodeId(poi) {
  return poi.display_name || poi.name || null
}

function topicPostCount(topic) {
  if (typeof topic.post_count === 'number') return topic.post_count
  return 0
}

function topicKind(topic) {
  const raw = String(topic.type || topic.status || 'active').toLowerCase()
  return raw === 'passive' ? 'passive' : 'active'
}

function isObjectId(value) {
  return value instanceof ObjectId || value?._bsontype === 'ObjectId'
}

/** Resolve parent_topic_id (string topic_id or ObjectId ref) to a graph node id. */
function resolveTopicRef(ref, topicIdByMongoId, topicIdSet) {
  if (ref == null) return null
  if (isObjectId(ref)) {
    return topicIdByMongoId.get(ref.toString()) ?? null
  }
  const id = String(ref).trim()
  if (!id) return null
  if (topicIdSet.has(id)) return id
  return topicIdByMongoId.get(id) ?? id
}

function buildTopicLookup(topics) {
  const topicIdByMongoId = new Map()
  const topicIdSet = new Set()
  for (const topic of topics) {
    if (topic._id && topic.topic_id) {
      topicIdByMongoId.set(topic._id.toString(), topic.topic_id)
    }
    if (topic.topic_id) topicIdSet.add(String(topic.topic_id))
  }
  return { topicIdByMongoId, topicIdSet }
}

export function buildPoiTopicsGraph({ topics = [], pois = [] } = {}) {
  const { topicIdByMongoId, topicIdSet } = buildTopicLookup(topics)
  const nodes = []
  const links = []
  const poiIds = new Set()
  const orgPoiIds = new Set()

  for (const poi of pois) {
    const id = poiNodeId(poi)
    if (!id || poiIds.has(id)) continue
    poiIds.add(id)
    orgPoiIds.add(id)
    nodes.push({
      id,
      type: 'poi',
      postCount: poi.post_count ?? 0,
      orgPoi: true,
    })
  }

  let activeTopicCount = 0
  let passiveTopicCount = 0

  for (const topic of topics) {
    const topicId = String(topic.topic_id)
    if (!topicId) continue

    const topicType = topicKind(topic)
    if (topicType === 'passive') passiveTopicCount += 1
    else activeTopicCount += 1

    const parentTopicId = resolveTopicRef(topic.parent_topic_id, topicIdByMongoId, topicIdSet)

    nodes.push({
      id: topicId,
      type: 'topic',
      title: topic.title || topicId,
      category: topic.category || 'other',
      topicType,
      postCount: topicPostCount(topic),
      parentTopicId,
    })

    const poiNames = Array.isArray(topic.poi_names) ? topic.poi_names : []
    for (const poiName of poiNames) {
      const name = String(poiName || '').trim()
      if (!name) continue
      if (!poiIds.has(name)) {
        poiIds.add(name)
        nodes.push({ id: name, type: 'poi', postCount: 0, orgPoi: false })
      }
      links.push({
        source: name,
        target: topicId,
        type: 'poi_topic',
        weight: 1,
      })
    }

    if (topicType === 'passive' && parentTopicId) {
      links.push({
        source: topicId,
        target: parentTopicId,
        type: 'topic_parent',
      })
    }
  }

  const poiNodes = nodes.filter((n) => n.type === 'poi')
  const primary = poiNodes.filter((n) => n.orgPoi).map((p) => p.id)
  const primarySet = new Set(primary)
  const secondary = poiNodes.filter((p) => !primarySet.has(p.id)).map((p) => p.id)

  return serializeForClient({
    meta: {
      graphType: 'poi-topics',
      generatedAt: new Date().toISOString(),
      poiCount: poiNodes.length,
      topicCount: topics.length,
      activeTopicCount,
      passiveTopicCount,
      postCount: 0,
      totalLinks: links.length,
    },
    poiConfig: { primary, secondary, selected: primary },
    nodes,
    links,
    postsDetail: {},
  })
}
