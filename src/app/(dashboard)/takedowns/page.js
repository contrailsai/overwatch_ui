import TakedownsList from './TakedownsList'
import { getTakedowns, checkReviewerPermission, getTakedownMetrics } from './actions'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { getPoiFilterOptions } from '@/app/(dashboard)/pois/actions'
import { runInSpan } from '@/utils/tracing'
import PageHeader from "@/components/PageHeader"
export const metadata = {
  title: 'overwatch - Takedowns',
  description: 'Manage and track active content removal requests.',
};

export default async function TakedownsPage({ searchParams }) {
  const [resolvedParams, clientData] = await Promise.all([searchParams, getClientandProjectDetails()])

  const filters = {
    status: resolvedParams.status || 'all',
    platform: resolvedParams.platform || 'all',
    violations: resolvedParams.violations || 'all',
    risk_priority: resolvedParams.risk_priority || 'all',
    visibility_status: resolvedParams.visibility_status || 'all',
    pois: resolvedParams.pois || 'all',
    q: resolvedParams.q || null,
    mode: resolvedParams.mode || null,
    original_date_from: resolvedParams.original_date_from || null,
    original_date_to: resolvedParams.original_date_to || null,
    takedown_date_from: resolvedParams.takedown_date_from || null,
    takedown_date_to: resolvedParams.takedown_date_to || null,
    takedown_successful_date_from: resolvedParams.takedown_successful_date_from || null,
    takedown_successful_date_to: resolvedParams.takedown_successful_date_to || null,
    page: resolvedParams.page || '1',
    pageSize: resolvedParams.pageSize || '25'
  }

  // URL-mode lists are fetched client-side (paste payload cannot live in the query string).
  const skipServerList = filters.mode === 'urls'

  const [listResult, metrics, isReviewer, poiOptionsRes] = await Promise.all([
    skipServerList
      ? Promise.resolve({ takedowns: [], totalCount: 0 })
      : runInSpan(
          'rsc.takedowns_page.takedowns_query',
          async () => getTakedowns(filters),
          { 'app.span_type': 'rsc_fetch', 'app.surface': 'rsc', 'app.fetch_target': 'takedowns_list' }
        ),
    skipServerList
      ? Promise.resolve({ inProgress: 0, successful: 0, reAppeal: 0, failed: 0 })
      : runInSpan(
          'rsc.takedowns_page.metrics_query',
          async () => getTakedownMetrics(filters),
          { 'app.span_type': 'rsc_fetch', 'app.surface': 'rsc', 'app.fetch_target': 'takedown_metrics' }
        ),
    checkReviewerPermission(),
    runInSpan(
      'rsc.takedowns_page.poi_filter_options',
      async () => getPoiFilterOptions(),
      { 'app.span_type': 'rsc_fetch', 'app.surface': 'rsc', 'app.fetch_target': 'poi_filter_options' }
    ),
  ])

  const { takedowns, totalCount } = listResult
  const { project } = clientData || {}

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <PageHeader title="Takedown Requests" description="Manage and track active content removal requests" />
      <TakedownsList
        initialTakedowns={takedowns}
        initialFilters={filters}
        isReviewer={isReviewer}
        metrics={metrics}
        project={project}
        projectLabels={project?.project_details?.labels || []}
        poiOptions={poiOptionsRes?.pois || []}
        totalCount={totalCount}
      />
    </div>
  )
}
