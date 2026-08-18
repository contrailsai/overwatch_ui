/**
 * Domains document helpers for review UI (schema v1).
 * See docs/contracts/domains-schema-v1.md for the full contract.
 */

import { ObjectId } from 'mongodb'
import { caseEventsCollection } from '@/utils/mongodb/collections'
import {
  serializeForClient,
  toIsoDate,
  insertCaseEvent,
  mapV3ClientStatusToUi,
} from '@/utils/mongodb/v3-schema'
import { RISK_THRESHOLDS } from '@/app/(dashboard)/cases/riskBuckets'

export { insertCaseEvent }

export function riskRankFromScore(score) {
  if (score == null || Number.isNaN(Number(score))) return null
  const n = Number(score)
  if (n > RISK_THRESHOLDS.HIGH) return 'high'
  if (n > RISK_THRESHOLDS.MEDIUM) return 'medium'
  if (n > RISK_THRESHOLDS.LOW) return 'low'
  return 'safe'
}

async function fetchDomainCaseEvents(db, domainId) {
  const events = await caseEventsCollection(db)
    .find({
      entity_type: 'domain',
      entity_id: new ObjectId(domainId),
    })
    .sort({ occurred_at: -1 })
    .toArray()

  return events.map((event) => ({
    updated_at: toIsoDate(event.occurred_at),
    updated_by: event.actor || event.payload?.updated_by || null,
    changes_summary: event.summary || event.event_type || '',
    event_type: event.event_type,
    payload: serializeForClient(event.payload) ?? null,
  }))
}

export async function normalizeDomainForUi(domain, db = null) {
  if (!domain) return null

  let updateHistory = []
  if (db && domain._id) {
    try {
      updateHistory = await fetchDomainCaseEvents(db, domain._id.toString())
    } catch {
      updateHistory = []
    }
  }

  const discovery = domain.discovery || {}
  const occurrences = Array.isArray(discovery.occurrences) ? discovery.occurrences : []

  return {
    _id: domain._id.toString(),
    schema_version: domain.schema_version ?? 1,
    domain_name: domain.domain_name || null,
    discovery: {
      first_entity_type: discovery.first_entity_type || null,
      first_entity_id: discovery.first_entity_id ? discovery.first_entity_id.toString() : null,
      first_seen_url: discovery.first_seen_url || null,
      occurrences: occurrences.map((o) => ({
        entity_type: o?.entity_type || null,
        entity_id: o?.entity_id ? o.entity_id.toString() : null,
        url: o?.url || null,
        seen_at: toIsoDate(o?.seen_at),
      })),
    },
    workflow: serializeForClient(domain.workflow) ?? null,
    list: serializeForClient(domain.list) ?? null,
    client_status: mapV3ClientStatusToUi(domain?.workflow?.client_status),
    analysis_results: serializeForClient(domain.analysis_results) ?? {},
    review_details: serializeForClient(domain.review_details) ?? null,
    analysis_correction_request: serializeForClient(domain.analysis_correction_request) ?? null,
    takedown: serializeForClient(domain.takedown) ?? null,
    client_notes: serializeForClient(domain.client_notes) ?? [],
    ingestion: serializeForClient(domain.ingestion) ?? null,
    system: serializeForClient(domain.system) ?? null,
    content_reviewed_by: domain.content_reviewed_by || null,
    update_history: updateHistory,
    // convenience aliases for list UI
    first_seen_at: toIsoDate(domain?.list?.first_seen_at ?? domain?.system?.created_at),
    last_seen_at: toIsoDate(domain?.list?.last_seen_at),
    last_analyzed_at: toIsoDate(domain?.list?.last_analyzed_at),
    reviewed_at: toIsoDate(domain?.list?.reviewed_at ?? domain?.review_details?.reviewed_at),
    category: domain?.list?.category ?? domain?.review_details?.category ?? null,
    occurrence_count: domain?.list?.occurrence_count ?? occurrences.length,
    score: domain?.list?.effective_threat_score ?? domain?.review_details?.threat_score ?? null,
    risk_rank: domain?.list?.risk_rank ?? null,
    analysis_status: domain?.workflow?.analysis_status ?? 'pending',
  }
}
