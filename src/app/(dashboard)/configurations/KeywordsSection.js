'use client'

import { get_keywords, add_keyword } from '@/app/(dashboard)/configurations/actions'
import { useEffect, useState, useTransition, useRef } from 'react'
import { Search, Plus, Hash, Loader2, Tag, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, ChevronsUp } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

export default function KeywordsSection({ project }) {
    const [inputText, setInputText] = useState('')
    const [keywords, setKeywords] = useState([])
    const [totalCount, setTotalCount] = useState(0)
    const [limit, setLimit] = useState(50)
    const [isHighImportance, setIsHighImportance] = useState(true)
    const [fetchLoading, setFetchLoading] = useState(false)
    const [feedback, setFeedback] = useState(null) // { type: 'error'|'success', message: string }
    const [isPending, startTransition] = useTransition()
    const inputRef = useRef(null)
    const debounceRef = useRef(null)

    const showFeedback = (type, message) => {
        setFeedback({ type, message })
        setTimeout(() => setFeedback(null), 3000)
    }

    const fetchKeywords = async (text = inputText, currentLimit = limit) => {
        setFetchLoading(true)
        try {
            const res = await get_keywords(project.mongo_db_map, text, currentLimit)
            setKeywords(res.keywords)
            setTotalCount(res.totalCount)
        } catch {
            showFeedback('error', 'Failed to load keywords')
        } finally {
            setFetchLoading(false)
        }
    }

    // Effect for limit and project changes (immediate)
    useEffect(() => {
        fetchKeywords(inputText, limit)
    }, [project, limit])

    // Debounced effect for search text
    useEffect(() => {
        if (inputText === '') {
            // When cleared, reset limit and fetch everything immediately
            setLimit(50)
            return
        }

        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            setLimit(50)
            // If limit was already 50, the limit effect won't trigger, so we fetch here
            if (limit === 50) {
                fetchKeywords(inputText, 50)
            }
        }, 800)
        return () => clearTimeout(debounceRef.current)
    }, [inputText])

    const handleShowMore = () => {
        setLimit(prev => prev + 50)
    }

    const handleAdd = (word = inputText) => {
        if (!word.trim()) return
        startTransition(async () => {
            const res = await add_keyword(project.mongo_db_map, word.trim(), isHighImportance)
            if (res?.error) {
                showFeedback('error', res.error)
            } else {
                showFeedback('success', `"${word.trim()}" added`)
                setInputText('')
                setLimit(50)
                setIsHighImportance(true)
                inputRef.current?.focus()
            }
        })
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleAdd()
    }

    // "Add" suggestion: only when search text is non-empty, not loading, and no exact match
    const trimmed = inputText.trim().toLowerCase()
    const hasExactMatch = keywords.some(k => k.keyword.toLowerCase() === trimmed)
    const showAddSuggestion = trimmed.length > 0 && !fetchLoading && !hasExactMatch

    const isLoading = fetchLoading || isPending

    return (
        <div className="space-y-4 w-full">
            <div className="flex items-center gap-2 px-1">
                <Hash className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Keyword Management</h2>
            </div>

            <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden p-0">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 pt-8 pb-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle className="text-lg font-bold text-slate-800">Search Index Labels</CardTitle>
                            {/* <CardDescription className="text-slate-500 mt-1">
                                Keywords used to track and flag content across your project.
                            </CardDescription> */}
                        </div>
                        <Badge
                            variant="secondary"
                            className="bg-blue-50 text-blue-700 border-blue-100 px-3 py-1 text-xs font-bold shrink-0"
                        >
                            {keywords.length} of {totalCount} keywords
                        </Badge>
                    </div>

                    {/* Search input and Add Suggestion */}
                    <div className="space-y-3 mt-4">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Search or add keywords…"
                                    className={cn(
                                        "w-full pl-9 pr-4 py-2.5 text-sm font-medium rounded-xl border border-slate-200",
                                        "bg-white shadow-sm outline-none",
                                        "focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400",
                                        "placeholder:text-slate-400 transition-all"
                                    )}
                                />
                            </div>
                        </div>

                        {/* Add Prompt - Top Positioned */}
                        {showAddSuggestion && (
                            <div className="flex flex-col sm:flex-row items-center gap-3 p-3 bg-blue-50/50 border border-blue-100 rounded-xl animate-in slide-in-from-top-2 duration-200">
                                <div className="flex items-center gap-2 flex-1">
                                    <div className="p-2 bg-white rounded-lg border border-blue-100 text-blue-600 ">
                                        <Plus className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-700 leading-none">Add &ldquo;{trimmed}&rdquo;</p>
                                        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-1">This keyword is not in your index</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6 w-full sm:w-auto">
                                    <div className="w-full flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                                        <div className="flex flex-col items-end w-full">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">Priority</span>
                                            <span className={cn("text-xs font-bold mt-1", isHighImportance ? "text-blue-600" : "text-slate-400")}>
                                                {isHighImportance ? "High" : "Normal"}
                                            </span>
                                        </div>
                                        <Switch
                                            checked={isHighImportance}
                                            onCheckedChange={setIsHighImportance}
                                            className="data-[state=checked]:bg-blue-600"
                                        />
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => handleAdd(trimmed)}
                                        disabled={isPending}
                                        className=" w-full flex-1 sm:flex-initial bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-xs font-bold shadow-sm shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
                                    >
                                        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm Add"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Feedback banner */}
                    {feedback && (
                        <div className={cn(
                            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold mt-3 border animate-in fade-in zoom-in-95 duration-200",
                            feedback.type === 'error'
                                ? "bg-rose-50 text-rose-700 border-rose-100"
                                : "bg-emerald-50 text-emerald-700 border-emerald-100"
                        )}>
                            {feedback.type === 'error'
                                ? <AlertCircle className="w-4 h-4 shrink-0" />
                                : <CheckCircle2 className="w-4 h-4 shrink-0" />
                            }
                            {feedback.message}
                        </div>
                    )}
                </CardHeader>

                <CardContent className="p-6">
                    {isLoading && keywords.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
                            <p className="text-sm text-slate-400 font-medium">Loading keywords…</p>
                        </div>
                    ) : (
                        <div className={cn("flex flex-wrap gap-2.5 transition-opacity duration-200", isLoading ? "opacity-50" : "opacity-100")}>
                            {/* Keyword chips */}
                            {keywords.map((kw) => (
                                <KeywordChip key={kw._id} keyword={kw} />
                            ))}

                            {/* Show More button */}
                            {totalCount > keywords.length && !showAddSuggestion && (
                                <button
                                    type="button"
                                    onClick={handleShowMore}
                                    disabled={isLoading}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-semibold transition-all duration-150",
                                        "border-slate-200 text-slate-500 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 active:scale-95",
                                        "disabled:opacity-50"
                                    )}
                                >
                                    {isLoading ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Plus className="w-3.5 h-3.5" />
                                    )}
                                    Show {Math.min(50, totalCount - keywords.length)} More
                                </button>
                            )}

                            {/* Empty state — no keywords and no search text */}
                            {keywords.length === 0 && !showAddSuggestion && (
                                <div className="flex flex-col items-center justify-center w-full py-12 gap-3 text-center">
                                    <div className="p-4 bg-slate-50 rounded-full">
                                        <Tag className="w-8 h-8 text-slate-300" />
                                    </div>
                                    <p className="font-bold text-slate-500">No keywords yet</p>
                                    <p className="text-sm text-slate-400">Search for a keyword above to add it.</p>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

function KeywordChip({ keyword }) {
    // console.log(keyword)
    return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-semibold bg-white border-slate-200 text-slate-700 shadow-sm">
            {/* <Hash className="w-3 h-3 text-slate-400 shrink-0" /> */}
            <span className={cn('p-1 rounded-full text-white', keyword.importance > 1500 ? 'bg-blue-700' : keyword.importance > 1000 ? 'bg-blue-500' : 'bg-blue-300')}>
                {keyword.importance > 1500 ?
                    <ChevronsUp className="w-3 h-3" /> :
                    keyword.importance > 1000 ?
                        <ChevronUp className="w-3 h-3" /> :
                        <ChevronDown className="w-3 h-3" />
                }
            </span>
            <span>{keyword.keyword}</span>
        </div>
    )
}