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
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion'
import {
    Loader2, Globe, Calendar, FileText, Tag, Plus, Trash2, CheckCircle2, AlertCircle,
    Clock, Pencil, X, MessageCircle, ChevronRight, Terminal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const REPORT_PRESETS = {
    summary: {
        id: 'summary',
        label: 'PDF summary',
        description: 'Compact high-risk highlights',
        command: '@bot pdf-fetch -r summary -risk high',
    },
    detailed: {
        id: 'detailed',
        label: 'PDF detailed',
        description: 'Full detailed PDF report',
        command: '@bot pdf-fetch -r detailed -risk high',
    },
    custom: {
        id: 'custom',
        label: 'Custom',
        description: 'Support-provided instruction only',
        command: null,
    },
}

const TIMEZONE_OPTIONS = [
    { value: 'Asia/Kolkata', label: 'India (IST)' },
    { value: 'Asia/Dubai', label: 'Gulf (GST)' },
    { value: 'Asia/Singapore', label: 'Singapore' },
    { value: 'Europe/London', label: 'UK (GMT/BST)' },
    { value: 'America/New_York', label: 'US Eastern' },
    { value: 'America/Los_Angeles', label: 'US Pacific' },
    { value: 'UTC', label: 'UTC' },
]

function getJobSchedule(job) {
    return job?.schedule ?? job
}

function formatTime12h(time24) {
    if (!time24 || !/^\d{2}:\d{2}$/.test(time24)) return time24 || '—'
    const [h, m] = time24.split(':').map(Number)
    const period = h >= 12 ? 'pm' : 'am'
    const h12 = h % 12 || 12
    return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function formatTimezoneShort(timezone) {
    const match = TIMEZONE_OPTIONS.find((tz) => tz.value === timezone)
    if (match) return match.label.split(' (')[0]
    return timezone?.split('/').pop() || 'local'
}

function formatSchedule(job) {
    const schedule = getJobSchedule(job)
    const tz = formatTimezoneShort(schedule?.timezone)
    const time = formatTime12h(schedule?.time)
    const repeat = schedule?.repeat || 'daily'

    if (repeat === 'weekly' && schedule?.dayOfWeek != null) {
        const day = DAY_NAMES[schedule.dayOfWeek] ?? schedule.dayOfWeek
        return `Every ${day} at ${time} (${tz})`
    }
    if (repeat === 'monthly' && schedule?.dayOfMonth != null) {
        return `Monthly on day ${schedule.dayOfMonth} at ${time} (${tz})`
    }
    return `Daily at ${time} (${tz})`
}

function detectReportPreset(command) {
    const normalized = (command || '').trim()
    if (!normalized) return 'summary'
    if (normalized.includes('-r detailed')) return 'detailed'
    if (normalized.includes('-r summary')) return 'summary'
    return 'custom'
}

function formatReportTypeLabel(command) {
    const preset = detectReportPreset(command)
    return REPORT_PRESETS[preset]?.label ?? 'Custom report'
}

function resolveFormCommand(form) {
    if (form.reportPreset === 'custom') return form.customCommand.trim()
    return REPORT_PRESETS[form.reportPreset]?.command ?? REPORT_PRESETS.summary.command
}

function CronCommandPreview({ command, collapsible = true, className }) {
    const trimmed = command?.trim()
    if (!trimmed) return null

    const codeBlock = (
        <pre className="font-mono text-[11px] sm:text-xs text-slate-600 leading-relaxed break-all whitespace-pre-wrap">
            {trimmed}
        </pre>
    )

    if (!collapsible) {
        return (
            <div
                className={cn(
                    'rounded-lg border border-slate-200/80 bg-slate-50/90 px-3 py-2.5',
                    className
                )}
            >
                <div className="flex items-center gap-1.5 mb-1.5">
                    <Terminal className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Instruction preview
                    </span>
                </div>
                {codeBlock}
            </div>
        )
    }

    return (
        <details
            className={cn(
                'group/cmd rounded-lg border border-slate-100 bg-slate-50/60',
                'open:bg-slate-50 open:border-slate-200/80 transition-colors',
                className
            )}
        >
            <summary
                className={cn(
                    'flex cursor-pointer list-none flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-2',
                    'text-xs font-medium text-slate-500 hover:text-slate-700 touch-manipulation',
                    '[&::-webkit-details-marker]:hidden'
                )}
            >
                <span className="flex min-w-0 items-center gap-1.5 shrink-0">
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform group-open/cmd:rotate-90" />
                    <Terminal className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span>Bot instruction</span>
                </span>
                <span
                    className={cn(
                        'min-w-0 font-mono text-[10px] sm:text-[11px] font-normal text-slate-400 truncate',
                        'group-open/cmd:hidden'
                    )}
                    title={trimmed}
                >
                    {trimmed}
                </span>
            </summary>
            <div className="border-t border-slate-100/80 px-3 pb-2.5 pt-2">
                {codeBlock}
            </div>
        </details>
    )
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
    reportPreset: 'summary',
    customCommand: '',
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
    const [showCronForm, setShowCronForm] = useState(false)
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
        setShowCronForm(false)
    }

    const openNewCronForm = () => {
        setCronForm(defaultCronForm())
        setEditingJobId(null)
        setShowCronForm(true)
    }

    const startEditCronJob = (job) => {
        const schedule = getJobSchedule(job)
        const timeValue = schedule?.time || '09:00'
        const htmlTime = timeValue.length === 5 ? timeValue : '09:00'
        const preset = detectReportPreset(job.command)

        setEditingJobId(getJobId(job))
        setShowCronForm(true)
        setCronForm({
            time: htmlTime,
            repeat: schedule?.repeat || 'daily',
            dayOfWeek: String(schedule?.dayOfWeek ?? 1),
            dayOfMonth: String(schedule?.dayOfMonth ?? 1),
            timezone: schedule?.timezone || 'Asia/Kolkata',
            reportPreset: preset,
            customCommand: preset === 'custom' ? (job.command || '') : '',
            enabled: job.enabled !== false,
        })
    }

    const buildCronPayload = () => {
        const payload = {
            time: cronForm.time,
            repeat: cronForm.repeat,
            timezone: cronForm.timezone.trim() || 'Asia/Kolkata',
            command: resolveFormCommand(cronForm),
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

                <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden p-0 max-md:rounded-lg">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 px-4 pt-6 pb-4 sm:px-6 sm:pt-8 sm:pb-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                            <div className="min-w-0">
                                <CardTitle className="text-base sm:text-lg font-bold text-slate-800 leading-snug">
                                    Automatic WhatsApp Reports
                                </CardTitle>
                                <CardDescription className="text-slate-500 mt-1 text-sm leading-relaxed">
                                    Schedule PDF reports to be sent automatically to your project&apos;s WhatsApp groups.
                                </CardDescription>
                            </div>
                            {cronConfigured && isEditable && !showCronForm && (
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={openNewCronForm}
                                    disabled={cronPending}
                                    className="w-full sm:w-auto shrink-0 min-h-11 touch-manipulation bg-blue-600 hover:bg-blue-700 text-white font-bold"
                                >
                                    <Plus className="w-4 h-4 mr-1.5" />
                                    Add schedule
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {!cronConfigured && (
                            <div className="px-4 py-8 sm:px-6 text-sm text-slate-500 font-medium leading-relaxed">
                                Automatic WhatsApp reports are not set up yet. Please contact your administrator to enable this feature.
                            </div>
                        )}

                        {cronConfigured && (
                            <>
                                {cronLoading ? (
                                    <div className="py-16 flex justify-center">
                                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                                    </div>
                                ) : cronJobs.length === 0 && !showCronForm ? (
                                    <div className="px-4 py-12 sm:px-6 sm:py-14 text-center">
                                        <div className="inline-flex p-4 bg-emerald-50 rounded-full mb-4">
                                            <MessageCircle className="w-8 h-8 text-emerald-500" />
                                        </div>
                                        <p className="text-slate-700 font-bold">No scheduled reports yet</p>
                                        <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed px-2">
                                            Pick a send time and report type — we&apos;ll deliver a PDF to your WhatsApp groups automatically.
                                        </p>
                                        {isEditable && (
                                            <Button
                                                type="button"
                                                onClick={openNewCronForm}
                                                disabled={cronPending}
                                                className="mt-6 w-full max-w-xs min-h-11 touch-manipulation bg-blue-600 hover:bg-blue-700 text-white font-bold sm:w-auto"
                                            >
                                                <Plus className="w-4 h-4 mr-1.5" />
                                                Create first schedule
                                            </Button>
                                        )}
                                    </div>
                                ) : cronJobs.length > 0 && (
                                    <ul className="flex flex-col gap-3 p-3 sm:gap-0 sm:p-0 sm:divide-y sm:divide-slate-100">
                                        {cronJobs.map((job) => {
                                            const jobId = getJobId(job)
                                            const isEditing = editingJobId === jobId
                                            const lastRun = job.last_run_at
                                                ? format(new Date(job.last_run_at), 'MMM d, yyyy · h:mm a')
                                                : 'Not sent yet'
                                            const status = job.last_run_status ?? job.status ?? null
                                            const isActive = job.enabled !== false

                                            return (
                                                <li
                                                    key={jobId}
                                                    className={cn(
                                                        'rounded-xl border border-slate-200 bg-white shadow-sm transition-colors',
                                                        'sm:rounded-none sm:border-0 sm:border-b sm:border-slate-100 sm:bg-transparent sm:shadow-none',
                                                        'sm:px-6 sm:py-4',
                                                        isEditing && 'ring-2 ring-blue-500/20 border-blue-200 bg-blue-50/30 sm:ring-0 sm:bg-blue-50/40'
                                                    )}
                                                >
                                                    <div className="p-4 space-y-3 sm:p-0 sm:space-y-0 sm:flex sm:flex-col sm:gap-4 lg:flex-row lg:items-center">
                                                        <div className="flex-1 min-w-0 space-y-2 sm:space-y-1.5">
                                                            <div className="flex flex-wrap items-start gap-2">
                                                                <span className="text-sm sm:text-base font-semibold text-slate-900 leading-snug break-words">
                                                                    {formatSchedule(job)}
                                                                </span>
                                                                {!isActive && (
                                                                    <Badge variant="outline" className="text-xs font-medium text-slate-500 border-slate-200 shrink-0">
                                                                        Paused
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-col gap-1.5 text-sm text-slate-500 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                                                                <Badge variant="secondary" className="w-fit font-medium bg-slate-100 text-slate-700 hover:bg-slate-100">
                                                                    {formatReportTypeLabel(job.command)}
                                                                </Badge>
                                                                <span className="hidden sm:inline text-slate-300">·</span>
                                                                <span className="text-xs sm:text-sm text-slate-500">
                                                                    Last sent: {lastRun}
                                                                </span>
                                                            </div>
                                                            <Badge
                                                                variant="outline"
                                                                className={cn(
                                                                    'w-full justify-center py-1.5 text-xs font-semibold sm:hidden',
                                                                    statusBadgeClass(status)
                                                                )}
                                                            >
                                                                {formatStatusLabel(status)}
                                                            </Badge>
                                                            {job.command?.trim() && (
                                                                <CronCommandPreview command={job.command} />
                                                            )}
                                                        </div>

                                                        <div className="flex flex-col gap-3 pt-3 border-t border-slate-100 sm:border-0 sm:pt-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 lg:justify-end lg:shrink-0">
                                                            <Badge
                                                                variant="outline"
                                                                className={cn(
                                                                    'hidden sm:inline-flex text-xs font-semibold shrink-0',
                                                                    statusBadgeClass(status)
                                                                )}
                                                            >
                                                                {formatStatusLabel(status)}
                                                            </Badge>
                                                            <div className="flex items-center justify-between gap-3 sm:justify-start sm:gap-2 sm:pl-1 sm:border-l sm:border-slate-200">
                                                                <Label className="text-sm font-medium text-slate-600 sm:sr-only">
                                                                    Active
                                                                </Label>
                                                                <Switch
                                                                    checked={isActive}
                                                                    onCheckedChange={(checked) => handleToggleCronJob(job, checked)}
                                                                    disabled={!isEditable || cronPending}
                                                                    className="touch-manipulation"
                                                                />
                                                            </div>
                                                            <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:gap-1">
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => startEditCronJob(job)}
                                                                    disabled={!isEditable || cronPending}
                                                                    className="min-h-11 touch-manipulation font-medium text-slate-600 sm:h-8"
                                                                >
                                                                    <Pencil className="w-4 h-4 mr-1.5 sm:w-3.5 sm:h-3.5 sm:mr-1" />
                                                                    Edit
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="icon"
                                                                    onClick={() => handleDeleteCronJob(job)}
                                                                    disabled={!isEditable || cronPending}
                                                                    aria-label="Delete schedule"
                                                                    className="min-h-11 min-w-11 touch-manipulation text-slate-400 hover:text-rose-600 hover:border-rose-200 sm:h-8 sm:w-8 sm:border-transparent sm:hover:bg-transparent"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                )}

                                {showCronForm && (
                                    <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-5 space-y-5 sm:px-6 sm:py-6 sm:space-y-6">
                                        <div className="flex items-center justify-between gap-3">
                                            <h3 className="text-sm font-bold text-slate-800">
                                                {editingJobId ? 'Edit schedule' : 'New schedule'}
                                            </h3>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={resetCronForm}
                                                disabled={cronPending}
                                                className="shrink-0 min-h-10 touch-manipulation text-slate-500 -mr-2 sm:mr-0"
                                            >
                                                <X className="w-4 h-4 sm:mr-1" />
                                                <span className="sr-only sm:not-sr-only sm:inline">Cancel</span>
                                            </Button>
                                        </div>

                                        <div className="space-y-3">
                                            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                                Report type
                                            </Label>
                                            <div
                                                className={cn(
                                                    'flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory',
                                                    'sm:grid sm:grid-cols-3 sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0 sm:snap-none'
                                                )}
                                            >
                                                {Object.values(REPORT_PRESETS).map((preset) => (
                                                    <button
                                                        key={preset.id}
                                                        type="button"
                                                        disabled={!isEditable || cronPending}
                                                        onClick={() => setCronForm((f) => ({ ...f, reportPreset: preset.id }))}
                                                        className={cn(
                                                            'min-w-[min(100%,220px)] shrink-0 snap-start sm:min-w-0 sm:w-auto',
                                                            'rounded-xl border-2 p-4 text-left transition-all touch-manipulation disabled:opacity-50',
                                                            cronForm.reportPreset === preset.id
                                                                ? 'border-blue-500 bg-white shadow-sm ring-2 ring-blue-500/15'
                                                                : 'border-slate-200 bg-white active:border-slate-300 sm:hover:border-slate-300'
                                                        )}
                                                    >
                                                        <span className="block text-sm font-bold text-slate-800">{preset.label}</span>
                                                        <span className="block text-xs text-slate-500 mt-1 leading-relaxed">{preset.description}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-[11px] text-slate-400 sm:hidden">Swipe to see all report types</p>
                                            <CronCommandPreview
                                                command={resolveFormCommand(cronForm)}
                                                collapsible={false}
                                            />
                                            {cronForm.reportPreset === 'custom' && (
                                                <Accordion type="single" collapsible defaultValue="custom" className="rounded-xl border border-amber-200 bg-amber-50/50 px-4">
                                                    <AccordionItem value="custom" className="border-0">
                                                        <AccordionTrigger className="py-3 text-sm font-semibold text-amber-900 hover:no-underline">
                                                            Advanced custom instruction
                                                        </AccordionTrigger>
                                                        <AccordionContent className="pb-4">
                                                            <p className="text-xs text-amber-800/80 mb-2">
                                                                Paste the exact instruction from support. Leave unchanged if you are unsure.
                                                            </p>
                                                            <Textarea
                                                                value={cronForm.customCommand}
                                                                onChange={(e) => setCronForm((f) => ({ ...f, customCommand: e.target.value }))}
                                                                placeholder="@bot pdf-fetch ..."
                                                                disabled={!isEditable || cronPending}
                                                                className="bg-white min-h-[72px] font-mono text-xs border-amber-200"
                                                            />
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                </Accordion>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 gap-4 max-sm:gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Send at</Label>
                                                <Input
                                                    type="time"
                                                    value={cronForm.time}
                                                    onChange={(e) => setCronForm((f) => ({ ...f, time: e.target.value }))}
                                                    disabled={!isEditable || cronPending}
                                                    className="bg-white min-h-11 text-base sm:text-sm touch-manipulation"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Frequency</Label>
                                                <Select
                                                    value={cronForm.repeat}
                                                    onValueChange={(val) => setCronForm((f) => ({ ...f, repeat: val }))}
                                                    disabled={!isEditable || cronPending}
                                                >
                                                    <SelectTrigger className="bg-white min-h-11 w-full touch-manipulation">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="daily">Every day</SelectItem>
                                                        <SelectItem value="weekly">Every week</SelectItem>
                                                        <SelectItem value="monthly">Every month</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            {cronForm.repeat === 'weekly' && (
                                                <div className="space-y-2">
                                                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">On</Label>
                                                    <Select
                                                        value={cronForm.dayOfWeek}
                                                        onValueChange={(val) => setCronForm((f) => ({ ...f, dayOfWeek: val }))}
                                                        disabled={!isEditable || cronPending}
                                                    >
                                                        <SelectTrigger className="bg-white min-h-11 w-full touch-manipulation">
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
                                                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Day of month</Label>
                                                    <Select
                                                        value={cronForm.dayOfMonth}
                                                        onValueChange={(val) => setCronForm((f) => ({ ...f, dayOfMonth: val }))}
                                                        disabled={!isEditable || cronPending}
                                                    >
                                                        <SelectTrigger className="bg-white min-h-11 w-full touch-manipulation">
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
                                            <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Time zone</Label>
                                                <Select
                                                    value={cronForm.timezone}
                                                    onValueChange={(val) => setCronForm((f) => ({ ...f, timezone: val }))}
                                                    disabled={!isEditable || cronPending}
                                                >
                                                    <SelectTrigger className="bg-white min-h-11 w-full touch-manipulation">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {TIMEZONE_OPTIONS.map((tz) => (
                                                            <SelectItem key={tz.value} value={tz.value}>
                                                                {tz.label}
                                                            </SelectItem>
                                                        ))}
                                                        {!TIMEZONE_OPTIONS.some((tz) => tz.value === cronForm.timezone) && cronForm.timezone && (
                                                            <SelectItem value={cronForm.timezone}>
                                                                {cronForm.timezone}
                                                            </SelectItem>
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        <div
                                            className={cn(
                                                'flex flex-col gap-4 pt-4 border-t border-slate-200/80',
                                                'max-sm:sticky max-sm:bottom-0 max-sm:-mx-4 max-sm:px-4',
                                                'max-sm:py-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]',
                                                'max-sm:bg-slate-50/95 max-sm:border-t max-sm:backdrop-blur-sm max-sm:shadow-[0_-4px_12px_rgba(0,0,0,0.06)]',
                                                'sm:flex-row sm:items-center sm:justify-between sm:pt-2 sm:static sm:mx-0 sm:shadow-none'
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-3 sm:justify-start">
                                                <Label htmlFor="cron-enabled" className="text-sm font-medium text-slate-700 cursor-pointer">
                                                    Schedule is active
                                                </Label>
                                                <Switch
                                                    id="cron-enabled"
                                                    checked={cronForm.enabled}
                                                    onCheckedChange={(checked) => setCronForm((f) => ({ ...f, enabled: checked }))}
                                                    disabled={!isEditable || cronPending}
                                                    className="touch-manipulation"
                                                />
                                            </div>
                                            <Button
                                                type="button"
                                                onClick={handleCronSubmit}
                                                disabled={
                                                    !isEditable
                                                    || cronPending
                                                    || (cronForm.reportPreset === 'custom' && !cronForm.customCommand.trim())
                                                }
                                                className="min-h-12 touch-manipulation bg-blue-600 hover:bg-blue-700 text-white font-bold w-full sm:min-h-10 sm:w-auto"
                                            >
                                                {cronPending ? (
                                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                                                ) : editingJobId ? 'Save changes' : 'Add schedule'}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {cronFeedback && (
                            <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-slate-100">
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
