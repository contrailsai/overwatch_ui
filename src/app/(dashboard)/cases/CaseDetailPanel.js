'use client'

import { updateClientStatus, trackClientClick } from './actions'
import { addReviewNote, assignCaseTo } from './feature_actions'
import { initiateTakedown, } from './takedown_actions'
import EditForm from "./EditForm"

// UI IMPORTS BELOW
import { format } from "date-fns"
import { useEffect, useState } from 'react'
import {
    X, User, Heart, MessageCircle, Share2, AlertTriangle,
    Activity, BadgeCheck, Quote, ShieldAlert, CheckCircle,
    ExternalLink, Calendar, Info, Siren, Eye, Link as LinkIcon,
    ChevronLeft, ChevronRight, History, Facebook, Instagram, Youtube,
    Loader2, Send, Copy, Check, TrendingUp, ShieldX, EyeOff, Laugh, Bot,
    ScanFace, MessageSquareWarning, Fingerprint, AlertCircle, ShieldQuestion,
    FishingHook,
    UserRound,
    UserRoundX, Pencil, UserPlus, Scale
} from 'lucide-react'
import { Twitter, Reddit } from '@/utils/icons'
import ProfilePic from '@/components/ProfilePic'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
//  Shadcn imports
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { CaseExportButton } from '@/components/pdf/CaseExportButton'
import { CaseExportDocxButton } from '@/components/docx/CaseExportDocxButton'
import SafeDate from '@/components/SafeDate'

const getRiskLabel = (score) => {
    if (score >= 96) return { label: 'High', color: 'text-rose-500 bg-rose-50 border-rose-200' };
    if (score >= 76) return { label: 'Medium', color: 'text-orange-500 bg-orange-50 border-orange-200' };
    if (score >= 41) return { label: 'Low', color: 'text-amber-500 bg-amber-50 border-amber-200' };
    return { label: 'Safe', color: 'text-slate-500 bg-slate-50 border-slate-200' };
}

export function CaseDetailPanel({ post, project, clientDetails, isOpen, onClose, onNavigate, hasPrev, hasNext, onUpdateStatus, onUpdatePost, projectEmails }) {
    // console.log(post);
    const [isProcessing, setIsProcessing] = useState(false)
    const [imgError, setImgError] = useState(false)
    const router = useRouter()
    const [showProcessed, setShowProcessed] = useState("");
    const [noteText, setNoteText] = useState("");
    const [isSubmittingNote, setIsSubmittingNote] = useState(false);
    const [localNotes, setLocalNotes] = useState(post?.client_notes || []);
    const [copied, setCopied] = useState(false);

    const [assignedEmail, setAssignedEmail] = useState(post?.assigned_to || "");
    const [isAssignEditMode, setIsAssignEditMode] = useState(!post?.assigned_to);
    const [isAssigning, setIsAssigning] = useState(false);

    const [isEditing, setIsEditing] = useState(false);

    let allowDoTakedown = false;
    try {
        if (project && project.project_details) {
            const details = project.project_details;
            if (details.do_takedowns === true || details.do_takedowns === undefined) {
                allowDoTakedown = true;
            } else {
                allowDoTakedown = false;
            }
        } else {
            allowDoTakedown = true;
        }
    } catch (e) {
        console.error(e)
        allowDoTakedown = true;
    }

    useEffect(() => {
        setAssignedEmail(post?.assigned_to || "");
        setIsAssignEditMode(!post?.assigned_to);
    }, [post]);

    useEffect(() => {
        if (post?._id !== showProcessed) {
            setShowProcessed("")
        }
    }, [post, showProcessed])

    useEffect(() => {
        setLocalNotes(post?.client_notes || []);
        setNoteText('');
    }, [post]);

    //MOVE TO THE NEXT CASE AFTER 1.5 SECONDS IF CASE IF SUBMITTED
    // useEffect(() => {
    //     let timeoutId;
    //     if (showProcessed === post?._id && hasNext) {
    //         timeoutId = setTimeout(() => {
    //             onNavigate('next');
    //         }, 1500);
    //     }
    //     return () => clearTimeout(timeoutId);
    // }, [showProcessed, post?._id, hasNext, onNavigate]);

    if (!isOpen || !post) return null

    const handleAddNote = async () => {
        if (!noteText.trim()) return;
        setIsSubmittingNote(true);
        try {
            const result = await addReviewNote(post._id, noteText, project, clientDetails);
            if (result.success) {
                setLocalNotes(prev => [...prev, result.note]);
                setNoteText('');
            } else {
                alert("Failed to add note: " + result.error);
            }
        } catch (error) {
            alert("Failed to add note");
        } finally {
            setIsSubmittingNote(false);
        }
    };

    const handleCopyLink = () => {
        const url = `${window.location.origin}/cases/${post._id}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Handler function
    const handleAssign = async () => {
        if (!assignedEmail) return;
        setIsAssigning(true);
        try {
            // Invoking your action function
            const result = await assignCaseTo(project, clientDetails, post._id, assignedEmail);

            // Assuming successful assignment
            setIsAssignEditMode(false);

            // Optional: If you want to update the local UI immediately
            if (onUpdatePost) {
                onUpdatePost({ ...post, assigned_to: assignedEmail });
            }
        } catch (error) {
            alert("Failed to assign case");
        } finally {
            setIsAssigning(false);
        }
    };

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
    const legalCodes = review.legal_codes || [];

    // Flags
    const isPoiPresent = review.face_present ?? review.flags?.poi_confirmed ?? (analysis.poi_check?.poi_name_found || analysis.poi_check?.face_present) ?? false;
    const isAigc = review.is_aigc ?? review.flags?.is_aigc ?? analysis.aigc_check?.is_aigc ?? false;

    // Helper for better icon mapping
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
        // keep adding more as you see fit 
        return { icon: AlertCircle, color: 'amber' };
    };

    // Resolve Dynamic Labels and Legacy Flags
    const projectLabels = project?.project_details?.labels || [];
    const activeLabels = [];

    // 1. Check Project Labels (New Format)
    projectLabels.forEach(label => {
        const isActive = review.flags?.[label.name] === true;
        if (isActive) {
            const config = getLabelConfig(label.name);

            // Transform name: replace separators, then convert to Title Case
            const formattedTitle = label.name
                .replace(/[-_]/g, ' ')
                .replace(/\b\w/g, char => char.toUpperCase());

            activeLabels.push({
                name: label.name,
                title: formattedTitle,
                icon: config.icon,
                color: label.severity === 'high' ? 'rose' : label.severity === 'medium' ? 'orange' : label.severity === 'low' ? 'yellow' : config.color
            });
        }
    });

    // 2. Check Legacy Flags (Backward Compatibility)
    const legacyFlagMap = {
        is_hate_speech: { title: "Hate Speech", icon: MessageSquareWarning, color: "orange" },
        is_fake_news: { title: "Misinformation", icon: ShieldX, color: "orange" },
        is_nsfw: { title: "NSFW Content", icon: EyeOff, color: "orange" },
        is_fraud: { title: "Fraud", icon: Fingerprint, color: "rose" },
        is_asset_misuse: { title: "Asset Misuse", icon: ShieldQuestion, color: "yellow" },
        is_humor: { title: "Satire", icon: Laugh, color: "yellow" },
        is_terrorism: { title: "Terrorism", icon: Siren, color: "rose" },
        is_violence: { title: "Violence", icon: Siren, color: "orange" }
    };

    Object.entries(legacyFlagMap).forEach(([key, config]) => {
        // Only add if it's true and NOT already covered by a project label (avoid duplicates)
        if (review.flags?.[key] === true && !activeLabels.some(l => l.name === key)) {
            activeLabels.push({
                name: key,
                ...config
            });
        }
    });

    // Takedown logic
    const takedownStatus = post.takedown_info?.takedown_status || post.takedown_info?.status || 'None';
    const clientStatus = post.client_status || 'To Be Reviewed';
    const isRaised = post.takedown_info?.in_takedown_process || clientStatus === 'Takedown' || false;
    const isRequested = (takedownStatus === 'requested');

    let posted_date = ""
    let sourced_date = ""

    if (post.posted_date)
        posted_date = format(new Date(post.posted_date), "dd/MM/yyyy");
    else if (post.metadata?.posted_date)
        posted_date = format(new Date(post.metadata.posted_date), "dd/MM/yyyy");
    else if (post.timestamp)
        posted_date = format(new Date(post.timestamp), "dd/MM/yyyy");
    else if (post.sourcing_date)
        posted_date = format(new Date(post.sourcing_date), "dd/MM/yyyy");

    if (post.metadata?.created_at)
        sourced_date = format(new Date(post.metadata.created_at), "dd/MM/yyyy");
    else if (post.created_at)
        sourced_date = format(new Date(post.created_at), "dd/MM/yyyy");

    const handleTakedown = async () => {
        const status = "Takedown";
        setIsProcessing('takedown');
        try {
            // const result = await updateClientStatus(post._id, status, clientDetails.email);
            const result = await initiateTakedown(post._id, status, clientDetails.email);
            if (result.success) {
                if (onUpdateStatus) onUpdateStatus(post._id, 'Takedown'); // CASE SENSITIVE BE CAREFULL
                setShowProcessed(post._id);
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

    const handleUpdateStatus = async (status) => {
        setIsProcessing(status);
        trackClientClick(status === 'No Action' ? 'no_action_case' : 'flag_for_takedown', { page: 'CaseDetailPanel' });
        try {
            const result = await updateClientStatus(post._id, status, clientDetails.email);
            if (result.success) {
                if (onUpdateStatus) onUpdateStatus(post._id, status);
                setShowProcessed(post._id);
            } else {
                alert("Error: " + result.error);
            }
        } catch (e) {
            alert("Failed to update status.");
        } finally {
            setIsProcessing(false);
        }
    }

    // console.log(post);

    return (
        <div className="fixed inset-0 z-50 flex justify-end font-sans">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity duration-300"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="relative w-full max-w-7xl bg-white h-full shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-right duration-300 border-l border-slate-200">


                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row lg:divide-x divide-slate-100">

                    {/* Left: Source Content (Scrollable) */}
                    <div className="flex-none lg:flex-1 lg:overflow-y-auto space-y-4 bg-slate-50/50">
                        {/* Header */}
                        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20">
                            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                <div className="h-8 w-8 sm:h-10 sm:w-10 shrink-0 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                                    <Siren className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight truncate">Content Review</h2>
                                    <p className="text-[10px] sm:text-xs font-mono text-slate-400 truncate">ID: {post._id}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-1 sm:gap-3 shrink-0">
                                {onNavigate && (
                                    <div className="flex items-center gap-0.5 sm:gap-1 mr-1 sm:mr-2 border-r border-slate-200 pr-1 sm:pr-3">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => onNavigate('prev')}
                                            disabled={!hasPrev}
                                            className="h-7 w-7 sm:h-8 sm:w-8 text-slate-500 hover:text-blue-600"
                                        >
                                            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => onNavigate('next')}
                                            disabled={!hasNext}
                                            className="h-7 w-7 sm:h-8 sm:w-8 text-slate-500 hover:text-blue-600"
                                        >
                                            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                                        </Button>
                                    </div>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleCopyLink}
                                    className="h-7 w-7 sm:h-9 sm:w-9 text-slate-500 hover:text-blue-600 rounded-full"
                                    title="Copy case link"
                                >
                                    {copied ? <Check className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" /> : <LinkIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
                                </Button>

                                {isRequested && (
                                    <Badge className="bg-orange-50 text-orange-700 border-orange-200 gap-1.5 pl-2 animate-pulse hidden sm:inline-flex">
                                        <Siren className="w-3.5 h-3.5" /> Takedown Requested
                                    </Badge>
                                )}
                                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 sm:h-10 sm:w-10 rounded-full hover:bg-slate-100 text-slate-400">
                                    <X className="w-5 h-5 sm:w-6 sm:h-6" />
                                </Button>
                            </div>
                        </div>

                        <div className=" flex flex-col gap-6 sm:gap-8 px-4 sm:px-8 pb-8 pt-4 sm:pt-0 ">
                            {/* Media Display */}
                            <div className="bg-slate-900 rounded-xl sm:rounded-2xl overflow-hidden shadow-lg border border-slate-800 relative group flex items-center justify-center min-h-[300px] sm:min-h-[400px]">
                                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800/50 to-slate-950 pointer-events-none" />
                                {post.signedImageUrl ? (
                                    <img
                                        src={post.signedImageUrl}
                                        alt="Evidence"
                                        className="max-w-full h-auto max-h-[400px] sm:max-h-[600px] object-contain relative z-10"
                                    />
                                ) : (
                                    <div className="text-center p-8 sm:p-12 relative z-10">
                                        <Quote className="w-12 h-12 sm:w-16 sm:h-16 text-slate-700 mx-auto mb-3 sm:mb-4" />
                                        <p className="text-slate-500 font-medium text-base sm:text-lg">Text-Only Content</p>
                                    </div>
                                )}
                            </div>

                            {/* Unified User Context & Caption Card */}
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                <div className="p-4 sm:p-5 flex items-start sm:items-center gap-3 sm:gap-5">
                                    <div className="relative shrink-0 mt-1 sm:mt-0">
                                        {(post.user?.profile_pic_url && !imgError) ? (
                                            <img
                                                src={post.user.profile_pic_url}
                                                onError={() => setImgError(true)}
                                                alt=""
                                                className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover border-2 sm:border-4 border-slate-50"
                                            />
                                        ) : (
                                            <div className="scale-75 sm:scale-100 origin-top-left sm:origin-center">
                                                <ProfilePic user={post.user?.username || 'Unknown'} size={64} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate flex items-center gap-1.5 sm:gap-2">
                                            <div className="">
                                                {/* platform */}
                                                <div className="flex-1 min-w-4">
                                                    {
                                                        post.platform === "x" || post.platform === "twitter" ? (
                                                            <span className="inline-block size-4 text-black">
                                                                <Twitter className="w-3.5 h-3.5 text-slate-900" />
                                                            </span>
                                                        ) : post.platform === "reddit" ? (
                                                            <span className="inline-block size-4 text-black">
                                                                <Reddit className="w-3.5 h-3.5 text-slate-900" />
                                                            </span>
                                                        ) : post.platform?.toLowerCase() === "instagram" ? (
                                                            <Instagram className="w-6 h-6 text-pink-500" />
                                                        ) : post.platform?.toLowerCase() === "facebook" ? (
                                                            <Facebook className="w-6 h-6 text-blue-500" />
                                                        ) : post.platform?.toLowerCase() === "youtube" ? (
                                                            <Youtube className="w-6 h-6 text-red-500" />
                                                        ) : (
                                                            <p className="text-slate-500 font-medium truncate">{post.platform}</p>
                                                        )
                                                    }
                                                </div>
                                            </div>
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

                                <div className="px-5 pb-5 pt-0">
                                    <div className="bg-slate-50/50 rounded-lg p-4 border border-slate-100">
                                        <h4 className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                                            <MessageCircle className="w-3 h-3" />  {post.platform.toLowerCase() === "website" ? "Post Content" : "Post Caption"}
                                        </h4>
                                        <div className="text-slate-800 leading-relaxed whitespace-pre-wrap font-medium text-sm font-sans">
                                            {post.caption || <span className="italic text-slate-400">No caption content available.</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {
                                post.platform.toLowerCase() !== "website" && (
                                    <>
                                        {/* Stats & Dates */}
                                        <div className="space-y-4 sm:space-y-6">
                                            <div className="grid grid-cols-2 sm:flex sm:flex-row gap-3 sm:gap-4">
                                                <div className="w-full bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm flex flex-row justify-between items-center gap-1">
                                                    <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 sm:gap-2"><Heart className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-500" /> Likes</span>
                                                    <span className="font-bold text-sm sm:text-lg text-slate-900">{post.stats?.like_count?.toLocaleString() || 0}</span>
                                                </div>
                                                <div className="w-full bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm flex flex-row justify-between items-center gap-1">
                                                    <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 sm:gap-2"><MessageCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-500" /> Comments</span>
                                                    <span className="font-bold text-sm sm:text-lg text-slate-900">{post.stats?.comment_count?.toLocaleString() || 0}</span>
                                                </div>
                                                <div className="w-full bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm flex flex-row justify-between items-center gap-1">
                                                    <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 sm:gap-2"><Share2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-500" /> Shares</span>
                                                    <span className="font-bold text-sm sm:text-lg text-slate-900">{post.stats?.share_count?.toLocaleString() || 0}</span>
                                                </div>
                                                {
                                                    post.stats?.view_count > 0 && (
                                                        <div className="w-full bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm flex flex-row justify-between items-center gap-1">
                                                            <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 sm:gap-2"><Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-violet-600" /> Views</span>
                                                            <span className="font-bold text-sm sm:text-lg text-slate-900">{post.stats?.view_count?.toLocaleString() || 0}</span>
                                                        </div>
                                                    )
                                                }
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-10">
                                                <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-1">
                                                    <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 sm:gap-2"><Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500" /> Publish Date</span>
                                                    <span className="font-bold text-xs sm:text-sm text-slate-900">{posted_date}</span>
                                                </div>
                                                <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-1">
                                                    <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 sm:gap-2"><History className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500" /> Alert Date</span>
                                                    <span className="font-bold text-xs sm:text-sm text-slate-900">{sourced_date}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )
                            }
                        </div>
                    </div>

                    {/* RIGHT PANEL */}
                    {
                        isEditing ? (
                            <div className="hidden sm:flex flex-row w-full lg:w-[500px] shrink-0">
                                <EditForm
                                    post={post}
                                    project={project}
                                    clientDetails={clientDetails}
                                    setIsEditing={setIsEditing}
                                    onUpdatePost={onUpdatePost}
                                />
                            </div>
                        ) : (
                            <div className="relative w-full lg:w-[500px] bg-white flex flex-col lg:h-full shrink-0 border-t lg:border-t-0 border-slate-100">

                                {/* EDIT BUTTON HERE */}
                                <div className="hidden sm:block">
                                    <Button
                                        onClick={() => setIsEditing(true)}
                                        variant="ghost"
                                        className=" absolute top-4 right-4 z-10 w-fit h-fit bg-white text-slate-600 hover:text-slate-900 font-bold cursor-pointer border border-slate-200 hover:border-slate-200 "
                                    >
                                        <Pencil className="w-4 h-4 mr-1" />
                                        Edit
                                    </Button>
                                </div>

                                <div className="flex-none lg:flex-1 lg:overflow-y-auto p-4 sm:p-6 space-y-6 sm:space-y-8">

                                    {/* Threat Score Card */}
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Risk Assessment</h4>
                                        <div className={cn(
                                            "rounded-2xl p-6 border relative overflow-hidden shadow-lg transition-all",
                                            getRiskLabel(riskScore).color.replace('text-', 'bg-').replace('bg-', 'border-').replace('500', '600').replace('50', '500'),
                                            riskScore >= 76 ? "text-white" : "text-slate-900",
                                            riskScore >= 96 ? "bg-rose-600 border-rose-500 text-white" :
                                                riskScore >= 76 ? "bg-orange-500 border-orange-400 text-white" :
                                                    riskScore >= 41 ? "bg-amber-500 border-amber-400 text-white" :
                                                        "bg-slate-500 border-slate-400 text-white"
                                        )}>
                                            <div className="absolute top-0 right-0 p-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

                                            <div className="relative z-10 flex justify-between items-end">
                                                <div>
                                                    <p className="text-white/80 font-bold text-xs uppercase tracking-wide mb-1">Total Risk Score</p>
                                                    <div className="text-5xl font-black tracking-tighter flex items-baseline gap-2">
                                                        {getRiskLabel(riskScore).label}
                                                    </div>
                                                </div>
                                                {/* <div className="text-right">
                                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-bold uppercase mb-2 border border-white/10">
                                                <Activity className="w-3 h-3" /> AI Analysis
                                            </div>
                                            <p className="font-bold text-base leading-tight max-w-[120px] capitalize">{category}</p>
                                        </div> */}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Violation Grid */}
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Violations</h4>
                                        <div className="grid grid-cols-2 gap-3">
                                            <ViolationCard
                                                active={isPoiPresent}
                                                title="POI Detected"
                                                icon={ScanFace}
                                                color="indigo"
                                            />
                                            <ViolationCard
                                                active={isAigc}
                                                title="AI Generated"
                                                icon={Bot}
                                                color="purple"
                                            />

                                            {activeLabels.map((label, idx) => (
                                                <ViolationCard
                                                    key={idx}
                                                    active={true}
                                                    title={label.title}
                                                    icon={label.icon}
                                                    color={label.color}
                                                />
                                            ))}


                                        </div>
                                    </div>

                                    {/* Legal Framework Section */}
                                    {legalCodes.length > 0 && (
                                        <div className="space-y-4">
                                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                <Scale className="w-3.5 h-3.5" /> Legal Framework
                                            </h4>
                                            <div className="flex gap-2 flex-wrap">
                                                {legalCodes.map((code, idx) => {
                                                    const projectCode = project?.project_details?.legal_codes?.find(pc => pc.name === code);
                                                    return (
                                                        <ViolationCard
                                                            key={idx}
                                                            active={true}
                                                            title={code}
                                                            icon={Scale}
                                                            color="purple"
                                                            referenceLink={projectCode?.referenceLink}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Reasoning */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <Eye className="w-3.5 h-3.5" /> Review Analysis
                                        </h4>
                                        <div className="w-full bg-slate-50 p-5 rounded-xl border border-slate-100 text-slate-600 leading-relaxed text-sm font-medium whitespace-pre-wrap">
                                            {reasoning}
                                        </div>
                                    </div>

                                    {/* ASSIGN THE CASE TO A USER */}
                                    {
                                        clientDetails.role === "client-admin" && (
                                            <div className="space-y-3 hidden sm:block">
                                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                    <UserPlus className="w-3.5 h-3.5" /> Assignment
                                                </h4>
                                                <div className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
                                                    {!isAssignEditMode ? (
                                                        <>
                                                            <div className="flex-1 flex items-center gap-2">
                                                                <span className="text-sm text-slate-500 font-medium">Assigned to:</span>
                                                                <Badge variant="secondary" className="font-bold text-slate-700 bg-white border-slate-200">
                                                                    {assignedEmail}
                                                                </Badge>
                                                            </div>
                                                            <Button variant="ghost" size="sm" onClick={() => setIsAssignEditMode(true)} className="h-8 text-slate-500 hover:text-slate-900">
                                                                <Pencil className="w-4 h-4 mr-1.5" /> Edit
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="text-sm text-slate-500 font-medium whitespace-nowrap">Assign to:</span>
                                                            <select
                                                                value={assignedEmail}
                                                                onChange={(e) => setAssignedEmail(e.target.value)}
                                                                className="w-full bg-white border border-slate-200 rounded-md px-3 h-10 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                                                            >
                                                                <option value="">Select an email</option>
                                                                {projectEmails?.map((email) => (
                                                                    <option key={email} value={email}>
                                                                        {email}
                                                                    </option>
                                                                ))}
                                                            </select>

                                                            <Button
                                                                onClick={handleAssign}
                                                                disabled={!assignedEmail || isAssigning || assignedEmail === post?.assigned_to}
                                                                size="sm"
                                                                // variant="ghost"
                                                                className=" cursor-pointer disabled:cursor-not-allowed shrink-0 bg-blue-600 hover:bg-blue-700 text-white"
                                                            >
                                                                {isAssigning ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
                                                                Assign
                                                            </Button>

                                                            {/* Show a Cancel button only if it was already assigned previously to allow backing out of edit mode */}
                                                            {post?.assigned_to && (
                                                                <Button variant="ghost" size="sm"

                                                                    className=""
                                                                    onClick={() => {
                                                                        setAssignedEmail(post.assigned_to);
                                                                        setIsAssignEditMode(false);
                                                                    }}>
                                                                    Cancel
                                                                </Button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    }

                                    {/* Reviewer Note (MADE THIS REVIEWER ONLY FOR NOW) */}
                                    {/* {reviewerNote && (
                                        <div className="bg-amber-50 border border-amber-100 p-5 rounded-xl">
                                            <h4 className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-2 flex items-center">
                                                <User className="w-3.5 h-3.5 mr-1.5" /> Analyst Note
                                            </h4>
                                            <p className="text-amber-900/80 font-medium text-sm">
                                                {reviewerNote}
                                            </p>
                                        </div>
                                    )} */}

                                    {/* Client Notes Section */}
                                    <div className="space-y-4 hidden sm:block">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center">
                                            <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Review Notes
                                        </h4>

                                        {localNotes && localNotes.length > 0 ? (
                                            <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
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
                                        ) : (
                                            <p className="text-sm text-slate-400 italic">No notes added yet.</p>
                                        )}

                                        <div className="relative mt-2">
                                            <Textarea
                                                placeholder="Add a note..."
                                                className="min-h-[80px] pr-12 text-sm resize-none bg-white border-slate-200 focus-visible:ring-blue-500"
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

                                    {/* Audit Log / Update History */}
                                    {((Array.isArray(post.update_history) && post.update_history.length > 0) || post.content_reviewed_by) && (
                                        <div className="mt-4 p-4 border-t border-slate-100">
                                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                <History className="w-3.5 h-3.5" /> Action Log
                                            </h4>

                                            <div className="space-y-6 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[0.5px] before:bg-slate-200">
                                                {Array.isArray(post.update_history) && post.update_history.length > 0 ? (
                                                    post.update_history.slice().reverse().map((entry, idx) => {
                                                        const isEmail = /\S+@\S+\.\S+/.test(entry.updated_by);
                                                        return (
                                                            <div key={idx} className="relative pl-8 group">
                                                                <div className="absolute left-0 top-1.5 h-[22px] w-[22px] rounded-full bg-white border border-slate-200 flex items-center justify-center z-10 group-hover:border-blue-400 transition-colors">
                                                                    <div className="h-1.5 w-1.5 rounded-full bg-slate-300 group-hover:bg-blue-500 transition-colors" />
                                                                </div>
                                                                <div className="flex flex-col gap-1">
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                                                            <SafeDate date={entry.updated_at} formatStr="dd/MM/yyyy HH:mm" />
                                                                        </span>
                                                                        {/* DONT SHOW EMAILS FOR CASE ALERTING  */}
                                                                        {isEmail && !entry.changes_summary.includes("Case Alerted") && (
                                                                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50/50 border border-blue-100/50 px-2 py-0.5 rounded-full truncate max-w-[150px]" title={entry.updated_by}>
                                                                                {entry.updated_by}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-sm text-slate-600 font-medium leading-snug">
                                                                        {
                                                                            entry.changes_summary === "Manual ingestion from simplified JSON" ?
                                                                                "Content was sourced and ingested into the system."
                                                                                :
                                                                                entry.changes_summary
                                                                        }
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    /* Fallback for legacy content_reviewed_by if no update_history exists */
                                                    <div className="relative pl-8 group">
                                                        <div className="absolute left-0 top-1.5 h-[22px] w-[22px] rounded-full bg-white border border-slate-200 flex items-center justify-center z-10">
                                                            <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                                        </div>
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                                                    Last Review
                                                                </span>
                                                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50/50 border border-blue-100/50 px-2 py-0.5 rounded-full">
                                                                    {post.content_reviewed_by}
                                                                </span>
                                                            </div>
                                                            <p className="text-sm text-slate-600 font-medium">
                                                                Case reviewed and finalized.
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Original Publishing Date */}
                                                {(post.posted_date || post.metadata?.posted_date || post.timestamp || post.sourcing_date) && (
                                                    <div className="relative pl-8 group">
                                                        <div className="absolute left-0 top-1.5 h-[22px] w-[22px] rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center z-10 group-hover:border-slate-300 transition-colors">
                                                            <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                                        </div>
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                                                    <SafeDate date={post.posted_date || post.metadata?.posted_date || post.timestamp || post.sourcing_date} formatStr="dd/MM/yyyy HH:mm" />
                                                                </span>
                                                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100/50 border border-slate-100 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                                                    Published
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-slate-500 font-medium leading-snug italic">
                                                                Original content published on {post.platform || "source"}.
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                </div>

                                {/* Footer Action Area */}
                                <div className=" border-t border-slate-100 bg-white sticky bottom-0 z-10">



                                    {(isRequested) && (
                                        <div className="flex items-start gap-3 mb-4 p-4 bg-orange-50 rounded-xl border border-orange-100">
                                            <Info className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
                                            <div>
                                                <p className="text-sm font-bold text-orange-800">Takedown Suggested</p>
                                                <p className="text-xs text-orange-700 mt-1">Reviewer flagged this for immediate removal.</p>
                                            </div>
                                        </div>
                                    )}
                                    {
                                        showProcessed === post._id && (
                                            <div className="flex items-start gap-3 mb-4 p-4 bg-green-50 rounded-xl border border-green-100">
                                                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                                                <div>
                                                    <p className="text-sm font-bold text-green-800">Case Processed</p>
                                                    <p className="text-xs text-green-700 mt-1">This case has been processed.</p>
                                                </div>
                                            </div>
                                        )
                                    }

                                    <div className="flex flex-col items-center pb-4 pt-1 px-4">

                                        {isRaised ? (
                                            <div className="w-full flex flex-row gap-3 py-2">
                                                <div className="w-full h-12 font-bold text-white shadow-rose-900/20 bg-rose-600 opacity-100 cursor-default ring-2 ring-rose-700 ring-offset-2 flex items-center justify-center rounded-md">
                                                    <CheckCircle className="w-5 h-5 mr-2" />
                                                    Takedown in Progress
                                                </div>
                                                <a
                                                    href={`/takedowns/case/${post._id.toString()}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="w-full"
                                                >
                                                    <Button
                                                        variant="outline"
                                                        className="w-full h-12 border-slate-200 text-slate-700 hover:bg-slate-50 font-bold"
                                                    >
                                                        <ExternalLink className="w-4 h-4 mr-2 text-slate-500" />
                                                        Check Takedown Status
                                                    </Button>
                                                </a>

                                            </div>
                                        ) : (
                                            <div className="w-full flex flex-col sm:flex-row gap-3 sm:gap-4 py-2" >
                                                <Button
                                                    onClick={() => { if (clientStatus !== 'No Action' && clientStatus !== 'Pass') handleUpdateStatus('No Action') }}
                                                    disabled={isProcessing === 'No Action'}
                                                    className={cn(
                                                        "flex-1 h-12 font-bold text-white transition-all duration-200 shadow-emerald-900/20 bg-emerald-500",
                                                        (clientStatus === 'No Action' || clientStatus === 'Pass') ? "opacity-100 cursor-default ring-2 ring-emerald-600 ring-offset-2" : "opacity-50 hover:opacity-100 cursor-pointer hover:bg-emerald-600"
                                                    )}
                                                >
                                                    {isProcessing === 'No Action' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                                                    No Action
                                                </Button>
                                                <Button
                                                    onClick={() => { if (clientStatus !== 'Flag for Takedown') handleUpdateStatus('Flag for Takedown') }}
                                                    disabled={isProcessing === 'Flag for Takedown'}
                                                    className={cn(
                                                        "flex-1 h-12 font-bold text-white transition-all duration-200",
                                                        allowDoTakedown ? "shadow-amber-900/20 bg-amber-500" : "shadow-rose-900/20 bg-rose-600",
                                                        clientStatus === 'Flag for Takedown'
                                                            ? cn("opacity-100 cursor-default ring-2 ring-offset-2", allowDoTakedown ? "ring-amber-600" : "ring-rose-700")
                                                            : cn("opacity-50 hover:opacity-100 cursor-pointer", allowDoTakedown ? "hover:bg-amber-600" : "hover:bg-rose-700")
                                                    )}
                                                >
                                                    {isProcessing === 'Flag for Takedown' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
                                                    Flag for Takedown
                                                </Button>
                                                {allowDoTakedown && (
                                                    <Button
                                                        onClick={handleTakedown}
                                                        disabled={isProcessing === 'Takedown'}
                                                        className={cn(
                                                            "flex-1 h-12 font-bold text-white transition-all duration-200 shadow-rose-900/20 bg-rose-600",
                                                            cn("opacity-50 hover:opacity-100 cursor-pointer hover:bg-rose-700", clientStatus === 'To Be Reviewed' ? "opacity-100" : "")
                                                        )}
                                                    >
                                                        {isProcessing === 'Takedown' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldAlert className="w-4 h-4 mr-2" />}
                                                        Do Takedown
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                        <div onClick={() => trackClientClick('download_case_report', { page: 'CaseDetailPanel' })} className="flex gap-2">
                                            <CaseExportButton post={post} project={project} />
                                            <CaseExportDocxButton post={post} project={project} />
                                        </div>
                                    </div>
                                </div>

                            </div>
                        )
                    }
                </div>
            </div>
        </div >
    )
}

function ViolationCard({ active, title, icon: Icon, color, extra, referenceLink }) {
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
            <div className={cn("shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:rotate-6", iconBg)}>
                <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
                {/* <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 block leading-none mb-1">Signal</span> */}
                <span className="text-sm font-bold truncate block">{title}</span>
            </div>
            {referenceLink && (
                <a
                    href={referenceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-md hover:bg-black/5 transition-colors shrink-0"
                    title="View Reference"
                    onClick={(e) => e.stopPropagation()}
                >
                    <ExternalLink className="w-4 h-4 opacity-70" />
                </a>
            )}
            {/* <div className="absolute top-2 right-2">
                <div className="h-1.5 w-1.5 rounded-full bg-current animate-pulse opacity-40 shadow-[0_0_8px_currentColor]" />
            </div> */}
        </div>
    )
}