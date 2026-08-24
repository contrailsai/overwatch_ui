'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getAdProfileAds, addAdProfileClientNote, updateAdProfileClientStatus } from './actions'
import {
    ExternalLink, X, Facebook, Instagram, Youtube, CheckCircle,
    User, FileText, Siren, ClockFading, Info, Globe,
    BadgeCheck, TriangleAlert, TrendingDown, Smile, TrendingUp,
    Fingerprint, MessageSquareWarning, Laugh, EyeOff, ShieldX, ShieldQuestion,
    FishingHook, UserRoundX, AlertCircle,
    Send, Loader2, CheckCircle2, AlertTriangle,
    Link2, Hash, ChevronLeft, ChevronRight
} from 'lucide-react'
import { Twitter, Reddit } from '@/utils/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

const PlatformIcon = ({ platform, className }) => {
    const p = platform?.toLowerCase()
    if (p === 'instagram') return <Instagram className={cn('w-3.5 h-3.5 text-pink-500', className)} />
    if (p === 'facebook' || p === 'meta') return <Facebook className={cn('w-3.5 h-3.5 text-blue-600', className)} />
    if (p === 'x') return (
        <span className='w-3.5 h-3.5'>
            <Twitter className={cn('max-w-3.5 max-h-3.5 text-slate-900', className)} />
        </span>
    )
    if (p === 'reddit') return (
        <span className='w-3.5 h-3.5'>
            <Reddit className={cn('max-w-3.5 max-h-3.5', className)} />
        </span>
    )
    if (p === 'youtube') return <Youtube className={cn('w-3.5 h-3.5 text-red-500', className)} />
    return <Globe className={cn('w-3.5 h-3.5 text-slate-400', className)} />
}

const getRiskLabel = (score) => {
    if (score === null || score === undefined) return null
    if (score >= 96) return { label: 'High', color: 'text-rose-600 bg-rose-50 border-rose-200' }
    if (score >= 76) return { label: 'Medium', color: 'text-orange-500 bg-orange-50 border-orange-200' }
    if (score >= 41) return { label: 'Low', color: 'text-amber-500 bg-amber-50 border-amber-200' }
    return { label: 'Safe', color: 'text-slate-500 bg-slate-50 border-slate-200' }
}

const RiskIcon = ({ label }) => {
    if (label === 'High') return <Siren className="w-3 h-3" />
    if (label === 'Medium') return <TriangleAlert className="w-3 h-3" />
    if (label === 'Low') return <TrendingDown className="w-3 h-3" />
    return <Smile className="w-3 h-3" />
}

const getProfileRiskBadge = (risk) => {
    const v = typeof risk === 'string' ? risk.toLowerCase() : risk
    if (v === 'high' || (typeof v === 'number' && v >= 96)) {
        return { label: 'High', className: 'bg-rose-50 text-rose-700 border-rose-200' }
    }
    if (v === 'mid' || v === 'medium' || (typeof v === 'number' && v >= 76)) {
        return { label: 'Medium', className: 'bg-orange-50 text-orange-700 border-orange-200' }
    }
    if (v === 'low' || (typeof v === 'number' && v >= 41)) {
        return { label: 'Low', className: 'bg-amber-50 text-amber-700 border-amber-200' }
    }
    return { label: 'Safe', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
}

const getStatusConfig = (status) => {
    if (status === 'To Be Reviewed' || !status) return { label: 'Pending', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: ClockFading }
    if (status === 'No Action' || status === 'Pass') return { label: 'No Action', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle }
    if (status === 'Flag for Takedown') return { label: 'Takedown', color: 'text-rose-700 bg-rose-50 border-rose-200', icon: Siren }
    return { label: status, color: 'text-slate-600 bg-slate-50 border-slate-200', icon: Info }
}

const VIOLATION_COLOR_MAP = {
    purple: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-50",
    rose: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-50",
    orange: "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-50",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50",
    red: "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
    violet: "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-50",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-50",
    blue: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
    amber: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50",
}

const getLabelConfig = (labelName) => {
    const name = labelName.toLowerCase().replace(/[-_]/g, ' ');
    if (name.includes('scam') || name.includes('fraud')) return { icon: Fingerprint, color: 'rose' };
    if (name.includes('investment')) return { icon: TrendingUp, color: 'emerald' };
    if (name.includes('misinformation') || name.includes('fake')) return { icon: ShieldX, color: 'orange' };
    if (name.includes('hate')) return { icon: MessageSquareWarning, color: 'red' };
    if (name.includes('satire') || name.includes('humor')) return { icon: Laugh, color: 'blue' };
    if (name.includes('nsfw')) return { icon: EyeOff, color: 'indigo' };
    if (name.includes('violence') || name.includes('terrorism')) return { icon: Siren, color: 'red' };
    if (name.includes('asset')) return { icon: ShieldQuestion, color: 'amber' };
    if (name.includes('spam')) return { icon: ShieldX, color: 'blue' };
    if (name.includes('phishing')) return { icon: FishingHook, color: 'indigo' };
    if (name.includes('propaganda')) return { icon: UserRoundX, color: 'red' };
    return { icon: AlertCircle, color: 'amber' };
};

const SafeDate = ({ date }) => {
    const [formatted, setFormatted] = useState(null)
    useEffect(() => {
        if (date) setFormatted(format(new Date(date), 'dd MMM yyyy, HH:mm'))
    }, [date])
    return <span>{formatted || '...'}</span>
}

export default function AdProfileDetailPanel({ profile, project, isOpen, onClose, onUpdate, onNext, onPrev, hasNext, hasPrev }) {
    const [ads, setAds] = useState(null)
    const [loading, setLoading] = useState(false)
    const [localNotes, setLocalNotes] = useState([])
    const [noteText, setNoteText] = useState('')
    const [isSubmittingNote, setIsSubmittingNote] = useState(false)
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
    const [clientStatus, setClientStatus] = useState('To Be Reviewed')
    const [showProcessed, setShowProcessed] = useState("")
    const [isBioExpanded, setIsBioExpanded] = useState(false)

    useEffect(() => {
        if (!isOpen || !profile) return
        let cancelled = false
        setAds(null)
        setLocalNotes(profile.client_notes || [])
        setClientStatus(profile.client_status || 'To Be Reviewed')
        setNoteText('')
        setIsBioExpanded(false)

        const adsCount = profile.ads_count ?? profile.cases_count ?? 0
        if (adsCount === 0) {
            setAds([])
            return
        }
        setShowProcessed("")
        setLoading(true)
        getAdProfileAds(profile._id)
            .then(result => { if (!cancelled) setAds(result) })
            .catch(() => { if (!cancelled) setAds([]) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [isOpen, profile?._id])

    const handleAddNote = async () => {
        if (!noteText.trim() || isSubmittingNote) return
        setIsSubmittingNote(true)
        const res = await addAdProfileClientNote(profile._id, noteText)
        if (res.success) {
            const updatedNotes = [...localNotes, res.note]
            setLocalNotes(updatedNotes)
            setNoteText('')
            if (onUpdate) onUpdate(profile._id, { client_notes: updatedNotes })
        }
        setIsSubmittingNote(false)
    }

    const handleUpdateStatus = async (newStatus) => {
        if (isUpdatingStatus) return
        setIsUpdatingStatus(true)
        const res = await updateAdProfileClientStatus(profile._id, newStatus)
        if (res.success) {
            setClientStatus(newStatus)
            setAds(prev => prev?.map(c => ({ ...c, client_status: newStatus })))
            setShowProcessed(profile._id)
            if (onUpdate) onUpdate(profile._id, { client_status: newStatus })
            setTimeout(() => setShowProcessed(""), 3000)
        }
        setIsUpdatingStatus(false)
    }

    if (!isOpen || !profile) return null

    const review = profile.review_details || {}
    const riskScore = review.risk || 'safe'
    const reasoning = review.reasoning || 'No profile reasoning provided.'
    const violations = review.violations || []

    const highCount = ads?.filter(c => (c.score ?? c.review_details?.threat_score ?? 0) >= 96).length || 0
    const medCount = ads?.filter(c => { const s = c.score ?? c.review_details?.threat_score ?? 0; return s >= 76 && s < 96 }).length || 0
    const lowCount = ads?.filter(c => { const s = c.score ?? c.review_details?.threat_score ?? 0; return s >= 41 && s < 76 }).length || 0

    const displayName = profile.page_name || profile.display_name
    const pageCategories = profile.enrichment?.page_categories || profile.metadata?.page_categories || []
    const pageLikeCount = profile.metadata?.page_like_count ?? profile.enrichment?.page_like_count ?? profile.metadata?.follower_count
    const categoryLabel = profile.metadata?.category || (Array.isArray(pageCategories) ? pageCategories.join(', ') : pageCategories)

    const profileRisk = getProfileRiskBadge(riskScore)
    return (
        <>
            <div
                className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40"
                onClick={onClose}
            />

            <div className="fixed right-0 top-0 h-full w-full md:w-auto bg-white shadow-2xl md:border-l border-slate-200 z-40 flex flex-col md:flex-row animate-in slide-in-from-right duration-300">

                {/* Mobile Header (Navigation & Close) */}
                <div className="md:hidden flex items-center justify-between p-4 border-b border-slate-100 bg-white shrink-0 z-10 shadow-sm relative">
                    <button onClick={onClose} className="flex items-center gap-1.5 text-slate-600 hover:text-slate-800 font-bold text-xs bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 active:scale-95 transition-all">
                        <X className="w-3.5 h-3.5" /> Close
                    </button>
                    <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                        <button onClick={onPrev} disabled={!hasPrev} className="p-1.5 rounded-md text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white hover:shadow-sm transition-all active:scale-95">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="w-px h-4 bg-slate-200 mx-0.5"></div>
                        <button onClick={onNext} disabled={!hasNext} className="p-1.5 rounded-md text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white hover:shadow-sm transition-all active:scale-95">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Content wrapper for responsive scrolling */}
                <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden w-full md:w-auto relative">
                    
                    {/* LEFT: Profile & Ads */}
                    <div className="w-full md:w-[540px] md:h-full flex flex-col md:overflow-hidden border-b md:border-b-0 md:border-r border-slate-100 shrink-0">
                        {/* Profile & Metadata Section */}
                        <div className="px-4 md:px-6 py-5 md:py-6 border-b border-slate-100 bg-white shrink-0 relative">
                            {/* Desktop Close & Nav Buttons */}
                            <div className="hidden md:flex absolute top-4 right-4 items-center gap-2">
                                <div className="flex items-center gap-1 bg-slate-50/50 p-1 rounded-lg border border-slate-200/60 backdrop-blur-sm mr-2">
                                    <button onClick={onPrev} disabled={!hasPrev} className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400 hover:bg-white transition-all">
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <button onClick={onNext} disabled={!hasNext} className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400 hover:bg-white transition-all">
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-1.5 rounded-lg hover:bg-slate-200/50 text-slate-400 hover:text-slate-700 transition-colors bg-white/50 backdrop-blur-sm border border-slate-200/60"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="flex flex-col gap-5">
                                {/* Profile Info Row */}
                                <div className="flex items-start gap-4 pr-0 md:pr-24">
                                <div className="w-16 h-16 rounded-full bg-white shadow-sm ring-1 ring-slate-200/60 flex items-center justify-center shrink-0 overflow-hidden relative">
                                    {profile.metadata?.profile_pic ? (
                                        <img src={profile.metadata.profile_pic} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="w-7 h-7 text-slate-300" />
                                    )}
                                </div>
                                <div className="flex flex-col min-w-0 pt-0.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-lg font-bold text-slate-900 truncate tracking-tight">{displayName}</h2>
                                        {profile.is_verified && (
                                            <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" />
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5 text-sm flex-wrap">
                                        {profile.platform_page_id && (
                                            <span className="font-medium text-slate-500 font-mono text-xs">{profile.platform_page_id}</span>
                                        )}
                                        {profile.platform_page_id && <span className="text-slate-300">•</span>}
                                        <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                                            <PlatformIcon platform={profile.platform} className="w-3.5 h-3.5" />
                                            <span className="capitalize">{profile.platform}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Biography */}
                            {profile.metadata?.biography && (
                                <div className="flex flex-col gap-1 items-start">
                                    <div className={cn(
                                        "text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-medium transition-all",
                                        !isBioExpanded && "line-clamp-3"
                                    )}>
                                        {profile.metadata.biography}
                                    </div>
                                    {(profile.metadata.biography.length > 80 || profile.metadata.biography.includes('\n')) && (
                                        <button
                                            onClick={() => setIsBioExpanded(!isBioExpanded)}
                                            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wider mt-0.5 transition-colors"
                                        >
                                            {isBioExpanded ? 'Show less' : 'Show more'}
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Badges/Tags */}
                            <div className="flex flex-wrap gap-2">
                                {categoryLabel && (
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200/60">
                                        <Hash className="w-3 h-3 text-slate-400" />
                                        {categoryLabel}
                                    </div>
                                )}
                                {pageLikeCount != null && (
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200/60">
                                        <User className="w-3 h-3 text-slate-400" />
                                        {Number(pageLikeCount).toLocaleString()} likes
                                    </div>
                                )}
                                {profile.profile_url && (
                                    <a href={profile.profile_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 text-xs font-semibold transition-colors border border-blue-100">
                                        <Link2 className="w-3 h-3 text-blue-500" />
                                        View Page
                                    </a>
                                )}
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100/80">
                                <div className="flex flex-col">
                                    <span className="text-lg font-bold text-slate-900 tracking-tight">
                                        {pageLikeCount != null ? Number(pageLikeCount).toLocaleString() : '—'}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Likes</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-lg font-bold text-slate-900 tracking-tight">
                                        {(profile.ads_count ?? profile.cases_count ?? 0).toLocaleString()}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Ads</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats */}
                    {ads && ads.length > 0 && (
                        <div className="px-6 py-3 bg-white border-b border-slate-100 flex items-center gap-6 shrink-0">
                            <div className="text-center">
                                <p className="text-lg font-bold text-slate-900">{ads.length}</p>
                                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Ads</p>
                            </div>
                            {highCount > 0 && (
                                <div className="text-center">
                                    <p className="text-lg font-bold text-rose-500">{highCount}</p>
                                    <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">High Risk</p>
                                </div>
                            )}
                            {medCount > 0 && (
                                <div className="text-center">
                                    <p className="text-lg font-bold text-orange-500">{medCount}</p>
                                    <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Medium</p>
                                </div>
                            )}
                            {lowCount > 0 && (
                                <div className="text-center">
                                    <p className="text-lg font-bold text-amber-500">{lowCount}</p>
                                    <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Low</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Ads List */}
                    <div className="flex-1 md:overflow-y-auto">
                        <div className="px-4 md:px-6 py-4">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Associated Ads</h3>
                            {loading && (
                                <div className="space-y-3">
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <div key={i} className="h-16 bg-slate-50 rounded-lg animate-pulse border border-slate-100" />
                                    ))}
                                </div>
                            )}
                            {!loading && ads && ads.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-3 border border-slate-100">
                                        <FileText className="w-6 h-6 opacity-30" />
                                    </div>
                                    <p className="text-sm font-semibold text-slate-600">No ads found</p>
                                </div>
                            )}
                            {!loading && ads && ads.length > 0 && (
                                <div className="space-y-2.5">
                                    {ads.map(c => {
                                        const risk = getRiskLabel(c.score ?? c.review_details?.threat_score)
                                        const statusCfg = getStatusConfig(c.client_status)
                                        const StatusIcon = statusCfg.icon
                                        const adText = c.title || c.caption

                                        let posted_date = ""
                                        if (c.posted_date)
                                            posted_date = format(new Date(c.posted_date), "dd MMM yyyy hh:mm");
                                        else if (c.start_date)
                                            posted_date = format(new Date(c.start_date), "dd MMM yyyy hh:mm");
                                        else if (c.sourcing_date)
                                            posted_date = format(new Date(c.sourcing_date), "dd MMM yyyy hh:mm");

                                        return (
                                            <div key={c._id} className="group flex flex-col gap-2 bg-white border border-slate-100 rounded-xl px-4 py-3 hover:border-slate-200 hover:shadow-sm transition-all">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {risk ? (
                                                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border', risk.color)}>
                                                            <RiskIcon label={risk.label} />
                                                            {risk.label}
                                                        </span>
                                                    ) : (
                                                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border', statusCfg.color)}>
                                                            <StatusIcon className="w-2.5 h-2.5" />
                                                            {statusCfg.label}
                                                        </span>
                                                    )}
                                                    <Badge variant="outline" className="capitalize font-semibold text-slate-500 border-slate-200 gap-1 pl-1.5 h-5 text-[10px]">
                                                        <PlatformIcon platform={c.platform} />
                                                        {c.platform}
                                                    </Badge>
                                                    <div className="ml-auto">
                                                        {c.original_url && (
                                                            <a href={c.original_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline bg-blue-50 px-2 py-0.5 rounded-md">
                                                                Ads Library <ExternalLink className="w-2.5 h-2.5" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex gap-3">
                                                    {c.signedImageUrl && (
                                                        <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-slate-100 bg-slate-50">
                                                            <img src={c.signedImageUrl} alt="" className="w-full h-full object-cover" />
                                                        </div>
                                                    )}
                                                    {adText && (
                                                        <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed flex-1">{adText}</p>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between mt-0.5 pt-2 border-t border-slate-50">
                                                    <div className="flex items-center gap-2">
                                                        {posted_date && (
                                                            <p className="text-[10px] text-slate-400 font-medium">{posted_date}</p>
                                                        )}
                                                        {c.visibility_status === 'down' ? (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-500 uppercase tracking-tighter shadow-sm">Taken Down</span>
                                                        ) : (c.visibility_status === 'active' || c.visibility_status === 'available') ? (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-100 text-emerald-700 uppercase tracking-tighter shadow-sm">Online</span>
                                                        ) : null}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Link
                                                            href={`/ads?ad_id=${c._id}`}
                                                            className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600 hover:text-blue-600 px-2 py-1 rounded-md border border-slate-100"
                                                        >
                                                            View ad
                                                        </Link>
                                                        {c.original_url && (
                                                            <a href={c.original_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600 hover:text-blue-600 px-2 py-1 rounded-md border border-slate-100 group/link">
                                                                Ads Library
                                                                <ExternalLink className="w-2.5 h-2.5 opacity-40 group-hover/link:opacity-100 transition-all" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT: Review Analysis */}
                <div className="w-full md:w-[420px] md:h-full flex flex-col md:overflow-hidden bg-white shrink-0 border-t md:border-t-0 border-slate-100">
                    {/* <div className="px-6 py-4 border-b border-slate-100 bg-white shrink-0">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Review Analysis</h3>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">Reviewed Date: {review.reviewed_at ? format(new Date(review.reviewed_at), 'dd MMM yyyy, HH:mm') : 'N/A'}</p>
                    </div> */}
                    <div className="flex-1 md:overflow-y-auto p-4 sm:p-6 bg-white">
                        {/* Risk Assessment */}
                        <div className="flex items-start justify-between gap-3 py-3 first:pt-0 border-b border-slate-100">
                            <div className="space-y-2">
                                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Profile Risk</h4>
                                <Badge variant="outline" className={cn("text-xs shadow-none font-bold px-3 py-1.5 gap-1.5", profileRisk.className)}>
                                    <RiskIcon label={profileRisk.label} />
                                    {profileRisk.label} Risk
                                </Badge>
                            </div>
                        </div>

                        {/* Reasoning */}
                        <div className="space-y-3 py-3 first:pt-0 border-b border-slate-100">
                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Review Analysis</h4>
                            <div className="w-full text-slate-700 leading-relaxed text-sm font-medium whitespace-pre-wrap">
                                {reasoning}
                            </div>
                        </div>

                        {/* Detected Violations */}
                        <div className="space-y-4 py-3 first:pt-0 border-b border-slate-100">
                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Detected Violations</h4>
                            {violations.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {violations.map((v, idx) => {
                                        const config = getLabelConfig(v);
                                        const colorMap = VIOLATION_COLOR_MAP[config.color] || "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-50";
                                        return (
                                            <Badge key={idx} variant="outline" className={cn("text-xs shadow-none px-3 py-1.5 capitalize font-semibold", colorMap)}>
                                                {v.replace(/[-_]/g, ' ')}
                                            </Badge>
                                        )
                                    })}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-400 italic">No specific violations identified.</p>
                            )}
                        </div>

                        {/* Review Notes Section */}
                        <div className="space-y-4 py-3 first:pt-0">
                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Comments</h4>

                            {localNotes && localNotes.length > 0 && (
                                <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                    {localNotes.map((note, idx) => (
                                        <div key={idx} className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                                            <div className="flex justify-between items-start mb-3">
                                                <span className="text-[10px] font-bold text-slate-400">{note.email || 'Unknown User'}</span>
                                                <span className="text-[10px] text-slate-400">
                                                    <SafeDate date={note.created_at} />
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-700 font-medium whitespace-pre-wrap">
                                                {note.text}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="relative mt-2">
                                <Textarea
                                    placeholder="Comments"
                                    className="min-h-[100px] pr-12 text-sm resize-none bg-white border-slate-200 focus-visible:ring-blue-500"
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleAddNote();
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

                    {showProcessed === profile._id && (
                        <div className="mx-5 mb-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                            <div>
                                <p className="text-sm font-bold text-emerald-800">Advertiser Updated</p>
                                <p className="text-xs text-emerald-700 mt-0.5">The client status has been successfully updated.</p>
                            </div>
                        </div>
                    )}

                    {/* STICKY FOOTER: Actions */}
                    <div className="p-4 md:p-5 border-t border-slate-100 bg-white sticky bottom-0 z-10 space-y-4">
                        <div className="flex gap-3 md:gap-4">
                            <Button
                                onClick={() => { if (clientStatus !== 'No Action' && clientStatus !== 'Pass') handleUpdateStatus('No Action') }}
                                disabled={isUpdatingStatus}
                                className={cn(
                                    "flex-1 h-12 font-bold text-white transition-all duration-200 shadow-emerald-900/20 bg-emerald-500 opacity-50 hover:opacity-100 ",
                                    (clientStatus === 'No Action' || clientStatus === 'Pass') ? "opacity-100 cursor-default hover:bg-emerald-500 ring-2 ring-emerald-600 ring-offset-2" : "cursor-pointer hover:bg-emerald-600",
                                    // (clientStatus !== 'To Be Reviewed' && clientStatus !== 'No Action' && clientStatus !== 'Pass') ? "" : ""
                                )}
                            >
                                {isUpdatingStatus && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                                No Action
                            </Button>
                            <Button
                                onClick={() => { if (clientStatus !== 'Flag for Takedown') handleUpdateStatus('Flag for Takedown') }}
                                disabled={isUpdatingStatus}
                                className={cn(
                                    "flex-1 h-12 font-bold text-white transition-all duration-200 opacity-50 hover:opacity-100 ",
                                    project?.project_details?.do_takedowns ? "shadow-amber-900/20 bg-amber-500" : "shadow-rose-900/20 bg-rose-600",
                                    clientStatus === 'Flag for Takedown'
                                        ? cn("opacity-100 cursor-default ring-2 ring-offset-2", project?.project_details?.do_takedowns ? "hover:bg-amber-500 ring-amber-600" : "hover:bg-rose-600 ring-rose-700")
                                        : cn("cursor-pointer", project?.project_details?.do_takedowns ? "hover:bg-amber-600" : "hover:bg-rose-700"),
                                    // (clientStatus !== 'To Be Reviewed' && clientStatus !== 'Flag for Takedown') ? "" : ""
                                )}
                            >
                                {isUpdatingStatus === 'Flag for Takedown' ?
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    :
                                    <AlertTriangle className="w-4 h-4 mr-2" />}
                                Flag for Takedown
                            </Button>
                        </div>
                    </div>
                </div>

                </div> {/* Closing wrapper div */}
            </div>
        </>
    )
}
