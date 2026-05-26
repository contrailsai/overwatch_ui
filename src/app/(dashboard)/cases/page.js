import { CasesList } from './CasesList'
import { getPosts, getPostById, getSimilarPosts, getSemanticSearchPosts } from './actions'
import { fetch_clients_in_project } from './feature_actions'
import { requireAuthContext } from '@/utils/auth-context'
import { runInSpan } from '@/utils/tracing'
import PageHeader from '@/components/PageHeader'

export const metadata = {
  title: 'Case List',
  description: 'Detailed investigation and execution of active cases.',
}

export default async function CasesPage({ searchParams }) {
  const [{ clientDetails, project }, resolvedParams] = await Promise.all([
    requireAuthContext(),
    searchParams,
  ])

  const parsedPage = Number.parseInt(resolvedParams.page, 10)
  const parsedLimit = Number.parseInt(resolvedParams.limit, 10)
  const currentPage = Number.isNaN(parsedPage) ? 1 : Math.max(parsedPage, 1)
  const itemsPerPage = Math.min(Number.isNaN(parsedLimit) ? 25 : Math.max(parsedLimit, 1), 100)

  const filters = {
    platform: resolvedParams.platform || 'all',
    client_status: resolvedParams.status || 'all',
    visibility_status: resolvedParams.visibility_status || 'all',
    risk_priority: resolvedParams.risk_priority || 'all',
    violations: resolvedParams.violations || 'all',
    original_date_from: resolvedParams.original_date_from || null,
    original_date_to: resolvedParams.original_date_to || null,
    processed_from: resolvedParams.processed_from || null,
    processed_to: resolvedParams.processed_to || null,
    unique_clusters: resolvedParams.unique_clusters === 'true' || false
  }

  const isSimilaritySearch = !!resolvedParams.similar_to || !!resolvedParams.semantic_search;

  const sort = {
    field: resolvedParams.sortField || (isSimilaritySearch ? null : 'threat_score'),
    direction: resolvedParams.sortDirection || 'desc'
  }

  const casesPromise = runInSpan(
    'rsc.cases_page.cases_query',
    async () => (resolvedParams.semantic_search
      ? getSemanticSearchPosts(
        project,
        resolvedParams.semantic_search,
        itemsPerPage,
        filters,
        sort
      )
      : resolvedParams.similar_to
        ? getSimilarPosts(
          project,
          resolvedParams.similar_to,
          resolvedParams.search_type || 'text',
          itemsPerPage,
          filters,
          sort
        )
        : getPosts(project, currentPage, itemsPerPage, filters, sort)),
    { loki_stream: 'cases', 'app.span_type': 'rsc_fetch', 'app.surface': 'rsc', 'app.fetch_target': 'cases' }
  )

  const initialCasePromise = resolvedParams.case_id
    ? runInSpan(
      'rsc.cases_page.selected_case_query',
      async () => getPostById(project, resolvedParams.case_id),
      { loki_stream: 'cases', 'app.span_type': 'rsc_fetch', 'app.surface': 'rsc', 'app.fetch_target': 'selected_case' }
    )
    : Promise.resolve(null)

  const projectEmailsPromise = runInSpan(
    'rsc.cases_page.project_emails_query',
    async () => fetch_clients_in_project(clientDetails.project_name),
    { loki_stream: 'cases', 'app.span_type': 'rsc_fetch', 'app.surface': 'rsc', 'app.fetch_target': 'project_emails' }
  )
  const [cases, initialCase, email_n_alias] = await Promise.all([
    casesPromise,
    initialCasePromise,
    projectEmailsPromise,
  ])

  return (
    <main className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-slate-50">
      <PageHeader title="Content Review" />

      <div className="flex-1 overflow-hidden relative">
        <CasesList
          cases={cases}
          project={project}
          clientDetails={clientDetails}
          initialFilters={filters}
          initialSort={sort}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          initialCase={initialCase}
          projectEmails={email_n_alias}
        />
      </div>
    </main>
  )
}
