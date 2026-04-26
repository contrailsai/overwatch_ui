
'use client'

import * as React from "react"
import { useState, useActionState } from 'react'
import { submitCaseReview } from './feature_actions'
import {
    Loader2, X, Plus, Bot, ExternalLink
} from 'lucide-react'

import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export default function EditForm({ post, project, clientDetails, setIsEditing, onUpdatePost }) {
    const project_details = project.project_details

    const initialState = {
        success: false,
        error: null,
    }

    const submit_to_edit = submitCaseReview.bind(null, project, clientDetails)

    const [state, formAction, isPending] = useActionState(submit_to_edit, initialState);

    React.useEffect(() => {
        if (state?.success && state?.updatedFields) {
            if (onUpdatePost) {
                onUpdatePost({
                    ...post,
                    ...state.updatedFields
                });
            }
            setIsEditing(false);
        }
    }, [state, post, onUpdatePost, setIsEditing]);

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

    const getSavedLegalCodes = () => {
        const codes = [];
        for (const item of (review.legal_codes || [])) {
            const codeName = typeof item === 'string' ? item : item.code;
            const reasoning = typeof item === 'string' ? '' : item.reasoning || '';
            if (!codes.some(c => c.code === codeName)) {
                codes.push({ code: codeName, reasoning });
            }
        }
        return codes;
    }
    const savedLegalCodes = getSavedLegalCodes()

    let savedTypes = review.threat_types || []

    if (hasReview && review.flags) {
        // Ensure all dynamic labels that are 'true' are in savedTypes
        for (const label of project_details.labels) {
            if (review.flags[label.name] === true && !savedTypes.includes(label.name)) {
                savedTypes.push(label.name)
            }
        }
    }

    const [facePresent, setFacePresent] = useState(savedFace)
    const [namePresent, setNamePresent] = useState(savedName)
    const [poiNames, setPoiNames] = useState(savedPoiNames)
    // const [newPoiInput, setNewPoiInput] = useState('')
    const [threatScore, setThreatScore] = useState(savedScore)
    const [threatTypes, setThreatTypes] = useState(savedTypes)
    const [selectedLegalCodes, setSelectedLegalCodes] = useState(savedLegalCodes)
    const [isAIGC, setIsAIGC] = useState(savedAigc)
    // const [suggestTakedown, setSuggestTakedown] = useState(savedTakedown)

    const poiPresent = facePresent || namePresent
    // const defaultComments = review.reviewer_comments || '';

    const full_analysis_reasonning = hasReview ? review.reasoning : "";

    // const handleAddPoi = () => {
    //     if (newPoiInput.trim()) {
    //         if (!(poiNames.map(name => name.toLowerCase())).includes(newPoiInput.trim().toLowerCase())) {
    //             setPoiNames([...poiNames, newPoiInput.trim()])
    //         }
    //         setNewPoiInput('')
    //     }
    // }

    // const handleRemovePoi = (index) => {
    //     setPoiNames(poiNames.filter((_, i) => i !== index))
    // }

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

    return (
        <div className="w-[500px] shrink-0 overflow-y-auto bg-white relative">
            <button onClick={() => setIsEditing(false)} className="absolute top-4 right-4 p-1 bg-slate-100 rounded-full hover:bg-slate-200 cursor-pointer">
                <X className="w-6 h-6" />
            </button>
            <form action={formAction} className="flex flex-col min-h-full">
                {/* Hidden Inputs */}
                {
                    Array.from(new Set([
                        ...project_details.labels.map(l => l.name),
                        ...threatTypes
                    ])).map((labelName, index) => (
                        <input key={`flag_${index}`} type="hidden" name={`flag_${labelName}`} value={threatTypes.includes(labelName) ? 'on' : 'off'} />
                    ))
                }
                {
                    Array.from(new Set([
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
                    })
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

                    {/* 3. Verdict */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">1</span>
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Select Risk Severity</h3>
                        </div>

                        {/* RISK LEVEL */}
                        <div className="space-y-3 pt-4 pb-6 border-b border-slate-200">
                            {/* <Label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Risk Severity Selection</Label> */}
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
                    </section>

                    {/* 1. POI Section */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">2</span>
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Edit POI Identification</h3>
                        </div>

                        <div className="flex items-center justify-around rounded-xl px-2 gap-5 divide-slate-200">
                            <div className="flex gap-5 items-center justify-between border p-3.5 rounded-2xl ">
                                <Label className="text-sm font-semibold text-slate-700">Face Detected</Label>
                                <Switch checked={facePresent} onCheckedChange={setFacePresent} />
                            </div>
                            {/* <Separator className="bg-slate-200" /> */}
                            <div className="flex gap-5 items-center justify-between border p-3.5 rounded-2xl">
                                <Label className="text-sm font-semibold text-slate-700">Name Mentioned</Label>
                                <Switch checked={namePresent} onCheckedChange={setNamePresent} />
                            </div>
                        </div>
                    </section>

                    {/* 2. Threat Analysis */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">2</span>
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Edit Threat Classification</h3>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {/* AIGC EDITABLE  */}
                            <div
                                onClick={() => setIsAIGC(!isAIGC)}
                                className={cn(
                                    "cursor-pointer col-span-2 flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-200 group",
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

                        {/* Legal Framework Codes */}
                        {(project_details.legal_codes || []).length > 0 && (
                            <div className="pt-4 space-y-3">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Legal Framework Codes</h4>
                                <div className="grid grid-cols-1 gap-3">
                                    {project_details.legal_codes.map((item) => {
                                        const selected = selectedLegalCodes.find(c => c.code === item.name);
                                        const isSelected = !!selected;
                                        return (
                                        <div
                                            key={item.name}
                                            className={cn(
                                                "flex flex-col gap-2 p-3 rounded-lg border transition-all hover:shadow-sm",
                                                isSelected
                                                    ? "bg-purple-50 border-purple-200 ring-1 ring-purple-200"
                                                    : "bg-white border-slate-200 hover:border-purple-200"
                                            )}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div onClick={() => toggleLegalCode(item.name)} className="flex items-center gap-3 cursor-pointer">
                                                    <Checkbox
                                                        checked={isSelected}
                                                        onCheckedChange={() => { }}
                                                        className="border-slate-300 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                                    />
                                                    <span className={cn("text-xs font-bold uppercase", isSelected ? "text-purple-700" : "text-slate-600")}>
                                                        {item.name}
                                                    </span>
                                                </div>
                                                {item.referenceLink && (
                                                    <a
                                                        href={item.referenceLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-1.5 rounded-md hover:bg-black/5 transition-colors shrink-0"
                                                        title="View Reference"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <ExternalLink className="w-4 h-4 text-slate-500 opacity-70 hover:opacity-100 transition-opacity" />
                                                    </a>
                                                )}
                                            </div>
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

                </div>

                {/* Sticky Footer */}
                <div className="p-6 bg-white border-t border-slate-100 sticky bottom-0 z-10 flex gap-3">
                    <Button type="button" variant="outline" onClick={() => setIsEditing(false)} className="flex-1 font-bold border-slate-200 text-slate-600">
                        Close
                    </Button>
                    <Button
                        type="submit"
                        disabled={isPending}
                        className="flex-2 font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20"
                    >
                        {isPending ? <Loader2 className="animate-spin" /> : (hasReview ? 'Update Review' : 'Submit to Client')}
                    </Button>
                </div>
            </form>
        </div>
    )
}