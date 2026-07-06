'use server'

import clientPromise from '@/utils/mongodb/client'
import { ObjectId } from 'mongodb'
import { getSignedImageUrl, getSignedDownloadUrl, getSignedViewUrl, getSignedUploadUrl, headS3Object, buildS3PublicUrl } from '@/utils/aws/s3'
import { validateTakedownDocumentMeta, sanitizeUploadFileName, validateS3HeadSize, TAKEDOWN_DOC_MAX_BYTES } from '@/utils/aws/upload-validation'
import { revalidatePath } from 'next/cache'
import { traceAction, recordClickMetric, runInSpan } from '@/utils/tracing'
import { getAuthContext } from '@/utils/auth-context'
import { omitSafeThreatTypes } from '@/lib/utils'
import crypto from 'crypto'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import { postsCollection } from '@/utils/mongodb/collections'
import {
  buildEffectiveThreatScoreRange,
  buildTakedownInfoForUi,
  fetchPostCaseEvents,
  getAuthorSnapshot,
  getFirstMediaS3Url,
  getPostCaption,
  insertCaseEvent,
  toIsoDate,
} from '@/utils/mongodb/v3-schema'
import { normalizeS3Post } from '@/lib/posts/pipeline-helpers'

export const trackClientClick = traceAction(
  'trackClientClick',
  async (buttonName, attributes = {}) => {
    recordClickMetric(buttonName, attributes)
  },
  { loki_stream: LOKI_STREAMS.takedowns },
)

/** List payload: never surface `safe` as a displayed threat type. */
function getListThreatTypes(reviewDetails) {
  const raw = reviewDetails?.threat_types
  const violations_unknown = !Array.isArray(raw) || raw.length === 0
  if (violations_unknown) {
    return { threat_types: [], violations_unknown: true }
  }
  return { threat_types: omitSafeThreatTypes(raw), violations_unknown: false }
}

/**
 * Check if the current user has reviewer permissions
 */
export const checkReviewerPermission = traceAction('checkReviewerPermission', async () => {
  const ctx = await getAuthContext()
  return ctx?.clientDetails?.permission === 'reviewer'
})

const buildTakedownMatchQuery = (filters = {}) => {
  let query = {
    $or: [
      { 'workflow.client_status': 'takedown' },
      { 'workflow.takedown_status': { $exists: true, $nin: [null, 'none'] } },
      { 'takedown.status': { $exists: true, $nin: [null, 'none'] } },
    ],
  }

  const andConditions = []

  // Status Filter
  if (filters.status && filters.status !== 'all') {
    const statusMap = {
      'takedown successful': ['takedown successful', 'takedown_successful'],
      'takedown_successful': ['takedown successful', 'takedown_successful'],
      'takedown failed': ['takedown failed', 'takedown_failed'],
      'takedown_failed': ['takedown failed', 'takedown_failed'],
      'appealed again': ['appealed again', 're_appeal_takedown'],
      're_appeal_takedown': ['appealed again', 're_appeal_takedown'],
      'under process': ['under process', 'under_review'],
      'under_review': ['under process', 'under_review'],
    }

    if (statusMap[filters.status]) {
      query['workflow.takedown_status'] = { $in: statusMap[filters.status] }
    } else {
      query['workflow.takedown_status'] = filters.status
    }
  }

  // Platform Filter
  if (filters.platform && filters.platform !== 'all') {
    query.platform = { $regex: new RegExp(`^${filters.platform}$`, 'i') }
  }

  // Risk Priority Filter
  const threatRange = buildEffectiveThreatScoreRange(filters.risk_priority)
  if (threatRange) {
    query['list.effective_threat_score'] = threatRange
  }

  // Violations filter
  if (filters.violations && filters.violations !== 'all') {
    const violationsArray = filters.violations.split(',')
    if (violationsArray.length > 0) {
      const normalViolations = violationsArray.filter((v) => v !== 'aigc')
      const hasAigc = violationsArray.includes('aigc')

      const violationConditions = []
      if (normalViolations.length > 0) {
        violationConditions.push({ 'list.violation_flags': { $in: normalViolations } })
        violationConditions.push({ 'review_details.threat_types': { $in: normalViolations } })
        const flagConditions = normalViolations.map((v) => ({ [`review_details.flags.${v}`]: true }))
        violationConditions.push(...flagConditions)
      }
      if (hasAigc) {
        violationConditions.push({ 'review_details.is_aigc': true })
      }

      if (violationConditions.length > 0) {
        andConditions.push({ $or: violationConditions })
      }
    }
  }

  if (andConditions.length > 0) {
    query.$and = andConditions
  }

  return query
}

const TAKEDOWN_SUCCESSFUL_STATUSES = ['takedown successful', 'takedown_successful']

const buildTakedownDateAddFields = () => ({
  sort_original_date: {
    $toDate: {
      $ifNull: ['$list.posted_at', { $ifNull: ['$engagement.posted_at', '$metadata.posted_date'] }],
    },
  },
  sort_takedown_date: {
    $toDate: {
      $ifNull: ['$takedown.initiated_at', '$system.updated_at'],
    },
  },
  sort_takedown_successful_date: {
    $toDate: '$takedown.completed_at',
  },
})

const buildTakedownDateFilterStages = (filters = {}) => {
  const dateFilterStage = {}
  let statusOverride = null

  if (filters.original_date_from || filters.original_date_to) {
    dateFilterStage.sort_original_date = {}
    if (filters.original_date_from) {
      dateFilterStage.sort_original_date.$gte = new Date(filters.original_date_from)
    }
    if (filters.original_date_to) {
      dateFilterStage.sort_original_date.$lte = new Date(filters.original_date_to)
    }
  }

  if (filters.takedown_date_from || filters.takedown_date_to) {
    dateFilterStage.sort_takedown_date = {}
    if (filters.takedown_date_from) {
      dateFilterStage.sort_takedown_date.$gte = new Date(filters.takedown_date_from)
    }
    if (filters.takedown_date_to) {
      dateFilterStage.sort_takedown_date.$lte = new Date(filters.takedown_date_to)
    }
  }

  if (filters.takedown_successful_date_from || filters.takedown_successful_date_to) {
    statusOverride = { $in: TAKEDOWN_SUCCESSFUL_STATUSES }
    dateFilterStage.sort_takedown_successful_date = {}
    if (filters.takedown_successful_date_from) {
      dateFilterStage.sort_takedown_successful_date.$gte = new Date(filters.takedown_successful_date_from)
    }
    if (filters.takedown_successful_date_to) {
      dateFilterStage.sort_takedown_successful_date.$lte = new Date(filters.takedown_successful_date_to)
    }
  }

  return {
    dateFilterStage,
    statusOverride,
    hasDateFilters: Object.keys(dateFilterStage).length > 0
  }
}

const applyStatusOverride = (matchStage, statusOverride) => {
  if (!statusOverride) return matchStage
  return { ...matchStage, 'workflow.takedown_status': statusOverride }
}

const inferHistoryAction = (eventType) => {
  const normalized = String(eventType || '').toLowerCase()
  if (normalized.includes('note')) return 'note_added'
  if (normalized.includes('document')) return 'document_uploaded'
  return 'update'
}

const mapCaseEventsToTakedownHistory = (events = []) =>
  events.map((event) => ({
    id: event.payload?.id || crypto.randomUUID(),
    action: event.payload?.action || inferHistoryAction(event.event_type),
    details: event.changes_summary || event.payload?.details || event.payload?.event || '',
    created_at: event.updated_at || new Date().toISOString(),
    created_by: event.updated_by || null,
  }))

const getTakedownDocumentsFromPost = (post) =>
  post?.takedown?.documents || post?.takedown_info?.documents || []

const getTakedownNotesFromPost = (post) =>
  post?.takedown?.notes || post?.takedown_info?.notes || []

/**
 * Fetch active takedowns with filters, server-side pagination, and enriched MongoDB data
 */
export const getTakedowns = traceAction('getTakedowns_list', async (filters = {}) => {
  const ctx = await getAuthContext()
  if (!ctx?.clientDetails?.project_name || !ctx.dbName) return { takedowns: [], totalCount: 0 }

  const page = parseInt(filters.page) || 1
  const pageSize = parseInt(filters.pageSize) || 25
  const skip = (page - 1) * pageSize

  try {
    const client = await clientPromise
    const db = client.db(ctx.dbName)
    const collection = postsCollection(db)

    const { dateFilterStage, statusOverride, hasDateFilters } = buildTakedownDateFilterStages(filters)
    const matchStage = applyStatusOverride(buildTakedownMatchQuery(filters), statusOverride)

    const aggregationPipeline = [
      { $match: matchStage },
      { $addFields: buildTakedownDateAddFields() },
      ...(hasDateFilters ? [{ $match: dateFilterStage }] : []),
      {
        $facet: {
          metadata: [{ $count: 'totalCount' }],
          data: [
            { $sort: { 'system.updated_at': -1, 'takedown.initiated_at': -1 } },
            { $skip: skip },
            { $limit: pageSize },
          ],
        },
      },
    ]

    const result = await runInSpan(
      'takedowns.getTakedowns.mongo_data_and_count',
      async () => collection.aggregate(aggregationPipeline).toArray(),
      { 'app.span_type': 'mongo_query', 'app.query_kind': 'data_and_count' }
    )
    const posts = result[0].data || []
    const totalCount = result[0].metadata[0]?.totalCount || 0

    const enrichedTakedowns = await runInSpan(
      'takedowns.getTakedowns.s3_signing',
      async () => Promise.all(posts.map(async (post) => {
        const takedownInfo = buildTakedownInfoForUi(post)
        const author = getAuthorSnapshot(post)
        const caption = getPostCaption(post)
        let thumbnail = null

        const s3Url = getFirstMediaS3Url(post)
        if (s3Url) {
          thumbnail = await getSignedImageUrl(s3Url)
        }

        const lastUpdateDate = toIsoDate(
          post.system?.updated_at || post.takedown?.initiated_at || post.metadata?.updated_at || null,
        )
        const takedownStartDate = toIsoDate(takedownInfo.takedown_start_date)
        const takedownSuccessfulDate = toIsoDate(takedownInfo.takedown_end_date)
        const notes = getTakedownNotesFromPost(post)

        const { threat_types, violations_unknown } = getListThreatTypes(post.review_details)

        return {
          id: post._id.toString(),
          mongo_post_id: post._id.toString(),
          post_platform_id: post.platform_post_id || post.post_id || post.code || '',
          platform: post.platform,
          status: takedownInfo.status || 'initiated',
          visibility_status: post.workflow?.visibility_status || post.visibility_status || 'active',
          risk_score: post.list?.effective_threat_score ?? post.review_details?.threat_score ?? 0,
          threat_type: threat_types[0] || (violations_unknown ? 'Unknown' : '-'),
          threat_types,
          violations_unknown,
          last_update_date: lastUpdateDate,
          takedown_start_date: takedownStartDate,
          takedown_successful_date: takedownSuccessfulDate,
          posted_at: toIsoDate(post.list?.posted_at || post.engagement?.posted_at || post.metadata?.posted_date || null),
          url: post.url || post.metadata?.url || '',
          notes: notes.length > 0 ? notes.join('\n\n') : '',
          caption,
          user: {
            username: author.username,
            full_name: author.display_name,
            profile_pic_url: author.profile_url,
            is_verified: author.is_verified,
          },
          enrichment: {
            caption: caption.length > 100 ? `${caption.substring(0, 100)}...` : caption,
            thumbnail,
            username: author.username,
          },
        }
      })),
      { 'app.span_type': 's3_signing' },
    )

    return {
      takedowns: enrichedTakedowns,
      totalCount
    }
  } catch (mongoError) {
    logActionError({ loki_stream: LOKI_STREAMS.takedowns, app_action: 'getTakedowns', message: 'getTakedowns failed' }, mongoError)
    console.error('Error fetching takedowns from MongoDB:', mongoError)
    return { takedowns: [], totalCount: 0 }
  }
})

export const getTakedownMetrics = traceAction('getTakedownMetrics_page', async (filters = {}) => {
  const ctx = await getAuthContext()
  if (!ctx?.clientDetails?.project_name || !ctx.dbName) return { inProgress: 0, successful: 0, reAppeal: 0, failed: 0 }

  try {
    const client = await clientPromise
    const db = client.db(ctx.dbName)
    const collection = postsCollection(db)
    
    // Create filters clone without status
    const metricsFilters = { ...filters }
    delete metricsFilters.status
    
    const { dateFilterStage, statusOverride, hasDateFilters } = buildTakedownDateFilterStages(filters)
    const matchStage = applyStatusOverride(buildTakedownMatchQuery(metricsFilters), statusOverride)

    const pipeline = [
      { $match: matchStage },
    ]

    if (hasDateFilters) {
      pipeline.push({ $addFields: buildTakedownDateAddFields() })
      pipeline.push({ $match: dateFilterStage })
    }

    pipeline.push({
      $group: {
        _id: '$workflow.takedown_status',
        count: { $sum: 1 },
      },
    })

    const metrics = await runInSpan(
      'takedowns.getTakedownMetrics.mongo_aggregate',
      async () => collection.aggregate(pipeline).toArray(),
      { 'app.span_type': 'mongo_query' }
    )

    return metrics.reduce((acc, curr) => {
      const status = curr._id ? curr._id.toLowerCase() : 'unknown'
      if (['initiated', 'under_review'].includes(status)) acc.inProgress += curr.count;
      else if (status === 'takedown_successful' || status === 'takedown successful') acc.successful += curr.count;
      else if (status === 're_appeal_takedown' || status === 'appealed again') acc.reAppeal += curr.count;
      else if (status === 'takedown_failed' || status === 'takedown failed') acc.failed += curr.count;
      return acc;
    }, { inProgress: 0, successful: 0, reAppeal: 0, failed: 0 });
    
  } catch (error) {
    logActionError({ loki_stream: LOKI_STREAMS.takedowns, app_action: 'getTakedownMetrics', message: 'getTakedownMetrics failed' }, error)
    console.error('Error fetching takedown metrics:', error)
    return { inProgress: 0, successful: 0, reAppeal: 0, failed: 0 }
  }
})

async function requireTakedownReviewer() {
  const ctx = await getAuthContext()
  if (!ctx?.clientDetails?.project_name || !ctx.dbName) {
    return { error: 'Unauthorized' }
  }
  if (ctx.clientDetails.permission !== 'reviewer') {
    return { error: 'Unauthorized: Reviewer access required' }
  }
  if (!ctx.user) {
    return { error: 'Unauthorized' }
  }
  return { ctx }
}

/**
 * Request a presigned PUT URL for a takedown document upload.
 */
export const initTakedownDocumentUpload = traceAction('initTakedownDocumentUpload', async (takedownId, fileMeta) => {
  const auth = await requireTakedownReviewer()
  if (auth.error) return { success: false, error: auth.error }

  if (!takedownId) return { success: false, error: 'Missing takedown ID' }

  const { fileName, contentType, fileSize } = fileMeta || {}
  const validationError = validateTakedownDocumentMeta({ contentType, fileSize })
  if (validationError) {
    return { success: false, error: validationError }
  }

  try {
    const sanitizedFileName = sanitizeUploadFileName(fileName)
    const s3Key = `takedown-cases/${takedownId}/${Date.now()}-${sanitizedFileName}`
    const s3Url = buildS3PublicUrl(s3Key)
    const uploadUrl = await getSignedUploadUrl(s3Key, contentType)

    return { success: true, uploadUrl, s3Key, s3Url }
  } catch (error) {
    logActionError({ loki_stream: LOKI_STREAMS.takedowns, app_action: 'initTakedownDocumentUpload', message: 'initTakedownDocumentUpload failed' }, error)
    console.error('initTakedownDocumentUpload error:', error)
    return { success: false, error: error.message }
  }
})

/**
 * Confirm a direct S3 upload and persist the document record.
 */
export const confirmTakedownDocumentUpload = traceAction('confirmTakedownDocumentUpload', async (takedownId, uploadMeta) => {
  const auth = await requireTakedownReviewer()
  if (auth.error) return { success: false, error: auth.error }

  const { ctx } = auth
  const user = ctx.user

  if (!takedownId) return { success: false, error: 'Missing takedown ID' }

  const { s3Key, fileName, fileType, fileSize } = uploadMeta || {}
  if (!s3Key || !fileName || !fileType) {
    return { success: false, error: 'Missing upload metadata' }
  }

  const expectedPrefix = `takedown-cases/${takedownId}/`
  if (!s3Key.startsWith(expectedPrefix)) {
    return { success: false, error: 'Invalid upload key' }
  }

  const validationError = validateTakedownDocumentMeta({ contentType: fileType, fileSize })
  if (validationError) {
    return { success: false, error: validationError }
  }

  try {
    const head = await headS3Object(s3Key)
    if (!head) {
      return { success: false, error: 'Upload not found in S3' }
    }

    const sizeError = validateS3HeadSize(head, TAKEDOWN_DOC_MAX_BYTES)
    if (sizeError) {
      return { success: false, error: sizeError }
    }

    const client = await clientPromise
    const db = client.db(ctx.dbName)

    const documentRecord = {
      id: crypto.randomUUID(),
      file_name: fileName,
      file_type: fileType,
      file_size: head.contentLength,
      s3_key: s3Key,
      uploaded_by: user.id,
      created_at: new Date().toISOString()
    }

    const eventRecord = {
      id: crypto.randomUUID(),
      action: 'document_uploaded',
      event: 'Document Uploaded',
      details: `Uploaded document: ${fileName}`,
      created_by: user.id,
      date: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }

    const now = new Date()

    await postsCollection(db).updateOne(
      { _id: new ObjectId(takedownId) },
      {
        $push: { 'takedown.documents': documentRecord },
        $set: { 'system.updated_at': now },
      },
    )

    await insertCaseEvent(db, {
      entityType: 'post',
      entityId: takedownId,
      eventType: 'Document Uploaded',
      actor: user.id,
      summary: eventRecord.details,
      payload: eventRecord,
    })

    revalidatePath(`/takedowns/case/${takedownId}`)
    return { success: true }
  } catch (error) {
    logActionError({ loki_stream: LOKI_STREAMS.takedowns, app_action: 'confirmTakedownDocumentUpload', message: 'confirmTakedownDocumentUpload failed' }, error)
    console.error('confirmTakedownDocumentUpload error:', error)
    return { success: false, error: error.message }
  }
})

/**
 * Get documents for a takedown case
 */
export const getTakedownDocuments = traceAction('getTakedownDocuments', async (takedownId) => {
  const ctx = await getAuthContext()
  if (!ctx?.clientDetails?.project_name || !ctx.dbName) return []

  try {
    const client = await clientPromise
    const db = client.db(ctx.dbName)
    
    const post = await runInSpan(
      'takedowns.getTakedownDocuments.mongo_query',
      async () =>
        postsCollection(db).findOne({ _id: new ObjectId(takedownId) }),
      { 'app.span_type': 'mongo_query' },
    )
    const documents = getTakedownDocumentsFromPost(post)
    if (!documents.length) {
      return []
    }

    const sortedDocs = documents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    
    // Generate signed view URLs for all documents so frontend can preview them
    const docsWithUrls = await runInSpan(
      'takedowns.getTakedownDocuments.s3_signing',
      async () =>
        Promise.all(sortedDocs.map(async (doc) => {
          const viewUrl = await getSignedViewUrl(doc.s3_key)
          return { ...doc, view_url: viewUrl }
        })),
      { 'app.span_type': 's3_signing' }
    )
    
    return docsWithUrls
  } catch (error) {
    logActionError({ loki_stream: LOKI_STREAMS.takedowns, app_action: 'getTakedownDocuments', message: 'getTakedownDocuments failed' }, error)
    console.error('Error fetching documents:', error)
    return []
  }
})

/**
 * Generate download URL for a document
 */
export const getDocumentDownloadUrl = traceAction('getDocumentDownloadUrl', async (documentId) => {
  const ctx = await getAuthContext()
  if (!ctx?.clientDetails?.project_name || !ctx.dbName) return null

  try {
    const client = await clientPromise
    const db = client.db(ctx.dbName)
    
    const post = await postsCollection(db).findOne({
      $or: [
        { 'takedown.documents.id': documentId },
        { 'takedown_info.documents.id': documentId },
      ],
    })
    if (!post) return null

    const documents = getTakedownDocumentsFromPost(post)
    const doc = documents.find((d) => d.id === documentId)
    if (!doc) return null

    return await getSignedDownloadUrl(doc.s3_key, doc.file_name)
  } catch (error) {
    logActionError({ loki_stream: LOKI_STREAMS.takedowns, app_action: 'getDocumentDownloadUrl', message: 'getDocumentDownloadUrl failed' }, error)
    console.error('Error generating document download url:', error)
    return null
  }
})

/**
 * Fetch specific takedown details including Mongo post data and history
 */
export const getTakedownDetails = traceAction('getTakedownDetails', async (id) => {
  const ctx = await getAuthContext()
  if (!ctx?.clientDetails?.project_name || !ctx.dbName) return null

  try {
    const client = await clientPromise
    const db = client.db(ctx.dbName)

    let post = await runInSpan(
      'takedowns.getTakedownDetails.mongo_query',
      async () =>
        postsCollection(db).findOne({ _id: new ObjectId(id) }),
      { 'app.span_type': 'mongo_query' },
    )

    if (!post) return null

    const normalizedPost = await runInSpan(
      'takedowns.getTakedownDetails.s3_signing',
      async () => normalizeS3Post(post, db),
      { 'app.span_type': 's3_signing' },
    )

    const takedownInfo = buildTakedownInfoForUi(post)
    const rawEvents = await fetchPostCaseEvents(db, id)
    const history = mapCaseEventsToTakedownHistory(rawEvents)
    history.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    const takedown = {
      id: normalizedPost._id,
      status: takedownInfo.status || 'initiated',
      created_at: takedownInfo.takedown_start_date || normalizedPost.updated_at || normalizedPost.created_at || null,
      post_platform_id: normalizedPost.post_id,
      notes: getTakedownNotesFromPost(post),
    }

    return {
      takedown,
      history,
      post: normalizedPost,
    }
  } catch (e) {
    logActionError({ loki_stream: LOKI_STREAMS.takedowns, app_action: 'getTakedownDetails', message: 'getTakedownDetails failed' }, e)
    console.error('MongoDB fetch error:', e)
    return null
  }
})

/**
 * Update takedown status/details and log history
 */
export const updateTakedown = traceAction('updateTakedown', async (id, updates, message) => {
  const ctx = await getAuthContext()
  if (!ctx?.clientDetails?.project_name || !ctx.dbName) return { success: false, error: 'Unauthorized' }
  if (ctx.clientDetails.permission !== 'reviewer') {
    return { success: false, error: 'Unauthorized: Reviewer access required' }
  }

  const user = ctx.user

  try {
    const client = await clientPromise
    const db = client.db(ctx.dbName)
    
    const updateFields = {
      'system.updated_at': new Date(),
    }
    if (updates.status !== undefined) {
      updateFields['workflow.takedown_status'] = updates.status
      updateFields['takedown.status'] = updates.status
      if (updates.status === 'takedown_successful') {
        updateFields['takedown.completed_at'] = new Date()
        updateFields['workflow.visibility_status'] = 'down'
      }
    }

    const eventRecord = {
      id: crypto.randomUUID(),
      action: 'update',
      event: 'Status Update',
      details: message,
      created_by: user?.id,
      date: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }

    await postsCollection(db).updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields },
    )

    await insertCaseEvent(db, {
      entityType: 'post',
      entityId: id,
      eventType: 'Status Update',
      actor: user?.id,
      summary: message,
      payload: {
        ...eventRecord,
        status: updates.status,
      },
    })

    revalidatePath(`/takedowns/case/${id}`)
    return { success: true }
  } catch (error) {
    logActionError({ loki_stream: LOKI_STREAMS.takedowns, app_action: 'updateTakedown', message: 'updateTakedown failed' }, error)
    console.error('Update takedown error:', error)
    return { success: false, error: error.message }
  }
})

/**
 * Add a note to the takedown
 */
export const addTakedownNote = traceAction('addTakedownNote', async (id, noteContent) => {
  const ctx = await getAuthContext()
  if (!ctx?.clientDetails?.project_name || !ctx.dbName) return { success: false, error: 'Unauthorized' }
  if (ctx.clientDetails.permission !== 'reviewer') {
    return { success: false, error: 'Unauthorized: Reviewer access required' }
  }

  const user = ctx.user

  try {
    const client = await clientPromise
    const db = client.db(ctx.dbName)

    const formattedNote = `[${new Date().toLocaleString()}] ${noteContent}`
    const now = new Date()

    const eventRecord = {
      id: crypto.randomUUID(),
      action: 'note_added',
      event: 'Note Added',
      details: noteContent,
      created_by: user?.id,
      date: now.toISOString(),
      created_at: now.toISOString(),
    }

    await postsCollection(db).updateOne(
      { _id: new ObjectId(id) },
      {
        $push: { 'takedown.notes': formattedNote },
        $set: { 'system.updated_at': now },
      },
    )

    await insertCaseEvent(db, {
      entityType: 'post',
      entityId: id,
      eventType: 'Note Added',
      actor: user?.id,
      summary: noteContent,
      payload: eventRecord,
    })

    revalidatePath(`/takedowns/case/${id}`)
    return { success: true }
  } catch (error) {
    logActionError({ loki_stream: LOKI_STREAMS.takedowns, app_action: 'addTakedownNote', message: 'addTakedownNote failed' }, error)
    console.error('Add takedown note error:', error)
    return { success: false, error: error.message }
  }
})

/**
 * Fetch all takedown IDs matching the current filters for bulk actions
 */
export const getAllTakedownIds = traceAction('getAllTakedownIds', async (filters = {}) => {
  const ctx = await getAuthContext()
  if (!ctx?.clientDetails?.project_name || !ctx.dbName) return []

  try {
    const client = await clientPromise
    const db = client.db(ctx.dbName)
    const collection = postsCollection(db)

    const { dateFilterStage, statusOverride, hasDateFilters } = buildTakedownDateFilterStages(filters)
    const matchStage = applyStatusOverride(buildTakedownMatchQuery(filters), statusOverride)

    const pipeline = [
      { $match: matchStage },
      { $addFields: buildTakedownDateAddFields() },
      ...(hasDateFilters ? [{ $match: dateFilterStage }] : []),
      { $project: { _id: 1 } },
    ]

    const result = await runInSpan(
      'takedowns.getAllTakedownIds.mongo_aggregate',
      async () => collection.aggregate(pipeline).toArray(),
      { 'app.span_type': 'mongo_query' }
    )
    return result.map(doc => doc._id.toString())
  } catch (error) {
    logActionError({ loki_stream: LOKI_STREAMS.takedowns, app_action: 'getAllTakedownIds', message: 'getAllTakedownIds failed' }, error)
    console.error('Error fetching all takedown IDs:', error)
    return []
  }
})