import { CasesList } from './CasesList'
import { getPosts, getPostById } from './actions'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'

export const metadata = {
  title: 'Case List',
  description: 'Detailed investigation and execution of active cases.',
}

export default async function CasesPage({ searchParams }) {
  const { user, clientDetails, project } = await getClientandProjectDetails()

  const resolvedParams = await searchParams;
  const currentPage = resolvedParams.page ? parseInt(resolvedParams.page, 10) : 1;
  const itemsPerPage = 20;

  const filters = {
    platform: resolvedParams.platform || 'all',
    client_status: resolvedParams.status || 'To Be Reviewed',
    threat_type: resolvedParams.threat_type || 'all'
  }

  const sort = {
    field: resolvedParams.sortField || 'threat_score',
    direction: resolvedParams.sortDirection || 'desc'
  }

  const cases = await getPosts(project, currentPage, itemsPerPage, filters, sort)

  let initialCase = null;
  if (resolvedParams.case_id) {
    initialCase = await getPostById(project, resolvedParams.case_id);
  }

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <header className="bg-white border-b border-slate-200 py-5 px-8 shrink-0 flex justify-between items-center z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Content Review</h1>
          <p className="text-sm text-slate-500 mt-0.5">Detailed investigation and execution</p>
        </div>
      </header>

      <div className="flex-1 overflow-hidden relative">
        <CasesList
          cases={cases}
          project={project}
          initialFilters={filters}
          initialSort={sort}
          currentPage={currentPage}
          initialCase={initialCase}
        />
      </div>
    </main>
  )
}
