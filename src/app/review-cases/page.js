import { getPosts } from './actions'
import { ReviewInterface } from './ReviewInterface'
import { isReviewer } from '@/utils/permissions'

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

  // Fetch Data
  const resolvedSearchParams = await searchParams // Next.js 15+ await searchParams
  const page = parseInt(resolvedSearchParams?.page || '1')
  const { posts, totalPages, totalCount } = await getPosts(page, 20, {
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
        />
      </div>
    </main>
  )
}