import TakedownDetails from './TakedownDetails'
import { getTakedownDetails, getTakedownDocuments, checkReviewerPermission } from '../../actions'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const { id } = resolvedParams;

  const data = await getTakedownDetails(id);

  if (!data || !data.takedown) {
    return {
      title: 'Case Not Found',
    }
  }

  const platformId = data.takedown.post_platform_id || 'Unknown';
  const shortId = platformId.length > 8 ? platformId.substring(0, 8) + '...' : platformId;

  return {
    title: `overwatch - Case #${shortId}`,
    description: `Details for takedown case #${shortId} on ${data.takedown.platform}`,
  }
}

export default async function TakedownCasePage({ params }) {
  const [resolvedParams, clientData] = await Promise.all([params, getClientandProjectDetails()])
  const { id } = resolvedParams

  const [details, docs, permission] = await Promise.all([
    getTakedownDetails(id),
    getTakedownDocuments(id),
    checkReviewerPermission(),
  ])

  return (
    <TakedownDetails
      takedownId={id}
      initialData={details}
      initialDocuments={docs || []}
      isReviewer={permission}
      project={clientData?.project}
      clientDetails={clientData?.clientDetails}
    />
  )
}
