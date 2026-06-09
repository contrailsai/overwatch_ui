/**
 * Browser-safe: PUT a File/Blob directly to S3 via a presigned URL.
 * @param {File | Blob} file
 * @param {string} uploadUrl
 */
export async function uploadFileViaPresignedUrl(file, uploadUrl) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  })
  if (!res.ok) {
    throw new Error(`S3 upload failed (${res.status})`)
  }
}
