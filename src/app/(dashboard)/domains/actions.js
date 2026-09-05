'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction } from '@/utils/tracing'
import { requireAuthContext } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { domainsCollection } from '@/utils/mongodb/collections'
import { insertCaseEvent, mapUiClientStatusToV3 } from '@/utils/mongodb/v3-schema'
import { normalizeDomainForUi, DOMAIN_LIST_PROJECTION, DOMAIN_DETAIL_PROJECTION } from '@/lib/domains/domain-helpers'
import { toDestinationDomainSummary } from '@/lib/domains/domain-display'

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeDomainNames(names = []) {
  return [...new Set(
    (Array.isArray(names) ? names : [])
      .map((n) => String(n || '').trim().toLowerCase().replace(/^www\./i, ''))
      .filter(Boolean),
  )]
}

function buildDomainsMatchQuery(filters = {}) {
  const query = {
    'workflow.review_status': 'reviewed',
  }
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

  if (filters.alert_date_from || filters.alert_date_to) {
    const dateRange = {}
    if (filters.alert_date_from) dateRange.$gte = new Date(filters.alert_date_from)
    if (filters.alert_date_to) dateRange.$lte = new Date(filters.alert_date_to)
    andConditions.push({ 'list.reviewed_at': dateRange })
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
      sortPipeline = { 'list.effective_threat_score': dir, 'list.reviewed_at': -1, _id: 1 }
    } else if (sort.field === 'occurrences') {
      sortPipeline = { 'list.occurrence_count': dir, _id: 1 }
    } else if (sort.field === 'last_seen') {
      sortPipeline = { 'list.last_seen_at': dir, _id: 1 }
    } else if (sort.field === 'reviewed_at' || sort.field === 'alert_date') {
      sortPipeline = { 'list.reviewed_at': dir, 'list.effective_threat_score': -1, _id: 1 }
    } else {
      sortPipeline = { 'list.reviewed_at': -1, 'list.effective_threat_score': -1, _id: 1 }
    }

    const facetResult = await collection
      .aggregate([
        { $match: query },
        {
          $facet: {
            data: [
              { $sort: sortPipeline },
              { $skip: skip },
              { $limit: limit },
              { $project: DOMAIN_LIST_PROJECTION },
            ],
            total: [{ $count: 'total' }],
          },
        },
      ])
      .toArray()

    const domains = facetResult?.[0]?.data || []
    const totalCount = facetResult?.[0]?.total?.[0]?.total || 0

    const serialized = await Promise.all(
      domains.map((d) => normalizeDomainForUi(d, { mode: 'list' })),
    )

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

/**
 * Look up domains by exact domain_name (case-insensitive, www-stripped).
 * Returns a map keyed by lowercase domain_name → compact destination summary.
 * @param {string[]} names
 * @param {{ includeUnreviewed?: boolean }} [options] — includeUnreviewed only honored for reviewers
 */
export const getDomainsByNames = traceAction('getDomainsByNames', async (names = [], options = {}) => {
  try {
    const { dbName, clientDetails } = await requireAuthContext()
    const normalized = normalizeDomainNames(names)
    if (normalized.length === 0) return {}

    const isReviewer = clientDetails?.permission === 'reviewer'
    const includeUnreviewed = Boolean(options.includeUnreviewed) && isReviewer

    const client = await clientPromise
    const db = client.db(dbName)
    const query = {
      domain_name: {
        $regex: new RegExp(`^(${normalized.map(escapeRegex).join('|')})$`, 'i'),
      },
    }
    if (!includeUnreviewed) {
      query['workflow.review_status'] = 'reviewed'
    }

    const docs = await domainsCollection(db)
      .find(query)
      .project({
        domain_name: 1,
        'list.risk_rank': 1,
        'list.category': 1,
        'list.threat_types': 1,
        'list.registrar': 1,
        'list.hosting_provider': 1,
        'list.hosting_country': 1,
        'discovery.cloak_unlocked': 1,
        'discovery.unlocked_params': 1,
        'discovery.variant_urls': 1,
        'analysis_results.cloak_probe.variants': 1,
        'analysis_results.content_classification.title': 1,
        'analysis_results.content_classification.summary': 1,
        'analysis_results.content_classification.category': 1,
        'analysis_results.whois.registrar': 1,
        'analysis_results.hosting.provider': 1,
        'analysis_results.hosting.country': 1,
        'review_details.reasoning': 1,
        'review_details.threat_types': 1,
        'review_details.legal_codes': 1,
        'review_details.category': 1,
      })
      .toArray()

    const byHost = {}
    for (const doc of docs) {
      const summary = toDestinationDomainSummary(doc)
      if (!summary?.domain_name) continue
      byHost[summary.domain_name.toLowerCase()] = summary
    }
    return byHost
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.domains,
      app_action: 'getDomainsByNames',
      message: 'getDomainsByNames failed',
    }, e)
    console.error('getDomainsByNames Error:', e)
    return {}
  }
})

/** Client domains deep-open — reviewed domains only. */
export const getDomainById = traceAction('getDomainById_client', async (domainId) => {
  try {
    if (!domainId) return null
    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)
    const domain = await domainsCollection(db).findOne({
      _id: new ObjectId(domainId),
      'workflow.review_status': 'reviewed',
    }, { projection: DOMAIN_DETAIL_PROJECTION })
    return normalizeDomainForUi(domain, { mode: 'full' })
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.domains,
      app_action: 'getDomainById_client',
      message: 'getDomainById failed',
    }, e)
    return null
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
