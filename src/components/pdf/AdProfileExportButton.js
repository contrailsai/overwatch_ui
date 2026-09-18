'use client'

import React from 'react'
import { Download, Loader2 } from 'lucide-react'
import posthog from 'posthog-js'
import { useClient } from '@/context/ClientContext'
import { trackClientActivity } from '@/utils/supabase/metrics'
import { useReportExport } from '@/features/reports/client/use-report-export'
import { REPORT_FORMATS } from '@/features/reports/constants'

export function AdProfileExportButton({ profile, project, className }) {
  const { exportReport, loading, statusText } = useReportExport(REPORT_FORMATS.PDF)
  const { clientDetails } = useClient()

  const handleDownload = () => {
    if (!profile?._id) return

    posthog.capture('Report Downloaded', {
      type: 'Ad Profile Report',
      format: 'pdf',
      profileId: profile._id,
    })

    if (clientDetails?.id && project?.project_name) {
      trackClientActivity(
        clientDetails.id,
        project.project_name,
        'report_download',
        'ad_profile_pdf',
        clientDetails.email
      )
    }

    const nameSlug = String(profile.display_name || profile.page_name || profile._id)
      .replace(/[^\w.-]+/g, '_')
      .slice(0, 80)

    exportReport({
      posts: [{ _id: profile._id }],
      project,
      reportType: 'Summary',
      fileNamePrefix: `Ad_Profile_Report_${nameSlug}`,
      gaEventName: 'download_ad_profile_report_pdf',
      entityType: 'ad_profiles',
    })
  }

  return (
    <button type="button" disabled={loading || !profile?._id} className={className} onClick={handleDownload}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Download className="w-4 h-4 shrink-0" />}
      <span className="whitespace-pre-line text-left leading-snug">
        {loading ? statusText || 'Preparing Report...' : 'PDF'}
      </span>
    </button>
  )
}

export default AdProfileExportButton
