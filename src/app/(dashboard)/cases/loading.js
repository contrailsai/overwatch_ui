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

            <div className="px-8 py-6 shrink-0">
                <Skeleton className="h-24 w-full rounded-xl" />
            </div>

            <div className="flex-1 overflow-y-auto px-8 pb-8">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="animate-pulse">
                        <div className="h-12 bg-slate-50 border-b border-slate-100" />
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-24 border-b border-slate-100 px-6 py-4 flex items-center gap-4">
                                <Skeleton className="h-6 w-20" />
                                <Skeleton className="h-6 w-24" />
                                <Skeleton className="h-16 w-16 rounded-lg" />
                                <div className="flex-1">
                                    <Skeleton className="h-4 w-32 mb-2" />
                                    <Skeleton className="h-3 w-full" />
                                </div>
                                <Skeleton className="h-8 w-24" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    )
}
