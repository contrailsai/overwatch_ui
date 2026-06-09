import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

export async function deleteFileFromS3(key) {
  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
  })

  try {
    await s3Client.send(command)
    return key
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'aws/s3',
      app_action: 'deleteFileFromS3',
      message: 'Error deleting from S3',
    }, error)
    console.error("Error deleting from S3:", error)
    throw error
  }
}

export function buildS3PublicUrl(key) {
  return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
}

export async function getSignedUploadUrl(key, contentType, expiresIn = 300) {
  try {
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    })
    return await getSignedUrl(s3Client, command, { expiresIn })
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'aws/s3',
      app_action: 'getSignedUploadUrl',
      message: 'Error generating signed upload URL',
    }, error)
    console.error('Error generating signed upload URL:', error)
    throw error
  }
}

/**
 * @returns {Promise<{ contentLength: number, contentType?: string } | null>}
 */
export async function headS3Object(key) {
  try {
    const command = new HeadObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    })
    const result = await s3Client.send(command)
    return {
      contentLength: result.ContentLength ?? 0,
      contentType: result.ContentType,
    }
  } catch (error) {
    if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
      return null
    }
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'aws/s3',
      app_action: 'headS3Object',
      message: 'Error checking S3 object',
    }, error)
    console.error('Error checking S3 object:', error)
    throw error
  }
}

export async function uploadFileToS3(buffer, key, contentType) {
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  })

  try {
    await s3Client.send(command)
    return key
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'aws/s3',
      app_action: 'uploadFileToS3',
      message: 'Error uploading to S3',
    }, error)
    console.error("Error uploading to S3:", error)
    throw error
  }
}

/**
 * Values in `reports_generation.s3_path` may be a full S3 HTTPS URL, a virtual-hosted URL,
 * or a raw object key. Some pipelines append `&...` without `?`, which breaks naive URL parsing.
 */
export function resolveS3ObjectKeyFromStoredPath(storedPath) {
  const raw = (storedPath || '').trim()
  if (!raw) return null

  if (/^https?:\/\//i.test(raw)) {
    try {
      const forParse = raw.includes('?') ? raw : raw.replace(/(\.[a-z0-9]{2,5})&/i, '$1?')
      const url = new URL(forParse)
      let key = url.pathname.replace(/^\//, '')
      const amp = key.indexOf('&')
      if (amp !== -1) key = key.slice(0, amp)
      return key || null
    } catch {
      return null
    }
  }

  return raw.replace(/^\//, '')
}

export async function getSignedDownloadUrl(key, originalName) {
  try {
    const encodedName = encodeURIComponent(originalName || 'document');
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodedName}`,
    })

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
    return signedUrl
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'aws/s3',
      app_action: 'getSignedDownloadUrl',
      message: 'Error generating signed download URL',
    }, error)
    console.error("Error generating signed download URL:", error)
    return null
  }
}

export async function getSignedViewUrl(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: `inline`,
    })

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
    return signedUrl
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'aws/s3',
      app_action: 'getSignedViewUrl',
      message: 'Error generating signed view URL',
    }, error)
    console.error("Error generating signed view URL:", error)
    return null
  }
}

export async function getSignedImageUrl(s3Url) {
  if (!s3Url) return null

  try {
    // Extract Key from URL

    let key = ''
    const url = new URL(s3Url)

    // Simple heuristic: if hostname contains amazonaws.com
    if (url.hostname.includes('amazonaws.com')) {
      key = url.pathname.substring(1) // remove leading '/'
    } else {
      // Fallback or custom domain, assume full path is key
      key = url.pathname.substring(1)
    }

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    })

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }) // 1 hour
    return signedUrl
  } catch (error) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'aws/s3',
      app_action: 'getSignedImageUrl',
      message: 'Error generating signed URL',
    }, error)
    console.error("Error generating signed URL:", error)
    return null // Return original or null on failure
  }
}
