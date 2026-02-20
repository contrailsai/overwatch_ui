'use client'

import { useActionState } from 'react'
import { requestLink } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Loader2, Link as LinkIcon, CheckCircle2, AlertCircle, Send } from 'lucide-react'

export default function RequestContentPage() {
    const [state, formAction, isPending] = useActionState(requestLink, null)

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
                <div className="max-w-xl mx-auto space-y-8 pb-12">
                    <section className="space-y-6">
                        <form action={formAction}>
                            <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden p-0">
                                <CardHeader className="bg-white border-b border-slate-100 p-6">
                                    <div className="flex items-center gap-2 mb-1">
                                        <LinkIcon className="w-4 h-4 text-blue-600" />
                                        <CardTitle className="text-lg font-bold text-slate-800">Content Link</CardTitle>
                                    </div>
                                    <CardDescription className="text-slate-500 text-sm">
                                        Provide the URL to the content you would like us to ingest. Our system will process it for threat detection.
                                    </CardDescription>
                                </CardHeader>

                                <CardContent className="px-8 py-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="link" className="text-sm font-bold text-slate-700">Source URL</Label>
                                        <div className="relative group">
                                            <Input
                                                id="link"
                                                name="link"
                                                type="url"
                                                placeholder="https://example.com/post/123"
                                                required
                                                className="bg-white border-slate-200 h-12 pl-4 focus:ring-blue-500/20 transition-all text-slate-900"
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
                                </CardContent>

                                <CardFooter className="bg-slate-50/50 border-t border-slate-100 p-6 flex justify-end ">
                                    <Button
                                        type="submit"
                                        disabled={isPending}
                                        className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 h-12 shadow-lg shadow-blue-600/20 transition-all active:scale-95 flex items-center gap-2 rounded-lg"
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
                </div>
            </div>
        </main>
    )
}
