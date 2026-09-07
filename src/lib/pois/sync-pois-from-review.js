import { ObjectId } from 'mongodb'
import { poisCollection } from '@/utils/mongodb/collections'
import { isPoiMerged, normalizePoiNameKey } from '@/lib/pois/poi-helpers'

function asNameList(values) {
  if (Array.isArray(values)) return values
  if (typeof values === 'string') {
    return values.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return []
}

function uniqueNameEntries(values) {
  const out = []
  const seen = new Set()
  for (const raw of asNameList(values)) {
    const displayName = String(raw || '').trim()
    const name = normalizePoiNameKey(displayName)
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push({ name, displayName })
  }
  return out
}

export function buildSeedPoiDoc(displayName, now = new Date(), postCount = 1) {
  const name = normalizePoiNameKey(displayName)
  return {
    name,
    display_name: String(displayName || '').trim() || name,
    aliases: [],
    tier: 'other',
    summary: '',
    image: { s3_url: null, s3_key: null },
    meta: {
      title: '',
      organization: '',
      state: '',
      notes: '',
    },
    topics: [],
    topic_count: 0,
    post_count: postCount,
    is_shell: false,
    status: 'active',
    merged_into: null,
    merged_into_name: null,
    alias_poi_names: [],
    created_at: now,
    updated_at: now,
  }
}

function idKey(id) {
  return id?.toString?.() ?? String(id)
}

function toObjectId(raw) {
  const key = idKey(raw)
  return ObjectId.isValid(key) ? new ObjectId(key) : raw
}

function isDuplicateKeyError(err) {
  return err?.code === 11000 || err?.codeName === 'DuplicateKey'
}

async function findPoiByName(collection, name) {
  if (!name) return null
  return collection.findOne({ name })
}

/** Alias + parent at most (no nesting). */
async function resolveTargets(collection, poi) {
  if (!poi?._id) return []
  const targets = [poi]
  if (!isPoiMerged(poi)) return targets

  let parent = null
  if (poi.merged_into) {
    parent = await collection.findOne({ _id: poi.merged_into })
  }
  if (!parent && poi.merged_into_name) {
    parent = await findPoiByName(collection, normalizePoiNameKey(poi.merged_into_name))
  }
  if (parent?._id && idKey(parent._id) !== idKey(poi._id)) {
    targets.push(parent)
  }
  return targets
}

async function collectTargetIds(collection, entries) {
  const ids = new Set()
  for (const entry of entries) {
    const poi = await findPoiByName(collection, entry.name)
    if (!poi) continue
    const targets = await resolveTargets(collection, poi)
    for (const target of targets) {
      ids.add(idKey(target._id))
    }
  }
  return ids
}

async function insertMissingPoi(collection, displayName, now) {
  const doc = buildSeedPoiDoc(displayName, now, 1)
  try {
    const result = await collection.insertOne(doc)
    return { doc: { ...doc, _id: result.insertedId }, created: true }
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err
    const found = await findPoiByName(collection, doc.name)
    return { doc: found, created: false }
  }
}

async function incrementPostCount(collection, id, now) {
  await collection.updateOne(
    { _id: toObjectId(id) },
    { $inc: { post_count: 1 }, $set: { updated_at: now } }
  )
}

async function decrementPostCount(collection, id, now) {
  await collection.updateOne(
    { _id: toObjectId(id) },
    [
      {
        $set: {
          post_count: { $max: [0, { $add: [{ $ifNull: ['$post_count', 0] }, -1] }] },
          updated_at: now,
        },
      },
    ]
  )
}

/**
 * Incremental POI upsert from a review's poi_names.
 * Creates missing name-key docs; $inc / clamped -1 on alias + parent ids.
 */
export async function syncPoisFromReview({ db, prevNames = [], nextNames = [] } = {}) {
  if (!db) return { created: 0, incremented: 0, decremented: 0 }

  const collection = poisCollection(db)
  const prev = uniqueNameEntries(prevNames)
  const next = uniqueNameEntries(nextNames)
  if (prev.length === 0 && next.length === 0) {
    return { created: 0, incremented: 0, decremented: 0 }
  }

  const now = new Date()
  const beforeIds = await collectTargetIds(collection, prev)

  const createdIds = new Set()
  let created = 0
  for (const entry of next) {
    const existing = await findPoiByName(collection, entry.name)
    if (existing) continue
    const inserted = await insertMissingPoi(collection, entry.displayName, now)
    if (inserted.created && inserted.doc?._id) {
      created += 1
      createdIds.add(idKey(inserted.doc._id))
    }
  }

  const afterIds = await collectTargetIds(collection, next)
  const toInc = [...afterIds].filter((id) => !beforeIds.has(id) && !createdIds.has(id))
  const toDec = [...beforeIds].filter((id) => !afterIds.has(id))

  let incremented = 0
  for (const id of toInc) {
    await incrementPostCount(collection, id, now)
    incremented += 1
  }

  let decremented = 0
  for (const id of toDec) {
    await decrementPostCount(collection, id, now)
    decremented += 1
  }

  return { created, incremented, decremented }
}
