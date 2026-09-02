import { AdsList } from './AdsList'
import { getAds, getAdById } from './actions'
import { requireAuthContext } from '@/utils/auth-context'
import PageHeader from '@/components/PageHeader'
import { isSectionEnabled } from '@/lib/project-sections'
import { DisabledSectionFallback } from '@/components/DisabledSectionFallback'

export const metadata = {
  title: 'Ad List',
  description: 'Reviewed ad creatives and client workflow.',
}

export default async function AdsPage({ searchParams }) {
  const [{ project }, resolvedParams] = await Promise.all([
    requireAuthContext(),
    searchParams,
  ])

  if (!isSectionEnabled(project, 'ads')) {
    return <DisabledSectionFallback />
  }

  const parsedPage = Number.parseInt(resolvedParams.page, 10)
  const parsedLimit = Number.parseInt(resolvedParams.limit, 10)
  const currentPage = Number.isNaN(parsedPage) ? 1 : Math.max(parsedPage, 1)
  const itemsPerPage = Math.min(Number.isNaN(parsedLimit) ? 25 : Math.max(parsedLimit, 1), 100)

  const filters = {
    channel: resolvedParams.channel || 'all',
    status: resolvedParams.status || 'all',
    searchText: resolvedParams.search || '',
    start_date_from: resolvedParams.start_date_from || null,
    start_date_to: resolvedParams.start_date_to || null,
    alert_date_from: resolvedParams.alert_date_from || null,
    alert_date_to: resolvedParams.alert_date_to || null,
    risk: resolvedParams.risk || 'all',
    visibility_status: resolvedParams.visibility_status || 'all',
    display_format: resolvedParams.display_format || 'all',
  }

  const sort = {
    field: resolvedParams.sortField || 'risk',
    direction: resolvedParams.sortDirection === 'asc' ? 'asc' : 'desc',
  }

  const [ads, initialAd] = await Promise.all([
    getAds(currentPage, itemsPerPage, filters, sort),
    resolvedParams.ad_id ? getAdById(resolvedParams.ad_id) : Promise.resolve(null),
  ])

  return (
    <main className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-[#f4f6f8]">
      <PageHeader title="Ads" description="Reviewed ad creatives" />

      <div className="flex-1 overflow-hidden relative min-h-0">
        <AdsList
          ads={ads}
          project={project}
          initialFilters={filters}
          initialSort={sort}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          initialAd={initialAd}
        />
      </div>
    </main>
  )
}
