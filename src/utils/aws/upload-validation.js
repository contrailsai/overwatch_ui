/** Shared upload validation for presigned PUT flows (server + client). */

export const REVIEW_IMAGE_MAX_BYTES = 20 * 1024 * 1024
export const TAKEDOWN_DOC_MAX_BYTES = 50 * 1024 * 1024
/** Reviewer-uploaded images on manual posts — same cap as review-case images. */
export const MANUAL_POST_MEDIA_MAX_BYTES = 20 * 1024 * 1024
export const MANUAL_POST_MEDIA_MAX_ITEMS = 10

const TAKEDOWN_ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
])

export function formatUploadSizeLimit(bytes) {
  const mb = bytes / (1024 * 1024)
  return Number.isInteger(mb) ? `${mb}MB` : `${mb.toFixed(1)}MB`
}

export function isImageContentType(contentType) {
  return typeof contentType === 'string' && contentType.startsWith('image/')
}

/**
 * @param {{ contentLength?: number } | null} head
 * @param {number} maxBytes
 */
export function validateS3HeadSize(head, maxBytes) {
  const size = head?.contentLength ?? 0
  if (size <= 0) {
    return 'Uploaded file is empty'
  }
  if (size > maxBytes) {
    return `File size exceeds ${formatUploadSizeLimit(maxBytes)} limit`
  }
  return null
}

export function validateReviewImageMeta({ contentType, fileSize }) {
  if (!isImageContentType(contentType)) {
    return 'Only image files are allowed'
  }
  if (fileSize > REVIEW_IMAGE_MAX_BYTES) {
    return `File size exceeds ${formatUploadSizeLimit(REVIEW_IMAGE_MAX_BYTES)} limit`
  }
  return null
}

export function validateTakedownDocumentMeta({ contentType, fileSize }) {
  const ct = (contentType || '').toLowerCase()
  if (!TAKEDOWN_ALLOWED_TYPES.has(ct)) {
    return 'Only PDF, PNG, and JPG files are allowed'
  }
  if (fileSize > TAKEDOWN_DOC_MAX_BYTES) {
    return `File size exceeds ${formatUploadSizeLimit(TAKEDOWN_DOC_MAX_BYTES)} limit`
  }
  return null
}

export function validateManualPostMediaMeta({ contentType, fileSize }) {
  if (!isImageContentType(contentType)) {
    return 'Only image files are allowed'
  }
  if (fileSize > MANUAL_POST_MEDIA_MAX_BYTES) {
    return `File exceeds ${formatUploadSizeLimit(MANUAL_POST_MEDIA_MAX_BYTES)} limit`
  }
  return null
}

export function sanitizeUploadFileName(fileName) {
  return String(fileName || 'file').replace(/[^a-zA-Z0-9.-]/g, '_')
}
