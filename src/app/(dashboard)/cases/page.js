import { CasesList } from './CasesList'
import { getPosts, getPostById } from './actions'
import { fetch_clients_in_project } from './feature_actions'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import PageHeader from '@/components/PageHeader'

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
    client_status: resolvedParams.status || 'all',
    risk_priority: resolvedParams.risk_priority || 'all',
    violations: resolvedParams.violations || 'all',
    original_date_from: resolvedParams.original_date_from || null,
    original_date_to: resolvedParams.original_date_to || null,
    processed_from: resolvedParams.processed_from || null,
    processed_to: resolvedParams.processed_to || null
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

  const emails = await fetch_clients_in_project(clientDetails.project_name);

  // console.log("got clients in project as: ", emails)

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <PageHeader title="Content Review" />

      <div className="flex-1 overflow-hidden relative">
        <CasesList
          cases={cases}
          project={project}
          clientDetails={clientDetails}
          initialFilters={filters}
          initialSort={sort}
          currentPage={currentPage}
          initialCase={initialCase}
          projectEmails={emails}
        />
      </div>
    </main>
  )
}
