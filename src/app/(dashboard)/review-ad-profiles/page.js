import { AdProfilesList } from './AdProfilesList'
import { getAdProfiles } from './actions'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { runInSpan } from '@/utils/tracing'
import PageHeader from '@/components/PageHeader'
import { isSectionEnabled } from '@/lib/project-sections'
import { DisabledSectionFallback } from '@/components/DisabledSectionFallback'

export const metadata = {
  title: 'Review Ad Profiles',
  description: 'Review advertiser pages from Meta Ads Library and other ad platforms.',
}

export default async function ReviewAdProfilesPage({ searchParams }) {
  const [{ clientDetails, project }, resolvedParams] = await Promise.all([
    getClientandProjectDetails(),
    searchParams,
  ])

  if (!isSectionEnabled(project, 'ads')) {
    return <DisabledSectionFallback />
  }

  if (!clientDetails || !clientDetails.project_name || clientDetails.permission !== 'reviewer') {
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
    reviewStatus: resolvedParams.reviewStatus || 'all',
    searchText: resolvedParams.search || '',
    publish_date_from: resolvedParams.publish_date_from || null,
    publish_date_to: resolvedParams.publish_date_to || null,
  }

  const profiles = await runInSpan(
    'rsc.review_ad_profiles_page.profiles_query',
    async () => getAdProfiles(project, currentPage, itemsPerPage, filters),
    {
      'app.span_type': 'rsc_fetch',
      'app.surface': 'rsc',
      'app.fetch_target': 'review_ad_profiles',
    },
  )

  const initialProfileId = resolvedParams.profile_id || null

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <PageHeader
        title="Review Ad Profiles"
        description="Advertiser pages and their associated ads"
      />
      <div className="flex-1 overflow-hidden relative">
        <AdProfilesList
          profiles={profiles}
          project={project}
          initialFilters={filters}
          currentPage={currentPage}
          initialProfileId={initialProfileId}
        />
      </div>
    </main>
  )
}
