import ConfigurationsPage from "./ConfigurationsPage";
import { getClientandProjectDetails } from "@/app/(dashboard)/actions"
export const metadata = {
  title: 'Configurations',
  description: 'Manage your account and notification settings.',
};

export default async function Page() {

  const { user, clientDetails, project } = await getClientandProjectDetails()

  return (
    <ConfigurationsPage clientDetails={clientDetails} project={project} />
  )
}
