'use client'

import { useState, useCallback, useEffect } from 'react'
import {
    Filter, X, ChevronLeft, ChevronRight,
    Facebook, Instagram, Youtube, CheckCircle,
    User, ArrowRight, Siren, ClockFading, Info, Globe, TriangleAlert,
    TrendingDown, Smile, ExternalLink, Search, Users,
    MapPin, BadgeCheck, Calendar,
    ArrowUp, ArrowDown, ArrowUpDown
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Twitter, Reddit } from '@/utils/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { DateFilterPopover } from '@/app/(dashboard)/cases/DateFilterPopover'
import { RiskFilter } from '@/app/(dashboard)/cases/RiskFilter'
import { PlatformFilter } from '@/app/(dashboard)/cases/PlatformFilter'
import { StatusFilter } from '@/app/(dashboard)/cases/StatusFilter'

const PlatformIcon = ({ platform, className }) => {
    const p = platform?.toLowerCase()
    if (p === 'instagram') return <Instagram className={cn('w-3.5 h-3.5 text-pink-500', className)} />
    if (p === 'facebook') return <Facebook className={cn('w-3.5 h-3.5 text-blue-600', className)} />
    if (p === 'x') return (
        <span className='w-3.5 h-3.5'>
            <Twitter className={cn('max-w-3.5 max-h-3.5 text-slate-900', className)} />
        </span>
    )
    if (p === 'reddit') return (
        <span className='w-3.5 h-3.5'>
            <Reddit className={cn('max-w-3.5 max-h-3.5', className)} />
        </span>
    )
    if (p === 'youtube') return <Youtube className={cn('w-3.5 h-3.5 text-red-500', className)} />
    return <Globe className={cn('w-3.5 h-3.5 text-slate-400', className)} />
}

const getStatusConfig = (status) => {
    const s = status?.toLowerCase();
    if (s === 'to be reviewed' || s === 'pending' || !status) return { label: 'To Be Reviewed', color: 'text-slate-700 bg-slate-100 border-slate-200', icon: ClockFading }
    if (s === 'no action' || s === 'pass') return { label: 'No Action', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle }
    if (s === 'flag for takedown') return { label: 'Flag for Takedown', color: 'text-rose-700 bg-rose-50 border-rose-200', icon: Siren }
    return { label: status, color: 'text-slate-600 bg-slate-50 border-slate-200', icon: Info }
}

export function ProfilesList({ profiles, project: _project, initialFilters, initialSort = { field: null, direction: 'desc' }, currentPage, itemsPerPage }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const totalCount = profiles?.totalCount || 0
    const totalPages = profiles?.totalPages || 0
    const profileList = profiles?.profiles || []

    const [localProfiles, setLocalProfiles] = useState(profileList)
    const [searchInput, setSearchInput] = useState(initialFilters.searchText || '')
    const [followerMin, setFollowerMin] = useState(initialFilters.follower_min || '')
    const [followerMax, setFollowerMax] = useState(initialFilters.follower_max || '')
    const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)

    useEffect(() => {
        setLocalProfiles(profileList)
    }, [profileList])

    useEffect(() => {
        setSearchInput(initialFilters.searchText || '')
    }, [initialFilters.searchText])

    useEffect(() => {
        setFollowerMin(initialFilters.follower_min || '')
        setFollowerMax(initialFilters.follower_max || '')
    }, [initialFilters.follower_min, initialFilters.follower_max])

    const openProfile = useCallback((profileId) => {
        router.push(`/profiles/${profileId}`)
    }, [router])

    const updateQueryParams = useCallback((newParams) => {
        const params = new URLSearchParams(searchParams.toString())
        Object.entries(newParams).forEach(([key, value]) => {
            if (value === null || value === undefined || value === 'all') {
                params.delete(key)
            } else {
                params.set(key, value)
            }
        })
        if (!newParams.page) params.delete('page')
        router.push(`${pathname}?${params.toString()}`)
    }, [router, pathname, searchParams])

    const handleFilterChange = (key, value) => updateQueryParams({ [key]: value })
    const handlePageChange = (newPage) => newPage >= 1 && newPage <= totalPages && updateQueryParams({ page: newPage })
    const handleSortChange = (field) => {
        const direction = (initialSort.field === field && initialSort.direction === 'desc') ? 'asc' : 'desc'
        updateQueryParams({ sortField: field, sortDirection: direction, page: 1 })
    }
    const clearFilters = () => router.push(pathname)

    const SortIcon = ({ field }) => {
        if (initialSort.field !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 ml-1.5" />
        if (initialSort.direction === 'asc') return <ArrowUp className="w-3.5 h-3.5 text-blue-600 ml-1.5" />
        return <ArrowDown className="w-3.5 h-3.5 text-blue-600 ml-1.5" />
    }

    const handleSearchApply = () => {
        updateQueryParams({ search: searchInput, page: 1 })
    }

    const handleSearchSubmit = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleSearchApply()
        }
    }


    const handleFollowerApply = () => {
        updateQueryParams({
            follower_min: followerMin || null,
            follower_max: followerMax || null,
            page: 1,
        })
    }

    const hasActiveFilter = (
        initialFilters.platform !== 'all' ||
        initialFilters.status !== 'all' ||
        initialFilters.searchText ||
        initialFilters.publish_date_from ||
        initialFilters.publish_date_to ||
        (initialFilters.risk && initialFilters.risk !== 'all') ||
        initialFilters.location ||
        initialFilters.follower_min ||
        initialFilters.follower_max
    )

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Filters */}
            <div className=" shrink-0">
                <div className="px-3 py-3">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">

                        {/* Left: Filters */}
                        <div className="flex flex-col lg:flex-row gap-4 w-full">

                        {/* Header Row: Title & Summary Box */}
                        <div className="flex flex-col w-full lg:w-[160px] xl:w-[180px] shrink-0 rounded-xl relative">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex flex-col items-start gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <Filter className="w-3.5 h-3.5 text-blue-600" />
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filter</span>
                                    </div>
                                    <div className="flex items-baseline gap-1.5 mb-3">
                                        <span className="text-2xl font-black text-slate-800 tracking-tight leading-none">{totalCount}</span>
                                        <span className="text-[11px] font-bold text-slate-500 leading-none">profiles found</span>
                                    </div>
                                </div>
                                {/* Mobile toggle button */}
                                <div className="lg:hidden flex flex-col gap-2">
                                    <Button
                                        variant="ghost"
                                        onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
                                        className="bg-white border border-slate-200 rounded-md px-3 h-9 text-xs font-semibold text-slate-700 flex items-center gap-2 shadow-sm hover:border-blue-500 transition-all"
                                    >
                                        <Filter className="w-3.5 h-3.5 text-slate-500" />
                                        {isMobileFiltersOpen ? 'Hide' : 'Filters'}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Right: Filter Controls */}
                        {(() => {
                            const filtersContent = (
                                <div className="flex flex-col gap-4 w-full lg:flex-1">
                                    <div className="flex flex-col gap-3 w-full">

                                        {/* Row 1: Search + Platform + Verified + Status + Date */}
                                        <div className="grid grid-cols-2 lg:flex lg:flex-wrap items-start gap-2.5 sm:gap-3 w-full">

                                            <div className="space-y-1 col-span-2 w-full lg:w-auto lg:flex-1 lg:min-w-[220px] lg:max-w-[300px]">
                                                <Label className="text-[10px] uppercase font-bold text-slate-400">Search URL</Label>
                                                <div className="flex items-center gap-2">
                                                    <div className="relative flex-1">
                                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                            <Search className="h-4 w-4 text-slate-400" />
                                                        </div>
                                                        <input
                                                            type="text"
                                                            value={searchInput}
                                                            onChange={(e) => setSearchInput(e.target.value)}
                                                            onKeyDown={handleSearchSubmit}
                                                            placeholder="Search by profile URL..."
                                                            className="w-full bg-white border border-slate-200 rounded-md pl-9 pr-8 h-9 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400 placeholder:font-normal shadow-sm transition-all"
                                                        />
                                                        {searchInput && (
                                                            <button
                                                                onClick={() => { setSearchInput(''); updateQueryParams({ search: '', page: 1 }) }}
                                                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-100 text-slate-400"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                    <Button
                                                        onClick={handleSearchApply}
                                                        className="h-9 w-9 p-0 shrink-0 bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer transition-colors"
                                                        title="Search"
                                                    >
                                                        <Search className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="space-y-1 w-full lg:w-auto lg:flex-1 lg:max-w-[160px]">
                                                <PlatformFilter
                                                    initialPlatform={initialFilters.platform}
                                                    onChange={(val) => handleFilterChange('platform', val)}
                                                />
                                            </div>

                                            <div className="space-y-1 w-full lg:w-auto lg:flex-1 lg:max-w-[160px]">
                                                <StatusFilter
                                                    label="Status"
                                                    placeholder="All Status"
                                                    initialStatus={initialFilters.status}
                                                    onChange={(val) => handleFilterChange('status', val)}
                                                    options={[
                                                        { value: 'No Action', label: 'No Action' },
                                                        { value: 'Flag for Takedown', label: 'Flag for Takedown' },
                                                        { value: 'To Be Reviewed', label: 'To Be Reviewed' },
                                                    ]}
                                                />
                                            </div>

                                            <div className="space-y-1.5 w-full lg:w-auto lg:min-w-[140px] lg:max-w-[160px]">
                                                <Label className="text-[10px] uppercase font-bold text-slate-400">Last Activity</Label>
                                                <DateFilterPopover
                                                    title="Last Activity"
                                                    initialFrom={initialFilters.publish_date_from}
                                                    initialTo={initialFilters.publish_date_to}
                                                    onApply={(range) => updateQueryParams({
                                                        publish_date_from: range?.from ? range.from.toISOString() : null,
                                                        publish_date_to: range?.to ? range.to.toISOString() : null,
                                                        page: 1
                                                    })}
                                                />
                                            </div>



                                            <div className="space-y-1 w-full lg:w-auto lg:flex-1 lg:max-w-[160px]">
                                                <RiskFilter
                                                    initialRisk={initialFilters.risk || 'all'}
                                                    onChange={(val) => handleFilterChange('risk', val)}
                                                />
                                            </div>

                                            <div className="space-y-1 col-span-2 w-full lg:col-span-1 lg:w-auto lg:shrink-0">
                                                <Label className="text-[10px] uppercase font-bold text-slate-400">Followers</Label>
                                                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2 py-1 w-full lg:w-auto">
                                                    <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                    <input
                                                        type="number"
                                                        value={followerMin}
                                                        onChange={(e) => setFollowerMin(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleFollowerApply()}
                                                        placeholder="Min"
                                                        min={0}
                                                        className="min-w-0 flex-1 lg:flex-none lg:w-[68px] bg-transparent border-none h-7 px-1 text-xs font-semibold focus:outline-none"
                                                    />
                                                    <span className="text-slate-300 text-xs font-bold">–</span>
                                                    <input
                                                        type="number"
                                                        value={followerMax}
                                                        onChange={(e) => setFollowerMax(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleFollowerApply()}
                                                        placeholder="Max"
                                                        min={0}
                                                        className="min-w-0 flex-1 lg:flex-none lg:w-[68px] bg-transparent border-none h-7 px-1 text-xs font-semibold focus:outline-none"
                                                    />
                                                    <Button
                                                        size="sm"
                                                        onClick={handleFollowerApply}
                                                        className="h-7 px-2.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                                                    >
                                                        Apply
                                                    </Button>
                                                    {(initialFilters.follower_min || initialFilters.follower_max) && (
                                                        <button
                                                            onClick={() => { setFollowerMin(''); setFollowerMax(''); updateQueryParams({ follower_min: null, follower_max: null, page: 1 }) }}
                                                            className="p-1 rounded-full hover:bg-slate-100 text-slate-400 shrink-0"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Active filters bar + Clear */}
                                            {hasActiveFilter && (
                                                <div className="flex flex-wrap items-center gap-2 bg-slate-50/80 border border-slate-100 rounded-md px-3 py-1.5 lg:h-9 lg:py-0 shadow-sm shrink-0 col-span-2 w-full lg:col-span-1 xl:w-auto mt-2 xl:mt-0">
                                                    <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Active:</span>
                                                    {initialFilters.searchText && (
                                                        <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-bold text-[10px] uppercase tracking-wider border border-blue-100">
                                                            <Search className="w-3 h-3" /> URL
                                                        </div>
                                                    )}
                                                    {initialFilters.platform !== 'all' && (
                                                        <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-bold text-[10px] uppercase tracking-wider border border-blue-100">
                                                            {initialFilters.platform}
                                                        </div>
                                                    )}
                                                    {initialFilters.risk && initialFilters.risk !== 'all' && (
                                                        <div className="flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-700 rounded font-bold text-[10px] uppercase tracking-wider border border-rose-100">
                                                            {initialFilters.risk} risk
                                                        </div>
                                                    )}
                                                    {(initialFilters.follower_min || initialFilters.follower_max) && (
                                                        <div className="flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 rounded font-bold text-[10px] uppercase tracking-wider border border-purple-100">
                                                            <Users className="w-3 h-3" /> Followers
                                                        </div>
                                                    )}
                                                    {(initialFilters.publish_date_from || initialFilters.publish_date_to) && (
                                                        <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded font-bold text-[10px] uppercase tracking-wider border border-amber-100">
                                                            Date range
                                                        </div>
                                                    )}
                                                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold text-[10px] uppercase tracking-wider cursor-pointer transition-colors ml-auto">
                                                        <X className="w-3.5 h-3.5 mr-1 text-rose-500" /> Clear Filters
                                                    </Button>
                                                </div>
                                            )}

                                        </div>
                                    </div>
                                </div>
                            )

                            return (
                                <>
                                    {/* Desktop View */}
                                    <div className="hidden lg:flex w-full">
                                        {filtersContent}
                                    </div>

                                    {/* Mobile View (Dialog) */}
                                    <Dialog open={isMobileFiltersOpen} onOpenChange={setIsMobileFiltersOpen}>
                                        <DialogContent className="lg:hidden w-[95vw] max-w-md rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
                                            <DialogHeader className="mb-2 text-left">
                                                <DialogTitle className="text-xl font-black text-slate-800">Filters</DialogTitle>
                                            </DialogHeader>
                                            {filtersContent}
                                        </DialogContent>
                                    </Dialog>
                                </>
                            )
                        })()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0 flex flex-col">
                {/* Desktop Table View */}
                <div className="hidden md:flex md:flex-col flex-1 min-h-0 bg-white shadow-sm border border-slate-200 overflow-hidden">
                    <div className="flex-1 overflow-auto custom-scrollbar relative">
                    <table className="min-w-full border-separate border-spacing-0">
                        <thead className="sticky top-0 z-20 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            <tr className="bg-slate-50/90 backdrop-blur-md">
                                <th
                                    scope="col"
                                    onClick={() => handleSortChange('risk')}
                                    className="px-6 py-4 text-left border-b border-slate-100 cursor-pointer hover:bg-slate-100/50 transition-colors select-none"
                                >
                                    <div className="flex items-center">Risk<SortIcon field="risk" /></div>
                                </th>
                                <th scope="col" className="px-6 py-4 text-left border-b border-slate-100">Status</th>
                                <th scope="col" className="px-6 py-4 text-left border-b border-slate-100">Display Name</th>
                                <th scope="col" className="px-6 py-4 text-left border-b border-slate-100">Platform</th>
                                <th
                                    scope="col"
                                    onClick={() => handleSortChange('followers')}
                                    className="px-6 py-4 text-left border-b border-slate-100 hidden lg:table-cell cursor-pointer hover:bg-slate-100/50 transition-colors select-none"
                                >
                                    <div className="flex items-center">Followers<SortIcon field="followers" /></div>
                                </th>
                                <th
                                    scope="col"
                                    onClick={() => handleSortChange('cases')}
                                    className="px-6 py-4 text-left border-b border-slate-100 cursor-pointer hover:bg-slate-100/50 transition-colors select-none"
                                >
                                    <div className="flex items-center">Cases<SortIcon field="cases" /></div>
                                </th>
                                <th
                                    scope="col"
                                    onClick={() => handleSortChange('last_active')}
                                    className="px-6 py-4 text-left border-b border-slate-100 hidden lg:table-cell cursor-pointer hover:bg-slate-100/50 transition-colors select-none"
                                >
                                    <div className="flex items-center">Last Active<SortIcon field="last_active" /></div>
                                </th>
                                <th scope="col" className="px-6 py-4 text-right border-b border-slate-100">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white">
                            {localProfiles.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center justify-center text-slate-400">
                                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100 shadow-inner">
                                                <User className="w-8 h-8 opacity-20" />
                                            </div>
                                            <h3 className="text-lg font-bold text-slate-900 mb-1">No profiles found</h3>
                                            <p className="text-sm text-slate-500 max-w-[280px] leading-relaxed mx-auto mb-6">
                                                We couldn't find any profiles matching your current filters. Try adjusting your search criteria.
                                            </p>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={clearFilters}
                                                className="h-9 px-4 text-xs font-bold border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg shadow-sm"
                                            >
                                                <X className="w-3.5 h-3.5 mr-2" />
                                                Clear All Filters
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                localProfiles.map((profile) => {
                                    const risk = profile.review_details?.risk || 'safe'
                                    const followerCount = profile.metadata?.follower_count
                                    const lastActive = profile.last_relevant_publish_date
                                    return (
                                        <tr key={profile._id} onClick={() => openProfile(profile._id)} className="transition-all cursor-pointer group hover:bg-slate-50/80">
                                            <td className="px-4 py-3 whitespace-nowrap align-middle border-b border-slate-50">
                                                <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border shadow-sm",
                                                    risk === "high" ? "bg-rose-100 text-rose-600 border-rose-300"
                                                        : risk === "mid" ? "bg-orange-100 text-orange-600 border-orange-300"
                                                            : risk === "low" ? "bg-amber-100 text-amber-600 border-amber-300"
                                                                : "bg-emerald-100 text-emerald-600 border-emerald-300")}>
                                                    {
                                                        risk === "high" ? (
                                                            <Siren className="w-3.5 h-3.5 mr-1.5" />
                                                        ) : risk === "mid" ? (
                                                            <TriangleAlert className="w-3.5 h-3.5 mr-1.5" />
                                                        ) : risk === "low" ? (
                                                            <TrendingDown className="w-3.5 h-3.5 mr-1.5" />
                                                        ) : (
                                                            <Smile className="w-3.5 h-3.5 mr-1.5" />
                                                        )
                                                    }
                                                    {risk}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap align-middle border-b border-slate-50">
                                                {(() => {
                                                    const statusCfg = getStatusConfig(profile.client_status);
                                                    const StatusIcon = statusCfg.icon;
                                                    return (
                                                        <Badge variant="outline" className={cn(' rounded-md capitalize font-bold border gap-1.5 pl-2 h-7 text-xs', statusCfg.color)}>
                                                            <StatusIcon className="w-3.5 h-3.5" />
                                                            {statusCfg.label}
                                                        </Badge>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap align-middle border-b border-slate-50">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                                                        {profile.metadata?.profile_pic ? (
                                                            <img src={profile.metadata.profile_pic} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <User className="w-4 h-4 text-slate-400" />
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                                        <span className="font-bold text-slate-800 text-sm tracking-tight truncate flex items-center gap-1">
                                                            <span className="truncate">{profile.display_name}</span>
                                                            {profile.is_verified && (
                                                                <BadgeCheck className="w-3.5 h-3.5 text-blue-500 fill-blue-50 shrink-0" />
                                                            )}
                                                        </span>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {profile.username && (
                                                                <span className="text-[10px] text-slate-400 truncate">
                                                                    @{profile.username}
                                                                </span>
                                                            )}
                                                            {profile.profile_url && (
                                                                <a
                                                                    href={profile.profile_url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors shrink-0"
                                                                >
                                                                    Source <ExternalLink className="w-2.5 h-2.5" />
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap align-middle border-b border-slate-50">
                                                <Badge variant="outline" className="capitalize font-bold text-slate-500 border-slate-200 gap-1.5 pl-2 h-7 text-[10px]">
                                                    <PlatformIcon platform={profile.platform} />
                                                    {profile.platform}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap align-middle border-b border-slate-50 hidden lg:table-cell">
                                                {followerCount != null ? (
                                                    <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs">
                                                        <Users className="w-3.5 h-3.5 text-slate-400" />
                                                        {followerCount.toLocaleString()}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-300 text-xs">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap align-middle font-bold text-slate-700 text-sm border-b border-slate-50">
                                                {profile.cases_count ?? 0}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap align-middle border-b border-slate-50 hidden lg:table-cell">
                                                {lastActive ? (
                                                    <div className="flex items-center gap-1.5 text-slate-600 text-xs font-semibold">
                                                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                        {format(new Date(lastActive), 'dd MMM yyyy')}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-300 text-xs">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-right align-middle border-b border-slate-50">
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    className={cn(
                                                        "h-8 text-xs font-bold transition-all shadow-sm",
                                                        "bg-white border border-slate-200 hover:bg-slate-50 text-slate-600"
                                                    )}
                                                >
                                                    Details
                                                    <ArrowRight className="w-3 h-3 ml-1.5 opacity-50" />
                                                </Button>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                    </div>
                </div>

                {/* Mobile Cards View */}
                <div className="block md:hidden flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-3 mt-2 px-3">
                    {localProfiles.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 shadow-inner">
                                <User className="w-8 h-8 opacity-20" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mb-1">No profiles found</h3>
                            <p className="text-sm text-slate-500 leading-relaxed mb-6">
                                We couldn't find any profiles matching your current filters.
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={clearFilters}
                                className="h-9 px-4 text-xs font-bold border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg shadow-sm"
                            >
                                <X className="w-3.5 h-3.5 mr-2" />
                                Clear Filters
                            </Button>
                        </div>
                    ) : (
                        localProfiles.map((profile) => {
                            const risk = profile.review_details?.risk || 'safe'
                            const statusCfg = getStatusConfig(profile.client_status)
                            const StatusIcon = statusCfg.icon
                            const followerCount = profile.metadata?.follower_count
                            const location = profile.metadata?.location?.trim()

                            return (
                                <div 
                                    key={profile._id} 
                                    onClick={() => openProfile(profile._id)}
                                    className="bg-white rounded-2xl border p-4 flex flex-col gap-4 shadow-sm transition-all cursor-pointer relative overflow-hidden border-slate-200 hover:border-slate-300 hover:shadow-md"
                                >
                                    {/* Header: Platform & Status */}
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="capitalize font-bold text-slate-500 border-slate-200 gap-1.5 pl-1.5 pr-2 h-6 text-[10px]">
                                                <PlatformIcon platform={profile.platform} className="w-3 h-3" />
                                                {profile.platform}
                                            </Badge>
                                            <Badge variant="outline" className={cn('rounded-md capitalize font-bold border gap-1 pl-1.5 pr-2 h-6 text-[10px]', statusCfg.color)}>
                                                <StatusIcon className="w-3 h-3" />
                                                {statusCfg.label}
                                            </Badge>
                                        </div>
                                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border shadow-sm",
                                            risk === "high" ? "bg-rose-100 text-rose-600 border-rose-300"
                                                : risk === "mid" ? "bg-orange-100 text-orange-600 border-orange-300"
                                                    : risk === "low" ? "bg-amber-100 text-amber-600 border-amber-300"
                                                        : "bg-emerald-100 text-emerald-600 border-emerald-300")}>
                                            {
                                                risk === "high" ? (
                                                    <Siren className="w-3 h-3 mr-1" />
                                                ) : risk === "mid" ? (
                                                    <TriangleAlert className="w-3 h-3 mr-1" />
                                                ) : risk === "low" ? (
                                                    <TrendingDown className="w-3 h-3 mr-1" />
                                                ) : (
                                                    <Smile className="w-3 h-3 mr-1" />
                                                )
                                            }
                                            {risk}
                                        </span>
                                    </div>

                                    {/* Profile Info */}
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                                            {profile.metadata?.profile_pic ? (
                                                <img src={profile.metadata.profile_pic} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <User className="w-5 h-5 text-slate-400" />
                                            )}
                                        </div>
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <span className="font-bold text-slate-900 text-sm tracking-tight truncate flex items-center gap-1">
                                                <span className="truncate">{profile.display_name}</span>
                                                {profile.is_verified && (
                                                    <BadgeCheck className="w-3.5 h-3.5 text-blue-500 fill-blue-50 shrink-0" />
                                                )}
                                            </span>
                                            {profile.username && (
                                                <span className="text-[11px] text-slate-500 truncate">
                                                    @{profile.username}
                                                </span>
                                            )}
                                            {(followerCount != null || location) && (
                                                <div className="flex items-center gap-3 mt-1.5 text-[10px] font-semibold text-slate-500">
                                                    {followerCount != null && (
                                                        <span className="inline-flex items-center gap-1">
                                                            <Users className="w-3 h-3 text-slate-400" />
                                                            {followerCount.toLocaleString()}
                                                        </span>
                                                    )}
                                                    {location && (
                                                        <span className="inline-flex items-center gap-1 truncate">
                                                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                                            <span className="truncate max-w-[140px]">{location}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Bottom: Cases, Source, Actions */}
                                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-1">
                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Cases</span>
                                                <span className="text-xs font-bold text-slate-700 leading-none">{profile.cases_count ?? 0}</span>
                                            </div>
                                            <div className="w-px h-6 bg-slate-100"></div>
                                            <a
                                                href={profile.profile_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center text-blue-600 hover:text-blue-800 font-bold text-[10px] transition-colors hover:underline bg-blue-50 px-2 py-1 rounded-md"
                                            >
                                                Source <ExternalLink className="w-2.5 h-2.5 ml-1" />
                                            </a>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openProfile(profile._id);
                                            }}
                                            className="h-7 px-3 text-[10px] font-bold shadow-sm bg-white border border-slate-200 hover:bg-slate-50 text-slate-600"
                                        >
                                            Details
                                            <ArrowRight className="w-2.5 h-2.5 ml-1 opacity-50" />
                                        </Button>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Pagination */}
            {totalCount > 0 && (
            <div className="pb-2 pt-2 shrink-0">
                <div className="px-3 sm:px-4 py-1 flex flex-col lg:flex-row items-center justify-between gap-3 lg:gap-0">
                <div className="flex items-center justify-between w-full lg:w-auto gap-4 sm:gap-6">
                    <div className="flex items-center gap-2 sm:gap-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap hidden sm:inline">Show:</span>
                    <div className="flex bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                        {[10, 25, 50, 75, 100].map((limit) => (
                        <button
                            key={limit}
                            onClick={() => updateQueryParams({ limit: limit.toString(), page: 1 })}
                            className={cn(
                            "px-2 sm:px-2.5 py-1 text-[10px] font-bold transition-all rounded-md cursor-pointer",
                            itemsPerPage === limit
                                ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200"
                                : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                            )}
                        >
                            {limit}
                        </button>
                        ))}
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap hidden sm:inline">per page</span>
                    </div>

                    <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    Page <span className="text-slate-900">{currentPage}</span> / <span className="text-slate-900">{totalPages || 1}</span>
                    </div>
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center gap-1 sm:gap-2 w-full lg:w-auto justify-between lg:justify-end mt-2 lg:mt-0">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(1)}
                        disabled={currentPage === 1}
                        className="h-8 sm:h-9 px-2 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50 hidden sm:flex"
                        title="First Page"
                    >
                        &lt;&lt;
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="h-8 sm:h-9 px-2 sm:px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50 flex-1 sm:flex-none"
                    >
                        <ChevronLeft className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Previous</span>
                    </Button>

                    <div className="flex items-center gap-1 mx-0 sm:mx-1">
                        {(() => {
                        const pages = [];
                        let start = Math.max(1, currentPage - 2);
                        let end = Math.min(totalPages, currentPage + 2);

                        // For mobile, show fewer pages
                        let isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
                        if (isMobile) {
                            start = Math.max(1, currentPage - 1);
                            end = Math.min(totalPages, currentPage + 1);
                        }

                        if (currentPage <= (isMobile ? 1 : 2)) {
                            end = Math.min(totalPages, isMobile ? 3 : 5);
                        }
                        if (currentPage >= totalPages - (isMobile ? 0 : 1)) {
                            start = Math.max(1, totalPages - (isMobile ? 2 : 4));
                        }

                        for (let i = start; i <= end; i++) {
                            pages.push(i);
                        }

                        return pages.map(pageNum => (
                            <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => handlePageChange(pageNum)}
                            className={cn(
                                "h-8 w-8 sm:h-9 sm:w-9 p-0 text-xs font-bold",
                                currentPage === pageNum
                                ? "bg-slate-800 hover:bg-slate-900 text-white shadow-sm"
                                : "border-slate-200 text-slate-600 hover:bg-slate-50"
                            )}
                            >
                            {pageNum}
                            </Button>
                        ));
                        })()}
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="h-8 sm:h-9 px-2 sm:px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50 flex-1 sm:flex-none"
                    >
                        <span className="hidden sm:inline">Next</span> <ChevronRight className="w-4 h-4 sm:ml-1" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(totalPages)}
                        disabled={currentPage === totalPages}
                        className="h-8 sm:h-9 px-2 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50 hidden sm:flex"
                        title="Last Page"
                    >
                        &gt;&gt;
                    </Button>
                    </div>
                )}
                </div>
            </div>
            )}

        </div>
    )
}

