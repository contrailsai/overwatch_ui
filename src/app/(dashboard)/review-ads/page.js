import { getAds, getAdById } from './actions'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { ReviewAdsInterface } from './ReviewAdsInterface'
import PageHeader from '@/components/PageHeader'
import { isSectionEnabled } from '@/lib/project-sections'
import { DisabledSectionFallback } from '@/components/DisabledSectionFallback'

export const metadata = {
  title: 'Review Ads',
  description: 'Review pending ads and manage ad threats.',
}

export default async function ReviewAdsPage({ searchParams }) {
  const result = await getClientandProjectDetails()
  if (!result) return null

  const { user, clientDetails, project } = result

  if (!isSectionEnabled(project, 'ads')) {
    return <DisabledSectionFallback />
  }

  if (clientDetails.permission !== 'reviewer') {
    return (
      <main className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">404 Not Found</h1>
          <p className="text-slate-500">The page you are looking for does not exist.</p>
        </div>
      </main>
    )
  }

  if (!clientDetails?.project_name) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-slate-50">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 max-w-md shadow-sm">
          <h2 className="text-xl font-bold text-amber-900 mb-3">Account Not Set Up</h2>
          <p className="text-amber-800/80 mb-6 text-sm leading-relaxed">
            Your account has been created but not yet assigned to a project.
            Please contact your administrator to complete your setup.
          </p>
          <div className="text-xs text-amber-700 bg-amber-100/50 px-3 py-2 rounded-lg font-mono">
            ID: {user.id}
          </div>
        </div>
      </div>
    )
  }

  const resolvedParams = await searchParams
  const page = parseInt(resolvedParams?.page || '1', 10)
  const parsedLimit = Number.parseInt(resolvedParams?.limit, 10)
  const itemsPerPage = Math.min(Number.isNaN(parsedLimit) ? 25 : Math.max(parsedLimit, 1), 100)

  const initialFilters = {
    channel: resolvedParams?.channel || 'all',
    status: resolvedParams?.status || 'pending',
    aiRisk: resolvedParams?.aiRisk || 'all',
    is_active: resolvedParams?.is_active || 'all',
    display_format: resolvedParams?.display_format || 'all',
    sourcingDateStart: resolvedParams?.sourcingDateStart || undefined,
    sourcingDateEnd: resolvedParams?.sourcingDateEnd || undefined,
    startDateStart: resolvedParams?.startDateStart || undefined,
    startDateEnd: resolvedParams?.startDateEnd || undefined,
    search: resolvedParams?.search || '',
  }

  const initialSort = {
    field: resolvedParams?.sortField || 'sourced_at',
    direction: resolvedParams?.sortDirection === 'asc' ? 'asc' : 'desc',
  }

  const { ads, totalPages, totalCount } = await getAds(
    project.mongo_db_map,
    page,
    itemsPerPage,
    initialFilters,
    initialSort,
  )

  let initialAd = null
  if (resolvedParams.ad_id) {
    initialAd = await getAdById(project, resolvedParams.ad_id)
  }

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <PageHeader title="Review Ads" description="Prioritize and verify ad creatives from Meta and other platforms" />
      <div className="flex-1 overflow-hidden relative">
        <ReviewAdsInterface
          initialAds={ads}
          totalPages={totalPages}
          currentPage={page}
          project={project}
          clientDetails={clientDetails}
          initialFilters={initialFilters}
          initialSort={initialSort}
          totalCount={totalCount}
          initialAd={initialAd}
          itemsPerPage={itemsPerPage}
        />
      </div>
    </main>
  )
}
