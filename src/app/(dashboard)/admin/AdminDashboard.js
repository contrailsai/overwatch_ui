"use client"

import React, { useState, useMemo } from 'react'
import { Plus, Users, CheckCircle2, UserCheck, Search, Mail, ShieldCheck, Activity, Trash2, Loader2, Clock, Edit2, Building2, X, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, RotateCcw, Shield, Download, } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { CreateUserModal } from './CreateUserModal'
import CapacityWidget from './CapacityWidget'
import MemberDetailDialog from './MemberDetailDialog'
import { delete_client, update_client_alias, update_client_organization, update_client_permission } from './actions'
import { useRouter } from 'next/navigation'

// Helper to format timetz strings (e.g. "14:30:00Z" or "14:30:00+00") to local time
const formatTime = (timeStr) => {
    if (!timeStr) return '--:--'
    try {
        // Use today's local date to ensure we handle DST correctly for the current period
        const todayStr = format(new Date(), 'yyyy-MM-dd')

        // Normalize timeStr for JavaScript parsing
        // PostgreSQL timetz (+00, +0530) might not be parsed by all browsers without modification
        let normalized = timeStr;
        if (normalized.endsWith('+00')) {
            normalized = normalized.replace('+00', 'Z');
        } else if (normalized.match(/[+-]\d{2}$/)) {
            normalized = normalized + ':00'; // +05 to +05:00
        } else if (normalized.match(/[+-]\d{4}$/)) {
            normalized = normalized.slice(0, -2) + ':' + normalized.slice(-2); // +0530 to +05:30
        }

        const isoString = `${todayStr}T${normalized}`;
        const d = parseISO(isoString);

        if (isNaN(d.getTime())) return timeStr

        // Format to 24-hour time (HH:mm)
        return format(d, 'HH:mm')
    } catch {
        return timeStr
    }
}

const roleLabel = (permission) => {
    if (permission === 'client-admin') return 'Admin'
    if (permission === 'client-reviewer') return 'Reviewer'
    return 'Analyst'
}


const matchesRoleFilter = (permission, roleFilter) => {
    if (roleFilter === 'all') return true
    if (roleFilter === 'admin') return permission === 'client-admin'
    if (roleFilter === 'reviewer') return permission === 'client-reviewer'
    if (roleFilter === 'analyst') return permission !== 'client-admin' && permission !== 'client-reviewer'
    return true
}

const AdminDashboard = ({ project_name, clients, canManageTeam = false, currentUserId = null, capacityMetrics = null }) => {
    const router = useRouter()
    const [searchTerm, setSearchTerm] = useState('')
    const [roleFilter, setRoleFilter] = useState('all')
    const [statusFilter, setStatusFilter] = useState('all')
    const [sortBy, setSortBy] = useState('member')
    const [sortDir, setSortDir] = useState('asc')

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [notification, setNotification] = useState(null)
    const [clientToDelete, setClientToDelete] = useState(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [clientToEditAlias, setClientToEditAlias] = useState(null)
    const [newAlias, setNewAlias] = useState('')
    const [isUpdatingAlias, setIsUpdatingAlias] = useState(false)
    const [clientToEditOrg, setClientToEditOrg] = useState(null)
    const [newOrg, setNewOrg] = useState('')
    const [isUpdatingOrg, setIsUpdatingOrg] = useState(false)
    const [clientToEditRole, setClientToEditRole] = useState(null)
    const [newRole, setNewRole] = useState('client')
    const [isUpdatingRole, setIsUpdatingRole] = useState(false)
    const [clientToView, setClientToView] = useState(null)

    const handleUpdateRole = async () => {
        if (!clientToEditRole) return

        setIsUpdatingRole(true)
        try {
            const result = await update_client_permission(clientToEditRole.id, newRole)
            if (result.error) {
                setNotification({
                    title: 'Error Updating Role',
                    message: result.error,
                    isError: true
                })
            } else {
                setNotification({
                    title: 'Role Updated',
                    message: `${clientToEditRole.email} is now ${roleLabel(newRole)}.`
                })
                router.refresh()
            }
        } catch (error) {
            setNotification({
                title: 'Error Updating Role',
                message: 'An unexpected error occurred.',
                isError: true
            })
        } finally {
            setIsUpdatingRole(false)
            setClientToEditRole(null)

            setTimeout(() => setNotification(null), 5000)
        }
    }

    const exportToCsv = () => {
        const headers = [
            'Email', 'Alias', 'Organization', 'Role', 'Status',
            'Today Login', 'Today Last Activity',
            'Today Cases', 'Today Profiles',
            '7d Cases', '7d Profiles',
            '30d Cases', '30d Profiles',
            'All-time Cases', 'All-time Profiles',
            'Reports Downloaded (All Time)'
        ]

        const escape = (val) => {
            if (val === null || val === undefined) return ''
            const str = String(val)
            if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
            return str
        }

        const rows = filteredClients.map(c => {
            const s = c.activityStats || {}
            const reports = Object.entries(s.allTimeReports || {})
                .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join('; ')
            return [
                c.email,
                c.alias || '',
                c.organization || '',
                roleLabel(c.permission),
                s.todayLastActivity ? 'Active Today' : 'Offline',
                formatTime(s.todayLoginTime),
                formatTime(s.todayLastActivity),
                s.todayCases || 0,
                s.todayProfiles || 0,
                s.last7DaysCases || 0,
                s.last7DaysProfiles || 0,
                s.last30DaysCases || 0,
                s.last30DaysProfiles || 0,
                c.meta_stats?.reviewed_cases || 0,
                c.meta_stats?.reviewed_profiles || 0,
                reports
            ].map(escape).join(',')
        })

        const csv = [headers.join(','), ...rows].join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        const dateStr = format(new Date(), 'yyyy-MM-dd')
        const safeProject = (project_name || 'project').replace(/[^a-z0-9_-]+/gi, '_')
        link.href = url
        link.setAttribute('download', `${safeProject}_members_${dateStr}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    const handleUpdateOrg = async () => {
        if (!clientToEditOrg) return

        setIsUpdatingOrg(true)
        try {
            const result = await update_client_organization(clientToEditOrg.id, newOrg || null)
            if (result.error) {
                setNotification({
                    title: 'Error Updating Organization',
                    message: result.error,
                    isError: true
                })
            } else {
                setNotification({
                    title: 'Organization Updated',
                    message: `Organization for ${clientToEditOrg.email} has been updated.`
                })
                router.refresh()
            }
        } catch (error) {
            setNotification({
                title: 'Error Updating Organization',
                message: 'An unexpected error occurred.',
                isError: true
            })
        } finally {
            setIsUpdatingOrg(false)
            setClientToEditOrg(null)

            setTimeout(() => setNotification(null), 5000)
        }
    }

    const handleUpdateAlias = async () => {
        if (!clientToEditAlias) return

        setIsUpdatingAlias(true)
        try {
            const result = await update_client_alias(clientToEditAlias.id, newAlias || null)
            if (result.error) {
                setNotification({
                    title: 'Error Updating Alias',
                    message: result.error,
                    isError: true
                })
            } else {
                setNotification({
                    title: 'Alias Updated',
                    message: `Alias for ${clientToEditAlias.email} has been updated.`
                })
                router.refresh()
            }
        } catch (error) {
            setNotification({
                title: 'Error Updating Alias',
                message: 'An unexpected error occurred.',
                isError: true
            })
        } finally {
            setIsUpdatingAlias(false)
            setClientToEditAlias(null)

            setTimeout(() => setNotification(null), 5000)
        }
    }

    const handleDeleteClient = async () => {
        if (!clientToDelete) return

        setIsDeleting(true)
        try {
            const result = await delete_client(clientToDelete.id)
            if (result.error) {
                setNotification({
                    title: 'Error Deleting User',
                    message: result.error,
                    isError: true
                })
            } else {
                setNotification({
                    title: 'User Deleted',
                    message: `${clientToDelete.email} has been removed from the project.`
                })
                router.refresh()
            }
        } catch (error) {
            setNotification({
                title: 'Error Deleting User',
                message: 'An unexpected error occurred.',
                isError: true
            })
        } finally {
            setIsDeleting(false)
            setClientToDelete(null)

            setTimeout(() => setNotification(null), 5000)
        }
    }

    const hasActiveFilters = searchTerm !== '' || roleFilter !== 'all' || statusFilter !== 'all'

    const filteredClients = useMemo(() => {
        let result = clients || []

        if (searchTerm) {
            const q = searchTerm.toLowerCase()
            result = result.filter(c =>
                c.email?.toLowerCase().includes(q) ||
                c.alias?.toLowerCase().includes(q) ||
                c.organization?.toLowerCase().includes(q)
            )
        }

        if (roleFilter !== 'all') {
            result = result.filter(c => matchesRoleFilter(c.permission, roleFilter))
        }

        if (statusFilter !== 'all') {
            result = result.filter(c => {
                const isActive = !!c.activityStats?.todayLastActivity
                return statusFilter === 'active' ? isActive : !isActive
            })
        }

        const getSortValue = (c) => {
            const s = c.activityStats || {}
            switch (sortBy) {
                case 'today': return (s.todayCases || 0) + (s.todayProfiles || 0)
                case 'week': return (s.last7DaysCases || 0) + (s.last7DaysProfiles || 0)
                case 'month': return (s.last30DaysCases || 0) + (s.last30DaysProfiles || 0)
                case 'activity': return s.todayLastActivity || ''
                case 'member':
                default: return (c.email || '').toLowerCase()
            }
        }

        return [...result].sort((a, b) => {
            const va = getSortValue(a)
            const vb = getSortValue(b)
            if (va < vb) return sortDir === 'asc' ? -1 : 1
            if (va > vb) return sortDir === 'asc' ? 1 : -1
            return 0
        })
    }, [clients, searchTerm, roleFilter, statusFilter, sortBy, sortDir])

    const resetFilters = () => {
        setSearchTerm('')
        setRoleFilter('all')
        setStatusFilter('all')
    }

    const toggleSort = (col) => {
        if (sortBy === col) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortBy(col)
            setSortDir(col === 'member' ? 'asc' : 'desc')
        }
    }

    const SortIcon = ({ col }) => {
        if (sortBy !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />
        return sortDir === 'asc'
            ? <ArrowUp className="w-3 h-3 text-blue-600" />
            : <ArrowDown className="w-3 h-3 text-blue-600" />
    }

    const totalCount = clients?.length || 0
    const isError = notification?.isError

    return (
        <div className="p-4 md:p-6 h-full overflow-y-auto overflow-x-hidden space-y-6 md:space-y-8 animate-in fade-in duration-500">
            {/* Capacity widget */}
            <CapacityWidget metrics={capacityMetrics} />

            {/* Main Content */}
            <div className="space-y-4 pb-12">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-900">Project Contributors</h2>
                        <p className="text-sm text-slate-500">Manage and monitor team performance for <span className="text-blue-600 font-medium">{project_name}</span></p>
                    </div>

                    <div className="flex flex-row gap-2 self-start md:self-auto">
                        <Button
                            variant="outline"
                            onClick={exportToCsv}
                            disabled={filteredClients.length === 0}
                            className="bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900 shrink-0 shadow-sm"
                            title="Export current view as CSV"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Export CSV
                        </Button>
                        {canManageTeam && (
                            <Button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="bg-blue-600 hover:bg-blue-700 text-white shrink-0 shadow-sm"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Member
                            </Button>
                        )}
                    </div>
                </div>

                {/* Toolbar: search + filters */}
                <div className="">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                        <div className="relative flex-1 min-w-0">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search by email, alias, or organization..."
                                className="pl-10 pr-9 w-full bg-slate-50 border-slate-200 focus:border-blue-300 focus:bg-white transition-colors"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                    aria-label="Clear search"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                            <Select value={roleFilter} onValueChange={setRoleFilter}>
                                <SelectTrigger className="w-full sm:w-[150px] bg-white">
                                    <SelectValue placeholder="Role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Roles</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="reviewer">Reviewer</SelectItem>
                                    <SelectItem value="analyst">Analyst</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-full sm:w-[160px] bg-white">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="active">Active Today</SelectItem>
                                    <SelectItem value="offline">Offline</SelectItem>
                                </SelectContent>
                            </Select>

                            {hasActiveFilters && (
                                <Button
                                    variant="ghost"
                                    onClick={resetFilters}
                                    className="text-slate-500 hover:text-slate-900 h-9 px-3"
                                >
                                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                    Reset
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>
                            Showing <span className="font-semibold text-slate-900">{filteredClients.length}</span> of <span className="font-semibold text-slate-900">{totalCount}</span> {totalCount === 1 ? 'member' : 'members'}
                        </span>
                        {hasActiveFilters && (
                            <span className="text-blue-600 font-medium">Filters applied</span>
                        )}
                    </div>
                </div>

                {/* Mobile card view */}
                <div className="md:hidden space-y-4">
                    {filteredClients.map((client) => {
                        const stats = client.activityStats || {}
                        const isActiveToday = !!stats.todayLastActivity

                        return (
                            <Card key={client.id} className="border-slate-200 bg-white shadow-sm overflow-hidden">
                                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 sm:gap-3">
                                    <div className="flex items-start gap-3 min-w-0 w-full sm:flex-1">
                                        <div className="p-2 rounded-xl bg-slate-50 text-slate-500 shrink-0 mt-0.5">
                                            <Mail className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-col gap-1.5 mb-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setClientToView(client)}
                                                    className="font-medium text-slate-900 break-words break-all leading-snug hover:text-blue-700 hover:underline decoration-dotted underline-offset-4 transition-colors text-left"
                                                    title={`View ${client.email}'s activity`}
                                                >
                                                    {client.email}
                                                </button>
                                                {client.alias && (
                                                    <div className="text-[10px] text-blue-600 font-medium flex items-center gap-1 bg-blue-50/80 px-1.5 py-0.5 rounded-md border border-blue-100/50 w-fit max-w-full" title={`Alias: ${client.alias}`}>
                                                        <UserCheck className="w-3 h-3 text-blue-500 shrink-0" />
                                                        <span className="truncate">{client.alias}</span>
                                                    </div>
                                                )}
                                            </div>
                                            {client.organization && (
                                                <div className="text-xs text-slate-500 mt-1 flex items-start gap-1.5 w-full">
                                                    <Building2 className="w-3.5 h-3.5 shrink-0 text-purple-500 mt-0.5" />
                                                    <span className="leading-snug break-words">{client.organization}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2 shrink-0 pl-12 sm:pl-0">
                                        <Badge variant={client.permission === 'client-admin' ? 'default' : 'secondary'} className="capitalize text-[10px] font-semibold shrink-0">
                                            {roleLabel(client.permission)}
                                        </Badge>
                                        {isActiveToday ? (
                                            <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 shrink-0">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                                                <span className="whitespace-nowrap">Active Today</span>
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 font-medium bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200 shrink-0">
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"></span>
                                                <span className="whitespace-nowrap">Offline</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="p-4 grid grid-cols-2 gap-4 bg-slate-50/50">
                                    <div className="space-y-1 min-w-0">
                                        <p className="text-xs text-slate-500 font-medium">Activity</p>
                                        <div className="text-sm font-medium text-slate-700 flex flex-col gap-0.5">
                                            <span className="flex items-center gap-1.5 truncate"><Clock className="w-3 h-3 text-slate-400 shrink-0" /> <span className="truncate">In: {formatTime(stats.todayLoginTime)}</span></span>
                                            <span className="flex items-center gap-1.5 truncate"><Activity className="w-3 h-3 text-slate-400 shrink-0" /> <span className="truncate">Last: {formatTime(stats.todayLastActivity)}</span></span>
                                        </div>
                                    </div>
                                    <div className="space-y-1 min-w-0">
                                        <p className="text-xs text-slate-500 font-medium">Today&apos;s Reviews</p>
                                        <div className="flex flex-wrap gap-2">
                                            <Badge variant="outline" className="bg-white px-2 py-1 flex gap-1 items-center font-medium">
                                                <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" /> {stats.todayCases || 0}
                                            </Badge>
                                            <Badge variant="outline" className="bg-white px-2 py-1 flex gap-1 items-center font-medium">
                                                <Users className="w-3 h-3 text-blue-600 shrink-0" /> {stats.todayProfiles || 0}
                                            </Badge>
                                        </div>
                                    </div>
                                    <div className="space-y-1 min-w-0">
                                        <p className="text-xs text-slate-500 font-medium">Last 7 Days</p>
                                        <div className="flex flex-wrap gap-2 text-sm font-semibold text-slate-700">
                                            <span>{stats.last7DaysCases || 0} <span className="text-[10px] text-slate-400 font-normal">cases</span></span>
                                            <span className="text-slate-300">|</span>
                                            <span>{stats.last7DaysProfiles || 0} <span className="text-[10px] text-slate-400 font-normal">profiles</span></span>
                                        </div>
                                    </div>
                                    <div className="space-y-1 min-w-0">
                                        <p className="text-xs text-slate-500 font-medium">Last 30 Days</p>
                                        <div className="flex flex-wrap gap-2 text-sm font-semibold text-slate-700">
                                            <span>{stats.last30DaysCases || 0} <span className="text-[10px] text-slate-400 font-normal">cases</span></span>
                                            <span className="text-slate-300">|</span>
                                            <span>{stats.last30DaysProfiles || 0} <span className="text-[10px] text-slate-400 font-normal">profiles</span></span>
                                        </div>
                                    </div>
                                    <div className="space-y-1 min-w-0 col-span-2">
                                        <p className="text-xs text-slate-500 font-medium">Reports Downloaded (All Time)</p>
                                        <div className="flex flex-wrap gap-1.5 text-xs">
                                            {Object.entries(stats.allTimeReports || {}).length > 0 ? (
                                                Object.entries(stats.allTimeReports).map(([type, count]) => (
                                                    <Badge key={type} variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-200">
                                                        <span className="capitalize mr-1">{type.replace(/_/g, ' ')}:</span>
                                                        <span className="font-bold">{count}</span>
                                                    </Badge>
                                                ))
                                            ) : (
                                                <span className="text-slate-400 italic">No reports downloaded yet</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="p-3 bg-slate-100/50 flex flex-wrap justify-end gap-2 border-t border-slate-100">
                                    {canManageTeam ? (
                                        <>
                                            <Button variant="outline" size="sm" className="h-8 text-xs bg-white text-slate-600 hover:text-purple-600" onClick={() => { setClientToEditOrg(client); setNewOrg(client.organization || '') }}>
                                                <Building2 className="h-3.5 w-3.5 mr-1" /> Org
                                            </Button>
                                            <Button variant="outline" size="sm" className="h-8 text-xs bg-white text-slate-600 hover:text-blue-600" onClick={() => { setClientToEditAlias(client); setNewAlias(client.alias || '') }}>
                                                <Edit2 className="h-3.5 w-3.5 mr-1" /> Alias
                                            </Button>
                                            {client.id !== currentUserId && (
                                                <Button variant="outline" size="sm" className="h-8 text-xs bg-white text-slate-600 hover:text-emerald-600" onClick={() => { setClientToEditRole(client); setNewRole(client.permission || 'client') }}>
                                                    <Shield className="h-3.5 w-3.5 mr-1" /> Role
                                                </Button>
                                            )}
                                            {client.permission !== 'client-admin' ? (
                                                <Button variant="outline" size="sm" className="h-8 text-xs bg-white text-red-600 hover:bg-red-50" onClick={() => setClientToDelete(client)}>
                                                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                                                </Button>
                                            ) : (
                                                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider flex items-center px-2">Admin</span>
                                            )}
                                        </>
                                    ) : (
                                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider flex items-center px-2">View only</span>
                                    )}
                                </div>
                            </Card>
                        )
                    })}
                    {filteredClients.length === 0 && (
                        <div className="py-12 flex flex-col items-center justify-center text-slate-500 bg-white rounded-xl border border-slate-200 border-dashed">
                            <div className="p-3 rounded-full bg-slate-50 mb-3">
                                <Users className="w-8 h-8 text-slate-300" />
                            </div>
                            <p className="font-medium text-slate-900">No members found</p>
                            <p className="text-sm">Try a different search term or reset filters.</p>
                            {hasActiveFilters && (
                                <Button variant="outline" size="sm" onClick={resetFilters} className="mt-3">
                                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset filters
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                {/* Desktop table */}
                <Card className="hidden md:block border-slate-200 bg-white shadow-sm overflow-hidden p-0">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/80 border-b border-slate-100 sticky top-0 z-10 backdrop-blur-sm">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="w-[300px] font-semibold text-slate-700">
                                    <button
                                        onClick={() => toggleSort('member')}
                                        className="inline-flex items-center gap-1.5 hover:text-blue-700 transition-colors"
                                    >
                                        Member Details <SortIcon col="member" />
                                    </button>
                                </TableHead>
                                <TableHead className="font-semibold text-slate-700">
                                    <button
                                        onClick={() => toggleSort('activity')}
                                        className="inline-flex items-center gap-1.5 hover:text-blue-700 transition-colors"
                                    >
                                        Status & Activity <SortIcon col="activity" />
                                    </button>
                                </TableHead>
                                <TableHead className="text-center font-semibold text-slate-700">
                                    <button
                                        onClick={() => toggleSort('today')}
                                        className="inline-flex items-center gap-1.5 hover:text-blue-700 transition-colors mx-auto"
                                    >
                                        Today <SortIcon col="today" />
                                    </button>
                                </TableHead>
                                <TableHead className="text-center font-semibold text-slate-700">Reports Downloaded</TableHead>
                                <TableHead className="text-center font-semibold text-slate-700">
                                    <button
                                        onClick={() => toggleSort('week')}
                                        className="inline-flex items-center gap-1.5 hover:text-blue-700 transition-colors mx-auto"
                                    >
                                        Last 7 Days <SortIcon col="week" />
                                    </button>
                                </TableHead>
                                <TableHead className="text-center font-semibold text-slate-700">
                                    <button
                                        onClick={() => toggleSort('month')}
                                        className="inline-flex items-center gap-1.5 hover:text-blue-700 transition-colors mx-auto"
                                    >
                                        Last 30 Days <SortIcon col="month" />
                                    </button>
                                </TableHead>
                                <TableHead className="text-right font-semibold text-slate-700">Manage</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredClients.map((client) => {
                                const stats = client.activityStats || {}
                                const isActiveToday = !!stats.todayLastActivity

                                return (
                                    <TableRow key={client.id} className="group hover:bg-slate-50/50 transition-colors">
                                        <TableCell className="py-4">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-0.5 p-2 rounded-xl bg-blue-50/50 text-blue-600 border border-blue-100/50 group-hover:bg-blue-100 group-hover:border-blue-200 transition-colors shrink-0">
                                                    <Mail className="w-4 h-4" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <button
                                                            type="button"
                                                            onClick={() => setClientToView(client)}
                                                            className="font-semibold text-slate-900 break-all hover:text-blue-700 hover:underline decoration-dotted underline-offset-4 transition-colors text-left"
                                                            title={`View ${client.email}'s activity`}
                                                        >
                                                            {client.email}
                                                        </button>
                                                        {client.alias && (
                                                            <div className="text-[10px] text-blue-600 font-medium flex items-center gap-1 bg-blue-50/80 px-1.5 py-0.5 rounded-md border border-blue-100/50" title={`Alias: ${client.alias}`}>
                                                                <UserCheck className="w-3 h-3 text-blue-500" />
                                                                <span className="truncate max-w-[100px]">{client.alias}</span>
                                                            </div>
                                                        )}
                                                        <Badge variant={client.permission === 'client-admin' ? 'default' : 'secondary'} className="capitalize px-1.5 py-0 text-[9px] font-bold tracking-wide shrink-0">
                                                            {roleLabel(client.permission)}
                                                        </Badge>
                                                    </div>
                                                    
                                                    {client.organization && (
                                                        <div className="mt-1.5 text-[11px] text-slate-500 flex items-start gap-1.5 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100 max-w-full w-fit" title={client.organization}>
                                                            <Building2 className="w-3 h-3 text-purple-500 shrink-0 mt-0.5" />
                                                            <span className="font-medium text-slate-700 break-words leading-snug">{client.organization}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex flex-col gap-2">
                                                {isActiveToday ? (
                                                    <span className="inline-flex w-fit items-center gap-1.5 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60 shadow-sm">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                        Active Today
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex w-fit items-center gap-1.5 text-[11px] text-slate-600 font-semibold bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200/60 shadow-sm">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                                        Offline
                                                    </span>
                                                )}
                                                <div className="flex items-center gap-3 text-xs text-slate-500 font-medium pl-1">
                                                    <div className="flex items-center gap-1" title="First Login">
                                                        <Clock className="w-3 h-3 text-slate-400" />
                                                        <span>{formatTime(stats.todayLoginTime)}</span>
                                                    </div>
                                                    <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                                                    <div className="flex items-center gap-1" title="Last Activity">
                                                        <Activity className="w-3 h-3 text-slate-400" />
                                                        <span>{formatTime(stats.todayLastActivity)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="flex flex-col items-center p-1.5 px-3 bg-emerald-50/50 rounded-lg border border-emerald-100/50" title="Cases Reviewed Today">
                                                    <div className="flex items-center gap-1.5 text-emerald-700">
                                                        <ShieldCheck className="w-3.5 h-3.5" />
                                                        <span className="font-bold text-sm">{stats.todayCases || 0}</span>
                                                    </div>
                                                    <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-600/70">Cases</span>
                                                </div>
                                                <div className="flex flex-col items-center p-1.5 px-3 bg-blue-50/50 rounded-lg border border-blue-100/50" title="Profiles Reviewed Today">
                                                    <div className="flex items-center gap-1.5 text-blue-700">
                                                        <Users className="w-3.5 h-3.5" />
                                                        <span className="font-bold text-sm">{stats.todayProfiles || 0}</span>
                                                    </div>
                                                    <span className="text-[9px] font-semibold uppercase tracking-wider text-blue-600/70">Profiles</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex items-center justify-center">
                                                <div className="flex flex-col gap-1 items-start">
                                                    {Object.entries(stats.allTimeReports || {}).length > 0 ? (
                                                        Object.entries(stats.allTimeReports).map(([type, count]) => (
                                                            <div key={type} className="flex items-center gap-2 text-xs" title={`All time ${type} reports downloaded`}>
                                                                <span className="font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded capitalize">{type.replace(/_/g, ' ')}</span>
                                                                <span className="font-bold text-slate-800">{count}</span>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <span className="text-xs text-slate-400 italic">No reports</span>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex items-center justify-center gap-4 text-sm">
                                                <div className="flex items-baseline gap-1" title="Cases Reviewed Last 7 Days">
                                                    <span className="font-bold text-slate-800">{stats.last7DaysCases || 0}</span>
                                                    <span className="text-[10px] font-medium text-slate-400 uppercase">c</span>
                                                </div>
                                                <div className="w-px h-4 bg-slate-200"></div>
                                                <div className="flex items-baseline gap-1" title="Profiles Reviewed Last 7 Days">
                                                    <span className="font-bold text-slate-800">{stats.last7DaysProfiles || 0}</span>
                                                    <span className="text-[10px] font-medium text-slate-400 uppercase">p</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex items-center justify-center gap-4 text-sm">
                                                <div className="flex items-baseline gap-1" title="Cases Reviewed Last 30 Days">
                                                    <span className="font-bold text-slate-800">{stats.last30DaysCases || 0}</span>
                                                    <span className="text-[10px] font-medium text-slate-400 uppercase">c</span>
                                                </div>
                                                <div className="w-px h-4 bg-slate-200"></div>
                                                <div className="flex items-baseline gap-1" title="Profiles Reviewed Last 30 Days">
                                                    <span className="font-bold text-slate-800">{stats.last30DaysProfiles || 0}</span>
                                                    <span className="text-[10px] font-medium text-slate-400 uppercase">p</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4 text-right">
                                            <div className="flex items-center justify-end gap-1 transition-opacity">
                                                {canManageTeam ? (
                                                    <>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 rounded-full text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                                                            onClick={() => {
                                                                setClientToEditOrg(client)
                                                                setNewOrg(client.organization || '')
                                                            }}
                                                            title="Edit Organization"
                                                        >
                                                            <Building2 className="h-4 w-4" />
                                                        </Button>

                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 rounded-full text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                                            onClick={() => {
                                                                setClientToEditAlias(client)
                                                                setNewAlias(client.alias || '')
                                                            }}
                                                            title="Edit Alias"
                                                        >
                                                            <Edit2 className="h-4 w-4" />
                                                        </Button>

                                                        {client.id !== currentUserId && (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 rounded-full text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                                                onClick={() => {
                                                                    setClientToEditRole(client)
                                                                    setNewRole(client.permission || 'client')
                                                                }}
                                                                title="Change Role"
                                                            >
                                                                <Shield className="h-4 w-4" />
                                                            </Button>
                                                        )}

                                                        {client.permission !== 'client-admin' ? (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                                onClick={() => setClientToDelete(client)}
                                                                title="Delete Member"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        ) : (
                                                            <div className="h-8 flex items-center px-2">
                                                                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Admin</span>
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider pr-2">View only</span>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                            {filteredClients.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-64 text-center">
                                        <div className="flex flex-col items-center justify-center text-slate-500">
                                            <div className="p-4 rounded-full bg-slate-50 mb-4 border border-slate-100">
                                                <Users className="w-8 h-8 text-slate-300" />
                                            </div>
                                            <p className="text-lg font-semibold text-slate-900">No members found</p>
                                            <p className="text-sm mt-1 max-w-sm">
                                                We couldn&apos;t find any team members matching your filters. Try adjusting your search or resetting.
                                            </p>
                                            {hasActiveFilters && (
                                                <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4">
                                                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset filters
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                </Card>
            </div>

            <MemberDetailDialog
                client={clientToView}
                onClose={() => setClientToView(null)}
            />

            {canManageTeam && (
            <CreateUserModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                projectDisplayName={project_name}
                onSuccess={() => {
                    setNotification({
                        title: 'User Created',
                        message: 'The new team member has been successfully added to the project.'
                    })
                    router.refresh()

                    // Clear notification after 5 seconds
                    setTimeout(() => setNotification(null), 5000)
                }}
            />
            )}

            {/* Toast Notification */}
            {notification && (
                <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-right-full fade-in duration-500">
                    <div
                        className={
                            isError
                                ? "bg-white border border-red-100 shadow-2xl shadow-red-500/10 rounded-2xl p-4 flex items-start gap-4 max-w-sm"
                                : "bg-white border border-emerald-100 shadow-2xl shadow-emerald-500/10 rounded-2xl p-4 flex items-start gap-4 max-w-sm"
                        }
                        role={isError ? "alert" : "status"}
                    >
                        <div className={isError ? "bg-red-50 p-2 rounded-xl" : "bg-emerald-50 p-2 rounded-xl"}>
                            {isError
                                ? <AlertCircle className="w-5 h-5 text-red-600" />
                                : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 leading-tight">
                                {notification.title}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                                {notification.message}
                            </p>
                        </div>
                        <button
                            onClick={() => setNotification(null)}
                            className="p-1 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                            aria-label="Dismiss notification"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
            {/* Delete Confirmation Dialog */}
            <Dialog open={!!clientToDelete} onOpenChange={(open) => !open && !isDeleting && setClientToDelete(null)}>
                <DialogContent className="p-0 overflow-hidden bg-white shadow-2xl border-slate-100 rounded-2xl sm:max-w-[400px]">
                    <div className="px-6 pt-6 pb-2">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <Trash2 className="w-5 h-5 text-red-500" />
                                Delete Team Member
                            </DialogTitle>
                            <DialogDescription className="text-slate-500 mt-2 leading-relaxed">
                                Are you sure you want to remove <span className="font-semibold text-slate-900">{clientToDelete?.email}</span> from the project? This action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex justify-end gap-2 mt-4">
                        <Button
                            variant="outline"
                            onClick={() => setClientToDelete(null)}
                            disabled={isDeleting}
                            className="bg-white hover:bg-slate-50 text-slate-600 border-slate-200"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            className="bg-red-600 hover:bg-red-700 text-white shadow-sm"
                            onClick={handleDeleteClient}
                            disabled={isDeleting}
                        >
                            {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                            Delete member
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Alias Dialog */}
            <Dialog open={!!clientToEditAlias} onOpenChange={(open) => !open && !isUpdatingAlias && setClientToEditAlias(null)}>
                <DialogContent className="p-0 overflow-hidden bg-white shadow-2xl border-slate-100 rounded-2xl sm:max-w-[425px]">
                    <div className="px-6 pt-6 pb-0">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold text-slate-900">Edit Alias</DialogTitle>
                            <DialogDescription className="text-slate-500 mt-1.5 leading-relaxed">
                                Set an alias for <span className="font-semibold text-slate-900">{clientToEditAlias?.email}</span>. This will be visible in reports and logs.
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="p-6">
                        <Input
                            placeholder="e.g. John Doe"
                            value={newAlias}
                            onChange={(e) => setNewAlias(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !isUpdatingAlias) handleUpdateAlias() }}
                            className="w-full bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all duration-200"
                            autoFocus
                        />
                    </div>
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setClientToEditAlias(null)}
                            disabled={isUpdatingAlias}
                            className="bg-white hover:bg-slate-50 text-slate-600 border-slate-200"
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all duration-200"
                            onClick={handleUpdateAlias}
                            disabled={isUpdatingAlias}
                        >
                            {isUpdatingAlias ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            Save Alias
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Change Role Dialog */}
            <Dialog open={!!clientToEditRole} onOpenChange={(open) => !open && !isUpdatingRole && setClientToEditRole(null)}>
                <DialogContent className="p-0 overflow-hidden bg-white shadow-2xl border-slate-100 rounded-2xl sm:max-w-[425px]">
                    <div className="px-6 pt-6 pb-0">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <Shield className="w-5 h-5 text-emerald-600" />
                                Change Role
                            </DialogTitle>
                            <DialogDescription className="text-slate-500 mt-1.5 leading-relaxed">
                                Update access level for <span className="font-semibold text-slate-900">{clientToEditRole?.email}</span>.
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="p-6 space-y-3">
                        <Select value={newRole} onValueChange={setNewRole}>
                            <SelectTrigger className="w-full bg-slate-50 border-slate-200">
                                <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="client-admin">Admin — full access, manage team</SelectItem>
                                <SelectItem value="client-reviewer">Reviewer — review cases & profiles</SelectItem>
                                <SelectItem value="client">Analyst — standard access</SelectItem>
                            </SelectContent>
                        </Select>
                        {clientToEditRole?.permission === 'client-admin' && newRole !== 'client-admin' && (
                            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2.5 flex items-start gap-2">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>Demoting an admin will revoke their team management access.</span>
                            </div>
                        )}
                    </div>
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setClientToEditRole(null)}
                            disabled={isUpdatingRole}
                            className="bg-white hover:bg-slate-50 text-slate-600 border-slate-200"
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all duration-200"
                            onClick={handleUpdateRole}
                            disabled={isUpdatingRole || newRole === clientToEditRole?.permission}
                        >
                            {isUpdatingRole ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            Save Role
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Organization Dialog */}
            <Dialog open={!!clientToEditOrg} onOpenChange={(open) => !open && !isUpdatingOrg && setClientToEditOrg(null)}>
                <DialogContent className="p-0 overflow-hidden bg-white shadow-2xl border-slate-100 rounded-2xl sm:max-w-[425px]">
                    <div className="px-6 pt-6 pb-0">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold text-slate-900">Edit Organization</DialogTitle>
                            <DialogDescription className="text-slate-500 mt-1.5 leading-relaxed">
                                Set the organization name for <span className="font-semibold text-slate-900">{clientToEditOrg?.email}</span>.
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="p-6">
                        <Input
                            placeholder="e.g. Acme Corp"
                            value={newOrg}
                            onChange={(e) => setNewOrg(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !isUpdatingOrg) handleUpdateOrg() }}
                            className="w-full bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all duration-200"
                            autoFocus
                        />
                    </div>
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setClientToEditOrg(null)}
                            disabled={isUpdatingOrg}
                            className="bg-white hover:bg-slate-50 text-slate-600 border-slate-200"
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all duration-200"
                            onClick={handleUpdateOrg}
                            disabled={isUpdatingOrg}
                        >
                            {isUpdatingOrg ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            Save Organization
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export default AdminDashboard