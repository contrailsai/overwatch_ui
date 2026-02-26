'use client'

import { useActionState, useEffect, useState, useCallback } from 'react'
import { requestLink, getRequestedLinks } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Loader2, Link as LinkIcon, CheckCircle2, AlertCircle, Send, Clock, History, RefreshCw, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'

export default function RequestContentPage() {
    const [state, formAction, isPending] = useActionState(requestLink, null)
    const [requestedLinks, setRequestedLinks] = useState([])
    const [isLoadingLinks, setIsLoadingLinks] = useState(true)

    const fetchLinks = useCallback(async () => {
        setIsLoadingLinks(true)
        const result = await getRequestedLinks()
        if (result.data) {
            setRequestedLinks(result.data)
        }
        setIsLoadingLinks(false)
    }, [])

    useEffect(() => {
        fetchLinks()
    }, [fetchLinks])

    // Refresh links when a new one is successfully submitted
    useEffect(() => {
        if (state?.success) {
            fetchLinks()
        }
    }, [state?.success, fetchLinks])

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 font-outfit">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 py-6 px-8 shrink-0 flex justify-between items-center z-10">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Request Content</h1>
                    <p className="text-sm text-slate-500 mt-1">Submit new links for data ingestion and analysis</p>
                </div>
            </header>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-5xl mx-auto space-y-8 pb-12">
                    {/* Request Form */}
                    <section className="space-y-6">
                        <form action={formAction}>
                            <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden p-0">
                                <CardHeader className="bg-white border-b border-slate-100 p-6">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                                            <LinkIcon className="w-4 h-4 text-blue-600" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg font-bold text-slate-800">Submit New Request</CardTitle>
                                            <CardDescription className="text-slate-500 text-xs">
                                                Our system will process the URL for threat detection.
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>

                                <CardContent className="px-8 py-8 text-slate-900">
                                    <div className="max-w-2xl mx-auto space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="link" className="text-sm font-bold text-slate-700">Source URL</Label>
                                            <div className="relative group">
                                                <Input
                                                    id="link"
                                                    name="link"
                                                    type="url"
                                                    placeholder="https://example.com/post/123"
                                                    required
                                                    className="bg-white border-slate-200 h-12 pl-4 focus:ring-blue-500/20 transition-all text-slate-900 rounded-lg shadow-sm"
                                                />
                                            </div>
                                        </div>

                                        {/* Feedback Messages */}
                                        <div className="min-h-[40px]">
                                            {state?.error && (
                                                <div className="flex items-center gap-3 p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 animate-in zoom-in-95 duration-200 shadow-sm">
                                                    <AlertCircle className="w-5 h-5 shrink-0" />
                                                    <p className="text-sm font-bold">{state.error}</p>
                                                </div>
                                            )}

                                            {state?.success && (
                                                <div className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 animate-in zoom-in-95 duration-200 shadow-sm">
                                                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                                                    <p className="text-sm font-bold">{state.message}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>

                                <CardFooter className="bg-slate-50/50 border-t border-slate-100 p-6 flex justify-center">
                                    <Button
                                        type="submit"
                                        disabled={isPending}
                                        className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold px-12 h-12 shadow-lg shadow-blue-600/20 transition-all active:scale-95 flex items-center gap-2 rounded-lg"
                                    >
                                        {isPending ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Processing Request...
                                            </>
                                        ) : (
                                            <>
                                                <Send className="w-4 h-4" />
                                                Submit Request
                                            </>
                                        )}
                                    </Button>
                                </CardFooter>
                            </Card>
                        </form>
                    </section>

                    {/* Status List */}
                    <section className="space-y-6">
                        <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden p-0 flex flex-col">
                            <CardHeader className="bg-white border-b border-slate-100 p-6 shrink-0">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                                            <History className="w-4 h-4 text-slate-600" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg font-bold text-slate-800">Request History</CardTitle>
                                            <CardDescription className="text-slate-500 text-xs">
                                                Monitor the status of your recently submitted links.
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={fetchLinks}
                                        disabled={isLoadingLinks}
                                        className=" cursor-pointer h-9 text-slate-600 border-slate-200 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-all font-bold px-4 rounded-lg"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isLoadingLinks ? 'animate-spin' : ''}`} />
                                        Refresh Status
                                    </Button>
                                </div>
                            </CardHeader>

                            <CardContent className="p-0 flex flex-col">
                                {isLoadingLinks ? (
                                    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                                        <Loader2 className="w-10 h-10 animate-spin mb-4 text-blue-500/30" />
                                        <p className="text-sm font-bold tracking-tight">Syncing with server...</p>
                                    </div>
                                ) : requestedLinks.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                                        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-6">
                                            <LinkIcon className="w-8 h-8 text-slate-200" />
                                        </div>
                                        <h3 className="text-slate-800 font-bold text-lg mb-1">No requests found</h3>
                                        <p className="text-sm">Start by submitting a content link above.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                                    <th className="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Link Source</th>
                                                    <th className="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Ingestion Status</th>
                                                    <th className="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Timestamp</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {requestedLinks.map((item) => (
                                                    <tr key={item.id} className="hover:bg-slate-50/40 transition-colors group">
                                                        <td className="px-8 py-5">
                                                            <div className="flex items-center gap-3 min-w-0 max-w-sm sm:max-w-md">
                                                                {/* <div className="shrink-0 w-2 h-2 rounded-full bg-slate-200 group-hover:bg-blue-400 transition-colors" /> */}
                                                                <a
                                                                    href={item.link}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-sm font-bold text-slate-700 hover:text-blue-600 transition-colors truncate block flex-1"
                                                                >
                                                                    {item.link}
                                                                </a>
                                                                {/* <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400 shrink-0 opacity-0 group-hover:opacity-100 transition-all" /> */}
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-5">
                                                            {item.ingested ? (
                                                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-100 shadow-sm">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                                    Processed
                                                                </div>
                                                            ) : (
                                                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-[11px] font-bold border border-amber-100 shadow-sm">
                                                                    <Clock className="w-3 h-3" />
                                                                    Pending Ingestion
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-8 py-5">
                                                            <div className="flex flex-col text-[11px] text-slate-600 font-bold">
                                                                <span>{format(new Date(item.created_at), 'MMM dd, yyyy')}</span>
                                                                <span className="text-slate-400 font-medium text-[10px]">{format(new Date(item.created_at), 'hh:mm aa')}</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </section>
                </div>
            </div>
        </main>
    )
}
