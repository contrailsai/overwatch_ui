import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import PageHeader from '@/components/PageHeader'
import { DisabledSectionFallback } from '@/components/DisabledSectionFallback'
import { isSectionEnabled } from '@/lib/project-sections'
import { listFeeds } from './actions'
import { ManageFeedsClient } from './ManageFeedsClient'

export const metadata = {
  title: 'Manage Feeds',
  description: 'Create and curate content feeds for clients.',
}

export default async function ManageFeedsPage() {
  const result = await getClientandProjectDetails()
  if (!result) return null // Layout handles the unauthenticated redirect.

  const { user, clientDetails, project } = result

  if (!isSectionEnabled(project, 'feeds')) {
    return <DisabledSectionFallback />
  }

  // Reviewer-only: mirror the fake-404 pattern used by /review-cases.
  if (clientDetails.permission !== 'reviewer') {
    return (
      <main className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">404 Not Found</h1>
          <p className="text-slate-500">The page you are looking for does not exist.</p>
        </div>
      </main>
    )
  }

  if (!clientDetails?.project_name) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-slate-50">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 max-w-md shadow-sm">
          <h2 className="text-xl font-bold text-amber-900 mb-3">Account Not Set Up</h2>
          <p className="text-amber-800/80 mb-6 text-sm leading-relaxed">
            Your account has been created but not yet assigned to a project.
            Please contact your administrator to complete your setup.
          </p>
          <div className="text-xs text-amber-700 bg-amber-100/50 px-3 py-2 rounded-lg font-mono">
            ID: {user.id}
          </div>
        </div>
      </div>
    )
  }

  const feeds = await listFeeds()

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <PageHeader title="Manage Feeds" description="Create and curate content feeds for clients" />
      <div className="flex-1 overflow-y-auto">
        <ManageFeedsClient initialFeeds={feeds} />
      </div>
    </main>
  )
}
