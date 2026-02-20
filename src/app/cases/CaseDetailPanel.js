'use client'

import { useState } from 'react'
import {
    X, User, Heart, MessageCircle, Share2, AlertTriangle,
    Activity, BadgeCheck, Quote, ShieldAlert, CheckCircle,
    ExternalLink, Calendar, Info, Siren, Eye, Link as LinkIcon,
    ChevronLeft, ChevronRight, History
} from 'lucide-react'
import ProfilePic from '@/components/ProfilePic'
import { approveTakedown } from './actions'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function CaseDetailPanel({ post, isOpen, onClose, onNavigate, hasPrev, hasNext }) {
    const [isProcessing, setIsProcessing] = useState(false)
    const [imgError, setImgError] = useState(false)
    const router = useRouter()
    if (!isOpen || !post) return null

    console.log(post)

    // --- Data Resolution ---
    const review = post.review_details || {};
    const analysis = post.analysis_results || {};

    const riskScore = review.threat_score ?? analysis.risk_score ?? 0;

    let category = review.primary_threat_type || review.threat_type || analysis.category || 'Unknown';
    if (Array.isArray(review.threat_types) && review.threat_types.length > 0) {
        category = review.threat_types.join(', ').replace(/_/g, ' ');
    }

    const reasoning = review.reasoning || analysis.categorization_reason || 'No detailed reasoning provided.';
    const reviewerNote = review.reviewer_comments || null;
    const poiNames = review.poi_names || analysis.poi_check?.poi_names || [];

    // Flags
    const isPoiPresent = review.flags?.poi_confirmed ?? (analysis.poi_check?.poi_name_found || analysis.poi_check?.face_present) ?? false;
    const isNsfw = review.flags?.is_nsfw ?? (analysis.nsfw_check?.is_safe === false) ?? false;
    const isHateSpeech = review.flags?.is_hate_speech ?? (analysis.hate_speech_check?.is_safe === false) ?? false;
    const isFakeNews = review.flags?.is_fake_news ?? (analysis.truth_check?.is_credible === false) ?? false;
    const isAigc = review.flags?.is_aigc ?? analysis.aigc_check?.is_aigc ?? false;

    // Takedown logic
    const takedownStatus = post.takedown_info?.takedown_status || 'None';
    const isRaised = (takedownStatus === 'raised');
    const isRequested = (takedownStatus === 'requested');

    const handleTakedown = async () => {
        if (!confirm("Confirm initiation of takedown process? This will alert the legal team.")) return;

        setIsProcessing(true);
        try {
            const result = await approveTakedown(post._id);
            if (result.success) {
                // alert("Takedown initiated successfully.");
                onClose();
            } else {
                alert("Error: " + result.error);
            }
            // redirect to takedown page
            router.push("/takedowns/case/" + result.supabase_id)
        } catch (e) {
            alert("Failed to initiate takedown.");
        } finally {
            setIsProcessing(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex justify-end font-sans">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity duration-300"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="relative w-full max-w-7xl bg-white h-full shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-right duration-300 border-l border-slate-200">

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                            <Siren className="w-5 h-5 text-slate-500" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 leading-tight">Case Review</h2>
                            <p className="text-xs font-mono text-slate-400">ID: {post._id}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {onNavigate && (
                            <div className="flex items-center gap-1 mr-2 border-r border-slate-200 pr-3">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => onNavigate('prev')}
                                    disabled={!hasPrev}
                                    className="h-8 w-8 text-slate-500 hover:text-blue-600"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => onNavigate('next')}
                                    disabled={!hasNext}
                                    className="h-8 w-8 text-slate-500 hover:text-blue-600"
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </Button>
                            </div>
                        )}
                        {isRequested && (
                            <Badge className="bg-orange-50 text-orange-700 border-orange-200 gap-1.5 pl-2 animate-pulse">
                                <Siren className="w-3.5 h-3.5" /> Takedown Requested
                            </Badge>
                        )}
                        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-slate-100 text-slate-400">
                            <X className="w-6 h-6" />
                        </Button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row divide-x divide-slate-100">

                    {/* Left: Source Content (Scrollable) */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/50">

                        {/* User Context Card */}
                        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center gap-5">
                            <div className="relative shrink-0">
                                {(post.user?.profile_pic_url && !imgError) ? (
                                    <img
                                        src={post.user.profile_pic_url}
                                        onError={() => setImgError(true)}
                                        alt=""
                                        className="w-16 h-16 rounded-full object-cover border-4 border-slate-50"
                                    />
                                ) : (
                                    <ProfilePic user={post.user?.username || 'Unknown'} size={64} />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-xl font-bold text-slate-900 truncate flex items-center gap-2">
                                    {post.user?.username || 'Unknown User'}
                                    {post.user?.is_verified && <BadgeCheck className="w-5 h-5 text-blue-500 fill-blue-50" />}
                                </h3>
                                <p className="text-slate-500 font-medium truncate">{post.user?.full_name}</p>
                            </div>
                            <a
                                href={post.url || post.original_url || '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors flex items-center gap-2"
                            >
                                <ExternalLink className="w-4 h-4" />
                                <span className="hidden sm:inline">View Source</span>
                            </a>
                        </div>

                        {/* Media Display */}
                        <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-lg border border-slate-800 relative group flex items-center justify-center min-h-[400px]">
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800/50 to-slate-950 pointer-events-none" />
                            {post.signedImageUrl ? (
                                <img
                                    src={post.signedImageUrl}
                                    alt="Evidence"
                                    className="max-w-full h-auto max-h-[600px] object-contain relative z-10"
                                />
                            ) : (
                                <div className="text-center p-12 relative z-10">
                                    <Quote className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                                    <p className="text-slate-500 font-medium text-lg">Text-Only Content</p>
                                </div>
                            )}
                        </div>

                        {/* Caption & Stats */}
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <h4 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                                    <MessageCircle className="w-3.5 h-3.5" /> Post Caption
                                </h4>
                                <div className="text-slate-800 leading-relaxed whitespace-pre-wrap font-medium text-base font-sans">
                                    {post.caption || <span className="italic text-slate-400">No caption content available.</span>}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-10">
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-row justify-between gap-1">
                                    <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Heart className="w-3.5 h-3.5 text-rose-500" /> Likes</span>
                                    <span className="font-bold text-lg text-slate-900">{post.stats?.like_count?.toLocaleString() || 0}</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-row justify-between gap-1">
                                    <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><MessageCircle className="w-3.5 h-3.5 text-blue-500" /> Comments</span>
                                    <span className="font-bold text-lg text-slate-900">{post.stats?.comment_count?.toLocaleString() || 0}</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-row justify-between gap-1">
                                    <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Share2 className="w-3.5 h-3.5 text-green-500" /> Shares</span>
                                    <span className="font-bold text-lg text-slate-900">{post.stats?.share_count?.toLocaleString() || 0}</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-10">
                                {
                                    post.taken_at &&
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-1">
                                        <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-slate-500" /> Taken</span>
                                        <span className="font-bold text-sm text-slate-900">{new Date(post.taken_at * 1000).toLocaleDateString()}</span>
                                    </div>
                                }
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-1">
                                    <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><History className="w-3.5 h-3.5 text-slate-500" /> Sourced</span>
                                    <span className="font-bold text-sm text-slate-900">{post.sourcing_date ? new Date(post.sourcing_date).toLocaleDateString() : 'N/A'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Intelligence Panel (Fixed/Scrollable) */}
                    <div className="w-full lg:w-[480px] bg-white flex flex-col h-full shrink-0">

                        <div className="flex-1 overflow-y-auto p-8 space-y-8">

                            {/* Threat Score Card */}
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Risk Assessment</h4>
                                <div className={cn(
                                    "rounded-2xl p-6 border relative overflow-hidden shadow-lg transition-all",
                                    riskScore > 75 ? "bg-rose-600 border-rose-500 text-white" :
                                        riskScore > 40 ? "bg-amber-500 border-amber-400 text-white" :
                                            "bg-emerald-500 border-emerald-400 text-white"
                                )}>
                                    <div className="absolute top-0 right-0 p-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

                                    <div className="relative z-10 flex justify-between items-end">
                                        <div>
                                            <p className="text-white/80 font-bold text-xs uppercase tracking-wide mb-1">Total Risk Score</p>
                                            <div className="text-5xl font-black tracking-tighter flex items-baseline gap-2">
                                                {riskScore}
                                                <span className="text-lg font-medium opacity-60">/100</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-bold uppercase mb-2 border border-white/10">
                                                <Activity className="w-3 h-3" /> AI Analysis
                                            </div>
                                            <p className="font-bold text-base leading-tight max-w-[120px] capitalize">{category}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Detection Grid */}
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Detection Signals</h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <SignalCard
                                        active={isAigc}
                                        title="AI Generated"
                                        icon={Activity}
                                        color="purple"
                                    />
                                    <SignalCard
                                        active={isHateSpeech}
                                        title="Hate Speech"
                                        icon={AlertTriangle}
                                        color="rose"
                                    />
                                    <SignalCard
                                        active={isFakeNews}
                                        title="Misinformation"
                                        icon={ShieldAlert}
                                        color="orange"
                                    />
                                    <SignalCard
                                        active={isPoiPresent}
                                        title="POI Detected"
                                        icon={User}
                                        color="indigo"
                                        extra={poiNames.length > 0 ? poiNames[0] : null}
                                    />
                                </div>
                            </div>

                            {/* Reasoning */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Eye className="w-3.5 h-3.5" /> AI Reasoning
                                </h4>
                                <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 text-slate-600 leading-relaxed text-sm font-medium">
                                    {reasoning}
                                </div>
                            </div>

                            {/* Reviewer Note */}
                            {reviewerNote && (
                                <div className="bg-amber-50 border border-amber-100 p-5 rounded-xl">
                                    <h4 className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-2 flex items-center">
                                        <User className="w-3.5 h-3.5 mr-1.5" /> Analyst Note
                                    </h4>
                                    <p className="text-amber-900/80 font-medium text-sm">
                                        {reviewerNote}
                                    </p>
                                </div>
                            )}

                        </div>

                        {/* Footer Action Area */}
                        <div className="p-6 border-t border-slate-100 bg-white sticky bottom-0 z-10">
                            {(isRequested) && (
                                <div className="flex items-start gap-3 mb-4 p-4 bg-orange-50 rounded-xl border border-orange-100">
                                    <Info className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-orange-800">Takedown Suggested</p>
                                        <p className="text-xs text-orange-700 mt-1">Reviewer flagged this for immediate removal.</p>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-4">
                                {isRaised &&
                                    <Button
                                        onClick={() => router.push(`/takedowns/case/${post.takedown_info.supabase_id}`)}
                                        variant="outline"
                                        className="flex-1 h-12 border-slate-200 text-slate-700 font-bold"
                                    >
                                        View Takedown Status
                                    </Button>
                                }
                                {isRaised ?
                                    <Button disabled className="flex-1 h-12 bg-slate-100 text-slate-400 border border-slate-200">
                                        <CheckCircle className="w-4 h-4 mr-2" /> Action in Progress
                                    </Button>
                                    : (
                                        <Button
                                            onClick={handleTakedown}
                                            disabled={isProcessing}
                                            className="flex-[2] h-12 bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/20 font-bold"
                                        >
                                            {isProcessing ? <Activity className="w-4 h-4 animate-spin mr-2" /> : <ShieldAlert className="w-4 h-4 mr-2" />}
                                            Initiate Takedown
                                        </Button>
                                    )}
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    )
}

function SignalCard({ active, title, icon: Icon, color, extra }) {
    if (!active) {
        return (
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col justify-between h-24 opacity-50">
                <Icon className="w-5 h-5 text-slate-300" />
                <span className="text-xs font-bold text-slate-400 uppercase">{title}</span>
            </div>
        )
    }

    const colorStyles = {
        purple: "bg-purple-50 border-purple-100 text-purple-700",
        rose: "bg-rose-50 border-rose-100 text-rose-700",
        orange: "bg-orange-50 border-orange-100 text-orange-700",
        indigo: "bg-indigo-50 border-indigo-100 text-indigo-700"
    }[color] || "bg-slate-100 text-slate-700";

    const iconColors = {
        purple: "text-purple-600",
        rose: "text-rose-600",
        orange: "text-orange-600",
        indigo: "text-indigo-600"
    }[color] || "text-slate-600";

    return (
        <div className={cn("p-4 rounded-xl border flex flex-col justify-between h-24 transition-all shadow-sm", colorStyles)}>
            <div className="flex justify-between items-start">
                <Icon className={cn("w-5 h-5", iconColors)} />
                <div className="h-2 w-2 rounded-full bg-current animate-pulse opacity-50" />
            </div>
            <div>
                <span className="text-xs font-extrabold uppercase tracking-wide block">{title}</span>
                {extra && <span className="text-[10px] opacity-80 font-medium truncate block mt-0.5">{extra}</span>}
            </div>
        </div>
    )
}