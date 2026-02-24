import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Page Not Found',
}

export default function NotFound() {
  return (
    <main className="flex-1 flex w-full h-full items-center justify-center p-8">
      <div className=" relative -top-36 text-center max-w-md">
        <h1 className="text-9xl font-bold text-slate-200 mb-2">404</h1>
        <div className="relative -mt-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Page Not Found</h2>
          <p className="text-lg text-slate-600 mb-8">
            The page you are looking for doesn't exist or has been moved to another URL.
          </p>
          <div className="flex justify-center gap-4">
            <Button asChild variant="default" className="px-8">
              <Link href="/">
                Return Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  )
}
