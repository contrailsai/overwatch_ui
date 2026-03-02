'use client'

import * as React from "react"
import { useState, useEffect, useActionState } from 'react'
import { format } from "date-fns"
import { submitCaseReview } from './actions'
import {
    Loader2, X, CheckCircle, ExternalLink,
    ChevronLeft, ChevronRight, Calendar, Plus,
    Instagram, Facebook, Youtube, MessageCircle, Quote,
    BadgeCheck, History, Bot
} from 'lucide-react'
import ProfilePic from '@/components/ProfilePic'

import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// import { DatePicker } from "@/components/ui/date-picker"

const initialState = {
    success: false,
    error: null,
}

export default function ReviewForm({ post, project_details, onClose, onNavigate, hasPrev, hasNext, setPosts }) {
    console.log("project_details", project_details)
    console.log("post", post)
    const [state, formAction, isPending] = useActionState(submitCaseReview, initialState)

    // Update local state when submission succeeds
    useEffect(() => {
        if (state?.success && state?.updatedFields && setPosts) {
            setPosts(prevPosts => prevPosts.map(p =>
                p._id === post._id
                    ? { ...p, ...state.updatedFields }
                    : p
            ))
        }
    }, [state, post._id, setPosts])

    // Initial Values
    const review = post.review_details || {}
    const analysis = post.analysis_results || {}
    const analysisPoi = analysis.poi_check || {}
    const hasReview = review && Object.keys(review).length > 0

    const savedFace = hasReview ? (review.face_present === true) : (analysisPoi.face_present === true)
    const savedName = hasReview ? (review.name_present === true) : (analysisPoi.poi_name_found === true)
    const savedPoiNames = (hasReview && review.poi_names) ? review.poi_names : (analysisPoi.poi_names || [])

    const savedAigc = review.is_aigc === true
    const savedScore = review.threat_score ?? 0

    let savedTypes = review.threat_types || []

    if (hasReview && review.flags) {
        // Ensure all dynamic labels that are 'true' are in savedTypes
        for (const label of project_details.labels) {
            if (review.flags[label.name] === true && !savedTypes.includes(label.name)) {
                savedTypes.push(label.name)
            }
        }
    }

    // const savedTakedown = post.takedown_info?.takedown_status === "requested"

    const [facePresent, setFacePresent] = useState(savedFace)
    const [namePresent, setNamePresent] = useState(savedName)
    const [poiNames, setPoiNames] = useState(savedPoiNames)
    const [newPoiInput, setNewPoiInput] = useState('')
    const [threatScore, setThreatScore] = useState(savedScore)
    const [threatTypes, setThreatTypes] = useState(savedTypes)
    const [isAIGC, setIsAIGC] = useState(savedAigc)
    // const [suggestTakedown, setSuggestTakedown] = useState(savedTakedown)

    const poiPresent = facePresent || namePresent
    const defaultComments = review.reviewer_comments || '';

    const full_analysis_reasonning = hasReview ? review.reasoning : `${analysis?.reasoning || ""} ${analysis?.categorization_reason || ""}
  ${analysis?.threat_category ? "\nCategory: " + analysis.threat_category : ""}
  ${analysis?.nsfw_check?.reasoning ? "\nNSFW: " + analysis.nsfw_check.reasoning : ""}
  ${analysis?.hate_speech_check?.reasoning ? "\nHate Speech: " + analysis.hate_speech_check.reasoning : ""}
  `.trim();

    const handleAddPoi = () => {
        if (newPoiInput.trim()) {
            if (!(poiNames.map(name => name.toLowerCase())).includes(newPoiInput.trim().toLowerCase())) {
                setPoiNames([...poiNames, newPoiInput.trim()])
            }
            setNewPoiInput('')
        }
    }

    const handleRemovePoi = (index) => {
        setPoiNames(poiNames.filter((_, i) => i !== index))
    }

    const toggleThreatType = (type) => {
        setThreatTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
    }

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Panel Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-bold text-slate-900 tracking-tight">Review Case</h2>
                    {hasReview && (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 pl-2">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Reviewed
                        </Badge>
                    )}
                    <div className="h-4 w-px bg-slate-200 mx-2" />
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => onNavigate('prev')} disabled={!hasPrev} className="h-8 w-8 text-slate-500 hover:text-blue-600">
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-1">Nav</span>
                        <Button variant="ghost" size="icon" onClick={() => onNavigate('next')} disabled={!hasNext} className="h-8 w-8 text-slate-500 hover:text-blue-600">
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
                            <ProfilePic user={post.user?.username || 'Unknown'} size={48} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className="">
                                            {
                                                post.platform === "twitter" || post.platform === "x" || post.platform === "X" ? (
                                                    <span className="inline-block size-4 text-black">
                                                        <svg width="100%" height="100%" viewBox="0 0 1200 1227" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <path
                                                                d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z"
                                                                fill="currentColor"
                                                            />
                                                        </svg>
                                                    </span>
                                                    // <Twitter className="w-6 h-6 text-blue-500" />
                                                ) : post.platform === "instagram" ? (
                                                    <Instagram className="w-6 h-6 text-pink-500" />
                                                ) : post.platform === "facebook" ? (
                                                    <Facebook className="w-6 h-6 text-blue-500" />
                                                ) : post.platform === "youtube" ? (
                                                    <Youtube className="w-6 h-6 text-red-500 fill-red-500 stroke-white stroke-[1px]" />
                                                ) : (
                                                    <p className="text-slate-500 font-medium truncate">{post.platform}</p>
                                                )
                                            }
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 truncate">{post.user?.username}</h3>

                                    </div>
                                    {post.user?.is_verified && <BadgeCheck className="w-5 h-5 text-blue-500" />}
                                </div>
                                <p className="text-sm text-slate-500">{post.user?.full_name}</p>
                            </div>
                            <a
                                href={post.original_url || '#'}
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
                            {post.signedImageUrl ? (
                                <img
                                    src={post.signedImageUrl}
                                    alt="Evidence"
                                    className="max-w-full h-auto max-h-[600px] object-contain relative z-10"
                                />
                            ) : (
                                <div className="text-center p-12 relative z-10">
                                    <Quote className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                                    <p className="text-slate-500 font-medium">No media content available</p>
                                </div>
                            )}
                            {/* Platform Tag Overlay */}
                            <div className="absolute top-4 right-4 z-20">
                                <Badge className="bg-black/50 backdrop-blur-md border-white/10 text-white hover:bg-black/60 capitalize">
                                    {post.platform}
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
                                    {post.caption || <span className="text-slate-400 italic">No caption provided.</span>}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-500 uppercase">Likes</span>
                                    <span className="font-bold text-lg text-slate-900">{post.stats?.like_count?.toLocaleString() || 0}</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-500 uppercase">Comments</span>
                                    <span className="font-bold text-lg text-slate-900">{post.stats?.comment_count?.toLocaleString() || 0}</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between col-span-2">
                                    {/* <div className="flex gap-6"> */}
                                    <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                        <Calendar className="w-3.5 h-3.5" /> Posted: <span className="font-mono text-slate-700">{post.metadata?.sourcing_date ? format(new Date(post.metadata.sourcing_date), "dd/MM/yyyy") : 'N/A'}</span>
                                    </span>
                                    <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                        <History className="w-3.5 h-3.5" /> Sourced: <span className="font-mono text-slate-700">{post.metadata?.created_at ? format(new Date(post.metadata.created_at), "dd/MM/yyyy") : 'N/A'}</span>
                                    </span>
                                    {/* </div> */}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* RIGHT COLUMN: Action Form */}
                <div className="w-[500px] shrink-0 overflow-y-auto bg-white">
                    <form action={formAction} className="flex flex-col min-h-full">
                        {/* Hidden Inputs */}
                        {
                            project_details.labels.map((label, index) => (
                                <input key={index} type="hidden" name={`flag_${label.name}`} value={threatTypes.includes(label.name) ? 'on' : 'off'} />
                            ))
                        }
                        <input type="hidden" name="mongo_id" value={post._id || ''} />
                        <input type="hidden" name="platform" value={post.platform || 'Instagram'} />
                        <input type="hidden" name="poi_names" value={poiNames.join(',')} />
                        <input type="hidden" name="poi_present" value={poiPresent.toString()} />
                        <input type="hidden" name="poi_confirmed" value={poiPresent ? 'on' : 'off'} />
                        <input type="hidden" name="is_aigc" value={isAIGC ? 'on' : 'off'} />

                        <input type="hidden" name="face_present" value={facePresent.toString()} />
                        <input type="hidden" name="name_present" value={namePresent.toString()} />
                        <input type="hidden" name="threat_score" value={threatScore} />
                        <input type="hidden" name="takedown_status" value={post.takedown_info?.takedown_status || 'None'} />

                        <div className="p-6 space-y-8 flex-1">

                            {/* 1. POI Section */}
                            <section className="space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">1</span>
                                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">POI Identification</h3>
                                </div>

                                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm font-semibold text-slate-700">Face Detected</Label>
                                        <Switch checked={facePresent} onCheckedChange={setFacePresent} />
                                    </div>
                                    <Separator className="bg-slate-200" />
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm font-semibold text-slate-700">Name Mentioned</Label>
                                        <Switch checked={namePresent} onCheckedChange={setNamePresent} />
                                    </div>

                                    <div className="pt-2 space-y-3">
                                        <Label className="text-xs font-bold text-slate-500 uppercase">Tagged Subjects</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {poiNames.map((name, index) => (
                                                <Badge key={index} variant="secondary" className="pl-2.5 pr-1 py-1 h-7 bg-white border border-blue-200 text-blue-700 shadow-sm flex items-center gap-1">
                                                    {name}
                                                    <button type="button" onClick={() => handleRemovePoi(index)} className="hover:bg-red-50 hover:text-red-600 rounded-full p-0.5 transition-colors"><X className="w-3 h-3" /></button>
                                                </Badge>
                                            ))}
                                            {poiNames.length === 0 && <span className="text-xs text-slate-400 italic py-1">No tags added</span>}
                                        </div>
                                        <div className="flex gap-2">
                                            <Input
                                                value={newPoiInput}
                                                onChange={(e) => setNewPoiInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPoi())}
                                                placeholder="Add name..."
                                                className="h-9 bg-white text-sm"
                                            />
                                            <Button type="button" onClick={handleAddPoi} size="sm" className="h-9 px-3 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"><Plus className="w-4 h-4" /></Button>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* 2. Threat Analysis */}
                            <section className="space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">2</span>
                                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Threat Classification</h3>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div
                                        onClick={() => setIsAIGC(!isAIGC)}
                                        className={cn(
                                            "col-span-2 flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 group",
                                            isAIGC
                                                ? "bg-blue-50/50 border-blue-200 shadow-sm ring-1 ring-blue-100"
                                                : "bg-slate-50/30 border-slate-200 hover:border-blue-200 hover:bg-white"
                                        )}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={cn(
                                                "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                                                isAIGC ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-400"
                                            )}>
                                                <Bot className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <p className={cn("text-xs font-bold uppercase tracking-wider", isAIGC ? "text-blue-900" : "text-slate-500")}>AI Generated Content</p>
                                            </div>
                                        </div>
                                        <Checkbox
                                            checked={isAIGC}
                                            onCheckedChange={() => { }}
                                            className={cn(
                                                "w-5 h-5 border-2 transition-all",
                                                isAIGC
                                                    ? "bg-blue-600 border-blue-600 data-[state=checked]:bg-blue-600"
                                                    : "border-slate-300 group-hover:border-blue-300"
                                            )}
                                        />
                                    </div>

                                    {project_details.labels.map((item) => (
                                        <div
                                            key={item.name}
                                            onClick={() => toggleThreatType(item.name)}
                                            className={cn(
                                                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm",
                                                threatTypes.includes(item.name)
                                                    ? "bg-blue-50 border-blue-200 ring-1 ring-blue-200"
                                                    : "bg-white border-slate-200 hover:border-blue-200"
                                            )}
                                        >
                                            <Checkbox
                                                checked={threatTypes.includes(item.name)}
                                                onCheckedChange={() => { }}
                                                className="border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                            />
                                            <span className={cn("text-xs font-bold uppercase", threatTypes.includes(item.name) ? "text-blue-700" : "text-slate-600")}>{item.name}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-2 pt-2">
                                    <Label className="text-xs font-bold text-slate-500 uppercase">Analysis Notes</Label>
                                    <Textarea
                                        name="reasoning"
                                        defaultValue={full_analysis_reasonning}
                                        placeholder="Detailed analysis..."
                                        className="min-h-[250px] bg-slate-50 border-slate-200 text-sm focus:bg-white transition-colors"
                                    />
                                </div>
                            </section>

                            {/* 3. Verdict */}
                            <section className="space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">3</span>
                                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Verdict & Action</h3>
                                </div>

                                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-6">
                                    {/* RISK LEVEL */}
                                    <div className="space-y-3">
                                        <Label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Risk Level Selection</Label>
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
                                                        "flex-1 py-2 px-3 rounded-lg border cursor-pointer text-xs font-bold transition-all",
                                                        level.active
                                                            ? `${level.color} text-white border-b-0`
                                                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                                    )}
                                                >
                                                    {level.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* REVIEWER's MESSAGE */}
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-500 uppercase">Client Notes</Label>
                                        <Textarea
                                            name="reviewer_comments"
                                            defaultValue={defaultComments}
                                            placeholder="Add context for the client..."
                                            className="h-20 bg-white border-slate-200 text-sm focus:border-blue-500"
                                        />
                                    </div>

                                    {/* NO TAKEDOWN REQUESTS FOR NOW */}

                                    {/* <div className={cn(
                                            "flex items-start gap-3 p-4 rounded-lg border transition-all",
                                            suggestTakedown ? "bg-rose-50 border-rose-200" : "bg-white border-slate-200"
                                        )}>
                                            <Checkbox
                                                id="takedown"
                                                name="suggest_takedown"
                                                checked={suggestTakedown}
                                                onCheckedChange={() => setSuggestTakedown(!suggestTakedown)}
                                                className="mt-1 data-[state=checked]:bg-rose-600 data-[state=checked]:border-rose-600"
                                            />
                                            <div>
                                                <Label htmlFor="takedown" className={cn("text-sm font-bold block cursor-pointer", suggestTakedown ? "text-rose-900" : "text-slate-900")}>Request Takedown</Label>
                                                <p className="text-xs text-slate-500 mt-0.5 leading-snug">Flag for immediate legal removal workflow.</p>
                                            </div>
                                    </div> */}
                                </div>
                            </section>

                        </div>

                        {/* Sticky Footer */}
                        <div className="p-6 bg-white border-t border-slate-100 sticky bottom-0 z-10 flex gap-3">
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
                    </form>
                </div>
            </div>
        </div>
    )
}