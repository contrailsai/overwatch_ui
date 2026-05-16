'use client'

import { ReportExportButton } from '@/features/reports/components/ReportExportButton'

export function ReportButton(props) {
  return <ReportExportButton preset="summaryPdf" {...props} />
}
