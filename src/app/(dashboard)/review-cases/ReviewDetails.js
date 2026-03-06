'use client'

import * as React from "react"
import { useState, useEffect, useActionState } from 'react'
import { format } from "date-fns"
import { submitCaseReview } from './actions'
import {
    Loader2, X, CheckCircle, ExternalLink,
    ChevronLeft, ChevronRight, Calendar, Plus,
    Instagram, Facebook, Youtube, Globe, MessageCircle, Quote,
    BadgeCheck, History, Bot
} from 'lucide-react'
import { Twitter } from '@/utils/icons'
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

export default function ReviewForm({ post, project_details, onClose, onNavigate, hasPrev, hasNext, setPosts }) {
    // console.log(post)
    const [state, formAction, isPending] = useActionState(submitCaseReview, initialState)

    // 1. Maintain a local version of the post so the UI can update immediately
    const [localPost, setLocalPost] = useState(post)
    const [showSuccess, setShowSuccess] = useState(false)

    // Keep localPost in sync if the user navigates Next/Prev
    useEffect(() => {
        setLocalPost(post)
        setShowSuccess(false) // Reset success message on navigate
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

    const initialThreatTypes = Array.from(new Set([
        ...(review.threat_types || []),
        ...(hasReview && review.flags
            ? project_details.labels.filter(l => review.flags[l.name]).map(l => l.name)
            : [])
    ]))

    // State
    const [facePresent, setFacePresent] = useState(hasReview ? !!review.face_present : !!analysisPoi.face_present)
    const [namePresent, setNamePresent] = useState(hasReview ? !!review.name_present : !!analysisPoi.poi_name_found)
    const [poiNames, setPoiNames] = useState((hasReview ? review.poi_names : analysisPoi.poi_names) || [])
    const [newPoiInput, setNewPoiInput] = useState('')
    const [threatScore, setThreatScore] = useState(review.threat_score ?? 0)
    const [threatTypes, setThreatTypes] = useState(initialThreatTypes)
    const [isAIGC, setIsAIGC] = useState(!!review.is_aigc)

    const poiPresent = facePresent || namePresent

    // Dates
    const rawPostedDate = localPost.posted_date || localPost.metadata?.posted_date || localPost.timestamp || localPost.sourcing_date
    const rawSourcedDate = localPost.metadata?.created_at || localPost.created_at
    const posted_date = rawPostedDate ? format(new Date(rawPostedDate), "dd/MM/yyyy") : "N/A"
    const sourced_date = rawSourcedDate ? format(new Date(rawSourcedDate), "dd/MM/yyyy") : "N/A"

    const full_analysis_reasonning = hasReview ? review.reasoning : [
        analysis.reasoning,
        analysis.categorization_reason,
        analysis.threat_category ? `Category: ${analysis.threat_category}` : "",
        analysis.nsfw_check?.reasoning ? `NSFW: ${analysis.nsfw_check.reasoning}` : "",
        analysis.hate_speech_check?.reasoning ? `Hate Speech: ${analysis.hate_speech_check.reasoning}` : ""
    ].filter(Boolean).join('\n').trim()

    // --- Handlers ---
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

    const PlatformIcon = () => {
        const platform = localPost.platform?.toLowerCase()
        if (["twitter", "x"].includes(platform)) return <span className="inline-block size-4 text-black"><Twitter /></span>
        if (platform === "instagram") return <Instagram className="w-6 h-6 text-pink-500" />
        if (platform === "facebook") return <Facebook className="w-6 h-6 text-blue-500" />
        if (platform === "youtube") return <Youtube className="w-6 h-6 text-red-500 fill-red-500 stroke-white stroke-[1px]" />
        if (platform === "website") return <Globe className="w-6 h-6 text-slate-500" />
        return <p className="text-slate-500 font-medium truncate">{localPost.platform}</p>
    }

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Panel Header */}
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

            <div className="flex-1 overflow-hidden flex divide-x divide-slate-100">
                {/* LEFT COLUMN: Evidence & Context */}
                <div className="flex-1 overflow-y-auto bg-slate-50/50">
                    <div className="p-8 space-y-8">
                        {/* User Card */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
                            <ProfilePic user={localPost.user?.username || 'Unknown'} size={48} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2">
                                        <PlatformIcon />
                                        <h3 className="text-lg font-bold text-slate-900 truncate">{localPost.user?.username}</h3>
                                    </div>
                                    {localPost.user?.is_verified && <BadgeCheck className="w-5 h-5 text-blue-500" />}
                                </div>
                                <p className="text-sm text-slate-500">{localPost.user?.full_name}</p>
                            </div>
                            <a
                                href={localPost.original_url || '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                                Original Post <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        </div>

                        {/* Media Viewer */}
                        <div className="rounded-2xl overflow-hidden bg-slate-900 shadow-lg border border-slate-800 flex items-center justify-center min-h-[400px] relative group">
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800/50 to-slate-950 pointer-events-none" />
                            {localPost.signedImageUrl ? (
                                <img
                                    src={localPost.signedImageUrl}
                                    alt="Evidence"
                                    className="max-w-full h-auto max-h-[600px] object-contain relative z-10"
                                />
                            ) : (
                                <div className="text-center p-12 relative z-10">
                                    <Quote className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                                    <p className="text-slate-500 font-medium">No media content available</p>
                                </div>
                            )}
                            <div className="absolute top-4 right-4 z-20">
                                <Badge className="bg-black/50 backdrop-blur-md border-white/10 text-white capitalize">
                                    {localPost.platform}
                                </Badge>
                            </div>
                        </div>

                        {/* Caption & Metadata */}
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <MessageCircle className="w-3.5 h-3.5" /> Post Caption
                                </h4>
                                <div className="text-slate-800 leading-relaxed whitespace-pre-wrap font-medium text-base font-sans">
                                    {localPost.caption || <span className="text-slate-400 italic">No caption provided.</span>}
                                </div>
                            </div>

                            {localPost.platform?.toLowerCase() !== "website" && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-500 uppercase">Likes</span>
                                        <span className="font-bold text-lg text-slate-900">{localPost.stats?.like_count?.toLocaleString() || 0}</span>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-500 uppercase">Comments</span>
                                        <span className="font-bold text-lg text-slate-900">{localPost.stats?.comment_count?.toLocaleString() || 0}</span>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between col-span-2">
                                        <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                            <Calendar className="w-3.5 h-3.5" /> Posted: <span className="font-mono text-slate-700">{posted_date}</span>
                                        </span>
                                        <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                            <History className="w-3.5 h-3.5" /> Sourced: <span className="font-mono text-slate-700">{sourced_date}</span>
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Action Form */}
                <div className="w-[500px] shrink-0 overflow-y-auto bg-white">
                    <form action={formAction} className="flex flex-col min-h-full">

                        {/* Data Mapping for Action State */}
                        {project_details.labels.map((label) => (
                            <input key={label.name} type="hidden" name={`flag_${label.name}`} value={threatTypes.includes(label.name) ? 'on' : 'off'} />
                        ))}
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

                        <div className="p-5 md:p-6 space-y-6 flex-1 relative flex flex-col max-w-4xl mx-auto w-full">

                            {/* 1. VERDICT & RISK LEVEL (Moved to Top) */}
                            <section className="space-y-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">1</span>
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
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">2</span>
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
                            </section>

                            {/* 3. POI IDENTIFICATION */}
                            <section className="space-y-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">3</span>
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

                            {/* 4. ANALYSIS & NOTES (Grouped textareas at the bottom) */}
                            <section className="space-y-4 pt-2">
                                <div className="grid grid-cols-1 gap-8">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-500 uppercase flex justify-between">
                                            <span>Detailed Analysis</span>
                                        </Label>
                                        <Textarea
                                            name="reasoning"
                                            defaultValue={full_analysis_reasonning}
                                            placeholder="Enter full analysis reasoning here..."
                                            className="min-h-[100px] bg-slate-50 border-slate-200 text-sm focus:bg-white transition-colors resize-y"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                            Reviewer Notes
                                            <Badge variant="outline" className="text-[10px] uppercase bg-amber-50 text-amber-700 border-amber-200">Internal Only &nbsp; | &nbsp; Not visible to end users</Badge>
                                        </Label>
                                        <Textarea
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