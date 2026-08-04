import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { fetch_clients_in_project } from '@/app/(dashboard)/cases/feature_actions'
import PageHeader from '@/components/PageHeader'
import { getPoiTopicsGraph, countFeeds } from './actions'
import { FeedsGraphClient } from './FeedsGraphClient'
import { FeedsSubNav } from './FeedsSubNav'

export const metadata = {
  title: 'Feeds',
  description: 'Explore topics and POIs across your project.',
}

export default async function FeedsPage() {
  const result = await getClientandProjectDetails()
  if (!result) return null

  const { clientDetails, project } = result

  if (!clientDetails?.project_name) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-slate-50">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 max-w-md shadow-sm">
          <h2 className="text-xl font-bold text-amber-900 mb-3">Account Not Set Up</h2>
          <p className="text-amber-800/80 mb-6 text-sm leading-relaxed">
            Your account has been created but not yet assigned to a project.
            Please contact your administrator to complete your setup.
          </p>
        </div>
      </div>
    )
  }

  const [graphData, feedCount, projectEmails] = await Promise.all([
    getPoiTopicsGraph(),
    countFeeds(),
    fetch_clients_in_project(clientDetails.project_name),
  ])

  return (
    <main className="flex flex-1 flex-col h-full min-h-0 overflow-hidden bg-slate-50">
      <PageHeader
        title="Feeds"
        description="Topic and POI relationships across your project"
      />
      <FeedsSubNav feedCount={feedCount} />
      <FeedsGraphClient
        graphData={graphData}
        feedCount={feedCount}
        project={project}
        clientDetails={clientDetails}
        projectEmails={projectEmails}
      />
    </main>
  )
}
