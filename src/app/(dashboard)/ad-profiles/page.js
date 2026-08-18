import { AdProfilesList } from './AdProfilesList'
import { getAdProfiles } from './actions'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'

import PageHeader from '@/components/PageHeader'

export const metadata = {
    title: 'Ad Profiles',
    description: 'Browse advertiser pages and their associated ads.',
}

export default async function AdProfilesPage({ searchParams }) {
    const { project } = await getClientandProjectDetails()

    const resolvedParams = await searchParams
    const currentPage = resolvedParams.page ? parseInt(resolvedParams.page, 10) : 1
    const itemsPerPage = Math.min(parseInt(resolvedParams.limit, 10) || 25, 100)

    const filters = {
        platform: resolvedParams.platform || 'all',
        status: resolvedParams.status || 'all',
        searchText: resolvedParams.search || '',
        publish_date_from: resolvedParams.publish_date_from || null,
        publish_date_to: resolvedParams.publish_date_to || null,
        risk: resolvedParams.risk || 'all',
    }

    const sort = {
        field: resolvedParams.sortField || null,
        direction: resolvedParams.sortDirection || 'desc',
    }

    const profiles = await getAdProfiles(currentPage, itemsPerPage, filters, sort)

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">

            <PageHeader title="Ad Profiles" description="Advertiser pages and associated ads" />

            <div className="flex-1 overflow-hidden relative">
                <AdProfilesList
                    profiles={profiles}
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
