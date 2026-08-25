'use client'

import { useState, useEffect, useCallback } from 'react'
import { sendGAEvent } from '@next/third-parties/google'
import { createClient } from '@/utils/supabase/client'
import { getReportDownloadUrl, getOrCreateReportJob } from '@/features/reports/server/actions'
import { isReportSuccess } from '@/features/reports/lib/status'
import { waitForReportCompletion } from '@/features/reports/lib/wait-for-completion'
import {
  getRealtimeChannelPrefix,
  getFileExtension,
  getFormatLabel,
  REPORT_FORMATS,
} from '@/features/reports/constants'
import { triggerFileDownload } from '@/features/reports/client/trigger-download'

/**
 * End-to-end async report export: create/reuse job → wait for S3 path → signed download.
 * @param {'pdf'|'docx'} reportFormat
 */
export function useReportExport(reportFormat = REPORT_FORMATS.PDF) {
  const [loading, setLoading] = useState(false)
  const [statusText, setStatusText] = useState('')
  const formatLabel = getFormatLabel(reportFormat)
  const fileExt = getFileExtension(reportFormat)

  useEffect(() => {
    if (!loading || !statusText || statusText.includes('(please wait...)') || statusText.includes('Complete!')) {
      return
    }
    const timer = setTimeout(() => {
      setStatusText((prev) => prev + '\n(please wait...)')
    }, 30000)
    return () => clearTimeout(timer)
  }, [statusText, loading])

  const exportReport = useCallback(
    async ({ posts, project, profile, reportType, fileNamePrefix, gaEventName, entityType }) => {
      if (!posts?.length) return

      const errorFallback = `An error occurred while creating the ${formatLabel}`

      try {
        setLoading(true)
        setStatusText('Initializing...')

        const jobData = await getOrCreateReportJob({
          posts,
          project,
          profile,
          reportType,
          reportFormat,
          entityType,
        })

        if (!jobData?.jobId) {
          throw new Error(`Failed to initiate ${formatLabel} generation`)
        }

        let s3Url =
          jobData.s3Path && isReportSuccess(jobData.s3Path, jobData.status) ? jobData.s3Path : null

        if (!s3Url) {
          setStatusText(jobData.status || '[0%] Queued')
          const supabase = createClient()
          s3Url = await waitForReportCompletion(supabase, {
            jobId: jobData.jobId,
            channelPrefix: getRealtimeChannelPrefix(reportFormat),
            initialStatus: jobData.status,
            initialS3Path: jobData.s3Path,
            onStatus: (s) => setStatusText(s),
            timeoutMessage: errorFallback,
            failureMessageFallback: errorFallback,
            telemetry: { reportFormat, reportType },
          })
        }

        if (!s3Url) throw new Error(errorFallback)

        setStatusText('Preparing download...')
        const fileName = `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.${fileExt}`
        const signedUrl = await getReportDownloadUrl(jobData.jobId, fileName)
        if (!signedUrl) throw new Error('Failed to sign download URL')

        triggerFileDownload(signedUrl, fileName)

        if (gaEventName) {
          sendGAEvent('event', gaEventName, {
            event_id: `${reportType.toLowerCase()}_${reportFormat}_report`,
            status: 'downloaded',
          })
        }
      } catch (error) {
        console.error(`${formatLabel} report generation error:`, error)
        alert(`Failed to generate ${formatLabel} report: ${error.message || errorFallback}`)
      } finally {
        setLoading(false)
        setStatusText('')
      }
    },
    [reportFormat, formatLabel, fileExt]
  )

  return { exportReport, loading, statusText }
}

/** @deprecated Use useReportExport('pdf') */
export function usePdfExport() {
  const { exportReport, loading, statusText } = useReportExport(REPORT_FORMATS.PDF)
  return { exportPdf: exportReport, loading, statusText }
}

/** @deprecated Use useReportExport('docx') */
export function useDocxExport() {
  const { exportReport, loading, statusText } = useReportExport(REPORT_FORMATS.DOCX)
  return { exportDocx: exportReport, loading, statusText }
}
