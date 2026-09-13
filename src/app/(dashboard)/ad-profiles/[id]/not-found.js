import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function AdProfileNotFound() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-4 bg-slate-50 p-8">
      <h1 className="text-xl font-bold text-slate-900">Ad profile not found</h1>
      <p className="text-sm text-slate-500">This advertiser does not exist or was removed.</p>
      <Button asChild variant="outline">
        <Link href="/ad-profiles">Back to Ad Profiles</Link>
      </Button>
    </main>
  )
}
