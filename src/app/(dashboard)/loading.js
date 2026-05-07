import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const cardCls = "bg-white border border-slate-200 rounded-2xl p-5 md:p-6"

export default function Loading() {
    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
            <header className="bg-white border-b border-slate-200 pt-[15px] pb-3 px-8 shrink-0 flex justify-between items-center z-10">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-6 w-6 rounded" />
                    <Skeleton className="h-7 w-32" />
                </div>
                <Skeleton className="h-9 w-9 rounded-full" />
            </header>

            <div className="flex-1 overflow-y-auto">
                <div className="px-4 md:px-6 py-4 md:py-6 pb-20 space-y-4">

                    {/* Sub-header */}
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <Skeleton className="h-4 w-64" />
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-9 w-20 rounded-full" />
                            <Skeleton className="h-9 w-20 rounded-full" />
                            <Skeleton className="h-9 w-24 rounded-full" />
                        </div>
                    </div>

                    {/* Row 1: 4 KPI cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className={cardCls}>
                                <Skeleton className="h-9 w-9 rounded-full" />
                                <Skeleton className="h-3 w-24 mt-5" />
                                <Skeleton className="h-9 w-20 mt-3" />
                            </div>
                        ))}
                    </div>

                    {/* Row 2: Scanning Trends + Source Distribution */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className={cn(cardCls, "lg:col-span-2")}>
                            <div className="flex items-start justify-between mb-4">
                                <Skeleton className="h-3 w-32" />
                                <Skeleton className="h-3 w-48" />
                            </div>
                            <Skeleton className="h-8 w-32 mb-4" />
                            <Skeleton className="h-[260px] w-full rounded-md" />
                        </div>
                        <div className={cardCls}>
                            <Skeleton className="h-3 w-32 mb-4" />
                            <div className="flex items-center justify-center my-4">
                                <Skeleton className="h-[180px] w-[180px] rounded-full" />
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-4">
                                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-4" />)}
                            </div>
                        </div>
                    </div>

                    {/* Row 3: Risk Breakdown */}
                    <div className={cardCls}>
                        <Skeleton className="h-3 w-28 mb-4" />
                        <Skeleton className="h-2 w-full rounded-full mb-4" />
                        <div className="flex flex-wrap gap-x-6 gap-y-2">
                            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-4 w-24" />)}
                        </div>
                    </div>

                    {/* Row 4: Queue Status + Review Decisions + Top Violation Categories */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className={cardCls}>
                            <Skeleton className="h-3 w-24 mb-4" />
                            <div className="flex flex-col items-center my-4">
                                <Skeleton className="h-9 w-16" />
                                <Skeleton className="h-3 w-24 mt-2" />
                            </div>
                            <Skeleton className="h-1 w-full rounded-full mb-4" />
                            <Skeleton className="h-9 w-full rounded-md" />
                        </div>
                        <div className={cardCls}>
                            <Skeleton className="h-3 w-32 mb-4" />
                            <div className="flex items-center justify-center my-4">
                                <Skeleton className="h-[180px] w-[180px] rounded-full" />
                            </div>
                            <div className="space-y-2 mt-4">
                                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
                            </div>
                        </div>
                        <div className={cardCls}>
                            <Skeleton className="h-3 w-40 mb-5" />
                            <div className="space-y-3">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <Skeleton className="h-3 w-24" />
                                        <Skeleton className="h-1 flex-1 rounded-full" />
                                        <Skeleton className="h-3 w-9" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}
