import "@/app/globals.css";
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { Sidebar } from '@/components/Sidebar'
import { redirect } from 'next/navigation'
import { GoogleAnalyticsConfig } from '@/components/GoogleAnalyticsConfig'
import { ClientProvider } from '@/context/ClientContext'
import { trackClientActivity } from '@/utils/supabase/metrics'

export const metadata = {
  title: {
    template: 'Overwatch | %s',
    default: 'Overwatch',
  },
  description: "Threat Detection Dashboard",
};

export default async function DashboardLayout({ children }) {
  const result = await getClientandProjectDetails()
  if (!result) {
    redirect('/login')
  }
  const { user, clientDetails, project } = result

  if (user?.id && project?.project_name) {
    // Fire and forget tracking logic for daily logins
    trackClientActivity(user.id, project.project_name, 'login').catch(console.error)
  }

  const isProd = process.env.NODE_ENV === 'production';

  return (
    <div className="flex flex-col md:flex-row h-full bg-slate-50 overflow-hidden">
      {
        isProd && (
          <GoogleAnalyticsConfig userId={user?.id} />
        )
      }
      <Sidebar user={user} clientDetails={clientDetails} project={project} />
      <ClientProvider initialClientDetails={clientDetails}>
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          {children}
        </main>
      </ClientProvider>
    </div>
  );
}