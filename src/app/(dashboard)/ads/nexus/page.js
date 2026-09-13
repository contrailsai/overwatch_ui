import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import PageHeader from '@/components/PageHeader'
import { DisabledSectionFallback } from '@/components/DisabledSectionFallback'
import { isSectionEnabled } from '@/lib/project-sections'
import { getAdsNexusGraph } from '@/app/(dashboard)/nexus/actions'
import { AdsNexusClient } from './AdsNexusClient'

export const metadata = {
  title: 'Ads Nexus',
  description: 'Graph understanding of ads linked to profiles and domains.',
}

export default async function AdsNexusPage() {
  const result = await getClientandProjectDetails()
  if (!result) return null

  const { clientDetails, project } = result

  if (!isSectionEnabled(project, 'ads')) {
    return <DisabledSectionFallback />
  }

  if (!clientDetails?.project_name) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-slate-50">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 max-w-md shadow-sm">
          <h2 className="text-xl font-bold text-amber-900 mb-3">Account Not Set Up</h2>
          <p className="text-amber-800/80 mb-6 text-sm leading-relaxed">
            Your account has been created but not yet assigned to a project.
          </p>
        </div>
      </div>
    )
  }

  const graphData = await getAdsNexusGraph('ad_profile')

  return (
    <main className="flex flex-1 flex-col h-full min-h-0 overflow-hidden bg-slate-50">
      <PageHeader
        title="Ads understanding"
        description="Ad profiles or domains → ads with violation colors"
      />
      <AdsNexusClient initialGraph={graphData} initialMode="ad_profile" />
    </main>
  )
}
