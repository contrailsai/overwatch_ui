import { Skeleton } from "@/components/ui/skeleton"
import { ChevronLeft, Loader2 } from 'lucide-react'

export default function Loading() {
  return (
    <div className="flex flex-col h-full bg-muted/10 w-full">
      {/* Header */}
      <header className="bg-background border-b py-4 px-6 flex items-center justify-between shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="h-9 w-9 border rounded-md flex items-center justify-center">
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className='flex flex-col gap-3'>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 w-full ">
        {/* LEFT */}
        <div className="lg:col-span-8 h-full overflow-y-auto w-full">
          <div className="px-6 pt-3 space-y-6 pb-32">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        </div>

        {/* RIGHT */}
        <div className="lg:col-span-4 bg-white border-l h-full overflow-auto flex flex-col shadow-xl z-20">
          <div className="space-y-6 pt-3 px-4 pb-10">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-lg border border-slate-800 relative group flex items-center justify-center min-h-[400px]">
              <Loader2 className="w-12 h-12 animate-spin text-slate-700" />
            </div>
            <Skeleton className="h-32 w-full rounded-2xl" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
