import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import PageHeader from '@/components/PageHeader'
import { listFeedsForClient } from './actions'
import { FeedsIndexClient } from './FeedsIndexClient'

export const metadata = {
  title: 'Feeds',
  description: 'Browse curated content collections for your project.',
}

export default async function FeedsPage() {
  const result = await getClientandProjectDetails()
  if (!result) return null

  const { clientDetails } = result

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

  const feeds = await listFeedsForClient()

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <PageHeader title="Feeds" description="Curated collections of related content" />
      <div className="flex-1 overflow-y-auto">
        <FeedsIndexClient feeds={feeds} />
      </div>
    </main>
  )
}
