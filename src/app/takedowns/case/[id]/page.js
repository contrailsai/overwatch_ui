'use client'

import { useState, useEffect, useRef } from 'react'
import { getTakedownDetails, updateTakedown, addTakedownNote, uploadTakedownDocument, getTakedownDocuments, getDocumentDownloadUrl } from '../../actions'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, AlertTriangle, CheckCircle, Clock, Mail, FileText,
  ExternalLink, User, Calendar, Shield, Save, MessageSquare, History,
  Link as LinkIcon, Download, Upload, File, Loader2, Trash2,
  Eye, Check, XCircle, AlertCircle, ChevronRight, Database, Sparkles
} from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TipTapLink from '@tiptap/extension-link'

// shadcn/ui components
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { cn } from "@/lib/utils"

// Helper for Visual Stages
function StageProgress({ status, onUpdate, updating }) {
  const steps = [
    { id: 'raised', label: 'Raised', icon: Shield },
    { id: 'under_review', label: 'Under Review', icon: Eye },
    { id: 'resolution', label: 'Resolution', icon: CheckCircle }
  ]

  const getStepIndex = (s) => {
    if (['accepted', 'rejected', 'suspended'].includes(s)) return 2
    if (s === 'under_review') return 1
    return 0 // raised or initiated
  }

  const currentIndex = getStepIndex(status)

  const handleNext = () => {
    if (currentIndex === 0) onUpdate('under_review')
  }

  const handleBack = () => {
    if (currentIndex === 1) onUpdate('raised')
    if (currentIndex === 2) onUpdate('under_review')
  }

  return (
    <div className="space-y-8">
      {/* Visual Stepper */}
      <div className="relative flex items-center justify-between w-full px-4">
        {/* Connecting Line */}
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-1 bg-gray-100 -z-10 rounded-full" />
        <div
          className="absolute left-0 top-1/2 transform -translate-y-1/2 h-1 bg-indigo-600 -z-10 rounded-full transition-all duration-500"
          style={{ width: `${(currentIndex / (steps.length - 1)) * 100}%` }}
        />

        {steps.map((step, idx) => {
          const isActive = idx === currentIndex
          const isCompleted = idx < currentIndex
          const Icon = step.icon

          return (
            <div key={step.id} className="flex flex-col items-center gap-2 bg-white px-2">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 z-10",
                  isActive ? "bg-indigo-600 border-indigo-600 text-white shadow-lg scale-110" :
                    isCompleted ? "bg-indigo-100 border-indigo-600 text-indigo-600" :
                      "bg-white border-gray-200 text-gray-300"
                )}
              >
                {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
              </div>
              <span className={cn(
                "text-xs font-bold uppercase tracking-wider transition-colors duration-300",
                isActive ? "text-indigo-600" :
                  isCompleted ? "text-gray-900" : "text-gray-300"
              )}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Action Area */}
      <div className="bg-gray-50/50 rounded-xl border border-gray-100 p-6 flex flex-col items-center justify-center space-y-4">

        {/* Stage 1: Raised -> Under Review */}
        {currentIndex === 0 && (
          <div className="text-center space-y-4">
            <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium">
              Case has been raised and is ready for review.
            </div>
            <Button
              onClick={handleNext}
              disabled={updating}
              className="bg-indigo-600 hover:bg-indigo-700 w-full md:w-auto"
            >
              Start Review Process <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {/* Stage 2: Under Review -> Decision */}
        {currentIndex === 1 && (
          <div className="w-full space-y-6">
            <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium text-center">
              Case is currently under investigation. Select an outcome below.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => onUpdate('accepted')}
                disabled={updating}
                className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-transparent bg-green-50 text-green-700 hover:border-green-200 hover:bg-green-100 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-green-200 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <span className="font-bold">Accept Takedown</span>
              </button>

              <button
                onClick={() => onUpdate('rejected')}
                disabled={updating}
                className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-transparent bg-red-50 text-red-700 hover:border-red-200 hover:bg-red-100 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-red-200 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <XCircle className="w-6 h-6" />
                </div>
                <span className="font-bold">Reject Case</span>
              </button>

              <button
                onClick={() => onUpdate('suspended')}
                disabled={updating}
                className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-transparent bg-orange-50 text-orange-700 hover:border-orange-200 hover:bg-orange-100 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-orange-200 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <span className="font-bold">Suspend Case</span>
              </button>
            </div>

            <div className="flex justify-center pt-2">
              <Button variant="ghost" size="sm" onClick={handleBack} disabled={updating} className="text-gray-400 hover:text-gray-600">
                <ChevronLeft className="w-4 h-4 mr-1" /> Back to Raised
              </Button>
            </div>
          </div>
        )}

        {/* Stage 3: Resolution (Terminal State) */}
        {currentIndex === 2 && (
          <div className="text-center space-y-4 w-full">
            <div className={cn(
              "p-6 rounded-xl border-2 flex flex-col items-center animate-in zoom-in duration-300",
              status === 'accepted' ? "bg-green-50 border-green-100 text-green-800" :
                status === 'rejected' ? "bg-red-50 border-red-100 text-red-800" :
                  "bg-orange-50 border-orange-100 text-orange-800"
            )}>
              {status === 'accepted' && <CheckCircle className="w-12 h-12 mb-3 text-green-600" />}
              {status === 'rejected' && <XCircle className="w-12 h-12 mb-3 text-red-600" />}
              {status === 'suspended' && <AlertTriangle className="w-12 h-12 mb-3 text-orange-600" />}

              <h3 className="text-xl font-bold uppercase tracking-wide mb-1">
                Case {status}
              </h3>
              <p className="opacity-80 text-sm">
                This case has been resolved. You can reopen it if necessary.
              </p>
            </div>

            <Button variant="outline" onClick={handleBack} disabled={updating} className="text-gray-500 hover:text-gray-900">
              <History className="w-4 h-4 mr-2" /> Reopen for Review
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// Tiptap Editor Component
function Tiptap({ content, onChange, editable = true }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit,
      TipTapLink.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-indigo-600 underline cursor-pointer',
        },
      }),
    ],
    content: content || '',
    editable: editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm focus:outline-none min-h-[150px] p-4 max-w-none text-gray-700',
      },
    },
  })

  if (!mounted || !editor) return (
    <div className="border border-input rounded-md bg-muted/50 min-h-[150px] flex items-center justify-center text-muted-foreground text-sm">
      Loading editor...
    </div>
  )

  return (
    <div className="border border-input rounded-md overflow-hidden bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      {editable && (
        <div className="bg-muted/50 border-b border-input p-2 flex flex-wrap gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn("h-8 w-8 p-0", editor.isActive('bold') && "bg-muted text-foreground")}
            title="Bold"
          >
            <span className="font-bold">B</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn("h-8 w-8 p-0", editor.isActive('italic') && "bg-muted text-foreground")}
            title="Italic"
          >
            <span className="italic">I</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const url = window.prompt('URL')
              if (url) {
                editor.chain().focus().setLink({ href: url }).run()
              }
            }}
            className={cn("h-8 w-8 p-0", editor.isActive('link') && "bg-muted text-foreground")}
            title="Link"
          >
            <LinkIcon className="w-4 h-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1 my-auto" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn("h-8 w-auto px-2", editor.isActive('bulletList') && "bg-muted text-foreground")}
            title="Bullet List"
          >
            <span className="font-bold mr-1">·</span> List
          </Button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}

export default function TakedownCasePage() {
  const params = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [newNote, setNewNote] = useState('')

  // Documents State
  const [documents, setDocuments] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  // Form State
  const [status, setStatus] = useState('')
  const [emailStatus, setEmailStatus] = useState('')

  useEffect(() => {
    async function load() {
      if (!params.id) return
      setLoading(true)

      const [details, docs] = await Promise.all([
        getTakedownDetails(params.id),
        getTakedownDocuments(params.id)
      ])

      setData(details)
      setDocuments(docs || [])

      if (details?.takedown) {
        setStatus(details.takedown.status)
        setEmailStatus(details.takedown.platform_email_status)
      }
      setLoading(false)
    }
    load()
  }, [params.id])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    const result = await uploadTakedownDocument(params.id, formData)

    if (result.success) {
      const docs = await getTakedownDocuments(params.id)
      setDocuments(docs)
      const details = await getTakedownDetails(params.id)
      setData(prev => ({ ...prev, history: details.history }))
    } else {
      alert('Upload failed: ' + result.error)
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDownload = async (doc) => {
    const url = await getDocumentDownloadUrl(doc.id)
    if (url) {
      window.open(url, '_blank')
    } else {
      alert('Failed to generate download link')
    }
  }

  const updateStatusDirectly = async (newStatus) => {
    setUpdating(true)
    setStatus(newStatus)

    const statusToUpdate = newStatus || status

    await updateTakedown(params.id, {
      status: statusToUpdate,
      platform_email_status: emailStatus
    }, `Status updated to: ${statusToUpdate.replace('_', ' ')}`)

    const details = await getTakedownDetails(params.id)
    setData(details)
    setUpdating(false)
  }

  const handleEmailStatusUpdate = async () => {
    setUpdating(true)
    await updateTakedown(params.id, {
      status: status,
      platform_email_status: emailStatus
    }, `Email status updated to: ${emailStatus}`)

    const details = await getTakedownDetails(params.id)
    setData(details)
    setUpdating(false)
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    setUpdating(true)
    await addTakedownNote(params.id, newNote)
    setNewNote('')
    const details = await getTakedownDetails(params.id)
    setData(details)
    setUpdating(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <AlertTriangle className="w-12 h-12 mb-4" />
        <p>Case not found</p>
      </div>
    )
  }

  const { takedown, post, history } = data

  const getStatusBadgeVariant = (s) => {
    switch (s) {
      case 'accepted': return 'success'
      case 'rejected': return 'destructive'
      case 'under_review': return 'default'
      case 'suspended': return 'warning'
      default: return 'secondary'
    }
  }

  const getStatusColorClass = (s) => {
    switch (s) {
      case 'accepted': return 'bg-green-100 text-green-800 hover:bg-green-100'
      case 'rejected': return 'bg-red-100 text-red-800 hover:bg-red-100'
      case 'under_review': return 'bg-blue-100 text-blue-800 hover:bg-blue-100'
      case 'suspended': return 'bg-orange-100 text-orange-800 hover:bg-orange-100'
      default: return 'bg-gray-100 text-gray-800 hover:bg-gray-100'
    }
  }

  return (
    <div className="flex flex-col h-full bg-muted/10">
      {/* Header */}
      <header className="bg-background border-b py-4 px-6 flex items-center justify-between shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/takedowns">
              <ChevronLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight">Case #{takedown.post_platform_id.substring(0, 12)}...</h1>
              <Badge variant="outline" className="uppercase text-xs font-bold">
                {takedown.platform}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Started {new Date(takedown.created_at).toLocaleDateString()}</span>
              <span>•</span>
              <span className="flex items-center gap-1 font-medium">
                Status: <Badge className={cn("uppercase text-[10px] px-1.5 py-0 h-5", getStatusColorClass(takedown.status))}>{takedown.status?.replace('_', ' ')}</Badge>
              </span>
            </div>
          </div>
        </div>

        <Button variant="outline" size="sm" asChild className="text-indigo-600 bg-indigo-50 border-indigo-100 hover:bg-indigo-100 hover:text-indigo-700">
          <a
            href={post?.original_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            View Content <ExternalLink className="w-4 h-4 ml-2" />
          </a>
        </Button>
      </header>

      {/* Main Content Grid */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">

        {/* LEFT: Case Management (Scrollable) */}
        <div className="lg:col-span-8 h-full overflow-y-auto">
          <div className="p-6 space-y-6 pb-32">

            {/* Status Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-indigo-600" />
                  Case Status Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StageProgress
                  status={status}
                  onUpdate={updateStatusDirectly}
                  updating={updating}
                />

                <Separator className="my-6" />

                <div className="space-y-2">
                  <Label htmlFor="email-select">Platform Email Status</Label>
                  <div className="flex gap-4">
                    <Select value={emailStatus} onValueChange={setEmailStatus}>
                      <SelectTrigger id="email-select" className="w-full">
                        <SelectValue placeholder="Select email status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="sent">Email Sent</SelectItem>
                        <SelectItem value="replied">Platform Replied</SelectItem>
                        <SelectItem value="failed">Delivery Failed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleEmailStatusUpdate}
                      disabled={updating}
                    >
                      Update Email
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Track the status of the automated or manual email correspondence with the platform.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Case Details Accordion */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-indigo-600" />
                  Case Data & Analysis
                </CardTitle>
                <CardDescription>Comprehensive data collected for this post.</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full" defaultValue="ai-analysis">

                  {/* AI Analysis Section */}
                  <AccordionItem value="ai-analysis">
                    <AccordionTrigger className="text-sm font-bold uppercase tracking-wide text-gray-700">
                      <span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-500" /> AI Analysis</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      {post?.analysis_results ? (
                        <div className="space-y-4 pt-2">
                          <div className="flex items-center justify-between bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                            <div>
                              <span className="text-xs font-bold text-indigo-700 uppercase block">Risk Score</span>
                              <span className="text-2xl font-black text-indigo-900">{post.analysis_results.risk_score}/100</span>
                            </div>
                            <Badge className={cn(
                              "text-sm px-3 py-1",
                              post.analysis_results.risk_score > 80 ? "bg-red-100 text-red-800 hover:bg-red-100" : "bg-orange-100 text-orange-800 hover:bg-orange-100"
                            )}>
                              {post.analysis_results.category || "Unknown Risk"}
                            </Badge>
                          </div>

                          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border">
                            <span className="font-bold block text-gray-900 mb-1 text-xs uppercase">Analysis Reasoning</span>
                            {post.analysis_results.categorization_reason}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {post.analysis_results.poi_check && (
                              <div className="border p-3 rounded-lg">
                                <div className="text-xs font-bold text-gray-500 uppercase mb-1">POI Check</div>
                                <div className="flex items-center gap-2">
                                  {post.analysis_results.poi_check.poi_name_found ?
                                    <CheckCircle className="w-4 h-4 text-red-500" /> :
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                  }
                                  <span className="text-sm font-medium">
                                    {post.analysis_results.poi_check.poi_name_found ? "POI Found" : "No POI"}
                                  </span>
                                </div>
                              </div>
                            )}
                            {post.analysis_results.truth_check && (
                              <div className="border p-3 rounded-lg">
                                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Credibility</div>
                                <div className="flex items-center gap-2">
                                  {post.analysis_results.truth_check.is_credible === false ?
                                    <AlertTriangle className="w-4 h-4 text-red-500" /> :
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                  }
                                  <span className="text-sm font-medium">
                                    {post.analysis_results.truth_check.is_credible === false ? "Misinformation" : "Credible"}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-gray-500 italic">No AI Analysis data available.</div>
                      )}
                    </AccordionContent>
                  </AccordionItem>

                  {/* Post Content Section */}
                  <AccordionItem value="content">
                    <AccordionTrigger className="text-sm font-bold uppercase tracking-wide text-gray-700">
                      <span className="flex items-center gap-2"><FileText className="w-4 h-4 text-gray-500" /> Post Content</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pt-2">
                        <div className="text-sm leading-relaxed whitespace-pre-wrap bg-gray-50 p-3 rounded-lg border">
                          {post?.caption || post?.post_content?.caption || "No caption available."}
                        </div>

                        {post?.media_urls?.length > 0 && (
                          <div>
                            <span className="text-xs font-bold text-gray-500 uppercase block mb-2">Media Assets</span>
                            <div className="grid grid-cols-2 gap-2">
                              {post.media_urls.map((media, i) => (
                                <a key={i} href={media.original_url} target="_blank" className="block text-xs text-blue-600 truncate hover:underline border p-2 rounded">
                                  Media Link {i + 1}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Profile & Engagement Section */}
                  <AccordionItem value="profile-stats">
                    <AccordionTrigger className="text-sm font-bold uppercase tracking-wide text-gray-700">
                      <span className="flex items-center gap-2"><User className="w-4 h-4 text-gray-500" /> Author & Engagement</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="space-y-1">
                          <span className="text-xs font-bold text-gray-500 uppercase">Author</span>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={post?.user?.profile_pic_url} />
                              <AvatarFallback>U</AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">{post?.user?.username}</span>
                          </div>
                          {post?.user?.full_name && <p className="text-xs text-gray-500">{post.user.full_name}</p>}
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs font-bold text-gray-500 uppercase">Platform ID</span>
                          <p className="text-xs font-mono bg-gray-100 px-2 py-1 rounded inline-block">{post?.post_id || post?.code}</p>
                        </div>

                        <div className="col-span-2 border-t pt-3 mt-1">
                          <span className="text-xs font-bold text-gray-500 uppercase block mb-2">Engagement Metrics</span>
                          <div className="grid grid-cols-4 gap-2 text-center">
                            <div className="bg-gray-50 p-2 rounded">
                              <span className="block text-lg font-bold text-gray-900">{post?.stats?.like_count || 0}</span>
                              <span className="text-[10px] text-gray-500 uppercase">Likes</span>
                            </div>
                            <div className="bg-gray-50 p-2 rounded">
                              <span className="block text-lg font-bold text-gray-900">{post?.stats?.comment_count || 0}</span>
                              <span className="text-[10px] text-gray-500 uppercase">Comments</span>
                            </div>
                            <div className="bg-gray-50 p-2 rounded">
                              <span className="block text-lg font-bold text-gray-900">{post?.stats?.share_count || 0}</span>
                              <span className="text-[10px] text-gray-500 uppercase">Shares</span>
                            </div>
                            <div className="bg-gray-50 p-2 rounded">
                              <span className="block text-lg font-bold text-gray-900">{post?.stats?.view_count || '-'}</span>
                              <span className="text-[10px] text-gray-500 uppercase">Views</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Raw JSON Section */}
                  <AccordionItem value="raw-json">
                    <AccordionTrigger className="text-sm font-bold uppercase tracking-wide text-gray-700">
                      <span className="flex items-center gap-2"><File className="w-4 h-4 text-gray-500" /> Raw Data</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="bg-gray-950 text-gray-50 p-4 rounded-lg overflow-x-auto">
                        <pre className="text-xs font-mono">
                          {JSON.stringify(post, null, 2)}
                        </pre>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                </Accordion>
              </CardContent>
            </Card>

            {/* Notes Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  Case Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Notes Read-Only View */}
                <div className="bg-muted/30 rounded-lg p-4 border text-sm text-foreground whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                  {takedown.notes ? takedown.notes : <span className="text-muted-foreground italic">No notes added yet.</span>}
                </div>

                <Separator />

                {/* Add Note */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground font-bold">Add New Note</Label>
                  <Tiptap
                    content={newNote}
                    onChange={setNewNote}
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={handleAddNote}
                      disabled={updating || !newNote}
                      variant="secondary"
                    >
                      Add Note <MessageSquare className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Documents / Evidence */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <File className="w-5 h-5 text-indigo-600" />
                  Evidence Documents
                </CardTitle>
                <CardDescription>Upload reports, screenshots, or correspondence.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Upload Area */}
                <div
                  className="border-2 border-dashed border-indigo-100 bg-indigo-50/30 rounded-lg p-6 text-center hover:bg-indigo-50 transition-colors cursor-pointer group"
                  onClick={() => !uploading && fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleUpload}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center gap-2 text-indigo-900/60 group-hover:text-indigo-900">
                    {uploading ? (
                      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                    ) : (
                      <Upload className="w-8 h-8 mb-1 text-indigo-400 group-hover:text-indigo-600 transition-colors" />
                    )}
                    <p className="text-sm font-medium">
                      {uploading ? 'Uploading...' : 'Click to upload evidence'}
                    </p>
                    <p className="text-xs">PDF, PNG, JPG supported</p>
                  </div>
                </div>

                {/* Document List */}
                {documents.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground font-bold">Uploaded Files</Label>
                    <div className="space-y-2">
                      {documents.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm hover:border-indigo-200 transition-colors">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-8 h-8 rounded bg-indigo-50 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4 text-indigo-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{doc.file_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {(doc.file_size / 1024).toFixed(1)} KB • {new Date(doc.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(doc)}
                            className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>

        {/* RIGHT: Timeline & Post Context */}
        <div className="lg:col-span-4 bg-background border-l h-full overflow-auto flex flex-col">
          <div className="flex-1 overflow-y-auto p-6">

            {/* Post Context Mini Card */}
            <div className="mb-8">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Target Content</h3>
              <Card className="overflow-scroll">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={post?.user?.profile_pic_url} />
                      <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{post?.user?.username || 'Unknown User'}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{takedown.post_platform_id}</p>
                    </div>
                  </div>

                  {post?.signedImageUrl && (
                    <div className="aspect-square rounded-md bg-muted overflow-hidden relative group">
                      <img src={post.signedImageUrl} className="w-full object-contain transition-transform" alt="Evidence" />
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground line-clamp-4 leading-relaxed">
                    {post?.content || "No caption available."}
                  </p>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 hover:bg-red-50 hover:text-red-800 gap-1 pl-1 pr-2">
                      <AlertTriangle className="w-3 h-3" /> Risk: {takedown.risk_score}
                    </Badge>
                    <span className="text-xs text-muted-foreground capitalize font-medium">{takedown.threat_type?.replace('_', ' ')}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* History Timeline */}
            <div>
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                <History className="w-3 h-3" /> Case History
              </h3>

              <div className="space-y-6 relative ml-2 before:absolute before:left-[11px] before:top-2 before:bottom-0 before:w-px before:bg-border">
                {history.map((event, idx) => (
                  <div key={event.id} className="relative pl-8">
                    <div className={cn(
                      "absolute left-0 top-1 w-6 h-6 rounded-full border-2 border-background flex items-center justify-center text-[10px] shadow-sm z-10",
                      event.action === 'update' ? 'bg-blue-100 text-blue-600' :
                        event.action === 'note_added' ? 'bg-yellow-100 text-yellow-600' :
                          'bg-gray-100 text-gray-500'
                    )}>
                      {event.action === 'update' ? <CheckCircle className="w-3 h-3" /> :
                        event.action === 'note_added' ? <MessageSquare className="w-3 h-3" /> :
                          <Clock className="w-3 h-3" />}
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.created_at).toLocaleString()}
                      </p>
                      <p className="text-sm font-medium text-foreground capitalize">
                        {event.action.replace('_', ' ')}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed bg-muted/40 p-2 rounded border border-transparent">
                        {event.details}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Initial Event */}
                <div className="relative pl-8">
                  <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-green-100 text-green-600 border-2 border-background flex items-center justify-center shadow-sm z-10">
                    <CheckCircle className="w-3 h-3" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {new Date(takedown.created_at).toLocaleString()}
                    </p>
                    <p className="text-sm font-medium text-foreground">Case Created</p>
                    <p className="text-xs text-muted-foreground">Takedown initiated.</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}