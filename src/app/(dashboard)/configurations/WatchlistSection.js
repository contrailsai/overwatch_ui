'use client'

import { get_watchlist, add_to_watchlist, delete_from_watchlist } from '@/app/(dashboard)/configurations/watchlistActions'
import { useEffect, useState, useTransition, useRef } from 'react'
import {
    Search, Plus, Eye, Loader2, User, AlertCircle,
    CheckCircle2, Trash2, ExternalLink, Calendar
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

export default function WatchlistSection({ project }) {
    const [inputText, setInputText] = useState('')
    const [watchlistItems, setWatchlistItems] = useState([])
    const [fetchLoading, setFetchLoading] = useState(false)
    const [feedback, setFeedback] = useState(null)
    const [isPending, startTransition] = useTransition()
    const inputRef = useRef(null)
    const debounceRef = useRef(null)

    const projectName = project?.project_name

    const showFeedback = (type, message) => {
        setFeedback({ type, message })
        setTimeout(() => setFeedback(null), 3000)
    }

    const requestIds = useRef(0)

    const fetchWatchlist = async (search = '') => {
        if (!projectName) return

        const currentRequestId = ++requestIds.current
        setFetchLoading(true)

        try {
            const res = await get_watchlist(projectName, search)
            // Ignore if a newer request has been made
            if (currentRequestId !== requestIds.current) return

            if (res?.error) {
                showFeedback('error', res.error)
            } else {
                setWatchlistItems(res || [])
            }
        } catch {
            if (currentRequestId === requestIds.current) {
                showFeedback('error', 'Failed to load watchlist profiles')
            }
        } finally {
            if (currentRequestId === requestIds.current) {
                setFetchLoading(false)
            }
        }
    }

    useEffect(() => {
        fetchWatchlist()
    }, [projectName])

    // Debounced search
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        if (inputText.trim() === '') {
            fetchWatchlist('')
            return
        }
        debounceRef.current = setTimeout(() => {
            fetchWatchlist(inputText)
        }, 800)
        return () => clearTimeout(debounceRef.current)
    }, [inputText, projectName])

    const handleAdd = (link = inputText) => {
        const trimmedLink = link.trim()
        if (!trimmedLink || !projectName) return

        try {
            new URL(trimmedLink)
        } catch (_) {
            showFeedback('error', 'Please provide a valid URL')
            return
        }

        startTransition(async () => {
            const res = await add_to_watchlist(projectName, trimmedLink)
            if (res?.error) {
                showFeedback('error', res.error)
            } else {
                showFeedback('success', "Profile added to watchlist")
                setInputText('')
                await fetchWatchlist('')
                inputRef.current?.focus()
            }
        })
    }

    const handleDelete = async (id) => {
        const res = await delete_from_watchlist(id)
        if (res?.error) {
            showFeedback('error', res.error)
        } else {
            showFeedback('success', "Removed from watchlist")
            setWatchlistItems(items => items.filter(item => item.id !== id))
        }
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            const trimmed = inputText.trim()
            if (trimmed && (trimmed.startsWith('http://') || trimmed.startsWith('https://'))) {
                handleAdd(trimmed)
            } else if (trimmed) {
                showFeedback('error', 'Please provide a valid URL')
            }
        }
    }

    const trimmed = inputText.trim()
    const hasExactMatch = watchlistItems.some(item => item.link.toLowerCase() === trimmed.toLowerCase())
    const showAddSuggestion = trimmed.length > 5 && trimmed.startsWith('http') && !fetchLoading && !hasExactMatch

    const isLoading = fetchLoading || isPending

    return (
        <div className="space-y-4 w-full">
            <div className="flex items-center gap-2 px-1">
                <Eye className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Profile Watchlist</h2>
            </div>

            <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden p-0">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 pt-6 pb-4 px-4 md:pt-8 md:pb-6 md:px-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle className="text-lg font-bold text-slate-800">Watched Profiles</CardTitle>
                            <CardDescription className="text-slate-500 mt-1">
                                Profiles being monitored for activity and new content.
                            </CardDescription>
                        </div>
                        <Badge
                            variant="secondary"
                            className="bg-blue-50 text-blue-700 border-blue-100 px-3 py-1 text-xs font-bold shrink-0"
                        >
                            {watchlistItems.length} profile{watchlistItems.length !== 1 ? 's' : ''}
                        </Badge>
                    </div>

                    {/* Search / Add input */}
                    <div className="flex flex-col sm:flex-row gap-2 mt-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Search or paste profile link…"
                                className={cn(
                                    "w-full pl-9 pr-4 py-3 md:py-2.5 text-base md:text-sm font-medium rounded-xl border border-slate-200",
                                    "bg-white shadow-sm outline-none",
                                    "focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400",
                                    "placeholder:text-slate-400 transition-all"
                                )}
                            />
                        </div>
                        {trimmed.length > 0 && (
                            <Button
                                onClick={() => handleAdd()}
                                disabled={isLoading || !trimmed.startsWith('http')}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl h-12 md:h-auto w-full sm:w-auto"
                            >
                                {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                                Add Profile
                            </Button>
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

                <CardContent className="p-0">
                    {fetchLoading && watchlistItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
                            <p className="text-sm text-slate-400 font-medium">Loading watchlist…</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {watchlistItems.map((item) => (
                                <WatchlistItem
                                    key={item.id}
                                    item={item}
                                    onDelete={() => handleDelete(item.id)}
                                />
                            ))}

                            {/* Empty state — no items */}
                            {watchlistItems.length === 0 && (
                                <div className="flex flex-col items-center justify-center w-full py-16 gap-3 text-center">
                                    <div className="p-4 bg-slate-50 rounded-full">
                                        <User className="w-8 h-8 text-slate-300" />
                                    </div>
                                    <p className="font-bold text-slate-500">No profiles watched</p>
                                    <p className="text-sm text-slate-400 px-8">Paste a profile link above to start monitoring it.</p>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

function WatchlistItem({ item, onDelete }) {
    return (
        <div className="group flex items-center justify-between p-4 md:px-6 hover:bg-slate-50/50 transition-colors gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                    <User className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-bold text-slate-700 hover:text-blue-600 truncate flex items-center gap-1.5"
                        >
                            {item.link}
                            <ExternalLink className="w-3 h-3 text-slate-400" />
                        </a>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight mt-0.5">
                        Added {format(new Date(item.created_at), 'MMM d, yyyy')}
                    </p>
                </div>
            </div>

            {/* Updated Last Checked UI */}
            <div className="hidden md:flex items-center gap-2 px-4 shrink-0">
                <div className="p-1.5 bg-slate-50 text-slate-400 rounded-md">
                    <Calendar className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Last Checked</span>
                    <span className="text-xs font-semibold text-slate-600">
                        {item.last_checked ? format(new Date(item.last_checked), 'MMM d, yyyy') : 'Never'}
                    </span>
                </div>
            </div>

            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="opacity-50 cursor-pointer group-hover:opacity-100 text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all rounded-lg shrink-0"
            >
                <Trash2 className="w-4 h-4" />
            </Button>
        </div>
    )
}
