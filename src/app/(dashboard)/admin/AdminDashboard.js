"use client"

import React, { useState, useMemo } from 'react'
import { Plus, Users, CheckCircle2, UserCheck, Search, Mail, ShieldCheck, ArrowUpRight, Activity, Trash2, Loader2, Clock, CalendarDays, Calendar, Edit2, Building2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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
import { CreateUserModal } from './CreateUserModal'
import { delete_client, update_client_alias, update_client_organization } from './actions'
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

const AdminDashboard = ({ project_name, clients, isClientAdmin = false }) => {
    const router = useRouter()
    const [searchTerm, setSearchTerm] = useState('')
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

    const stats = useMemo(() => {
        const totalClients = clients?.length || 0
        const totalReviewedCases = clients?.reduce((acc, client) => acc + (client.meta_stats?.reviewed_cases || 0), 0) || 0
        const totalReviewedProfiles = clients?.reduce((acc, client) => acc + (client.meta_stats?.reviewed_profiles || 0), 0) || 0
        // console.log("clients = ", clients)
        return [
            {
                label: 'Total Team Members',
                count: totalClients,
                icon: Users,
                color: 'text-blue-600',
                bg: 'bg-blue-50'
            },
            {
                label: 'All-Time Cases Reviewed',
                count: totalReviewedCases,
                icon: CheckCircle2,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50'
            },
            {
                label: 'All-Time Profiles Reviewed',
                count: totalReviewedProfiles,
                icon: UserCheck,
                color: 'text-amber-600',
                bg: 'bg-amber-50'
            }
        ]
    }, [clients])

    const filteredClients = useMemo(() => {
        if (!searchTerm) return clients || []
        return (clients || []).filter(client =>
            client.email?.toLowerCase().includes(searchTerm.toLowerCase())
        )
    }, [clients, searchTerm])

    return (
        <div className="p-4 md:p-6 h-full overflow-y-auto overflow-x-hidden space-y-6 md:space-y-8 animate-in fade-in duration-500">
            {/* Header section with Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {stats.map((stat, i) => (
                    <Card key={i} className="border-none shadow-sm bg-white overflow-hidden group transition-all duration-300">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                                    <p className="text-3xl font-bold text-slate-900">{stat.count.toLocaleString()}</p>
                                </div>
                                <div className={`p-3 rounded-2xl ${stat.bg} group-hover:scale-110 transition-transform duration-300`}>
                                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Main Content */}
            <div className="space-y-4 pb-12">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-900">Project Contributors</h2>
                        <p className="text-sm text-slate-500">Manage and monitor team performance for <span className="text-blue-600 font-medium">{project_name}</span></p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                        <div className="relative w-full sm:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search by email..."
                                className="pl-10 w-full bg-white border-slate-200 focus:border-blue-300 transition-colors shadow-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        {isClientAdmin && (
                            <Button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto shrink-0 shadow-sm"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Member
                            </Button>
                        )}
                    </div>
                </div>

                {/* Mobile Card View */}
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
                                                <div className="font-medium text-slate-900 break-words break-all leading-snug">{client.email}</div>
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
                                            {client.permission === 'client-admin' ? 'Admin' : client.permission === 'client-reviewer' ? 'Reviewer' : "Analyst"}
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
                                        <p className="text-xs text-slate-500 font-medium">Today's Reviews</p>
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
                                    {isClientAdmin ? (
                                        <>
                                            <Button variant="outline" size="sm" className="h-8 text-xs bg-white text-slate-600 hover:text-purple-600" onClick={() => { setClientToEditOrg(client); setNewOrg(client.organization || '') }}>
                                                <Building2 className="h-3.5 w-3.5 mr-1" /> Org
                                            </Button>
                                            <Button variant="outline" size="sm" className="h-8 text-xs bg-white text-slate-600 hover:text-blue-600" onClick={() => { setClientToEditAlias(client); setNewAlias(client.alias || '') }}>
                                                <Edit2 className="h-3.5 w-3.5 mr-1" /> Alias
                                            </Button>
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
                            <p className="text-sm">We couldn't find any team members matching your search.</p>
                        </div>
                    )}
                </div>

                {/* Desktop Table View */}
                <Card className="hidden md:block border-slate-200 bg-white shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader className="bg-slate-50/80 border-b border-slate-100">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="w-[300px] font-semibold text-slate-700">Member Details</TableHead>
                                <TableHead className="font-semibold text-slate-700">Status & Activity</TableHead>
                                <TableHead className="text-center font-semibold text-slate-700">Today</TableHead>
                                <TableHead className="text-center font-semibold text-slate-700">Reports Downloaded</TableHead>
                                <TableHead className="text-center font-semibold text-slate-700">Last 7 Days</TableHead>
                                <TableHead className="text-center font-semibold text-slate-700">Last 30 Days</TableHead>
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
                                                        <span className="font-semibold text-slate-900 break-all" title={client.email}>
                                                            {client.email}
                                                        </span>
                                                        {client.alias && (
                                                            <div className="text-[10px] text-blue-600 font-medium flex items-center gap-1 bg-blue-50/80 px-1.5 py-0.5 rounded-md border border-blue-100/50" title={`Alias: ${client.alias}`}>
                                                                <UserCheck className="w-3 h-3 text-blue-500" />
                                                                <span className="truncate max-w-[100px]">{client.alias}</span>
                                                            </div>
                                                        )}
                                                        <Badge variant={client.permission === 'client-admin' ? 'default' : 'secondary'} className="capitalize px-1.5 py-0 text-[9px] font-bold tracking-wide shrink-0">
                                                            {client.permission === 'client-admin' ? 'Admin' : client.permission === 'client-reviewer' ? 'Reviewer' : "Analyst"}
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
                                            <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                                {isClientAdmin ? (
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
                                            <p className="text-sm mt-1 max-w-sm">We couldn't find any team members matching your search criteria. Try a different term or add a new member.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Card>
            </div>

            {isClientAdmin && (
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
                    <div className="bg-white border border-emerald-100 shadow-2xl shadow-emerald-500/10 rounded-2xl p-4 flex items-start gap-4 max-w-sm">
                        <div className="bg-emerald-50 p-2 rounded-xl">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
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
                        >
                            <Plus className="w-4 h-4 rotate-45" />
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