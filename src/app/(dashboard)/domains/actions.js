'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction } from '@/utils/tracing'
import { requireAuthContext } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { domainsCollection } from '@/utils/mongodb/collections'
import { insertCaseEvent, mapUiClientStatusToV3 } from '@/utils/mongodb/v3-schema'
import { normalizeDomainForUi } from '@/lib/domains/domain-helpers'

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildDomainsMatchQuery(filters = {}) {
  const query = {}
  const andConditions = []

  if (filters.status && filters.status !== 'all') {
    query['workflow.client_status'] = mapUiClientStatusToV3(filters.status)
  }

  if (filters.risk && filters.risk !== 'all') {
    const riskValues = filters.risk === 'medium' ? ['mid', 'medium'] : [filters.risk]
    query['list.risk_rank'] = { $in: riskValues.map((v) => new RegExp(`^${v}$`, 'i')) }
  }

  if (filters.searchText?.trim()) {
    andConditions.push({
      domain_name: { $regex: new RegExp(escapeRegex(filters.searchText.trim()), 'i') },
    })
  }

  if (andConditions.length > 0) {
    query.$and = andConditions
  }

  return query
}

export const getDomains = traceAction('getDomains', async (page = 1, limit = 25, filters = {}, sort = { field: null, direction: 'desc' }) => {
  try {
    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = domainsCollection(db)

    const skip = (page - 1) * limit
    const query = buildDomainsMatchQuery(filters)

    const dir = sort.direction === 'asc' ? 1 : -1
    let sortPipeline
    if (sort.field === 'risk') {
      sortPipeline = { 'list.effective_threat_score': dir, _id: 1 }
    } else if (sort.field === 'occurrences') {
      sortPipeline = { 'list.occurrence_count': dir, _id: 1 }
    } else if (sort.field === 'last_seen') {
      sortPipeline = { 'list.last_seen_at': dir, _id: 1 }
    } else {
      sortPipeline = { 'list.last_seen_at': -1, _id: 1 }
    }

    const facetResult = await collection
      .aggregate([
        { $match: query },
        {
          $facet: {
            data: [{ $sort: sortPipeline }, { $skip: skip }, { $limit: limit }],
            total: [{ $count: 'total' }],
          },
        },
      ])
      .toArray()

    const domains = facetResult?.[0]?.data || []
    const totalCount = facetResult?.[0]?.total?.[0]?.total || 0

    const serialized = await Promise.all(domains.map((d) => normalizeDomainForUi(d)))

    return {
      domains: serialized,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.domains,
      app_action: 'getDomains',
      message: 'getDomains failed',
    }, e)
    console.error('getDomains MongoDB Error:', e)
    return { domains: [], totalCount: 0, page: 1, totalPages: 0 }
  }
})

export const updateDomainClientStatus = traceAction('updateDomainClientStatus', async (domainId, status) => {
  try {
    if (!domainId) return { success: false, error: 'Missing domain ID' }
    const { dbName, clientDetails } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)

    const result = await domainsCollection(db).updateOne(
      { _id: new ObjectId(domainId) },
      {
        $set: {
          'workflow.client_status': mapUiClientStatusToV3(status),
          'system.updated_at': new Date(),
        },
      },
    )

    if (result.matchedCount > 0) {
      await insertCaseEvent(db, {
        entityType: 'domain',
        entityId: domainId,
        eventType: 'Client Status Updated',
        actor: clientDetails.email,
        summary: `Domain client status changed to ${status}`,
        payload: { ui_status: status, v1_status: mapUiClientStatusToV3(status) },
      })
      return { success: true }
    }
    return { success: false, error: 'Domain not found' }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.domains,
      app_action: 'updateDomainClientStatus',
      message: 'updateDomainClientStatus failed',
    }, e)
    return { success: false, error: e.message }
  }
})

export const addDomainClientNote = traceAction('addDomainClientNote', async (domainId, noteText) => {
  try {
    const { dbName, clientDetails } = await requireAuthContext()
    if (!domainId) return { success: false, error: 'Missing domain ID' }

    const client = await clientPromise
    const db = client.db(dbName)
    const newNote = {
      text: noteText,
      email: clientDetails.email,
      created_at: new Date().toISOString(),
    }

    const result = await domainsCollection(db).updateOne(
      { _id: new ObjectId(domainId) },
      {
        $push: { client_notes: newNote },
        $set: { 'system.updated_at': new Date() },
      },
    )

    if (result.matchedCount > 0) {
      await insertCaseEvent(db, {
        entityType: 'domain',
        entityId: domainId,
        eventType: 'Client Note Added',
        actor: clientDetails.email,
        summary: 'Domain client note added',
        payload: { note: newNote },
      })
      return { success: true, note: newNote }
    }
    return { success: false, error: 'Domain not found' }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.domains,
      app_action: 'addDomainClientNote',
      message: 'addDomainClientNote failed',
    }, e)
    return { success: false, error: e.message }
  }
})
