import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

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
    console.error("Error deleting from S3:", error)
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
    console.error("Error uploading to S3:", error)
    throw error
  }
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
    console.error("Error generating signed URL:", error)
    return null // Return original or null on failure
  }
}
