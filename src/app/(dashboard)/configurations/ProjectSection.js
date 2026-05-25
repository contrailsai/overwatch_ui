'use client'

import { useState, useActionState, useEffect, useTransition, useCallback } from 'react'
import {
    updateLabels,
    get_cron_jobs,
    create_cron_job,
    update_cron_job,
    delete_cron_job,
} from './projectActions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
    Loader2, Globe, Calendar, FileText, Tag, Plus, Trash2, CheckCircle2, AlertCircle,
    Clock, Pencil, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

const PDF_COMMAND_TEMPLATE = '@bot pdf-fetch -r summary -risk high'
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getJobSchedule(job) {
    return job?.schedule ?? job
}

function formatSchedule(job) {
    const schedule = getJobSchedule(job)
    const tz = schedule?.timezone?.split('/').pop() || 'IST'
    const time = schedule?.time || '—'
    const repeat = schedule?.repeat || 'daily'

    if (repeat === 'weekly' && schedule?.dayOfWeek != null) {
        const day = DAY_NAMES[schedule.dayOfWeek] ?? schedule.dayOfWeek
        return `Every ${day} at ${time} ${tz}`
    }
    if (repeat === 'monthly' && schedule?.dayOfMonth != null) {
        return `Day ${schedule.dayOfMonth} at ${time} ${tz}`
    }
    return `Daily at ${time} ${tz}`
}

function getJobId(job) {
    return job?.jobId ?? job?.id ?? job?._id
}

function statusBadgeClass(status) {
    switch (status) {
        case 'success':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200'
        case 'partial_failure':
            return 'bg-amber-50 text-amber-700 border-amber-200'
        case 'failed':
        case 'no_groups':
            return 'bg-rose-50 text-rose-700 border-rose-200'
        case 'skipped_not_ready':
            return 'bg-slate-100 text-slate-600 border-slate-200'
        default:
            return 'bg-slate-50 text-slate-500 border-slate-200'
    }
}

const RUN_STATUS_LABELS = {
    success: 'Sent successfully',
    partial_failure: 'Partially sent',
    failed: 'Failed to send',
    no_groups: 'No WhatsApp groups',
    skipped_not_ready: 'Not ready yet',
}

function formatStatusLabel(status) {
    if (!status) return '—'
    return RUN_STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}

const defaultCronForm = () => ({
    time: '09:00',
    repeat: 'daily',
    dayOfWeek: '1',
    dayOfMonth: '1',
    timezone: 'Asia/Kolkata',
    command: PDF_COMMAND_TEMPLATE,
    enabled: true,
})

export default function ProjectSection({ project, isEditable }) {
    const [labelState, labelAction, labelPending] = useActionState(updateLabels, null)

    const [cronJobs, setCronJobs] = useState([])
    const [cronConfigured, setCronConfigured] = useState(true)
    const [cronLoading, setCronLoading] = useState(false)
    const [cronFeedback, setCronFeedback] = useState(null)
    const [cronPending, startCronTransition] = useTransition()
    const [editingJobId, setEditingJobId] = useState(null)
    const [cronForm, setCronForm] = useState(defaultCronForm)

    const [projectDescription, setProjectDescription] = useState(project?.project_details?.description || '')
    const [projectLabels, setProjectLabels] = useState(() => {
        const initialLabels = project?.project_details?.labels || [
            { name: "hate-speech", description: "" },
            { name: "misinformation", description: "" },
            { name: "nsfw", description: "" },
            { name: "fraud", description: "" },
            { name: "asset-misuse", description: "" },
            { name: "satire", description: "" },
            { name: "terrorism", description: "" },
            { name: "violence", description: "" },
        ]
        return initialLabels.map(l => ({ ...l, severity: l.severity || 'low', originalName: l.name }))
    })

    const [legalCodes, setLegalCodes] = useState(() => {
        const initialCodes = project?.project_details?.legal_codes || []
        return initialCodes.map(c => ({ 
            ...c, 
            severity: c.severity || 'low',
            referenceLink: c.referenceLink || '',
            originalName: c.name || (`${c.actName || ''} - ${c.codeName || ''}`.trim().replace(/^-|-$/g, '').trim())
        }))
    })

    const handleAddLabel = () => setProjectLabels([{ name: '', description: '', severity: 'low', originalName: '' }, ...projectLabels])

    const handleRemoveLabel = (index) => {
        setProjectLabels(prev => prev.filter((_, i) => i !== index))
    }

    const handleLabelChange = (index, field, value) => {
        setProjectLabels(prev => {
            const newLabels = [...prev]
            newLabels[index][field] = value
            return newLabels
        })
    }

    const handleAddLegalCode = () => setLegalCodes([{ actName: '', codeName: '', description: '', severity: 'low', referenceLink: '', originalName: '' }, ...legalCodes])

    const handleRemoveLegalCode = (index) => {
        setLegalCodes(prev => prev.filter((_, i) => i !== index))
    }

    const handleLegalCodeChange = (index, field, value) => {
        setLegalCodes(prev => {
            const newCodes = [...prev]
            newCodes[index][field] = value
            return newCodes
        })
    }

    const showCronFeedback = (type, message) => {
        setCronFeedback({ type, message })
        setTimeout(() => setCronFeedback(null), 4000)
    }

    const loadCronJobs = useCallback(async () => {
        if (!project?.project_name) return
        setCronLoading(true)
        try {
            const res = await get_cron_jobs()
            if (res.configured === false) {
                setCronConfigured(false)
                setCronJobs([])
                return
            }
            setCronConfigured(true)
            if (res.error) {
                showCronFeedback('error', res.error)
                setCronJobs([])
            } else {
                setCronJobs(res.jobs ?? [])
            }
        } catch {
            showCronFeedback('error', 'Failed to load scheduled reports')
        } finally {
            setCronLoading(false)
        }
    }, [project?.project_name])

    useEffect(() => {
        loadCronJobs()
    }, [loadCronJobs])

    const resetCronForm = () => {
        setCronForm(defaultCronForm())
        setEditingJobId(null)
    }

    const startEditCronJob = (job) => {
        const schedule = getJobSchedule(job)
        const timeValue = schedule?.time || '09:00'
        const htmlTime = timeValue.length === 5 ? timeValue : '09:00'

        setEditingJobId(getJobId(job))
        setCronForm({
            time: htmlTime,
            repeat: schedule?.repeat || 'daily',
            dayOfWeek: String(schedule?.dayOfWeek ?? 1),
            dayOfMonth: String(schedule?.dayOfMonth ?? 1),
            timezone: schedule?.timezone || 'Asia/Kolkata',
            command: job.command || PDF_COMMAND_TEMPLATE,
            enabled: job.enabled !== false,
        })
    }

    const buildCronPayload = () => {
        const payload = {
            time: cronForm.time,
            repeat: cronForm.repeat,
            timezone: cronForm.timezone.trim() || 'Asia/Kolkata',
            command: cronForm.command,
            enabled: cronForm.enabled,
        }
        if (cronForm.repeat === 'weekly') {
            payload.dayOfWeek = Number(cronForm.dayOfWeek)
        }
        if (cronForm.repeat === 'monthly') {
            payload.dayOfMonth = Number(cronForm.dayOfMonth)
        }
        return payload
    }

    const handleCronSubmit = () => {
        startCronTransition(async () => {
            const payload = buildCronPayload()
            const res = editingJobId
                ? await update_cron_job(editingJobId, payload)
                : await create_cron_job(payload)

            if (res?.error) {
                showCronFeedback('error', res.error)
                return
            }

            showCronFeedback('success', editingJobId ? 'Scheduled report updated' : 'Scheduled report created')
            resetCronForm()
            await loadCronJobs()
        })
    }

    const handleToggleCronJob = (job, enabled) => {
        const jobId = getJobId(job)
        if (!jobId) return
        startCronTransition(async () => {
            const res = await update_cron_job(jobId, { enabled })
            if (res?.error) {
                showCronFeedback('error', res.error)
                return
            }
            await loadCronJobs()
        })
    }

    const handleDeleteCronJob = (job) => {
        const jobId = getJobId(job)
        if (!jobId) return
        if (!confirm('Delete this scheduled WhatsApp report?')) return
        startCronTransition(async () => {
            const res = await delete_cron_job(jobId)
            if (res?.error) {
                showCronFeedback('error', res.error)
                return
            }
            if (editingJobId === jobId) resetCronForm()
            showCronFeedback('success', 'Scheduled report deleted')
            await loadCronJobs()
        })
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <section className="space-y-4 w-full">
                {isEditable && (
                    <div className="md:hidden flex items-start gap-3 p-4 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 mb-6 shadow-sm">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
                        <div className="text-sm font-medium">
                            <span className="font-bold block mb-1">Editing disabled on mobile</span>
                            Please use a desktop device to manage project configurations.
                        </div>
                    </div>
                )}
                <div className="flex items-center gap-2 px-1">
                    <Globe className="w-4 h-4 text-slate-400" />
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Project Overview</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Card className="border-slate-200 shadow-sm rounded-xl p-0">
                        <CardContent className="p-6 flex items-start gap-4">
                            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                                <Globe className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Project Identity</Label>
                                <div className="text-lg font-bold text-slate-900 truncate mt-1">{project?.project_name || 'N/A'}</div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-slate-200 shadow-sm rounded-xl p-0">
                        <CardContent className="p-6 flex items-start gap-4">
                            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
                                <Calendar className="w-5 h-5" />
                            </div>
                            <div>
                                <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Creation Date</Label>
                                <div className="text-lg font-bold text-slate-900 mt-1">
                                    {project?.created_at ? format(new Date(project.created_at), 'MMM d, yyyy') : 'N/A'}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-slate-200 shadow-sm rounded-xl p-0 md:col-span-2 lg:col-span-1">
                        <CardContent className="p-6 flex items-start gap-4">
                            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg shrink-0">
                                <FileText className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Description</Label>
                                <div className="mt-1">
                                    <Input
                                        value={projectDescription}
                                        onChange={(e) => setProjectDescription(e.target.value)}
                                        placeholder="Project description..."
                                        disabled={!isEditable}
                                        className="h-8 text-sm font-medium border-slate-200 p-2 focus-visible:ring-blue-500/20 truncate max-md:pointer-events-none max-md:opacity-80 max-md:bg-slate-50"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </section>

            <section className="space-y-4 w-full">
                <div className="flex items-center gap-2 px-1">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Scheduled WhatsApp Reports</h2>
                </div>

                <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden p-0">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 pt-8 pb-6">
                        <CardTitle className="text-lg font-bold text-slate-800">Automatic WhatsApp Reports</CardTitle>
                        <CardDescription className="text-slate-500">
                            Choose when reports are generated and sent to your project&apos;s WhatsApp groups.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        {!cronConfigured && (
                            <div className="px-6 py-8 text-sm text-slate-500 font-medium border-b border-slate-100">
                                Automatic WhatsApp reports are not set up yet. Please contact your administrator to enable this feature.
                            </div>
                        )}

                        {cronConfigured && (
                            <>
                                <div className="w-full overflow-x-auto">
                                    <Table className="w-full table-fixed">
                                        <TableHeader className="bg-slate-50/30">
                                            <TableRow className="border-slate-100 hover:bg-transparent">
                                                <TableHead className="pl-6">When</TableHead>
                                                <TableHead className="w-[240px] max-w-[240px]">Command</TableHead>
                                                <TableHead className="w-[90px]">Active</TableHead>
                                                <TableHead className="w-[140px]">Last sent</TableHead>
                                                <TableHead className="w-[120px]">Delivery</TableHead>
                                                <TableHead className="text-right pr-6 w-[120px]">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {cronLoading ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="py-12 text-center">
                                                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                                                    </TableCell>
                                                </TableRow>
                                            ) : cronJobs.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="py-12 text-center text-slate-500 font-medium">
                                                        No scheduled reports yet. Add one below.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                cronJobs.map((job) => {
                                                    const jobId = getJobId(job)
                                                    const lastRun = job.last_run_at
                                                        ? format(new Date(job.last_run_at), 'MMM d, yyyy HH:mm')
                                                        : 'Never'
                                                    const status = job.last_run_status ?? job.status ?? null
                                                    return (
                                                        <TableRow key={jobId} className="border-slate-100">
                                                            <TableCell className="pl-6 font-medium text-slate-800">
                                                                {formatSchedule(job)}
                                                            </TableCell>
                                                            <TableCell className="w-[240px] max-w-[240px] align-top py-4">
                                                                <span className="text-sm text-slate-600 block break-words whitespace-normal leading-snug">
                                                                    {job.command}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Switch
                                                                    checked={job.enabled !== false}
                                                                    onCheckedChange={(checked) => handleToggleCronJob(job, checked)}
                                                                    disabled={!isEditable || cronPending}
                                                                />
                                                            </TableCell>
                                                            <TableCell className="text-sm text-slate-600">{lastRun}</TableCell>
                                                            <TableCell>
                                                                <Badge
                                                                    variant="outline"
                                                                    className={cn('text-xs font-bold capitalize', statusBadgeClass(status))}
                                                                >
                                                                    {formatStatusLabel(status)}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right pr-6">
                                                                <div className="flex justify-end gap-1">
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => startEditCronJob(job)}
                                                                        disabled={!isEditable || cronPending}
                                                                        className="text-slate-400 hover:text-blue-600"
                                                                    >
                                                                        <Pencil className="w-4 h-4" />
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => handleDeleteCronJob(job)}
                                                                        disabled={!isEditable || cronPending}
                                                                        className="text-slate-300 hover:text-rose-600"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>

                                <div className="p-6 border-t border-slate-100 space-y-4 bg-slate-50/30">
                                    <div className="flex items-center justify-between gap-4">
                                        <h3 className="text-sm font-bold text-slate-700">
                                            {editingJobId ? 'Edit report schedule' : 'Add a new report schedule'}
                                        </h3>
                                        {editingJobId && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={resetCronForm}
                                                disabled={cronPending}
                                                className="text-slate-500"
                                            >
                                                <X className="w-4 h-4 mr-1" />
                                                Cancel
                                            </Button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Send at</Label>
                                            <Input
                                                type="time"
                                                value={cronForm.time}
                                                onChange={(e) => setCronForm((f) => ({ ...f, time: e.target.value }))}
                                                disabled={!isEditable || cronPending}
                                                className="bg-white"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">How often</Label>
                                            <Select
                                                value={cronForm.repeat}
                                                onValueChange={(val) => setCronForm((f) => ({ ...f, repeat: val }))}
                                                disabled={!isEditable || cronPending}
                                            >
                                                <SelectTrigger className="bg-white">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="daily">Daily</SelectItem>
                                                    <SelectItem value="weekly">Weekly</SelectItem>
                                                    <SelectItem value="monthly">Monthly</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {cronForm.repeat === 'weekly' && (
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-slate-500 uppercase">On day</Label>
                                                <Select
                                                    value={cronForm.dayOfWeek}
                                                    onValueChange={(val) => setCronForm((f) => ({ ...f, dayOfWeek: val }))}
                                                    disabled={!isEditable || cronPending}
                                                >
                                                    <SelectTrigger className="bg-white">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {DAY_NAMES.map((name, i) => (
                                                            <SelectItem key={name} value={String(i)}>{name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                        {cronForm.repeat === 'monthly' && (
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-slate-500 uppercase">Date each month</Label>
                                                <Select
                                                    value={cronForm.dayOfMonth}
                                                    onValueChange={(val) => setCronForm((f) => ({ ...f, dayOfMonth: val }))}
                                                    disabled={!isEditable || cronPending}
                                                >
                                                    <SelectTrigger className="bg-white">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {Array.from({ length: 31 }, (_, i) => (
                                                            <SelectItem key={i + 1} value={String(i + 1)}>
                                                                {i + 1}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Time zone</Label>
                                            <Input
                                                value={cronForm.timezone}
                                                onChange={(e) => setCronForm((f) => ({ ...f, timezone: e.target.value }))}
                                                placeholder="Asia/Kolkata"
                                                disabled={!isEditable || cronPending}
                                                className="bg-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <Label className="text-xs font-bold text-slate-500 uppercase">Report type</Label>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-xs font-bold"
                                                onClick={() => setCronForm((f) => ({ ...f, command: PDF_COMMAND_TEMPLATE }))}
                                                disabled={!isEditable || cronPending}
                                            >
                                                Use PDF summary
                                            </Button>
                                        </div>
                                        <p className="text-xs text-slate-500">
                                            Most teams use the PDF summary. Only change the advanced instruction below if support gave you one.
                                        </p>
                                        <Textarea
                                            value={cronForm.command}
                                            onChange={(e) => setCronForm((f) => ({ ...f, command: e.target.value }))}
                                            placeholder={PDF_COMMAND_TEMPLATE}
                                            disabled={!isEditable || cronPending}
                                            className="bg-white min-h-[80px] font-mono text-sm"
                                        />
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <Switch
                                            id="cron-enabled"
                                            checked={cronForm.enabled}
                                            onCheckedChange={(checked) => setCronForm((f) => ({ ...f, enabled: checked }))}
                                            disabled={!isEditable || cronPending}
                                        />
                                        <Label htmlFor="cron-enabled" className="text-sm font-medium text-slate-700 cursor-pointer">
                                            Schedule is active
                                        </Label>
                                    </div>

                                    <div className="flex justify-end">
                                        <Button
                                            type="button"
                                            onClick={handleCronSubmit}
                                            disabled={!isEditable || cronPending || !cronForm.command.trim()}
                                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                                        >
                                            {cronPending ? (
                                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                                            ) : editingJobId ? 'Save changes' : 'Add schedule'}
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}

                        {cronFeedback && (
                            <div className="px-6 pb-6">
                                <div
                                    className={cn(
                                        'flex items-center gap-3 p-4 rounded-xl border animate-in zoom-in-95 duration-200',
                                        cronFeedback.type === 'error'
                                            ? 'bg-rose-50 text-rose-700 border-rose-100'
                                            : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                    )}
                                >
                                    {cronFeedback.type === 'error' ? (
                                        <AlertCircle className="w-5 h-5 shrink-0" />
                                    ) : (
                                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                                    )}
                                    <p className="text-sm font-bold">{cronFeedback.message}</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </section>

            <section className="space-y-4 w-full pb-20">
                <div className="flex items-center gap-2 px-1">
                    <Tag className="w-4 h-4 text-slate-400" />
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Categorization Labels</h2>
                </div>

                <form action={labelAction}>
                    <input type="hidden" name="project_description" value={projectDescription} />
                    {/* Send the labels as a proper JSON string to avoid duplicate array keys in FormData */}
                    <input type="hidden" name="labels" value={JSON.stringify(projectLabels)} />
                    <input type="hidden" name="legal_codes" value={JSON.stringify(legalCodes)} />

                    <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden p-0">
                        <CardHeader className="bg-slate-50/50 border-b border-slate-100 pt-10">
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle className="text-lg font-bold text-slate-800">Labels Management</CardTitle>
                                    <CardDescription className="text-slate-500">
                                        Define labels and descriptions to be used for classifying project assets.
                                    </CardDescription>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleAddLabel}
                                    disabled={!isEditable}
                                    className="hidden md:flex h-9 px-3 border-slate-200 hover:bg-slate-50 text-slate-600 font-bold"
                                >
                                    <Plus className="w-4 h-4 mr-1.5" />
                                    Add New Label
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="w-full overflow-x-auto">
                                <div className="relative min-w-[800px] md:min-w-0 max-md:opacity-80">
                                    <div className="md:hidden absolute inset-0 z-10 bg-transparent" />
                                    <Table className="w-full">
                                        <TableHeader className="bg-slate-50/30">
                                            <TableRow className="border-slate-100 hover:bg-transparent">
                                                <TableHead className="w-[25%] pl-6">Label Title</TableHead>
                                        <TableHead className="w-1/2">Definition & Context</TableHead>
                                        <TableHead className="w-[15%]">Severity Level</TableHead>
                                        <TableHead className="w-[80px] text-right pr-6">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {projectLabels.map((label, index) => (
                                        <TableRow key={index} className="group border-slate-100 selection:bg-blue-50">
                                            <TableCell className="align-top pt-5 pl-6">
                                                <Input
                                                    value={label.name}
                                                    onChange={(e) => handleLabelChange(index, 'name', e.target.value)}
                                                    placeholder="e.g. Hate Speech"
                                                    disabled={!isEditable}
                                                    className="bg-white border-slate-200 h-10 font-bold text-slate-800 focus:ring-blue-500/20"
                                                    required
                                                />
                                            </TableCell>
                                            <TableCell className="align-top pt-5">
                                                <Textarea
                                                    value={label.description}
                                                    onChange={(e) => handleLabelChange(index, 'description', e.target.value)}
                                                    placeholder="Detailed classification criteria..."
                                                    disabled={!isEditable}
                                                    className="bg-white border-slate-200 min-h-[40px] text-sm resize-none focus:ring-blue-500/20 py-2.5"
                                                />
                                            </TableCell>
                                            <TableCell className="align-top pt-5">
                                                <Select
                                                    value={label.severity || 'low'}
                                                    onValueChange={(val) => handleLabelChange(index, 'severity', val)}
                                                    disabled={!isEditable}
                                                >
                                                    <SelectTrigger className={cn(
                                                        "w-full bg-white border-slate-200 h-10 font-bold uppercase",
                                                        label.severity === 'high' ? "text-rose-600" :
                                                            label.severity === 'medium' ? "text-amber-600" :
                                                                "text-emerald-600"
                                                    )}>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="low" className="font-bold uppercase text-emerald-600">Low</SelectItem>
                                                        <SelectItem value="medium" className="font-bold uppercase text-amber-600">Medium</SelectItem>
                                                        <SelectItem value="high" className="font-bold uppercase text-rose-600">High</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="align-top pt-5 text-right pr-6">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleRemoveLabel(index)}
                                                    disabled={!isEditable}
                                                    className="text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-30"
                                                >
                                                    <Trash2 className="w-4.5 h-4.5" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                                </div>
                            </div>

                            {projectLabels.length === 0 && (
                                <div className="text-center py-16">
                                    <div className="inline-flex p-4 bg-slate-50 rounded-full mb-4">
                                        <Tag className="w-8 h-8 text-slate-300" />
                                    </div>
                                    <p className="text-slate-500 font-bold">No labels configured</p>
                                    <p className="text-sm text-slate-400 mb-6">Categorization labels help in automated asset processing.</p>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={handleAddLabel}
                                        className="font-bold border-slate-200"
                                    >
                                        Add your first label
                                    </Button>
                                </div>
                            )}

                        </CardContent>
                    </Card>

                    <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden p-0 mt-8">
                        <CardHeader className="bg-slate-50/50 border-b border-slate-100 pt-10">
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle className="text-lg font-bold text-slate-800">Legal Framework Codes</CardTitle>
                                    <CardDescription className="text-slate-500">
                                        Define legal acts and codes to be used for classifying project assets.
                                    </CardDescription>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleAddLegalCode}
                                    disabled={!isEditable}
                                    className="hidden md:flex h-9 px-3 border-slate-200 hover:bg-slate-50 text-slate-600 font-bold"
                                >
                                    <Plus className="w-4 h-4 mr-1.5" />
                                    Add New Code
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="w-full overflow-x-auto">
                                <div className="relative min-w-[800px] md:min-w-0 max-md:opacity-80">
                                    <div className="md:hidden absolute inset-0 z-10 bg-transparent" />
                                    <Table className="w-full">
                                        <TableHeader className="bg-slate-50/30">
                                            <TableRow className="border-slate-100 hover:bg-transparent">
                                                <TableHead className="w-[15%] pl-6">Act Name</TableHead>
                                        <TableHead className="w-[15%]">Code Name</TableHead>
                                        <TableHead className="w-[20%]">Reference Link</TableHead>
                                        <TableHead className="w-[25%]">Definition & Context</TableHead>
                                        <TableHead className="w-[15%]">Severity Level</TableHead>
                                        <TableHead className="w-[80px] text-right pr-6">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {legalCodes.map((code, index) => (
                                        <TableRow key={index} className="group border-slate-100 selection:bg-blue-50">
                                            <TableCell className="align-top pt-5 pl-6">
                                                <Input
                                                    value={code.actName || ''}
                                                    onChange={(e) => handleLegalCodeChange(index, 'actName', e.target.value)}
                                                    placeholder="e.g. DSA"
                                                    disabled={!isEditable}
                                                    className="bg-white border-slate-200 h-10 font-bold text-slate-800 focus:ring-blue-500/20"
                                                    required
                                                />
                                            </TableCell>
                                            <TableCell className="align-top pt-5">
                                                <Input
                                                    value={code.codeName || ''}
                                                    onChange={(e) => handleLegalCodeChange(index, 'codeName', e.target.value)}
                                                    placeholder="e.g. Article 14"
                                                    disabled={!isEditable}
                                                    className="bg-white border-slate-200 h-10 font-bold text-slate-800 focus:ring-blue-500/20"
                                                    required
                                                />
                                            </TableCell>
                                            <TableCell className="align-top pt-5">
                                                <Input
                                                    value={code.referenceLink || ''}
                                                    onChange={(e) => handleLegalCodeChange(index, 'referenceLink', e.target.value)}
                                                    placeholder="https://..."
                                                    disabled={!isEditable}
                                                    className="bg-white border-slate-200 h-10 text-slate-800 focus:ring-blue-500/20"
                                                    type="url"
                                                />
                                            </TableCell>
                                            <TableCell className="align-top pt-5">
                                                <Textarea
                                                    value={code.description || ''}
                                                    onChange={(e) => handleLegalCodeChange(index, 'description', e.target.value)}
                                                    placeholder="Detailed classification criteria..."
                                                    disabled={!isEditable}
                                                    className="bg-white border-slate-200 min-h-[40px] text-sm resize-none focus:ring-blue-500/20 py-2.5"
                                                />
                                            </TableCell>
                                            <TableCell className="align-top pt-5">
                                                <Select
                                                    value={code.severity || 'low'}
                                                    onValueChange={(val) => handleLegalCodeChange(index, 'severity', val)}
                                                    disabled={!isEditable}
                                                >
                                                    <SelectTrigger className={cn(
                                                        "w-full bg-white border-slate-200 h-10 font-bold uppercase",
                                                        code.severity === 'high' ? "text-rose-600" :
                                                            code.severity === 'medium' ? "text-amber-600" :
                                                                "text-emerald-600"
                                                    )}>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="low" className="font-bold uppercase text-emerald-600">Low</SelectItem>
                                                        <SelectItem value="medium" className="font-bold uppercase text-amber-600">Medium</SelectItem>
                                                        <SelectItem value="high" className="font-bold uppercase text-rose-600">High</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="align-top pt-5 text-right pr-6">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleRemoveLegalCode(index)}
                                                    disabled={!isEditable}
                                                    className="text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-30"
                                                >
                                                    <Trash2 className="w-4.5 h-4.5" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                                </div>
                            </div>

                            {legalCodes.length === 0 && (
                                <div className="text-center py-16">
                                    <div className="inline-flex p-4 bg-slate-50 rounded-full mb-4">
                                        <FileText className="w-8 h-8 text-slate-300" />
                                    </div>
                                    <p className="text-slate-500 font-bold">No legal codes configured</p>
                                    <p className="text-sm text-slate-400 mb-6">Legal framework codes help in regulatory asset processing.</p>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={handleAddLegalCode}
                                        className="font-bold border-slate-200"
                                    >
                                        Add your first code
                                    </Button>
                                </div>
                            )}

                            <div className="px-6 py-8 space-y-4">
                                {labelState?.error && (
                                    <div className="flex items-center gap-3 p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 animate-in zoom-in-95 duration-200">
                                        <AlertCircle className="w-5 h-5 shrink-0" />
                                        <p className="text-sm font-bold">{labelState.error}</p>
                                    </div>
                                )}
                                {labelState?.success && (
                                    <div className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 animate-in zoom-in-95 duration-200">
                                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                                        <p className="text-sm font-bold">{labelState.message}</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                        <CardFooter className="hidden md:flex bg-slate-50/50 border-t border-slate-100 p-6 justify-end">
                            <Button
                                type="submit"
                                disabled={labelPending || !isEditable}
                                className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 h-11 shadow-lg shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                            >
                                {labelPending ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating Settings...</>
                                ) : 'Update Project Settings'}
                            </Button>
                        </CardFooter>
                    </Card>
                </form>
            </section>
        </div>
    )
}
