import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Loading shell for full-bleed list tables (ads / domains / review-*).
 * Mirrors: PageHeader → count/filters/search toolbar → sticky table rows.
 */
export function ListTablePageSkeleton({
  title = 'Loading',
  showCheckbox = false,
  showReports = false,
  /** 'ad' | 'domain' — shapes the content cell */
  entity = 'ad',
}) {
  const isDomain = entity === 'domain'

  return (
    <main className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-[#f4f6f8]">
      <header className="bg-white border-b border-slate-200 pt-[15px] pb-3 px-4 sm:px-6 lg:px-8 shrink-0 flex justify-between items-center z-10">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        <Skeleton className="h-9 w-9 rounded-full" />
      </header>

      <div className="flex-1 overflow-hidden relative min-h-0">
        <div className="flex h-full overflow-hidden bg-[#f4f6f8]">
          <div className="flex flex-col w-full bg-white border-r border-slate-200/80">
            {/* Toolbar */}
            <div className="shrink-0 border-b border-slate-100 px-5 py-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-baseline gap-2 shrink-0">
                  <Skeleton className="h-8 w-16 sm:h-9 sm:w-20" />
                  <Skeleton className="h-5 w-12" />
                </div>
                <Skeleton className="h-8 w-[88px] rounded-md shrink-0" />
                <Skeleton className="h-8 flex-1 min-w-[160px] max-w-sm rounded-md" />
                {showReports && (
                  <Skeleton className="h-8 w-28 rounded-md shrink-0 ml-auto" />
                )}
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex-1 overflow-hidden divide-y divide-slate-100">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-4 py-3 flex gap-3">
                  {showCheckbox && <Skeleton className="h-4 w-4 mt-4 rounded shrink-0" />}
                  <Skeleton className="h-14 w-14 rounded-lg shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2 py-0.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                    <div className="flex gap-1.5">
                      <Skeleton className="h-5 w-12 rounded" />
                      <Skeleton className="h-5 w-16 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:flex flex-1 flex-col overflow-hidden min-h-0">
              <div className="h-11 shrink-0 bg-slate-50/90 border-b border-slate-100 flex items-center px-2 sm:px-3 gap-2">
                {showCheckbox && <Skeleton className="h-4 w-4 rounded ml-1 shrink-0" />}
                <Skeleton className="h-3 w-10 hidden sm:block shrink-0" />
                <Skeleton className="h-3 w-12 hidden md:block shrink-0" />
                <Skeleton className="h-3 w-20 flex-1 min-w-0" />
                {isDomain ? (
                  <>
                    <Skeleton className="h-3 w-16 hidden lg:block shrink-0" />
                    <Skeleton className="h-3 w-12 hidden lg:block shrink-0" />
                    <Skeleton className="h-3 w-14 hidden lg:block shrink-0" />
                    <Skeleton className="h-3 w-10 hidden xl:block shrink-0" />
                    <Skeleton className="h-3 w-16 hidden lg:block shrink-0" />
                  </>
                ) : (
                  <>
                    <Skeleton className="h-3 w-10 hidden lg:block shrink-0" />
                    <Skeleton className="h-3 w-14 hidden lg:block shrink-0" />
                    <Skeleton className="h-3 w-16 hidden xl:block shrink-0" />
                    <Skeleton className="h-3 w-12 hidden xl:block shrink-0" />
                    <Skeleton className="h-3 w-14 hidden lg:block shrink-0" />
                    <Skeleton className="h-3 w-14 hidden xl:block shrink-0" />
                  </>
                )}
                <Skeleton className="h-3 w-6 shrink-0" />
              </div>

              <div className="flex-1 overflow-hidden">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-[68px] border-b border-slate-50 flex items-center px-2 sm:px-3 gap-2 sm:gap-3',
                    )}
                  >
                    {showCheckbox && <Skeleton className="h-4 w-4 rounded shrink-0" />}
                    <Skeleton className="h-12 w-12 rounded-lg hidden sm:block shrink-0" />
                    <Skeleton className="h-8 w-8 rounded-full hidden md:block shrink-0" />
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <Skeleton className="h-12 w-12 rounded-lg shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className={cn('h-3.5', isDomain ? 'w-40 max-w-full' : 'w-36 max-w-[70%]')} />
                        {!isDomain && <Skeleton className="h-3 w-24 max-w-[50%]" />}
                      </div>
                    </div>
                    {isDomain ? (
                      <>
                        <div className="hidden lg:flex gap-1 shrink-0 w-36">
                          <Skeleton className="h-5 w-14 rounded" />
                          <Skeleton className="h-5 w-12 rounded" />
                        </div>
                        <Skeleton className="h-5 w-12 rounded hidden lg:block shrink-0" />
                        <Skeleton className="h-5 w-14 rounded hidden lg:block shrink-0" />
                        <Skeleton className="h-3.5 w-8 hidden xl:block shrink-0" />
                        <Skeleton className="h-3.5 w-20 hidden lg:block shrink-0" />
                      </>
                    ) : (
                      <>
                        <Skeleton className="h-6 w-6 rounded hidden lg:block shrink-0" />
                        <Skeleton className="h-3.5 w-16 hidden lg:block shrink-0" />
                        <Skeleton className="h-5 w-14 rounded hidden xl:block shrink-0" />
                        <Skeleton className="h-3.5 w-12 hidden xl:block shrink-0" />
                        <Skeleton className="h-3.5 w-20 hidden lg:block shrink-0" />
                        <Skeleton className="h-3.5 w-20 hidden xl:block shrink-0" />
                      </>
                    )}
                    <Skeleton className="h-4 w-4 rounded shrink-0" />
                  </div>
                ))}
              </div>

              {/* Pagination footer */}
              <div className="shrink-0 border-t border-slate-100 p-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3 w-8" />
                  <Skeleton className="h-7 w-36 rounded-lg" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3 w-28 hidden sm:block" />
                  <Skeleton className="h-7 w-7 rounded" />
                  <Skeleton className="h-7 w-7 rounded" />
                  <Skeleton className="h-7 w-16 rounded" />
                  <Skeleton className="h-7 w-7 rounded" />
                  <Skeleton className="h-7 w-7 rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
