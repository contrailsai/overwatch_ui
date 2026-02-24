'use client'

import { useState, useEffect, useRef } from 'react'
import { getTakedownDetails, updateTakedown, addTakedownNote, uploadTakedownDocument, getTakedownDocuments, getDocumentDownloadUrl, checkReviewerPermission } from '../../actions'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, AlertTriangle, CheckCircle, Clock, Mail, FileText,
  ExternalLink, User, Calendar, Shield, Save, MessageSquare, History,
  Link as LinkIcon, Download, Upload, File, Loader2, Trash2,
  Eye, Check, XCircle, AlertCircle, ChevronRight, Database, Sparkles, Lock,
  ThumbsUp, MessageCircle, Share2, BarChart2, Flag, BadgeCheck, Quote, Activity, ShieldAlert, Info
} from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TipTapLink from '@tiptap/extension-link'
import ProfilePic from '@/components/ProfilePic'

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
function StageProgress({ status, onUpdate, updating, readOnly }) {
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
    if (readOnly) return
    if (currentIndex === 0) onUpdate('under_review')
  }

  const handleBack = () => {
    if (readOnly) return
    if (currentIndex === 1) onUpdate('raised')
    if (currentIndex === 2) onUpdate('under_review')
  }

  // Read-Only / Client View - Clean Timeline
  if (readOnly) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between w-full px-2">
          {steps.map((step, idx) => {
            const isActive = idx === currentIndex
            const isCompleted = idx < currentIndex
            const Icon = step.icon

            return (
              <div key={step.id} className="flex flex-col items-center gap-3 relative z-10">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors duration-300 bg-white",
                  isActive || isCompleted ? "border-blue-600 text-blue-600" : "border-gray-200 text-gray-300"
                )}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={cn(
                  "text-xs font-bold uppercase tracking-wider",
                  isActive || isCompleted ? "text-blue-900" : "text-gray-400"
                )}>{step.label}</span>
              </div>
            )
          })}
          {/* Simple background line */}
          <div className="absolute left-6 right-6 top-[3.5rem] h-0.5 bg-gray-100 -z-0 hidden md:block" />
        </div>

        <div className="bg-slate-50 rounded-lg p-4 border text-center">
          <p className="text-sm text-slate-600 font-medium">
            Current Status: <span className="text-blue-700 font-bold uppercase">{status?.replace('_', ' ')}</span>
          </p>
        </div>
      </div>
    )
  }

  // Reviewer Interactive View
  return (
    <div className="space-y-8">
      {/* Visual Stepper */}
      <div className="relative flex items-center justify-between w-full px-4">
        {/* Connecting Line */}
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-1 bg-gray-100 -z-10 rounded-full" />
        <div
          className="absolute left-0 top-1/2 transform -translate-y-1/2 h-1 bg-blue-600 -z-10 rounded-full transition-all duration-500"
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
                  isActive ? "bg-blue-600 border-blue-600 text-white shadow-lg scale-110" :
                    isCompleted ? "bg-blue-100 border-blue-600 text-blue-600" :
                      "bg-white border-gray-200 text-gray-300"
                )}
              >
                {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
              </div>
              <span className={cn(
                "text-xs font-bold uppercase tracking-wider transition-colors duration-300",
                isActive ? "text-blue-600" :
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
            <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium">
              Case has been raised and is ready for review.
            </div>
            <Button
              onClick={handleNext}
              disabled={updating}
              className="bg-blue-600 hover:bg-blue-700 w-full md:w-auto"
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
          class: 'text-blue-600 underline cursor-pointer',
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
        class: cn('prose prose-sm focus:outline-none min-h-[150px] p-4 max-w-none text-gray-700', !editable && 'bg-gray-50 text-gray-500 cursor-not-allowed'),
      },
    },
  })

  // Update editable state if prop changes
  useEffect(() => {
    if (editor) editor.setEditable(editable)
  }, [editor, editable])

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

function SignalCard({ active, title, icon: Icon, color, extra }) {
  if (!active) {
    return (
      <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col justify-between h-24 opacity-60">
        <Icon className="w-5 h-5 text-slate-300" />
        <span className="text-xs font-bold text-slate-400 uppercase">{title}</span>
      </div>
    )
  }

  const colorStyles = {
    purple: "bg-purple-50 border-purple-100 text-purple-700",
    rose: "bg-rose-50 border-rose-100 text-rose-700",
    orange: "bg-orange-50 border-orange-100 text-orange-700",
    blue: "bg-blue-50 border-blue-100 text-blue-700"
  }[color] || "bg-slate-100 text-slate-700";

  const iconColors = {
    purple: "text-purple-600",
    rose: "text-rose-600",
    orange: "text-orange-600",
    blue: "text-blue-600"
  }[color] || "text-slate-600";

  return (
    <div className={cn("p-4 rounded-xl border flex flex-col justify-between h-24 transition-all hover:shadow-md", colorStyles)}>
      <div className="flex justify-between items-start">
        <Icon className={cn("w-5 h-5", iconColors)} />
        <div className="h-2 w-2 rounded-full bg-current animate-pulse" />
      </div>
      <div>
        <span className="text-xs font-extrabold uppercase tracking-wide block">{title}</span>
        {extra && <span className="text-[10px] opacity-80 font-medium truncate block mt-0.5">{extra}</span>}
      </div>
    </div>
  )
}

export default function TakedownCasePage() {
  const params = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [isReviewer, setIsReviewer] = useState(false)
  const [imgError, setImgError] = useState(false)

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

      const [details, docs, permission] = await Promise.all([
        getTakedownDetails(params.id),
        getTakedownDocuments(params.id),
        checkReviewerPermission()
      ])

      setData(details)
      setDocuments(docs || [])
      setIsReviewer(permission)

      if (details?.takedown) {
        setStatus(details.takedown.status)
        setEmailStatus(details.takedown.platform_email_status)
      }
      setLoading(false)
    }
    load()
  }, [params.id])

  const handleUpload = async (e) => {
    if (!isReviewer) return

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
    if (!isReviewer) return
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
    if (!isReviewer) return
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
    if (!isReviewer || !newNote.trim()) return
    setUpdating(true)
    await addTakedownNote(params.id, newNote)
    setNewNote('')
    const details = await getTakedownDetails(params.id)
    setData(details)
    setUpdating(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
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
  const review = post?.review_details || {}
  const analysis = post?.analysis_results || {}
  console.log(post)

  const getStatusColorClass = (s) => {
    switch (s) {
      case 'accepted': return 'bg-green-100 text-green-800 hover:bg-green-100'
      case 'rejected': return 'bg-red-100 text-red-800 hover:bg-red-100'
      case 'under_review': return 'bg-blue-100 text-blue-800 hover:bg-blue-100'
      case 'suspended': return 'bg-orange-100 text-orange-800 hover:bg-orange-100'
      default: return 'bg-gray-100 text-gray-800 hover:bg-gray-100'
    }
  }

  // --- Data Resolution for UI ---
  const riskScore = review.threat_score ?? analysis.risk_score ?? 0;
  let category = review.primary_threat_type || review.threat_type || analysis.category || 'Unknown';
  if (Array.isArray(review.threat_types) && review.threat_types.length > 0) {
    category = review.threat_types.join(', ').replace(/_/g, ' ');
  }
  const reasoning = review.reasoning || analysis.categorization_reason || 'No detailed reasoning provided.';
  const reviewerNote = review.reviewer_comments || null;
  const poiNames = review.poi_names || analysis.poi_check?.poi_names || [];

  const isPoiPresent = review.flags?.poi_confirmed ?? (analysis.poi_check?.poi_name_found || analysis.poi_check?.face_present) ?? false;
  const isNsfw = review.flags?.is_nsfw ?? (analysis.nsfw_check?.is_safe === false) ?? false;
  const isHateSpeech = review.flags?.is_hate_speech ?? (analysis.hate_speech_check?.is_safe === false) ?? false;
  const isFakeNews = review.flags?.is_fake_news ?? (analysis.truth_check?.is_credible === false) ?? false;
  const isAigc = review.flags?.is_aigc ?? analysis.aigc_check?.is_aigc ?? false;

  return (
    <div className="flex flex-col h-full bg-muted/10 w-full">
      {/* Header */}
      <header className="bg-background border-b py-4 px-6 flex items-center justify-between shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/takedowns">
              <ChevronLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div className='flex flex-col gap-3'>
            <div className="flex items-center gap-5">
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

        <div className="flex gap-2">
          {/* Primary action if needed */}
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 w-full ">

        {/* LEFT: Case Management (Scrollable) */}
        <div className="lg:col-span-8 h-full overflow-y-auto w-full">
          <div className="px-6 pt-3 space-y-6 pb-32">

            {/* Status Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-600" />
                  Case Status Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StageProgress
                  status={status}
                  onUpdate={updateStatusDirectly}
                  updating={updating}
                  readOnly={!isReviewer}
                />

                <Separator className="my-6" />

                <div className="space-y-2">
                  <Label htmlFor="email-select">Platform Email Status</Label>
                  {isReviewer ? (
                    <div className="flex gap-4">
                      <Select value={emailStatus} onValueChange={setEmailStatus} disabled={!isReviewer}>
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
                        disabled={updating || !isReviewer}
                      >
                        Update Email
                      </Button>
                    </div>
                  ) : (
                    // Read Only View for Clients
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
                      <Mail className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700 capitalize">
                        {emailStatus === 'pending' ? 'Pending Correspondence' :
                          emailStatus === 'sent' ? 'Email Sent to Platform' :
                            emailStatus === 'replied' ? 'Platform Replied' : 'Delivery Failed'}
                      </span>
                    </div>
                  )}
                  {isReviewer && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Track the status of the automated or manual email correspondence with the platform.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Case Details Accordion */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-blue-600" />
                  Case Information
                </CardTitle>
                <CardDescription>Comprehensive information about the case.</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full" defaultValue="content">

                  {/* Combined Post Content & Engagement (NEW DESIGN) */}
                  <AccordionItem value="content">
                    <AccordionTrigger className="text-sm font-bold uppercase tracking-wide text-gray-700">
                      <span className="flex items-center gap-2"><FileText className="w-4 h-4 text-gray-500" /> Review Details</span>
                    </AccordionTrigger>
                    <AccordionContent>

                      <div className="flex-1 overflow-y-auto p-6 space-y-8">

                        {/* Threat Score Card */}
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Risk Assessment</h4>
                          <div className={cn(
                            "rounded-3xl p-6 border text-white relative overflow-hidden shadow-lg",
                            riskScore > 75 ? "bg-gradient-to-br from-red-500 to-red-600 border-red-400" :
                              riskScore > 40 ? "bg-gradient-to-br from-orange-400 to-orange-500 border-orange-300" :
                                "bg-gradient-to-br from-emerald-400 to-emerald-500 border-emerald-300"
                          )}>
                            <div className="absolute top-0 right-0 p-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

                            <div className="relative z-10 flex justify-between items-end">
                              <div>
                                <p className="text-white/80 font-medium text-sm mb-1">Threat Score</p>
                                <div className="text-6xl font-black tracking-tighter flex items-baseline gap-2">
                                  {riskScore}
                                  <span className="text-xl font-medium opacity-60">/100</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold uppercase mb-2">
                                  <Activity className="w-3 h-3" /> Analysis
                                </div>
                                <p className="font-bold text-lg leading-tight max-w-[120px]">{category}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Detection Grid */}
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Detection Signals</h4>
                          <div className="grid grid-cols-2 gap-3">
                            <SignalCard
                              active={isAigc}
                              title="AI Generated"
                              icon={Activity}
                              color="purple"
                            />
                            <SignalCard
                              active={isHateSpeech}
                              title="Hate Speech"
                              icon={AlertTriangle}
                              color="rose"
                            />
                            <SignalCard
                              active={isFakeNews}
                              title="Misinformation"
                              icon={ShieldAlert}
                              color="orange"
                            />
                            <SignalCard
                              active={isPoiPresent}
                              title="POI Detected"
                              icon={User}
                              color="blue"
                              extra={poiNames.length > 0 ? poiNames[0] : null}
                            />
                          </div>
                        </div>

                        {/* Reasoning */}
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Eye className="w-3.5 h-3.5" /> AI Reasoning
                          </h4>
                          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 text-slate-600 leading-relaxed text-sm font-medium">
                            {reasoning}
                          </div>
                        </div>

                        {/* Reviewer Note */}
                        {reviewerNote && (
                          <div className="bg-amber-50 border-l-4 border-amber-300 p-5 rounded-r-xl">
                            <h4 className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-2 flex items-center">
                              <User className="w-3.5 h-3.5 mr-1.5" /> Analyst Note
                            </h4>
                            <p className="text-amber-800 font-medium text-sm">
                              {reviewerNote}
                            </p>
                          </div>
                        )}

                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="history">
                    <AccordionTrigger className="text-sm font-bold uppercase tracking-wide text-gray-700">
                      <span className="flex items-center gap-2"><History className="w-4 h-4 text-gray-500" /> Case History</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      {/* History Timeline */}
                      <div>
                        {/* <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2 mt-8 border-t pt-8">
                          <History className="w-3 h-3" /> Case History
                        </h3> */}

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
                    </AccordionContent>
                  </AccordionItem>

                  {/* Raw JSON Section - REVIEWER ONLY */}
                  {isReviewer && (
                    <AccordionItem value="raw-json">
                      <AccordionTrigger className="text-sm font-bold uppercase tracking-wide text-gray-700">
                        <span className="flex items-center gap-2"><File className="w-4 h-4 text-gray-500" /> Raw Data (Internal)</span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="bg-gray-950 text-gray-50 p-4 rounded-lg overflow-x-auto">
                          <pre className="text-xs font-mono">
                            {JSON.stringify(post, null, 2)}
                          </pre>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

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

                {isReviewer && (
                  <>
                    <Separator />
                    {/* Add Note - Reviewer Only */}
                    <div className="space-y-2">
                      <Label className="text-xs uppercase text-muted-foreground font-bold">Add New Note</Label>
                      <Tiptap
                        content={newNote}
                        onChange={setNewNote}
                        editable={true}
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
                  </>
                )}
              </CardContent>
            </Card>

            {/* Documents / Evidence */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <File className="w-5 h-5 text-blue-600" />
                  Evidence Documents
                </CardTitle>
                <CardDescription>Upload reports, screenshots, or correspondence.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Upload Area - Reviewer Only */}
                {isReviewer && (
                  <div
                    className="border-2 border-dashed border-blue-100 bg-blue-50/30 rounded-lg p-6 text-center hover:bg-blue-50 transition-colors cursor-pointer group"
                    onClick={() => !uploading && fileInputRef.current?.click()}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleUpload}
                      className="hidden"
                    />
                    <div className="flex flex-col items-center gap-2 text-blue-900/60 group-hover:text-blue-900">
                      {uploading ? (
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                      ) : (
                        <Upload className="w-8 h-8 mb-1 text-blue-400 group-hover:text-blue-600 transition-colors" />
                      )}
                      <p className="text-sm font-medium">
                        {uploading ? 'Uploading...' : 'Click to upload evidence'}
                      </p>
                      <p className="text-xs">PDF, PNG, JPG supported</p>
                    </div>
                  </div>
                )}

                {/* Document List */}
                {documents.length > 0 ? (
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground font-bold">Uploaded Files</Label>
                    <div className="space-y-2">
                      {documents.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm hover:border-blue-200 transition-colors">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-8 h-8 rounded bg-blue-50 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4 text-blue-600" />
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
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  !isReviewer && (
                    <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg bg-gray-50 border-dashed">
                      No documents have been uploaded for this case yet.
                    </div>
                  )
                )}
              </CardContent>
            </Card>

          </div>
        </div>

        {/* RIGHT: Target Content & Intelligence  */}
        <div className="lg:col-span-4 bg-white border-l h-full overflow-auto flex flex-col shadow-xl z-20">
          <div className="space-y-6 pt-3 px-4 pb-10">

            {/* 1. Author & Link Header */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-5">
              <div className="relative shrink-0">
                {(post?.user?.profile_pic_url && !imgError) ? (
                  <img
                    src={post.user.profile_pic_url}
                    onError={() => setImgError(true)}
                    alt=""
                    className="w-16 h-16 rounded-full object-cover border-4 border-slate-50"
                  />
                ) : (
                  <ProfilePic user={post?.user?.username || 'Unknown'} size={64} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-slate-900 truncate flex items-center gap-2">
                  {post?.user?.username || 'Unknown User'}
                  {post?.user?.is_verified && <BadgeCheck className="w-5 h-5 text-blue-500 fill-blue-50" />}
                </h3>
                <p className="text-slate-500 font-medium truncate">{post?.user?.full_name}</p>
              </div>
              <Button variant="outline" size="sm" asChild className="text-slate-700 bg-slate-100 border-slate-200 hover:bg-slate-200">
                <a
                  href={post?.original_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span className="hidden sm:inline">View Source</span>
                </a>
              </Button>
            </div>

            {/* 2. Media Display */}
            <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-lg border border-slate-800 relative group flex items-center justify-center min-h-[400px]">
              {post?.signedImageUrl ? (
                <img
                  src={post.signedImageUrl}
                  alt="Evidence"
                  className="w-full h-auto max-h-[600px] object-contain"
                />
              ) : (
                <div className="text-center p-12">
                  <Quote className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium text-lg">Text-Only Content</p>
                </div>
              )}
            </div>

            {/* 3. Caption & Metrics */}
            <div className="grid grid-cols-1 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h4 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                  <MessageCircle className="w-3 h-3" /> Post Caption
                </h4>
                <div className="text-slate-800 leading-relaxed whitespace-pre-wrap font-medium text-base">
                  {post?.content || <span className="italic text-slate-400">No caption content available.</span>}
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex flex-col items-center p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                  <ThumbsUp className="w-5 h-5 text-slate-400 mb-1.5" />
                  <span className="text-xl font-bold text-slate-900">{post?.stats?.like_count?.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Likes</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                  <MessageCircle className="w-5 h-5 text-slate-400 mb-1.5" />
                  <span className="text-xl font-bold text-slate-900">{post?.stats?.comment_count?.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Comments</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                  <Share2 className="w-5 h-5 text-slate-400 mb-1.5" />
                  <span className="text-xl font-bold text-slate-900">{post?.stats?.share_count?.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Shares</span>
                </div>
                <div className="flex flex-col items-center p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                  <BarChart2 className="w-5 h-5 text-slate-400 mb-1.5" />
                  <span className="text-xl font-bold text-slate-900">{post?.stats?.view_count?.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Views</span>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-50 text-slate-500 rounded-lg">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase">Sourcing Date</span>
                  </div>
                  <span className="font-bold text-slate-900 text-sm">{post?.metadata?.sourcing_date ? new Date(post.metadata.sourcing_date).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-50 text-slate-500 rounded-lg">
                      <Activity className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase">Extraction Date</span>
                  </div>
                  <span className="font-bold text-slate-900 text-sm">{post?.metadata?.created_at ? new Date(post.metadata.created_at).toLocaleDateString() : 'N/A'}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
