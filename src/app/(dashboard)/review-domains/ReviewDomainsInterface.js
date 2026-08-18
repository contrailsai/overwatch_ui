'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import {
    Globe, Search, X, ExternalLink, Link2, Server, ShieldQuestion,
    Loader2, CheckCircle2, ChevronLeft, ChevronRight, Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getDomainById, submitDomainReview } from './actions'

const CATEGORY_OPTIONS = [
    { value: 'benign', label: 'Benign' },
    { value: 'phishing', label: 'Phishing' },
    { value: 'scam', label: 'Scam' },
    { value: 'malware', label: 'Malware' },
    { value: 'gambling', label: 'Gambling' },
    { value: 'adult', label: 'Adult Content' },
    { value: 'counterfeit', label: 'Counterfeit / Piracy' },
    { value: 'unknown', label: 'Unknown' },
]

const getAnalysisStatusConfig = (status) => {
    const s = status?.toLowerCase()
    if (s === 'completed') return { label: 'Analyzed', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
    if (s === 'running') return { label: 'Analyzing…', color: 'text-blue-700 bg-blue-50 border-blue-200' }
    if (s === 'failed') return { label: 'Analysis Failed', color: 'text-rose-700 bg-rose-50 border-rose-200' }
    return { label: 'Awaiting Analysis', color: 'text-slate-500 bg-slate-50 border-slate-200' }
}

function DomainListItem({ domain, isSelected, onClick }) {
    const analysisCfg = getAnalysisStatusConfig(domain.analysis_status)
    const reviewed = domain.workflow?.review_status === 'reviewed'
    return (
        <button
            onClick={onClick}
            className={cn(
                'w-full text-left px-4 py-3 border-b border-slate-100 transition-colors',
                isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50',
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-mono font-bold text-sm text-slate-800 truncate">{domain.domain_name}</span>
                </div>
                {reviewed ? (
                    <Badge variant="outline" className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border-emerald-200 shrink-0">Reviewed</Badge>
                ) : (
                    <Badge variant="outline" className={cn('text-[10px] font-bold shrink-0', analysisCfg.color)}>{analysisCfg.label}</Badge>
                )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400 font-semibold">
                <span>{domain.occurrence_count ?? 0} occurrences</span>
                {domain.last_seen_at && (
                    <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {format(new Date(domain.last_seen_at), 'dd MMM yyyy')}
                    </span>
                )}
            </div>
        </button>
    )
}

export function ReviewDomainsInterface({ initialDomains, totalPages, currentPage, initialFilters, totalCount, initialDomain, itemsPerPage }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const domainList = initialDomains?.domains || []
    const [searchInput, setSearchInput] = useState(initialFilters.search || '')
    const [selectedDomain, setSelectedDomain] = useState(initialDomain || null)
    const [loadingDomain, setLoadingDomain] = useState(false)

    const [form, setForm] = useState({
        category: 'unknown',
        threat_score: 0,
        threat_types: '',
        reasoning: '',
        reviewer_comments: '',
        is_parked: false,
        is_placeholder: false,
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showSuccess, setShowSuccess] = useState(false)

    useEffect(() => {
        if (!selectedDomain) return
        const review = selectedDomain.review_details || {}
        setForm({
            category: review.category || selectedDomain.category || 'unknown',
            threat_score: review.threat_score ?? selectedDomain.list?.ai_threat_score ?? 0,
            threat_types: (review.threat_types || []).join(', '),
            reasoning: review.reasoning || '',
            reviewer_comments: review.reviewer_comments || '',
            is_parked: Boolean(review.is_parked),
            is_placeholder: Boolean(review.is_placeholder),
        })
    }, [selectedDomain?._id])

    const updateQueryParams = useCallback((newParams) => {
        const params = new URLSearchParams(searchParams.toString())
        Object.entries(newParams).forEach(([key, value]) => {
            if (value === null || value === undefined || value === 'all') params.delete(key)
            else params.set(key, value)
        })
        if (!newParams.page) params.delete('page')
        router.push(`${pathname}?${params.toString()}`)
    }, [router, pathname, searchParams])

    const handleSearchSubmit = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            updateQueryParams({ search: searchInput, page: 1 })
        }
    }

    const handleSelectDomain = async (domain) => {
        setSelectedDomain(domain)
        updateQueryParams({ domain_id: domain._id })
        setLoadingDomain(true)
        const fresh = await getDomainById(domain._id)
        if (fresh) setSelectedDomain(fresh)
        setLoadingDomain(false)
    }

    const handleSubmitReview = async () => {
        if (!selectedDomain || isSubmitting) return
        setIsSubmitting(true)
        const res = await submitDomainReview(selectedDomain._id, {
            category: form.category,
            threat_score: Number(form.threat_score) || 0,
            threat_types: form.threat_types.split(',').map((s) => s.trim()).filter(Boolean),
            reasoning: form.reasoning,
            reviewer_comments: form.reviewer_comments,
            is_parked: form.is_parked,
            is_placeholder: form.is_placeholder,
        })
        if (res.success) {
            setSelectedDomain(res.domain)
            setShowSuccess(true)
            setTimeout(() => setShowSuccess(false), 3000)
            router.refresh()
        }
        setIsSubmitting(false)
    }

    const handlePageChange = (newPage) => newPage >= 1 && newPage <= totalPages && updateQueryParams({ page: newPage })

    const analysisResultsKeys = Object.keys(selectedDomain?.analysis_results || {})
    const hasAnalysisResults = analysisResultsKeys.length > 0

    return (
        <div className="flex h-full bg-slate-50">
            {/* LEFT: Queue */}
            <div className="w-full md:w-[360px] h-full flex flex-col border-r border-slate-200 bg-white shrink-0">
                <div className="p-3 border-b border-slate-100 space-y-2">
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-black text-slate-800 tracking-tight">{totalCount}</span>
                        <span className="text-[11px] font-bold text-slate-500">domains in queue</span>
                    </div>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-slate-400" />
                        </div>
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={handleSearchSubmit}
                            placeholder="Search by domain name..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-md pl-9 pr-8 h-9 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400 placeholder:font-normal"
                        />
                        {searchInput && (
                            <button onClick={() => { setSearchInput(''); updateQueryParams({ search: '', page: 1 }) }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-100 text-slate-400">
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    <div className="flex gap-1.5">
                        {['pending', 'reviewed', 'all'].map((s) => (
                            <button
                                key={s}
                                onClick={() => updateQueryParams({ status: s, page: 1 })}
                                className={cn(
                                    'px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors',
                                    initialFilters.status === s ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                                )}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {domainList.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400 px-4 text-center">
                            <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-3 border border-slate-100">
                                <Globe className="w-6 h-6 opacity-30" />
                            </div>
                            <p className="text-sm font-semibold text-slate-600">No domains in this queue</p>
                            <p className="text-xs text-slate-400 mt-1">
                                Domains show up here once discovered — analysis and review flow in once the analyzer service is wired up.
                            </p>
                        </div>
                    ) : (
                        domainList.map((domain) => (
                            <DomainListItem
                                key={domain._id}
                                domain={domain}
                                isSelected={selectedDomain?._id === domain._id}
                                onClick={() => handleSelectDomain(domain)}
                            />
                        ))
                    )}
                </div>

                {totalPages > 1 && (
                    <div className="p-2 border-t border-slate-100 flex items-center justify-between shrink-0">
                        <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="h-8 px-2 text-xs">
                            <ChevronLeft className="w-3.5 h-3.5" />
                        </Button>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Page {currentPage} / {totalPages}</span>
                        <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="h-8 px-2 text-xs">
                            <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                )}
            </div>

            {/* RIGHT: Detail + review form */}
            <div className="hidden md:flex flex-1 flex-col overflow-hidden">
                {!selectedDomain ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <Globe className="w-10 h-10 opacity-20 mb-3" />
                        <p className="text-sm font-semibold text-slate-500">Select a domain from the queue to review</p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900 font-mono tracking-tight">{selectedDomain.domain_name}</h2>
                                    <a
                                        href={`https://${selectedDomain.domain_name}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline mt-1"
                                    >
                                        Visit site <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                </div>
                                <Badge variant="outline" className={cn('text-xs font-bold shrink-0', getAnalysisStatusConfig(selectedDomain.analysis_status).color)}>
                                    <ShieldQuestion className="w-3.5 h-3.5 mr-1.5" />
                                    {getAnalysisStatusConfig(selectedDomain.analysis_status).label}
                                </Badge>
                            </div>

                            {loadingDomain && (
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading latest data…
                                </div>
                            )}

                            {/* Discovery */}
                            <div className="bg-white border border-slate-200 rounded-xl p-4">
                                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Discovery</h4>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div><span className="text-slate-400">First seen from:</span> <span className="font-semibold text-slate-700">{selectedDomain.discovery?.first_entity_type || '—'}</span></div>
                                    <div><span className="text-slate-400">Occurrences:</span> <span className="font-semibold text-slate-700">{selectedDomain.occurrence_count ?? 0}</span></div>
                                </div>
                                {selectedDomain.discovery?.first_seen_url && (
                                    <a href={selectedDomain.discovery.first_seen_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline mt-2 break-all">
                                        <Link2 className="w-3 h-3 shrink-0" /> {selectedDomain.discovery.first_seen_url}
                                    </a>
                                )}
                            </div>

                            {/* Analyzer findings */}
                            <div className="bg-white border border-slate-200 rounded-xl p-4">
                                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                    <Server className="w-3.5 h-3.5" /> Analyzer Findings
                                </h4>
                                {hasAnalysisResults ? (
                                    <pre className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-[10px] text-slate-600 overflow-x-auto max-h-52 custom-scrollbar">
                                        {JSON.stringify(selectedDomain.analysis_results, null, 2)}
                                    </pre>
                                ) : (
                                    <p className="text-xs text-slate-400 italic">
                                        No analyzer results yet — review manually and revisit once analysis completes.
                                    </p>
                                )}
                            </div>

                            {/* Review form */}
                            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
                                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Reviewer Verdict</h4>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] uppercase font-bold text-slate-400">Category</Label>
                                        <Select value={form.category} onValueChange={(val) => setForm((f) => ({ ...f, category: val }))}>
                                            <SelectTrigger className="h-9 w-full bg-white border-slate-200 text-xs font-semibold">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {CATEGORY_OPTIONS.map((opt) => (
                                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] uppercase font-bold text-slate-400">Threat Score (0-100)</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={form.threat_score}
                                            onChange={(e) => setForm((f) => ({ ...f, threat_score: e.target.value }))}
                                            className="h-9 text-xs font-semibold"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-slate-400">Threat Types (comma separated)</Label>
                                    <Input
                                        value={form.threat_types}
                                        onChange={(e) => setForm((f) => ({ ...f, threat_types: e.target.value }))}
                                        placeholder="phishing, brand_impersonation"
                                        className="h-9 text-xs font-semibold"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-slate-400">Reasoning</Label>
                                    <Textarea
                                        value={form.reasoning}
                                        onChange={(e) => setForm((f) => ({ ...f, reasoning: e.target.value }))}
                                        placeholder="Why is this domain classified this way?"
                                        className="min-h-[80px] text-sm resize-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-[10px] uppercase font-bold text-slate-400">Reviewer Comments</Label>
                                    <Textarea
                                        value={form.reviewer_comments}
                                        onChange={(e) => setForm((f) => ({ ...f, reviewer_comments: e.target.value }))}
                                        placeholder="Internal notes"
                                        className="min-h-[60px] text-sm resize-none"
                                    />
                                </div>

                                {showSuccess && (
                                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                        <p className="text-xs font-bold text-emerald-800">Review submitted</p>
                                    </div>
                                )}

                                <Button
                                    onClick={handleSubmitReview}
                                    disabled={isSubmitting}
                                    className="w-full h-11 font-bold bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                                    Submit Review
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
