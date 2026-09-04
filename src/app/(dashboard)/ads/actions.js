'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction, recordClickMetric } from '@/utils/tracing'
import { requireAuthContext } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { adsCollection } from '@/utils/mongodb/collections'
import {
  normalizeAdForUi,
  ONLINE_VISIBILITY_VALUES,
  insertCaseEvent,
} from '@/lib/ads/ad-helpers'
import { REVIEWED_ADS_FILTER } from '@/lib/ads/reviewed-ad-filter'
import {
  buildAdChannelMatchCondition,
  buildAdChannelRankExpression,
} from '@/lib/ads/ad-channel-filter'
import {
  mapUiClientStatusToV3,
  buildEffectiveThreatScoreRange,
} from '@/utils/mongodb/v3-schema'

const ADS_TRACE = { loki_stream: LOKI_STREAMS.ads }

export const trackClientClick = traceAction(
  'trackClientClick',
  async (buttonName, attributes = {}) => {
    recordClickMetric(buttonName, attributes)
  },
  ADS_TRACE,
)

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildAdsMatchQuery(filters = {}) {
  const andConditions = [REVIEWED_ADS_FILTER]

  const channelMatch = buildAdChannelMatchCondition(filters.channel)
  if (channelMatch) {
    andConditions.push(channelMatch)
  }

  if (filters.display_format && filters.display_format !== 'all') {
    const format = String(filters.display_format).toUpperCase()
    andConditions.push({
      $or: [
        { 'list.display_format': { $regex: new RegExp(`^${format}$`, 'i') } },
        { 'content.display_format': { $regex: new RegExp(`^${format}$`, 'i') } },
      ],
    })
  }

  if (filters.status && filters.status !== 'all') {
    if (filters.status === 'To Be Reviewed') {
      andConditions.push({
        $or: [
          { 'workflow.client_status': { $in: ['open', 'alerted'] } },
          { 'workflow.client_status': { $exists: false } },
          { 'workflow.client_status': null },
        ],
      })
    } else {
      andConditions.push({
        'workflow.client_status': mapUiClientStatusToV3(filters.status),
      })
    }
  }

  if (filters.visibility_status && filters.visibility_status !== 'all') {
    const visibilityLower = String(filters.visibility_status).toLowerCase()
    if (visibilityLower === 'down') {
      andConditions.push({ 'workflow.visibility_status': 'down' })
    } else if (
      visibilityLower === 'available' ||
      ONLINE_VISIBILITY_VALUES.includes(visibilityLower)
    ) {
      andConditions.push({
        $or: [
          { 'workflow.visibility_status': { $in: ONLINE_VISIBILITY_VALUES } },
          { 'workflow.visibility_status': { $exists: false } },
          { 'workflow.visibility_status': null },
        ],
      })
    }
  }

  const searchText = String(filters.search || filters.searchText || '').trim()
  if (searchText) {
    const searchRegex = new RegExp(escapeRegex(searchText), 'i')
    andConditions.push({
      $or: [
        { 'advertiser_snapshot.page_name': { $regex: searchRegex } },
        { 'content.title': { $regex: searchRegex } },
        { 'content.body': { $regex: searchRegex } },
        { 'content.caption': { $regex: searchRegex } },
        { 'content.link_url': { $regex: searchRegex } },
        { 'content.link_description': { $regex: searchRegex } },
        { 'content.cta_text': { $regex: searchRegex } },
        { 'content.cards.title': { $regex: searchRegex } },
        { 'content.cards.body': { $regex: searchRegex } },
        { 'content.cards.caption': { $regex: searchRegex } },
        { 'content.cards.link_url': { $regex: searchRegex } },
        { original_url: { $regex: searchRegex } },
        { platform_ad_id: { $regex: searchRegex } },
      ],
    })
  }

  if (filters.alert_date_from || filters.alert_date_to) {
    const dateRange = {}
    if (filters.alert_date_from) dateRange.$gte = new Date(filters.alert_date_from)
    if (filters.alert_date_to) dateRange.$lte = new Date(filters.alert_date_to)
    andConditions.push({ 'list.reviewed_at': dateRange })
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

  return { $and: andConditions }
}

/**
 * Aggregation stages for ads list sort.
 * Default / alert date: bucket by calendar day (ignore time), then channel
 * priority (ingestion > feed > library).
 */
function buildAdsSortStages(sort = { field: null, direction: 'desc' }) {
  const dir = sort.direction === 'asc' ? 1 : -1
  const field = sort.field || 'reviewed_at'

  if (field === 'sourced_at') {
    return [{ $sort: { 'list.sourced_at': dir, 'list.effective_threat_score': -1, _id: 1 } }]
  }
  if (field === 'risk' || field === 'threat_score') {
    return [{ $sort: { 'list.effective_threat_score': dir, 'list.reviewed_at': -1, _id: 1 } }]
  }

  // reviewed_at / alert_date / default — day bucket then channel priority
  return [
    {
      $addFields: {
        _sort_alert_day: {
          $cond: {
            if: {
              $in: [{ $type: '$list.reviewed_at' }, ['date', 'string']],
            },
            then: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: {
                  $cond: {
                    if: { $eq: [{ $type: '$list.reviewed_at' }, 'string'] },
                    then: { $toDate: '$list.reviewed_at' },
                    else: '$list.reviewed_at',
                  },
                },
              },
            },
            else: null,
          },
        },
        _sort_channel_rank: buildAdChannelRankExpression(),
      },
    },
    {
      $sort: {
        _sort_alert_day: dir,
        _sort_channel_rank: 1,
        _id: 1,
      },
    },
  ]
}

function buildAdsReportSortPipeline() {
  return { 'list.effective_threat_score': -1, 'list.start_date': -1, _id: 1 }
}

/** Order ad IDs for report export (risk → start date → _id). */
export const orderAdIdsForReport = traceAction('orderAdIdsForReport', async (adIds = []) => {
  try {
    if (!adIds?.length) return []

    const { dbName } = await requireAuthContext()
    const objectIds = adIds
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
    const collection = adsCollection(client.db(dbName))

    const docs = await collection.aggregate([
      { $match: { _id: { $in: objectIds }, ...REVIEWED_ADS_FILTER } },
      { $sort: buildAdsReportSortPipeline() },
      { $project: { _id: 1 } },
    ]).toArray()

    return docs.map((d) => d._id.toString())
  } catch (e) {
    logActionError({ loki_stream: LOKI_STREAMS.ads, app_action: 'orderAdIdsForReport', message: 'orderAdIdsForReport failed' }, e)
    console.error('orderAdIdsForReport Error:', e)
    return []
  }
}, ADS_TRACE)

export const getAllAdIds = traceAction('getAllAdIds', async (filters = {}) => {
  try {
    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const collection = adsCollection(client.db(dbName))

    const docs = await collection.aggregate([
      { $match: buildAdsMatchQuery(filters) },
      { $sort: buildAdsReportSortPipeline() },
      { $project: { _id: 1 } },
    ]).toArray()

    return docs.map((d) => d._id.toString())
  } catch (e) {
    logActionError({ loki_stream: LOKI_STREAMS.ads, app_action: 'getAllAdIds', message: 'getAllAdIds failed' }, e)
    console.error('getAllAdIds Error:', e)
    return []
  }
}, ADS_TRACE)

export const getAds = traceAction('getAds', async (page = 1, limit = 25, filters = {}, sort = { field: null, direction: 'desc' }) => {
  try {
    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = adsCollection(db)

    const skip = (page - 1) * limit
    const query = buildAdsMatchQuery(filters)
    const sortStages = buildAdsSortStages(sort)

    const facetResult = await collection
      .aggregate([
        { $match: query },
        {
          $facet: {
            data: [
              ...sortStages,
              { $skip: skip },
              { $limit: limit },
            ],
            total: [{ $count: 'total' }],
          },
        },
      ])
      .toArray()

    const ads = facetResult?.[0]?.data || []
    const totalCount = facetResult?.[0]?.total?.[0]?.total || 0

    const serialized = await Promise.all(ads.map((ad) => normalizeAdForUi(ad)))

    return {
      ads: serialized,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit) || 0,
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.ads,
      app_action: 'getAds',
      message: 'getAds failed',
    }, e)
    console.error('getAds MongoDB Error:', e)
    return { ads: [], totalCount: 0, page: 1, totalPages: 0 }
  }
}, ADS_TRACE)

export const getAdById = traceAction('getAdById', async (adId) => {
  try {
    if (!adId || !ObjectId.isValid(adId)) return null
    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)
    const ad = await adsCollection(db).findOne({
      _id: new ObjectId(adId),
      ...REVIEWED_ADS_FILTER,
    })
    if (!ad) return null
    return normalizeAdForUi(ad, db)
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.ads,
      app_action: 'getAdById',
      message: 'getAdById failed',
    }, e)
    console.error('getAdById MongoDB Error:', e)
    return null
  }
}, ADS_TRACE)

export const updateAdClientStatus = traceAction('updateAdClientStatus', async (adId, status) => {
  try {
    if (!adId) return { success: false, error: 'Missing ad ID' }
    const { dbName, clientDetails } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)

    const result = await adsCollection(db).updateOne(
      { _id: new ObjectId(adId), ...REVIEWED_ADS_FILTER },
      {
        $set: {
          'workflow.client_status': mapUiClientStatusToV3(status),
          'system.updated_at': new Date(),
        },
      },
    )

    if (result.matchedCount > 0) {
      await insertCaseEvent(db, {
        entityType: 'ad',
        entityId: adId,
        eventType: 'Client Status Updated',
        actor: clientDetails.email,
        summary: `Ad client status changed to ${status}`,
        payload: { ui_status: status, v3_status: mapUiClientStatusToV3(status) },
      })
      return { success: true }
    }
    return { success: false, error: 'Ad not found' }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.ads,
      app_action: 'updateAdClientStatus',
      message: 'updateAdClientStatus failed',
    }, e)
    return { success: false, error: e.message }
  }
}, ADS_TRACE)

export const addAdClientNote = traceAction('addAdClientNote', async (adId, noteText) => {
  try {
    const { dbName, clientDetails } = await requireAuthContext()
    if (!adId) return { success: false, error: 'Missing ad ID' }

    const client = await clientPromise
    const db = client.db(dbName)
    const newNote = {
      text: noteText,
      email: clientDetails.email,
      created_at: new Date().toISOString(),
    }

    const result = await adsCollection(db).updateOne(
      { _id: new ObjectId(adId), ...REVIEWED_ADS_FILTER },
      {
        $push: { client_notes: newNote },
        $set: { 'system.updated_at': new Date() },
      },
    )

    if (result.matchedCount > 0) {
      await insertCaseEvent(db, {
        entityType: 'ad',
        entityId: adId,
        eventType: 'Client Note Added',
        actor: clientDetails.email,
        summary: 'Ad client note added',
        payload: { note: newNote },
      })
      return { success: true, note: newNote }
    }
    return { success: false, error: 'Ad not found' }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.ads,
      app_action: 'addAdClientNote',
      message: 'addAdClientNote failed',
    }, e)
    return { success: false, error: e.message }
  }
}, ADS_TRACE)
