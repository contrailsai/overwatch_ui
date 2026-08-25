'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { traceAction, runInSpan } from '@/utils/tracing'
import { requireRole } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { adProfilesCollection, adsCollection } from '@/utils/mongodb/collections'
import { insertCaseEvent } from '@/utils/mongodb/v3-schema'
import {
  normalizeAdProfileForUi,
  normalizeAdForUi,
} from '@/lib/ads/ad-helpers'

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildAdProfileMatchQuery(filters) {
  const matchQuery = {}
  const andConditions = []

  if (filters.platform && filters.platform !== 'all') {
    matchQuery.platform = { $regex: new RegExp(`^${filters.platform}$`, 'i') }
  }

  if (filters.publish_date_from || filters.publish_date_to) {
    matchQuery['list.last_active_at'] = {}
    if (filters.publish_date_from) {
      matchQuery['list.last_active_at'].$gte = new Date(filters.publish_date_from)
    }
    if (filters.publish_date_to) {
      matchQuery['list.last_active_at'].$lte = new Date(filters.publish_date_to)
    }
  }

  if (filters.reviewStatus === 'reviewed') {
    andConditions.push({ 'workflow.review_status': 'reviewed' })
  } else if (filters.reviewStatus === 'pending') {
    andConditions.push({
      $or: [
        { 'workflow.review_status': 'pending' },
        { 'workflow.review_status': { $exists: false } },
      ],
    })
  }

  if (filters.searchText?.trim()) {
    const searchRegex = new RegExp(escapeRegex(filters.searchText.trim()), 'i')
    andConditions.push({
      $or: [
        { profile_url: { $regex: searchRegex } },
        { page_name: { $regex: searchRegex } },
        { display_name: { $regex: searchRegex } },
        { platform_page_id: { $regex: searchRegex } },
      ],
    })
  }

  if (andConditions.length > 0) {
    matchQuery.$and = andConditions
  }

  return matchQuery
}

export const getAdProfiles = traceAction('getAdProfiles_review', async (_project, page = 1, limit = 20, filters = {}) => {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = adProfilesCollection(db)

    const skip = (page - 1) * limit
    const matchQuery = buildAdProfileMatchQuery(filters)

    const pipeline = [
      { $match: matchQuery },
      { $sort: { 'list.ad_count': -1, 'list.max_threat_score': -1, _id: 1 } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: 'total' }],
        },
      },
    ]

    const facetResult = await runInSpan(
      'review_ad_profiles.getAdProfiles.mongo_data_and_count',
      async () => collection.aggregate(pipeline).toArray(),
      { 'app.span_type': 'mongo_query', 'app.query_kind': 'data_and_count' },
    )

    const profiles = facetResult?.[0]?.data || []
    const totalCount = facetResult?.[0]?.total?.[0]?.total || 0

    const serialized = await runInSpan(
      'review_ad_profiles.getAdProfiles.normalize',
      async () => Promise.all(profiles.map((p) => normalizeAdProfileForUi(p))),
      { 'app.span_type': 'normalize' },
    )

    return {
      profiles: serialized,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_ad_profiles,
      app_action: 'getAdProfiles_review',
      message: 'review_ad_profiles.getAdProfiles failed',
    }, e)
    console.error('getAdProfiles MongoDB Error:', e)
    return { profiles: [], totalCount: 0, page: 1, totalPages: 0 }
  }
})

export const getAdProfileById = traceAction('getAdProfileById_review', async (profileId) => {
  try {
    if (!profileId) return null
    const { dbName } = await requireRole(['reviewer'])
    const client = await clientPromise
    const db = client.db(dbName)
    const profile = await adProfilesCollection(db).findOne({ _id: new ObjectId(profileId) })
    return normalizeAdProfileForUi(profile)
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_ad_profiles,
      app_action: 'getAdProfileById_review',
      message: 'review_ad_profiles.getAdProfileById failed',
    }, e)
    return null
  }
})

export const getAdProfileAds = traceAction('getAdProfileAds_review', async (_project, profileId) => {
  try {
    if (!profileId) return []
    const { dbName } = await requireRole(['reviewer'])

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = adsCollection(db)

    const ads = await runInSpan(
      'review_ad_profiles.getAdProfileAds.mongo_query',
      async () => collection
        .find({ ad_profile_id: new ObjectId(profileId) })
        .sort({ 'list.sourced_at': -1, _id: -1 })
        .toArray(),
      { 'app.span_type': 'mongo_query' },
    )

    return runInSpan(
      'review_ad_profiles.getAdProfileAds.normalize',
      async () => Promise.all(ads.map((ad) => normalizeAdForUi(ad, db))),
      { 'app.span_type': 'normalize' },
    )
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_ad_profiles,
      app_action: 'getAdProfileAds_review',
      message: 'review_ad_profiles.getAdProfileAds failed',
    }, e)
    console.error('getAdProfileAds MongoDB Error:', e)
    return []
  }
})

export const submitAdProfileReview = traceAction('submitAdProfileReview', async (_project, profileId, reviewData) => {
  try {
    if (!profileId) {
      return { success: false, error: 'Missing project or profile ID' }
    }
    const { dbName, clientDetails } = await requireRole(['reviewer'])

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = adProfilesCollection(db)

    const { risk, violations, reasoning, reviewer_comments, action } = reviewData

    const review_details = {
      risk,
      violations: violations || [],
      reasoning: reasoning || '',
      reviewer_comments: reviewer_comments || '',
      action,
      reviewed_at: new Date().toISOString(),
    }

    const clientStatus =
      action === 'submit_to_client' ? 'alerted' : action === 'ignore' ? 'no_action' : 'open'

    await collection.updateOne(
      { _id: new ObjectId(profileId) },
      {
        $set: {
          review_details,
          'workflow.review_status': 'reviewed',
          'workflow.reviewed_at': new Date(),
          'workflow.client_status': clientStatus,
          'list.risk': risk,
          'list.risk_rank': risk,
          'system.updated_at': new Date(),
        },
      },
    )

    await insertCaseEvent(db, {
      entityType: 'ad_profile',
      entityId: profileId,
      eventType: 'Ad Profile Review Submitted',
      actor: clientDetails?.email || 'reviewer',
      summary: `Ad profile review submitted with risk ${risk}`,
      payload: { review_details },
    })

    return { success: true, review_details }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_ad_profiles,
      app_action: 'submitAdProfileReview',
      message: 'review_ad_profiles.submitAdProfileReview failed',
    }, e)
    console.error('submitAdProfileReview MongoDB Error:', e)
    return { success: false, error: e.message }
  }
})
