'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction } from '@/utils/tracing'
import { requireRole } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { domainsCollection } from '@/utils/mongodb/collections'
import { insertCaseEvent } from '@/utils/mongodb/v3-schema'
import { normalizeDomainForUi, riskRankFromScore } from '@/lib/domains/domain-helpers'

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildReviewDomainsMatchQuery(filters = {}) {
  const query = {}
  const andConditions = []

  if (filters.status === 'pending') {
    andConditions.push({
      $or: [
        { 'workflow.review_status': 'pending' },
        { 'workflow.review_status': { $exists: false } },
        { 'workflow.review_status': null },
      ],
    })
  } else if (filters.status === 'reviewed') {
    andConditions.push({ 'workflow.review_status': 'reviewed' })
  }

  if (filters.analysisStatus && filters.analysisStatus !== 'all') {
    andConditions.push({ 'workflow.analysis_status': filters.analysisStatus })
  }

  const searchText = String(filters.search || '').trim()
  if (searchText) {
    andConditions.push({ domain_name: { $regex: new RegExp(escapeRegex(searchText), 'i') } })
  }

  if (andConditions.length > 0) query.$and = andConditions
  return query
}

export const getDomains = traceAction('getDomains_review', async (page = 1, limit = 20, filters = {}) => {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = domainsCollection(db)

    const skip = (page - 1) * limit
    const query = buildReviewDomainsMatchQuery(filters)

    const pipeline = [
      { $match: query },
      { $sort: { 'list.last_analyzed_at': -1, 'list.last_seen_at': -1, _id: -1 } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [{ $skip: skip }, { $limit: limit }],
        },
      },
    ]

    const [result] = await collection.aggregate(pipeline).toArray()
    const totalCount = result?.metadata?.[0]?.total || 0
    const domains = await Promise.all((result?.data || []).map((d) => normalizeDomainForUi(d, db)))

    return { domains, totalPages: Math.ceil(totalCount / limit) || 0, totalCount }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_domains,
      app_action: 'getDomains_review',
      message: 'review_domains.getDomains failed',
    }, e)
    console.error('getDomains_review Error:', e)
    return { domains: [], totalPages: 0, totalCount: 0 }
  }
})

export const getDomainById = traceAction('getDomainById', async (domainId) => {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const client = await clientPromise
    const db = client.db(dbName)
    const domain = await domainsCollection(db).findOne({ _id: new ObjectId(domainId) })
    return normalizeDomainForUi(domain, db)
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_domains,
      app_action: 'getDomainById',
      message: 'review_domains.getDomainById failed',
    }, e)
    return null
  }
})

export const submitDomainReview = traceAction('submitDomainReview', async (domainId, reviewPayload) => {
  try {
    const { dbName, clientDetails } = await requireRole(['reviewer'])
    if (!domainId) return { success: false, error: 'Missing domain ID' }

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = domainsCollection(db)
    const existing = await collection.findOne({ _id: new ObjectId(domainId) })
    if (!existing) return { success: false, error: 'Domain not found' }

    const threatScore = Number.isFinite(Number(reviewPayload?.threat_score))
      ? Number(reviewPayload.threat_score)
      : 0

    const review_details = {
      threat_score: threatScore,
      category: reviewPayload?.category || 'unknown',
      threat_types: Array.isArray(reviewPayload?.threat_types) ? reviewPayload.threat_types : [],
      reasoning: reviewPayload?.reasoning || '',
      reviewer_comments: reviewPayload?.reviewer_comments || '',
      is_parked: Boolean(reviewPayload?.is_parked),
      is_placeholder: Boolean(reviewPayload?.is_placeholder),
      poi_names: [],
      legal_codes: [],
      reviewed_at: new Date().toISOString(),
    }

    const riskRank = riskRankFromScore(threatScore)

    await collection.updateOne(
      { _id: new ObjectId(domainId) },
      {
        $set: {
          review_details,
          'workflow.review_status': 'reviewed',
          'workflow.client_status': existing.workflow?.client_status || 'open',
          content_reviewed_by: clientDetails.email,
          'list.review_threat_score': threatScore,
          'list.effective_threat_score': threatScore,
          'list.risk_rank': riskRank,
          'list.category': review_details.category,
          'list.threat_types': review_details.threat_types,
          'list.violation_flags': review_details.threat_types,
          'list.reviewed_at': new Date(),
          'system.updated_at': new Date(),
        },
      },
    )

    await insertCaseEvent(db, {
      entityType: 'domain',
      entityId: domainId,
      eventType: 'Domain Reviewed',
      actor: clientDetails.email,
      summary: 'Domain reviewed by reviewer',
      payload: { review_details },
    })

    const updated = await collection.findOne({ _id: new ObjectId(domainId) })
    return { success: true, domain: await normalizeDomainForUi(updated, db) }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_domains,
      app_action: 'submitDomainReview',
      message: 'review_domains.submitDomainReview failed',
    }, error)
    console.error('submitDomainReview Error:', error)
    return { success: false, error: error.message }
  }
})
