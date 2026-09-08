import { ENTITY_COLLECTIONS, ENTITY_TYPES } from './dims'
import { getEnabledSections } from '@/lib/project-sections'

export async function resolveAnalyticsTypes(db, projectDetails) {
  const sections = getEnabledSections(projectDetails)
  const enabled = ENTITY_TYPES.filter((t) => sections[{ post: 'posts', ad: 'ads', domain: 'domains' }[t]])

  if (!db) return enabled

  let collections
  try {
    collections = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name))
  } catch {
    return enabled
  }

  const present = []
  for (const type of enabled) {
    const name = ENTITY_COLLECTIONS[type]
    if (!collections.has(name)) continue
    try {
      const coll = db.collection(name)
      const estimated = await coll.estimatedDocumentCount()
      if (!estimated) continue
      // Ignore leftover empty-ish collections so posts-only tenants keep a full page.
      const relevant = await coll.countDocuments(
        { 'workflow.review_status': { $in: ['reviewed', 'pending'] } },
        { limit: 1 },
      )
      if (relevant > 0) present.push(type)
    } catch {
      // Collection listed but unreadable — skip rather than starve other types.
    }
  }
  return present.length > 0 ? present : enabled
}
