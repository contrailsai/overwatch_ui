import { notFound, redirect } from 'next/navigation'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { fetch_clients_in_project } from '@/app/(dashboard)/cases/feature_actions'
import { isSectionEnabled } from '@/lib/project-sections'
import { DisabledSectionFallback } from '@/components/DisabledSectionFallback'
import {
  getPoiById,
  getPoiAnalytics,
  getPoiProfiles,
  getPoiRecentPosts,
  getPoiAigcPosts,
} from '../actions'
import { PoiOverview } from './PoiOverview'
import { DEFAULT_INFORMATICS_RANGE_PRESET, POI_POSTS_PAGE_SIZE } from '@/lib/pois/poi-helpers'

export async function generateMetadata({ params }) {
  const { id } = await params
  const { poi } = await getPoiById(id)
  return {
    title: poi ? `${poi.display_name} · POI` : 'POI',
  }
}

export default async function PoiDetailPage({ params, searchParams }) {
  const { project, clientDetails } = await getClientandProjectDetails()

  if (!isSectionEnabled(project, 'posts')) {
    return <DisabledSectionFallback />
  }

  const { id } = await params
  const resolved = await searchParams
  const preset = resolved.range || DEFAULT_INFORMATICS_RANGE_PRESET
  const from = resolved.from || null
  const to = resolved.to || null
  const range = { preset, from, to }

  const { poi } = await getPoiById(id)
  if (!poi) {
    notFound()
  }
  if (poi.merged_into && String(poi.merged_into) !== String(poi._id)) {
    redirect(`/pois/${poi.merged_into}`)
  }

  const [analytics, profilesRes, postsRes, aigcRes, projectEmails] = await Promise.all([
    getPoiAnalytics(id, range),
    getPoiProfiles(id, range, 20),
    getPoiRecentPosts(id, range, { page: 1, limit: POI_POSTS_PAGE_SIZE }),
    getPoiAigcPosts(id, range, { page: 1, limit: POI_POSTS_PAGE_SIZE }),
    fetch_clients_in_project(clientDetails.project_name),
  ])

  const isReviewer = clientDetails?.permission === 'reviewer'

  return (
    <PoiOverview
      key={`${preset}|${from || ''}|${to || ''}`}
      poi={poi}
      analytics={analytics}
      profiles={profilesRes?.profiles || []}
      posts={postsRes?.posts || []}
      postsMeta={{
        total: postsRes?.total || 0,
        page: postsRes?.page || 1,
        hasMore: Boolean(postsRes?.hasMore),
      }}
      aigcPosts={aigcRes?.posts || []}
      aigcMeta={{
        total: aigcRes?.total || 0,
        page: aigcRes?.page || 1,
        hasMore: Boolean(aigcRes?.hasMore),
      }}
      range={{ preset, from, to }}
      isReviewer={isReviewer}
      project={project}
      clientDetails={clientDetails}
      projectEmails={projectEmails}
    />
  )
}
