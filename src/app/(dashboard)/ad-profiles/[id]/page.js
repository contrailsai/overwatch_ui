import { notFound } from 'next/navigation'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { isSectionEnabled } from '@/lib/project-sections'
import { DisabledSectionFallback } from '@/components/DisabledSectionFallback'
import {
  getAdProfileById,
  getAdProfileAnalytics,
  getAdProfileRecentAds,
  getAdProfileLinkedDomains,
} from '../actions'
import { AdProfileOverview } from './AdProfileOverview'
import { DEFAULT_INFORMATICS_RANGE_PRESET } from '@/lib/pois/poi-helpers'

export async function generateMetadata({ params }) {
  const { id } = await params
  const { profile } = await getAdProfileById(id)
  const title = profile?.display_name || profile?.page_name || 'Ad Profile'
  return {
    title: `${title} · Ad Profile`,
  }
}

export default async function AdProfileDetailPage({ params, searchParams }) {
  const { project } = await getClientandProjectDetails()

  if (!isSectionEnabled(project, 'ads')) {
    return <DisabledSectionFallback />
  }

  const { id } = await params
  const resolved = await searchParams
  const preset = resolved.range || DEFAULT_INFORMATICS_RANGE_PRESET
  const from = resolved.from || null
  const to = resolved.to || null
  const range = { preset, from, to }

  const { profile } = await getAdProfileById(id)
  if (!profile) {
    notFound()
  }

  const [analytics, adsRes, domainsRes] = await Promise.all([
    getAdProfileAnalytics(id, range),
    getAdProfileRecentAds(id, range, 24),
    getAdProfileLinkedDomains(id, range),
  ])

  return (
    <AdProfileOverview
      key={profile._id}
      profile={profile}
      project={project}
      analytics={analytics}
      ads={adsRes.ads || []}
      domains={domainsRes.domains || []}
      range={{ preset, from, to }}
    />
  )
}
