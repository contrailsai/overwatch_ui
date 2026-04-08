'use server'

import clientPromise from '@/utils/mongodb/client'

export async function get_keywords(project_db, text = "", limit = 50) {
  const client = await clientPromise
  const db = client.db(project_db)
  const collection = db.collection('Keywords')

  const sort = { importance: -1, last_used: -1, keyword: 1 }

  let matchStage = {}
  if (text !== "") {
    matchStage = { keyword: { $regex: text, $options: 'i' } }
  }

  const pipeline = [
    { $match: matchStage },
    {
      $facet: {
        keywords: [
          { $sort: sort },
          { $limit: limit }
        ],
        totalCount: [
          { $count: "count" }
        ]
      }
    }
  ]

  const [result] = await collection.aggregate(pipeline).toArray()

  // Serialize MongoDB-specific types so they can be safely passed to Client Components
  const keywords = result.keywords.map((doc) => ({
    _id: doc._id.toString(),
    keyword: doc.keyword ?? '',
    usage_count: doc.usage_count ?? 0,
    last_used: doc.last_used ? new Date(doc.last_used).toISOString() : null,
    importance: doc.importance ?? 0,
  }))

  const totalCount = result.totalCount[0]?.count ?? 0

  return { keywords, totalCount }
}

export async function add_keyword(project_db, keyword, highImportance = false) {
  if (!keyword || !keyword.trim()) {
    return { error: 'Keyword cannot be empty' }
  }

  const trimmed = keyword.trim().toLowerCase()
  const client = await clientPromise
  const db = client.db(project_db)
  const collection = db.collection('Keywords')

  const existing = await collection.findOne({ keyword: trimmed })
  if (existing) {
    return { error: 'Keyword already exists' }
  }

  // High importance = 2000, Normal = 0
  const importance = highImportance ? 2000 : 0

  await collection.insertOne({
    keyword: trimmed,
    usage_count: 0,
    last_used: null,
    importance: importance,
    created_at: new Date()
  })

  return { success: true }
}

export async function delete_keyword(project_db, keywordId) {
  const { ObjectId } = await import('mongodb')
  const client = await clientPromise
  const db = client.db(project_db)
  const collection = db.collection('Keywords')

  await collection.deleteOne({ _id: new ObjectId(keywordId) })

  return { success: true }
}
