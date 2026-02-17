'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, List, ShieldAlert, Settings, LogOut, LayoutDashboard, ShieldCheck } from 'lucide-react'
import { useClient } from '@/context/ClientContext'

export function Sidebar() {
  const pathname = usePathname()
  const { user, clientDetails } = useClient()

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard, show: true },
    { name: 'Review Cases', href: '/review-cases', icon: ShieldCheck, show: clientDetails?.permission === "reviewer" },
    { name: 'Cases List', href: '/cases', icon: List, show: true },
    { name: 'Takedowns', href: '/takedowns', icon: ShieldAlert, show: true },
    { name: 'Configurations', href: '/configurations', icon: Settings, show: true },
  ].filter(item => item.show)

  return (
    <div className="relative w-16 shrink-0">
      <div className="fixed inset-y-0 left-0 z-50 flex flex-col w-16 bg-white border-r border-gray-200 transition-all duration-300 ease-in-out hover:w-64 group shadow-xl">
        <div className="flex items-center h-16 px-4 //border-b //border-gray-200 overflow-hidden shrink-0">
          {/* <ShieldCheck className="h-8 w-8 text-blue-700 shrink-0" /> */}
          <span className="ml-4 text-2xl tracking-widest font-bold text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            OVERWATCH
          </span>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pt-4">
          <nav className="px-2 space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center px-3 py-3 text-sm font-medium rounded-md transition-all duration-200 group/item ${isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                >
                  <item.icon className={`h-6 w-6 shrink-0 ${isActive ? 'text-blue-700' : 'text-gray-400 group-hover/item:text-blue-600'}`} />
                  <span className="ml-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                    {item.name}
                  </span>
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex flex-col items-center justify-between px-4 py-8 overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap mx-4">
          <span className="text-xs uppercase tracking-wide font-semibold text-gray-400 mb-2">Powered by</span>
          <div
            className="h-6 w-32 bg-gray-400 "
            style={{
              maskImage: 'url(/logo_txt.svg)',
              WebkitMaskImage: 'url(/logo_txt.svg)',
              maskRepeat: 'no-repeat',
              maskSize: 'contain',
              maskPosition: 'center',
            }}
          />
        </div>

        <div className="p-2 border-t border-gray-200 overflow-hidden">
          {/* {user && (
            <div className="px-3 py-2 text-xs text-gray-500 truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300 mb-2">
              {user.email}
            </div>
          )} */}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex cursor-pointer items-center w-full px-3 py-3 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-50 hover:text-gray-900 group/logout"
            >
              <LogOut className="h-6 w-6 shrink-0 text-gray-400 group-hover/logout:text-red-500" />
              <span className="ml-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                Sign out
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
