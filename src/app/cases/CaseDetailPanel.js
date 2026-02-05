'use client'

import { useState } from 'react'
import {
    X, User, Heart, MessageCircle, Share2, AlertTriangle,
    Activity, BadgeCheck, Quote, ShieldAlert, CheckCircle,
    ExternalLink, Calendar, Info, Siren, Eye, Link as LinkIcon
} from 'lucide-react'
import ProfilePic from '@/components/ProfilePic'
import { approveTakedown } from './actions'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

export function CaseDetailPanel({ post, onClose, isOpen }) {
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
    const isRaised = takedownStatus === 'raised';
    const isRequested = takedownStatus === 'requested';

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
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity duration-300"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="relative w-full max-w-7xl bg-slate-50 h-full shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-right duration-300 border-l border-white/20">

                {/* Header */}
                <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-20 shadow-sm/50">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center">
                            <Siren className="w-5 h-5 text-slate-500" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 leading-tight">Case Review</h2>
                            <p className="text-xs font-mono text-slate-400">ID: {post._id}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {isRequested && (
                            <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold uppercase tracking-wider rounded-full border border-green-200 flex items-center gap-1.5">
                                <CheckCircle className="w-3.5 h-3.5" /> Takedown Active
                            </span>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">

                    {/* Left: Source Content (Scrollable) */}
                    <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6 scrollbar-hide">

                        {/* User Context Card */}
                        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-5">
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
                                {/* <span className="absolute -bottom-1 -right-1 bg-white p-1 rounded-full shadow-sm">
                                    {post.platform === 'instagram' && <div className="w-5 h-5 bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 rounded-full" />}
                                    {post.platform === 'facebook' && <div className="w-5 h-5 bg-blue-600 rounded-full" />}
                                    {post.platform === 'x' && <div className="w-5 h-5 bg-black rounded-full" />}
                                </span> */}
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
                            {post.signedImageUrl ? (
                                <img
                                    src={post.signedImageUrl}
                                    alt="Evidence"
                                    className="w-full h-auto max-h-[600px] object-contain"
                                />
                            ) : (
                                <div className="text-center p-12">
                                    <Quote className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                                    <p className="text-slate-500 font-medium text-lg">Text-Only Content</p>
                                </div>
                            )}
                        </div>

                        {/* Caption & Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <h4 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                                    <MessageCircle className="w-3 h-3" /> Post Caption
                                </h4>
                                <div className="text-slate-800 leading-relaxed whitespace-pre-wrap font-medium text-base">
                                    {post.caption || <span className="italic text-slate-400">No caption content available.</span>}
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-rose-50 text-rose-500 rounded-lg">
                                            <Heart className="w-5 h-5" />
                                        </div>
                                        <span className="text-xs font-bold text-slate-400 uppercase">Likes</span>
                                    </div>
                                    <span className="font-bold text-slate-900 text-lg">{post.stats?.like_count?.toLocaleString() || 0}</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-50 text-blue-500 rounded-lg">
                                            <MessageCircle className="w-5 h-5" />
                                        </div>
                                        <span className="text-xs font-bold text-slate-400 uppercase">Comments</span>
                                    </div>
                                    <span className="font-bold text-slate-900 text-lg">{post.stats?.comment_count?.toLocaleString() || 0}</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-green-50 text-green-500 rounded-lg">
                                            <Share2 className="w-5 h-5" />
                                        </div>
                                        <span className="text-xs font-bold text-slate-400 uppercase">Shares</span>
                                    </div>
                                    <span className="font-bold text-slate-900 text-lg">{post.stats?.share_count?.toLocaleString() || 0}</span>
                                </div>

                                {/* Dates */}
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-slate-50 text-slate-500 rounded-lg">
                                            <Calendar className="w-5 h-5" />
                                        </div>
                                        <span className="text-xs font-bold text-slate-400 uppercase">Sourcing Date</span>
                                    </div>
                                    <span className="font-bold text-slate-900 text-sm">{post.sourcing_date ? new Date(post.sourcing_date).toLocaleDateString() : 'N/A'}</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-slate-50 text-slate-500 rounded-lg">
                                            <Activity className="w-5 h-5" />
                                        </div>
                                        <span className="text-xs font-bold text-slate-400 uppercase">Extraction Date</span>
                                    </div>
                                    <span className="font-bold text-slate-900 text-sm">{post.created_at ? new Date(post.created_at).toLocaleDateString() : 'N/A'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Intelligence Panel (Fixed/Scrollable) */}
                    <div className="w-full lg:w-[480px] bg-white border-l border-slate-200 flex flex-col h-full shadow-xl">

                        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">

                            {/* Threat Score Card */}
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Risk Assessment</h4>
                                <div className={cn(
                                    "rounded-3xl p-6 border text-white relative overflow-hidden shadow-lg",
                                    riskScore > 75 ? "bg-gradient-to-br from-red-500 to-red-600 border-red-400" :
                                        riskScore > 40 ? "bg-gradient-to-br from-orange-400 to-orange-500 border-orange-300" :
                                            "bg-gradient-to-br from-emerald-400 to-emerald-500 border-emerald-300"
                                )}>
                                    <div className="absolute top-0 right-0 p-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

                                    <div className="relative z-10 flex justify-between items-end">
                                        <div>
                                            <p className="text-white/80 font-medium text-sm mb-1">Threat Score</p>
                                            <div className="text-6xl font-black tracking-tighter flex items-baseline gap-2">
                                                {riskScore}
                                                <span className="text-xl font-medium opacity-60">/100</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold uppercase mb-2">
                                                <Activity className="w-3 h-3" /> Analysis
                                            </div>
                                            <p className="font-bold text-lg leading-tight max-w-[120px]">{category}</p>
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
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Eye className="w-3.5 h-3.5" /> AI Reasoning
                                </h4>
                                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 text-slate-600 leading-relaxed text-sm font-medium">
                                    {reasoning}
                                </div>
                            </div>

                            {/* Reviewer Note */}
                            {reviewerNote && (
                                <div className="bg-amber-50 border-l-4 border-amber-300 p-5 rounded-r-xl">
                                    <h4 className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-2 flex items-center">
                                        <User className="w-3.5 h-3.5 mr-1.5" /> Analyst Note
                                    </h4>
                                    <p className="text-amber-800 font-medium text-sm">
                                        {reviewerNote}
                                    </p>
                                </div>
                            )}

                        </div>

                        {/* Footer Action Area */}

                        <div className="p-6 border-t border-slate-100 bg-slate-50/50 mt-auto">
                            {(isRaised || riskScore > 70) && (
                                <div className="flex items-start gap-3 mb-6 p-4 bg-rose-50 rounded-xl border border-rose-100">
                                    <Info className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                                    <p className="text-sm font-medium text-rose-800">
                                        High Risk Content. Recommended action is immediate takedown due to violations of community safety guidelines.
                                    </p>
                                </div>
                            )}

                            <div className="flex gap-4">
                                <button onClick={() => {
                                    router.push(`/takedowns/case/${post._id}`);
                                }} className="flex-1 py-3.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors shadow-sm text-sm">
                                    Go to Takedown
                                </button>
                                {isRequested ? (
                                    <button disabled className="flex-1 py-3.5 bg-slate-100 text-slate-400 font-bold rounded-xl border border-slate-200 cursor-not-allowed text-sm flex items-center justify-center gap-2">
                                        <CheckCircle className="w-4 h-4" /> Requested
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleTakedown}
                                        disabled={isProcessing}
                                        className="flex-[2] py-3.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 hover:shadow-xl active:scale-95 text-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait"
                                    >
                                        {isProcessing ? <Activity className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                                        Initiate Takedown
                                    </button>
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
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col justify-between h-24 opacity-60">
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
        <div className={cn("p-4 rounded-xl border flex flex-col justify-between h-24 transition-all hover:shadow-md", colorStyles)}>
            <div className="flex justify-between items-start">
                <Icon className={cn("w-5 h-5", iconColors)} />
                <div className="h-2 w-2 rounded-full bg-current animate-pulse" />
            </div>
            <div>
                <span className="text-xs font-extrabold uppercase tracking-wide block">{title}</span>
                {extra && <span className="text-[10px] opacity-80 font-medium truncate block mt-0.5">{extra}</span>}
            </div>
        </div>
    )
}
