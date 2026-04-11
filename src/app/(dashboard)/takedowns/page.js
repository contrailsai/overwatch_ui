import TakedownsList from './TakedownsList'
import { getTakedowns, checkReviewerPermission } from './actions'
import PageHeader from "@/components/PageHeader"
export const metadata = {
  title: 'overwatch - Takedowns',
  description: 'Manage and track active content removal requests.',
};

export default async function TakedownsPage({ searchParams }) {
  const resolvedParams = await searchParams

  const filters = {
    status: resolvedParams.status || 'all',
    platform: resolvedParams.platform || 'all',
    threat_type: resolvedParams.threat_type || 'all',
    risk_score: resolvedParams.risk_score || 'all',
    date_from: resolvedParams.date_from || null,
    date_to: resolvedParams.date_to || null,
  }

  const [takedowns, isReviewer] = await Promise.all([
    getTakedowns(filters),
    checkReviewerPermission()
  ])

  return (
    <>
      {/* Header */}
      < PageHeader title="Takedown Requests" description="Manage and track active content removal requests" />
      <TakedownsList
        initialTakedowns={takedowns}
        initialFilters={filters}
        isReviewer={isReviewer}
      />
    </>
  )
}

