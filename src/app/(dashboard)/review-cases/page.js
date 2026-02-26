import { getPosts } from './actions'
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { ReviewInterface } from './ReviewInterface'
import { isReviewer } from '@/utils/permissions'

export const metadata = {
  title: 'Review Cases',
  description: 'Review pending cases and manage threats.',
}

export default async function ReviewCasesPage({ searchParams }) {
  // Check Permissions
  const hasReviewerPermission = await isReviewer()

  if (!hasReviewerPermission) {
    return (
      <main className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">404 Not Found</h1>
          <p className="text-slate-500">The page you are looking for does not exist.</p>
        </div>
      </main>
    )
  }

  // 1. Get current authenticated user and project details
  const result = await getClientandProjectDetails()

  if (!result) return null // Should be handled by layout redirect

  const { user, clientDetails } = result

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

  // Fetch Data
  const resolvedSearchParams = await searchParams // Next.js 15+ await searchParams
  const page = parseInt(resolvedSearchParams?.page || '1')

  // Initial load filters
  const initialFilters = {
    platform: resolvedSearchParams?.platform || 'all',
    status: resolvedSearchParams?.status || 'pending',
    aiAnalyzed: resolvedSearchParams?.aiAnalyzed === 'false', // Default false
    poiDetected: resolvedSearchParams?.poiDetected === 'false', // Default false
    sourcingDateStart: resolvedSearchParams?.sourcingDateStart || undefined,
    sourcingDateEnd: resolvedSearchParams?.sourcingDateEnd || undefined,
    dbDateStart: resolvedSearchParams?.dbDateStart || undefined,
    dbDateEnd: resolvedSearchParams?.dbDateEnd || undefined,
  }

  const { posts, totalPages, totalCount } = await getPosts(clientDetails.project_name, page, 20, initialFilters)

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <header className="bg-white border-b border-slate-200 py-5 px-8 shrink-0 flex justify-between items-center z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Review Cases</h1>
          <p className="text-sm text-slate-500 mt-0.5">Prioritize and verify AI-detected threats</p>
        </div>
        <div className="bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-600">
          {totalCount.toLocaleString()} pending cases
        </div>
      </header>

      <div className="flex-1 overflow-hidden relative">
        <ReviewInterface
          initialPosts={posts}
          totalPages={totalPages}
          currentPage={page}
          projectName={clientDetails.project_name}
          initialFilters={initialFilters}
        />
      </div>
    </main>
  )
}