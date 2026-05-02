'use client'

import * as React from "react"
import { useState, useEffect, useActionState, useRef, useTransition } from 'react'
import { format } from "date-fns"
import { submitCaseReview, uploadCaseImage, updatePostVisibility, runAIAnalysis } from './actions'
import {
    Loader2, X, CheckCircle, ExternalLink,
    ChevronLeft, ChevronRight, Calendar, Plus,
    Instagram, Facebook, Youtube,
    Globe, MessageCircle, Quote,
    BadgeCheck, History, Bot, Siren, LinkIcon, Heart, Share2, Eye, Check, Upload, FileJson, RotateCcw, AlertCircle, RefreshCw,
    Sparkles, Clock, User, ShieldAlert, FileSearch, FileText, ChevronDown, ChevronUp
} from 'lucide-react'
import { Twitter, Reddit } from '@/utils/icons'
import ProfilePic from '@/components/ProfilePic'

import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const initialState = {
    success: false,
    error: null,
}

export default function ReviewForm({ post, project, clientDetails, onClose, onNavigate, hasPrev, hasNext, setPosts }) {
    const { project_details } = project
    // console.log(post)
    const submit_to_edit = submitCaseReview.bind(null, project, clientDetails)
    const [state, formAction, isPending] = useActionState(submit_to_edit, initialState)

    // 1. Maintain a local version of the post so the UI can update immediately
    const [localPost, setLocalPost] = useState(post);
    const [showSuccess, setShowSuccess] = useState(false);
    const [copied, setCopied] = useState(false);
    const [imgError, setImgError] = useState(false);

    // Image upload state
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
    const [mediaError, setMediaError] = useState(false);
    const fileInputRef = useRef(null);

    // Toast Notification State
    const [toast, setToast] = useState(null); // { message, type: 'success' | 'error' }

    const showToast = (message, type = 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };


    // Keep localPost in sync if the user navigates Next/Prev
    useEffect(() => {
        setLocalPost(post)
        setShowSuccess(false) // Reset success message on navigate
        setUploadedImageUrl(null);
        setMediaError(false);
    }, [post])

    // Sync state to parent AND local UI on successful submission
    useEffect(() => {
        if (state?.success && state?.updatedFields) {
            // Update parent list
            if (setPosts) {
                setPosts(prevPosts => prevPosts.map(p =>
                    p._id === localPost._id ? { ...p, ...state.updatedFields } : p
                ))
            }

            // Update local UI immediately (this makes the 'Reviewed' badge appear!)
            setLocalPost(prev => ({ ...prev, ...state.updatedFields }))

            // Trigger temporary success notification
            setShowSuccess(true)
            const timer = setTimeout(() => setShowSuccess(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [state]) // Run whenever the server action returns a new state

    // --- Data Normalization & Initialization (Using localPost now!) ---
    const review = localPost.review_details || {}
    const analysis = localPost.analysis_results || {}
    const analysisPoi = analysis.poi_check || {}
    const hasReview = Object.keys(review).length > 0

    const normalizeString = (str) => {
        if (typeof str !== 'string') return '';
        return str.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    };

    const getInitialThreatTypes = () => {
        const projectLabels = project_details.labels || [];

        if (hasReview) {
            return Array.from(new Set([
                ...(review.threat_types || []),
                ...(review.flags ? projectLabels.filter(l => review.flags[l.name]).map(l => l.name) : [])
            ]));
        }

        const matchedThreatTypes = new Set();

        for (const t of (analysis.threat_types || [])) {
            const normalizedT = normalizeString(t);
            const match = projectLabels.find(l => normalizeString(l.name) === normalizedT);
            if (match) matchedThreatTypes.add(match.name);
        }

        if (analysis.flags) {
            Object.entries(analysis.flags).forEach(([flagKey, value]) => {
                if (value) {
                    const normalizedKey = normalizeString(flagKey);
                    const match = projectLabels.find(l => normalizeString(l.name) === normalizedKey);
                    if (match) matchedThreatTypes.add(match.name);
                }
            });
        }

        return Array.from(matchedThreatTypes);
    };

    const initialThreatTypes = getInitialThreatTypes();

    const getInitialLegalCodes = () => {
        const projectLegalCodes = project_details.legal_codes || [];
        const codes = [];

        if (hasReview) {
            for (const item of (review.legal_codes || [])) {
                const codeName = typeof item === 'string' ? item : item.code;
                const reasoning = typeof item === 'string' ? '' : item.reasoning || '';
                if (!codes.some(c => c.code === codeName)) {
                    codes.push({ code: codeName, reasoning });
                }
            }
            return codes;
        }

        for (const item of (analysis.legal_codes || [])) {
            const rawCodeName = typeof item === 'string' ? item : item.code;
            const reasoning = typeof item === 'string' ? '' : item.reasoning || '';
            const normalizedRaw = normalizeString(rawCodeName);

            const match = projectLegalCodes.find(c => normalizeString(c.name) === normalizedRaw);

            if (match) {
                if (!codes.some(c => c.code === match.name)) {
                    codes.push({ code: match.name, reasoning });
                }
            }
        }
        return codes;
    }
    const initialLegalCodes = getInitialLegalCodes();

    // State
    const [facePresent, setFacePresent] = useState(hasReview ? !!review.face_present : (analysis.face_present ?? !!analysisPoi.face_present))
    const [namePresent, setNamePresent] = useState(hasReview ? !!review.name_present : (analysis.name_present ?? !!analysisPoi.poi_name_found))
    const [poiNames, setPoiNames] = useState((hasReview ? review.poi_names : (analysis.poi_names || analysisPoi.poi_names)) || [])
    const [newPoiInput, setNewPoiInput] = useState('')
    const [threatScore, setThreatScore] = useState(hasReview ? (review.threat_score ?? 0) : (analysis.threat_score ?? 0))
    const [threatTypes, setThreatTypes] = useState(initialThreatTypes)
    const [selectedLegalCodes, setSelectedLegalCodes] = useState(initialLegalCodes)
    const [isAIGC, setIsAIGC] = useState(hasReview ? !!review.is_aigc : !!analysis.is_aigc)
    const [visibilityStatus, setVisibilityStatus] = useState(localPost.visibility_status === 'down' ? 'down' : 'online')

    const reasoningRef = useRef(null)
    const reviewerCommentsRef = useRef(null)

    const poiPresent = facePresent || namePresent

    // Dates
    const rawPostedDate = localPost.posted_date || localPost.metadata?.posted_date || localPost.timestamp || localPost.sourcing_date
    const rawSourcedDate = localPost.metadata?.created_at || localPost.created_at
    const posted_date = rawPostedDate ? format(new Date(rawPostedDate), "dd/MM/yyyy") : "N/A"
    const sourced_date = rawSourcedDate ? format(new Date(rawSourcedDate), "dd/MM/yyyy") : "N/A"

    const default_reviewer_analysis = hasReview ? (review.reasoning || '') : (analysis.reasoning || '')
    const [showAIInsights, setShowAIInsights] = useState(!hasReview)

    // --- Handlers ---
    const [isPendingAnalysis, startAnalysisTransition] = useTransition()

    const handleRunAIAnalysis = () => {
        startAnalysisTransition(async () => {
            const result = await runAIAnalysis(localPost._id, project, clientDetails)
            if (result.success) {
                showToast('AI Analysis requested successfully. Data will be updated shortly.', 'success')
            } else {
                showToast('Failed to request AI analysis: ' + result.error)
            }
        })
    }

    const handleAddPoi = () => {
        const trimmed = newPoiInput.trim()
        if (trimmed && !poiNames.some(name => name.toLowerCase() === trimmed.toLowerCase())) {
            setPoiNames([...poiNames, trimmed])
        }
        setNewPoiInput('')
    }

    const handleRemovePoi = (index) => {
        setPoiNames(poiNames.filter((_, i) => i !== index))
    }

    const toggleThreatType = (type) => {
        setThreatTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
    }

    const toggleLegalCode = (code) => {
        setSelectedLegalCodes(prev => {
            if (prev.some(c => c.code === code)) {
                return prev.filter(c => c.code !== code)
            } else {
                return [...prev, { code, reasoning: '' }]
            }
        })
    }

    const updateLegalCodeReasoning = (code, reasoning) => {
        setSelectedLegalCodes(prev => prev.map(c =>
            c.code === code ? { ...c, reasoning } : c
        ))
    }

    const handleVisibilityChange = async (checked) => {
        const newStatus = checked ? 'online' : 'down'
        setVisibilityStatus(newStatus)

        try {
            const result = await updatePostVisibility(localPost._id, project, clientDetails, newStatus)
            if (result.success) {
                showToast(`Status updated to ${newStatus === 'online' ? 'Online' : 'Taken Down'}`, "success")

                // Update parent list if needed
                if (setPosts) {
                    setPosts(prevPosts => prevPosts.map(p =>
                        p._id === localPost._id ? { ...p, visibility_status: newStatus } : p
                    ))
                }
            } else {
                showToast('Failed to update status: ' + result.error)
                // Revert state on failure
                setVisibilityStatus(visibilityStatus)
            }
        } catch (error) {
            showToast('Failed to update status. Please try again.')
            setVisibilityStatus(visibilityStatus)
        }
    }

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Client-side validation
        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file.');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showToast('File size must be under 10MB.');
            return;
        }

        setIsUploadingImage(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const result = await uploadCaseImage(localPost._id, project, clientDetails, formData);
            if (result.success) {
                setUploadedImageUrl(result.signedUrl);

                // Update parent list if needed
                if (setPosts) {
                    setPosts(prevPosts => prevPosts.map(p =>
                        p._id === localPost._id ? { ...p, signedImageUrl: result.signedUrl } : p
                    ))
                }

                // Update local UI immediately
                setLocalPost(prev => ({ ...prev, signedImageUrl: result.signedUrl }))

                showToast("Image uploaded successfully", "success");
            } else {
                showToast('Upload failed: ' + result.error);
            }
        } catch (error) {
            showToast('Upload failed. Please try again.');
        } finally {
            setIsUploadingImage(false);
            // Reset file input so the same file can be uploaded again
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleReset = () => {
        setFacePresent(false)
        setNamePresent(false)
        setPoiNames([])
        setNewPoiInput('')
        setThreatScore(0)
        setThreatTypes([])
        setSelectedLegalCodes([])
        setIsAIGC(false)
        setVisibilityStatus(localPost.visibility_status === 'down' ? 'down' : 'online')
        if (reasoningRef.current) reasoningRef.current.value = ''
        if (reviewerCommentsRef.current) reviewerCommentsRef.current.value = ''
    }

    const handleCopyLink = () => {
        const url = `${window.location.origin}/review-cases/${post._id}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownloadJSON = () => {
        try {
            const jsonString = JSON.stringify([localPost], null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `case_${localPost._id}_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Download Error:', error);
            alert('Failed to download JSON. Please try again.');
        }
    };

    const PlatformIcon = () => {
        const platform = localPost.platform?.toLowerCase()
        if (["twitter", "x"].includes(platform)) return <span className="inline-block size-4 text-black"><Twitter /></span>
        if (platform === "reddit") return <Reddit className="w-6 h-6 text-pink-500" />
        if (platform === "instagram") return <Instagram className="w-6 h-6 text-pink-500" />
        if (platform === "facebook") return <Facebook className="w-6 h-6 text-blue-500" />
        if (platform === "youtube") return <Youtube className="w-6 h-6 text-red-500 fill-red-500 stroke-white stroke-[1px]" />
        if (platform === "website") return <Globe className="w-6 h-6 text-slate-500" />
        return <p className="text-slate-500 font-medium truncate">{localPost.platform}</p>
    }

    return (
        <div className="h-full flex flex-col bg-white">

            <div className="flex-1 overflow-hidden flex divide-x divide-slate-100">
                {/* Left: Source Content (Scrollable) */}
                <div className="flex-1 overflow-y-auto space-y-4 bg-slate-50/50">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                                <Siren className="w-5 h-5 text-slate-500" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-slate-900 leading-tight">Content Review</h2>
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
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleCopyLink}
                                className="h-9 w-9 text-slate-500 hover:text-blue-600 rounded-full"
                                title="Copy case link"
                            >
                                {copied ? <Check className="w-5 h-5 text-green-500" /> : <LinkIcon className="w-5 h-5" />}
                            </Button>

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleDownloadJSON}
                                className="h-9 w-9 text-slate-500 hover:text-emerald-600 rounded-full"
                                title="Download JSON"
                            >
                                <FileJson className="w-5 h-5" />
                            </Button>

                            {/* {isRequested && (
                                <Badge className="bg-orange-50 text-orange-700 border-orange-200 gap-1.5 pl-2 animate-pulse">
                                    <Siren className="w-3.5 h-3.5" /> Takedown Requested
                                </Badge>
                            )} */}
                            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-slate-100 text-slate-400">
                                <X className="w-6 h-6" />
                            </Button>
                        </div>
                    </div>

                    <div className=" flex flex-col gap-8 px-8 pb-8  ">
                        {/* Media Display */}
                        <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-lg border border-slate-800 relative group flex items-center justify-center min-h-[400px]">
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800/50 to-slate-950 pointer-events-none" />
                            {uploadedImageUrl ? (
                                <img
                                    src={uploadedImageUrl}
                                    alt="Evidence"
                                    className="max-w-full h-auto max-h-[600px] object-contain relative z-10"
                                />
                            ) : localPost.signedImageUrl && !mediaError ? (
                                <img
                                    src={localPost.signedImageUrl}
                                    alt="Evidence"
                                    className="max-w-full h-auto max-h-[600px] object-contain relative z-10"
                                    onError={() => setMediaError(true)}
                                />
                            ) : localPost.signedImageUrl && mediaError ? (
                                <div
                                    className="text-center p-12 relative z-10 cursor-pointer group/upload"
                                    onClick={() => !isUploadingImage && fileInputRef.current?.click()}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleImageUpload}
                                    />
                                    <div className="border-2 border-dashed border-slate-600 group-hover/upload:border-blue-500 rounded-xl p-12 transition-colors duration-200">
                                        {isUploadingImage ? (
                                            <>
                                                <Loader2 className="w-16 h-16 text-blue-400 mx-auto mb-4 animate-spin" />
                                                <p className="text-slate-400 font-medium text-lg">Uploading...</p>
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="w-16 h-16 text-slate-600 group-hover/upload:text-blue-400 mx-auto mb-4 transition-colors duration-200" />
                                                <p className="text-slate-400 group-hover/upload:text-slate-300 font-medium text-lg transition-colors duration-200">Click to upload image</p>
                                                <p className="text-slate-600 text-sm mt-2">PNG, JPG, WEBP up to 10MB</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className="text-center p-12 relative z-10 cursor-pointer group/upload"
                                    onClick={() => !isUploadingImage && fileInputRef.current?.click()}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleImageUpload}
                                    />
                                    <div className="border-2 border-dashed border-slate-600 group-hover/upload:border-blue-500 rounded-xl p-12 transition-colors duration-200">
                                        {isUploadingImage ? (
                                            <>
                                                <Loader2 className="w-16 h-16 text-blue-400 mx-auto mb-4 animate-spin" />
                                                <p className="text-slate-400 font-medium text-lg">Uploading...</p>
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="w-16 h-16 text-slate-600 group-hover/upload:text-blue-400 mx-auto mb-4 transition-colors duration-200" />
                                                <p className="text-slate-400 group-hover/upload:text-slate-300 font-medium text-lg transition-colors duration-200">Click to upload image</p>
                                                <p className="text-slate-600 text-sm mt-2">PNG, JPG, WEBP up to 10MB</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Unified User Context & Caption Card */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                            <div className="p-5 flex items-center gap-5">
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
                                        <div className="">
                                            {/* platform */}
                                            <div className="flex-1 min-w-4">
                                                {
                                                    post.platform === "x" || post.platform === "twitter" ? (
                                                        <span className="inline-block size-4 text-black">
                                                            <Twitter className="w-3.5 h-3.5 text-slate-900" />
                                                        </span>
                                                    ) : post.platform?.toLowerCase() === "reddit" ? (
                                                        <span className="inline-block size-7 text-black">
                                                            <Reddit className="w-3.5 h-3.5" />
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
                                        {visibilityStatus === 'down' ? (
                                            <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200">Taken Down</Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">Online</Badge>
                                        )}
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
                                    <div className="space-y-6">
                                        <div className="flex flex-row gap-4">
                                            <div className="w-full bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-row justify-between gap-1">
                                                <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Heart className="w-3.5 h-3.5 text-rose-500" /> Likes</span>
                                                <span className="font-bold text-lg text-slate-900">{post.stats?.like_count?.toLocaleString() || 0}</span>
                                            </div>
                                            <div className="w-full bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-row justify-between gap-1">
                                                <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><MessageCircle className="w-3.5 h-3.5 text-blue-500" /> Comments</span>
                                                <span className="font-bold text-lg text-slate-900">{post.stats?.comment_count?.toLocaleString() || 0}</span>
                                            </div>
                                            <div className="w-full bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-row justify-between gap-1">
                                                <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Share2 className="w-3.5 h-3.5 text-green-500" /> Shares</span>
                                                <span className="font-bold text-lg text-slate-900">{post.stats?.share_count?.toLocaleString() || 0}</span>
                                            </div>
                                            {
                                                post.stats?.view_count > 0 && (
                                                    <div className="w-full bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-row justify-between gap-1">
                                                        <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Eye className="w-3.5 h-3.5 text-violet-600" /> Views</span>
                                                        <span className="font-bold text-lg text-slate-900">{post.stats?.view_count?.toLocaleString() || 0}</span>
                                                    </div>
                                                )
                                            }
                                        </div>
                                        <div className="grid grid-cols-2 gap-10">
                                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-1">
                                                <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-slate-500" /> Publish Date</span>
                                                <span className="font-bold text-sm text-slate-900">{posted_date}</span>
                                            </div>
                                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-1">
                                                <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><History className="w-3.5 h-3.5 text-slate-500" /> Alert Date</span>
                                                <span className="font-bold text-sm text-slate-900">{sourced_date}</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )
                        }
                    </div>
                </div>

                {/* RIGHT COLUMN: Action Form */}
                <div className="w-[500px] shrink-0 overflow-y-auto bg-white">
                    {/* TOP PANNEL */}
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20">
                        <div className="flex items-center gap-4">
                            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Review Case</h2>
                            {/* The Badge will now appear instantly upon saving! */}
                            {hasReview && (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 pl-2 animate-in zoom-in fade-in duration-300">
                                    <CheckCircle className="w-3.5 h-3.5" /> Reviewed
                                </Badge>
                            )}
                            <div className="h-4 w-px bg-slate-200 mx-2" />
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" onClick={() => onNavigate('prev')} disabled={!hasPrev || isPending} className="h-8 w-8 text-slate-500 hover:text-blue-600">
                                    <ChevronLeft className="h-5 w-5" />
                                </Button>
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-1">Nav</span>
                                <Button variant="ghost" size="icon" onClick={() => onNavigate('next')} disabled={!hasNext || isPending} className="h-8 w-8 text-slate-500 hover:text-blue-600">
                                    <ChevronRight className="h-5 w-5" />
                                </Button>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-slate-100 text-slate-500">
                            <X className="h-6 w-6" />
                        </Button>
                    </div>
                    <form action={formAction} className="flex flex-col min-h-full">

                        {/* Data Mapping for Action State */}
                        {Array.from(new Set([
                            ...project_details.labels.map(l => l.name),
                            ...threatTypes
                        ])).map((labelName, index) => (
                            <input key={`flag_${index}`} type="hidden" name={`flag_${labelName}`} value={threatTypes.includes(labelName) ? 'on' : 'off'} />
                        ))}
                        {Array.from(new Set([
                            ...(project_details.legal_codes || []).map(c => c.name),
                            ...selectedLegalCodes.map(c => c.code)
                        ])).map((codeName, index) => {
                            const selected = selectedLegalCodes.find(c => c.code === codeName);
                            return (
                                <React.Fragment key={`legal_${index}`}>
                                    <input type="hidden" name={`legal_code_${codeName}`} value={selected ? 'on' : 'off'} />
                                    {selected && <input type="hidden" name={`legal_reasoning_${codeName}`} value={selected.reasoning} />}
                                </React.Fragment>
                            );
                        })}
                        <input type="hidden" name="mongo_id" value={localPost._id || ''} />
                        <input type="hidden" name="platform" value={localPost.platform || 'Instagram'} />
                        <input type="hidden" name="poi_names" value={poiNames.join(',')} />
                        <input type="hidden" name="poi_present" value={poiPresent.toString()} />
                        <input type="hidden" name="poi_confirmed" value={poiPresent ? 'on' : 'off'} />
                        <input type="hidden" name="is_aigc" value={isAIGC ? 'on' : 'off'} />
                        <input type="hidden" name="face_present" value={facePresent.toString()} />
                        <input type="hidden" name="name_present" value={namePresent.toString()} />
                        <input type="hidden" name="threat_score" value={threatScore} />
                        <input type="hidden" name="takedown_status" value={localPost.takedown_info?.takedown_status || 'None'} />
                        <input type="hidden" name="visibility_status" value={visibilityStatus} />

                        <div className="p-5 md:p-6 space-y-6 flex-1 relative flex flex-col mx-auto w-full">

                            {/**adding edit logic for the Status of the post Online/Offline */}
                            <section className="space-y-3">
                                <div className="flex justify-end items-center gap-1.5 mb-1.5">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleRunAIAnalysis}
                                        disabled={isPendingAnalysis}
                                        className=" cursor-pointer h-7 px-3 text-xs rounded-full bg-blue-50/50 text-blue-600 border-blue-200 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                                    >
                                        {isPendingAnalysis ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
                                        Re-run AI Analysis
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost" size="sm"
                                        onClick={handleReset}
                                        className="cursor-pointer h-7 px-3 text-xs rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                                    >
                                        <RotateCcw className="w-3 h-3 mr-1.5" />
                                        Reset Form
                                    </Button>
                                </div>
                                <div className="flex items-center justify-start gap-2 mb-1">
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">1</span>
                                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Visibility Status</h3>
                                    </div>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all shadow-inner",
                                            visibilityStatus === 'online' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-slate-100 border-slate-200 text-slate-400"
                                        )}>
                                            {visibilityStatus === 'online' ? <Globe className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">{visibilityStatus === 'online' ? 'Online' : 'Taken Down'}</p>
                                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Current Status on Source</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={cn("text-[10px] font-bold uppercase tracking-widest", visibilityStatus === 'down' ? "text-slate-900" : "text-slate-400")}>Down</span>
                                        <Switch
                                            checked={visibilityStatus === 'online'}
                                            onCheckedChange={handleVisibilityChange}
                                        />
                                        <span className={cn("text-[10px] font-bold uppercase tracking-widest", visibilityStatus === 'online' ? "text-slate-900" : "text-slate-400")}>Online</span>
                                    </div>
                                </div>
                            </section>

                            {/* 5. AI INSIGHTS & EVIDENCE */}
                            <section className="space-y-3">
                                <div className="flex items-center justify-between mb-1 cursor-pointer group" onClick={() => setShowAIInsights(!showAIInsights)}>
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                                            <Sparkles className="w-3.5 h-3.5" />
                                        </span>
                                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider group-hover:text-indigo-600 transition-colors">AI Context & Evidence</h3>
                                    </div>
                                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-slate-400 group-hover:text-indigo-600 transition-colors">
                                        {showAIInsights ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </Button>
                                </div>

                                {showAIInsights && (
                                    <div className="bg-indigo-50/30 rounded-xl p-4 border border-indigo-100 shadow-sm space-y-4 animate-in slide-in-from-top-2 fade-in duration-200">
                                        {analysis.takedown_timeline && (
                                            <div className="flex items-center justify-between bg-rose-50 border border-rose-100 p-3 rounded-lg shadow-sm">
                                                <div className="flex items-center gap-2">
                                                    <Clock className="w-4 h-4 text-rose-600" />
                                                    <span className="text-xs font-bold text-rose-900 uppercase tracking-wider">Recommended Takedown</span>
                                                </div>
                                                <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-rose-200 shadow-none font-bold">{analysis.takedown_timeline}</Badge>
                                            </div>
                                        )}

                                        {analysis.profile_summary && (
                                            <div className="space-y-1.5">
                                                <h5 className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1.5">
                                                    <User className="w-3 h-3" /> Profile Summary
                                                </h5>
                                                <div className="p-3 rounded-lg border border-indigo-100 bg-white text-xs text-slate-700 leading-relaxed shadow-sm">
                                                    {analysis.profile_summary}
                                                </div>
                                            </div>
                                        )}

                                        {analysis.misinformation_explanation && (
                                            <div className="space-y-1.5">
                                                <h5 className="text-[10px] font-bold text-orange-600 uppercase tracking-widest flex items-center gap-1.5">
                                                    <ShieldAlert className="w-3 h-3" /> Misinformation Analysis
                                                </h5>
                                                <div className="p-3 rounded-lg border border-orange-100 bg-orange-50/50 text-xs text-slate-700 leading-relaxed shadow-sm">
                                                    {analysis.misinformation_explanation}
                                                </div>
                                            </div>
                                        )}

                                        {analysis.aigc_forensic_summary && (
                                            <div className="space-y-1.5">
                                                <h5 className="text-[10px] font-bold text-purple-600 uppercase tracking-widest flex items-center gap-1.5">
                                                    <FileSearch className="w-3 h-3" /> AIGC Forensic Summary
                                                </h5>
                                                <div className="p-3 rounded-lg border border-purple-100 bg-purple-50/50 text-xs text-slate-700 leading-relaxed shadow-sm">
                                                    {analysis.aigc_forensic_summary}
                                                </div>
                                            </div>
                                        )}

                                        {analysis.anti_india_reasoning && (
                                            <div className="space-y-1.5">
                                                <h5 className="text-[10px] font-bold text-red-600 uppercase tracking-widest flex items-center gap-1.5">
                                                    <AlertCircle className="w-3 h-3" /> Policy Violation Focus
                                                </h5>
                                                <div className="p-3 rounded-lg border border-red-100 bg-red-50/50 text-xs text-slate-700 leading-relaxed shadow-sm">
                                                    {analysis.anti_india_reasoning}
                                                </div>
                                            </div>
                                        )}

                                        {analysis.reasoning && (
                                            <div className="space-y-1.5">
                                                <h5 className="text-[10px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
                                                    <FileText className="w-3 h-3" /> General Reasoning
                                                </h5>
                                                <div className="p-3 rounded-lg border border-blue-100 bg-blue-50/50 text-xs text-slate-700 leading-relaxed shadow-sm">
                                                    {analysis.reasoning}
                                                </div>
                                            </div>
                                        )}

                                        {analysis.urls && analysis.urls.length > 0 && (
                                            <div className="space-y-2 pt-2 border-t border-indigo-100/50">
                                                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                                    <LinkIcon className="w-3 h-3" /> References & Grounding Sources
                                                </h5>
                                                <div className="flex flex-col gap-1.5">
                                                    {analysis.urls.map((url, i) => (
                                                        <a key={i} href={url} target="_blank" rel="noreferrer" title={url} className="text-[11px] text-blue-600 hover:text-blue-800 hover:bg-blue-100 truncate flex items-center gap-2 bg-blue-50/50 p-2 rounded-md border border-blue-100 transition-colors">
                                                            <ExternalLink className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                                                            <span className="truncate">{url}</span>
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </section>

                            {/* 1. VERDICT & RISK LEVEL (Moved to Top) */}
                            <section className="space-y-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">2</span>
                                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Verdict & Risk Level</h3>
                                </div>

                                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 shadow-sm">
                                    <div className="flex gap-2">
                                        {[
                                            { label: "Safe", val: 0, active: threatScore < 41, color: "bg-emerald-500 border-emerald-600 shadow-emerald-200" },
                                            { label: "Low Risk", val: 41, active: threatScore > 40 && threatScore < 76, color: "bg-amber-400 border-amber-500 shadow-amber-200" },
                                            { label: "Medium Risk", val: 76, active: threatScore > 75 && threatScore < 96, color: "bg-orange-400 border-orange-500 shadow-orange-200" },
                                            { label: "High Risk", val: 96, active: threatScore > 95, color: "bg-rose-500 border-rose-600 shadow-rose-200" },
                                        ].map((level) => (
                                            <button
                                                key={level.label}
                                                type="button"
                                                onClick={() => setThreatScore(level.val)}
                                                className={cn(
                                                    "flex-1 py-2.5 px-3 rounded-lg border cursor-pointer text-xs sm:text-sm font-bold transition-all",
                                                    level.active
                                                        ? `${level.color} text-white border-b-0 translate-y-[1px]`
                                                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                                                )}
                                            >
                                                {level.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </section>

                            {/* 2. THREAT CLASSIFICATION */}
                            <section className="space-y-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">3</span>
                                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">VIOLATIONS</h3>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {/* AIGC Toggle (Spans full width or 1 col depending on preference, set to full width here for emphasis) */}
                                    <label
                                        className={cn(
                                            "col-span-1 sm:col-span-2 flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-200 group",
                                            isAIGC ? "bg-blue-50/50 border-blue-200 shadow-sm ring-1 ring-blue-100" : "bg-slate-50/30 border-slate-200 hover:border-blue-200 hover:bg-white"
                                        )}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={cn(
                                                "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                                                isAIGC ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-400"
                                            )}>
                                                <Bot className="w-5 h-5" />
                                            </div>
                                            <span className={cn("text-xs font-bold uppercase tracking-wider", isAIGC ? "text-blue-900" : "text-slate-500")}>
                                                AI Generated Content
                                            </span>
                                        </div>
                                        <Checkbox
                                            checked={isAIGC}
                                            onCheckedChange={(checked) => setIsAIGC(checked)}
                                            className={cn("w-5 h-5 border-2 transition-all", isAIGC ? "bg-blue-600 border-blue-600" : "border-slate-300 group-hover:border-blue-300")}
                                        />
                                    </label>

                                    {/* Dynamic Threat Categories */}
                                    {project_details.labels.map((item) => (
                                        <label
                                            key={item.name}
                                            className={cn(
                                                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm",
                                                threatTypes.includes(item.name) ? "bg-blue-50 border-blue-200 ring-1 ring-blue-200" : "bg-white border-slate-200 hover:border-blue-200"
                                            )}
                                        >
                                            <Checkbox
                                                checked={threatTypes.includes(item.name)}
                                                onCheckedChange={() => toggleThreatType(item.name)}
                                                className="border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                            />
                                            <span className={cn("text-xs font-bold uppercase", threatTypes.includes(item.name) ? "text-blue-700" : "text-slate-600")}>
                                                {item.name}
                                            </span>
                                        </label>
                                    ))}
                                </div>

                                {/* Legal Framework Codes */}
                                {(project_details.legal_codes || []).length > 0 && (
                                    <div className="pt-2">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Legal Framework Codes</h4>
                                        <div className="grid grid-cols-1 gap-3">
                                            {project_details.legal_codes.map((item) => {
                                                const selected = selectedLegalCodes.find(c => c.code === item.name);
                                                const isSelected = !!selected;
                                                return (
                                                    <div
                                                        key={item.name}
                                                        className={cn(
                                                            "flex flex-col gap-2 p-3 rounded-lg border transition-all hover:shadow-sm",
                                                            isSelected ? "bg-purple-50 border-purple-200 ring-1 ring-purple-200" : "bg-white border-slate-200 hover:border-purple-200"
                                                        )}
                                                    >
                                                        <label className="flex items-center gap-3 cursor-pointer">
                                                            <Checkbox
                                                                checked={isSelected}
                                                                onCheckedChange={() => toggleLegalCode(item.name)}
                                                                className="border-slate-300 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                                            />
                                                            <span className={cn("text-xs font-bold uppercase", isSelected ? "text-purple-700" : "text-slate-600")}>
                                                                {item.name}
                                                            </span>
                                                        </label>
                                                        {isSelected && (
                                                            <Textarea
                                                                value={selected.reasoning}
                                                                onChange={(e) => updateLegalCodeReasoning(item.name, e.target.value)}
                                                                placeholder={`Provide reasoning for selecting ${item.name}...`}
                                                                className="mt-2 text-sm bg-white border-purple-200 min-h-[60px]"
                                                            />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </section>

                            {/* 3. POI IDENTIFICATION */}
                            <section className="space-y-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">4</span>
                                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">POI Context</h3>
                                </div>

                                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4">
                                    {/* Toggles placed side-by-side to save space */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
                                            <Label htmlFor="face-present" className="text-sm font-semibold text-slate-700 cursor-pointer">Face Detected</Label>
                                            <Switch id="face-present" checked={facePresent} onCheckedChange={setFacePresent} />
                                        </div>
                                        <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
                                            <Label htmlFor="name-present" className="text-sm font-semibold text-slate-700 cursor-pointer">Name Mentioned</Label>
                                            <Switch id="name-present" checked={namePresent} onCheckedChange={setNamePresent} />
                                        </div>
                                    </div>

                                    <Separator className="bg-slate-200" />

                                    <div className="space-y-3">
                                        <Label className="text-xs font-bold text-slate-500 uppercase">Tagged Subjects</Label>
                                        <div className="flex flex-wrap gap-2 min-h-[32px] items-center">
                                            {poiNames.map((name, index) => (
                                                <Badge key={index} variant="secondary" className="pl-2.5 pr-1 py-1 h-7 bg-white border border-blue-200 text-blue-700 shadow-sm flex items-center gap-1">
                                                    {name}
                                                    <button type="button" onClick={() => handleRemovePoi(index)} className="hover:bg-red-50 hover:text-red-600 rounded-full p-0.5 transition-colors">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </Badge>
                                            ))}
                                            {poiNames.length === 0 && <span className="text-xs text-slate-400 italic">No tags added</span>}
                                        </div>

                                        <div className="flex gap-2">
                                            <Input
                                                value={newPoiInput}
                                                onChange={(e) => setNewPoiInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPoi())}
                                                placeholder="Add subject name..."
                                                className="h-9 bg-white text-sm"
                                            />
                                            <Button type="button" onClick={handleAddPoi} size="sm" className="h-9 px-4 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">
                                                <Plus className="w-4 h-4 mr-1" /> Add
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* 6. ANALYSIS & NOTES (Grouped textareas at the bottom) */}
                            <section className="space-y-4 pt-2">
                                <div className="grid grid-cols-1 gap-8">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-500 uppercase flex justify-between">
                                            <span>Reviewer Final Analysis</span>
                                        </Label>
                                        <Textarea
                                            ref={reasoningRef}
                                            name="reasoning"
                                            defaultValue={default_reviewer_analysis}
                                            placeholder="Enter your final analysis reasoning here..."
                                            className="min-h-[100px] bg-slate-50 border-slate-200 text-sm focus:bg-white transition-colors resize-y"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                            Reviewer Notes
                                            <Badge variant="outline" className="text-[10px] uppercase bg-amber-50 text-amber-700 border-amber-200">Internal Only &nbsp; | &nbsp; Not visible to end users</Badge>
                                        </Label>
                                        <Textarea
                                            ref={reviewerCommentsRef}
                                            name="reviewer_comments"
                                            defaultValue={review.reviewer_comments || ''}
                                            placeholder="Add private context or notes for other reviewers..."
                                            className="min-h-[80px] bg-white border-slate-200 text-sm focus:border-blue-500 resize-y"
                                        />
                                    </div>
                                </div>
                            </section>

                        </div>

                        {/* Sticky Footer with Floating Notification */}
                        <div className="relative p-6 bg-white border-t border-slate-100 sticky bottom-0 z-10">

                            {/* Floating Success Toast */}
                            {showSuccess && (
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-emerald-100 border border-emerald-300 text-slate-700 text-xs font-bold px-4 py-2 rounded-full shadow shadow-emerald-200 flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in zoom-in duration-200">
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 stroke-2 " />
                                    Review saved successfully!
                                </div>
                            )}

                            {/* Floating Toast Notification */}
                            {toast && (
                                <div className={cn(
                                    "absolute -top-12 left-1/2 -translate-x-1/2 border text-xs font-bold px-4 py-2 rounded-full shadow flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in zoom-in duration-200",
                                    toast.type === 'success' ? "bg-emerald-100 border-emerald-300 text-emerald-800" : "bg-rose-100 border-rose-300 text-rose-800"
                                )}>
                                    {toast.type === 'success' ? <CheckCircle className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                                    {toast.message}
                                </div>
                            )}

                            <div className="flex gap-3">
                                <Button type="button" variant="outline" onClick={onClose} className="flex-1 font-bold border-slate-200 text-slate-600">
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={isPending}
                                    className="flex-[2] font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20"
                                >
                                    {isPending ? <Loader2 className="animate-spin" /> : (hasReview ? 'Update Review' : 'Submit to Client')}
                                </Button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}