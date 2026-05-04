import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { getReports } from './actions'
import { ReportsList } from './ReportsList'
import PageHeader from '@/components/PageHeader'

export const metadata = {
  title: 'Reports Library',
  description: 'View and download historical reports.',
}

export default async function ReportsPage({ searchParams }) {
  const { project } = await getClientandProjectDetails()
  const resolvedParams = await searchParams

  const filters = {
    from: resolvedParams.from || null,
    to: resolvedParams.to || null,
    report_type: resolvedParams.report_type || 'all'
  }

  const reports = await getReports(project, filters)

  return (
    <main className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50/50">
      <PageHeader title="Reports Library" />
      
      <div className="flex-1">
        <ReportsList 
          reports={reports} 
          initialFilters={filters} 
        />
      </div>
    </main>
  )
}
