import { redirect } from 'next/navigation'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { isSectionEnabled } from '@/lib/project-sections'
import { DisabledSectionFallback } from '@/components/DisabledSectionFallback'

export default async function AdByIdPage({ params }) {
  const result = await getClientandProjectDetails()
  if (!isSectionEnabled(result?.project, 'ads')) {
    return <DisabledSectionFallback />
  }
  const { id } = await params
  redirect(`/ads?ad_id=${id}`)
}
