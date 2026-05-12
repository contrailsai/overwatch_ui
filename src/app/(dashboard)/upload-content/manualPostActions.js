'use server'

import path from 'path'
import clientPromise from '@/utils/mongodb/client'
import { uploadFileToS3 } from '@/utils/aws/s3'
import { sendContentModerationSqsMessage } from '@/utils/aws/sqs'
import { traceAction, runInSpan } from '@/utils/tracing'
import { requireRole } from '@/utils/auth-context'
import { buildStrictPostDocument } from '@/utils/manual-post/buildStrictPostDocument'
import { triggerContrailsPostProcess } from '@/utils/embeddings/triggerContrailsPostProcess'

const MAX_MEDIA_ITEMS = 10
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024
const FETCH_TIMEOUT_MS = 30_000
const MEDIA_STAGGER_MS = 500

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

function validatePayload(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'Invalid payload' }
  }
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

  const mediaUrls = Array.isArray(body.mediaUrls) ? body.mediaUrls : []
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
      media_urls: mediaUrls.map((m) => ({
        original_url: String(m.original_url).trim(),
        type: String(m.type || 'image').trim() || 'image',
      })),
      taken_at: body.takenAt === '' || body.takenAt == null ? undefined : body.takenAt,
      queueAiAnalysis: Boolean(body.queueAiAnalysis),
    },
  }
}

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
      const s3Url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
      s3Stored = true
      out.push({ type: resolvedType, original_url: originalUrl, s3_url: s3Url })
    } catch (e) {
      console.error('[submitManualReviewerPost] media download/upload failed', originalUrl, e)
      out.push({ type: mediaType === 'video' ? 'video' : 'image', original_url: originalUrl, s3_url: null })
    }
  }

  return { media: out, s3Stored }
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

  const validated = validatePayload(rawPayload)
  if (validated.error) {
    return { error: validated.error }
  }

  const { data: form } = validated
  const postId = form.id
  const updatedBy = clientDetails.email || clientDetails.id || 'reviewer'

  const client = await clientPromise
  const db = client.db(dbName)
  const collection = db.collection('Posts')

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
    form.media_urls.length > 0
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
      async () => sendContentModerationSqsMessage(dbName, 'Posts', insertedId),
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
