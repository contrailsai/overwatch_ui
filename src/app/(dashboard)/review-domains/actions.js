'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction } from '@/utils/tracing'
import { requireRole } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { domainsCollection } from '@/utils/mongodb/collections'
import { insertCaseEvent } from '@/utils/mongodb/v3-schema'
import { normalizeDomainForUi, riskRankFromScore, DOMAIN_LIST_PROJECTION, DOMAIN_DETAIL_PROJECTION } from '@/lib/domains/domain-helpers'
import { buildEffectiveThreatScoreRange } from '@/utils/mongodb/v3-schema'

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildReviewDomainsMatchQuery(filters = {}) {
  const query = {}
  const andConditions = []

  if (filters.status === 'pending') {
    andConditions.push({ 'workflow.review_status': 'pending' })
  } else if (filters.status === 'reviewed') {
    andConditions.push({ 'workflow.review_status': 'reviewed' })
  }

  const visibility = String(filters.visibility_status || filters.visibility || 'all').toLowerCase()
  if (visibility === 'online' || visibility === 'active' || visibility === 'up') {
    andConditions.push({
      $or: [
        { 'workflow.visibility_status': { $in: ['up', 'online', 'available', 'active'] } },
        { 'workflow.visibility_status': { $exists: false } },
        { 'workflow.visibility_status': null },
      ],
    })
  } else if (visibility === 'down') {
    andConditions.push({ 'workflow.visibility_status': 'down' })
  }

  const searchText = String(filters.search || '').trim()
  if (searchText) {
    andConditions.push({ domain_name: { $regex: new RegExp(escapeRegex(searchText), 'i') } })
  }

  if (filters.risk && filters.risk !== 'all') {
    const riskKey = String(filters.risk).toLowerCase()
    const riskValues = riskKey === 'medium' ? ['mid', 'medium'] : [riskKey]
    const range = buildEffectiveThreatScoreRange(riskKey)
    andConditions.push({
      $or: [
        { 'list.risk_rank': { $in: riskValues.map((v) => new RegExp(`^${v}$`, 'i')) } },
        ...(range ? [{ 'list.effective_threat_score': range }] : []),
      ],
    })
  }

  if (andConditions.length > 0) query.$and = andConditions
  return query
}

function buildReviewDomainsSortPipeline(sort = { field: null, direction: 'desc' }) {
  const dir = sort.direction === 'asc' ? 1 : -1
  if (sort.field === 'risk') {
    return { 'list.effective_threat_score': dir, 'list.first_seen_at': -1, _id: -1 }
  }
  if (sort.field === 'occurrences') {
    return { 'list.occurrence_count': dir, _id: -1 }
  }
  // first_seen_at / sourced / default
  return { 'list.first_seen_at': dir, 'list.effective_threat_score': -1, _id: -1 }
}

export const getDomains = traceAction('getDomains_review', async (page = 1, limit = 20, filters = {}, sort = { field: 'first_seen_at', direction: 'desc' }) => {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = domainsCollection(db)

    const skip = (page - 1) * limit
    const query = buildReviewDomainsMatchQuery(filters)
    const sortPipeline = buildReviewDomainsSortPipeline(sort)

    const pipeline = [
      { $match: query },
      { $sort: sortPipeline },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $skip: skip },
            { $limit: limit },
            { $project: DOMAIN_LIST_PROJECTION },
          ],
        },
      },
    ]

    const [result] = await collection.aggregate(pipeline).toArray()
    const totalCount = result?.metadata?.[0]?.total || 0
    const domains = await Promise.all(
      (result?.data || []).map((d) => normalizeDomainForUi(d, { mode: 'list' })),
    )

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
    const domain = await domainsCollection(db).findOne(
      { _id: new ObjectId(domainId) },
      { projection: DOMAIN_DETAIL_PROJECTION },
    )
    return normalizeDomainForUi(domain, { mode: 'full' })
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_domains,
      app_action: 'getDomainById',
      message: 'review_domains.getDomainById failed',
    }, e)
    return null
  }
})

export const submitDomainReview = traceAction('submitDomainReview', async (_project, _clientDetails, prevState, formData) => {
  try {
    const { dbName, clientDetails } = await requireRole(['reviewer'])
    const domainId = formData.get('mongo_id')
    if (!domainId) return { success: false, error: 'Missing domain ID' }

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = domainsCollection(db)
    const existing = await collection.findOne({ _id: new ObjectId(domainId) })
    if (!existing) return { success: false, error: 'Domain not found' }

    const flags = {}
    const threat_types = []
    const legal_codes = []

    for (const [key, value] of formData.entries()) {
      if (key.startsWith('flag_')) {
        const labelName = key.replace('flag_', '')
        const isActive = value === 'on'
        flags[labelName] = isActive
        if (isActive) threat_types.push(labelName)
      } else if (key.startsWith('legal_code_')) {
        const codeName = key.replace('legal_code_', '')
        if (value === 'on') {
          legal_codes.push({
            code: codeName,
            reasoning: formData.get(`legal_reasoning_${codeName}`) || '',
          })
        }
      }
    }

    const threatScore = parseInt(formData.get('threat_score') || '0', 10)
    const visibilityStatus = formData.get('is_parked') === 'on'
      ? 'parked'
      : (String(formData.get('visibility_status') || 'up').toLowerCase() === 'down' ? 'down' : 'up')

    const review_details = {
      threat_score: threatScore,
      category: existing.list?.category || existing.review_details?.category || 'unknown',
      threat_types: threat_types.length > 0 ? threat_types : ['safe'],
      legal_codes,
      is_aigc: formData.get('is_aigc') === 'on',
      flags,
      poi_names: formData.get('poi_names')
        ? formData.get('poi_names').split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      reasoning: formData.get('reasoning') || '',
      simple_report_description: formData.get('simple_report_description') || null,
      reviewer_comments: formData.get('reviewer_comments') || '',
      face_present: ['on', 'yes', 'true'].includes(String(formData.get('face_present') || '').toLowerCase()),
      name_present: ['on', 'yes', 'true'].includes(String(formData.get('name_present') || '').toLowerCase()),
      is_parked: formData.get('is_parked') === 'on',
      is_placeholder: formData.get('is_parked') === 'on',
      reviewed_at: existing.review_details?.reviewed_at || new Date().toISOString(),
    }

    const riskRank = riskRankFromScore(threatScore)

    await collection.updateOne(
      { _id: new ObjectId(domainId) },
      {
        $set: {
          review_details,
          'workflow.review_status': 'reviewed',
          'workflow.client_status': existing.workflow?.client_status || 'open',
          'workflow.visibility_status': visibilityStatus,
          content_reviewed_by: clientDetails.email,
          'list.review_threat_score': threatScore,
          'list.effective_threat_score': threatScore,
          'list.risk_rank': riskRank,
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

    const updated = await collection.findOne(
      { _id: new ObjectId(domainId) },
      { projection: DOMAIN_DETAIL_PROJECTION },
    )
    return { success: true, domain: await normalizeDomainForUi(updated, { mode: 'full' }) }
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

export const updateDomainVisibility = traceAction('updateDomainVisibility', async (domainId, status) => {
  try {
    const { dbName, clientDetails } = await requireRole(['reviewer'])
    const visibility = String(status || '').toLowerCase() === 'down' ? 'down' : 'up'

    const client = await clientPromise
    const db = client.db(dbName)
    await domainsCollection(db).updateOne(
      { _id: new ObjectId(domainId) },
      {
        $set: {
          'workflow.visibility_status': visibility,
          'system.updated_at': new Date(),
        },
      },
    )

    await insertCaseEvent(db, {
      entityType: 'domain',
      entityId: domainId,
      eventType: 'Visibility Updated',
      actor: clientDetails.email,
      summary: `Domain visibility set to ${visibility}`,
    })

    return { success: true, visibility_status: visibility }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_domains,
      app_action: 'updateDomainVisibility',
      message: 'review_domains.updateDomainVisibility failed',
    }, error)
    return { success: false, error: error.message }
  }
})
