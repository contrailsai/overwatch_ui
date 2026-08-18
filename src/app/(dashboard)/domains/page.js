import { DomainsList } from './DomainsList'
import { getDomains } from './actions'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import PageHeader from '@/components/PageHeader'

export const metadata = {
    title: 'Domains',
    description: 'Domains discovered across posts, ads, and profiles, with analyzer findings.',
}

export default async function DomainsPage({ searchParams }) {
    const { project } = await getClientandProjectDetails()

    const resolvedParams = await searchParams
    const currentPage = resolvedParams.page ? parseInt(resolvedParams.page, 10) : 1
    const itemsPerPage = Math.min(parseInt(resolvedParams.limit, 10) || 25, 100)

    const filters = {
        status: resolvedParams.status || 'all',
        risk: resolvedParams.risk || 'all',
        searchText: resolvedParams.search || '',
    }

    const sort = {
        field: resolvedParams.sortField || null,
        direction: resolvedParams.sortDirection || 'desc',
    }

    const domains = await getDomains(currentPage, itemsPerPage, filters, sort)

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
            <PageHeader title="Domains" description="Domains discovered across posts, ads, and profiles" />

            <div className="flex-1 overflow-hidden relative">
                <DomainsList
                    domains={domains}
                    project={project}
                    initialFilters={filters}
                    initialSort={sort}
                    currentPage={currentPage}
                    itemsPerPage={itemsPerPage}
                />
            </div>
        </main>
    )
}
