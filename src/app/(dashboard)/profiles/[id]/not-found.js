import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function ProfileNotFound() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-4 bg-slate-50 p-8">
      <h1 className="text-xl font-bold text-slate-900">Profile not found</h1>
      <p className="text-sm text-slate-500">This profile does not exist or was removed.</p>
      <Button asChild variant="outline">
        <Link href="/profiles">Back to Profiles</Link>
      </Button>
    </main>
  )
}
