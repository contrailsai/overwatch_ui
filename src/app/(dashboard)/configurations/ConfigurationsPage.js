'use client'

import { useState, useActionState } from 'react'
import { getConfiguration, updateConfiguration, updateLabels } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Mail, Slack, MessageCircle, Settings, Bell, CheckCircle2, AlertCircle, Tag, Plus, Trash2, Globe, Calendar, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import PageHeader from '@/components/PageHeader'

export default function ConfigurationsPage({ clientDetails, project }) {
    const [state, formAction, isPending] = useActionState(updateConfiguration, null)
    const [labelState, labelAction, labelPending] = useActionState(updateLabels, null)

    // --- Notification Config State ---
    const [notificationConfig, setNotificationConfig] = useState(() => {
        const initial = clientDetails?.notification_config || {}
        return {
            active_method: initial.active_method || 'email',
            methods: {
                email: {
                    receiving_email: initial.methods?.email?.receiving_email || initial.methods?.email?.recieving_email || clientDetails?.email || ''
                },
                slack: {
                    slack_token: initial.methods?.slack?.slack_token || '',
                    slack_channel: initial.methods?.slack?.slack_channel || ''
                },
                telegram: {
                    telegram_token: initial.methods?.telegram?.telegram_token || '',
                    telegram_chat_id: initial.methods?.telegram?.telegram_chat_id || ''
                },
                ...initial.methods
            }
        }
    })

    const handleMethodChange = (method) => {
        setNotificationConfig(prev => ({ ...prev, active_method: method }))
    }

    const handleConfigChange = (method, field, value) => {
        setNotificationConfig(prev => ({
            ...prev,
            methods: {
                ...prev.methods,
                [method]: {
                    ...prev.methods?.[method],
                    [field]: value
                }
            }
        }))
    }

    // --- Project & Labels State ---
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
        return initialLabels.map(l => ({ ...l, severity: l.severity || 'low' }))
    })

    const [legalCodes, setLegalCodes] = useState(() => {
        const initialCodes = project?.project_details?.legal_codes || []
        return initialCodes.map(c => ({ ...c, severity: c.severity || 'low' }))
    })

    const isEditable = project?.editable
    console.log("editable settings = ", isEditable)

    const handleAddLabel = () => setProjectLabels([{ name: '', description: '', severity: 'low' }, ...projectLabels])

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

    const handleAddLegalCode = () => setLegalCodes([{ actName: '', codeName: '', description: '', severity: 'low' }, ...legalCodes])

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

    return (
        <main className="flex-1 flex flex-col h-full w-full overflow-hidden bg-slate-50">
            {/* Header */}
            <PageHeader title="Configurations" description="Manage your account preferences and project-specific categorization rules" />

            {/* <header className="bg-white border-b border-slate-200 py-5 px-8 shrink-0 flex justify-between items-center z-10">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System Configuration</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Manage your account preferences and project-specific categorization rules</p>
                </div>
            </header> */}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 w-full">
                <Tabs defaultValue="account" className="w-full space-y-8">
                    <TabsList className="grid w-fit grid-cols-2 p-1 bg-slate-100 rounded-xl mb-6">
                        <TabsTrigger value="account" className="px-8 py-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <Settings className="w-4 h-4 mr-2" />
                            User Account
                        </TabsTrigger>
                        <TabsTrigger value="project" className="px-8 py-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <Globe className="w-4 h-4 mr-2" />
                            Project Settings
                        </TabsTrigger>
                    </TabsList>

                    {/* --- ACCOUNT TAB --- */}
                    <TabsContent value="account" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <section className="space-y-4 w-full">
                            <div className="flex items-center gap-2 px-1">
                                <Settings className="w-4 h-4 text-slate-400" />
                                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Account Details</h2>
                            </div>
                            <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden p-0">
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Registered Email</Label>
                                            <div className="text-lg font-bold text-slate-900">{clientDetails?.email || 'N/A'}</div>
                                            <p className="text-sm text-slate-500">Member since {clientDetails?.created_at ? format(new Date(clientDetails.created_at), 'MMMM d, yyyy') : 'N/A'}</p>
                                        </div>
                                        <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 px-3 py-1">
                                            {clientDetails?.permission === 'client' ? 'Client Access' : 'Full Access'}
                                        </Badge>
                                    </div>
                                </CardContent>
                            </Card>
                        </section>

                        <section className="space-y-4 w-full max-w-3xl">
                            <div className="flex items-center gap-2 px-1">
                                <Bell className="w-4 h-4 text-slate-400" />
                                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Notification Setup</h2>
                            </div>

                            <form action={formAction}>
                                {/* Hidden input to send the fully constructed JSON to the server action */}
                                <input type="hidden" name="notification_config" value={JSON.stringify(notificationConfig)} />

                                <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden p-0">
                                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 pt-10">
                                        <CardTitle className="text-lg font-bold text-slate-800">Alert Workflow</CardTitle>
                                        <CardDescription className="text-slate-500">
                                            Configure where to receive high-threat alerts and takedown requests.
                                        </CardDescription>
                                    </CardHeader>

                                    <CardContent className="p-6 space-y-8">
                                        <div className="space-y-3">
                                            <Label className="text-sm font-bold text-slate-700">Primary Delivery Method</Label>
                                            <Select
                                                value={notificationConfig.active_method}
                                                onValueChange={handleMethodChange}
                                            >
                                                <SelectTrigger className="w-full bg-white border-slate-200 h-11 focus:ring-blue-500/20">
                                                    <SelectValue placeholder="Select method" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="email" className="py-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
                                                                <Mail className="h-4 w-4" />
                                                            </div>
                                                            <span className="font-semibold">Email Correspondence</span>
                                                        </div>
                                                    </SelectItem>
                                                    <SelectItem value="slack" className="py-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-1.5 bg-purple-50 text-purple-600 rounded-md">
                                                                <Slack className="h-4 w-4" />
                                                            </div>
                                                            <span className="font-semibold">Slack Webhook</span>
                                                        </div>
                                                    </SelectItem>
                                                    <SelectItem value="telegram" className="py-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-1.5 bg-sky-50 text-sky-600 rounded-md">
                                                                <MessageCircle className="h-4 w-4" />
                                                            </div>
                                                            <span className="font-semibold">Telegram Bot</span>
                                                        </div>
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <Separator className="bg-slate-100" />

                                        <div className="space-y-6 min-h-[60px]">
                                            {notificationConfig.active_method === 'email' && (
                                                <div className="space-y-3 animate-in fade-in duration-300">
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="receiving_email" className="text-sm font-bold text-slate-700">Recipient Email</Label>
                                                        <Input
                                                            id="receiving_email"
                                                            type="email"
                                                            value={notificationConfig.methods.email.receiving_email}
                                                            onChange={(e) => handleConfigChange('email', 'receiving_email', e.target.value)}
                                                            placeholder="alerts@yourcompany.com"
                                                            required
                                                            className="bg-white border-slate-200 h-11"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {notificationConfig.active_method === 'slack' && (
                                                <div className="space-y-5 animate-in fade-in duration-300">
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="slack_token" className="text-sm font-bold text-slate-700">Bot OAuth Token</Label>
                                                        <Input
                                                            id="slack_token"
                                                            type="password"
                                                            value={notificationConfig.methods.slack.slack_token}
                                                            onChange={(e) => handleConfigChange('slack', 'slack_token', e.target.value)}
                                                            placeholder="xoxb-..."
                                                            required
                                                            className="bg-white border-slate-200 h-11"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="slack_channel" className="text-sm font-bold text-slate-700">Channel ID</Label>
                                                        <Input
                                                            id="slack_channel"
                                                            type="text"
                                                            value={notificationConfig.methods.slack.slack_channel}
                                                            onChange={(e) => handleConfigChange('slack', 'slack_channel', e.target.value)}
                                                            placeholder="C0123456789"
                                                            required
                                                            className="bg-white border-slate-200 h-11"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {notificationConfig.active_method === 'telegram' && (
                                                <div className="space-y-5 animate-in fade-in duration-300">
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="telegram_token" className="text-sm font-bold text-slate-700">Bot Token</Label>
                                                        <Input
                                                            id="telegram_token"
                                                            type="password"
                                                            value={notificationConfig.methods.telegram.telegram_token}
                                                            onChange={(e) => handleConfigChange('telegram', 'telegram_token', e.target.value)}
                                                            placeholder="123456:ABC-..."
                                                            required
                                                            className="bg-white border-slate-200 h-11"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="telegram_chat_id" className="text-sm font-bold text-slate-700">Chat ID</Label>
                                                        <Input
                                                            id="telegram_chat_id"
                                                            type="text"
                                                            value={notificationConfig.methods.telegram.telegram_chat_id}
                                                            onChange={(e) => handleConfigChange('telegram', 'telegram_chat_id', e.target.value)}
                                                            placeholder="123456789"
                                                            required
                                                            className="bg-white border-slate-200 h-11"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {state?.error && (
                                            <div className="flex items-center gap-3 p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 animate-in zoom-in-95 duration-200">
                                                <AlertCircle className="w-5 h-5 shrink-0" />
                                                <p className="text-sm font-bold">{state.error}</p>
                                            </div>
                                        )}
                                        {state?.success && (
                                            <div className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 animate-in zoom-in-95 duration-200">
                                                <CheckCircle2 className="w-5 h-5 shrink-0" />
                                                <p className="text-sm font-bold">{state.message}</p>
                                            </div>
                                        )}
                                    </CardContent>

                                    <CardFooter className="bg-slate-50/50 border-t border-slate-100 p-6 flex justify-end">
                                        <Button
                                            type="submit"
                                            disabled={isPending}
                                            className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 h-11 shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                                        >
                                            {isPending ? (
                                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving Configuration...</>
                                            ) : 'Save Notification Settings'}
                                        </Button>
                                    </CardFooter>
                                </Card>
                            </form>
                        </section>
                    </TabsContent>

                    {/* --- PROJECT TAB --- */}
                    <TabsContent value="project" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <section className="space-y-4 w-full">
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
                                                    className="h-8 text-sm font-medium border-slate-200 p-2 focus-visible:ring-blue-500/20 truncate"
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
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
                                                className="h-9 px-3 border-slate-200 hover:bg-slate-50 text-slate-600 font-bold"
                                            >
                                                <Plus className="w-4 h-4 mr-1.5" />
                                                Add New Label
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <Table>
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
                                                            {/* Removed the `name` attribute so we rely strictly on the hidden JSON input */}
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
                                                className="h-9 px-3 border-slate-200 hover:bg-slate-50 text-slate-600 font-bold"
                                            >
                                                <Plus className="w-4 h-4 mr-1.5" />
                                                Add New Code
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <Table>
                                            <TableHeader className="bg-slate-50/30">
                                                <TableRow className="border-slate-100 hover:bg-transparent">
                                                    <TableHead className="w-[20%] pl-6">Act Name</TableHead>
                                                    <TableHead className="w-[20%]">Code Name</TableHead>
                                                    <TableHead className="w-[30%]">Definition & Context</TableHead>
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
                                    <CardFooter className="bg-slate-50/50 border-t border-slate-100 p-6 flex justify-end">
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
                    </TabsContent>
                </Tabs>
            </div>
        </main>
    )
}