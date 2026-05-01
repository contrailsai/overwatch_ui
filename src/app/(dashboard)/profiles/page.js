import { ProfilesList } from './ProfilesList'
import { getProfiles } from './actions'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'

import PageHeader from '@/components/PageHeader'

export const metadata = {
    title: 'Profiles',
    description: 'Browse and investigate monitored profiles across platforms.',
}

export default async function ProfilesPage({ searchParams }) {
    const { user, clientDetails, project } = await getClientandProjectDetails()

    const resolvedParams = await searchParams
    const currentPage = resolvedParams.page ? parseInt(resolvedParams.page, 10) : 1
    const itemsPerPage = Math.min(parseInt(resolvedParams.limit, 10) || 25, 100)

    const filters = {
        platform: resolvedParams.platform || 'all',
        is_verified: resolvedParams.is_verified || 'all',
        status: resolvedParams.status || 'all',
        searchText: resolvedParams.search || '',
        publish_date_from: resolvedParams.publish_date_from || null,
        publish_date_to: resolvedParams.publish_date_to || null,
        risk: resolvedParams.risk || 'all',
        location: resolvedParams.location || '',
        follower_min: resolvedParams.follower_min || null,
        follower_max: resolvedParams.follower_max || null,
    }

    const sort = {
        field: resolvedParams.sortField || null,
        direction: resolvedParams.sortDirection || 'desc',
    }

    const profiles = await getProfiles(project, currentPage, itemsPerPage, filters, sort)

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">

            <PageHeader title="Profiles" description="Monitored accounts and their associated cases" />

            {/* <header className="bg-white border-b border-slate-200 py-5 px-8 shrink-0 flex justify-between items-center z-10">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Profiles</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Monitored accounts and their associated cases</p>
                </div>
            </header> */}

            <div className="flex-1 overflow-hidden relative">
                <ProfilesList
                    profiles={profiles}
                    project={project}
                    initialFilters={filters}
                    initialSort={sort}
                    currentPage={currentPage}
                    itemsPerPage={itemsPerPage}
                    clientDetails={clientDetails}
                />
            </div>
        </main>
    )
}
