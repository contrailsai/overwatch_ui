import { getPosts } from './actions'
import { ReviewInterface } from './ReviewInterface'
import { isReviewer } from '@/utils/permissions'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'overwatch - Review Cases',
  description: 'Review pending cases and manage threats.',
}

export default async function ReviewCasesPage({ searchParams }) {
  // Check Permissions
  const hasReviewerPermission = await isReviewer()

  if (!hasReviewerPermission) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">403</h1>
          <p className="text-lg text-gray-600">Access Denied - Reviewer permission required.</p>
        </div>
      </main>
    )
  }

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

  // Fetch Data
  const resolvedSearchParams = await searchParams // Next.js 15+ await searchParams
  const page = parseInt(resolvedSearchParams?.page || '1')
  const { posts, totalPages, totalCount } = await getPosts(clientDetails.project_name, page, 20, {
    platform: 'all',
    sourcingDateStart: '',
    sourcingDateEnd: '',
    dbDateStart: '',
    dbDateEnd: '',
    aiAnalyzed: true,
    poiDetected: true,
    status: 'pending'
  })

  return (
    <main className="flex-1 relative flex flex-col">
      <header className="bg-white border-b border-gray-200 py-4 px-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Review Cases</h1>
          <span className="text-sm text-gray-500">{totalCount} items pending</span>
        </div>
      </header>

      <div className="flex-1 overflow-hidden relative">
        <ReviewInterface
          initialPosts={posts}
          totalPages={totalPages}
          currentPage={page}
          projectName={clientDetails.project_name}
        />
      </div>
    </main>
  )
}