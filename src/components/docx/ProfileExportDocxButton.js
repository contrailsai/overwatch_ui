'use client'

import React, { useState } from 'react'
import { Download, Loader2, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { sendGAEvent } from '@next/third-parties/google'
import posthog from 'posthog-js'
import { useClient } from '@/context/ClientContext'
import { trackClientActivity } from '@/utils/supabase/metrics'
import { useReportExport } from '@/features/reports/client/use-report-export'
import { REPORT_FORMATS, REPORT_TYPES } from '@/features/reports/constants'
import { cn } from '@/lib/utils'

const DOCX_VARIANTS = [
  {
    label: 'Full Report',
    reportType: REPORT_TYPES.PROFILE,
    fileNamePrefix: (profile) => `Profile_Report_${profile?.username || profile?._id || 'unknown'}`,
    gaEventName: 'download_profile_report_docx',
    posthogType: 'Profile Report',
    activityKey: 'profile_docx',
  },
  {
    label: 'Simple Report',
    reportType: REPORT_TYPES.SIMPLE_PROFILE,
    fileNamePrefix: (profile) => `Simple_Profile_Report_${profile?.username || profile?._id || 'unknown'}`,
    gaEventName: 'download_profile_report_simple_docx',
    posthogType: 'Simple Profile Report',
    activityKey: 'profile_simple_docx',
  },
]

export function ProfileExportDocxButton({ profile, project, className, posts: postsOverride }) {
  const [open, setOpen] = useState(false)
  const { exportReport, loading } = useReportExport(REPORT_FORMATS.DOCX)
  const { clientDetails } = useClient()

  const getPosts = () =>
    postsOverride != null
      ? postsOverride
      : (profile?.posts || []).map((id) => (typeof id === 'string' ? { _id: id } : id))

  const handleDownload = async (variant) => {
    setOpen(false)

    posthog.capture('Report Downloaded', {
      type: variant.posthogType,
      format: 'docx',
      profileId: profile?._id,
    })
    sendGAEvent('event', variant.gaEventName, {
      event_id: variant.activityKey,
      status: 'downloading',
      profile_id: profile?._id,
    })

    if (clientDetails?.id && project?.project_name) {
      trackClientActivity(
        clientDetails.id,
        project.project_name,
        'report_download',
        variant.activityKey,
        clientDetails.email
      )
    }

    await exportReport({
      posts: getPosts(),
      project,
      profile,
      reportType: variant.reportType,
      fileNamePrefix: variant.fileNamePrefix(profile),
      gaEventName: variant.gaEventName,
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={loading} className={cn('gap-1', className)}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 shrink-0" />}
          {loading ? 'Preparing Report...' : 'DOCX'}
          {!loading && <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="end">
        {DOCX_VARIANTS.map((variant) => (
          <button
            key={variant.reportType}
            type="button"
            disabled={loading}
            onClick={() => handleDownload(variant)}
            className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 rounded-md hover:bg-slate-50 hover:text-blue-600 transition-colors disabled:opacity-50"
          >
            {variant.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

export default ProfileExportDocxButton
