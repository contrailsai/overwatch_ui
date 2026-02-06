import { CasesList } from './CasesList'

export default function CasesPage() {
  return (
    <main className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="pt-6 px-8 pb-2">
        <div>
          <h1 className="mb-2 text-2xl font-semibold text-zinc-900">Active Cases</h1>
          <p className="text-zinc-500">Detailed investigation and execution</p>
        </div>
      </div>

      <CasesList />
    </main>
  )
}
