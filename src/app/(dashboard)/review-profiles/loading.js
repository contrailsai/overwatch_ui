import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
            <header className="bg-white border-b border-slate-200 py-5 px-8 shrink-0 flex justify-between items-center z-10">
                <div>
                    <Skeleton className="h-8 w-48 mb-2" />
                    <Skeleton className="h-4 w-64" />
                </div>
            </header>

            <div className="px-6 py-4 shrink-0">
                <Skeleton className="h-20 w-full rounded-xl" />
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="animate-pulse">
                        <div className="h-12 bg-slate-50 border-b border-slate-100" />
                        {Array.from({ length: 10 }).map((_, i) => (
                            <div key={i} className="h-14 border-b border-slate-100 px-6 py-3 flex items-center gap-6">
                                <Skeleton className="h-5 w-32" />
                                <Skeleton className="h-5 w-24" />
                                <Skeleton className="h-5 w-16" />
                                <Skeleton className="h-5 w-10" />
                                <div className="flex-1">
                                    <Skeleton className="h-4 w-48" />
                                </div>
                                <Skeleton className="h-8 w-20" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    )
}
