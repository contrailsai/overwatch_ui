import { getReports } from './actions'
import { ReportsList } from './ReportsList'
import PageHeader from '@/components/PageHeader'

export const metadata = {
  title: 'Reports Library',
  description: 'View and download historical reports.',
}

export default async function ReportsPage({ searchParams }) {
  const resolvedParams = await searchParams

  const filters = {
    from: resolvedParams.from || null,
    to: resolvedParams.to || null,
    report_type: resolvedParams.report_type || 'all'
  }

  const reports = await getReports(filters)

  return (
    <main className="flex-1 flex flex-col min-h-0 h-full overflow-y-auto bg-slate-50/50">
      <PageHeader title="Reports Library" />

      <div className="flex-1 min-h-0 pb-[env(safe-area-inset-bottom)]">
        <ReportsList
          reports={reports}
          initialFilters={filters}
        />
      </div>
    </main>
  )
}
