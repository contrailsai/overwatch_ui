'use client'

import { ReportExportButton } from '@/features/reports/components/ReportExportButton'

export function DetailedReportDocxButton(props) {
  return <ReportExportButton preset="detailedDocx" {...props} />
}
