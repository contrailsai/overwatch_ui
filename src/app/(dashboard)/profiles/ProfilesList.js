'use client'

import { useState, useCallback, useEffect } from 'react'
import {
    Filter, X, ChevronLeft, ChevronRight,
    Facebook, Instagram, Youtube, CheckCircle, ShieldOff,
    User, ArrowRight, Siren, ClockFading, Info, Globe, TriangleAlert,
    TrendingDown, Smile, BadgeCheck, ExternalLink
} from 'lucide-react'
import { Twitter } from '@/utils/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

import ProfileDetailPanel from "./ProfileDetails"

const PlatformIcon = ({ platform, className }) => {
    const p = platform?.toLowerCase()
    if (p === 'instagram') return <Instagram className={cn('w-3.5 h-3.5 text-pink-500', className)} />
    if (p === 'facebook') return <Facebook className={cn('w-3.5 h-3.5 text-blue-600', className)} />
    if (p === 'x') return (
        <span className='w-3.5 h-3.5'>
            <Twitter className={cn('max-w-3.5 max-h-3.5 text-slate-900', className)} />
        </span>
    )
    if (p === 'youtube') return <Youtube className={cn('w-3.5 h-3.5 text-red-500', className)} />
    return <Globe className={cn('w-3.5 h-3.5 text-slate-400', className)} />
}

const getStatusConfig = (status) => {
    const s = status?.toLowerCase();
    if (s === 'to be reviewed' || s === 'pending' || !status) return { label: 'To Be Reviewed', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: ClockFading }
    if (s === 'no action' || s === 'pass') return { label: 'No Action', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle }
    if (s === 'flag for takedown') return { label: 'Flag for Takedown', color: 'text-rose-700 bg-rose-50 border-rose-200', icon: Siren }
    return { label: status, color: 'text-slate-600 bg-slate-50 border-slate-200', icon: Info }
}

export function ProfilesList({ profiles, project, initialFilters, currentPage }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const totalCount = profiles?.totalCount || 0
    const totalPages = profiles?.totalPages || 0
    const profileList = profiles?.profiles || []

    const [localProfiles, setLocalProfiles] = useState(profileList)
    const [selectedProfile, setSelectedProfile] = useState(null)

    useEffect(() => {
        setLocalProfiles(profileList)
    }, [profileList])

    const handleProfileUpdate = (profileId, updates) => {
        setLocalProfiles(prev => prev.map(p =>
            p._id === profileId ? { ...p, ...updates } : p
        ))
        if (selectedProfile?._id === profileId) {
            setSelectedProfile(prev => ({ ...prev, ...updates }))
        }
        router.refresh()
    }

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
    const clearFilters = () => router.push(pathname)
    const hasActiveFilter = initialFilters.platform !== 'all' || initialFilters.is_verified !== 'all' || initialFilters.status !== 'all'

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Filters */}
            <div className="px-6 py-4 shrink-0">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-6 w-full lg:w-auto">
                            <div className="flex items-center gap-2.5 shrink-0">
                                <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><Filter className="w-4 h-4" /></div>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Filters</span>
                            </div>
                            <Separator orientation="vertical" className="h-8 bg-slate-100 hidden sm:block" />
                            <div className="flex flex-wrap items-center gap-4">
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-slate-400">Platform</Label>
                                    <Select value={initialFilters.platform} onValueChange={(val) => handleFilterChange('platform', val)}>
                                        <SelectTrigger className="w-[140px] bg-white border-slate-200 h-9 text-xs font-semibold">
                                            <SelectValue placeholder="All Platforms" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Platforms</SelectItem>
                                            <SelectItem value="instagram">Instagram</SelectItem>
                                            <SelectItem value="facebook">Facebook</SelectItem>
                                            <SelectItem value="x">X (Twitter)</SelectItem>
                                            <SelectItem value="youtube">YouTube</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-slate-400">Verified</Label>
                                    <Select value={initialFilters.is_verified} onValueChange={(val) => handleFilterChange('is_verified', val)}>
                                        <SelectTrigger className="w-[130px] bg-white border-slate-200 h-9 text-xs font-semibold">
                                            <SelectValue placeholder="All" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All</SelectItem>
                                            <SelectItem value="true">Verified</SelectItem>
                                            <SelectItem value="false">Unverified</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-slate-400">Status</Label>
                                    <Select value={initialFilters.status} onValueChange={(val) => handleFilterChange('status', val)}>
                                        <SelectTrigger className="w-[160px] bg-white border-slate-200 h-9 text-xs font-semibold">
                                            <SelectValue placeholder="All Status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Status</SelectItem>
                                            <SelectItem value="No Action">No Action</SelectItem>
                                            <SelectItem value="Flag for Takedown">Flag for Takedown</SelectItem>
                                            <SelectItem value="To Be Reviewed">To Be Reviewed</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {hasActiveFilter && (
                                    <div className="pt-4">
                                        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold text-xs">
                                            <X className="w-3.5 h-3.5 mr-1" /> Clear
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-5 w-full lg:w-auto justify-end">
                            <Separator orientation="vertical" className="h-8 bg-slate-100 hidden sm:block" />
                            <div className="text-xs font-medium text-slate-500">
                                <span className="font-bold text-slate-900 text-sm px-2">{totalCount}</span> profiles found
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="min-w-full table-fixed divide-y divide-slate-100">
                        <thead className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-sm text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            <tr>
                                <th scope="col" className="px-6 py-4 text-left w-[120px]">Risk</th>
                                <th scope="col" className="px-6 py-4 text-left w-[150px]">Status</th>
                                <th scope="col" className="px-6 py-4 text-left w-[240px]">Display Name</th>
                                <th scope="col" className="px-6 py-4 text-left w-[140px]">Platform</th>
                                {/* <th scope="col" className="px-6 py-4 text-left w-[110px]">Verified</th> */}
                                <th scope="col" className="px-6 py-4 text-left w-[100px]">Cases</th>
                                <th scope="col" className="px-6 py-4 text-left w-[100px]">Source</th>
                                <th scope="col" className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
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
                                    const isSelected = selectedProfile?._id === profile._id
                                    const risk = profile.review_details?.risk || 'safe'
                                    return (
                                        <tr key={profile._id} onClick={() => setSelectedProfile(profile)} className={cn('transition-all cursor-pointer group hover:bg-slate-50/80', isSelected && 'bg-blue-50/50')}>
                                            <td className="px-4 py-3 whitespace-nowrap align-middle">
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
                                            <td className="px-6 py-4 whitespace-nowrap align-middle">
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
                                            <td className="px-6 py-4 whitespace-nowrap align-middle">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                                                        {profile.metadata?.profile_pic ? (
                                                            <img src={profile.metadata.profile_pic} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <User className="w-4 h-4 text-slate-400" />
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="font-bold text-slate-800 text-sm tracking-tight truncate max-w-[180px]">
                                                            {profile.display_name}
                                                        </span>
                                                        {profile.username && (
                                                            <span className="text-[10px] text-slate-400 truncate max-w-[180px]">
                                                                @{profile.username}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap align-middle">
                                                <Badge variant="outline" className="capitalize font-bold text-slate-500 border-slate-200 gap-1.5 pl-2 h-7 text-[10px]">
                                                    <PlatformIcon platform={profile.platform} />
                                                    {profile.platform}
                                                </Badge>
                                            </td>
                                            {/* <td className="px-6 py-4 whitespace-nowrap align-middle">
                                                {profile.is_verified ? (
                                                    <BadgeCheck className="w-5 h-5 text-blue-500 fill-blue-50" />
                                                ) : (
                                                    <ShieldOff className="w-5 h-5 text-slate-300" />
                                                )}
                                            </td> */}
                                            <td className="px-6 py-4 whitespace-nowrap align-middle font-bold text-slate-700 text-sm">
                                                {profile.posts.length}
                                            </td>
                                            {/* Source */}
                                            <td className="px-4 py-3 whitespace-nowrap align-middle">
                                                <a
                                                    href={profile.profile_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="inline-flex items-center text-blue-600 hover:text-blue-800 font-bold text-xs transition-colors hover:underline bg-blue-50 px-2 py-1 rounded-md"
                                                >
                                                    Source <ExternalLink className="w-3 h-3 ml-1" />
                                                </a>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-right align-middle">
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

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="px-6 pb-6 pt-2 shrink-0">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-3 flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            Page {currentPage} of {totalPages}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="h-9 px-3 text-xs font-bold border-slate-200 hover:bg-slate-50">
                                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="h-9 px-3 text-xs font-bold border-slate-200 hover:bg-slate-50">
                                Next <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <ProfileDetailPanel
                profile={selectedProfile}
                project={project}
                isOpen={!!selectedProfile}
                onClose={() => setSelectedProfile(null)}
                onUpdate={handleProfileUpdate}
            />
        </div>
    )
}

