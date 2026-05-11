'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { getRequestedLinks, bulkRequestLinks } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Loader2, Link as LinkIcon, CheckCircle2, AlertCircle, Send, Clock, History, RefreshCw, FileUp, ListChecks, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import PageHeader from '@/components/PageHeader'


export default function RequestContentPage() {
    const [submissionResult, setSubmissionResult] = useState(null)
    const [requestedLinks, setRequestedLinks] = useState([])

    const [isLoadingLinks, setIsLoadingLinks] = useState(true)
    const [bulkInput, setBulkInput] = useState('')
    const [parsedLinks, setParsedLinks] = useState([])
    const [isSubmittingBulk, setIsSubmittingBulk] = useState(false)
    const fileInputRef = useRef(null)

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
        if (submissionResult?.success) {
            fetchLinks()
            setBulkInput('')
            setParsedLinks([])
        }
    }, [submissionResult?.success, fetchLinks])


    // Helper to validate and extract URLs from text
    const extractLinks = (text) => {
        // Robust regex to find http/https links in any block of text
        const urlRegex = /(https?:\/\/[^\s,]+)/g
        const matches = text.match(urlRegex) || []

        const validLinks = matches
            .map(link => link.trim())
            .filter(link => {
                if (!link) return false
                try {
                    new URL(link)
                    return true
                } catch {
                    return false
                }
            })

        // Return unique links only
        return [...new Set(validLinks)]
    }


    // Effect to update parsed links in real-time
    useEffect(() => {
        const links = extractLinks(bulkInput)
        setParsedLinks(links)
    }, [bulkInput])

    const handleFileUpload = (event) => {
        const file = event.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (e) => {
            const content = e.target?.result
            if (typeof content === 'string') {
                // If it's a CSV, we just append its content to the bulk input
                // Our extractor will handle extracting the actual URLs
                setBulkInput(prev => `${prev}\n${content}`)
            }
        }
        reader.readAsText(file)
        // Reset file input so the same file can be uploaded again
        event.target.value = ''
    }

    const handleBulkSubmit = async () => {
        if (parsedLinks.length === 0) return

        setIsSubmittingBulk(true)
        setSubmissionResult(null)
        const result = await bulkRequestLinks(parsedLinks)

        setSubmissionResult(result)
        if (result.success) {
            setBulkInput('')
            setParsedLinks([])
            fetchLinks()
        }
        setIsSubmittingBulk(false)
    }

    const clearInput = () => {
        setBulkInput('')
        setParsedLinks([])
        setSubmissionResult(null)
    }



    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 font-outfit">
            {/* Header */}
            <PageHeader title="Request Content" description="Submit new links for data ingestion and analysis" />

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8 pb-12">
                    {/* Request Form */}
                    <section className="space-y-6">
                        <Card className="border-slate-200 shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden p-0 bg-white">
                            <CardHeader className="bg-white border-b border-slate-100 p-5 sm:p-8">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center shrink-0">
                                        <LinkIcon className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl font-bold text-slate-900 tracking-tight">Ingestion Queue</CardTitle>
                                        <CardDescription className="text-slate-500 text-sm font-medium">
                                            Submit contents to queue data for ingestion.
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>


                            <CardContent className="p-0">
                                <div className="p-4 sm:p-8 space-y-6">
                                    <div className="space-y-3">
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-1 gap-2 sm:gap-0">
                                            <Label htmlFor="bulk-links" className="text-sm font-bold text-slate-700">Data Source (Paste links here)</Label>
                                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                                <input
                                                    type="file"
                                                    ref={fileInputRef}
                                                    onChange={handleFileUpload}
                                                    accept=".csv,.txt"
                                                    className="hidden"
                                                />
                                                <Button
                                                    variant="secondary"
                                                    type="button"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="w-full sm:w-auto cursor-pointer h-7 text-[10px] uppercase tracking-wider font-bold px-3 bg-slate-100/80 hover:bg-slate-200 text-slate-600 border-none rounded-lg flex items-center justify-center gap-1.5 transition-all"
                                                >
                                                    <FileUp className="w-3 h-3" />
                                                    Upload CSV/TXT
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="relative group">

                                            <Textarea
                                                id="bulk-links"
                                                value={bulkInput}
                                                onChange={(e) => setBulkInput(e.target.value)}
                                                placeholder="Paste a comma-separated list or just drop a block of text containing URLs. Example: https://twitter.com/post/123, https://youtube.com/watch?v=xyz..."
                                                className="bg-slate-50/50 border-slate-200 min-h-[160px] p-4 focus:ring-blue-500/10 transition-all text-slate-800 rounded-xl shadow-inner-sm text-sm leading-relaxed placeholder:text-slate-400 font-medium"
                                            />
                                        </div>
                                    </div>

                                    {/* Link Preview Pills */}
                                    {parsedLinks.length > 0 && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-1 gap-3 sm:gap-0">
                                                <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                                                    <ListChecks className="w-3.5 h-3.5 text-blue-500" />
                                                    Ready for Ingestion
                                                </div>
                                                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                                                    <Badge variant="secondary" className="bg-blue-600/5 text-blue-600 border-blue-100/50 px-3 py-1 font-bold text-[10px] tracking-tight">
                                                        {parsedLinks.length} {parsedLinks.length === 1 ? 'Item' : 'Items'} Found
                                                    </Badge>
                                                    <Button
                                                        variant="ghost"
                                                        type="button"
                                                        onClick={clearInput}
                                                        className="cursor-pointer h-7 text-[10px] uppercase tracking-wider font-bold px-3 text-rose-500 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all flex items-center gap-1.5"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                        Clear
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-4 max-h-[140px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
                                                <div className="flex flex-wrap gap-2">
                                                    {parsedLinks.map((link, idx) => (
                                                        <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold shadow-sm group hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                                                            <LinkIcon className="w-3 h-3 text-slate-400 group-hover:text-blue-500" />
                                                            <span className="truncate max-w-[240px]">{link}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Feedback Messages */}
                                    {(submissionResult?.error || submissionResult?.success) && (
                                        <div className="mt-4 animate-in zoom-in-95 duration-200">
                                            {submissionResult?.error && (
                                                <div className="flex items-center gap-3 p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 shadow-sm shadow-rose-600/5">
                                                    <AlertCircle className="w-5 h-5 shrink-0" />
                                                    <p className="text-sm font-bold">{submissionResult.error}</p>
                                                </div>
                                            )}

                                            {submissionResult?.success && (
                                                <div className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 shadow-sm shadow-emerald-600/5">
                                                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                                                    <p className="text-sm font-bold">{submissionResult.message}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                </div>
                            </CardContent>

                            <CardFooter className="bg-slate-50/50 border-t border-slate-100 p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-center px-4 sm:px-8 gap-4 sm:gap-0">
                                <div className="text-xs text-slate-400 font-medium text-center sm:text-left">
                                    {parsedLinks.length > 0 ? `${parsedLinks.length} unique items prepared` : 'Enter or upload links to get started'}
                                </div>
                                <Button
                                    onClick={handleBulkSubmit}
                                    disabled={parsedLinks.length === 0 || isSubmittingBulk}
                                    className="w-full sm:w-auto cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 h-12 shadow-lg shadow-blue-600/20 transition-all active:scale-95 flex items-center justify-center gap-2 rounded-xl group disabled:opacity-50 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                                >
                                    {isSubmittingBulk ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Queueing Batch...
                                        </>
                                    ) : (
                                        <>
                                            <Send className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                            Submit Queue
                                        </>
                                    )}
                                </Button>
                            </CardFooter>
                        </Card>
                    </section>


                    {/* Status List */}
                    <section className="space-y-6">
                        <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden p-0 flex flex-col">
                            <CardHeader className="bg-white border-b border-slate-100 p-5 sm:p-6 shrink-0">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
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
                                        className="w-full sm:w-auto cursor-pointer h-9 text-slate-600 border-slate-200 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-all font-bold px-4 rounded-lg flex justify-center"
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
                                                    <th className="px-4 sm:px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Link Source</th>
                                                    <th className="px-4 sm:px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Ingestion Status</th>
                                                    <th className="px-4 sm:px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Timestamp</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {requestedLinks.map((item) => (
                                                    <tr key={item.id} className="hover:bg-slate-50/40 transition-colors group">
                                                        <td className="px-4 sm:px-8 py-4 sm:py-5">
                                                            <div className="flex items-center gap-3 min-w-[200px] max-w-[200px] sm:max-w-md">
                                                                {/* <div className="shrink-0 w-2 h-2 rounded-full bg-slate-200 group-hover:bg-blue-400 transition-colors" /> */}
                                                                <a
                                                                    href={item.link}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-xs sm:text-sm font-bold text-slate-700 hover:text-blue-600 transition-colors truncate block flex-1"
                                                                >
                                                                    {item.link}
                                                                </a>
                                                                {/* <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400 shrink-0 opacity-0 group-hover:opacity-100 transition-all" /> */}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 sm:px-8 py-4 sm:py-5">
                                                            {item.ingested ? (
                                                                <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] sm:text-[11px] font-bold border border-emerald-100 shadow-sm">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                                    Processed
                                                                </div>
                                                            ) : (
                                                                <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-amber-50 text-amber-700 text-[10px] sm:text-[11px] font-bold border border-amber-100 shadow-sm whitespace-nowrap">
                                                                    <Clock className="w-3 h-3 shrink-0" />
                                                                    Pending
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 sm:px-8 py-4 sm:py-5">
                                                            <div className="flex flex-col text-[10px] sm:text-[11px] text-slate-600 font-bold whitespace-nowrap">
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
