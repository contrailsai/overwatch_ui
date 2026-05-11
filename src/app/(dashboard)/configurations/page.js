import ConfigurationsPage from "./ConfigurationsPage";
import { getClientandProjectDetails } from "@/app/(dashboard)/actions"
import { runInSpan } from '@/utils/tracing'

export const metadata = {
  title: 'Configurations',
  description: 'Manage your account and notification settings.',
};

export default async function Page() {
  const data = await runInSpan(
    'rsc.configurations_page.client_project',
    async () => getClientandProjectDetails(),
    { 'app.span_type': 'rsc_fetch', 'app.surface': 'rsc', 'app.fetch_target': 'configurations' }
  )

  const { clientDetails, project } = data || {}

  return (
    <ConfigurationsPage clientDetails={clientDetails} project={project} />
  )
}
