import { getDashboardData } from './actions'
import { DashboardContent } from '@/components/DashboardContent'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'overwatch - Dashboard',
  description: 'Overview of threat detection metrics and trends.',
}

export default async function Home() {
  const supabase = await createClient()

  // 1. Get current authenticated user
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // 2. Fetch client details to check project_name
  const { data: clientDetails } = await supabase
    .from('client_details')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  // 3. Handle missing setup
  if (!clientDetails?.project_name) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-8 max-w-md">
          <h2 className="text-2xl font-bold text-amber-800 mb-4">Account Not Set Up</h2>
          <p className="text-amber-700 mb-6">
            Your account has been created but not yet assigned to a project.
            Please contact your administrator to complete your setup.
          </p>
          <div className="text-sm text-amber-600">
            User ID: <code className="bg-amber-100 px-2 py-1 rounded">{user.id}</code>
          </div>
        </div>
      </div>
    )
  }

  // 4. Fetch dashboard data for this specific project
  const data = await getDashboardData(clientDetails.project_name)

  return <DashboardContent data={data} />
}