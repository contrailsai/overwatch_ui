import { checkReviewerPermission, getPosts } from './actions'
import { Sidebar } from '@/components/Sidebar'
import { ReviewInterface } from './ReviewInterface'

export default async function ReviewCasesPage({ searchParams }) {
  // Check Permissions
  const isReviewer = await checkReviewerPermission()
  console.log(isReviewer)
  if (!isReviewer) {
    return (
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
            <p className="text-lg text-gray-600">Page Not Found.</p>
          </div>
        </main>
      </div>
    )
  }

  // Fetch Data
  const resolvedSearchParams = await searchParams // Next.js 15+ await searchParams
  const page = parseInt(resolvedSearchParams?.page || '1')
  const { posts, totalPages, totalCount } = await getPosts(page)

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
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
    </div>
  )
}