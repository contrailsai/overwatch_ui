'use server'

import { getSignedDownloadUrl } from '@/utils/aws/s3'
import { traceAction } from '@/utils/tracing'

export const getReportDownloadUrl = traceAction('getReportDownloadUrl', async (s3Url, originalName) => {
  if (!s3Url) return null

  try {
    const url = new URL(s3Url)
    let key = url.pathname.substring(1) // remove leading '/'

    return await getSignedDownloadUrl(key, originalName)
  } catch (error) {
    console.error("Error generating signed download URL for report:", error)
    return null
  }
})
