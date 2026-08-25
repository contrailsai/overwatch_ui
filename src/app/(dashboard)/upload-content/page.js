import RequestContentPage from './RequestContentPage'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { runInSpan } from '@/utils/tracing'
import { isSectionEnabled } from '@/lib/project-sections'

export const metadata = {
  title: 'Upload Content',
  description: 'Submit new links for data ingestion and analysis',
}

export default async function Page() {
  const data = await runInSpan(
    'rsc.upload_content_page.client_project',
    async () => getClientandProjectDetails(),
    { 'app.span_type': 'rsc_fetch', 'app.surface': 'rsc', 'app.fetch_target': 'upload_content' }
  )

  const clientDetails = data?.clientDetails
  const isReviewer = clientDetails?.permission === 'reviewer'
  const moderationQueueConfigured = Boolean(process.env.AWS_CONTENT_MODERATION_SQS_QUEUE_URL)
  const adsEnabled = isSectionEnabled(data?.project, 'ads')

  return (
    <RequestContentPage
      isReviewer={isReviewer}
      moderationQueueConfigured={moderationQueueConfigured}
      adsEnabled={adsEnabled}
    />
  )
}
