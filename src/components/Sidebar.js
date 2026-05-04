'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { List, FileText, ShieldAlert, Settings, UserStar, LogOut, LayoutDashboard, ShieldCheck, GitPullRequestCreateArrow, Users, Menu, X, ScanEye, UserRoundPen } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Sidebar({ user, clientDetails, project }) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  // Close the mobile drawer when navigating
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  // Prevent background scrolling when mobile drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // All nav items.
  const allNavItems = [
    { name: 'Analytics', href: '/', icon: LayoutDashboard, show: true },
    { name: 'Review Cases', href: '/review-cases', icon: ScanEye, show: clientDetails?.permission === 'reviewer' },
    { name: 'Content List', href: '/cases', icon: List, show: true },
    { name: 'Review Profiles', href: '/review-profiles', icon: UserRoundPen, show: clientDetails?.permission === 'reviewer' },
    { name: 'Profile List', href: '/profiles', icon: Users, show: true },
    { name: 'Takedowns', href: '/takedowns', icon: ShieldAlert, show: true },
    { name: 'Upload Content', href: '/upload-content', icon: GitPullRequestCreateArrow, show: true },
    { name: 'Configurations', href: '/configurations', icon: Settings, show: true },
    { name: 'Admin', href: '/admin', icon: UserStar, show: (clientDetails?.permission === 'client-admin' || clientDetails?.permission === 'reviewer')},
    { name: 'Reports', href: '/reports', icon: FileText, show: true },
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

  const SidebarContent = () => (
    <>
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-6 border-b border-slate-100 shrink-0 overflow-hidden">
        <div className="flex items-center w-full">
          <ShieldCheck className="h-6 w-6 text-blue-600 shrink-0" strokeWidth={2.5} />
          <span className="ml-3 text-lg font-bold tracking-tight text-slate-900 uppercase whitespace-nowrap transition-all duration-300 md:opacity-0 md:group-hover:opacity-100">
            Overwatch
          </span>
        </div>
        {/* Mobile Close Button */}
        <button 
          onClick={() => setIsOpen(false)}
          className="md:hidden p-2 -mr-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-6 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))

          if (!item.show) return null

          if (item.show === "grayed_out") {
            return (
              <div
                key={item.name}
                className={cn(
                  "flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 group relative overflow-hidden",
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
                <span className="truncate whitespace-nowrap transition-all duration-300 md:opacity-0 md:group-hover:opacity-100">{item.name}</span>
              </div>
            )
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 group/nav relative overflow-hidden",
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
                  isActive ? "text-blue-600" : "text-slate-400 group-hover/nav:text-slate-600"
                )}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className="truncate whitespace-nowrap transition-all duration-300 md:opacity-0 md:group-hover:opacity-100">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer / User Info */}
      <div className="px-3 py-4 border-t border-slate-100 space-y-4 overflow-hidden">
        {/* Powered By */}
        <div className="px-3 transition-all duration-300 md:opacity-0 md:group-hover:opacity-100">
          <div className="flex flex-col space-y-1 opacity-70 transition-opacity">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 whitespace-nowrap">Powered by</span>
            <div
              className="h-6 w-32 bg-gray-400 shrink-0"
              style={{
                maskImage: 'url(/logo_txt.svg)',
                WebkitMaskImage: 'url(/logo_txt.svg)',
                maskRepeat: 'no-repeat',
                maskSize: 'contain',
                maskPosition: 'left',
              }}
            />
          </div>
        </div>

        {/* Sign Out */}
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className=" cursor-pointer flex w-full items-center px-3 py-2.5 text-sm font-medium text-slate-500 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors group/btn overflow-hidden"
          >
            <LogOut className="h-5 w-5 mr-3 shrink-0 text-slate-400 group-hover/btn:text-red-500 transition-colors" />
            <span className="whitespace-nowrap transition-all duration-300 md:opacity-0 md:group-hover:opacity-100">Sign out</span>
          </button>
        </form>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile Top Navigation Bar */}
      <div className="md:hidden flex items-center justify-between px-6 h-16 bg-white border-b border-slate-200 shrink-0 w-full z-30">
        <div className="flex items-center">
          <ShieldCheck className="h-6 w-6 text-blue-600 shrink-0" strokeWidth={2.5} />
          <span className="ml-3 text-lg font-bold tracking-tight text-slate-900 uppercase">
            Overwatch
          </span>
        </div>
        <button 
          onClick={() => setIsOpen(true)}
          className="p-2 -mr-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 z-40 md:hidden backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out md:hidden flex flex-col h-full",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <SidebarContent />
      </div>

      {/* Desktop Sidebar Placeholder */}
      <div className="hidden md:block w-20 shrink-0 bg-transparent" />

      {/* Desktop Sidebar Floating Container */}
      <div className={cn(
        "hidden md:flex flex-col h-full bg-white border-r border-slate-200 shadow-sm z-40 fixed left-0 top-0",
        "transition-all duration-300 ease-in-out overflow-hidden group",
        "w-20 hover:w-64 hover:shadow-xl"
      )}>
        <SidebarContent />
      </div>
    </>
  )
}
