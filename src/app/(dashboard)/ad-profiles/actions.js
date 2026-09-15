'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction, recordClickMetric } from '@/utils/tracing'
import { requireAuthContext } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { adProfilesCollection, adsCollection, domainsCollection } from '@/utils/mongodb/collections'
import {
  insertCaseEvent,
  mapUiClientStatusToV3,
} from '@/utils/mongodb/v3-schema'
import {
  normalizeAdProfileForUi,
  normalizeAdForUi,
  getFirstAdMediaS3Url,
} from '@/lib/ads/ad-helpers'
import {
  CLIENT_VISIBLE_AD_PROFILE_FILTER,
  REVIEWED_ADS_FILTER,
  REVIEWED_AD_PROFILES_FILTER,
} from '@/lib/ads/reviewed-ad-filter'
import { getAdDestinationLinks, getAdDisplayPreview, getAdDisplayTitle } from '@/lib/ads/ad-display'
import { REVIEWED_DOMAINS_FILTER } from '@/lib/domains/domain-helpers'
import { toDestinationDomainSummary } from '@/lib/domains/domain-display'
import { resolvePoiDateRange } from '@/lib/pois/poi-helpers'
import { getDomainsByNames } from '@/app/(dashboard)/domains/actions'

const AD_PROFILES_TRACE = { loki_stream: LOKI_STREAMS.ad_profiles }

export const trackClientClick = traceAction(
  'trackClientClick',
  async (buttonName, attributes = {}) => {
    recordClickMetric(buttonName, attributes)
  },
  AD_PROFILES_TRACE,
)

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseObjectId(id) {
  if (!id) return null
  if (id instanceof ObjectId) return id
  const s = String(id)
  if (!ObjectId.isValid(s)) return null
  return new ObjectId(s)
}

const AD_DATE_EXPR = {
  $ifNull: ['$list.start_date', { $ifNull: ['$list.posted_at', '$list.sourced_at'] }],
}

const DOMAIN_DESTINATION_PROJECTION = {
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
  'review_details.client_visible_variant_keys': 1,
}

/** Reviewed ads for an advertiser, optionally constrained to a date range. */
function buildAdProfileAdMatch(profileOid, { from = null, to = null, allAds = false } = {}) {
  const match = { ad_profile_id: profileOid }
  if (!allAds) {
    match.$or = REVIEWED_ADS_FILTER.$or
  }
  if (from || to) {
    const bounds = []
    if (from) bounds.push({ $gte: [AD_DATE_EXPR, from] })
    if (to) bounds.push({ $lte: [AD_DATE_EXPR, to] })
    match.$expr = { $and: bounds }
  }
  return match
}

function normalizeHost(host) {
  return String(host || '').trim().toLowerCase().replace(/^www\./i, '')
}

/** Order ad profile IDs for report export (reviewed_at → last_active → _id). */
export const orderAdProfileIdsForReport = traceAction('orderAdProfileIdsForReport', async (adProfileIds = []) => {
  try {
    if (!adProfileIds?.length) return []

    const { dbName } = await requireAuthContext()
    const objectIds = adProfileIds
      .filter((id) => id != null && String(id) !== '')
      .map((id) => {
        try {
          return new ObjectId(id)
        } catch {
          return null
        }
      })
      .filter(Boolean)

    if (objectIds.length === 0) return []

    const client = await clientPromise
    const collection = adProfilesCollection(client.db(dbName))

    const docs = await collection.aggregate([
      { $match: { _id: { $in: objectIds }, ...REVIEWED_AD_PROFILES_FILTER } },
      { $sort: { 'workflow.reviewed_at': -1, 'list.last_active_at': -1, _id: 1 } },
      { $project: { _id: 1 } },
    ]).toArray()

    return docs.map((d) => d._id.toString())
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.ad_profiles,
      app_action: 'orderAdProfileIdsForReport',
      message: 'orderAdProfileIdsForReport failed',
    }, e)
    console.error('orderAdProfileIdsForReport Error:', e)
    return []
  }
}, AD_PROFILES_TRACE)

export const getAdProfiles = traceAction('getAdProfiles', async (page = 1, limit = 20, filters = {}, sort = { field: null, direction: 'desc' }) => {
  try {
    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = adProfilesCollection(db)

    const skip = (page - 1) * limit

    const query = {
      $or: [...CLIENT_VISIBLE_AD_PROFILE_FILTER.$or],
    }

    if (filters.platform && filters.platform !== 'all') {
      query.platform = { $regex: new RegExp(`^${filters.platform}$`, 'i') }
    }

    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'To Be Reviewed') {
        query.$and = [
          ...(query.$and || []),
          {
            $or: [
              { 'workflow.client_status': { $in: ['open', 'alerted'] } },
              { 'workflow.client_status': { $exists: false } },
              { 'workflow.client_status': null },
            ],
          },
        ]
      } else {
        query['workflow.client_status'] = mapUiClientStatusToV3(filters.status)
      }
    }

    if (filters.searchText?.trim()) {
      const searchRegex = new RegExp(escapeRegex(filters.searchText.trim()), 'i')
      const searchConditions = [
        { profile_url: { $regex: searchRegex } },
        { page_name: { $regex: searchRegex } },
        { display_name: { $regex: searchRegex } },
        { platform_page_id: { $regex: searchRegex } },
      ]
      if (query.$or) {
        query.$and = [
          ...(query.$and || []),
          { $or: query.$or },
          { $or: searchConditions },
        ]
        delete query.$or
      } else {
        query.$or = searchConditions
      }
    }

    if (filters.publish_date_from || filters.publish_date_to) {
      const dateRange = {}
      if (filters.publish_date_from) dateRange.$gte = new Date(filters.publish_date_from)
      if (filters.publish_date_to) dateRange.$lte = new Date(filters.publish_date_to)
      const dateConditions = [
        { 'list.last_active_at': dateRange },
        { 'workflow.reviewed_at': dateRange },
        { 'review_details.reviewed_at': dateRange },
      ]
      if (query.$and) {
        query.$and.push({ $or: dateConditions })
      } else if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: dateConditions }]
        delete query.$or
      } else {
        query.$or = dateConditions
      }
    }

    if (filters.risk && filters.risk !== 'all') {
      const riskValues = filters.risk === 'medium' ? ['mid', 'medium'] : [filters.risk]
      query['list.risk_rank'] = { $in: riskValues.map((v) => new RegExp(`^${v}$`, 'i')) }
    }

    const dir = sort.direction === 'asc' ? 1 : -1
    let sortPipeline
    if (sort.field === 'risk') {
      sortPipeline = { 'list.max_threat_score': dir, 'workflow.reviewed_at': -1, _id: 1 }
    } else if (sort.field === 'ads') {
      sortPipeline = { 'list.ad_count': dir, 'workflow.reviewed_at': -1, _id: 1 }
    } else if (sort.field === 'last_active') {
      sortPipeline = { 'list.last_active_at': dir, 'workflow.reviewed_at': -1, _id: 1 }
    } else {
      sortPipeline = { 'workflow.reviewed_at': -1, 'list.last_active_at': -1, _id: 1 }
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
            ],
            total: [{ $count: 'total' }],
          },
        },
      ])
      .toArray()

    const profiles = facetResult?.[0]?.data || []
    const totalCount = facetResult?.[0]?.total?.[0]?.total || 0

    const serialized = await Promise.all(profiles.map((p) => normalizeAdProfileForUi(p)))

    return {
      profiles: serialized,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.ad_profiles,
      app_action: 'getAdProfiles',
      message: 'getAdProfiles failed',
    }, e)
    console.error('getAdProfiles MongoDB Error:', e)
    return { profiles: [], totalCount: 0, page: 1, totalPages: 0 }
  }
})

export const getAdProfileAds = traceAction('getAdProfileAds', async (profileId) => {
  try {
    if (!profileId) return []
    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)

    // Client list: reviewed ads only (no unreviewed fallback)
    const ads = await adsCollection(db)
      .find({
        ad_profile_id: new ObjectId(profileId),
        ...REVIEWED_ADS_FILTER,
      })
      .sort({ 'list.reviewed_at': -1, 'list.sourced_at': -1 })
      .toArray()

    return Promise.all(ads.map((ad) => normalizeAdForUi(ad, db)))
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.ad_profiles,
      app_action: 'getAdProfileAds',
      message: 'getAdProfileAds failed',
    }, e)
    console.error('getAdProfileAds MongoDB Error:', e)
    return []
  }
})

export const getAdProfileById = traceAction('getAdProfileById', async (profileId) => {
  try {
    const oid = parseObjectId(profileId)
    if (!oid) return { profile: null, error: 'Invalid profile id' }

    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)
    const doc = await adProfilesCollection(db).findOne({
      _id: oid,
      ...CLIENT_VISIBLE_AD_PROFILE_FILTER,
    })
    if (!doc) return { profile: null, error: 'Ad profile not found' }

    return { profile: await normalizeAdProfileForUi(doc) }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.ad_profiles,
      app_action: 'getAdProfileById',
      message: 'getAdProfileById failed',
    }, e)
    return { profile: null, error: e.message }
  }
})

export const getAdProfileAnalytics = traceAction('getAdProfileAnalytics', async (profileId, range = {}) => {
  try {
    const oid = parseObjectId(profileId)
    if (!oid) {
      return { error: 'Invalid profile id', riskRanks: [], violations: [], timeline: [], totalInRange: 0 }
    }

    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)
    const { from, to, preset } = resolvePoiDateRange(range)
    const match = buildAdProfileAdMatch(oid, { from, to })
    const ads = adsCollection(db)

    const [riskRows, violationRows, timelineRows, totalInRange] = await Promise.all([
      ads
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: {
                $toLower: {
                  $ifNull: ['$list.risk_rank', 'unknown'],
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ])
        .toArray(),
      ads
        .aggregate([
          { $match: match },
          {
            $project: {
              threats: {
                $cond: [
                  { $gt: [{ $size: { $ifNull: ['$list.threat_types', []] } }, 0] },
                  '$list.threat_types',
                  { $ifNull: ['$review_details.threat_types', []] },
                ],
              },
            },
          },
          { $unwind: { path: '$threats', preserveNullAndEmptyArrays: false } },
          {
            $group: {
              _id: { $toLower: { $trim: { input: { $toString: '$threats' } } } },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 12 },
        ])
        .toArray(),
      ads
        .aggregate([
          { $match: match },
          {
            $project: {
              day: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: AD_DATE_EXPR,
                },
              },
            },
          },
          { $match: { day: { $ne: null } } },
          { $group: { _id: '$day', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      ads.countDocuments(match),
    ])

    return {
      preset,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      totalInRange,
      riskRanks: riskRows.map((r) => ({
        rank: r._id === 'mid' ? 'medium' : (r._id || 'unknown'),
        count: r.count,
      })),
      violations: violationRows.map((r) => ({
        type: r._id || 'unknown',
        count: r.count,
      })),
      timeline: timelineRows.map((r) => ({
        date: r._id,
        count: r.count,
      })),
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.ad_profiles,
      app_action: 'getAdProfileAnalytics',
      message: 'getAdProfileAnalytics failed',
    }, e)
    return { error: e.message, riskRanks: [], violations: [], timeline: [], totalInRange: 0 }
  }
})

export const getAdProfileRecentAds = traceAction('getAdProfileRecentAds', async (profileId, range = {}, limit = 24) => {
  try {
    const oid = parseObjectId(profileId)
    if (!oid) return { ads: [], error: 'Invalid profile id' }

    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)
    const { from, to } = resolvePoiDateRange(range)
    const match = buildAdProfileAdMatch(oid, { from, to })
    const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 48)

    const docs = await adsCollection(db)
      .find(match)
      .sort({ 'list.start_date': -1, 'list.posted_at': -1, 'list.sourced_at': -1 })
      .limit(safeLimit)
      .toArray()

    const ads = await Promise.all(
      docs.map(async (ad) => {
        const s3Url = getFirstAdMediaS3Url(ad)
        const signedImageUrl = s3Url ? await getSignedImageUrl(s3Url) : null
        return {
          _id: ad._id?.toString(),
          platform: ad.platform ? String(ad.platform).toLowerCase() : 'meta',
          caption: getAdDisplayPreview(ad) || '',
          title: getAdDisplayTitle(ad),
          signedImageUrl,
          original_url: ad.original_url || null,
          sourced_at: ad.list?.sourced_at ? new Date(ad.list.sourced_at).toISOString() : null,
          posted_at: ad.list?.posted_at
            ? new Date(ad.list.posted_at).toISOString()
            : (ad.list?.start_date ? new Date(ad.list.start_date).toISOString() : null),
          threat_types: ad.list?.threat_types || ad.review_details?.threat_types || [],
          effective_threat_score:
            ad.list?.effective_threat_score
            ?? ad.list?.review_threat_score
            ?? ad.list?.ai_threat_score
            ?? ad.review_details?.threat_score
            ?? null,
        }
      }),
    )

    return { ads }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.ad_profiles,
      app_action: 'getAdProfileRecentAds',
      message: 'getAdProfileRecentAds failed',
    }, e)
    return { ads: [], error: e.message }
  }
})

function bumpAdSet(map, key, adId) {
  if (!key || !adId) return
  const existing = map.get(key)
  if (existing) existing.add(adId)
  else map.set(key, new Set([adId]))
}

export const getAdProfileLinkedDomains = traceAction('getAdProfileLinkedDomains', async (profileId, range = {}, options = {}) => {
  try {
    const oid = parseObjectId(profileId)
    if (!oid) return { domains: [], error: 'Invalid profile id' }

    const { dbName, clientDetails } = await requireAuthContext()
    const isReviewer = clientDetails?.permission === 'reviewer'
    const allAds = Boolean(options.allAds) && isReviewer
    const includeUnreviewed = Boolean(options.includeUnreviewed) && isReviewer
    const client = await clientPromise
    const db = client.db(dbName)
    const { from, to } = resolvePoiDateRange(range)
    const match = buildAdProfileAdMatch(oid, { from, to, allAds })

    const ads = await adsCollection(db)
      .find(match)
      .project({ linked_domain_ids: 1, content: 1, source_payload: 1 })
      .toArray()

    const domainIdAds = new Map()
    const hostAds = new Map()

    for (const ad of ads) {
      const adId = String(ad._id)
      const rawIds = Array.isArray(ad.linked_domain_ids) ? ad.linked_domain_ids : []
      for (const raw of rawIds) {
        const parsed = parseObjectId(raw)
        if (!parsed) continue
        bumpAdSet(domainIdAds, parsed.toString(), adId)
      }
      for (const link of getAdDestinationLinks(ad)) {
        const host = normalizeHost(link.host)
        if (!host) continue
        bumpAdSet(hostAds, host, adId)
      }
    }

    const byName = new Map()
    const adsByName = new Map()
    const domainFilter = includeUnreviewed ? {} : REVIEWED_DOMAINS_FILTER

    const objectIds = [...domainIdAds.keys()].map((id) => new ObjectId(id))
    if (objectIds.length > 0) {
      const docs = await domainsCollection(db)
        .find({ _id: { $in: objectIds }, ...domainFilter })
        .project(DOMAIN_DESTINATION_PROJECTION)
        .toArray()
      for (const doc of docs) {
        const summary = toDestinationDomainSummary(doc)
        if (!summary?.domain_name) continue
        const key = summary.domain_name.toLowerCase()
        const adIds = domainIdAds.get(String(doc._id)) || new Set()
        const existingIds = adsByName.get(key) || new Set()
        for (const id of adIds) existingIds.add(id)
        adsByName.set(key, existingIds)
        const existing = byName.get(key)
        if (!existing) byName.set(key, { ...summary, adCount: existingIds.size })
        else existing.adCount = existingIds.size
      }
    }

    const unresolvedHosts = [...hostAds.keys()].filter((host) => !byName.has(host))
    if (unresolvedHosts.length > 0) {
      const byHost = await getDomainsByNames(unresolvedHosts, { includeUnreviewed })
      for (const [host, summary] of Object.entries(byHost || {})) {
        if (!summary?.domain_name) continue
        const key = String(summary.domain_name).toLowerCase()
        const adIds = hostAds.get(normalizeHost(host)) || hostAds.get(key) || new Set()
        const existingIds = adsByName.get(key) || new Set()
        for (const id of adIds) existingIds.add(id)
        adsByName.set(key, existingIds)
        const existing = byName.get(key)
        if (!existing) byName.set(key, { ...summary, adCount: existingIds.size })
        else existing.adCount = existingIds.size
      }
    }

    for (const [host, adIds] of hostAds.entries()) {
      const existing = byName.get(host)
      const existingIds = adsByName.get(host)
      if (!existing || !existingIds) continue
      for (const id of adIds) existingIds.add(id)
      existing.adCount = existingIds.size
    }

    const domains = Array.from(byName.values()).sort((a, b) => (b.adCount || 0) - (a.adCount || 0))
    return { domains }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.ad_profiles,
      app_action: 'getAdProfileLinkedDomains',
      message: 'getAdProfileLinkedDomains failed',
    }, e)
    return { domains: [], error: e.message }
  }
})

export const updateAdProfileClientStatus = traceAction('updateAdProfileClientStatus', async (profileId, status) => {
  try {
    if (!profileId) return { success: false, error: 'Missing profile ID' }
    const { dbName, clientDetails } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)

    const result = await adProfilesCollection(db).updateOne(
      { _id: new ObjectId(profileId) },
      {
        $set: {
          'workflow.client_status': mapUiClientStatusToV3(status),
          'system.updated_at': new Date(),
        },
      },
    )

    if (result.matchedCount > 0) {
      await insertCaseEvent(db, {
        entityType: 'ad_profile',
        entityId: profileId,
        eventType: 'Client Status Updated',
        actor: clientDetails.email,
        summary: `Ad profile client status changed to ${status}`,
        payload: { ui_status: status, v3_status: mapUiClientStatusToV3(status) },
      })
      return { success: true }
    }
    return { success: false, error: 'Ad profile not found' }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.ad_profiles,
      app_action: 'updateAdProfileClientStatus',
      message: 'updateAdProfileClientStatus failed',
    }, e)
    return { success: false, error: e.message }
  }
})

export const addAdProfileClientNote = traceAction('addAdProfileClientNote', async (profileId, noteText) => {
  try {
    const { dbName, clientDetails } = await requireAuthContext()
    if (!profileId) return { success: false, error: 'Missing profile ID' }

    const client = await clientPromise
    const db = client.db(dbName)
    const newNote = {
      text: noteText,
      email: clientDetails.email,
      created_at: new Date().toISOString(),
    }

    const result = await adProfilesCollection(db).updateOne(
      { _id: new ObjectId(profileId) },
      {
        $push: { client_notes: newNote },
        $set: { 'system.updated_at': new Date() },
      },
    )

    if (result.matchedCount > 0) {
      await insertCaseEvent(db, {
        entityType: 'ad_profile',
        entityId: profileId,
        eventType: 'Client Note Added',
        actor: clientDetails.email,
        summary: 'Ad profile client note added',
        payload: { note: newNote },
      })
      return { success: true, note: newNote }
    }
    return { success: false, error: 'Ad profile not found' }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.ad_profiles,
      app_action: 'addAdProfileClientNote',
      message: 'addAdProfileClientNote failed',
    }, e)
    return { success: false, error: e.message }
  }
})
