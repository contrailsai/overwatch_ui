'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  List, FileText, ShieldAlert, Settings, UserStar, LogOut, LayoutDashboard,
  ShieldCheck, GitPullRequestCreateArrow, Users, Menu, X, ScanEye, UserRoundPen,
  Rss, Library, ChevronDown, FileStack, Megaphone, Globe, UserRoundSearch,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getEnabledSections } from '@/lib/project-sections'

const SIDEBAR_GROUPS_STORAGE_KEY = 'overwatch.sidebar.groups.open'

function loadOpenGroups() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(SIDEBAR_GROUPS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveOpenGroups(map) {
  try {
    localStorage.setItem(SIDEBAR_GROUPS_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

function itemIsActive(pathname, href) {
  return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))
}

function NavLinkItem({ item, pathname }) {
  const isActive = itemIsActive(pathname, item.href)

  if (item.show === 'grayed_out') {
    return (
      <div
        className={cn(
          'flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 group relative overflow-hidden',
          'text-slate-400 cursor-not-allowed',
        )}
      >
        <item.icon
          className="h-5 w-5 shrink-0 mr-3 transition-colors text-slate-400"
          strokeWidth={2}
        />
        <span className="truncate whitespace-nowrap transition-all duration-300 md:opacity-0 md:group-hover:opacity-100">
          {item.name}
        </span>
      </div>
    )
  }

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 group/nav relative overflow-hidden',
        isActive
          ? 'bg-blue-50 text-blue-700'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
      )}
    >
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-600 rounded-r-full" />
      )}
      <item.icon
        className={cn(
          'h-5 w-5 shrink-0 mr-3 transition-colors',
          isActive ? 'text-blue-600' : 'text-slate-400 group-hover/nav:text-slate-600',
        )}
        strokeWidth={isActive ? 2.5 : 2}
      />
      <span className="truncate whitespace-nowrap transition-all duration-300 md:opacity-0 md:group-hover:opacity-100">
        {item.name}
      </span>
    </Link>
  )
}

function NavGroup({ group, pathname, open, onToggle }) {
  if (group.disabled) {
    return (
      <div
        className={cn(
          'flex items-center px-3 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 overflow-hidden',
          'text-slate-400 cursor-not-allowed',
        )}
        aria-disabled="true"
      >
        <group.icon
          className="h-5 w-5 shrink-0 mr-3 text-slate-400"
          strokeWidth={2}
        />
        <span className="flex-1 text-left truncate whitespace-nowrap transition-all duration-300 md:opacity-0 md:group-hover:opacity-100">
          {group.name}
        </span>
      </div>
    )
  }

  const visibleChildren = group.children.filter((c) => c.show)
  if (visibleChildren.length === 0) return null

  const childActive = visibleChildren.some((c) => itemIsActive(pathname, c.href))
  const isOpen = open || childActive

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => onToggle(group.id)}
        className={cn(
          'flex w-full items-center px-3 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 overflow-hidden',
          childActive
            ? 'text-slate-900'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
        )}
        aria-expanded={isOpen}
      >
        <group.icon
          className={cn(
            'h-5 w-5 shrink-0 mr-3',
            childActive ? 'text-blue-600' : 'text-slate-400',
          )}
          strokeWidth={2}
        />
        <span className="flex-1 text-left truncate whitespace-nowrap transition-all duration-300 md:opacity-0 md:group-hover:opacity-100">
          {group.name}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-slate-400 transition-all duration-300 md:opacity-0 md:group-hover:opacity-100',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {isOpen && (
        <div className="ml-3 pl-2 border-l border-slate-100 space-y-0.5">
          {visibleChildren.map((item) => (
            <NavLinkItem key={item.name} item={item} pathname={pathname} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ user, clientDetails, project }) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState({})

  useEffect(() => {
    setOpenGroups(loadOpenGroups())
  }, [])

  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

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

  const isReviewer = clientDetails?.permission === 'reviewer'
  const isAdminOrReviewer =
    clientDetails?.permission === 'client-admin' || clientDetails?.permission === 'reviewer'
  const sections = getEnabledSections(project?.project_details)

  const navigation = useMemo(() => {
    const withTakedownStatus = (item) => {
      if (item.name !== 'Takedowns') return item
      const doTakedowns = project?.project_details?.do_takedowns
      const status = doTakedowns === false ? 'grayed_out' : true
      return { ...item, show: status }
    }

    const feedsShow = sections.feeds ? true : 'grayed_out'

    return [
      { type: 'item', name: 'Analytics', href: '/', icon: LayoutDashboard, show: true },
      {
        type: 'group',
        id: 'posts',
        name: 'Posts',
        icon: FileStack,
        disabled: !sections.posts,
        children: [
          { name: 'Review Cases', href: '/review-cases', icon: ScanEye, show: isReviewer },
          { name: 'Content List', href: '/cases', icon: List, show: true },
          { name: 'Review Profiles', href: '/review-profiles', icon: UserRoundPen, show: isReviewer },
          { name: 'Profile List', href: '/profiles', icon: Users, show: true },
          { name: 'POIs', href: '/pois', icon: UserRoundSearch, show: true },
        ],
      },
      {
        type: 'group',
        id: 'ads',
        name: 'Ads',
        icon: Megaphone,
        disabled: !sections.ads,
        children: [
          { name: 'Review Ads', href: '/review-ads', icon: ScanEye, show: isReviewer },
          { name: 'Ad List', href: '/ads', icon: List, show: true },
          { name: 'Review Ad Profiles', href: '/review-ad-profiles', icon: UserRoundPen, show: isReviewer },
          { name: 'Ad Profile List', href: '/ad-profiles', icon: Users, show: true },
        ],
      },
      {
        type: 'group',
        id: 'domains',
        name: 'Domains',
        icon: Globe,
        disabled: !sections.domains,
        children: [
          { name: 'Review Domains', href: '/review-domains', icon: ScanEye, show: isReviewer },
          { name: 'Domains', href: '/domains', icon: List, show: true },
        ],
      },
      { type: 'item', name: 'Feeds', href: '/feeds', icon: Library, show: feedsShow },
      { type: 'item', name: 'Manage Feeds', href: '/manage-feeds', icon: Rss, show: isReviewer ? feedsShow : false },
      withTakedownStatus({ name: 'Takedowns', href: '/takedowns', icon: ShieldAlert, show: true, type: 'item' }),
      { type: 'item', name: 'Upload Content', href: '/upload-content', icon: GitPullRequestCreateArrow, show: true },
      { type: 'item', name: 'Configurations', href: '/configurations', icon: Settings, show: true },
      { type: 'item', name: 'Admin', href: '/admin', icon: UserStar, show: isAdminOrReviewer },
      { type: 'item', name: 'Reports', href: '/reports', icon: FileText, show: true },
    ]
  }, [isReviewer, isAdminOrReviewer, project?.project_details?.do_takedowns, sections.posts, sections.ads, sections.domains, sections.feeds])

  const toggleGroup = (id) => {
    setOpenGroups((prev) => {
      const childActive = navigation
        .find((n) => n.type === 'group' && n.id === id)
        ?.children?.some((c) => itemIsActive(pathname, c.href))
      // If a child is active, keep open unless user explicitly collapses
      const currentlyOpen = prev[id] ?? childActive
      const next = { ...prev, [id]: !currentlyOpen }
      saveOpenGroups(next)
      return next
    })
  }

  const SidebarContent = () => (
    <>
      <div className="flex items-center justify-between h-16 px-6 border-b border-slate-100 shrink-0 overflow-hidden">
        <div className="flex items-center w-full">
          <ShieldCheck className="h-6 w-6 text-blue-600 shrink-0" strokeWidth={2.5} />
          <span className="ml-3 text-lg font-bold tracking-tight text-slate-900 uppercase whitespace-nowrap transition-all duration-300 md:opacity-0 md:group-hover:opacity-100">
            Overwatch
          </span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="md:hidden p-2 -mr-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-6 space-y-1">
        {navigation.map((entry) => {
          if (entry.type === 'group') {
            const defaultOpen = entry.disabled
              ? false
              : openGroups[entry.id] ??
                entry.children.some((c) => itemIsActive(pathname, c.href))
            return (
              <NavGroup
                key={entry.id}
                group={entry}
                pathname={pathname}
                open={Boolean(defaultOpen)}
                onToggle={toggleGroup}
              />
            )
          }

          if (!entry.show) return null
          return <NavLinkItem key={entry.name} item={entry} pathname={pathname} />
        })}
      </nav>

      <div className="px-3 py-4 border-t border-slate-100 space-y-4 overflow-hidden">
        <div className="px-3 transition-all duration-300 md:opacity-0 md:group-hover:opacity-100">
          <div className="flex flex-col space-y-1 opacity-70 transition-opacity">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 whitespace-nowrap">
              Powered by
            </span>
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

        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="cursor-pointer flex w-full items-center px-3 py-2.5 text-sm font-medium text-slate-500 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors group/btn overflow-hidden"
          >
            <LogOut className="h-5 w-5 mr-3 shrink-0 text-slate-400 group-hover/btn:text-red-500 transition-colors" />
            <span className="whitespace-nowrap transition-all duration-300 md:opacity-0 md:group-hover:opacity-100">
              Sign out
            </span>
          </button>
        </form>
      </div>
    </>
  )

  return (
    <div className="contents">
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

      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40 md:hidden backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out md:hidden flex flex-col h-full',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <SidebarContent />
      </div>

      <div className="hidden md:block w-20 shrink-0 bg-transparent" />

      <div
        className={cn(
          'hidden md:flex flex-col h-full bg-white border-r border-slate-200 shadow-sm z-40 fixed left-0 top-0',
          'transition-all duration-300 ease-in-out overflow-hidden group',
          'w-20 hover:w-64 hover:shadow-xl',
        )}
      >
        <SidebarContent />
      </div>
    </div>
  )
}
