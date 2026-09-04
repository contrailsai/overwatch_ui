import { notFound } from 'next/navigation'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { isSectionEnabled } from '@/lib/project-sections'
import { DisabledSectionFallback } from '@/components/DisabledSectionFallback'
import {
  getPoiById,
  getPoiAnalytics,
  getPoiProfiles,
  getPoiRecentPosts,
} from '../actions'
import { PoiOverview } from './PoiOverview'

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
  const preset = resolved.range || '7d'
  const from = resolved.from || null
  const to = resolved.to || null
  const range = { preset, from, to }

  const { poi } = await getPoiById(id)
  if (!poi) {
    notFound()
  }

  const [analytics, profilesRes, postsRes] = await Promise.all([
    getPoiAnalytics(id, range),
    getPoiProfiles(id, range, 20),
    getPoiRecentPosts(id, range, 12),
  ])

  const isReviewer = clientDetails?.permission === 'reviewer'

  return (
    <PoiOverview
      poi={poi}
      analytics={analytics}
      profiles={profilesRes.profiles || []}
      posts={postsRes.posts || []}
      range={{ preset, from, to }}
      isReviewer={isReviewer}
    />
  )
}
