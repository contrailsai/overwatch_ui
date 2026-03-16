'use client'

import { useState, useCallback, useEffect, useTransition } from 'react'
import { getProfileCases, submitProfileReview } from './actions'
import {
    Filter, Search, ExternalLink, X, ChevronLeft, ChevronRight,
    ChevronsLeft, ChevronsRight,
    Facebook, Instagram, Youtube, CheckCircle, ShieldOff,
    User, ArrowRight, FileText, Siren, ClockFading, Info, Globe,
    BadgeCheck, ShieldAlert, TriangleAlert, TrendingDown, Smile,
    Loader2, AlertCircle, UserX, UserCheck, CheckCheck,
    MapPin, Calendar, Link2, Briefcase, Hash
} from 'lucide-react'
import { Twitter } from '@/utils/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
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
    if (status === 'Pass') return { label: 'Pass', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle }
    if (status === 'Flag for Takedown') return { label: 'Takedown', color: 'text-rose-700 bg-rose-50 border-rose-200', icon: Siren }
    return { label: status, color: 'text-slate-600 bg-slate-50 border-slate-200', icon: Info }
}

// ─── Risk levels config ──────────────────────────────────────────────────────
const RISK_LEVELS = [
    { value: 'safe', label: 'Safe', activeClass: 'bg-emerald-500 border-emerald-600 text-white shadow-emerald-200' },
    { value: 'low', label: 'Low', activeClass: 'bg-amber-400 border-amber-500 text-white shadow-amber-200' },
    { value: 'mid', label: 'Medium', activeClass: 'bg-orange-400 border-orange-500 text-white shadow-orange-200' },
    { value: 'high', label: 'High', activeClass: 'bg-rose-500 border-rose-600 text-white shadow-rose-200' },
]

// ─── Profile Review Form ─────────────────────────────────────────────────────
function ProfileReviewForm({ profile, project, onReviewSaved }) {
    const review = profile.review_details || {}
    const hasReview = Object.keys(review).length > 0
    const labels = project?.project_details?.labels || []

    const [risk, setRisk] = useState(review.risk || '')
    const [violations, setViolations] = useState(review.violations || [])
    const [reasoning, setReasoning] = useState(review.reasoning || '')
    const [reviewerComments, setReviewerComments] = useState(review.reviewer_comments || '')
    const [action, setAction] = useState(review.action || '')
    const [isPending, startTransition] = useTransition()
    const [result, setResult] = useState(null)

    // Reset when profile changes
    useEffect(() => {
        const r = profile.review_details || {}
        setRisk(r.risk || '')
        setViolations(r.violations || [])
        setReasoning(r.reasoning || '')
        setReviewerComments(r.reviewer_comments || '')
        setAction(r.action || '')
        setResult(null)
    }, [profile._id])

    const toggleViolation = (name) => {
        setViolations(prev =>
            prev.includes(name) ? prev.filter(v => v !== name) : [...prev, name]
        )
    }

    const handleSubmit = () => {
        if (!risk || !action) return
        startTransition(async () => {
            const res = await submitProfileReview(project, profile._id, {
                risk,
                violations,
                reasoning,
                reviewer_comments: reviewerComments,
                action,
            })
            setResult(res)
            if (res.success && onReviewSaved) {
                onReviewSaved(profile._id, res.review_details)
            }
        })
    }

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-white shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Profile Review</h3>
                        {hasReview && (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 pl-2 text-[10px]">
                                <CheckCircle className="w-3 h-3" /> Reviewed
                            </Badge>
                        )}
                    </div>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                    Reviewing profile: <span className="font-semibold text-slate-600">{profile.display_name}</span>
                </p>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-6 space-y-7">

                    {/* ── Section 1: Risk ── */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">1</span>
                            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Risk Level</h4>
                        </div>
                        <div className="flex gap-2">
                            {RISK_LEVELS.map(level => (
                                <button
                                    key={level.value}
                                    type="button"
                                    onClick={() => setRisk(level.value)}
                                    className={cn(
                                        'flex-1 py-2 px-2 rounded-lg border cursor-pointer text-xs font-bold transition-all',
                                        risk === level.value
                                            ? `${level.activeClass} shadow-sm`
                                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                    )}
                                >
                                    {level.label}
                                </button>
                            ))}
                        </div>
                        {!risk && (
                            <p className="text-[10px] text-slate-400 italic">Select a risk level to proceed.</p>
                        )}
                    </section>

                    {/* ── Section 2: Violations ── */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">2</span>
                            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Violations</h4>
                        </div>
                        {labels.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">No labels configured for this project.</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {labels.map(item => (
                                    <div
                                        key={item.name}
                                        onClick={() => toggleViolation(item.name)}
                                        className={cn(
                                            'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
                                            violations.includes(item.name)
                                                ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200'
                                                : 'bg-white border-slate-200 hover:border-blue-200'
                                        )}
                                    >
                                        <Checkbox
                                            checked={violations.includes(item.name)}
                                            onCheckedChange={() => { }}
                                            className="border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                        />
                                        <span className={cn(
                                            'text-xs font-bold uppercase',
                                            violations.includes(item.name) ? 'text-blue-700' : 'text-slate-600'
                                        )}>
                                            {item.name}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {violations.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {violations.map(v => (
                                    <Badge key={v} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-bold uppercase">
                                        {v}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* ── Section 3: Reasoning & Comments ── */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">3</span>
                            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Reasoning & Comments</h4>
                        </div>
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-slate-500 uppercase">Analysis Notes</Label>
                                <Textarea
                                    value={reasoning}
                                    onChange={e => setReasoning(e.target.value)}
                                    placeholder="Describe why this profile is flagged or cleared..."
                                    className="min-h-[100px] bg-slate-50 border-slate-200 text-sm focus:bg-white transition-colors resize-none"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-slate-500 uppercase">Client Notes</Label>
                                <Textarea
                                    value={reviewerComments}
                                    onChange={e => setReviewerComments(e.target.value)}
                                    placeholder="Add context for the client..."
                                    className="min-h-[72px] bg-white border-slate-200 text-sm focus:border-blue-500 resize-none"
                                />
                            </div>
                        </div>
                    </section>

                    {/* ── Section 4: Action ── */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">4</span>
                            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Action</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {/* Ignore */}
                            <div
                                onClick={() => setAction('ignore')}
                                className={cn(
                                    'flex flex-col items-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all',
                                    action === 'ignore'
                                        ? 'bg-slate-100 border-slate-400 ring-1 ring-slate-300'
                                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                )}
                            >
                                <div className={cn(
                                    'w-9 h-9 rounded-lg flex items-center justify-center',
                                    action === 'ignore' ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-400'
                                )}>
                                    <UserX className="w-5 h-5" />
                                </div>
                                <span className={cn(
                                    'text-xs font-bold uppercase tracking-wide',
                                    action === 'ignore' ? 'text-slate-800' : 'text-slate-500'
                                )}>Ignore</span>
                                <p className="text-[10px] text-slate-400 text-center leading-snug">No further action needed</p>
                            </div>

                            {/* Submit to Client Profiles */}
                            <div
                                onClick={() => setAction('submit_to_client')}
                                className={cn(
                                    'flex flex-col items-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all',
                                    action === 'submit_to_client'
                                        ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-200'
                                        : 'bg-white border-slate-200 hover:border-blue-200 hover:bg-blue-50/30'
                                )}
                            >
                                <div className={cn(
                                    'w-9 h-9 rounded-lg flex items-center justify-center',
                                    action === 'submit_to_client' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'
                                )}>
                                    <UserCheck className="w-5 h-5" />
                                </div>
                                <span className={cn(
                                    'text-xs font-bold uppercase tracking-wide',
                                    action === 'submit_to_client' ? 'text-blue-800' : 'text-slate-500'
                                )}>Submit to Client</span>
                                <p className="text-[10px] text-slate-400 text-center leading-snug">Add to client profiles</p>
                            </div>
                        </div>
                        {!action && (
                            <p className="text-[10px] text-slate-400 italic">Select an action to submit the review.</p>
                        )}
                    </section>

                    {/* Result feedback */}
                    {result && (
                        <div className={cn(
                            'flex items-center gap-2 p-3 rounded-lg border text-sm font-semibold',
                            result.success
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : 'bg-rose-50 border-rose-200 text-rose-700'
                        )}>
                            {result.success
                                ? <><CheckCheck className="w-4 h-4" /> Review saved successfully.</>
                                : <><AlertCircle className="w-4 h-4" /> {result.error || 'Failed to save.'}</>
                            }
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-white border-t border-slate-100 sticky bottom-0 flex gap-3 shrink-0">
                <Button
                    type="button"
                    disabled={!risk || !action || isPending}
                    onClick={handleSubmit}
                    className={cn(
                        'flex-1 font-bold text-white shadow-lg transition-all',
                        risk && action
                            ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                            : 'bg-slate-300 cursor-not-allowed'
                    )}
                >
                    {isPending
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                        : hasReview ? 'Update Review' : 'Submit Review'
                    }
                </Button>
            </div>
        </div>
    )
}

// ─── Profile Detail Panel ────────────────────────────────────────────────────
function ProfileDetailPanel({ profile, profiles = [], project, isOpen, onClose, onReviewSaved, onSelectProfile }) {
    const [cases, setCases] = useState(null)
    const [loading, setLoading] = useState(false)
    const [isBioExpanded, setIsBioExpanded] = useState(false)

    const currentIndex = profiles.findIndex(p => p._id === profile?._id)
    const hasPrev = currentIndex > 0
    const hasNext = currentIndex < profiles.length - 1 && currentIndex !== -1

    useEffect(() => {
        if (!isOpen || !profile) return
        let cancelled = false
        setCases(null)
        setIsBioExpanded(false)
        if (profile.posts.length === 0) {
            setCases([])
            return
        }
        setLoading(true)
        getProfileCases(project, profile.posts)
            .then(result => { if (!cancelled) setCases(result) })
            .catch(() => { if (!cancelled) setCases([]) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [isOpen, profile?._id, project])

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowLeft' && hasPrev) onSelectProfile(profiles[currentIndex - 1])
            if (e.key === 'ArrowRight' && hasNext) onSelectProfile(profiles[currentIndex + 1])
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, currentIndex, hasPrev, hasNext, onClose, onSelectProfile, profiles])

    if (!isOpen || !profile) return null

    const handleFirst = () => profiles.length > 0 && onSelectProfile(profiles[0])
    const handleLast = () => profiles.length > 0 && onSelectProfile(profiles[profiles.length - 1])
    const handlePrev = () => hasPrev && onSelectProfile(profiles[currentIndex - 1])
    const handleNext = () => hasNext && onSelectProfile(profiles[currentIndex + 1])

    const highCount = cases?.filter(c => (c.threat_score ?? 0) >= 96).length || 0
    const medCount = cases?.filter(c => { const s = c.threat_score ?? 0; return s >= 76 && s < 96 }).length || 0
    const lowCount = cases?.filter(c => { const s = c.threat_score ?? 0; return s >= 41 && s < 76 }).length || 0

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed right-0 top-0 h-full bg-white shadow-2xl border-l border-slate-200 z-40 flex flex-row animate-in slide-in-from-right duration-300">

                {/* LEFT: Profile & Post Details */}
                <div className='w-[540px] h-full flex flex-col overflow-hidden'>
                    {/* Navigation Header */}
                    <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleFirst}
                                disabled={currentIndex <= 0}
                                className="h-8 w-8 p-0 text-slate-400 hover:text-slate-900"
                                title="First Profile"
                            >
                                <ChevronsLeft className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handlePrev}
                                disabled={!hasPrev}
                                className="h-8 gap-1 px-2 text-slate-500 hover:text-slate-900 font-bold text-[10px] uppercase tracking-wider"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                                Prev
                            </Button>
                        </div>

                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Profile <span className="text-slate-900">{currentIndex + 1}</span> of <span className="text-slate-900">{profiles.length}</span>
                        </div>

                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleNext}
                                disabled={!hasNext}
                                className="h-8 gap-1 px-2 text-slate-500 hover:text-slate-900 font-bold text-[10px] uppercase tracking-wider"
                            >
                                Next
                                <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleLast}
                                disabled={currentIndex >= profiles.length - 1}
                                className="h-8 w-8 p-0 text-slate-400 hover:text-slate-900"
                                title="Last Profile"
                            >
                                <ChevronsRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto flex flex-col">
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
                    {/* Stats bar */}
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
                    {/* Cases */}
                    <div className="shrink-0 pb-8">
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
                                    <p className="text-xs text-slate-400 mt-1">No posts are linked to this profile.</p>
                                </div>
                            )}

                            {!loading && cases && cases.length > 0 && (
                                <div className="space-y-2.5">
                                    {cases.map(c => {
                                        const risk = getRiskLabel(c.threat_score)
                                        const statusCfg = getStatusConfig(c.client_status)
                                        const StatusIcon = statusCfg.icon
                                        return (
                                            <div
                                                key={c._id}
                                                className="group flex flex-col gap-2 bg-white border border-slate-100 rounded-xl px-4 py-3 hover:border-slate-200 hover:shadow-sm transition-all"
                                            >
                                                {/* Top row: badge + status + platform + external link */}
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {risk ? (
                                                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border', risk.color)}>
                                                            <RiskIcon label={risk.label} />
                                                            {risk.label}
                                                        </span>
                                                    ) :
                                                        (
                                                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border', statusCfg.color)}>
                                                                <StatusIcon className="w-2.5 h-2.5" />
                                                                {statusCfg.label}
                                                            </span>
                                                        )
                                                    }
                                                    <Badge variant="outline" className="capitalize font-semibold text-slate-500 border-slate-200 gap-1 pl-1.5 h-5 text-[10px]">
                                                        <PlatformIcon platform={c.platform} />
                                                        {c.platform}
                                                    </Badge>
                                                    {c.primary_threat_type && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wide text-slate-500 bg-slate-50 border-slate-200">
                                                            {c.primary_threat_type.replace(/[-_]/g, ' ')}
                                                        </span>
                                                    )}
                                                    <div className="ml-auto">
                                                        {c.original_url && (
                                                            <a
                                                                href={c.original_url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline bg-blue-50 px-2 py-0.5 rounded-md"
                                                            >
                                                                Source <ExternalLink className="w-2.5 h-2.5" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Image and Caption */}
                                                <div className="flex gap-3">
                                                    {c.signedImageUrl && (
                                                        <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-slate-100 bg-slate-50">
                                                            <img src={c.signedImageUrl} alt="" className="w-full h-full object-cover" />
                                                        </div>
                                                    )}
                                                    {c.caption && (
                                                        <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed flex-1">
                                                            {c.caption}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Footer: Date + Inspect Action */}
                                                <div className="flex items-center justify-between mt-0.5 pt-2 border-t border-slate-50">
                                                    <div className="flex items-center gap-2">
                                                        {c.created_at && (
                                                            <p className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                                                                {format(new Date(c.created_at), 'dd MMM yyyy')}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <a
                                                        href={`/cases/${c._id}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600 hover:text-blue-600 hover:bg-white hover:border-blue-200 px-2 py-1 rounded-md border border-slate-100 transition-all group/link"
                                                    >
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
                </div>

                {/* DIVIDER */}
                <div className="w-px bg-slate-200 shrink-0" />

                {/* RIGHT: Profile Review */}
                <div className='w-[420px] h-full flex flex-col overflow-hidden'>
                    <ProfileReviewForm
                        profile={profile}
                        project={project}
                        onReviewSaved={onReviewSaved}
                    />
                </div>
            </div>
        </>
    )
}

export function ProfilesList({ profiles, project, initialFilters, currentPage }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const totalCount = profiles?.totalCount || 0
    const totalPages = profiles?.totalPages || 0
    const profileList = profiles?.profiles || []

    const [selectedProfile, setSelectedProfile] = useState(null)

    const updateQueryParams = useCallback((newParams) => {
        const params = new URLSearchParams(searchParams.toString())
        Object.entries(newParams).forEach(([key, value]) => {
            if (value === null || value === undefined || value === 'all') {
                params.delete(key)
            } else {
                params.set(key, value)
            }
        })
        if (!newParams.page) params.delete('page')
        router.push(`${pathname}?${params.toString()}`)
    }, [router, pathname, searchParams])

    const handleFilterChange = (key, value) => updateQueryParams({ [key]: value })

    const handlePageChange = (newPage) => {
        if (newPage < 1 || newPage > totalPages) return
        updateQueryParams({ page: newPage })
    }

    const clearFilters = () => router.push(pathname)

    const hasActiveFilter = initialFilters.platform !== 'all' || initialFilters.is_verified !== 'all'

    const handleSelectProfile = (profile) => {
        setSelectedProfile(profile);
        // Reset panel state so cases are reloaded for new profile
        // setSelectedProfile(null)
        // setTimeout(() => setSelectedProfile(profile), 0)
    }

    // Update review_details in selectedProfile after save
    const handleReviewSaved = (profileId, review_details) => {
        setSelectedProfile(prev =>
            prev?._id === profileId ? { ...prev, review_details } : prev
        )
    }

    return (
        <div className="flex flex-col h-full bg-slate-50">

            {/* Filters */}
            <div className="px-6 py-4 shrink-0">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-6">

                        <div className="flex items-center gap-6 w-full lg:w-auto">
                            <div className="flex items-center gap-2.5 shrink-0">
                                <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                                    <Filter className="w-4 h-4" />
                                </div>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Filters</span>
                            </div>

                            <Separator orientation="vertical" className="h-8 bg-slate-100 hidden sm:block" />

                            <div className="flex flex-wrap items-center gap-4">
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-slate-400">Platform</Label>
                                    <Select value={initialFilters.platform} onValueChange={(val) => handleFilterChange('platform', val)}>
                                        <SelectTrigger className="w-[140px] bg-white border-slate-200 h-9 text-xs font-semibold">
                                            <SelectValue placeholder="All Platforms" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Platforms</SelectItem>
                                            <SelectItem value="instagram">Instagram</SelectItem>
                                            <SelectItem value="facebook">Facebook</SelectItem>
                                            <SelectItem value="x">X (Twitter)</SelectItem>
                                            <SelectItem value="youtube">YouTube</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-slate-400">Verified</Label>
                                    <Select value={initialFilters.is_verified} onValueChange={(val) => handleFilterChange('is_verified', val)}>
                                        <SelectTrigger className="w-[130px] bg-white border-slate-200 h-9 text-xs font-semibold">
                                            <SelectValue placeholder="All" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All</SelectItem>
                                            <SelectItem value="true">Verified</SelectItem>
                                            <SelectItem value="false">Unverified</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {hasActiveFilter && (
                                    <div className="pt-4">
                                        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold text-xs">
                                            <X className="w-3.5 h-3.5 mr-1" /> Clear
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-5 w-full lg:w-auto justify-end">
                            <Separator orientation="vertical" className="h-8 bg-slate-100 hidden sm:block" />
                            <div className="text-xs font-medium text-slate-500 whitespace-nowrap">
                                <span className="font-bold text-slate-900 text-sm">{totalCount}</span> profiles found
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="min-w-full table-fixed divide-y divide-slate-100">
                        <thead className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-sm">
                            <tr>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-[220px]">Display Name</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-[140px]">Platform</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-[110px]">Verified</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-[100px]">Posts</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Profile URL</th>
                                <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider w-[110px]">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="bg-white divide-y divide-slate-100">
                            {profileList.map((profile) => {
                                const isSelected = selectedProfile?._id === profile._id
                                const hasReview = Object.keys(profile.review_details || {}).length > 0
                                return (
                                    <tr
                                        key={profile._id}
                                        onClick={() => handleSelectProfile(profile)}
                                        className={cn(
                                            'transition-all cursor-pointer group',
                                            isSelected ? 'bg-blue-50/60 ring-1 ring-inset ring-blue-200 z-10 relative' : 'hover:bg-slate-50'
                                        )}
                                    >
                                        {/* Display Name */}
                                        <td className="px-4 py-3 whitespace-nowrap align-middle">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                                                    {profile.metadata?.profile_pic ? (
                                                        <img src={profile.metadata.profile_pic} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <User className="w-4 h-4 text-slate-400" />
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-semibold text-slate-900 text-sm truncate max-w-[150px]">
                                                        {profile.display_name}
                                                    </span>
                                                    {profile.username && (
                                                        <span className="text-[10px] text-slate-400 truncate max-w-[150px]">
                                                            @{profile.username}
                                                        </span>
                                                    )}
                                                    {hasReview && (
                                                        <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                                                            <CheckCircle className="w-2.5 h-2.5" /> Reviewed
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Platform */}
                                        <td className="px-4 py-3 whitespace-nowrap align-middle">
                                            <Badge variant="outline" className="capitalize font-semibold text-slate-600 border-slate-300 gap-1.5 pl-2 h-7">
                                                <PlatformIcon platform={profile.platform} />
                                                {profile.platform}
                                            </Badge>
                                        </td>

                                        {/* Verified */}
                                        <td className="px-4 py-3 whitespace-nowrap align-middle">
                                            {profile.is_verified ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border text-blue-700 bg-blue-50 border-blue-200">
                                                    <BadgeCheck className="w-3.5 h-3.5" /> Verified
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border text-slate-500 bg-slate-50 border-slate-200">
                                                    <ShieldOff className="w-3.5 h-3.5" /> Unverified
                                                </span>
                                            )}
                                        </td>

                                        {/* Posts count */}
                                        <td className="px-4 py-3 whitespace-nowrap align-middle">
                                            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-700">
                                                <FileText className="w-3.5 h-3.5 text-slate-400" />
                                                {profile.posts.length}
                                            </span>
                                        </td>

                                        {/* Profile URL */}
                                        <td className="px-4 py-3 align-middle overflow-hidden">
                                            {profile.profile_url ? (
                                                <a
                                                    href={profile.profile_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium truncate max-w-[280px]"
                                                >
                                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                                    <span className="truncate">{profile.profile_url}</span>
                                                </a>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">—</span>
                                            )}
                                        </td>

                                        {/* Actions */}
                                        <td className="px-4 py-3 whitespace-nowrap text-right align-middle">
                                            <Button
                                                size="sm"
                                                variant={isSelected ? 'default' : 'secondary'}
                                                className={cn(
                                                    'h-8 text-xs font-bold transition-all shadow-sm',
                                                    isSelected
                                                        ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                                                        : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600'
                                                )}
                                            >
                                                {isSelected ? 'Inspect' : 'View'}
                                                <ArrowRight className="w-3 h-3 ml-1.5 opacity-50" />
                                            </Button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>

                    {profileList.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 border border-slate-100">
                                <Search className="w-8 h-8 opacity-20 text-slate-500" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-700 mb-1">No profiles found</h3>
                            <p className="text-sm text-slate-500 max-w-xs text-center">Try adjusting your filters or check back later.</p>
                            <Button variant="outline" onClick={clearFilters} className="mt-6 border-slate-200">
                                Clear all filters
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="px-6 pb-2 pt-2">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-3 flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Page <span className="text-slate-900">{currentPage}</span> of <span className="text-slate-900">{totalPages}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(1)}
                                disabled={currentPage === 1}
                                className="h-9 px-2 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                            >
                                &lt;&lt;
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="h-9 px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                            >
                                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                            </Button>

                            <div className="flex items-center gap-1 mx-1">
                                {(() => {
                                    const pages = []
                                    let start = Math.max(1, currentPage - 2)
                                    let end = Math.min(totalPages, currentPage + 2)
                                    if (currentPage <= 2) end = Math.min(totalPages, 5)
                                    if (currentPage >= totalPages - 1) start = Math.max(1, totalPages - 4)
                                    for (let i = start; i <= end; i++) pages.push(i)
                                    return pages.map(pageNum => (
                                        <Button
                                            key={pageNum}
                                            variant={currentPage === pageNum ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => handlePageChange(pageNum)}
                                            className={cn(
                                                'h-9 w-9 p-0 text-xs font-bold',
                                                currentPage === pageNum
                                                    ? 'bg-slate-800 hover:bg-slate-900 text-white shadow-sm'
                                                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                            )}
                                        >
                                            {pageNum}
                                        </Button>
                                    ))
                                })()}
                            </div>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="h-9 px-3 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                            >
                                Next <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(totalPages)}
                                disabled={currentPage === totalPages}
                                className="h-9 px-2 text-xs font-bold border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                            >
                                &gt;&gt;
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Panel */}
            <ProfileDetailPanel
                profile={selectedProfile}
                profiles={profileList}
                project={project}
                isOpen={!!selectedProfile}
                onClose={() => setSelectedProfile(null)}
                onReviewSaved={handleReviewSaved}
                onSelectProfile={handleSelectProfile}
            />
        </div>
    )
}
