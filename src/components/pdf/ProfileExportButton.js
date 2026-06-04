'use client'

import React from 'react'
import { Download, Loader2 } from 'lucide-react'
import posthog from 'posthog-js'
import { useClient } from '@/context/ClientContext'
import { trackClientActivity } from '@/utils/supabase/metrics'
import { useReportExport } from '@/features/reports/client/use-report-export'
import { REPORT_FORMATS } from '@/features/reports/constants'

export function ProfileExportButton({ profile, project, className, posts: postsOverride }) {
  const { exportReport, loading, statusText } = useReportExport(REPORT_FORMATS.PDF)
  const { clientDetails } = useClient()

  const handleDownload = () => {
    posthog.capture('Report Downloaded', { type: 'Profile Report', format: 'pdf', profileId: profile?._id })

    if (clientDetails?.id && project?.project_name) {
      trackClientActivity(clientDetails.id, project.project_name, 'report_download', 'profile_pdf', clientDetails.email)
    }

    const posts =
      postsOverride != null
        ? postsOverride
        : (profile.posts || []).map((id) => ({ _id: typeof id === 'string' ? id : id?._id ?? id }))

    exportReport({
      posts,
      project,
      profile,
      reportType: 'Profile',
      fileNamePrefix: `Profile_Report_${profile?.username || profile?._id}`,
      gaEventName: 'download_profile_report_pdf',
    })
  }

  return (
    <button type="button" disabled={loading} className={className} onClick={handleDownload}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Download className="w-4 h-4 shrink-0" />}
      <span className="whitespace-pre-line text-left leading-snug">
        {loading ? statusText || 'Preparing Report...' : 'PDF'}
      </span>
    </button>
  )
}

export default ProfileExportButton
