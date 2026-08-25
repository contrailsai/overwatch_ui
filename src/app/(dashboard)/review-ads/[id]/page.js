import { redirect } from 'next/navigation'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { isSectionEnabled } from '@/lib/project-sections'
import { DisabledSectionFallback } from '@/components/DisabledSectionFallback'

export default async function ReviewAdByIdPage({ params }) {
  const result = await getClientandProjectDetails()
  if (!isSectionEnabled(result?.project, 'ads')) {
    return <DisabledSectionFallback />
  }
  const { id } = await params
  redirect(`/review-ads?ad_id=${id}`)
}
