import { Outfit } from "next/font/google";
import "@/app/globals.css";
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { Sidebar } from '@/components/Sidebar'
import { redirect } from 'next/navigation'

export const metadata = {
  title: {
    template: '%s | Overwatch',
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

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden">
      <Sidebar user={user} clientDetails={clientDetails} project={project} />
      <main className="flex-1 relative overflow-y-auto focus:outline-none">
        {children}
      </main>
    </div>
  );
}