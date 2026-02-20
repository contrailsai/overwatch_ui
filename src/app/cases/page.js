import { CasesList } from './CasesList'

export const metadata = {
  title: 'overwatch - Active Cases',
  description: 'Detailed investigation and execution of active cases.',
}

export default function CasesPage() {
  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <header className="bg-white border-b border-slate-200 py-5 px-8 shrink-0 flex justify-between items-center z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Active Cases</h1>
          <p className="text-sm text-slate-500 mt-0.5">Detailed investigation and execution</p>
        </div>
      </header>

      <div className="flex-1 overflow-hidden relative">
        <CasesList />
      </div>
    </main>
  )
}
