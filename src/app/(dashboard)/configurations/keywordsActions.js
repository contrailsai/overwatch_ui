'use server'

import clientPromise from '@/utils/mongodb/client'
import { requireRole } from '@/utils/auth-context'
import { traceAction, runInSpan } from '@/utils/tracing'

export const get_keywords = traceAction('configurations.get_keywords', async (_project_db, text = '', limit = 50) => {
  const { dbName } = await requireRole(['client-admin', 'reviewer'])
  const client = await clientPromise
  const db = client.db(dbName)
  const collection = db.collection('Keywords')

  const sort = { importance: -1, last_used: -1, keyword: 1 }

  const matchStage = {}
  if (text !== '') {
    matchStage.keyword = { $regex: text, $options: 'i' }
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
          { $count: 'count' }
        ]
      }
    }
  ]

  const [result] = await runInSpan(
    'configurations.get_keywords.mongo_aggregate',
    async () => collection.aggregate(pipeline).toArray(),
    { 'app.span_type': 'mongo_query', 'app.query_kind': 'data_and_count' }
  )

  const keywords = (result?.keywords || []).map((doc) => ({
    _id: doc._id.toString(),
    keyword: doc.keyword ?? '',
    usage_count: doc.usage_count ?? 0,
    last_used: doc.last_used ? new Date(doc.last_used).toISOString() : null,
    importance: doc.importance ?? 0,
  }))

  const totalCount = result?.totalCount?.[0]?.count ?? 0

  return { keywords, totalCount }
})

export const add_keyword = traceAction('configurations.add_keyword', async (_project_db, keyword, highImportance = false) => {
  const { dbName } = await requireRole(['client-admin', 'reviewer'])
  if (!keyword || !keyword.trim()) {
    return { error: 'Keyword cannot be empty' }
  }

  const trimmed = keyword.trim().toLowerCase()
  const client = await clientPromise
  const db = client.db(dbName)
  const collection = db.collection('Keywords')

  const existing = await runInSpan(
    'configurations.add_keyword.mongo_findOne',
    async () => collection.findOne({ keyword: trimmed }),
    { 'app.span_type': 'mongo_query' }
  )
  if (existing) {
    return { error: 'Keyword already exists' }
  }

  const importance = highImportance ? 2000 : 0

  await runInSpan(
    'configurations.add_keyword.mongo_insert',
    async () =>
      collection.insertOne({
        keyword: trimmed,
        usage_count: 0,
        last_used: null,
        importance: importance,
        created_at: new Date()
      }),
    { 'app.span_type': 'mongo_query' }
  )

  return { success: true }
})

export const delete_keyword = traceAction('configurations.delete_keyword', async (_project_db, keywordId) => {
  const { dbName } = await requireRole(['client-admin', 'reviewer'])
  const { ObjectId } = await import('mongodb')
  const client = await clientPromise
  const db = client.db(dbName)
  const collection = db.collection('Keywords')

  await runInSpan(
    'configurations.delete_keyword.mongo_delete',
    async () => collection.deleteOne({ _id: new ObjectId(keywordId) }),
    { 'app.span_type': 'mongo_query' }
  )

  return { success: true }
})
