'use client'

import { useState, useEffect, useRef } from 'react'
import { getTakedownDetails, updateTakedown, addTakedownNote, uploadTakedownDocument, getTakedownDocuments, getDocumentDownloadUrl } from '../../actions'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, AlertTriangle, CheckCircle, Clock, Mail, FileText,
  ExternalLink, User, Calendar, Shield, Save, MessageSquare, History,
  Link as LinkIcon, Download, Upload, File, Loader2, Trash2,
  Eye, Check, XCircle, AlertCircle, ChevronRight, Database, Sparkles, Lock,
  ThumbsUp, MessageCircle, Share2, BarChart2, Flag, BadgeCheck, Quote, Activity, ShieldAlert, Info,
  ScanFace, Bot, MessageSquareWarning, Fingerprint, ShieldQuestion, FishingHook, UserRoundX, TrendingUp, EyeOff, Siren, Laugh, Scale, ShieldX,
  Heart, Facebook, Instagram, Youtube, Video, Image as ImageIcon
} from 'lucide-react'
import { Twitter, Reddit } from '@/utils/icons'
import { format } from "date-fns"
import SafeDate from '@/components/SafeDate'
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

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '')
    }
  }, [content, editor])

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

const getRiskLabel = (score) => {
  if (score >= 96) return { label: 'High', color: 'text-rose-500 bg-rose-50 border-rose-200' };
  if (score >= 76) return { label: 'Medium', color: 'text-orange-500 bg-orange-50 border-orange-200' };
  if (score >= 41) return { label: 'Low', color: 'text-amber-500 bg-amber-50 border-amber-200' };
  return { label: 'Safe', color: 'text-slate-500 bg-slate-50 border-slate-200' };
}

function ViolationCard({ active, title, icon: Icon, color, extra, referenceLink }) {
  if (!active) return null;

  const colorStyles = {
    purple: "bg-purple-50/50 border-purple-100/50 text-purple-700",
    rose: "bg-rose-50/50 border-rose-100/50 text-rose-700",
    orange: "bg-orange-50/50 border-orange-100/50 text-orange-700",
    indigo: "bg-indigo-50/50 border-indigo-100/50 text-indigo-700",
    red: "bg-red-50/50 border-red-100/50 text-red-700",
    violet: "bg-violet-50/50 border-violet-100/50 text-violet-700",
    yellow: "bg-yellow-50/50 border-yellow-100/50 text-yellow-700",
    blue: "bg-blue-50/50 border-blue-100/50 text-blue-700",
    emerald: "bg-emerald-50/50 border-emerald-100/50 text-emerald-700",
    amber: "bg-amber-50/50 border-amber-100/50 text-amber-700",
  }[color] || "bg-slate-50 border-slate-100 text-slate-700";

  const iconBg = {
    purple: "bg-purple-100 text-purple-600",
    rose: "bg-rose-100 text-rose-600",
    orange: "bg-orange-100 text-orange-600",
    indigo: "bg-indigo-100 text-indigo-600",
    red: "bg-red-100 text-red-600",
    violet: "bg-violet-100 text-violet-600",
    yellow: "bg-yellow-100 text-yellow-600",
    blue: "bg-blue-100 text-blue-600",
    emerald: "bg-emerald-100 text-emerald-600",
    amber: "bg-amber-100 text-amber-600",
  }[color] || "bg-slate-100 text-slate-600";

  return (
    <div className={cn(
      "group relative flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 hover:shadow-md hover:scale-[1.02]",
      colorStyles
    )}>
      <div className={cn("shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:rotate-6", iconBg)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-bold truncate block">{title}</span>
      </div>
      {referenceLink && (
        <a
          href={referenceLink}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-md hover:bg-black/5 transition-colors shrink-0"
          title="View Reference"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-4 h-4 opacity-70" />
        </a>
      )}
    </div>
  )
}

export default function TakedownDetails({ takedownId, initialData, initialDocuments, isReviewer, project, clientDetails }) {
  const router = useRouter()
  const [data, setData] = useState(initialData)
  const [updating, setUpdating] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [imgError, setImgError] = useState(false)

  // Documents State
  const [documents, setDocuments] = useState(initialDocuments)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  // Form State
  const [status, setStatus] = useState(initialData?.takedown?.status || '')
  const [emailStatus, setEmailStatus] = useState(initialData?.takedown?.platform_email_status || '')

  useEffect(() => {
    setData(initialData)
    setDocuments(initialDocuments)
    if (initialData?.takedown) {
      setStatus(initialData.takedown.status)
      setEmailStatus(initialData.takedown.platform_email_status)
    }
  }, [initialData, initialDocuments])

  const handleUpload = async (e) => {
    if (!isReviewer) return

    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    const result = await uploadTakedownDocument(takedownId, formData)

    if (result.success) {
      const docs = await getTakedownDocuments(takedownId)
      setDocuments(docs)
      const details = await getTakedownDetails(takedownId)
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

    await updateTakedown(takedownId, {
      status: statusToUpdate,
      platform_email_status: emailStatus
    }, `Status updated to: ${statusToUpdate.replace('_', ' ')}`)

    const details = await getTakedownDetails(takedownId)
    setData(details)
    setUpdating(false)
    router.refresh()
  }

  const handleEmailStatusUpdate = async () => {
    if (!isReviewer) return
    setUpdating(true)
    await updateTakedown(takedownId, {
      status: status,
      platform_email_status: emailStatus
    }, `Email status updated to: ${emailStatus}`)

    const details = await getTakedownDetails(takedownId)
    setData(details)
    setUpdating(false)
    router.refresh()
  }

  const handleAddNote = async () => {
    if (!isReviewer || !newNote.trim()) return
    setUpdating(true)
    await addTakedownNote(takedownId, newNote)
    setNewNote('')
    const details = await getTakedownDetails(takedownId)
    setData(details)
    setUpdating(false)
    router.refresh()
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

  let posted_date = ""
  let sourced_date = ""

  if (post?.posted_date)
    posted_date = format(new Date(post.posted_date), "dd/MM/yyyy");
  else if (post?.metadata?.posted_date)
    posted_date = format(new Date(post.metadata.posted_date), "dd/MM/yyyy");
  else if (post?.timestamp)
    posted_date = format(new Date(post.timestamp), "dd/MM/yyyy");
  else if (post?.sourcing_date)
    posted_date = format(new Date(post.sourcing_date), "dd/MM/yyyy");

  if (post?.metadata?.created_at)
    sourced_date = format(new Date(post.metadata.created_at), "dd/MM/yyyy");
  else if (post?.created_at)
    sourced_date = format(new Date(post.created_at), "dd/MM/yyyy");

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
  const legalCodes = review.legal_codes || [];

  // Flags
  const isPoiPresent = review.face_present ?? review.flags?.poi_confirmed ?? (analysis.poi_check?.poi_name_found || analysis.poi_check?.face_present) ?? false;
  const isAigc = review.is_aigc ?? review.flags?.is_aigc ?? analysis.aigc_check?.is_aigc ?? false;

  // Helper for better icon mapping
  const getLabelConfig = (labelName) => {
    const name = labelName.toLowerCase().replace(/[-_]/g, ' ');
    if (name.includes('scam') || name.includes('fraud')) return { icon: Fingerprint, color: 'rose' };
    if (name.includes('investment')) return { icon: TrendingUp, color: 'emerald' };
    if (name.includes('misinformation') || name.includes('fake')) return { icon: ShieldX, color: 'orange' };
    if (name.includes('hate')) return { icon: MessageSquareWarning, color: 'red' };
    if (name.includes('satire') || name.includes('humor')) return { icon: Laugh, color: 'blue' };
    if (name.includes('nsfw')) return { icon: EyeOff, color: 'indigo' };
    if (name.includes('violence') || name.includes('terrorism')) return { icon: Siren, color: 'red' };
    if (name.includes('asset')) return { icon: ShieldQuestion, color: 'amber' };
    if (name.includes('spam')) return { icon: ShieldX, color: 'blue' };
    if (name.includes('phishing')) return { icon: FishingHook, color: 'indigo' };
    if (name.includes('propaganda')) return { icon: UserRoundX, color: 'red' };
    return { icon: AlertCircle, color: 'amber' };
  };

  // Resolve Dynamic Labels and Legacy Flags
  const projectLabels = project?.project_details?.labels || [];
  const activeLabels = [];

  // 1. Check Project Labels (New Format)
  projectLabels.forEach(label => {
    const isActive = review.flags?.[label.name] === true;
    if (isActive) {
      const config = getLabelConfig(label.name);
      const formattedTitle = label.name
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());

      activeLabels.push({
        name: label.name,
        title: formattedTitle,
        icon: config.icon,
        color: label.severity === 'high' ? 'rose' : label.severity === 'medium' ? 'orange' : label.severity === 'low' ? 'yellow' : config.color
      });
    }
  });

  // 2. Check Legacy Flags (Backward Compatibility)
  const legacyFlagMap = {
    is_hate_speech: { title: "Hate Speech", icon: MessageSquareWarning, color: "orange" },
    is_fake_news: { title: "Misinformation", icon: ShieldAlert, color: "orange" },
    is_nsfw: { title: "NSFW Content", icon: EyeOff, color: "orange" },
    is_fraud: { title: "Fraud", icon: Fingerprint, color: "rose" },
    is_asset_misuse: { title: "Asset Misuse", icon: ShieldQuestion, color: "yellow" },
    is_humor: { title: "Satire", icon: Laugh, color: "yellow" },
    is_terrorism: { title: "Terrorism", icon: Siren, color: "rose" },
    is_violence: { title: "Violence", icon: Siren, color: "orange" }
  };

  Object.entries(legacyFlagMap).forEach(([key, config]) => {
    if (review.flags?.[key] === true && !activeLabels.some(l => l.name === key)) {
      activeLabels.push({
        name: key,
        ...config
      });
    }
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 w-full overflow-hidden">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b py-3 sm:py-4 px-4 sm:px-6 flex items-center justify-between shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 sm:h-10 sm:w-10 rounded-full hover:bg-slate-100 text-slate-500">
            <Link href="/takedowns">
              <ChevronLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div className="min-w-0 flex items-center gap-3">
            <div className="h-8 w-8 sm:h-10 sm:w-10 shrink-0 bg-rose-50 rounded-full flex items-center justify-center border border-rose-100">
              <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight truncate flex items-center gap-2">
                Takedown Case
                <Badge className={cn("uppercase text-[10px] px-1.5 py-0 h-5 border-0", getStatusColorClass(takedown.status))}>
                  {takedown.status?.replace('_', ' ')}
                </Badge>
              </h1>
              <p className="text-[10px] sm:text-xs font-mono text-slate-400 truncate">Case ID: {post?._id?.toString() || takedown.id || 'Unknown'}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row lg:divide-x divide-slate-100">


        {/* LEFT PANEL: Takedown Management & Information */}
        <div className="relative w-full lg:w-[700px] xl:w-[750px] bg-slate-50 lg:bg-white flex flex-col lg:h-full shrink-0 border-t lg:border-t-0 border-slate-100">
          <div className="flex-none lg:flex-1 lg:overflow-y-auto p-4 sm:p-6 space-y-6 sm:space-y-8">
            
            {/* Main Interactive Accordion Group */}
            <Accordion type="multiple" defaultValue={["status", "intelligence", "documents"]} className="w-full space-y-4">
              
              {/* Takedown Status Management */}
              <AccordionItem value="status" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden px-1 data-[state=open]:pb-2">
                <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-slate-50/50 rounded-t-2xl transition-colors [&[data-state=open]_.metadata]:hidden">
                  <div className="flex flex-1 items-center justify-between pr-4">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Status Management</span>
                    </div>
                    <div className="metadata flex items-center gap-2 opacity-90">
                      <Badge className={cn("uppercase text-[10px] px-1.5 py-0 h-5 border-0", getStatusColorClass(status))}>
                        {status?.replace('_', ' ')}
                      </Badge>
                      {emailStatus && emailStatus !== 'pending' && (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {emailStatus}
                        </span>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-5 pt-2 pb-4">
                  <div className="bg-slate-50/50 rounded-xl border border-slate-100 p-6 mb-6">
                    <StageProgress
                      status={status}
                      onUpdate={updateStatusDirectly}
                      updating={updating}
                      readOnly={!isReviewer}
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="email-select" className="text-xs font-bold text-slate-500 uppercase tracking-wide">Platform Email Status</Label>
                    {isReviewer ? (
                      <div className="flex gap-4">
                        <Select value={emailStatus} onValueChange={setEmailStatus} disabled={!isReviewer}>
                          <SelectTrigger id="email-select" className="w-full bg-slate-50 border-slate-200 focus:ring-blue-500">
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
                          onClick={handleEmailStatusUpdate}
                          disabled={updating || !isReviewer}
                          className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                        >
                          Update
                        </Button>
                      </div>
                    ) : (
                      // Read Only View for Clients
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <Mail className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-bold text-slate-700 capitalize">
                          {emailStatus === 'pending' ? 'Pending Correspondence' :
                            emailStatus === 'sent' ? 'Email Sent to Platform' :
                              emailStatus === 'replied' ? 'Platform Replied' : 'Delivery Failed'}
                        </span>
                      </div>
                    )}
                    {isReviewer && (
                      <p className="text-xs text-slate-400 font-medium">
                        Track the status of correspondence with the platform.
                      </p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Risk Assessment & Violations */}
              <AccordionItem value="intelligence" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden px-1 data-[state=open]:pb-2">
                <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-slate-50/50 rounded-t-2xl transition-colors [&[data-state=open]_.metadata]:hidden">
                  <div className="flex flex-1 items-center justify-between pr-4">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-orange-500" />
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Intelligence & Analysis</span>
                    </div>
                    <div className="metadata flex items-center gap-2 opacity-90">
                      <Badge className={cn("uppercase text-[10px] px-1.5 py-0 h-5", getRiskLabel(riskScore).color)}>
                        {getRiskLabel(riskScore).label} Risk
                      </Badge>
                      {activeLabels.length > 0 && (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                          {activeLabels.length} Flag{activeLabels.length !== 1 && 's'}
                        </span>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-5 pt-2 pb-4 space-y-6">
                  {/* Threat Score Card */}
                  <div className={cn(
                    "rounded-2xl p-6 border relative overflow-hidden shadow-lg transition-all",
                    getRiskLabel(riskScore).color.replace('text-', 'bg-').replace('bg-', 'border-').replace('500', '600').replace('50', '500'),
                    riskScore >= 76 ? "text-white" : "text-slate-900",
                    riskScore >= 96 ? "bg-rose-600 border-rose-500 text-white" :
                      riskScore >= 76 ? "bg-orange-500 border-orange-400 text-white" :
                        riskScore >= 41 ? "bg-amber-500 border-amber-400 text-white" :
                          "bg-slate-500 border-slate-400 text-white"
                  )}>
                    <div className="absolute top-0 right-0 p-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                    <div className="relative z-10 flex justify-between items-end">
                      <div>
                        <p className="text-white/80 font-bold text-xs uppercase tracking-wide mb-1">Total Risk Score</p>
                        <div className="text-5xl font-black tracking-tighter flex items-baseline gap-2">
                          {getRiskLabel(riskScore).label}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Violation Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <ViolationCard active={isPoiPresent} title="POI Detected" icon={ScanFace} color="indigo" />
                    <ViolationCard active={isAigc} title="AI Generated" icon={Bot} color="purple" />
                    {activeLabels.map((label, idx) => (
                      <ViolationCard key={idx} active={true} title={label.title} icon={label.icon} color={label.color} />
                    ))}
                  </div>

                  {/* Legal Framework Section */}
                  {legalCodes.length > 0 && (
                    <div className="space-y-3">
                      <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Scale className="w-3 h-3" /> Legal Framework
                      </h5>
                      <div className="flex gap-2 flex-wrap">
                        {legalCodes.map((code, idx) => {
                          const projectCode = project?.project_details?.legal_codes?.find(pc => pc.name === code);
                          return (
                            <ViolationCard
                              key={idx}
                              active={true}
                              title={code}
                              icon={Scale}
                              color="purple"
                              referenceLink={projectCode?.referenceLink}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Reasoning */}
                  <div className="space-y-3">
                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Eye className="w-3 h-3" /> Review Analysis
                    </h5>
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 text-slate-600 leading-relaxed text-sm font-medium whitespace-pre-wrap">
                      {reasoning}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Evidence Documents */}
              <AccordionItem value="documents" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden px-1 data-[state=open]:pb-2">
                <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-slate-50/50 rounded-t-2xl transition-colors [&[data-state=open]_.metadata]:hidden">
                  <div className="flex flex-1 items-center justify-between pr-4">
                    <div className="flex items-center gap-2">
                      <File className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Evidence Documents</span>
                    </div>
                    <div className="metadata flex items-center gap-2 opacity-90">
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                        {documents.length} File{documents.length !== 1 && 's'}
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-5 pt-2 pb-4 space-y-4">
                  {/* Upload Area - Reviewer Only */}
                  {isReviewer && (
                    <div
                      className="border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-xl p-6 text-center hover:bg-slate-50 hover:border-blue-300 transition-colors cursor-pointer group"
                      onClick={() => !uploading && fileInputRef.current?.click()}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleUpload}
                        className="hidden"
                      />
                      <div className="flex flex-col items-center gap-2 text-slate-400 group-hover:text-blue-600">
                        {uploading ? (
                          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                        ) : (
                          <Upload className="w-8 h-8 mb-1 transition-colors" />
                        )}
                        <p className="text-sm font-bold text-slate-700 group-hover:text-blue-700">
                          {uploading ? 'Uploading...' : 'Click to upload evidence'}
                        </p>
                        <p className="text-xs font-medium text-slate-400">PDF, PNG, JPG supported</p>
                      </div>
                    </div>
                  )}

                  {/* Document List */}
                  {documents.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {documents.map((doc) => {
                        const fileNameLower = (doc.file_name || '').toLowerCase();
                        const isImage = /\.(jpeg|jpg|gif|png|webp)$/i.test(fileNameLower);
                        const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(fileNameLower);
                        const isPdf = /\.(pdf)$/i.test(fileNameLower);
                        
                        return (
                        <div key={doc.id} className="flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 hover:shadow-md transition-all duration-300 overflow-hidden group">
                          
                          {/* Preview Area (Top) */}
                          <div 
                            className="bg-slate-100 w-full h-32 flex items-center justify-center overflow-hidden relative group-hover:bg-slate-200 transition-colors"
                          >
                            {isImage && doc.view_url ? (
                              <img src={doc.view_url} alt={doc.file_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                            ) : isVideo && doc.view_url ? (
                              <video src={doc.view_url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" muted loop playsInline onMouseEnter={e => e.target.play()} onMouseLeave={e => e.target.pause()} />
                            ) : isImage ? (
                              <div className="w-full h-full flex items-center justify-center bg-blue-50/50">
                                <ImageIcon className="w-10 h-10 text-blue-200 group-hover:scale-110 transition-transform duration-500" />
                              </div>
                            ) : isVideo ? (
                              <div className="w-full h-full flex items-center justify-center bg-purple-50/50">
                                <Video className="w-10 h-10 text-purple-200 group-hover:scale-110 transition-transform duration-500" />
                              </div>
                            ) : isPdf ? (
                              <div className="w-full h-full flex items-center justify-center bg-red-50/50 relative">
                                {doc.view_url && (
                                  <iframe src={`${doc.view_url}#toolbar=0&navpanes=0&scrollbar=0`} className="absolute inset-0 w-full h-full pointer-events-none opacity-50 mix-blend-multiply" />
                                )}
                                <FileText className="w-10 h-10 text-red-200 group-hover:scale-110 transition-transform duration-500 relative z-10" />
                              </div>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-slate-50/50">
                                <File className="w-10 h-10 text-slate-200 group-hover:scale-110 transition-transform duration-500" />
                              </div>
                            )}

                            {/* View Action Overlay */}
                            {doc.view_url && (
                              <a 
                                href={doc.view_url} 
                                target="_blank" 
                                rel="noreferrer"
                                className="absolute inset-0 z-20 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-all cursor-pointer"
                              >
                                <span className="opacity-0 group-hover:opacity-100 text-white text-[10px] font-bold px-3 py-1.5 rounded-full backdrop-blur-md bg-black/60 transition-all flex items-center gap-1.5 translate-y-2 group-hover:translate-y-0 shadow-lg border border-white/10">
                                  <Eye className="w-3.5 h-3.5" /> View Full
                                </span>
                              </a>
                            )}
                          </div>

                          {/* Details Area (Bottom) */}
                          <div className="flex items-center justify-between p-3 bg-white border-t border-slate-100 z-20">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-slate-900 truncate" title={doc.file_name}>{doc.file_name}</p>
                              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mt-0.5">
                                {(doc.file_size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownload(doc)}
                              className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full shrink-0 ml-2"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )})}
                    </div>
                  ) : (
                    !isReviewer && (
                      <div className="text-center py-8 text-slate-500 text-sm font-medium border border-slate-200 rounded-xl bg-slate-50 border-dashed">
                        No documents have been uploaded for this case yet.
                      </div>
                    )
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* Notes Section */}
              <AccordionItem value="notes" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden px-1 data-[state=open]:pb-2">
                <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-slate-50/50 rounded-t-2xl transition-colors [&[data-state=open]_.metadata]:hidden">
                  <div className="flex flex-1 items-center justify-between pr-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-purple-500" />
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Case Notes</span>
                    </div>
                    <div className="metadata flex items-center gap-2 opacity-90">
                      {takedown.notes && takedown.notes.length > 0 ? (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> {takedown.notes.length} Note{takedown.notes.length !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-100">
                          Empty
                        </span>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-5 pt-2 pb-4 space-y-4">
                  {/* Notes Read-Only View */}
                  {takedown.notes && takedown.notes.length > 0 ? (
                    <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                      {takedown.notes.map((noteStr, idx) => {
                        let dateStr = "Unknown Date";
                        let htmlContent = noteStr;
                        const match = typeof noteStr === 'string' ? noteStr.match(/^\[(.*?)\]\s*(.*)$/s) : null;
                        if (match) {
                          dateStr = match[1];
                          htmlContent = match[2];
                        }
                        
                        return (
                          <div key={idx} className=" from-amber-50/80 to-amber-50/30 rounded-xl p-5 border border-amber-200/60 bg-amber-50 relative overflow-hidden group transition-all">
                            {/* <div className="absolute top-0 left-0 w-1 h-full bg-amber-400 rounded-l-xl opacity-50 group-hover:opacity-100 transition-opacity" /> */}
                            <div className="flex items-center justify-between mb-3 border-b border-amber-200/50 pb-2">
                              <div className="text-[10px] font-bold text-amber-700/80 uppercase tracking-widest flex items-center gap-1.5">
                                <Clock className="w-3 h-3" /> {dateStr}
                              </div>
                            </div>
                            <div 
                              className="prose prose-sm prose-amber max-w-none text-slate-700 font-medium leading-relaxed
                                [&_p]:m-0 [&_ul]:my-1 [&_ul]:pl-5 [&_li]:m-0 [&_a]:text-blue-600 [&_a]:underline"
                              dangerouslySetInnerHTML={{ __html: htmlContent }} 
                            />
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-sm font-medium text-slate-400 italic text-center">
                      No notes added yet.
                    </div>
                  )}

                  {isReviewer && (
                    <div className="space-y-3 pt-2">
                      <Label className="text-[10px] uppercase text-slate-400 font-bold tracking-widest">Add New Note</Label>
                      <Tiptap content={newNote} onChange={setNewNote} editable={true} />
                      <div className="flex justify-end">
                        <Button
                          onClick={handleAddNote}
                          disabled={updating || !newNote}
                          className="bg-slate-900 hover:bg-slate-800 text-white shadow-sm"
                        >
                          Add Note <MessageSquare className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* Audit Log / Case History */}
              <AccordionItem value="history" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden px-1 data-[state=open]:pb-2">
                <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-slate-50/50 rounded-t-2xl transition-colors [&[data-state=open]_.metadata]:hidden">
                  <div className="flex flex-1 items-center justify-between pr-4">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-slate-500" />
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Case History</span>
                    </div>
                    <div className="metadata flex items-center gap-2 opacity-90">
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                        {history.length + 1} Event{history.length + 1 !== 1 && 's'}
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-5 pt-2 pb-4">
                  <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                    <div className="space-y-6 relative ml-2 before:absolute before:left-[11px] before:top-2 before:bottom-0 before:w-[2px] before:bg-slate-200">
                      {history.map((event, idx) => (
                        <div key={event.id} className="relative pl-8 group">
                          <div className={cn(
                            "absolute left-0 top-1 w-6 h-6 rounded-full border-[3px] border-slate-50 flex items-center justify-center text-[10px] shadow-sm z-10 transition-transform group-hover:scale-110",
                            event.action === 'update' ? 'bg-blue-100 text-blue-600' :
                              event.action === 'note_added' ? 'bg-amber-100 text-amber-600' :
                                'bg-slate-200 text-slate-500'
                          )}>
                            {event.action === 'update' ? <CheckCircle className="w-3 h-3" /> :
                              event.action === 'note_added' ? <MessageSquare className="w-3 h-3" /> :
                                <Clock className="w-3 h-3" />}
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold text-slate-900 capitalize">
                                {event.action.replace('_', ' ')}
                              </p>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight whitespace-nowrap">
                                <SafeDate date={event.created_at} formatStr="dd/MM/yyyy HH:mm" />
                              </span>
                            </div>
                            <p className="text-sm font-medium text-slate-600 leading-snug">
                              {event.action === 'note_added' ? 'A new note was added to the case.' : event.details}
                            </p>
                          </div>
                        </div>
                      ))}

                      {/* Initial Event */}
                      <div className="relative pl-8 group">
                        <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 border-[3px] border-slate-50 flex items-center justify-center shadow-sm z-10 transition-transform group-hover:scale-110">
                          <CheckCircle className="w-3 h-3" />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-slate-900">Case Created</p>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight whitespace-nowrap">
                              <SafeDate date={takedown.created_at} formatStr="dd/MM/yyyy HH:mm" />
                            </span>
                          </div>
                          <p className="text-sm font-medium text-slate-600 leading-snug">Takedown initiated.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Raw JSON Section - REVIEWER ONLY */}
              {isReviewer && (
                <AccordionItem value="raw-json" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden px-1 data-[state=open]:pb-2">
                  <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-slate-50/50 rounded-t-2xl transition-colors">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Raw Data (Internal)</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pt-2 pb-4">
                    <div className="bg-slate-950 text-slate-300 p-4 rounded-xl overflow-x-auto shadow-inner">
                      <pre className="text-[10px] font-mono leading-relaxed">
                        {JSON.stringify(post, null, 2)}
                      </pre>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          </div>
        </div>

        {/* RIGHT: Source Content (Scrollable) */}
        <div className="flex-none lg:flex-1 lg:overflow-y-auto space-y-4 bg-slate-50/50">
          <div className="flex flex-col gap-6 sm:gap-8 px-4 sm:px-8 pb-8 pt-4 sm:pt-6">

            {/* Media Display */}
            <div className="bg-slate-900 rounded-xl sm:rounded-2xl overflow-hidden shadow-lg border border-slate-800 relative group flex items-center justify-center min-h-[300px] sm:min-h-[400px]">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800/50 to-slate-950 pointer-events-none" />
              {post?.signedImageUrl ? (
                <img
                  src={post.signedImageUrl}
                  alt="Evidence"
                  className="max-w-full h-auto max-h-[400px] sm:max-h-[600px] object-contain relative z-10"
                />
              ) : (
                <div className="text-center p-8 sm:p-12 relative z-10">
                  <Quote className="w-12 h-12 sm:w-16 sm:h-16 text-slate-700 mx-auto mb-3 sm:mb-4" />
                  <p className="text-slate-500 font-medium text-base sm:text-lg">Text-Only Content</p>
                </div>
              )}
            </div>

            {/* Unified User Context & Caption Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 sm:p-5 flex items-start sm:items-center gap-3 sm:gap-5">
                <div className="relative shrink-0 mt-1 sm:mt-0">
                  {(post?.user?.profile_pic_url && !imgError) ? (
                    <img
                      src={post.user.profile_pic_url}
                      onError={() => setImgError(true)}
                      alt=""
                      className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover border-2 sm:border-4 border-slate-50"
                    />
                  ) : (
                    <div className="scale-75 sm:scale-100 origin-top-left sm:origin-center">
                      <ProfilePic user={post?.user?.username || 'Unknown'} size={64} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate flex items-center gap-1.5 sm:gap-2">
                    <div className="">
                      <div className="flex-1 min-w-4">
                        {
                          post?.platform === "x" || post?.platform === "twitter" ? (
                            <span className="inline-block size-4 text-black">
                              <Twitter className="w-3.5 h-3.5 text-slate-900" />
                            </span>
                          ) : post?.platform === "reddit" ? (
                            <span className="inline-block size-4 text-black">
                              <Reddit className="w-3.5 h-3.5 text-slate-900" />
                            </span>
                          ) : post?.platform?.toLowerCase() === "instagram" ? (
                            <Instagram className="w-6 h-6 text-pink-500" />
                          ) : post?.platform?.toLowerCase() === "facebook" ? (
                            <Facebook className="w-6 h-6 text-blue-500" />
                          ) : post?.platform?.toLowerCase() === "youtube" ? (
                            <Youtube className="w-6 h-6 text-red-500" />
                          ) : (
                            <p className="text-slate-500 font-medium truncate">{post?.platform}</p>
                          )
                        }
                      </div>
                    </div>
                    {post?.user?.username || 'Unknown User'}
                    {post?.user?.is_verified && <BadgeCheck className="w-5 h-5 text-blue-500 fill-blue-50" />}
                  </h3>
                  <p className="text-slate-500 font-medium truncate">{post?.user?.full_name}</p>
                </div>
                <a
                  href={post?.url || post?.original_url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span className="hidden sm:inline">View Source</span>
                </a>
              </div>

              <div className="px-5 pb-5 pt-0">
                <div className="bg-slate-50/50 rounded-lg p-4 border border-slate-100">
                  <h4 className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    <MessageCircle className="w-3 h-3" />  {post?.platform?.toLowerCase() === "website" ? "Post Content" : "Post Caption"}
                  </h4>
                  <div className="text-slate-800 leading-relaxed whitespace-pre-wrap font-medium text-sm font-sans">
                    {post?.caption || post?.content || post?.post_content?.caption || <span className="italic text-slate-400">No caption content available.</span>}
                  </div>
                </div>
              </div>
            </div>

            {post?.platform?.toLowerCase() !== "website" && (
              <>
                {/* Stats & Dates */}
                <div className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-2 sm:flex sm:flex-row gap-3 sm:gap-4">
                    <div className="w-full bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm flex flex-row justify-between items-center gap-1">
                      <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 sm:gap-2"><Heart className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-500" /> Likes</span>
                      <span className="font-bold text-sm sm:text-lg text-slate-900">{post?.stats?.like_count?.toLocaleString() || 0}</span>
                    </div>
                    <div className="w-full bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm flex flex-row justify-between items-center gap-1">
                      <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 sm:gap-2"><MessageCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-500" /> Comments</span>
                      <span className="font-bold text-sm sm:text-lg text-slate-900">{post?.stats?.comment_count?.toLocaleString() || 0}</span>
                    </div>
                    <div className="w-full bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm flex flex-row justify-between items-center gap-1">
                      <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 sm:gap-2"><Share2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-500" /> Shares</span>
                      <span className="font-bold text-sm sm:text-lg text-slate-900">{post?.stats?.share_count?.toLocaleString() || 0}</span>
                    </div>
                    {post?.stats?.view_count > 0 && (
                      <div className="w-full bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm flex flex-row justify-between items-center gap-1">
                        <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 sm:gap-2"><Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-violet-600" /> Views</span>
                        <span className="font-bold text-sm sm:text-lg text-slate-900">{post?.stats?.view_count?.toLocaleString() || 0}</span>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-10">
                    <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-1">
                      <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 sm:gap-2"><Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500" /> Publish Date</span>
                      <span className="font-bold text-xs sm:text-sm text-slate-900">{posted_date}</span>
                    </div>
                    <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-1">
                      <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 sm:gap-2"><History className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500" /> Alert Date</span>
                      <span className="font-bold text-xs sm:text-sm text-slate-900">{sourced_date}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
