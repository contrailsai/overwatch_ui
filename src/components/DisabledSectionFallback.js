export function DisabledSectionFallback() {
  return (
    <main className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">404 Not Found</h1>
        <p className="text-slate-500">The page you are looking for does not exist.</p>
      </div>
    </main>
  )
}
