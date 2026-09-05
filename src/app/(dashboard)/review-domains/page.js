import { getDomains, getDomainById } from './actions'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { ReviewDomainsInterface } from './ReviewDomainsInterface'
import PageHeader from '@/components/PageHeader'
import { isSectionEnabled } from '@/lib/project-sections'
import { DisabledSectionFallback } from '@/components/DisabledSectionFallback'

export const metadata = {
  title: 'Review Domains',
  description: 'Review domains discovered from posts, ads, and profiles.',
}

export default async function ReviewDomainsPage({ searchParams }) {
  const result = await getClientandProjectDetails()
  if (!result) return null

  const { clientDetails, project } = result

  if (!isSectionEnabled(project, 'domains')) {
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

  const resolvedParams = await searchParams
  const page = parseInt(resolvedParams?.page || '1', 10)
  const parsedLimit = Number.parseInt(resolvedParams?.limit, 10)
  const itemsPerPage = Math.min(Number.isNaN(parsedLimit) ? 25 : Math.max(parsedLimit, 1), 100)

  const initialFilters = {
    status: resolvedParams?.status || 'pending',
    search: resolvedParams?.search || '',
    visibility_status: resolvedParams?.visibility_status || 'all',
    risk: resolvedParams?.risk || 'all',
    sourcingDateStart: resolvedParams?.sourcingDateStart || null,
    sourcingDateEnd: resolvedParams?.sourcingDateEnd || null,
  }

  const initialSort = {
    field: resolvedParams?.sortField || 'first_seen_at',
    direction: resolvedParams?.sortDirection === 'asc' ? 'asc' : 'desc',
  }

  const { domains, totalPages, totalCount } = await getDomains(page, itemsPerPage, initialFilters, initialSort)

  let initialDomain = null
  if (resolvedParams?.domain_id) {
    initialDomain = await getDomainById(resolvedParams.domain_id)
  }

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <PageHeader title="Review Domains" description="Prioritize and verify domains discovered by the analyzer" />
      <div className="flex-1 overflow-hidden relative">
        <ReviewDomainsInterface
          initialDomains={domains}
          totalPages={totalPages}
          currentPage={page}
          initialFilters={initialFilters}
          initialSort={initialSort}
          totalCount={totalCount}
          initialDomain={initialDomain}
          itemsPerPage={itemsPerPage}
          project={project}
          clientDetails={clientDetails}
        />
      </div>
    </main>
  )
}
