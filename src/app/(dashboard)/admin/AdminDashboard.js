"use client"

import React, { useState, useMemo } from 'react'
import { Plus, Users, CheckCircle2, UserCheck, Search, Mail, ShieldCheck, ArrowUpRight, Activity, Trash2, Loader2, Clock, CalendarDays, Calendar } from 'lucide-react'
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
import { delete_client } from './actions'
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

const AdminDashboard = ({ project_name, clients }) => {
    const router = useRouter()
    const [searchTerm, setSearchTerm] = useState('')
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [notification, setNotification] = useState(null)
    const [clientToDelete, setClientToDelete] = useState(null)
    const [isDeleting, setIsDeleting] = useState(false)

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
        <div className="p-6 h-full overflow-y-auto space-y-8 animate-in fade-in duration-500">
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

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search by email..."
                                className="pl-10 bg-white border-slate-200 focus:border-blue-300 transition-colors"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Member
                        </Button>
                    </div>
                </div>

                {/* Client Table */}
                <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader className="bg-slate-50/50">
                            <TableRow>
                                <TableHead className="w-[250px]">Member</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Today&apos;s Activity</TableHead>
                                <TableHead className="text-center">Today&apos;s Reviews</TableHead>
                                <TableHead className="text-center">Last 7 Days</TableHead>
                                <TableHead className="text-center">Last 30 Days</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredClients.map((client) => {
                                const stats = client.activityStats || {}
                                const isActiveToday = !!stats.todayLastActivity

                                return (
                                    <TableRow key={client.id} className="group">
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-slate-50 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors shrink-0">
                                                    <Mail className="w-4 h-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-medium text-slate-900 truncate" title={client.email}>
                                                        {client.email}
                                                    </div>
                                                    <Badge variant={client.permission === 'client-admin' ? 'default' : 'secondary'} className="capitalize mt-0.5 px-1.5 py-0 text-[9px] font-semibold">
                                                        {
                                                            client.permission === 'client-admin' ? 'Admin' :
                                                                client.permission === 'client-reviewer' ? 'Reviewer' :
                                                                    "analyst"
                                                        }
                                                    </Badge>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {isActiveToday ? (
                                                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100/50">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                    Active Today
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 font-medium bg-slate-50 px-2 py-1 rounded-full border border-slate-200/50">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                                    Offline
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                                    <span className="text-slate-400 w-10">Login:</span>
                                                    <span className="font-medium">{formatTime(stats.todayLoginTime)}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                                    <span className="text-slate-400 w-10">Last:</span>
                                                    <span className="font-medium">{formatTime(stats.todayLastActivity)}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center justify-center gap-3 text-sm">
                                                <div className="text-center" title="Cases Reviewed Today">
                                                    <span className="font-semibold text-slate-900">{stats.todayCases || 0}</span>
                                                    <span className="text-[10px] text-slate-400 block -mt-1">cases</span>
                                                </div>
                                                <div className="w-px h-6 bg-slate-200"></div>
                                                <div className="text-center" title="Profiles Reviewed Today">
                                                    <span className="font-semibold text-slate-900">{stats.todayProfiles || 0}</span>
                                                    <span className="text-[10px] text-slate-400 block -mt-1">profiles</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center justify-center gap-3 text-sm">
                                                <div className="text-center" title="Cases Reviewed Last 7 Days">
                                                    <span className="font-semibold text-slate-900">{stats.last7DaysCases || 0}</span>
                                                    <span className="text-[10px] text-slate-400 block -mt-1">cases</span>
                                                </div>
                                                <div className="w-px h-6 bg-slate-200"></div>
                                                <div className="text-center" title="Profiles Reviewed Last 7 Days">
                                                    <span className="font-semibold text-slate-900">{stats.last7DaysProfiles || 0}</span>
                                                    <span className="text-[10px] text-slate-400 block -mt-1">profiles</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center justify-center gap-3 text-sm">
                                                <div className="text-center" title="Cases Reviewed Last 30 Days">
                                                    <span className="font-semibold text-slate-900">{stats.last30DaysCases || 0}</span>
                                                    <span className="text-[10px] text-slate-400 block -mt-1">cases</span>
                                                </div>
                                                <div className="w-px h-6 bg-slate-200"></div>
                                                <div className="text-center" title="Profiles Reviewed Last 30 Days">
                                                    <span className="font-semibold text-slate-900">{stats.last30DaysProfiles || 0}</span>
                                                    <span className="text-[10px] text-slate-400 block -mt-1">profiles</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {client.permission !== 'client-admin' ? (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                    onClick={() => setClientToDelete(client)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            ) : (
                                                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider pr-2">Admin</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                            {filteredClients.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-48 text-center">
                                        <div className="flex flex-col items-center justify-center text-slate-500">
                                            <div className="p-3 rounded-full bg-slate-50 mb-3">
                                                <Users className="w-8 h-8 text-slate-300" />
                                            </div>
                                            <p className="font-medium text-slate-900">No members found</p>
                                            <p className="text-sm">We couldn&apos;t find any team members matching your search.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Card>
            </div>

            <CreateUserModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                projectName={project_name}
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
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Team Member</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to remove <span className="font-semibold text-slate-900">{clientToDelete?.email}</span> from the project? This action cannot be undone and will permanently delete their account.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                        <Button
                            variant="outline"
                            onClick={() => setClientToDelete(null)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            className="bg-red-600 hover:bg-red-700 text-white"
                            onClick={handleDeleteClient}
                            disabled={isDeleting}
                        >
                            {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Yes, delete member
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export default AdminDashboard