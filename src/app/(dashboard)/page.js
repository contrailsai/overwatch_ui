import { getDashboardData, getClientandProjectDetails } from './actions'
import { DashboardContent } from '@/components/DashboardContent'

export const metadata = {
  title: 'Dashboard',
  description: 'Overview of threat detection metrics and trends.',
}

export default async function Home({ searchParams }) {
  // 1. Get current authenticated user and project details from cached function
  const result = await getClientandProjectDetails()

  if (!result) return null // Should be handled by layout redirect

  const { user, clientDetails, project } = result

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

  // 4. Parse date filter
  const resolvedSearchParams = await searchParams
  const from = resolvedSearchParams?.from
  const to = resolvedSearchParams?.to
  const rawDays = parseInt(resolvedSearchParams?.days)

  let queryParams = {}
  if (from && to) {
    queryParams = { from, to, days: 'custom' }
  } else {
    // defaults to 7 days if not 1 or 7
    const days = [1, 7].includes(rawDays) ? rawDays : 7
    queryParams = { days }
  }

  // 5. Fetch dashboard data for this specific project + date window
  const data = await getDashboardData(project, queryParams)

  return <DashboardContent data={data} />
}