'use client'

import { useState, useCallback, useEffect } from 'react'
import { getProfileCases } from './actions'
import {
    Filter, Search, ExternalLink, X, ChevronLeft, ChevronRight,
    Facebook, Instagram, Twitter, Youtube, CheckCircle, ShieldOff,
    User, ArrowRight, FileText, Siren, ClockFading, Info, Globe,
    BadgeCheck, ShieldAlert, TriangleAlert, TrendingDown, Smile
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'

const PlatformIcon = ({ platform, className }) => {
    const p = platform?.toLowerCase()
    if (p === 'instagram') return <Instagram className={cn('w-3.5 h-3.5 text-pink-500', className)} />
    if (p === 'facebook') return <Facebook className={cn('w-3.5 h-3.5 text-blue-600', className)} />
    if (p === 'x') return <Twitter className={cn('w-3.5 h-3.5 text-slate-900', className)} />
    if (p === 'youtube') return <Youtube className={cn('w-3.5 h-3.5 text-red-500', className)} />
    return <Globe className={cn('w-3.5 h-3.5 text-slate-400', className)} />
}

const getRiskLabel = (score) => {
    if (score === null || score === undefined) return null
    if (score >= 96) return { label: 'High', color: 'text-rose-600 bg-rose-50 border-rose-200' }
    if (score >= 76) return { label: 'Medium', color: 'text-orange-500 bg-orange-50 border-orange-200' }
    if (score >= 41) return { label: 'Low', color: 'text-amber-500 bg-amber-50 border-amber-200' }
    return { label: 'Safe', color: 'text-slate-500 bg-slate-50 border-slate-200' }
}

const RiskIcon = ({ label }) => {
    if (label === 'High') return <Siren className="w-3 h-3" />
    if (label === 'Medium') return <TriangleAlert className="w-3 h-3" />
    if (label === 'Low') return <TrendingDown className="w-3 h-3" />
    return <Smile className="w-3 h-3" />
}

const getStatusConfig = (status) => {
    if (status === 'To Be Reviewed' || !status) return { label: 'Pending', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: ClockFading }
    if (status === 'Pass') return { label: 'Pass', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle }
    if (status === 'Flag for Takedown') return { label: 'Takedown', color: 'text-rose-700 bg-rose-50 border-rose-200', icon: Siren }
    return { label: status, color: 'text-slate-600 bg-slate-50 border-slate-200', icon: Info }
}

function ProfileDetailPanel({ profile, project, isOpen, onClose }) {
    const [cases, setCases] = useState(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!isOpen || !profile) return
        let cancelled = false
        setCases(null)
        if (profile.posts.length === 0) {
            setCases([])
            return
        }
        setLoading(true)
        getProfileCases(project, profile.posts)
            .then(result => { if (!cancelled) setCases(result) })
            .catch(() => { if (!cancelled) setCases([]) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [isOpen, profile?._id])

    if (!isOpen || !profile) return null

    const highCount = cases?.filter(c => (c.threat_score ?? 0) >= 96).length || 0
    const medCount = cases?.filter(c => { const s = c.threat_score ?? 0; return s >= 76 && s < 96 }).length || 0

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-30"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl border-l border-slate-200 z-40 flex flex-col overflow-hidden">

                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 bg-linear-to-r from-slate-50 to-white shrink-0">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                                <User className="w-5 h-5 text-blue-600" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-base font-bold text-slate-900 truncate">{profile.display_name}</h2>
                                    {profile.is_verified && (
                                        <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" />
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="outline" className="capitalize font-semibold text-slate-600 border-slate-300 gap-1 pl-1.5 h-5 text-[10px]">
                                        <PlatformIcon platform={profile.platform} />
                                        {profile.platform}
                                    </Badge>
                                    <span className="text-xs text-slate-400">{profile.posts.length} post{profile.posts.length !== 1 ? 's' : ''}</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Profile URL */}
                    {profile.profile_url && (
                        <a
                            href={profile.profile_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium truncate"
                        >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{profile.profile_url}</span>
                        </a>
                    )}
                </div>

                {/* Stats bar */}
                {cases && cases.length > 0 && (
                    <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-6 shrink-0">
                        <div className="text-center">
                            <p className="text-lg font-bold text-slate-900">{cases.length}</p>
                            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Cases</p>
                        </div>
                        {highCount > 0 && (
                            <div className="text-center">
                                <p className="text-lg font-bold text-rose-600">{highCount}</p>
                                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">High Risk</p>
                            </div>
                        )}
                        {medCount > 0 && (
                            <div className="text-center">
                                <p className="text-lg font-bold text-orange-500">{medCount}</p>
                                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Medium</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Cases */}
                <div className="flex-1 overflow-y-auto">
                    <div className="px-6 py-4">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Associated Cases</h3>

                        {loading && (
                            <div className="space-y-3">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="h-16 bg-slate-50 rounded-lg animate-pulse border border-slate-100" />
                                ))}
                            </div>
                        )}

                        {!loading && cases && cases.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-3 border border-slate-100">
                                    <FileText className="w-6 h-6 opacity-30" />
                                </div>
                                <p className="text-sm font-semibold text-slate-600">No cases found</p>
                                <p className="text-xs text-slate-400 mt-1">No posts are linked to this profile.</p>
                            </div>
                        )}

                        {!loading && cases && cases.length > 0 && (
                            <div className="space-y-2.5">
                                {cases.map(c => {
                                    const risk = getRiskLabel(c.threat_score)
                                    const statusCfg = getStatusConfig(c.client_status)
                                    const StatusIcon = statusCfg.icon
                                    return (
                                        <div
                                            key={c._id}
                                            className="group flex flex-col gap-2 bg-white border border-slate-100 rounded-xl px-4 py-3 hover:border-slate-200 hover:shadow-sm transition-all"
                                        >
                                            {/* Top row: badge + status + platform + external link */}
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {risk && (
                                                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border', risk.color)}>
                                                        <RiskIcon label={risk.label} />
                                                        {risk.label}
                                                    </span>
                                                )}
                                                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border', statusCfg.color)}>
                                                    <StatusIcon className="w-2.5 h-2.5" />
                                                    {statusCfg.label}
                                                </span>
                                                <Badge variant="outline" className="capitalize font-semibold text-slate-500 border-slate-200 gap-1 pl-1.5 h-5 text-[10px]">
                                                    <PlatformIcon platform={c.platform} />
                                                    {c.platform}
                                                </Badge>
                                                {c.primary_threat_type && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wide text-slate-500 bg-slate-50 border-slate-200">
                                                        {c.primary_threat_type.replace(/[-_]/g, ' ')}
                                                    </span>
                                                )}
                                                <div className="ml-auto">
                                                    {c.original_url && (
                                                        <a
                                                            href={c.original_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline bg-blue-50 px-2 py-0.5 rounded-md"
                                                        >
                                                            Source <ExternalLink className="w-2.5 h-2.5" />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Caption */}
                                            {c.caption && (
                                                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                                                    {c.caption}
                                                </p>
                                            )}

                                            {/* Date */}
                                            {c.created_at && (
                                                <p className="text-[10px] text-slate-400">
                                                    {format(new Date(c.created_at), 'dd MMM yyyy')}
                                                </p>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}

export function ProfilesList({ profiles, project, initialFilters, currentPage }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const totalCount = profiles?.totalCount || 0
    const totalPages = profiles?.totalPages || 0
    const profileList = profiles?.profiles || []

    const [selectedProfile, setSelectedProfile] = useState(null)

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

    const handlePageChange = (newPage) => {
        if (newPage < 1 || newPage > totalPages) return
        updateQueryParams({ page: newPage })
    }

    const clearFilters = () => router.push(pathname)

    const hasActiveFilter = initialFilters.platform !== 'all' || initialFilters.is_verified !== 'all'

    const handleSelectProfile = (profile) => {
        // Reset panel state so cases are reloaded for new profile
        setSelectedProfile(null)
        setTimeout(() => setSelectedProfile(profile), 0)
    }

    return (
        <div className="flex flex-col h-full bg-slate-50">

            {/* Filters */}
            <div className="px-6 py-4 shrink-0">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-6">

                        <div className="flex items-center gap-6 w-full lg:w-auto">
                            <div className="flex items-center gap-2.5 shrink-0">
                                <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                                    <Filter className="w-4 h-4" />
                                </div>
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
                            <div className="text-xs font-medium text-slate-500 whitespace-nowrap">
                                <span className="font-bold text-slate-900 text-sm">{totalCount}</span> profiles found
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="min-w-full table-fixed divide-y divide-slate-100">
                        <thead className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-sm">
                            <tr>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-[220px]">Display Name</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-[140px]">Platform</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-[110px]">Verified</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-[100px]">Posts</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Profile URL</th>
                                <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider w-[110px]">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="bg-white divide-y divide-slate-100">
                            {profileList.map((profile) => {
                                const isSelected = selectedProfile?._id === profile._id
                                return (
                                    <tr
                                        key={profile._id}
                                        onClick={() => handleSelectProfile(profile)}
                                        className={cn(
                                            'transition-all cursor-pointer group',
                                            isSelected ? 'bg-blue-50/60 ring-1 ring-inset ring-blue-200 z-10 relative' : 'hover:bg-slate-50'
                                        )}
                                    >
                                        {/* Display Name */}
                                        <td className="px-4 py-3 whitespace-nowrap align-middle">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                                    <User className="w-4 h-4 text-slate-400" />
                                                </div>
                                                <span className="font-semibold text-slate-900 text-sm truncate max-w-[150px]">
                                                    {profile.display_name}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Platform */}
                                        <td className="px-4 py-3 whitespace-nowrap align-middle">
                                            <Badge variant="outline" className="capitalize font-semibold text-slate-600 border-slate-300 gap-1.5 pl-2 h-7">
                                                <PlatformIcon platform={profile.platform} />
                                                {profile.platform}
                                            </Badge>
                                        </td>

                                        {/* Verified */}
                                        <td className="px-4 py-3 whitespace-nowrap align-middle">
                                            {profile.is_verified ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border text-blue-700 bg-blue-50 border-blue-200">
                                                    <BadgeCheck className="w-3.5 h-3.5" /> Verified
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border text-slate-500 bg-slate-50 border-slate-200">
                                                    <ShieldOff className="w-3.5 h-3.5" /> Unverified
                                                </span>
                                            )}
                                        </td>

                                        {/* Posts count */}
                                        <td className="px-4 py-3 whitespace-nowrap align-middle">
                                            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-700">
                                                <FileText className="w-3.5 h-3.5 text-slate-400" />
                                                {profile.posts.length}
                                            </span>
                                        </td>

                                        {/* Profile URL */}
                                        <td className="px-4 py-3 align-middle overflow-hidden">
                                            {profile.profile_url ? (
                                                <a
                                                    href={profile.profile_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium truncate max-w-[280px]"
                                                >
                                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                                    <span className="truncate">{profile.profile_url}</span>
                                                </a>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">—</span>
                                            )}
                                        </td>

                                        {/* Actions */}
                                        <td className="px-4 py-3 whitespace-nowrap text-right align-middle">
                                            <Button
                                                size="sm"
                                                variant={isSelected ? 'default' : 'secondary'}
                                                className={cn(
                                                    'h-8 text-xs font-bold transition-all shadow-sm',
                                                    isSelected
                                                        ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                                                        : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600'
                                                )}
                                            >
                                                {isSelected ? 'Inspect' : 'View'}
                                                <ArrowRight className="w-3 h-3 ml-1.5 opacity-50" />
                                            </Button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>

                    {profileList.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 border border-slate-100">
                                <Search className="w-8 h-8 opacity-20 text-slate-500" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-700 mb-1">No profiles found</h3>
                            <p className="text-sm text-slate-500 max-w-xs text-center">Try adjusting your filters or check back later.</p>
                            <Button variant="outline" onClick={clearFilters} className="mt-6 border-slate-200">
                                Clear all filters
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="px-6 pb-2 pt-2">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-3 flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Page <span className="text-slate-900">{currentPage}</span> of <span className="text-slate-900">{totalPages}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(1)}
                                disabled={currentPage === 1}
                                className="h-9 px-2 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                            >
                                &lt;&lt;
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="h-9 px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                            >
                                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                            </Button>

                            <div className="flex items-center gap-1 mx-1">
                                {(() => {
                                    const pages = []
                                    let start = Math.max(1, currentPage - 2)
                                    let end = Math.min(totalPages, currentPage + 2)
                                    if (currentPage <= 2) end = Math.min(totalPages, 5)
                                    if (currentPage >= totalPages - 1) start = Math.max(1, totalPages - 4)
                                    for (let i = start; i <= end; i++) pages.push(i)
                                    return pages.map(pageNum => (
                                        <Button
                                            key={pageNum}
                                            variant={currentPage === pageNum ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => handlePageChange(pageNum)}
                                            className={cn(
                                                'h-9 w-9 p-0 text-xs font-bold',
                                                currentPage === pageNum
                                                    ? 'bg-slate-800 hover:bg-slate-900 text-white shadow-sm'
                                                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                            )}
                                        >
                                            {pageNum}
                                        </Button>
                                    ))
                                })()}
                            </div>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="h-9 px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                            >
                                Next <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(totalPages)}
                                disabled={currentPage === totalPages}
                                className="h-9 px-2 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                            >
                                &gt;&gt;
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Panel */}
            <ProfileDetailPanel
                profile={selectedProfile}
                project={project}
                isOpen={!!selectedProfile}
                onClose={() => setSelectedProfile(null)}
            />
        </div>
    )
}
