/**
 * Trigger a file download in the browser from a signed URL.
 */
export function triggerFileDownload(signedUrl, fileName) {
  const a = document.createElement('a')
  a.href = signedUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
