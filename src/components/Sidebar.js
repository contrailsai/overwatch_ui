'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { List, ShieldAlert, Settings, LogOut, LayoutDashboard, ShieldCheck, GitPullRequestCreateArrow } from 'lucide-react'
// import { useClient } from '@/context/ClientContext'
import { cn } from '@/lib/utils'

export function Sidebar({ user, clientDetails, project }) {
  console.log(user, clientDetails, project)
  const pathname = usePathname()
  // const { user, clientDetails, isLoading } = useClient()

  // All nav items.
  const allNavItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard, show: true },
    {
      name: 'Review Cases',
      href: '/review-cases',
      icon: ShieldCheck,
      show: clientDetails?.permission === 'reviewer'
    },
    { name: 'Cases List', href: '/cases', icon: List, show: true },
    { name: 'Takedowns', href: '/takedowns', icon: ShieldAlert, show: true },
    { name: 'Configurations', href: '/configurations', icon: Settings, show: true },
    { name: 'Request Content', href: '/request-content', icon: GitPullRequestCreateArrow, show: true },
  ]

  // Filter and map navigation items
  const navigation = allNavItems
    .filter(item => item.show)
    .map(item => {
      // Special logic for Takedowns based on project settings
      if (item.name === 'Takedowns') {
        const doTakedowns = project?.project_details?.do_takedowns;
        // If do_takedowns is explicitly false, gray it out.
        // If it's true or undefined (default), show it normally.
        const status = doTakedowns === false ? "grayed_out" : true;
        return { ...item, show: status };
      }
      return item;
    });

  return (
    <div className="flex flex-col w-64 h-full bg-white border-r border-slate-200 shadow-sm shrink-0 z-40">

      {/* Brand Header */}
      <div className="flex items-center h-16 px-6 border-b border-slate-100 shrink-0">
        <ShieldCheck className="h-6 w-6 text-blue-600 shrink-0" strokeWidth={2.5} />
        <span className="ml-3 text-lg font-bold tracking-tight text-slate-900 uppercase">
          Overwatch
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))

          if (!item.show) return null

          if (item.show === "grayed_out") {
            return (
              <div
                key={item.name}
                className={cn(
                  "flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 group relative",
                  "text-slate-400 cursor-not-allowed"
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 shrink-0 mr-3 transition-colors",
                    "text-slate-400"
                  )}
                  strokeWidth={2}
                />
                <span className="truncate">{item.name}</span>
              </div>
            )
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 group relative",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-600 rounded-r-full" />
              )}
              <item.icon
                className={cn(
                  "h-5 w-5 shrink-0 mr-3 transition-colors",
                  isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                )}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className="truncate">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer / User Info */}
      <div className="p-4 border-t border-slate-100 space-y-4">
        {/* Powered By */}
        <div className="px-2">
          <div className="flex flex-col space-y-1 opacity-70 transition-opacity">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Powered by</span>
            <div
              className="h-6 w-32 bg-gray-400"
              style={{
                maskImage: 'url(/logo_txt.svg)',
                WebkitMaskImage: 'url(/logo_txt.svg)',
                maskRepeat: 'no-repeat',
                maskSize: 'contain',
                maskPosition: 'center',
              }}
            />
          </div>
        </div>

        {/* Sign Out */}
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center px-3 py-2.5 text-sm font-medium text-slate-500 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors group"
          >
            <LogOut className="h-5 w-5 mr-3 shrink-0 text-slate-400 group-hover:text-red-500 transition-colors" />
            <span>Sign out</span>
          </button>
        </form>
      </div>
    </div >
  )
}
