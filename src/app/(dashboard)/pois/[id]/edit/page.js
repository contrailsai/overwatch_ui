import { notFound, redirect } from 'next/navigation'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { isSectionEnabled } from '@/lib/project-sections'
import { DisabledSectionFallback } from '@/components/DisabledSectionFallback'
import { getPoiById } from '../../actions'
import { PoiEditForm } from './PoiEditForm'

export async function generateMetadata({ params }) {
  const { id } = await params
  const { poi } = await getPoiById(id)
  return {
    title: poi ? `Edit ${poi.display_name}` : 'Edit POI',
  }
}

export default async function PoiEditPage({ params }) {
  const { project, clientDetails } = await getClientandProjectDetails()

  if (!isSectionEnabled(project, 'posts')) {
    return <DisabledSectionFallback />
  }

  if (clientDetails?.permission !== 'reviewer') {
    const { id } = await params
    redirect(`/pois/${id}`)
  }

  const { id } = await params
  const { poi } = await getPoiById(id)
  if (!poi) notFound()

  return <PoiEditForm poi={poi} />
}
