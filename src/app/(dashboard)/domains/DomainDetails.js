'use client'

import { useState, useEffect } from 'react'
import { addDomainClientNote, updateDomainClientStatus } from './actions'
import {
    ExternalLink, X, Globe, CheckCircle, ClockFading, Info, Siren,
    TriangleAlert, TrendingDown, Smile, Send, Loader2, CheckCircle2,
    AlertTriangle, ChevronLeft, ChevronRight, Link2, Server, ShieldQuestion,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

const getRiskBadge = (risk) => {
    const v = typeof risk === 'string' ? risk.toLowerCase() : risk
    if (v === 'high') return { label: 'High', className: 'bg-rose-50 text-rose-700 border-rose-200', icon: Siren }
    if (v === 'mid' || v === 'medium') return { label: 'Medium', className: 'bg-orange-50 text-orange-700 border-orange-200', icon: TriangleAlert }
    if (v === 'low') return { label: 'Low', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: TrendingDown }
    return { label: 'Safe', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Smile }
}

const getStatusConfig = (status) => {
    if (status === 'To Be Reviewed' || !status) return { label: 'To Be Reviewed', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: ClockFading }
    if (status === 'No Action' || status === 'Pass') return { label: 'No Action', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle }
    if (status === 'Flag for Takedown') return { label: 'Flag for Takedown', color: 'text-rose-700 bg-rose-50 border-rose-200', icon: Siren }
    return { label: status, color: 'text-slate-600 bg-slate-50 border-slate-200', icon: Info }
}

const getAnalysisStatusConfig = (status) => {
    const s = status?.toLowerCase()
    if (s === 'completed') return { label: 'Analyzed', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
    if (s === 'running') return { label: 'Analyzing…', color: 'text-blue-700 bg-blue-50 border-blue-200' }
    if (s === 'failed') return { label: 'Analysis Failed', color: 'text-rose-700 bg-rose-50 border-rose-200' }
    return { label: 'Awaiting Analysis', color: 'text-slate-500 bg-slate-50 border-slate-200' }
}

const SafeDate = ({ date, fmt = 'dd MMM yyyy, HH:mm' }) => {
    const [formatted, setFormatted] = useState(null)
    useEffect(() => {
        if (date) setFormatted(format(new Date(date), fmt))
    }, [date, fmt])
    return <span>{formatted || (date ? '...' : '—')}</span>
}

function InfoRow({ label, value }) {
    if (value == null || value === '') return null
    return (
        <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
            <span className="text-xs font-semibold text-slate-700 truncate max-w-[220px]">{value}</span>
        </div>
    )
}

export default function DomainDetailPanel({ domain, project, isOpen, onClose, onUpdate, onNext, onPrev, hasNext, hasPrev }) {
    const [localNotes, setLocalNotes] = useState([])
    const [noteText, setNoteText] = useState('')
    const [isSubmittingNote, setIsSubmittingNote] = useState(false)
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
    const [clientStatus, setClientStatus] = useState('To Be Reviewed')
    const [showProcessed, setShowProcessed] = useState(false)

    useEffect(() => {
        if (!isOpen || !domain) return
        setLocalNotes(domain.client_notes || [])
        setClientStatus(domain.client_status || 'To Be Reviewed')
        setNoteText('')
    }, [isOpen, domain?._id])

    if (!isOpen || !domain) return null

    const handleAddNote = async () => {
        if (!noteText.trim() || isSubmittingNote) return
        setIsSubmittingNote(true)
        const res = await addDomainClientNote(domain._id, noteText)
        if (res.success) {
            const updatedNotes = [...localNotes, res.note]
            setLocalNotes(updatedNotes)
            setNoteText('')
            onUpdate?.(domain._id, { client_notes: updatedNotes })
        }
        setIsSubmittingNote(false)
    }

    const handleUpdateStatus = async (newStatus) => {
        if (isUpdatingStatus) return
        setIsUpdatingStatus(true)
        const res = await updateDomainClientStatus(domain._id, newStatus)
        if (res.success) {
            setClientStatus(newStatus)
            onUpdate?.(domain._id, { client_status: newStatus })
            setShowProcessed(true)
            setTimeout(() => setShowProcessed(false), 3000)
        }
        setIsUpdatingStatus(false)
    }

    const list = domain.list || {}
    const review = domain.review_details || {}
    const risk = getRiskBadge(list.risk_rank || review.category)
    const RiskIcon = risk.icon
    const analysisStatusCfg = getAnalysisStatusConfig(domain.analysis_status)
    const analysisResultsKeys = Object.keys(domain.analysis_results || {})
    const hasAnalysisResults = analysisResultsKeys.length > 0
    const statusCfg = getStatusConfig(clientStatus)
    const StatusIcon = statusCfg.icon

    return (
        <>
            <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40" onClick={onClose} />

            <div className="fixed right-0 top-0 h-full w-full md:w-[560px] bg-white shadow-2xl md:border-l border-slate-200 z-40 flex flex-col animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="px-5 md:px-6 py-4 border-b border-slate-100 bg-white shrink-0 relative">
                    <div className="flex items-center gap-2 absolute top-4 right-4">
                        <div className="flex items-center gap-1 bg-slate-50/50 p-1 rounded-lg border border-slate-200/60">
                            <button onClick={onPrev} disabled={!hasPrev} className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400 hover:bg-white transition-all">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button onClick={onNext} disabled={!hasNext} className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400 hover:bg-white transition-all">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors border border-slate-200/60">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-start gap-3 pr-20">
                        <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                            <Globe className="w-5 h-5 text-slate-400" />
                        </div>
                        <div className="flex flex-col min-w-0 pt-0.5">
                            <h2 className="text-base font-bold text-slate-900 truncate tracking-tight font-mono">{domain.domain_name}</h2>
                            <a
                                href={`https://${domain.domain_name}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline mt-0.5"
                            >
                                Visit site <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-4">
                        <Badge variant="outline" className={cn('rounded-md font-bold border gap-1.5 pl-2 h-7 text-xs', risk.className)}>
                            <RiskIcon className="w-3.5 h-3.5" />
                            {risk.label} Risk
                        </Badge>
                        <Badge variant="outline" className={cn('rounded-md capitalize font-bold border gap-1.5 pl-2 h-7 text-xs', statusCfg.color)}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            {statusCfg.label}
                        </Badge>
                        <Badge variant="outline" className={cn('rounded-md font-bold border gap-1.5 pl-2 h-7 text-xs', analysisStatusCfg.color)}>
                            <ShieldQuestion className="w-3.5 h-3.5" />
                            {analysisStatusCfg.label}
                        </Badge>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Discovery */}
                    <div className="px-5 md:px-6 py-4 border-b border-slate-100">
                        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Discovery</h4>
                        <InfoRow label="First seen from" value={domain.discovery?.first_entity_type} />
                        <InfoRow label="First seen" value={<SafeDate date={domain.first_seen_at} fmt="dd MMM yyyy" />} />
                        <InfoRow label="Last seen" value={<SafeDate date={domain.last_seen_at} fmt="dd MMM yyyy" />} />
                        <InfoRow label="Occurrences" value={domain.occurrence_count} />
                        {domain.discovery?.first_seen_url && (
                            <a
                                href={domain.discovery.first_seen_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline mt-2 break-all"
                            >
                                <Link2 className="w-3 h-3 shrink-0" /> {domain.discovery.first_seen_url}
                            </a>
                        )}
                    </div>

                    {/* Analyzer findings */}
                    <div className="px-5 md:px-6 py-4 border-b border-slate-100">
                        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <Server className="w-3.5 h-3.5" /> Analyzer Findings
                        </h4>
                        <InfoRow label="Category" value={domain.category} />
                        <InfoRow label="Registrar" value={list.registrar} />
                        <InfoRow label="Hosting" value={list.hosting_provider} />
                        <InfoRow label="Hosting Country" value={list.hosting_country} />
                        <InfoRow label="Reachable" value={list.is_reachable == null ? null : (list.is_reachable ? 'Yes' : 'No')} />
                        <InfoRow label="SSL Valid" value={list.ssl_valid == null ? null : (list.ssl_valid ? 'Yes' : 'No')} />
                        <InfoRow label="Last analyzed" value={domain.last_analyzed_at ? <SafeDate date={domain.last_analyzed_at} /> : null} />

                        {hasAnalysisResults ? (
                            <pre className="mt-3 bg-slate-50 border border-slate-100 rounded-lg p-3 text-[10px] text-slate-600 overflow-x-auto max-h-52 custom-scrollbar">
                                {JSON.stringify(domain.analysis_results, null, 2)}
                            </pre>
                        ) : (
                            <p className="text-xs text-slate-400 italic mt-2">
                                No analyzer results yet — this domain is awaiting analysis.
                            </p>
                        )}
                    </div>

                    {/* Review details */}
                    {(review.reasoning || review.threat_score != null || (review.threat_types || []).length > 0) && (
                        <div className="px-5 md:px-6 py-4 border-b border-slate-100">
                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Reviewer Verdict</h4>
                            {review.reasoning && (
                                <p className="text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap mb-2">{review.reasoning}</p>
                            )}
                            {(review.threat_types || []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {review.threat_types.map((t, idx) => (
                                        <Badge key={idx} variant="outline" className="text-[10px] font-semibold capitalize border-slate-200 text-slate-600">
                                            {String(t).replace(/[-_]/g, ' ')}
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Notes */}
                    <div className="px-5 md:px-6 py-4">
                        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">Comments</h4>

                        {localNotes.length > 0 && (
                            <div className="space-y-3 max-h-52 overflow-y-auto pr-1 custom-scrollbar mb-3">
                                {localNotes.map((note, idx) => (
                                    <div key={idx} className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-[10px] font-bold text-slate-400">{note.email || 'Unknown User'}</span>
                                            <span className="text-[10px] text-slate-400"><SafeDate date={note.created_at} /></span>
                                        </div>
                                        <p className="text-sm text-slate-700 font-medium whitespace-pre-wrap">{note.text}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="relative">
                            <Textarea
                                placeholder="Add a comment"
                                className="min-h-[90px] pr-12 text-sm resize-none bg-white border-slate-200 focus-visible:ring-blue-500"
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handleAddNote()
                                    }
                                }}
                            />
                            <Button
                                size="icon"
                                variant="ghost"
                                className="absolute cursor-pointer bottom-2 right-2 h-8 w-8 hover:text-blue-600 bg-white transition-colors duration-200 disabled:opacity-50"
                                onClick={handleAddNote}
                                disabled={!noteText.trim() || isSubmittingNote}
                            >
                                {isSubmittingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                </div>

                {showProcessed && (
                    <div className="mx-5 mb-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-emerald-800">Domain Updated</p>
                            <p className="text-xs text-emerald-700 mt-0.5">The client status has been successfully updated.</p>
                        </div>
                    </div>
                )}

                <div className="p-4 md:p-5 border-t border-slate-100 bg-white shrink-0 flex gap-3">
                    <Button
                        onClick={() => { if (clientStatus !== 'No Action' && clientStatus !== 'Pass') handleUpdateStatus('No Action') }}
                        disabled={isUpdatingStatus}
                        className={cn(
                            'flex-1 h-11 font-bold text-white transition-all duration-200 bg-emerald-500 opacity-50 hover:opacity-100',
                            (clientStatus === 'No Action' || clientStatus === 'Pass') ? 'opacity-100 cursor-default hover:bg-emerald-500 ring-2 ring-emerald-600 ring-offset-2' : 'cursor-pointer hover:bg-emerald-600',
                        )}
                    >
                        {isUpdatingStatus && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        No Action
                    </Button>
                    <Button
                        onClick={() => { if (clientStatus !== 'Flag for Takedown') handleUpdateStatus('Flag for Takedown') }}
                        disabled={isUpdatingStatus}
                        className={cn(
                            'flex-1 h-11 font-bold text-white transition-all duration-200 opacity-50 hover:opacity-100',
                            project?.project_details?.do_takedowns ? 'bg-amber-500' : 'bg-rose-600',
                            clientStatus === 'Flag for Takedown'
                                ? cn('opacity-100 cursor-default ring-2 ring-offset-2', project?.project_details?.do_takedowns ? 'hover:bg-amber-500 ring-amber-600' : 'hover:bg-rose-600 ring-rose-700')
                                : cn('cursor-pointer', project?.project_details?.do_takedowns ? 'hover:bg-amber-600' : 'hover:bg-rose-700'),
                        )}
                    >
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Flag for Takedown
                    </Button>
                </div>
            </div>
        </>
    )
}
