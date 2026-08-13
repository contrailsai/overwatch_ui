'use server'

import path from 'path'
import clientPromise from '@/utils/mongodb/client'
import { uploadFileToS3, getSignedUploadUrl, headS3Object, buildS3PublicUrl } from '@/utils/aws/s3'
import {
  MANUAL_POST_MEDIA_MAX_BYTES,
  MANUAL_POST_MEDIA_MAX_ITEMS,
  validateManualPostMediaMeta,
  validateS3HeadSize,
} from '@/utils/aws/upload-validation'
import { sendContentModerationSqsMessage } from '@/utils/aws/sqs'
import { traceAction, runInSpan } from '@/utils/tracing'
import { requireRole } from '@/utils/auth-context'
import { buildStrictPostDocument } from '@/utils/manual-post/buildStrictPostDocument'
import { ensureProfileForManualPost } from '@/utils/manual-post/ensureProfileForManualPost'
import { COLLECTIONS, postsCollection } from '@/utils/mongodb/collections'
import { triggerContrailsPostProcess } from '@/utils/embeddings/triggerContrailsPostProcess'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'

const MAX_MEDIA_ITEMS = MANUAL_POST_MEDIA_MAX_ITEMS
const MAX_DOWNLOAD_BYTES = MANUAL_POST_MEDIA_MAX_BYTES
const FETCH_TIMEOUT_MS = 30_000
const MEDIA_STAGGER_MS = 500

/**
 * @param {unknown} raw
 * @returns {{ error: string } | { body: Record<string, unknown> }}
 */
function parseSubmitPayload(raw) {
  if (typeof FormData !== 'undefined' && raw instanceof FormData) {
    const json = raw.get('payload')
    if (typeof json !== 'string') {
      return { error: 'Invalid form submission' }
    }
    let body
    try {
      body = JSON.parse(json)
    } catch {
      return { error: 'Invalid form payload' }
    }
    return { body }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'Invalid payload' }
  }
  return { body: /** @type {Record<string, unknown>} */ (raw) }
}

function isValidAbsoluteUrl(s) {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function extensionFromContentType(ct) {
  if (!ct) return '.bin'
  const main = ct.split(';')[0].trim().toLowerCase()
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
  }
  return map[main] || '.bin'
}

function platformFolderPrefix(platformRaw) {
  const s = String(platformRaw || 'facebook').trim()
  if (!s) return 'Facebook_data'
  return `${s.charAt(0).toUpperCase()}${s.slice(1).toLowerCase()}_data`
}

function manualPostMediaKey(platform, postId, index, fileName, contentType) {
  const folder = platformFolderPrefix(platform)
  let ext = extensionFromContentType(contentType)
  const fromName = path.extname(fileName || '').toLowerCase()
  if (fromName && fromName.length <= 8) {
    ext = fromName
  }
  if (ext === '.jpe') ext = '.jpg'
  if (ext === '.bin' && fromName) ext = fromName
  return `${folder}/${postId}/${index}${ext}`
}

function manualPostMediaPrefix(platform, postId) {
  return `${platformFolderPrefix(platform)}/${postId}/`
}

/**
 * @param {Record<string, unknown>} body
 */
function validatePayload(body) {
  const platform = String(body.platform ?? '').trim()
  const id = String(body.id ?? '').trim()
  const content = String(body.content ?? '').trim()
  const url = String(body.url ?? '').trim()
  const authorName = String(body.authorName ?? '').trim()
  const authorUrl = String(body.authorUrl ?? '').trim()

  if (!platform) return { error: 'Platform is required' }
  if (!id) return { error: 'Post id is required' }
  if (!content) return { error: 'Content is required' }
  if (!url) return { error: 'URL is required' }
  if (!isValidAbsoluteUrl(url)) {
    return { error: 'URL must be a valid absolute URL' }
  }
  if (authorUrl) {
    if (!isValidAbsoluteUrl(authorUrl)) {
      return { error: 'Author URL must be empty or a valid absolute URL' }
    }
  }

  const uploadedMedia = Array.isArray(body.uploadedMedia) ? body.uploadedMedia : []
  const hasUploads = uploadedMedia.length > 0
  const mediaUrls = Array.isArray(body.mediaUrls) ? body.mediaUrls : []

  if (hasUploads && mediaUrls.length > 0) {
    return { error: 'Use either file uploads or media URLs, not both' }
  }

  if (hasUploads) {
    if (uploadedMedia.length > MAX_MEDIA_ITEMS) {
      return { error: `At most ${MAX_MEDIA_ITEMS} media items allowed` }
    }
    for (let i = 0; i < uploadedMedia.length; i++) {
      const row = uploadedMedia[i]
      if (!row || typeof row !== 'object') return { error: `Invalid uploaded media row ${i + 1}` }
      const s3Key = String(/** @type {{ s3Key?: string }} */ (row).s3Key ?? '').trim()
      const s3Url = String(/** @type {{ s3Url?: string }} */ (row).s3Url ?? '').trim()
      if (!s3Key || !s3Url) {
        return { error: `Uploaded media ${i + 1}: missing S3 reference` }
      }
    }
  } else {
    if (mediaUrls.length > MAX_MEDIA_ITEMS) {
      return { error: `At most ${MAX_MEDIA_ITEMS} media items allowed` }
    }
    for (let i = 0; i < mediaUrls.length; i++) {
      const row = mediaUrls[i]
      if (!row || typeof row !== 'object') return { error: `Invalid media row ${i + 1}` }
      const ou = String(row.original_url ?? '').trim()
      if (!ou) return { error: `Media ${i + 1}: original_url is required` }
      if (!isValidAbsoluteUrl(ou)) {
        return { error: `Media ${i + 1}: original_url must be a valid URL` }
      }
    }
  }

  return {
    data: {
      platform,
      id,
      content,
      url,
      author: { name: authorName || 'unknown', url: authorUrl },
      engagement: {
        likes: Number(body.likes) || 0,
        views: Number(body.views) || 0,
        comments: Number(body.comments) || 0,
        shares: Number(body.shares) || 0,
      },
      media_urls: hasUploads
        ? []
        : mediaUrls.map((m) => ({
            original_url: String(/** @type {{ original_url?: string }} */ (m).original_url).trim(),
            type: String(m.type || 'image').trim() || 'image',
          })),
      taken_at: body.takenAt === '' || body.takenAt == null ? undefined : body.takenAt,
      queueAiAnalysis: Boolean(body.queueAiAnalysis),
      _uploadedMedia: hasUploads ? uploadedMedia : [],
    },
  }
}

async function assertManualPostIdAvailable(dbName, postId) {
  const client = await clientPromise
  const collection = postsCollection(client.db(dbName))
  const dup = await collection.findOne({
    $or: [{ platform_post_id: postId }, { post_id: postId }, { code: postId }, { id: postId }],
  })
  if (dup) {
    return `A post with id "${postId}" already exists in this project.`
  }
  return null
}

export const initManualPostMediaUploads = traceAction(
  'initManualPostMediaUploads',
  async (platform, postId, filesMeta) => {
    try {
      const { dbName } = await requireRole(['reviewer'])

      const platformStr = String(platform ?? '').trim()
      const postIdStr = String(postId ?? '').trim()
      if (!platformStr) return { success: false, error: 'Platform is required' }
      if (!postIdStr) return { success: false, error: 'Post id is required' }

      const dupError = await assertManualPostIdAvailable(dbName, postIdStr)
      if (dupError) return { success: false, error: dupError }

      const files = Array.isArray(filesMeta) ? filesMeta : []
      if (files.length === 0) return { success: false, error: 'No files provided' }
      if (files.length > MAX_MEDIA_ITEMS) {
        return { success: false, error: `At most ${MAX_MEDIA_ITEMS} media items allowed` }
      }

      const uploads = []
      for (let i = 0; i < files.length; i++) {
        const meta = files[i] || {}
        const index = Number(meta.index ?? i)
        const fileName = String(meta.name ?? `image-${index}`)
        const contentType = String(meta.type ?? '')
        const fileSize = Number(meta.size ?? 0)

        const validationError = validateManualPostMediaMeta({ contentType, fileSize })
        if (validationError) {
          return { success: false, error: `Image ${i + 1}: ${validationError}` }
        }

        const s3Key = manualPostMediaKey(platformStr, postIdStr, index, fileName, contentType)
        const s3Url = buildS3PublicUrl(s3Key)
        const uploadUrl = await getSignedUploadUrl(s3Key, contentType)
        uploads.push({ index, uploadUrl, s3Key, s3Url, contentType })
      }

      return { success: true, uploads }
    } catch (error) {
      logActionError({
        loki_stream: LOKI_STREAMS.upload,
        app_action: 'initManualPostMediaUploads',
        message: 'initManualPostMediaUploads failed',
      }, error)
      console.error('initManualPostMediaUploads error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Init failed' }
    }
  }
)

export const confirmManualPostMediaUploads = traceAction(
  'confirmManualPostMediaUploads',
  async (platform, postId, uploaded) => {
    try {
      await requireRole(['reviewer'])

      const platformStr = String(platform ?? '').trim()
      const postIdStr = String(postId ?? '').trim()
      if (!platformStr || !postIdStr) {
        return { success: false, error: 'Platform and post id are required' }
      }

      const rows = Array.isArray(uploaded) ? uploaded : []
      if (rows.length === 0) return { success: false, error: 'No uploads to confirm' }

      const expectedPrefix = manualPostMediaPrefix(platformStr, postIdStr)
      const media = []

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || {}
        const s3Key = String(row.s3Key ?? '').trim()
        const s3Url = String(row.s3Url ?? '').trim()
        if (!s3Key.startsWith(expectedPrefix)) {
          return { success: false, error: `Invalid upload key for media ${i + 1}` }
        }

        const head = await headS3Object(s3Key)
        if (!head) {
          return { success: false, error: `Upload not found in S3 for media ${i + 1}` }
        }

        const sizeError = validateS3HeadSize(head, MANUAL_POST_MEDIA_MAX_BYTES)
        if (sizeError) {
          return { success: false, error: `Image ${i + 1}: ${sizeError}` }
        }

        const resolvedS3Url = buildS3PublicUrl(s3Key)
        media.push({ type: 'image', original_url: resolvedS3Url, s3_url: resolvedS3Url })
      }

      return { success: true, media }
    } catch (error) {
      logActionError({
        loki_stream: LOKI_STREAMS.upload,
        app_action: 'confirmManualPostMediaUploads',
        message: 'confirmManualPostMediaUploads failed',
      }, error)
      console.error('confirmManualPostMediaUploads error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Confirm failed' }
    }
  }
)

async function downloadRemoteMedia(url) {
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const lenHeader = res.headers.get('content-length')
  if (lenHeader) {
    const n = Number(lenHeader)
    if (Number.isFinite(n) && n > MAX_DOWNLOAD_BYTES) {
      throw new Error('File too large')
    }
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_DOWNLOAD_BYTES) {
    throw new Error('File too large')
  }
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  return { buffer: buf, contentType }
}

async function processMediaToS3(postId, platform, mediaRows) {
  let s3Stored = false
  const out = []
  const folder = platformFolderPrefix(platform)

  for (let idx = 0; idx < mediaRows.length; idx++) {
    if (idx > 0 && MEDIA_STAGGER_MS > 0) {
      await new Promise((r) => setTimeout(r, MEDIA_STAGGER_MS))
    }
    const row = mediaRows[idx]
    const originalUrl = row.original_url
    const mediaType = row.type || 'image'

    try {
      const { buffer, contentType } = await downloadRemoteMedia(originalUrl)
      let ext = extensionFromContentType(contentType)
      try {
        const p = new URL(originalUrl).pathname
        const pe = path.extname(p)
        if (pe && pe.length <= 8) ext = pe
      } catch {
        /* ignore */
      }
      if (ext === '.jpe') ext = '.jpg'

      const isVideo = contentType.startsWith('video/') || mediaType === 'video'
      const resolvedType = isVideo ? 'video' : 'image'

      const key = `${folder}/${postId}/${idx}${ext}`
      await uploadFileToS3(buffer, key, contentType)
      const s3Url = buildS3PublicUrl(key)
      s3Stored = true
      out.push({ type: resolvedType, original_url: originalUrl, s3_url: s3Url })
    } catch (e) {
      logActionError({ loki_stream: LOKI_STREAMS.upload, app_action: 'processRemoteMediaToS3', message: 'media download/upload failed', original_url: originalUrl }, e)
      console.error('[submitManualReviewerPost] media download/upload failed', originalUrl, e)
      out.push({ type: mediaType === 'video' ? 'video' : 'image', original_url: originalUrl, s3_url: null })
    }
  }

  return { media: out, s3Stored }
}

async function resolveUploadedMediaForSubmit(platform, postId, uploadedMedia) {
  const expectedPrefix = manualPostMediaPrefix(platform, postId)
  const media = []

  for (let i = 0; i < uploadedMedia.length; i++) {
    const row = uploadedMedia[i] || {}
    const s3Key = String(row.s3Key ?? '').trim()
    const s3Url = String(row.s3Url ?? '').trim()
    if (!s3Key.startsWith(expectedPrefix)) {
      throw new Error(`Invalid upload key for media ${i + 1}`)
    }
    const head = await headS3Object(s3Key)
    if (!head) {
      throw new Error(`Upload not found in S3 for media ${i + 1}`)
    }
    const sizeError = validateS3HeadSize(head, MANUAL_POST_MEDIA_MAX_BYTES)
    if (sizeError) {
      throw new Error(`Image ${i + 1}: ${sizeError}`)
    }
    const resolvedS3Url = buildS3PublicUrl(s3Key)
    media.push({ type: 'image', original_url: resolvedS3Url, s3_url: resolvedS3Url })
  }

  return { media, s3Stored: media.length > 0 }
}

export const submitManualReviewerPost = traceAction('submitManualReviewerPost', async (rawPayload) => {
  let dbName
  let clientDetails
  try {
    ;({ dbName, clientDetails } = await requireRole(['reviewer']))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'Insufficient permissions') {
      return { error: 'You do not have permission to add manual posts.' }
    }
    if (msg === 'Authentication required') {
      return { error: 'Not authenticated' }
    }
    throw e
  }

  const parsed = parseSubmitPayload(rawPayload)
  if ('error' in parsed) {
    return { error: parsed.error }
  }

  const { body } = parsed
  const validated = validatePayload(body)
  if (validated.error) {
    return { error: validated.error }
  }

  const { data: form } = validated
  const uploadedMedia = Array.isArray(form._uploadedMedia) ? form._uploadedMedia : []
  delete form._uploadedMedia
  const postId = form.id
  const updatedBy = clientDetails.email || clientDetails.id || 'reviewer'

  const client = await clientPromise
  const db = client.db(dbName)
  const collection = postsCollection(db)

  const dup = await runInSpan(
    'upload_content.manual_post.dup_check',
    async () =>
      collection.findOne({
        $or: [{ post_id: postId }, { code: postId }, { id: postId }],
      }),
    { 'app.span_type': 'mongo_query' }
  )
  if (dup) {
    return { error: `A post with id "${postId}" already exists in this project.` }
  }

  const { media, s3Stored } =
    uploadedMedia.length > 0
      ? await runInSpan(
          'upload_content.manual_post.media_s3_verify',
          async () => resolveUploadedMediaForSubmit(form.platform, postId, uploadedMedia),
          { 'app.span_type': 's3_verify' }
        )
      : form.media_urls.length > 0
        ? await runInSpan(
            'upload_content.manual_post.media_s3',
            async () => processMediaToS3(postId, form.platform, form.media_urls),
            { 'app.span_type': 's3_upload' }
          )
        : { media: [], s3Stored: false }

  const mergedInput = {
    platform: form.platform,
    id: form.id,
    content: form.content,
    url: form.url,
    author: form.author,
    engagement: form.engagement,
    media,
    taken_at: form.taken_at,
  }

  const doc = buildStrictPostDocument(mergedInput, s3Stored, updatedBy)

  const profileId = await runInSpan(
    'upload_content.manual_post.ensure_profile',
    async () => ensureProfileForManualPost(db, doc),
    { 'app.span_type': 'mongo_query' }
  )
  if (profileId) {
    doc.profile_id = profileId
  }

  const insertResult = await runInSpan(
    'upload_content.manual_post.insert',
    async () => collection.insertOne(doc),
    { 'app.span_type': 'mongo_query' }
  )

  const insertedId = insertResult.insertedId.toString()
  const warnings = []

  const emb = await runInSpan(
    'upload_content.manual_post.contrails_process',
    async () => triggerContrailsPostProcess(insertedId, dbName),
    { 'app.span_type': 'http_outbound' }
  )
  if (!emb.ok && emb.warning) {
    warnings.push(emb.warning)
  }

  if (form.queueAiAnalysis && process.env.AWS_CONTENT_MODERATION_SQS_QUEUE_URL) {
    const sqs = await runInSpan(
      'upload_content.manual_post.moderation_sqs',
      async () => sendContentModerationSqsMessage(dbName, COLLECTIONS.posts, insertedId),
      { 'app.span_type': 'sqs_send' }
    )
    if (!sqs) {
      warnings.push('Content moderation queue is not configured; skipped AI analysis queue.')
    }
  }

  return {
    success: true,
    insertedId,
    message: 'Post created successfully.',
    warnings: warnings.length ? warnings : undefined,
  }
})
