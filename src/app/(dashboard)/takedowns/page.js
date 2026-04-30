import TakedownsList from './TakedownsList'
import { getTakedowns, checkReviewerPermission, getTakedownMetrics } from './actions'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import PageHeader from "@/components/PageHeader"
export const metadata = {
  title: 'overwatch - Takedowns',
  description: 'Manage and track active content removal requests.',
};

export default async function TakedownsPage({ searchParams }) {
  const resolvedParams = await searchParams

  const filters = {
    status: resolvedParams.status || 'all',
    platform: resolvedParams.platform || 'all',
    violations: resolvedParams.violations || 'all',
    risk_priority: resolvedParams.risk_priority || 'all',
    original_date_from: resolvedParams.original_date_from || null,
    original_date_to: resolvedParams.original_date_to || null,
    processed_from: resolvedParams.processed_from || null,
    processed_to: resolvedParams.processed_to || null,
    takedown_date_from: resolvedParams.takedown_date_from || null,
    takedown_date_to: resolvedParams.takedown_date_to || null,
    page: resolvedParams.page || '1',
    pageSize: resolvedParams.pageSize || '25'
  }

  const [{ takedowns, totalCount }, metrics, { project }, isReviewer] = await Promise.all([
    getTakedowns(filters),
    getTakedownMetrics(filters),
    getClientandProjectDetails(),
    checkReviewerPermission()
  ])

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      {/* Header */}
      < PageHeader title="Takedown Requests" description="Manage and track active content removal requests" />
      <TakedownsList
        initialTakedowns={takedowns}
        initialFilters={filters}
        isReviewer={isReviewer}
        metrics={metrics}
        project={project}
        projectLabels={project?.project_details?.labels || []}
        totalCount={totalCount}
      />
    </div>
  )
}

