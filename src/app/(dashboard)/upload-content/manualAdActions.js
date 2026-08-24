'use server'

import path from 'path'
import clientPromise from '@/utils/mongodb/client'
import { getSignedUploadUrl, headS3Object, buildS3PublicUrl } from '@/utils/aws/s3'
import {
  MANUAL_POST_MEDIA_MAX_BYTES,
  MANUAL_POST_MEDIA_MAX_ITEMS,
  validateManualPostMediaMeta,
  validateS3HeadSize,
} from '@/utils/aws/upload-validation'
import { traceAction, runInSpan } from '@/utils/tracing'
import { requireRole } from '@/utils/auth-context'
import { buildStrictAdDocument, normalizeAdPlatform } from '@/utils/manual-ad/buildStrictAdDocument'
import { ensureAdProfileForManualAd } from '@/utils/manual-ad/ensureAdProfileForManualAd'
import { adsCollection } from '@/utils/mongodb/collections'
import { isSectionEnabled } from '@/lib/project-sections'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'

const MAX_MEDIA_ITEMS = MANUAL_POST_MEDIA_MAX_ITEMS

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
  }
  return map[main] || '.bin'
}

function adMediaFolder(platformRaw) {
  const platform = normalizeAdPlatform(platformRaw)
  return platform === 'meta' ? 'meta_ads' : `${platform}_ads`
}

function manualAdMediaKey(platform, adId, index, fileName, contentType) {
  const folder = adMediaFolder(platform)
  let ext = extensionFromContentType(contentType)
  const fromName = path.extname(fileName || '').toLowerCase()
  if (fromName && fromName.length <= 8) ext = fromName
  if (ext === '.jpe') ext = '.jpg'
  if (ext === '.bin' && fromName) ext = fromName
  return `${folder}/${adId}/${index}/0${ext}`
}

function manualAdMediaPrefix(platform, adId) {
  return `${adMediaFolder(platform)}/${adId}/`
}

function validatePayload(body) {
  const platform = normalizeAdPlatform(body.platform)
  const id = String(body.id ?? '').trim()
  const title = String(body.title ?? '').trim()
  const content = String(body.content ?? body.body ?? '').trim()
  const caption = String(body.caption ?? '').trim()
  const url = String(body.url ?? '').trim()
  const pageName = String(body.pageName ?? '').trim()
  const pageId = String(body.platformPageId ?? '').trim()
  const profileUrl = String(body.profileUrl ?? '').trim()
  const linkUrl = String(body.linkUrl ?? '').trim()

  if (!id) return { error: 'Ad id is required' }
  if (!url) return { error: 'URL is required' }
  if (!isValidAbsoluteUrl(url)) {
    return { error: 'URL must be a valid absolute URL' }
  }
  if (!title && !content && !caption) {
    return { error: 'Provide a title, body, or caption' }
  }
  if (!pageName) return { error: 'Advertiser page name is required' }
  if (profileUrl && !isValidAbsoluteUrl(profileUrl)) {
    return { error: 'Page URL must be empty or a valid absolute URL' }
  }
  if (linkUrl && !isValidAbsoluteUrl(linkUrl)) {
    return { error: 'Destination URL must be empty or a valid absolute URL' }
  }

  const uploadedMedia = Array.isArray(body.uploadedMedia) ? body.uploadedMedia : []
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

  return {
    data: {
      platform,
      id,
      title,
      content,
      caption,
      url,
      pageName,
      platformPageId: pageId,
      profileUrl,
      ctaText: String(body.ctaText ?? '').trim(),
      linkUrl,
      displayFormat: String(body.displayFormat ?? '').trim(),
      isActive: body.isActive !== false,
      taken_at: body.takenAt === '' || body.takenAt == null ? undefined : body.takenAt,
      _uploadedMedia: uploadedMedia,
    },
  }
}

async function assertManualAdIdAvailable(dbName, platform, adId) {
  const client = await clientPromise
  const collection = adsCollection(client.db(dbName))
  const dup = await collection.findOne({ platform, platform_ad_id: adId })
  if (dup) {
    return `An ad with id "${adId}" already exists in this project.`
  }
  return null
}

export const initManualAdMediaUploads = traceAction(
  'initManualAdMediaUploads',
  async (platform, adId, filesMeta) => {
    try {
      const { dbName, project } = await requireRole(['reviewer'])
      if (!isSectionEnabled(project, 'ads')) {
        return { success: false, error: 'Ads are not enabled for this project' }
      }

      const platformStr = normalizeAdPlatform(platform)
      const adIdStr = String(adId ?? '').trim()
      if (!adIdStr) return { success: false, error: 'Ad id is required' }

      const dupError = await assertManualAdIdAvailable(dbName, platformStr, adIdStr)
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

        const s3Key = manualAdMediaKey(platformStr, adIdStr, index, fileName, contentType)
        const s3Url = buildS3PublicUrl(s3Key)
        const uploadUrl = await getSignedUploadUrl(s3Key, contentType)
        uploads.push({ index, uploadUrl, s3Key, s3Url, contentType })
      }

      return { success: true, uploads }
    } catch (error) {
      logActionError({
        loki_stream: LOKI_STREAMS.upload,
        app_action: 'initManualAdMediaUploads',
        message: 'initManualAdMediaUploads failed',
      }, error)
      console.error('initManualAdMediaUploads error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Init failed' }
    }
  }
)

export const confirmManualAdMediaUploads = traceAction(
  'confirmManualAdMediaUploads',
  async (platform, adId, uploaded) => {
    try {
      await requireRole(['reviewer'])

      const platformStr = normalizeAdPlatform(platform)
      const adIdStr = String(adId ?? '').trim()
      if (!adIdStr) {
        return { success: false, error: 'Ad id is required' }
      }

      const rows = Array.isArray(uploaded) ? uploaded : []
      if (rows.length === 0) return { success: false, error: 'No uploads to confirm' }

      const expectedPrefix = manualAdMediaPrefix(platformStr, adIdStr)

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || {}
        const s3Key = String(row.s3Key ?? '').trim()
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
      }

      return { success: true }
    } catch (error) {
      logActionError({
        loki_stream: LOKI_STREAMS.upload,
        app_action: 'confirmManualAdMediaUploads',
        message: 'confirmManualAdMediaUploads failed',
      }, error)
      console.error('confirmManualAdMediaUploads error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Confirm failed' }
    }
  }
)

async function resolveUploadedMediaForSubmit(platform, adId, uploadedMedia) {
  const expectedPrefix = manualAdMediaPrefix(platform, adId)
  const media = []

  for (let i = 0; i < uploadedMedia.length; i++) {
    const row = uploadedMedia[i] || {}
    const s3Key = String(row.s3Key ?? '').trim()
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
    media.push({
      type: 'image',
      original_url: resolvedS3Url,
      s3_url: resolvedS3Url,
      role: 'card_image',
      card_index: Number(row.index ?? i),
    })
  }

  return { media, s3Stored: media.length > 0 }
}

export const submitManualReviewerAd = traceAction('submitManualReviewerAd', async (rawPayload) => {
  let dbName
  let project
  try {
    ;({ dbName, project } = await requireRole(['reviewer']))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'Insufficient permissions') {
      return { error: 'You do not have permission to add manual ads.' }
    }
    if (msg === 'Authentication required') {
      return { error: 'Not authenticated' }
    }
    throw e
  }

  if (!isSectionEnabled(project, 'ads')) {
    return { error: 'Ads are not enabled for this project' }
  }

  const parsed = parseSubmitPayload(rawPayload)
  if ('error' in parsed) {
    return { error: parsed.error }
  }

  const validated = validatePayload(parsed.body)
  if (validated.error) {
    return { error: validated.error }
  }

  const { data: form } = validated
  const uploadedMedia = Array.isArray(form._uploadedMedia) ? form._uploadedMedia : []
  delete form._uploadedMedia
  const adId = form.id

  const client = await clientPromise
  const db = client.db(dbName)
  const collection = adsCollection(db)

  const dup = await runInSpan(
    'upload_content.manual_ad.dup_check',
    async () => collection.findOne({ platform: form.platform, platform_ad_id: adId }),
    { 'app.span_type': 'mongo_query' }
  )
  if (dup) {
    return { error: `An ad with id "${adId}" already exists in this project.` }
  }

  const { media, s3Stored } =
    uploadedMedia.length > 0
      ? await runInSpan(
          'upload_content.manual_ad.media_s3_verify',
          async () => resolveUploadedMediaForSubmit(form.platform, adId, uploadedMedia),
          { 'app.span_type': 's3_verify' }
        )
      : { media: [], s3Stored: false }

  const doc = buildStrictAdDocument({ ...form, media }, s3Stored)

  const profileId = await runInSpan(
    'upload_content.manual_ad.ensure_profile',
    async () => ensureAdProfileForManualAd(db, doc),
    { 'app.span_type': 'mongo_query' }
  )
  if (profileId) {
    doc.ad_profile_id = profileId
  }

  const insertResult = await runInSpan(
    'upload_content.manual_ad.insert',
    async () => collection.insertOne(doc),
    { 'app.span_type': 'mongo_query' }
  )

  return {
    success: true,
    insertedId: insertResult.insertedId.toString(),
    message: 'Ad created successfully.',
  }
})
