import { Sidebar } from '@/components/Sidebar'
import { CasesList } from './CasesList'

export default function CasesPage() {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="pt-6 px-8 pb-2">
          <div className="mb-2">
            <h1 className="text-2xl font-semibold text-gray-900">Case Management</h1>
            <p className="mt-1 text-sm text-gray-500">
              Review and manage identified threat cases across all platforms.
            </p>
          </div>
        </div>

        <CasesList />
      </main>
    </div>
  )
}
