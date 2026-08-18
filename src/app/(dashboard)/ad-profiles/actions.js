'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction } from '@/utils/tracing'
import { requireAuthContext } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { adProfilesCollection, adsCollection } from '@/utils/mongodb/collections'
import {
  insertCaseEvent,
  mapUiClientStatusToV3,
} from '@/utils/mongodb/v3-schema'
import {
  normalizeAdProfileForUi,
  normalizeAdForUi,
} from '@/lib/ads/ad-helpers'

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const getAdProfiles = traceAction('getAdProfiles', async (page = 1, limit = 20, filters = {}, sort = { field: null, direction: 'desc' }) => {
  try {
    const { dbName } = await requireAuthContext()
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = adProfilesCollection(db)

    const skip = (page - 1) * limit

    const query = {
      $or: [
        { 'workflow.review_status': 'reviewed' },
        { 'list.reviewed_ad_count': { $gt: 0 } },
        { 'review_details.reviewed_at': { $exists: true } },
      ],
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

    // Client list: prefer reviewed ads when available
    const ads = await adsCollection(db)
      .find({
        ad_profile_id: new ObjectId(profileId),
        $or: [
          { 'workflow.review_status': 'reviewed' },
          { 'list.review_threat_score': { $exists: true, $ne: null } },
        ],
      })
      .sort({ 'list.reviewed_at': -1, 'list.sourced_at': -1 })
      .toArray()

    // Fallback: if none reviewed yet but profile is visible, show linked ads
    const list = ads.length > 0
      ? ads
      : await adsCollection(db)
        .find({ ad_profile_id: new ObjectId(profileId) })
        .sort({ 'list.sourced_at': -1 })
        .limit(50)
        .toArray()

    return Promise.all(list.map((ad) => normalizeAdForUi(ad, db)))
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
