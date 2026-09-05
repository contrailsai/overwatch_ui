import { notFound } from 'next/navigation'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { isSectionEnabled } from '@/lib/project-sections'
import { DisabledSectionFallback } from '@/components/DisabledSectionFallback'
import {
  getProfileById,
  getProfileAnalytics,
  getProfilePosts,
  getProfileCaseIds,
} from '../actions'
import { ProfileOverview } from './ProfileOverview'

export async function generateMetadata({ params }) {
  const { id } = await params
  const { profile } = await getProfileById(id)
  const title = profile?.display_name || profile?.username || 'Profile'
  return {
    title: `${title} · Profile`,
  }
}

export default async function ProfileDetailPage({ params, searchParams }) {
  const { project } = await getClientandProjectDetails()

  if (!isSectionEnabled(project, 'posts')) {
    return <DisabledSectionFallback />
  }

  const { id } = await params
  const resolved = await searchParams
  const preset = resolved.range || 'all'
  const from = resolved.from || null
  const to = resolved.to || null
  const range = { preset, from, to }

  const { profile } = await getProfileById(id)
  if (!profile) {
    notFound()
  }

  const [analytics, postsRes, reportCaseIds] = await Promise.all([
    getProfileAnalytics(id, range),
    getProfilePosts(id, range, 24),
    getProfileCaseIds(id),
  ])

  return (
    <ProfileOverview
      key={profile._id}
      profile={profile}
      project={project}
      analytics={analytics}
      posts={postsRes.posts || []}
      reportCaseIds={reportCaseIds || []}
      range={{ preset, from, to }}
    />
  )
}
