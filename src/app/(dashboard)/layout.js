import "@/app/globals.css";
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { Sidebar } from '@/components/Sidebar'
import { redirect } from 'next/navigation'
import { GoogleAnalyticsConfig } from '@/components/GoogleAnalyticsConfig'

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

  const isProd = process.env.NODE_ENV === 'production';

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden">
      {
        isProd && (
          <GoogleAnalyticsConfig userId={user?.id} />
        )
      }
      <Sidebar user={user} clientDetails={clientDetails} project={project} />
      <main className="flex-1 relative overflow-y-auto focus:outline-none">
        {children}
      </main>
    </div>
  );
}