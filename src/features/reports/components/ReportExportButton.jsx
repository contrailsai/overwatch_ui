'use client'

import React, { useEffect } from 'react'
import { FileDown, FileText, Loader2 } from 'lucide-react'
import posthog from 'posthog-js'
import { useClient } from '@/context/ClientContext'
import { trackClientActivity } from '@/utils/supabase/metrics'
import { useReportExport } from '@/features/reports/client/use-report-export'
import { REPORT_FORMATS } from '@/features/reports/constants'
import { REPORT_EXPORT_PRESETS } from '@/features/reports/client/presets'

/**
 * Configurable export button driven by {@link REPORT_EXPORT_PRESETS}.
 * @param {{ preset: keyof typeof REPORT_EXPORT_PRESETS, posts: Array, project: object, className?: string, onStateChange?: (state: {loading: boolean, statusText: string}) => void, entityType?: 'posts'|'ads' }} props
 */
export function ReportExportButton({ preset, posts, project, className, onStateChange, entityType }) {
  const config = REPORT_EXPORT_PRESETS[preset]
  const { exportReport, loading, statusText } = useReportExport(config.format)
  const { clientDetails } = useClient()
  const isDocx = config.format === REPORT_FORMATS.DOCX
  const Icon = isDocx ? FileText : FileDown

  useEffect(() => {
    onStateChange?.({
      loading,
      statusText: loading ? statusText || config.loadingFallback : '',
    })
  }, [loading, statusText, onStateChange, config.loadingFallback])

  const handleDownload = () => {
    posthog.capture('Report Downloaded', {
      ...config.posthog,
      count: posts?.length || 0,
    })

    if (clientDetails?.id && project?.project_name) {
      trackClientActivity(
        clientDetails.id,
        project.project_name,
        'report_download',
        config.activityKey,
        clientDetails.email
      )
    }

    exportReport({
      posts,
      project,
      reportType: config.reportType,
      fileNamePrefix: config.fileNamePrefix,
      gaEventName: config.gaEventName,
      entityType,
    })
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading || posts?.length === 0}
      className={
        className ||
        'flex cursor-pointer items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50 h-auto min-h-[38px]'
      }
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        <Icon className="w-4 h-4 shrink-0" />
      )}
      <span className="whitespace-pre-line text-left leading-snug">
        {loading ? statusText || config.loadingFallback : config.idleLabel}
      </span>
    </button>
  )
}
