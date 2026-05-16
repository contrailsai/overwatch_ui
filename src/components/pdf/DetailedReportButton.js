'use client'

import { ReportExportButton } from '@/features/reports/components/ReportExportButton'

export function DetailedReportButton(props) {
  return <ReportExportButton preset="detailedPdf" {...props} />
}
