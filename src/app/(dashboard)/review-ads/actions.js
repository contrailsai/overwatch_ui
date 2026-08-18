'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import {
  getSignedImageUrl,
  deleteFileFromS3,
  getSignedUploadUrl,
  headS3Object,
  buildS3PublicUrl,
} from '@/utils/aws/s3'
import {
  validateReviewImageMeta,
  sanitizeUploadFileName,
  validateS3HeadSize,
  REVIEW_IMAGE_MAX_BYTES,
} from '@/utils/aws/upload-validation'
import { traceAction } from '@/utils/tracing'
import { requireRole } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { adsCollection } from '@/utils/mongodb/collections'
import {
  normalizeAdForUi,
  getAdMedia,
  riskRankFromScore,
  ONLINE_VISIBILITY_VALUES,
  insertCaseEvent,
} from '@/lib/ads/ad-helpers'
import { buildEffectiveThreatScoreRange } from '@/utils/mongodb/v3-schema'

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function analysisResultsKeyCountExpr() {
  return { $size: { $objectToArray: { $ifNull: ['$analysis_results', {}] } } }
}

function normalizeAiAnalyzedFilter(value) {
  if (value === 'analyzed' || value === true || value === 'true') return 'analyzed'
  if (value === 'not_analyzed') return 'not_analyzed'
  return 'all'
}

function buildReviewAdsMatchQuery(filters = {}) {
  const query = { _id: { $ne: null } }
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

  const aiMode = normalizeAiAnalyzedFilter(filters.aiAnalyzed)
  if (aiMode === 'analyzed') {
    andConditions.push({
      $or: [
        { 'workflow.ai_status': 'completed' },
        { $expr: { $gt: [analysisResultsKeyCountExpr(), 0] } },
      ],
    })
  } else if (aiMode === 'not_analyzed') {
    andConditions.push({
      $and: [
        {
          $or: [
            { 'workflow.ai_status': 'pending' },
            { 'workflow.ai_status': { $exists: false } },
            { 'workflow.ai_status': null },
          ],
        },
        { $expr: { $eq: [analysisResultsKeyCountExpr(), 0] } },
      ],
    })
  }

  if (filters.platform && filters.platform !== 'all') {
    query.platform = { $regex: new RegExp(`^${filters.platform}$`, 'i') }
  }

  if (filters.visibility_status && filters.visibility_status !== 'all') {
    const visibilityLower = String(filters.visibility_status).toLowerCase()
    if (visibilityLower === 'down') {
      query['workflow.visibility_status'] = 'down'
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

  if (filters.is_active === 'true' || filters.is_active === true) {
    andConditions.push({
      $or: [
        { 'list.is_active': true },
        { 'ad_delivery.is_active': true },
      ],
    })
  } else if (filters.is_active === 'false' || filters.is_active === false) {
    andConditions.push({
      $and: [
        { 'list.is_active': { $ne: true } },
        { 'ad_delivery.is_active': { $ne: true } },
      ],
    })
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

  const searchText = String(filters.search || '').trim()
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

  if (andConditions.length > 0) {
    query.$and = andConditions
  }

  return query
}

function buildReviewAdsDateFilterStage(filters = {}) {
  const dateFilterStage = {}

  if (filters.sourcingDateStart || filters.sourcingDateEnd) {
    dateFilterStage['list.sourced_at'] = {}
    if (filters.sourcingDateStart) {
      dateFilterStage['list.sourced_at'].$gte = new Date(filters.sourcingDateStart)
    }
    if (filters.sourcingDateEnd) {
      dateFilterStage['list.sourced_at'].$lte = new Date(filters.sourcingDateEnd)
    }
  }

  if (filters.startDateStart || filters.startDateEnd) {
    dateFilterStage['list.start_date'] = {}
    if (filters.startDateStart) {
      dateFilterStage['list.start_date'].$gte = new Date(filters.startDateStart)
    }
    if (filters.startDateEnd) {
      dateFilterStage['list.start_date'].$lte = new Date(filters.startDateEnd)
    }
  }

  return {
    dateFilterStage,
    hasDateFilters: Object.keys(dateFilterStage).length > 0,
  }
}

function buildReviewAdsPipelineStages(filters = {}) {
  const { dateFilterStage, hasDateFilters } = buildReviewAdsDateFilterStage(filters)
  const riskKey =
    filters.aiRisk && filters.aiRisk !== 'all' ? String(filters.aiRisk).toLowerCase() : null
  const range = buildEffectiveThreatScoreRange(riskKey)
  const riskMatch = riskKey
    ? {
        $match: {
          $or: [
            { 'list.risk_rank': riskKey },
            ...(range ? [{ 'list.effective_threat_score': range }] : []),
          ],
        },
      }
    : null

  return [
    { $match: buildReviewAdsMatchQuery(filters) },
    ...(hasDateFilters ? [{ $match: dateFilterStage }] : []),
    ...(riskMatch ? [riskMatch] : []),
  ]
}

export const getAds = traceAction('getAds_review', async (_project_mongo_db_map, page = 1, limit = 20, filters = {}) => {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = adsCollection(db)

    const skip = (page - 1) * limit
    const pipeline = [
      ...buildReviewAdsPipelineStages(filters),
      { $sort: { 'list.sourced_at': -1, _id: -1 } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [{ $skip: skip }, { $limit: limit }],
        },
      },
    ]

    const [result] = await collection.aggregate(pipeline).toArray()
    const totalCount = result?.metadata?.[0]?.total || 0
    const ads = await Promise.all((result?.data || []).map((ad) => normalizeAdForUi(ad, db)))

    return {
      ads,
      totalPages: Math.ceil(totalCount / limit) || 0,
      totalCount,
    }
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_ads,
      app_action: 'getAds_review',
      message: 'review_ads.getAds failed',
    }, e)
    console.error('getAds Error:', e)
    return { ads: [], totalPages: 0, totalCount: 0 }
  }
})

export const getAdById = traceAction('getAdById', async (_project, adId) => {
  try {
    const { dbName } = await requireRole(['reviewer'])
    const client = await clientPromise
    const db = client.db(dbName)
    const ad = await adsCollection(db).findOne({ _id: new ObjectId(adId) })
    return normalizeAdForUi(ad, db)
  } catch (e) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_ads,
      app_action: 'getAdById',
      message: 'review_ads.getAdById failed',
    }, e)
    console.error('getAdById Error:', e)
    return null
  }
})

export const submitAdReview = traceAction('submitAdReview', async (_project, _client_details, prevState, formData) => {
  const { dbName, clientDetails } = await requireRole(['reviewer'])
  const mongoId = formData.get('mongo_id')

  if (!mongoId) {
    return { success: false, error: 'Missing Ad ID' }
  }

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

  try {
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = adsCollection(db)
    const existingAd = await collection.findOne({ _id: new ObjectId(mongoId) })
    if (!existingAd) {
      return { success: false, error: 'Ad not found' }
    }

    const review_details = {
      threat_score: parseInt(formData.get('threat_score') || '0', 10),
      threat_types: threat_types.length > 0 ? threat_types : ['safe'],
      legal_codes,
      is_aigc: formData.get('is_aigc') === 'on',
      flags,
      poi_names: formData.get('poi_names')
        ? formData.get('poi_names').split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      reasoning: formData.get('reasoning'),
      simple_report_description: formData.get('simple_report_description') || null,
      reviewer_comments: formData.get('reviewer_comments'),
      face_present: ['on', 'yes', 'true'].includes(formData.get('face_present')?.toLowerCase()),
      name_present: ['on', 'yes', 'true'].includes(formData.get('name_present')?.toLowerCase()),
      reviewed_at: existingAd.review_details?.reviewed_at || new Date().toISOString(),
    }

    const effectiveScore = review_details.threat_score
    const riskRank = riskRankFromScore(effectiveScore)
    const reviewedAt = new Date(review_details.reviewed_at)

    await collection.updateOne(
      { _id: new ObjectId(mongoId) },
      {
        $set: {
          review_details,
          'workflow.review_status': 'reviewed',
          'workflow.client_status': existingAd.workflow?.client_status || 'alerted',
          'workflow.alerted_at': existingAd.workflow?.alerted_at || new Date(),
          content_reviewed_by: clientDetails.email,
          'list.review_threat_score': effectiveScore,
          'list.effective_threat_score': effectiveScore,
          'list.risk_rank': riskRank,
          'list.reviewed_at': reviewedAt,
          'list.threat_types': review_details.threat_types,
          'list.violation_flags': review_details.threat_types,
          'system.updated_at': new Date(),
        },
      },
    )

    await insertCaseEvent(db, {
      entityType: 'ad',
      entityId: mongoId,
      eventType: 'Ad Reviewed',
      actor: clientDetails.email,
      summary: 'Ad reviewed and alerted',
      payload: { review_details },
    })

    return {
      success: true,
      updatedFields: {
        review_details,
        processed: true,
        processed_at: new Date().toISOString(),
      },
    }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_ads,
      app_action: 'submitAdReview',
      message: 'review_ads.submitAdReview failed',
    }, error)
    console.error('submitAdReview Error:', error)
    return { success: false, error: error.message }
  }
})

function sanitizeContentPayload(content = {}) {
  const cards = Array.isArray(content.cards)
    ? content.cards.map((card, cardIndex) => ({
        title: card?.title ?? '',
        body: card?.body ?? '',
        caption: card?.caption ?? '',
        cta_text: card?.cta_text ?? '',
        cta_type: card?.cta_type ?? '',
        link_url: card?.link_url ?? '',
        link_description: card?.link_description ?? '',
        media: Array.isArray(card?.media)
          ? card.media.map((m) => ({
              original_url: m?.original_url ?? null,
              s3_url: m?.s3_url ?? null,
              type: m?.type || 'image',
              role: m?.role || null,
              card_index: m?.card_index ?? cardIndex,
              uploaded_manually: Boolean(m?.uploaded_manually),
              media_type: m?.media_type || null,
            }))
          : [],
      }))
    : []

  const media = Array.isArray(content.media)
    ? content.media.map((m) => ({
        original_url: m?.original_url ?? null,
        s3_url: m?.s3_url ?? null,
        type: m?.type || 'image',
        role: m?.role || null,
        card_index: m?.card_index ?? null,
        uploaded_manually: Boolean(m?.uploaded_manually),
        media_type: m?.media_type || null,
      }))
    : cards.flatMap((card, idx) =>
        (card.media || []).map((m) => ({ ...m, card_index: m.card_index ?? idx })),
      )

  return {
    title: content.title ?? null,
    body: content.body ?? null,
    caption: content.caption ?? null,
    cta_text: content.cta_text ?? null,
    cta_type: content.cta_type ?? null,
    display_format: content.display_format ?? null,
    link_url: content.link_url ?? null,
    link_description: content.link_description ?? null,
    language: content.language ?? null,
    cards,
    media,
  }
}

export const updateAdContent = traceAction('updateAdContent', async (adId, contentPayload) => {
  try {
    const { dbName, clientDetails } = await requireRole(['reviewer'])
    if (!adId) return { success: false, error: 'Missing Ad ID' }

    const content = sanitizeContentPayload(contentPayload)
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = adsCollection(db)

    const existing = await collection.findOne({ _id: new ObjectId(adId) })
    if (!existing) return { success: false, error: 'Ad not found' }

    await collection.updateOne(
      { _id: new ObjectId(adId) },
      {
        $set: {
          content,
          'list.card_count': content.cards.length,
          'list.display_format': content.display_format || existing.list?.display_format || null,
          'system.updated_at': new Date(),
        },
      },
    )

    await insertCaseEvent(db, {
      entityType: 'ad',
      entityId: adId,
      eventType: 'content_updated',
      actor: clientDetails.email,
      summary: 'Ad creative content updated by reviewer',
      payload: {
        card_count: content.cards.length,
        media_count: content.media.length,
      },
    })

    const updated = await collection.findOne({ _id: new ObjectId(adId) })
    return { success: true, ad: await normalizeAdForUi(updated, db) }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_ads,
      app_action: 'updateAdContent',
      message: 'review_ads.updateAdContent failed',
    }, error)
    console.error('updateAdContent Error:', error)
    return { success: false, error: error.message }
  }
})

export const initAdImageUpload = traceAction('initAdImageUpload', async (adId, fileMeta) => {
  try {
    const { dbName } = await requireRole(['reviewer'])
    if (!adId) return { success: false, error: 'Missing Ad ID' }

    const { fileName, contentType, fileSize } = fileMeta || {}
    const validationError = validateReviewImageMeta({ contentType, fileSize })
    if (validationError) return { success: false, error: validationError }

    const sanitizedFileName = sanitizeUploadFileName(fileName)
    const s3Key = `ad-images/${dbName}/${adId}/${Date.now()}-${sanitizedFileName}`
    const s3Url = buildS3PublicUrl(s3Key)
    const uploadUrl = await getSignedUploadUrl(s3Key, contentType)

    return { success: true, uploadUrl, s3Key, s3Url }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_ads,
      app_action: 'initAdImageUpload',
      message: 'review_ads.initAdImageUpload failed',
    }, error)
    return { success: false, error: error.message }
  }
})

export const confirmAdImageUpload = traceAction('confirmAdImageUpload', async (adId, uploadMeta) => {
  try {
    const { dbName, clientDetails } = await requireRole(['reviewer'])
    if (!adId) return { success: false, error: 'Missing Ad ID' }

    const { s3Key, s3Url, contentType, cardIndex = null } = uploadMeta || {}
    if (!s3Key || !s3Url || !contentType) {
      return { success: false, error: 'Missing upload metadata' }
    }

    const expectedPrefix = `ad-images/${dbName}/${adId}/`
    if (!s3Key.startsWith(expectedPrefix)) {
      return { success: false, error: 'Invalid upload key' }
    }

    const head = await headS3Object(s3Key)
    if (!head) return { success: false, error: 'Upload not found in S3' }

    const sizeError = validateS3HeadSize(head, REVIEW_IMAGE_MAX_BYTES)
    if (sizeError) return { success: false, error: sizeError }

    const resolvedS3Url = buildS3PublicUrl(s3Key)
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = adsCollection(db)
    const existing = await collection.findOne({ _id: new ObjectId(adId) })
    if (!existing) return { success: false, error: 'Ad not found' }

    const manualEntry = {
      s3_url: resolvedS3Url,
      original_url: null,
      type: 'image',
      role: 'reviewer_upload',
      media_type: contentType,
      uploaded_manually: true,
      card_index: cardIndex,
    }

    const content = sanitizeContentPayload(existing.content || {})
    content.media = [...(content.media || []).filter((m) => !m.uploaded_manually), manualEntry]

    if (cardIndex != null && content.cards[cardIndex]) {
      const cardMedia = (content.cards[cardIndex].media || []).filter((m) => !m.uploaded_manually)
      content.cards[cardIndex].media = [...cardMedia, { ...manualEntry, card_index: cardIndex }]
    }

    await collection.updateOne(
      { _id: new ObjectId(adId) },
      {
        $set: {
          content,
          'list.card_count': content.cards.length,
          'system.updated_at': new Date(),
          'system.s3_stored': true,
        },
      },
    )

    await insertCaseEvent(db, {
      entityType: 'ad',
      entityId: adId,
      eventType: 'Image Uploaded',
      actor: clientDetails.email,
      summary: 'Image uploaded manually for ad',
    })

    const signedUrl = await getSignedImageUrl(resolvedS3Url)
    const updated = await collection.findOne({ _id: new ObjectId(adId) })
    return { success: true, signedUrl, ad: await normalizeAdForUi(updated, db) }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_ads,
      app_action: 'confirmAdImageUpload',
      message: 'review_ads.confirmAdImageUpload failed',
    }, error)
    return { success: false, error: error.message }
  }
})

export const deleteAdImage = traceAction('deleteAdImage', async (adId, s3Url) => {
  try {
    const { dbName, clientDetails } = await requireRole(['reviewer'])
    if (!adId) return { success: false, error: 'Missing Ad ID' }

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = adsCollection(db)
    const existing = await collection.findOne({ _id: new ObjectId(adId) })
    if (!existing) return { success: false, error: 'Ad not found' }

    const content = sanitizeContentPayload(existing.content || {})
    const target = getAdMedia(existing).find((m) => m.s3_url === s3Url)
    if (!target) return { success: false, error: 'Media not found' }

    // Only allow deleting manual uploads (same rule as cases)
    if (!target.uploaded_manually) {
      return { success: false, error: 'Only manually uploaded images can be deleted' }
    }

    content.media = (content.media || []).filter((m) => m.s3_url !== s3Url)
    content.cards = (content.cards || []).map((card) => ({
      ...card,
      media: (card.media || []).filter((m) => m.s3_url !== s3Url),
    }))

    // Best-effort S3 delete
    try {
      const key = s3Url.includes('.amazonaws.com/')
        ? s3Url.split('.amazonaws.com/')[1]
        : null
      if (key) await deleteFileFromS3(key)
    } catch {
      // continue — DB is source of truth for UI
    }

    await collection.updateOne(
      { _id: new ObjectId(adId) },
      {
        $set: {
          content,
          'list.card_count': content.cards.length,
          'system.updated_at': new Date(),
        },
      },
    )

    await insertCaseEvent(db, {
      entityType: 'ad',
      entityId: adId,
      eventType: 'Image Deleted',
      actor: clientDetails.email,
      summary: 'Manual ad image deleted',
    })

    const updated = await collection.findOne({ _id: new ObjectId(adId) })
    return { success: true, ad: await normalizeAdForUi(updated, db) }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_ads,
      app_action: 'deleteAdImage',
      message: 'review_ads.deleteAdImage failed',
    }, error)
    return { success: false, error: error.message }
  }
})

export const updateAdVisibility = traceAction('updateAdVisibility', async (adId, _project, _clientDetails, status) => {
  try {
    const { dbName, clientDetails } = await requireRole(['reviewer'])
    const visibility = String(status || '').toLowerCase() === 'down' ? 'down' : 'available'

    const client = await clientPromise
    const db = client.db(dbName)
    await adsCollection(db).updateOne(
      { _id: new ObjectId(adId) },
      {
        $set: {
          'workflow.visibility_status': visibility,
          'system.updated_at': new Date(),
        },
      },
    )

    await insertCaseEvent(db, {
      entityType: 'ad',
      entityId: adId,
      eventType: 'Visibility Updated',
      actor: clientDetails.email,
      summary: `Ad visibility set to ${visibility}`,
    })

    return { success: true, visibility_status: visibility }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_ads,
      app_action: 'updateAdVisibility',
      message: 'review_ads.updateAdVisibility failed',
    }, error)
    return { success: false, error: error.message }
  }
})

export const deleteAd = traceAction('deleteAd', async (adId) => {
  try {
    const { dbName, clientDetails } = await requireRole(['reviewer'])
    const client = await clientPromise
    const db = client.db(dbName)
    const collection = adsCollection(db)
    const existing = await collection.findOne({ _id: new ObjectId(adId) })
    if (!existing) return { success: false, error: 'Ad not found' }

    await collection.deleteOne({ _id: new ObjectId(adId) })
    await insertCaseEvent(db, {
      entityType: 'ad',
      entityId: adId,
      eventType: 'Ad Deleted',
      actor: clientDetails.email,
      summary: 'Ad deleted by reviewer',
      payload: { platform_ad_id: existing.platform_ad_id },
    })

    return { success: true }
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.review_ads,
      app_action: 'deleteAd',
      message: 'review_ads.deleteAd failed',
    }, error)
    return { success: false, error: error.message }
  }
})
