import { Skeleton } from "@/components/ui/skeleton"
import PageHeader from "@/components/PageHeader"
import { Filter } from "lucide-react"
import { Separator } from "@/components/ui/separator"

export default function Loading() {
  return (
    <div className="flex flex-col h-full w-full bg-slate-50">
      {/* Header */}
      <PageHeader title="Takedown Requests" description="Manage and track active content removal requests" />

      {/* Filters & Controls */}
      <div className="px-8 py-6 shrink-0">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6">
            <div className="flex items-start xl:items-center gap-6 w-full xl:w-auto overflow-x-auto pb-2 xl:pb-0">
              <div className="flex items-center gap-2.5 shrink-0 mt-6 xl:mt-0">
                <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                  <Filter className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Filters</span>
              </div>
              <Separator orientation="vertical" className="h-8 bg-slate-100 hidden xl:block" />
              <div className="flex flex-nowrap items-center gap-4 shrink-0">
                <Skeleton className="h-9 w-[140px]" />
                <Skeleton className="h-9 w-[130px]" />
                <Skeleton className="h-9 w-[140px]" />
                <Skeleton className="h-9 w-[120px]" />
                <Skeleton className="h-9 w-[220px]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 flex gap-4 h-32 items-center">
              <Skeleton className="w-24 h-24 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/4" />
              </div>
              <Skeleton className="h-8 w-8 rounded-full ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
