import { getCases } from '@/app/actions'
import { Sidebar } from '@/components/Sidebar'
import { CasesTable } from '@/components/CasesTable'

export default async function CasesPage() {
  const cases = await getCases()

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="py-6 px-8">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-gray-900">Case Management</h1>
            <p className="mt-1 text-sm text-gray-500">
              Review and manage identified threat cases across all platforms.
            </p>
          </div>

          <CasesTable cases={cases} />
        </div>
      </main>
    </div>
  )
}
