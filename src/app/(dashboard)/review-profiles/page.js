import { ProfilesList } from './ProfilesList'
import { getProfiles } from './actions'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { runInSpan } from '@/utils/tracing'
import PageHeader from '@/components/PageHeader'

export const metadata = {
    title: 'Profiles',
    description: 'Browse and investigate monitored profiles across platforms.',
}

export default async function ProfilesPage({ searchParams }) {
    const [{ clientDetails, project }, resolvedParams] = await Promise.all([
        getClientandProjectDetails(),
        searchParams,
    ])

    if (!clientDetails || !clientDetails.project_name || clientDetails.permission !== "reviewer") {
        return (
            <main className="flex-1 flex items-center justify-center bg-slate-50">
                <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">404 Not Found</h1>
                    <p className="text-slate-500">The page you are looking for does not exist.</p>
                </div>
            </main>
        )
    }
    const currentPage = resolvedParams.page ? parseInt(resolvedParams.page, 10) : 1
    const itemsPerPage = 20

    const filters = {
        platform: resolvedParams.platform || 'all',
        is_verified: resolvedParams.is_verified || 'all',
        reviewStatus: resolvedParams.reviewStatus || 'all',
        searchText: resolvedParams.search || '',
        publish_date_from: resolvedParams.publish_date_from || null,
        publish_date_to: resolvedParams.publish_date_to || null,
    }

    const profiles = await runInSpan(
        'rsc.review_profiles_page.profiles_query',
        async () => getProfiles(project, currentPage, itemsPerPage, filters),
        { 'app.span_type': 'rsc_fetch', 'app.surface': 'rsc', 'app.fetch_target': 'review_profiles' }
    )

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
                    currentPage={currentPage}
                />
            </div>
        </main>
    )
}
