'use client'

import { useState, useCallback, useEffect } from 'react'
import {
    Filter, X, ChevronLeft, ChevronRight, Globe, CheckCircle, ClockFading,
    Info, Siren, ArrowRight, ExternalLink, Search, Calendar, ShieldQuestion,
    TriangleAlert, TrendingDown, Smile, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { RiskFilter } from '@/app/(dashboard)/cases/RiskFilter'
import { StatusFilter } from '@/app/(dashboard)/cases/StatusFilter'

import DomainDetailPanel from './DomainDetails'

const getRiskBadge = (risk) => {
    const v = typeof risk === 'string' ? risk.toLowerCase() : risk
    if (v === 'high') return { label: 'High', className: 'bg-rose-100 text-rose-600 border-rose-300', icon: Siren }
    if (v === 'mid' || v === 'medium') return { label: 'Medium', className: 'bg-orange-100 text-orange-600 border-orange-300', icon: TriangleAlert }
    if (v === 'low') return { label: 'Low', className: 'bg-amber-100 text-amber-600 border-amber-300', icon: TrendingDown }
    return { label: 'Safe', className: 'bg-emerald-100 text-emerald-600 border-emerald-300', icon: Smile }
}

const getStatusConfig = (status) => {
    if (status === 'To Be Reviewed' || !status) return { label: 'To Be Reviewed', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: ClockFading }
    if (status === 'No Action' || status === 'Pass') return { label: 'No Action', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle }
    if (status === 'Flag for Takedown') return { label: 'Flag for Takedown', color: 'text-rose-700 bg-rose-50 border-rose-200', icon: Siren }
    return { label: status, color: 'text-slate-600 bg-slate-50 border-slate-200', icon: Info }
}

const getAnalysisStatusLabel = (status) => {
    const s = status?.toLowerCase()
    if (s === 'completed') return 'Analyzed'
    if (s === 'running') return 'Analyzing…'
    if (s === 'failed') return 'Failed'
    return 'Pending'
}

export function DomainsList({ domains, project, initialFilters, initialSort = { field: null, direction: 'desc' }, currentPage, itemsPerPage }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const totalCount = domains?.totalCount || 0
    const totalPages = domains?.totalPages || 0
    const domainList = domains?.domains || []

    const [localDomains, setLocalDomains] = useState(domainList)
    const [selectedDomain, setSelectedDomain] = useState(null)
    const [searchInput, setSearchInput] = useState(initialFilters.searchText || '')

    useEffect(() => {
        setLocalDomains(domainList)
    }, [domainList])

    useEffect(() => {
        setSearchInput(initialFilters.searchText || '')
    }, [initialFilters.searchText])

    const handleDomainUpdate = (domainId, updates) => {
        setLocalDomains((prev) => prev.map((d) => (d._id === domainId ? { ...d, ...updates } : d)))
        if (selectedDomain?._id === domainId) {
            setSelectedDomain((prev) => ({ ...prev, ...updates }))
        }
        router.refresh()
    }

    const selectedIndex = selectedDomain ? localDomains.findIndex((d) => d._id === selectedDomain._id) : -1

    const navigateDomain = useCallback((direction) => {
        if (!selectedDomain) return
        const currentIndex = localDomains.findIndex((d) => d._id === selectedDomain._id)
        if (currentIndex === -1) return
        const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1
        if (nextIndex >= 0 && nextIndex < localDomains.length) {
            setSelectedDomain(localDomains[nextIndex])
        }
    }, [selectedDomain, localDomains])

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!selectedDomain) return
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
            if (e.key === 'ArrowLeft') { e.preventDefault(); navigateDomain('prev') }
            else if (e.key === 'ArrowRight') { e.preventDefault(); navigateDomain('next') }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [selectedDomain, navigateDomain])

    const updateQueryParams = useCallback((newParams) => {
        const params = new URLSearchParams(searchParams.toString())
        Object.entries(newParams).forEach(([key, value]) => {
            if (value === null || value === undefined || value === 'all') params.delete(key)
            else params.set(key, value)
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

    const handleSearchApply = () => updateQueryParams({ search: searchInput, page: 1 })
    const handleSearchSubmit = (e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchApply() } }

    const hasActiveFilter = (
        initialFilters.status !== 'all' ||
        initialFilters.searchText ||
        (initialFilters.risk && initialFilters.risk !== 'all')
    )

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Filters */}
            <div className="shrink-0">
                <div className="px-3 py-3">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div className="flex flex-col lg:flex-row gap-4 w-full">
                            <div className="flex flex-col w-full lg:w-[160px] xl:w-[180px] shrink-0 rounded-xl relative">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <Filter className="w-3.5 h-3.5 text-blue-600" />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filter</span>
                                </div>
                                <div className="flex items-baseline gap-1.5 mb-3">
                                    <span className="text-2xl font-black text-slate-800 tracking-tight leading-none">{totalCount}</span>
                                    <span className="text-[11px] font-bold text-slate-500 leading-none">domains found</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-4 w-full lg:flex-1">
                                <div className="grid grid-cols-2 lg:flex lg:flex-wrap items-start gap-2.5 sm:gap-3 w-full">
                                    <div className="space-y-1 col-span-2 w-full lg:w-auto lg:flex-1 lg:min-w-[220px] lg:max-w-[300px]">
                                        <Label className="text-[10px] uppercase font-bold text-slate-400">Search</Label>
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
                                                    placeholder="Search by domain name..."
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
                                            <Button onClick={handleSearchApply} className="h-9 w-9 p-0 shrink-0 bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer transition-colors" title="Search">
                                                <Search className="w-4 h-4" />
                                            </Button>
                                        </div>
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

                                    <div className="space-y-1 w-full lg:w-auto lg:flex-1 lg:max-w-[160px]">
                                        <RiskFilter initialRisk={initialFilters.risk || 'all'} onChange={(val) => handleFilterChange('risk', val)} />
                                    </div>

                                    {hasActiveFilter && (
                                        <div className="flex flex-wrap items-center gap-2 bg-slate-50/80 border border-slate-100 rounded-md px-3 py-1.5 lg:h-9 lg:py-0 shadow-sm shrink-0 col-span-2 w-full lg:col-span-1 xl:w-auto mt-2 xl:mt-0">
                                            <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Active:</span>
                                            {initialFilters.searchText && (
                                                <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-bold text-[10px] uppercase tracking-wider border border-blue-100">
                                                    <Search className="w-3 h-3" /> Search
                                                </div>
                                            )}
                                            {initialFilters.risk && initialFilters.risk !== 'all' && (
                                                <div className="flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-700 rounded font-bold text-[10px] uppercase tracking-wider border border-rose-100">
                                                    {initialFilters.risk} risk
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
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0 flex flex-col">
                <div className="hidden md:flex md:flex-col flex-1 min-h-0 bg-white shadow-sm border border-slate-200 overflow-hidden">
                    <div className="flex-1 overflow-auto custom-scrollbar relative">
                        <table className="min-w-full border-separate border-spacing-0">
                            <thead className="sticky top-0 z-20 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                <tr className="bg-slate-50/90 backdrop-blur-md">
                                    <th onClick={() => handleSortChange('risk')} className="px-6 py-4 text-left border-b border-slate-100 cursor-pointer hover:bg-slate-100/50 transition-colors select-none">
                                        <div className="flex items-center">Risk<SortIcon field="risk" /></div>
                                    </th>
                                    <th className="px-6 py-4 text-left border-b border-slate-100">Status</th>
                                    <th className="px-6 py-4 text-left border-b border-slate-100">Domain</th>
                                    <th className="px-6 py-4 text-left border-b border-slate-100 hidden lg:table-cell">Category</th>
                                    <th className="px-6 py-4 text-left border-b border-slate-100">Analysis</th>
                                    <th onClick={() => handleSortChange('occurrences')} className="px-6 py-4 text-left border-b border-slate-100 cursor-pointer hover:bg-slate-100/50 transition-colors select-none">
                                        <div className="flex items-center">Seen<SortIcon field="occurrences" /></div>
                                    </th>
                                    <th onClick={() => handleSortChange('last_seen')} className="px-6 py-4 text-left border-b border-slate-100 hidden lg:table-cell cursor-pointer hover:bg-slate-100/50 transition-colors select-none">
                                        <div className="flex items-center">Last Seen<SortIcon field="last_seen" /></div>
                                    </th>
                                    <th className="px-6 py-4 text-right border-b border-slate-100">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white">
                                {localDomains.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center justify-center text-slate-400">
                                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100 shadow-inner">
                                                    <Globe className="w-8 h-8 opacity-20" />
                                                </div>
                                                <h3 className="text-lg font-bold text-slate-900 mb-1">No domains found</h3>
                                                <p className="text-sm text-slate-500 max-w-[320px] leading-relaxed mx-auto mb-6">
                                                    Domains show up here once they've been discovered from posts, ads, or profiles and analyzed.
                                                </p>
                                                {hasActiveFilter && (
                                                    <Button variant="outline" size="sm" onClick={clearFilters} className="h-9 px-4 text-xs font-bold border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg shadow-sm">
                                                        <X className="w-3.5 h-3.5 mr-2" /> Clear All Filters
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    localDomains.map((domain) => {
                                        const isSelected = selectedDomain?._id === domain._id
                                        const risk = getRiskBadge(domain.risk_rank)
                                        const RiskIcon = risk.icon
                                        const statusCfg = getStatusConfig(domain.client_status)
                                        const StatusIcon = statusCfg.icon
                                        return (
                                            <tr key={domain._id} onClick={() => setSelectedDomain(domain)} className={cn('transition-all cursor-pointer group hover:bg-slate-50/80', isSelected && 'bg-blue-50/50')}>
                                                <td className="px-4 py-3 whitespace-nowrap align-middle border-b border-slate-50">
                                                    <span className={cn('inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border shadow-sm', risk.className)}>
                                                        <RiskIcon className="w-3.5 h-3.5 mr-1.5" />
                                                        {risk.label}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap align-middle border-b border-slate-50">
                                                    <Badge variant="outline" className={cn('rounded-md capitalize font-bold border gap-1.5 pl-2 h-7 text-xs', statusCfg.color)}>
                                                        <StatusIcon className="w-3.5 h-3.5" />
                                                        {statusCfg.label}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap align-middle border-b border-slate-50">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                                            <Globe className="w-4 h-4 text-slate-400" />
                                                        </div>
                                                        <span className="font-bold text-slate-800 text-sm tracking-tight truncate font-mono">{domain.domain_name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap align-middle border-b border-slate-50 hidden lg:table-cell">
                                                    {domain.category ? (
                                                        <Badge variant="outline" className="capitalize font-bold text-slate-500 border-slate-200 h-7 text-[10px]">
                                                            {domain.category}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-slate-300 text-xs">—</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap align-middle border-b border-slate-50">
                                                    <Badge variant="outline" className="capitalize font-bold text-slate-500 border-slate-200 gap-1.5 pl-2 h-7 text-[10px]">
                                                        <ShieldQuestion className="w-3 h-3" />
                                                        {getAnalysisStatusLabel(domain.analysis_status)}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap align-middle font-bold text-slate-700 text-sm border-b border-slate-50">
                                                    {domain.occurrence_count ?? 0}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap align-middle border-b border-slate-50 hidden lg:table-cell">
                                                    {domain.last_seen_at ? (
                                                        <div className="flex items-center gap-1.5 text-slate-600 text-xs font-semibold">
                                                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                            {format(new Date(domain.last_seen_at), 'dd MMM yyyy')}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-300 text-xs">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-right align-middle border-b border-slate-50">
                                                    <Button size="sm" variant="secondary" className="h-8 text-xs font-bold transition-all shadow-sm bg-white border border-slate-200 hover:bg-slate-50 text-slate-600">
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
                    {localDomains.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 shadow-inner">
                                <Globe className="w-8 h-8 opacity-20" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mb-1">No domains found</h3>
                            <p className="text-sm text-slate-500 leading-relaxed mb-6">
                                Domains show up here once discovered and analyzed.
                            </p>
                            {hasActiveFilter && (
                                <Button variant="outline" size="sm" onClick={clearFilters} className="h-9 px-4 text-xs font-bold border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg shadow-sm">
                                    <X className="w-3.5 h-3.5 mr-2" /> Clear Filters
                                </Button>
                            )}
                        </div>
                    ) : (
                        localDomains.map((domain) => {
                            const risk = getRiskBadge(domain.risk_rank)
                            const RiskIcon = risk.icon
                            const statusCfg = getStatusConfig(domain.client_status)
                            const StatusIcon = statusCfg.icon
                            return (
                                <div key={domain._id} onClick={() => setSelectedDomain(domain)} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3 shadow-sm transition-all cursor-pointer hover:border-slate-300 hover:shadow-md">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className={cn('rounded-md capitalize font-bold border gap-1 pl-1.5 pr-2 h-6 text-[10px]', statusCfg.color)}>
                                                <StatusIcon className="w-3 h-3" />
                                                {statusCfg.label}
                                            </Badge>
                                        </div>
                                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border shadow-sm', risk.className)}>
                                            <RiskIcon className="w-3 h-3 mr-1" />
                                            {risk.label}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                            <Globe className="w-4 h-4 text-slate-400" />
                                        </div>
                                        <span className="font-bold text-slate-900 text-sm tracking-tight truncate font-mono">{domain.domain_name}</span>
                                    </div>
                                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                        <span className="text-xs font-bold text-slate-500">{domain.occurrence_count ?? 0} occurrences</span>
                                        <Button size="sm" variant="secondary" className="h-7 px-3 text-[10px] font-bold shadow-sm bg-white border border-slate-200 hover:bg-slate-50 text-slate-600">
                                            Details <ArrowRight className="w-2.5 h-2.5 ml-1 opacity-50" />
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
                                            className={cn('px-2 sm:px-2.5 py-1 text-[10px] font-bold transition-all rounded-md cursor-pointer', itemsPerPage === limit ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100')}
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
                                <Button variant="outline" size="sm" onClick={() => handlePageChange(1)} disabled={currentPage === 1} className="h-8 sm:h-9 px-2 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50 hidden sm:flex" title="First Page">&lt;&lt;</Button>
                                <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="h-8 sm:h-9 px-2 sm:px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50 flex-1 sm:flex-none">
                                    <ChevronLeft className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Previous</span>
                                </Button>
                                <div className="flex items-center gap-1 mx-0 sm:mx-1">
                                    {(() => {
                                        const pages = []
                                        let start = Math.max(1, currentPage - 2)
                                        let end = Math.min(totalPages, currentPage + 2)
                                        const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
                                        if (isMobile) { start = Math.max(1, currentPage - 1); end = Math.min(totalPages, currentPage + 1) }
                                        if (currentPage <= (isMobile ? 1 : 2)) end = Math.min(totalPages, isMobile ? 3 : 5)
                                        if (currentPage >= totalPages - (isMobile ? 0 : 1)) start = Math.max(1, totalPages - (isMobile ? 2 : 4))
                                        for (let i = start; i <= end; i++) pages.push(i)
                                        return pages.map((pageNum) => (
                                            <Button key={pageNum} variant={currentPage === pageNum ? 'default' : 'outline'} size="sm" onClick={() => handlePageChange(pageNum)} className={cn('h-8 w-8 sm:h-9 sm:w-9 p-0 text-xs font-bold', currentPage === pageNum ? 'bg-slate-800 hover:bg-slate-900 text-white shadow-sm' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                                                {pageNum}
                                            </Button>
                                        ))
                                    })()}
                                </div>
                                <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="h-8 sm:h-9 px-2 sm:px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50 flex-1 sm:flex-none">
                                    <span className="hidden sm:inline">Next</span> <ChevronRight className="w-4 h-4 sm:ml-1" />
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages} className="h-8 sm:h-9 px-2 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50 hidden sm:flex" title="Last Page">&gt;&gt;</Button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <DomainDetailPanel
                domain={selectedDomain}
                project={project}
                isOpen={!!selectedDomain}
                onClose={() => setSelectedDomain(null)}
                onUpdate={handleDomainUpdate}
                onNext={() => navigateDomain('next')}
                onPrev={() => navigateDomain('prev')}
                hasNext={selectedIndex >= 0 && selectedIndex < localDomains.length - 1}
                hasPrev={selectedIndex > 0}
            />
        </div>
    )
}
