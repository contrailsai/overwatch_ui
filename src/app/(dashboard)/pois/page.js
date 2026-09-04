import { getPois } from './actions'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { isSectionEnabled } from '@/lib/project-sections'
import { DisabledSectionFallback } from '@/components/DisabledSectionFallback'
import PageHeader from '@/components/PageHeader'
import { PoisList } from './PoisList'

export const metadata = {
  title: 'POIs',
  description: 'Persons of interest monitored across posts.',
}

export default async function PoisPage({ searchParams }) {
  const { project, clientDetails } = await getClientandProjectDetails()

  if (!isSectionEnabled(project, 'posts')) {
    return <DisabledSectionFallback />
  }

  const resolvedParams = await searchParams
  const tier = resolvedParams.tier || 'all'
  const search = resolvedParams.search || ''
  const page = resolvedParams.page ? parseInt(resolvedParams.page, 10) : 1
  const limit = Math.min(parseInt(resolvedParams.limit, 10) || 50, 100)

  const data = await getPois({ tier, search, page, limit })
  const isReviewer = clientDetails?.permission === 'reviewer'

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <PageHeader title="POIs" description="Persons of interest" />
      <div className="flex-1 overflow-hidden relative">
        <PoisList
          key={`${tier}|${search}|${page}`}
          initialData={data}
          initialTier={tier}
          initialSearch={search}
          isReviewer={isReviewer}
        />
      </div>
    </main>
  )
}
