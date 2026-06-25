import { notFound, redirect } from 'next/navigation'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { fetch_clients_in_project } from '@/app/(dashboard)/cases/feature_actions'
import { getPostById } from '@/app/(dashboard)/cases/actions'
import { buildFeedSlug } from '@/lib/feeds/feed-slug'
import { getFeedById, getFeedPosts, getFeedPublishingHistogram } from '../actions'
import { FeedContentList } from '../FeedContentList'

export async function generateMetadata({ params }) {
  const { feedId } = await params
  const feed = await getFeedById(feedId)
  return {
    title: feed?.title ? `${feed.title} — Feeds` : 'Feed',
    description: feed?.description || 'Browse curated feed content.',
  }
}

export default async function FeedDetailPage({ params, searchParams }) {
  const result = await getClientandProjectDetails()
  if (!result) return null

  const { clientDetails, project } = result

  if (!clientDetails?.project_name) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-slate-50">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 max-w-md shadow-sm">
          <h2 className="text-xl font-bold text-amber-900 mb-3">Account Not Set Up</h2>
          <p className="text-amber-800/80 text-sm leading-relaxed">
            Your account has been created but not yet assigned to a project.
          </p>
        </div>
      </div>
    )
  }

  const { feedId } = await params
  const resolvedParams = await searchParams

  const feed = await getFeedById(feedId)
  if (!feed) notFound()

  const canonicalSlug = feed.slug || buildFeedSlug(feed)
  if (/^[a-f0-9]{24}$/i.test(feedId)) {
    const query = new URLSearchParams(
      Object.entries(resolvedParams).flatMap(([key, value]) =>
        value != null && value !== '' ? [[key, String(value)]] : []
      )
    ).toString()
    redirect(`/feeds/${canonicalSlug}${query ? `?${query}` : ''}`)
  }

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
    unique_clusters: resolvedParams.unique_clusters === 'true' || false,
  }

  const sort = {
    field: resolvedParams.sortField || 'threat_score',
    direction: resolvedParams.sortDirection === 'asc' ? 'asc' : 'desc',
  }

  const [postsResult, histogramData, initialCase, projectEmails] = await Promise.all([
    getFeedPosts(feedId, currentPage, itemsPerPage, filters, sort),
    getFeedPublishingHistogram(feedId, filters),
    resolvedParams.case_id ? getPostById(project, resolvedParams.case_id) : Promise.resolve(null),
    fetch_clients_in_project(clientDetails.project_name),
  ])

  return (
    <main className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-slate-50">
      <div className="flex-1 min-h-0 overflow-hidden">
        <FeedContentList
          feedId={feed._id}
          feed={feed}
          postsResult={postsResult}
          histogramData={histogramData}
          project={project}
          clientDetails={clientDetails}
          projectEmails={projectEmails}
          initialFilters={filters}
          initialSort={sort}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          initialCase={initialCase}
        />
      </div>
    </main>
  )
}
