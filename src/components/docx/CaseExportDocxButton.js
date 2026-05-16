'use client'

import React from 'react'
import { Loader2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sendGAEvent } from '@next/third-parties/google'
import posthog from 'posthog-js'
import { useClient } from '@/context/ClientContext'
import { trackClientActivity } from '@/utils/supabase/metrics'
import { useReportExport } from '@/features/reports/client/use-report-export'
import { REPORT_FORMATS } from '@/features/reports/constants'

export function CaseExportDocxButton({ post, project, className }) {
  const { exportReport, loading } = useReportExport(REPORT_FORMATS.DOCX)
  const { clientDetails } = useClient()

  if (!post) return null

  const handleDownload = async () => {
    posthog.capture('Report Downloaded', { type: 'Single Case Report', format: 'docx', caseId: post._id })
    sendGAEvent('event', 'download_single_case_report_docx', {
      event_id: 'single_case_report_docx',
      status: 'downloading',
    })

    if (clientDetails?.id && project?.project_name) {
      trackClientActivity(clientDetails.id, project.project_name, 'report_download', 'single_case_docx', clientDetails.email)
    }

    await exportReport({
      posts: [post],
      project,
      reportType: 'Single',
      fileNamePrefix: `Case_${post._id}`,
      gaEventName: 'download_single_case_report_docx',
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={loading}
      onClick={handleDownload}
      className={className || 'gap-2 cursor-pointer disabled:cursor-not-allowed border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-100 transition-all font-semibold shadow-sm h-8'}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
      {loading ? 'Preparing...' : 'Download DOCX'}
    </Button>
  )
}
