import { DomainsList } from './DomainsList'
import { getDomains, getDomainById } from './actions'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import PageHeader from '@/components/PageHeader'
import { isSectionEnabled } from '@/lib/project-sections'
import { DisabledSectionFallback } from '@/components/DisabledSectionFallback'

export const metadata = {
    title: 'Domains',
    description: 'Domains discovered across posts, ads, and profiles, with analyzer findings.',
}

export default async function DomainsPage({ searchParams }) {
    const { project } = await getClientandProjectDetails()

    if (!isSectionEnabled(project, 'domains')) {
        return <DisabledSectionFallback />
    }

    const resolvedParams = await searchParams
    const currentPage = resolvedParams.page ? parseInt(resolvedParams.page, 10) : 1
    const itemsPerPage = Math.min(parseInt(resolvedParams.limit, 10) || 25, 100)

    const filters = {
        status: resolvedParams.status || 'all',
        risk: resolvedParams.risk || 'all',
        searchText: resolvedParams.search || '',
        visibility_status: resolvedParams.visibility_status || 'all',
    }

    const sort = {
        field: resolvedParams.sortField || 'reviewed_at',
        direction: resolvedParams.sortDirection === 'asc' ? 'asc' : 'desc',
    }

    const [domains, initialDomain] = await Promise.all([
        getDomains(currentPage, itemsPerPage, filters, sort),
        resolvedParams.domain_id
            ? getDomainById(resolvedParams.domain_id)
            : Promise.resolve(null),
    ])

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#f4f6f8]">
            <PageHeader title="Domains" description="Domains discovered across posts, ads, and profiles" />

            <div className="flex-1 overflow-hidden relative">
                <DomainsList
                    domains={domains}
                    project={project}
                    initialFilters={filters}
                    initialSort={sort}
                    currentPage={currentPage}
                    itemsPerPage={itemsPerPage}
                    initialDomain={initialDomain}
                />
            </div>
        </main>
    )
}
