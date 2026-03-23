'use client'

import { useState, useEffect } from 'react'
import { getProfileCases, addProfileClientNote, updateProfileClientStatus } from './actions'
import { ProfileExportButton } from '@/components/pdf/ProfileExportButton'
import { ProfileExportDocxButton } from '@/components/docx/ProfileExportDocxButton'
import {
    ExternalLink, X, Facebook, Instagram, Youtube, CheckCircle,
    User, ArrowRight, FileText, Siren, ClockFading, Info, Globe,
    BadgeCheck, ShieldAlert, TriangleAlert, TrendingDown, Smile,
    Fingerprint, MessageSquareWarning, Laugh, EyeOff, ShieldX, ShieldQuestion,
    FishingHook, UserRoundX, AlertCircle, Eye,
    MessageCircle, Send, Loader2, CheckCircle2, Download, AlertTriangle,
    MapPin, Calendar, Link2, Hash
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
    if (p === 'facebook') return <Facebook className={cn('w-3.5 h-3.5 text-blue-600', className)} />
    if (p === 'x') return (
        <span className='w-3.5 h-3.5'>
            <Twitter className={cn('max-w-3.5 max-h-3.5 text-slate-900', className)} />
        </span>
    )
    if (p === 'reddit') return (
        <span className='w-3.5 h-3.5'>
            <Reddit className={cn('max-w-3.5 max-h-3.5 text-slate-900', className)} />
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

const getStatusConfig = (status) => {
    if (status === 'To Be Reviewed' || !status) return { label: 'Pending', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: ClockFading }
    if (status === 'No Action' || status === 'Pass') return { label: 'No Action', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle }
    if (status === 'Flag for Takedown') return { label: 'Takedown', color: 'text-rose-700 bg-rose-50 border-rose-200', icon: Siren }
    return { label: status, color: 'text-slate-600 bg-slate-50 border-slate-200', icon: Info }
}

function SignalCard({ active, title, icon: Icon, color }) {
    if (!active) return null;

    const colorStyles = {
        purple: "bg-purple-50/50 border-purple-100/50 text-purple-700",
        rose: "bg-rose-50/50 border-rose-100/50 text-rose-700",
        orange: "bg-orange-50/50 border-orange-100/50 text-orange-700",
        indigo: "bg-indigo-50/50 border-indigo-100/50 text-indigo-700",
        red: "bg-red-50/50 border-red-100/50 text-red-700",
        violet: "bg-violet-50/50 border-violet-100/50 text-violet-700",
        yellow: "bg-yellow-50/50 border-yellow-100/50 text-yellow-700",
        blue: "bg-blue-50/50 border-blue-100/50 text-blue-700",
        emerald: "bg-emerald-50/50 border-emerald-100/50 text-emerald-700",
        amber: "bg-amber-50/50 border-amber-100/50 text-amber-700",
    }[color] || "bg-slate-50 border-slate-100 text-slate-700";

    const iconBg = {
        purple: "bg-purple-100 text-purple-600",
        rose: "bg-rose-100 text-rose-600",
        orange: "bg-orange-100 text-orange-600",
        indigo: "bg-indigo-100 text-indigo-600",
        red: "bg-red-100 text-red-600",
        violet: "bg-violet-100 text-violet-600",
        yellow: "bg-yellow-100 text-yellow-600",
        blue: "bg-blue-100 text-blue-600",
        emerald: "bg-emerald-100 text-emerald-600",
        amber: "bg-amber-100 text-amber-600",
    }[color] || "bg-slate-100 text-slate-600";

    return (
        <div className={cn(
            "group relative flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 hover:shadow-md hover:scale-[1.02]",
            colorStyles
        )}>
            <div className={cn("shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-transform group-hover:rotate-6", iconBg)}>
                <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
                <span className="text-xs font-bold truncate block">{title}</span>
            </div>
        </div>
    )
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

export default function ProfileDetailPanel({ profile, project, isOpen, onClose, onUpdate }) {
    const [cases, setCases] = useState(null)
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
        setCases(null)
        setLocalNotes(profile.client_notes || [])
        setClientStatus(profile.client_status || 'To Be Reviewed')
        setNoteText('')
        setIsBioExpanded(false)

        if (profile.posts.length === 0) {
            setCases([])
            return
        }
        setShowProcessed("")
        setLoading(true)
        getProfileCases(project, profile.posts)
            .then(result => { if (!cancelled) setCases(result) })
            .catch(() => { if (!cancelled) setCases([]) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [isOpen, profile?._id, project])

    const handleAddNote = async () => {
        if (!noteText.trim() || isSubmittingNote) return
        setIsSubmittingNote(true)
        const res = await addProfileClientNote(project, profile._id, noteText)
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
        const res = await updateProfileClientStatus(project, profile._id, newStatus)
        if (res.success) {
            setClientStatus(newStatus)
            setCases(prev => prev?.map(c => ({ ...c, client_status: newStatus })))
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

    const highCount = cases?.filter(c => (c.threat_score ?? 0) >= 96).length || 0
    const medCount = cases?.filter(c => { const s = c.threat_score ?? 0; return s >= 76 && s < 96 }).length || 0
    const lowCount = cases?.filter(c => { const s = c.threat_score ?? 0; return s >= 41 && s < 76 }).length || 0

    const getRiskStyles = (riskValue) => {
        const val = typeof riskValue === 'string' ? riskValue.toLowerCase() : riskValue;
        if (val === 'high' || val >= 96) return "bg-rose-500 border-rose-400 text-white";
        if (val === 'mid' || val === 'medium' || (val >= 76 && val < 96)) return "bg-orange-500 border-orange-400 text-white";
        if (val === 'low' || (val >= 41 && val < 76)) return "bg-amber-500 border-amber-400 text-white";
        return "bg-emerald-500 border-emerald-400 text-white shadow-sm";
    }

    return (
        <>
            <div
                className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40"
                onClick={onClose}
            />

            <div className="fixed right-0 top-0 h-full bg-white shadow-2xl border-l border-slate-200 z-40 flex flex-row animate-in slide-in-from-right duration-300">

                {/* LEFT: Profile & Cases */}
                <div className="w-[540px] h-full flex flex-col overflow-hidden border-r border-slate-100">
                    {/* Profile & Metadata Section */}
                    <div className="px-6 py-6 border-b border-slate-100 bg-linear-to-b from-slate-50/80 to-white shrink-0 relative">
                        {/* Close Button */}
                        <div className="absolute top-4 right-4">
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-lg hover:bg-slate-200/50 text-slate-400 hover:text-slate-700 transition-colors bg-white/50 backdrop-blur-sm"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex flex-col gap-5">
                            {/* Profile Info Row */}
                            <div className="flex items-start gap-4 pr-8">
                                <div className="w-16 h-16 rounded-full bg-white shadow-sm ring-1 ring-slate-200/60 flex items-center justify-center shrink-0 overflow-hidden relative">
                                    {profile.metadata?.profile_pic ? (
                                        <img src={profile.metadata.profile_pic} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="w-7 h-7 text-slate-300" />
                                    )}
                                </div>
                                <div className="flex flex-col min-w-0 pt-0.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-lg font-bold text-slate-900 truncate tracking-tight">{profile.display_name}</h2>
                                        {profile.is_verified && (
                                            <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" />
                                        )}
                                        {profile.metadata?.is_business && (
                                            <Badge variant="secondary" className="h-5 px-1.5 text-[9px] font-bold bg-slate-800 text-white hover:bg-slate-700 border-none uppercase tracking-wider">
                                                Business
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5 text-sm">
                                        {profile.username && (
                                            <span className="font-medium text-slate-500">@{profile.username}</span>
                                        )}
                                        {profile.username && <span className="text-slate-300">•</span>}
                                        <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                                            <PlatformIcon platform={profile.platform} className="w-3.5 h-3.5" />
                                            <span className="capitalize">
                                                {profile.platform === 'x' ? 'Twitter/X' : profile.platform}
                                            </span>
                                        </div>
                                    </div>

                                    {(profile.metadata?.full_name && profile.metadata.full_name !== profile.display_name) && (
                                        <span className="text-xs text-slate-400 mt-0.5">
                                            {profile.metadata.full_name}
                                        </span>
                                    )}
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
                                {profile.metadata?.location && (
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200/60">
                                        <MapPin className="w-3 h-3 text-slate-400" />
                                        {profile.metadata.location}
                                    </div>
                                )}
                                {profile.metadata?.category && (
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200/60">
                                        <Hash className="w-3 h-3 text-slate-400" />
                                        {profile.metadata.category}
                                    </div>
                                )}
                                {profile.metadata?.account_creation_date && (
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200/60">
                                        <Calendar className="w-3 h-3 text-slate-400" />
                                        Joined {format(new Date(profile.metadata.account_creation_date), 'MMM yyyy')}
                                    </div>
                                )}
                                {profile.profile_url && (
                                    <a href={profile.profile_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 text-xs font-semibold transition-colors border border-blue-100">
                                        <Link2 className="w-3 h-3 text-blue-500" />
                                        View Profile
                                    </a>
                                )}
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100/80">
                                <div className="flex flex-col">
                                    <span className="text-lg font-bold text-slate-900 tracking-tight">
                                        {profile.metadata?.follower_count?.toLocaleString() || 0}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Followers</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-lg font-bold text-slate-900 tracking-tight">
                                        {profile.metadata?.following_count?.toLocaleString() || 0}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Following</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-lg font-bold text-slate-900 tracking-tight">
                                        {profile.metadata?.media_count?.toLocaleString() || profile.posts?.length || 0}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Posts</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats */}
                    {cases && cases.length > 0 && (
                        <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-6 shrink-0">
                            <div className="text-center">
                                <p className="text-lg font-bold text-slate-900">{cases.length}</p>
                                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Cases</p>
                            </div>
                            {highCount > 0 && (
                                <div className="text-center">
                                    <p className="text-lg font-bold text-rose-600">{highCount}</p>
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

                    {/* Cases List */}
                    <div className="flex-1 overflow-y-auto">
                        <div className="px-6 py-4">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Associated Cases</h3>
                            {loading && (
                                <div className="space-y-3">
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <div key={i} className="h-16 bg-slate-50 rounded-lg animate-pulse border border-slate-100" />
                                    ))}
                                </div>
                            )}
                            {!loading && cases && cases.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-3 border border-slate-100">
                                        <FileText className="w-6 h-6 opacity-30" />
                                    </div>
                                    <p className="text-sm font-semibold text-slate-600">No cases found</p>
                                </div>
                            )}
                            {!loading && cases && cases.length > 0 && (
                                <div className="space-y-2.5">
                                    {cases.map(c => {
                                        const risk = getRiskLabel(c.threat_score)
                                        const statusCfg = getStatusConfig(c.client_status)
                                        const StatusIcon = statusCfg.icon
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
                                                                Source <ExternalLink className="w-2.5 h-2.5" />
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
                                                    {c.caption && (
                                                        <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed flex-1">{c.caption}</p>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between mt-0.5 pt-2 border-t border-slate-50">
                                                    {c.created_at && (
                                                        <p className="text-[10px] text-slate-400 font-medium">{format(new Date(c.created_at), 'dd MMM yyyy')}</p>
                                                    )}
                                                    <a href={`/cases/${c._id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600 hover:text-blue-600 px-2 py-1 rounded-md border border-slate-100 group/link">
                                                        Inspect Case
                                                        <ArrowRight className="w-2.5 h-2.5 opacity-40 group-hover/link:opacity-100 group-hover/link:translate-x-0.5 transition-all" />
                                                    </a>
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
                <div className="w-[420px] h-full flex flex-col overflow-hidden bg-slate-50">
                    {/* <div className="px-6 py-4 border-b border-slate-100 bg-white shrink-0">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Review Analysis</h3>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">Reviewed Date: {review.reviewed_at ? format(new Date(review.reviewed_at), 'dd MMM yyyy, HH:mm') : 'N/A'}</p>
                    </div> */}

                    <div className="flex-1 overflow-y-auto py-5 px-3 space-y-8 bg-white">
                        {/* Risk Assessment */}
                        <div>
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Risk Assessment</h4>
                            <div className={cn(
                                "rounded-2xl p-5 border relative overflow-hidden shadow-lg transition-all flex justify-between items-center",
                                getRiskStyles(riskScore)
                            )}>
                                <div>
                                    <p className="text-white/80 font-bold text-[10px] uppercase tracking-wide mb-0.5">Profile Risk</p>
                                    <p className="text-5xl font-black tracking-tighter ">{riskScore}</p>
                                </div>
                                <div className="bg-white/20 p-3 rounded-xl backdrop-blur-md">
                                    <ShieldAlert className="w-6 h-6 text-white" />
                                </div>
                            </div>
                        </div>

                        {/* Signals/Violations */}
                        <div>
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Detected Violations</h4>
                            {violations.length > 0 ? (
                                <div className="grid grid-cols-1 gap-2.5">
                                    {violations.map((v, idx) => {
                                        const config = getLabelConfig(v);
                                        return (
                                            <SignalCard key={idx} active={true} title={v.replace(/[-_]/g, ' ').toUpperCase()} icon={config.icon} color={config.color} />
                                        )
                                    })}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-400 italic">No specific violations identified.</p>
                            )}
                        </div>

                        {/* Reasoning */}
                        <div className="space-y-3">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Eye className="w-3.5 h-3.5" /> Review Analysis
                            </h4>
                            <div className="w-full bg-white p-5 rounded-xl border border-slate-100 text-slate-600 leading-relaxed text-sm font-medium whitespace-pre-wrap shadow-sm">
                                {reasoning}
                            </div>
                        </div>

                        {/* Review Notes Section */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center">
                                <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Review Notes
                            </h4>

                            {localNotes && localNotes.length > 0 ? (
                                <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                    {localNotes.map((note, idx) => (
                                        <div key={idx} className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{note.email || 'User'}</span>
                                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                                                    <SafeDate date={note.created_at} />
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-700 font-medium whitespace-pre-wrap leading-relaxed">
                                                {note.text}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-400 italic px-1">No notes added yet.</p>
                            )}

                            <div className="relative mt-2">
                                <Textarea
                                    placeholder="Add a note..."
                                    className="min-h-[100px] pr-12 text-sm resize-none bg-white border-slate-200 focus-visible:ring-blue-500 rounded-xl shadow-xs"
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
                                    className="absolute cursor-pointer bottom-3 right-3 h-8 w-8 hover:text-blue-600 bg-white transition-colors duration-200 disabled:opacity-50 border border-slate-100 rounded-lg shadow-sm"
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
                                <p className="text-sm font-bold text-emerald-800">Profile Updated</p>
                                <p className="text-xs text-emerald-700 mt-0.5">The client status has been successfully updated.</p>
                            </div>
                        </div>
                    )}

                    {/* STICKY FOOTER: Actions */}
                    <div className="p-5 border-t border-slate-100 bg-white sticky bottom-0 z-10 space-y-4">
                        <div className="flex gap-4">
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

                        <div className="flex flex-col gap-2">
                            <ProfileExportButton
                                profile={profile}
                                project={project}
                                className="w-full cursor-pointer rounded-xl border-2 border-slate-200 text-slate-500 hover:border-blue-500 hover:text-blue-600 flex items-center justify-center gap-2 font-bold transition-all bg-white py-2"
                            />
                            <ProfileExportDocxButton
                                profile={profile}
                                project={project}
                                className="w-full cursor-pointer rounded-xl border-2 border-slate-200 text-slate-500 hover:border-blue-500 hover:text-blue-600 flex items-center justify-center gap-2 font-bold transition-all bg-white py-2"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
