'use client'

import { useState, useActionState } from 'react'
import { updateLabels } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Globe, Calendar, FileText, Tag, Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

export default function ProjectSection({ project, isEditable }) {
    const [labelState, labelAction, labelPending] = useActionState(updateLabels, null)

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

    const handleAddLegalCode = () => setLegalCodes([{ actName: '', codeName: '', description: '', severity: 'low', originalName: '' }, ...legalCodes])

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
