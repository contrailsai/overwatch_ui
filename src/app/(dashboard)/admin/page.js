// import { getPosts, getPostById } from './actions'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
// import { ReviewInterface } from './ReviewInterface'
import PageHeader from '@/components/PageHeader'

import AdminDashboard from './AdminDashboard'
import { fetch_clients_in_project } from "./actions"

export const metadata = {
  title: 'Admin Dashboard',
  description: 'Admin Dashboard',
}

export default async function AdminPage({ searchParams }) {
  // 1. Get current authenticated user and project details
  const result = await getClientandProjectDetails()

  if (!result) return null // Should be handled by layout redirect

  const { user, clientDetails, project } = result


  if (clientDetails.permission !== "client-admin" && clientDetails.permission !== "reviewer") {
    return (
      <main className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">404 Not Found</h1>
          <p className="text-slate-500">The page you are looking for does not exist.</p>
        </div>
      </main>
    )
  }

  // 3. Handle missing setup
  if (!clientDetails?.project_name) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-slate-50">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 max-w-md shadow-sm">
          <h2 className="text-xl font-bold text-amber-900 mb-3">Account Not Set Up</h2>
          <p className="text-amber-800/80 mb-6 text-sm leading-relaxed">
            Your account has been created but not yet assigned to a project.
            Please contact your administrator to complete your setup.
          </p>
          <div className="text-xs text-amber-700 bg-amber-100/50 px-3 py-2 rounded-lg font-mono">
            ID: {user.id}
          </div>
        </div>
      </div>
    )
  }

  // // Fetch Data
  // const resolvedParams = await searchParams // Next.js 15+ await searchParams
  // const page = parseInt(resolvedParams?.page || '1')

  // // Initial load filters
  // const initialFilters = {
  //   platform: resolvedParams?.platform || 'all',
  //   status: resolvedParams?.status || 'pending',
  //   aiAnalyzed: resolvedParams?.aiAnalyzed === 'true', // Default false
  //   poiDetected: resolvedParams?.poiDetected === 'true', // Default false
  //   sourcingDateStart: resolvedParams?.sourcingDateStart || undefined,
  //   sourcingDateEnd: resolvedParams?.sourcingDateEnd || undefined,
  //   postingDateStart: resolvedParams?.postingDateStart || undefined,
  //   postingDateEnd: resolvedParams?.postingDateEnd || undefined,
  // }

  // const { posts, totalPages, totalCount } = await getPosts(project.mongo_db_map, page, 20, initialFilters)

  // let initialCase = null;
  // if (resolvedParams.case_id) {
  //   initialCase = await getPostById(project, resolvedParams.case_id);
  // }

  // fetch all other clients metadata and stats
  const clients = await fetch_clients_in_project(clientDetails.project_name);


  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">

      <PageHeader title="Admin Dashboard" />

      <div className="flex-1 overflow-hidden relative">
        <AdminDashboard
          project_name={project.project_name}
          clients={clients}
        />
      </div>
    </main>
  )
}