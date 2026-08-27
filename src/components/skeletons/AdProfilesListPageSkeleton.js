import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Loading shell for advertiser profile lists (/ad-profiles, /review-ad-profiles).
 * Mirrors: PageHeader → filter bar → bordered table with avatar + page name rows.
 */
export function AdProfilesListPageSkeleton({
  title = 'Ad Profiles',
  /** 'client' includes Risk/Status; 'review' matches the simpler review table */
  variant = 'client',
}) {
  const isClient = variant === 'client'

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <header className="bg-white border-b border-slate-200 pt-[15px] pb-3 px-4 sm:px-6 lg:px-8 shrink-0 flex justify-between items-center z-10">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        <Skeleton className="h-9 w-9 rounded-full" />
      </header>

      {/* Filter bar */}
      <div className={cn('shrink-0', isClient ? 'px-3 py-3' : 'px-6 py-4')}>
        {isClient ? (
          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="w-full lg:w-[160px] xl:w-[180px] shrink-0 space-y-2">
              <Skeleton className="h-3 w-14" />
              <div className="flex items-baseline gap-1.5">
                <Skeleton className="h-7 w-14" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className="flex-1 flex flex-wrap items-end gap-2.5 sm:gap-3">
              <div className="space-y-1 flex-1 min-w-[200px] max-w-[300px]">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="space-y-1 w-[140px]">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="space-y-1 w-[140px]">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="space-y-1 w-[150px]">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="space-y-1 w-[140px]">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex flex-col lg:flex-row lg:items-end gap-4">
              <div className="flex items-center gap-2.5 shrink-0 pb-1">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-3 w-14" />
              </div>
              <div className="flex flex-wrap items-end gap-4 flex-1">
                <div className="space-y-1 flex-1 min-w-[200px] max-w-[400px]">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
                <div className="space-y-1 w-[140px]">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
                <div className="space-y-1 w-[150px]">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
                <div className="space-y-1 w-[190px]">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className={cn('flex-1 min-h-0 overflow-hidden', isClient ? 'px-0' : 'px-6 pb-4')}>
        <div
          className={cn(
            'h-full bg-white overflow-hidden flex flex-col',
            isClient
              ? 'border border-slate-200 shadow-sm'
              : 'rounded-xl shadow-sm border border-slate-200',
          )}
        >
          <div className="h-12 shrink-0 bg-slate-50/90 border-b border-slate-100 flex items-center px-4 sm:px-6 gap-4 sm:gap-6">
            {isClient && (
              <>
                <Skeleton className="h-3 w-10 shrink-0" />
                <Skeleton className="h-3 w-12 shrink-0" />
              </>
            )}
            <Skeleton className="h-3 w-20 shrink-0" />
            <Skeleton className="h-3 w-16 shrink-0" />
            <Skeleton className="h-3 w-10 shrink-0" />
            {isClient ? (
              <Skeleton className="h-3 w-20 hidden lg:block shrink-0" />
            ) : (
              <Skeleton className="h-3 w-24 flex-1 max-w-[200px] shrink-0" />
            )}
            <Skeleton className="h-3 w-14 ml-auto shrink-0" />
          </div>

          <div className="flex-1 overflow-hidden">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="h-[72px] border-b border-slate-50 flex items-center px-4 sm:px-6 gap-4 sm:gap-6"
              >
                {isClient && (
                  <>
                    <Skeleton className="h-7 w-16 rounded-md shrink-0" />
                    <Skeleton className="h-7 w-24 rounded-md shrink-0" />
                  </>
                )}
                <div className="flex items-center gap-2.5 min-w-0 shrink-0 w-[180px] sm:w-[220px]">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-28 max-w-full" />
                    <Skeleton className="h-2.5 w-20 max-w-full" />
                  </div>
                </div>
                <Skeleton className="h-7 w-24 rounded-md shrink-0" />
                <Skeleton className="h-4 w-8 shrink-0" />
                {isClient ? (
                  <Skeleton className="h-3.5 w-24 hidden lg:block shrink-0" />
                ) : (
                  <Skeleton className="h-3.5 flex-1 max-w-[240px] shrink-0" />
                )}
                <Skeleton className="h-8 w-20 rounded-md ml-auto shrink-0" />
              </div>
            ))}
          </div>

          <div className="shrink-0 border-t border-slate-100 px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-36" />
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-16 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
