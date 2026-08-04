'use client'

import { useState, useEffect, useRef } from 'react'
import { getTakedownDetails, updateTakedown, addTakedownNote, initTakedownDocumentUpload, confirmTakedownDocumentUpload, getTakedownDocuments, getDocumentDownloadUrl } from '../../actions'
import { uploadFileViaPresignedUrl } from '@/utils/aws/upload-via-presigned-url'
import { validateTakedownDocumentMeta, TAKEDOWN_DOC_MAX_BYTES, formatUploadSizeLimit } from '@/utils/aws/upload-validation'
import { updatePostVisibility } from '@/app/(dashboard)/review-cases/actions'
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
import { CaseExportButton } from '@/components/pdf/CaseExportButton'
import { CaseExportDocxButton } from '@/components/docx/CaseExportDocxButton'
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
import { cn, omitSafeThreatTypes } from "@/lib/utils"

// Helper for Visual Stages
function StageProgress({ status, onUpdate, updating, readOnly }) {
  const getStepIndex = (s) => {
    if (['takedown_successful', 'takedown_failed'].includes(s)) return 2
    if (['under_review', 're_appeal_takedown'].includes(s)) return 1
    return 0 // initiated
  }

  const currentIndex = getStepIndex(status)
  const isReAppeal = status === 're_appeal_takedown'

  const Diagram = () => (
    <div className="flex items-center justify-center w-full px-2 py-4 overflow-x-auto">
      <div className="flex items-center min-w-max">
        
        {/* 1. Initiated */}
        <div className="flex flex-col items-center gap-2">
          <div className={cn("w-10 h-10 rounded-full flex items-center justify-center border-2 z-10 transition-all", 
             currentIndex === 0 ? "bg-blue-600 border-blue-600 text-white shadow-lg scale-110" : "bg-blue-100 border-blue-600 text-blue-600")}>
             <Shield className="w-5 h-5" />
          </div>
          <span className={cn("text-[10px] sm:text-xs font-bold uppercase", currentIndex === 0 ? "text-blue-600" : "text-slate-900")}>Initiated</span>
        </div>

        {/* Line 1 */}
        <div className={cn("h-1 w-10 sm:w-16 transition-colors duration-500", currentIndex > 0 ? "bg-blue-600" : "bg-gray-200")} />

        {/* 2. Under Review / Re-Appealing */}
        <div className="flex flex-col items-center gap-2">
          <div className={cn("w-10 h-10 rounded-full flex items-center justify-center border-2 z-10 transition-all", 
             currentIndex === 1 ? (isReAppeal ? "bg-orange-500 border-orange-500 text-white shadow-lg scale-110" : "bg-blue-600 border-blue-600 text-white shadow-lg scale-110") : 
             currentIndex > 1 ? "bg-blue-100 border-blue-600 text-blue-600" : "bg-white border-gray-200 text-gray-300")}>
             {currentIndex > 1 ? <Check className="w-5 h-5" /> : (isReAppeal ? <History className="w-5 h-5" /> : <Eye className="w-5 h-5" />)}
          </div>
          <span className={cn("text-[10px] sm:text-xs font-bold uppercase", 
            currentIndex === 1 ? (isReAppeal ? "text-orange-600" : "text-blue-600") : 
            currentIndex > 1 ? "text-slate-900" : "text-gray-400"
          )}>
            {isReAppeal ? 'Re-Appealing' : 'Under Review'}
          </span>
        </div>

        {/* Branches */}
        <div className="relative w-12 sm:w-16 h-32 mx-0 sm:mx-2">
           {/* Horizontal entry line */}
           <div className={cn("absolute left-0 top-1/2 -translate-y-1/2 w-6 h-1 transition-colors duration-500", currentIndex > 1 ? "bg-blue-600" : "bg-gray-200")} />
           
           {/* Top branch for Success */}
           <div className={cn("absolute left-6 top-5 bottom-1/2 border-l-[4px] border-t-[4px] rounded-tl-xl w-[calc(100%-24px)] transition-colors duration-500", 
               status === 'takedown_successful' ? "border-green-500" : "border-gray-200")} />
               
           {/* Bottom branch for Failed */}
           <div className={cn("absolute left-6 top-1/2 bottom-5 border-l-[4px] border-b-[4px] rounded-bl-xl w-[calc(100%-24px)] transition-colors duration-500", 
               status === 'takedown_failed' ? "border-red-500" : "border-gray-200")} />
        </div>

        {/* 3. Terminal States */}
        <div className="flex flex-col justify-between h-32 py-0 pl-1 sm:pl-2">
           {/* Success Node */}
           <div className="flex items-center gap-2 sm:gap-3">
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center border-2 z-10 transition-all duration-500", 
                 status === 'takedown_successful' ? "bg-green-500 border-green-500 text-white shadow-lg scale-110" : "bg-white border-gray-200 text-gray-300")}>
                 <CheckCircle className="w-5 h-5" />
              </div>
              <span className={cn("text-[10px] sm:text-xs font-bold uppercase", status === 'takedown_successful' ? "text-green-600" : "text-gray-400")}>Successful</span>
           </div>
           
           {/* Failed Node */}
           <div className="flex items-center gap-2 sm:gap-3">
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center border-2 z-10 transition-all duration-500", 
                 status === 'takedown_failed' ? "bg-red-500 border-red-500 text-white shadow-lg scale-110" : "bg-white border-gray-200 text-gray-300")}>
                 <XCircle className="w-5 h-5" />
              </div>
              <span className={cn("text-[10px] sm:text-xs font-bold uppercase", status === 'takedown_failed' ? "text-red-600" : "text-gray-400")}>Failed</span>
           </div>
        </div>

      </div>
    </div>
  )

  // Read-Only / Client View - Clean Timeline
  if (readOnly) {
    return (
      <div className="space-y-4">
        <Diagram />
        <div className="bg-slate-50 rounded-lg p-4 border text-center mt-2">
          <p className="text-sm text-slate-600 font-medium">
            Current Status: <span className="text-blue-700 font-bold uppercase">{status?.replace(/_/g, ' ')}</span>
          </p>
        </div>
      </div>
    )
  }

  // Reviewer Interactive View
  return (
    <div className="space-y-5">
      <Diagram />

      {/* Action Area */}
      <div className="bg-gray-50/50 rounded-xl border border-gray-100 p-4 sm:p-5 flex flex-col items-center justify-center space-y-3">

        {/* Stage 1: Initiated -> Under Review */}
        {currentIndex === 0 && (
          <div className="text-center space-y-3">
            <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium">
              Case has been initiated and is ready for review.
            </div>
            <Button
              onClick={() => onUpdate('under_review')}
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
              {status === 're_appeal_takedown' ? 'Case is being re-appealed. Select an outcome below.' : 'Case is currently under investigation. Select an outcome below.'}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg mx-auto">
              <button
                onClick={() => onUpdate('takedown_successful')}
                disabled={updating}
                className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-transparent bg-green-50 text-green-700 hover:border-green-200 hover:bg-green-100 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-green-200 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <span className="font-bold">Takedown Successful</span>
              </button>

              <button
                onClick={() => onUpdate('takedown_failed')}
                disabled={updating}
                className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-transparent bg-red-50 text-red-700 hover:border-red-200 hover:bg-red-100 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-red-200 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <XCircle className="w-6 h-6" />
                </div>
                <span className="font-bold">Takedown Failed</span>
              </button>
            </div>

            <div className="flex justify-center pt-2">
              <Button variant="ghost" size="sm" onClick={() => onUpdate('initiated')} disabled={updating} className="text-gray-400 hover:text-gray-600">
                <ChevronLeft className="w-4 h-4 mr-1" /> Back to Initiated
              </Button>
            </div>
          </div>
        )}

        {/* Stage 3: Resolution (Terminal State) */}
        {currentIndex === 2 && (
          <div className="text-center space-y-4 w-full">
            <div className={cn(
              "p-6 rounded-xl border-2 flex flex-col items-center animate-in zoom-in duration-300",
              status === 'takedown_successful' ? "bg-green-50 border-green-100 text-green-800" :
                "bg-red-50 border-red-100 text-red-800"
            )}>
              {status === 'takedown_successful' && <CheckCircle className="w-12 h-12 mb-3 text-green-600" />}
              {status === 'takedown_failed' && <XCircle className="w-12 h-12 mb-3 text-red-600" />}

              <h3 className="text-xl font-bold uppercase tracking-wide mb-1">
                Case {status?.replace(/_/g, ' ')}
              </h3>
              <p className="opacity-80 text-sm">
                This case has been resolved. You can reopen it if necessary.
              </p>
            </div>

            {status === 'takedown_failed' ? (
              <Button variant="outline" onClick={() => onUpdate('re_appeal_takedown')} disabled={updating} className="text-gray-500 hover:text-gray-900 border-gray-300">
                <History className="w-4 h-4 mr-2" /> Re-appeal Takedown
              </Button>
            ) : (
              <Button variant="outline" onClick={() => onUpdate('under_review')} disabled={updating} className="text-gray-500 hover:text-gray-900 border-gray-300">
                <History className="w-4 h-4 mr-2" /> Reopen for Review
              </Button>
            )}
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

  useEffect(() => {
    setData(initialData)
    setDocuments(initialDocuments)
    if (initialData?.takedown) {
      setStatus(initialData.takedown.status)
    }
  }, [initialData, initialDocuments])

  const handleUpload = async (e) => {
    if (!isReviewer) return

    const file = e.target.files?.[0]
    if (!file) return

    const validationError = validateTakedownDocumentMeta({
      contentType: file.type,
      fileSize: file.size,
    })
    if (validationError) {
      alert(validationError)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploading(true)
    try {
    const initResult = await initTakedownDocumentUpload(takedownId, {
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
    })

    if (!initResult.success) {
      alert('Upload failed: ' + initResult.error)
      return
    }

    await uploadFileViaPresignedUrl(file, initResult.uploadUrl)

    const result = await confirmTakedownDocumentUpload(takedownId, {
      s3Key: initResult.s3Key,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    })

    if (result.success) {
      const docs = await getTakedownDocuments(takedownId)
      setDocuments(docs)
      const details = await getTakedownDetails(takedownId)
      setData(prev => ({ ...prev, history: details.history }))
    } else {
      alert('Upload failed: ' + result.error)
    }
    } catch {
      alert('Upload failed. Please try again.')
    } finally {
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    }
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

    // Handle post visibility synchronization based on takedown success
    const currentVisibility = data?.post?.visibility_status || 'online';
    let newVisibility = currentVisibility;

    if (statusToUpdate === 'takedown_successful' && currentVisibility !== 'down') {
      newVisibility = 'down';
    } else if (statusToUpdate !== 'takedown_successful' && currentVisibility === 'down') {
      newVisibility = 'online';
    }

    if (newVisibility !== currentVisibility && data?.post) {
      const postId = data.post._id || data.post.id;
      const visibilityResult = await updatePostVisibility(postId, project, clientDetails, newVisibility);
      if (!visibilityResult.success) {
        alert('Failed to update post visibility: ' + visibilityResult.error);
      }
    }

    await updateTakedown(takedownId, {
      status: statusToUpdate
    }, `Status updated to: ${statusToUpdate.replace(/_/g, ' ')}`)

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
  let alert_date = ""

  if (post?.posted_date)
    posted_date = format(new Date(post.posted_date), "dd/MM/yyyy");
  else if (post?.timestamp)
    posted_date = format(new Date(post.timestamp), "dd/MM/yyyy");
  else if (post?.sourcing_date)
    posted_date = format(new Date(post.sourcing_date), "dd/MM/yyyy");

  if (post?.reviewed_at)
    alert_date = format(new Date(post.reviewed_at), "dd/MM/yyyy");
  else if (post?.review_details?.reviewed_at)
    alert_date = format(new Date(post.review_details.reviewed_at), "dd/MM/yyyy");

  const getStatusColorClass = (s) => {
    switch (s) {
      case 'takedown_successful': return 'bg-green-100 text-green-800 hover:bg-green-100'
      case 'takedown_failed': return 'bg-red-100 text-red-800 hover:bg-red-100'
      case 'under_review': return 'bg-blue-100 text-blue-800 hover:bg-blue-100'
      case 're_appeal_takedown': return 'bg-orange-100 text-orange-800 hover:bg-orange-100'
      case 'initiated': return 'bg-slate-100 text-slate-800 hover:bg-slate-100'
      default: return 'bg-gray-100 text-gray-800 hover:bg-gray-100'
    }
  }

  // --- Data Resolution for UI ---
  const riskScore = review.threat_score ?? analysis.risk_score ?? 0;
  const displayThreatTypes = omitSafeThreatTypes(review.threat_types)
  let category =
    displayThreatTypes.length > 0
      ? displayThreatTypes.join(', ').replace(/_/g, ' ')
      : [review.primary_threat_type, review.threat_type, analysis.category].find(
          (c) => c != null && c !== '' && String(c).toLowerCase() !== 'safe'
        ) || 'Unknown'
  const reasoning = review.reasoning || analysis.categorization_reason || 'No detailed reasoning provided.';
  const simpleReportDescription = review.simple_report_description || analysis.simple_report_description || null;
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
                  {takedown.status?.replace(/_/g, ' ')}
                </Badge>
              </h1>
              <p className="text-[10px] sm:text-xs font-mono text-slate-400 truncate">Case ID: {post?._id?.toString() || takedown.id || 'Unknown'}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CaseExportButton post={post} project={project} />
          <CaseExportDocxButton post={post} project={project} />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row lg:divide-x divide-slate-100">


        {/* LEFT PANEL: Takedown Management & Information */}
        <div className="relative w-full lg:w-[700px] xl:w-[750px] bg-slate-50 lg:bg-white flex flex-col lg:h-full shrink-0 border-t lg:border-t-0 border-slate-100">
          <div className="flex-none lg:flex-1 lg:overflow-y-auto p-4 sm:p-5 space-y-4 sm:space-y-5">
            
            {/* Takedown Status Management (Always visible) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-3 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Status Management</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={cn("uppercase text-[10px] px-1.5 py-0 h-5 border-0 shadow-sm", getStatusColorClass(status))}>
                    {status?.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
              <div className="p-4 sm:p-5 bg-white">
                {/* <div className="bg-slate-50/50 rounded-xl border border-slate-100 p-4 sm:p-5"> */}
                  <StageProgress
                    status={status}
                    onUpdate={updateStatusDirectly}
                    updating={updating}
                    readOnly={!isReviewer}
                  />
                {/* </div> */}
              </div>
            </div>

            {/* Main Interactive Accordion Group */}
            <Accordion type="multiple" defaultValue={["intelligence"]} className="w-full space-y-3 sm:space-y-4">

              {/* Review Analysis */}
              <AccordionItem value="intelligence" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden px-1 data-[state=open]:pb-2">
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50/50 rounded-t-2xl transition-colors [&[data-state=open]_.metadata]:hidden">
                  <div className="flex flex-1 items-center justify-between pr-4">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-orange-500" />
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Review Analysis</span>
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
                <AccordionContent className="px-4 pt-2 pb-3 space-y-4 sm:space-y-5">
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
                      <div className="flex flex-col gap-3">
                        {legalCodes.map((item, idx) => {
                          const code = typeof item === 'string' ? item : item.code;
                          const reasoning = typeof item === 'string' ? '' : item.reasoning;
                          const projectCode = project?.project_details?.legal_codes?.find(pc => pc.name === code);
                          return (
                            <div key={idx} className="flex flex-col gap-2">
                              <div className="w-fit">
                                <ViolationCard
                                  active={true}
                                  title={code}
                                  icon={Scale}
                                  color="purple"
                                  referenceLink={projectCode?.referenceLink}
                                />
                              </div>
                              {reasoning && (
                                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 text-sm text-purple-900 leading-relaxed">
                                  <span className="font-bold mr-2">Reasoning:</span>
                                  {reasoning}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Timeline / Dates */}
                  <div className="space-y-3">
                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" /> Timeline
                    </h5>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Published</p>
                          <p className="text-sm font-bold text-slate-700">{posted_date || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                          <History className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Alerted</p>
                          <p className="text-sm font-bold text-slate-700">{alert_date || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                          <Shield className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Takedown Initiated</p>
                          <p className="text-sm font-bold text-slate-700">{post?.takedown_info?.takedown_start_date ? format(new Date(post.takedown_info.takedown_start_date), "dd/MM/yyyy HH:mm") : 'N/A'}</p>
                        </div>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                          <CheckCircle className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Takedown Completed</p>
                          <p className="text-sm font-bold text-slate-700">{post?.takedown_info?.takedown_end_date ? format(new Date(post.takedown_info.takedown_end_date), "dd/MM/yyyy HH:mm") : 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {simpleReportDescription && (
                    <div className="space-y-3">
                      <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <FileText className="w-3 h-3" /> Simple Reasoning
                      </h5>
                      <div className="bg-emerald-50/50 p-5 rounded-xl border border-emerald-100 text-slate-600 leading-relaxed text-sm font-medium whitespace-pre-wrap">
                        {simpleReportDescription}
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
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50/50 rounded-t-2xl transition-colors [&[data-state=open]_.metadata]:hidden">
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
                <AccordionContent className="px-4 pt-2 pb-3 space-y-3 sm:space-y-4">
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
                        <p className="text-xs font-medium text-slate-400">PDF, PNG, JPG — up to {formatUploadSizeLimit(TAKEDOWN_DOC_MAX_BYTES)}</p>
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
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50/50 rounded-t-2xl transition-colors [&[data-state=open]_.metadata]:hidden">
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
                <AccordionContent className="px-4 pt-2 pb-3 space-y-3 sm:space-y-4">
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
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50/50 rounded-t-2xl transition-colors [&[data-state=open]_.metadata]:hidden">
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
                <AccordionContent className="px-4 pt-2 pb-3">
                  <div className="bg-slate-50/50 p-4 sm:p-5 rounded-xl border border-slate-100">
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
                  <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50/50 rounded-t-2xl transition-colors">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Raw Data (Internal)</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pt-2 pb-3">
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
          <div className="flex flex-col gap-0 px-4 sm:px-6 pb-6 pt-4 sm:pt-5 max-w-2xl mx-auto">
            {/* Mock Social Media Post Container */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              
              {/* Pre-metadata: Dates */}
              {post?.platform?.toLowerCase() !== "website" && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Published: {posted_date}</div>
                  <div className="flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Alerted: {alert_date}</div>
                </div>
              )}

              {/* Profile and Details */}
              <div className="p-2 sm:p-5 flex items-start sm:items-center justify-between gap-3 sm:gap-5">
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0 mt-1 sm:mt-0">
                    {(post?.user?.profile_pic_url && !imgError) ? (
                      <img
                        src={post.user.profile_pic_url}
                        onError={() => setImgError(true)}
                        alt=""
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-slate-50 shadow-sm"
                      />
                    ) : (
                      <div className="scale-75 sm:scale-100 origin-top-left sm:origin-center">
                        <ProfilePic user={post?.user?.username || 'Unknown'} size={48} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate flex items-center gap-1.5 sm:gap-2">
                      <div className="shrink-0">
                          {
                            post?.platform === "x" || post?.platform === "twitter" ? (
                              <span className="inline-block size-4 text-black">
                                <Twitter className="w-3.5 h-3.5 text-slate-900" />
                              </span>
                            ) : post?.platform === "reddit" ? (
                              <span className="inline-block size-4 text-black">
                                <Reddit className="w-3.5 h-3.5" />
                              </span>
                            ) : post?.platform?.toLowerCase() === "instagram" ? (
                              <Instagram className="w-5 h-5 text-pink-500" />
                            ) : post?.platform?.toLowerCase() === "facebook" ? (
                              <Facebook className="w-5 h-5 text-blue-500" />
                            ) : post?.platform?.toLowerCase() === "youtube" ? (
                              <Youtube className="w-5 h-5 text-red-500" />
                            ) : (
                              <p className="text-slate-500 font-medium truncate text-xs uppercase">{post?.platform}</p>
                            )
                          }
                      </div>
                      {post?.user?.username || 'Unknown User'}
                      {post?.user?.is_verified && <BadgeCheck className="w-4 h-4 text-blue-500 fill-blue-50" />}
                      {post?.visibility_status === 'down' ? (
                          <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200">Taken Down</Badge>
                      ) : (post?.visibility_status === 'active' || post?.visibility_status === 'online') ? (
                          <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">Online</Badge>
                      ) : null}
                    </h3>
                    <p className="text-slate-500 text-xs sm:text-sm font-medium truncate">{post?.user?.full_name}</p>
                  </div>
                </div>
                
                <a
                  href={post?.url || post?.original_url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs sm:text-sm font-bold transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">View Source</span>
                </a>
              </div>

              {/* Content Image */}
              <div className="bg-slate-950 border-y border-slate-100 relative group flex items-center justify-center min-h-75 sm:min-h-100">
                {post?.signedImageUrl ? (
                  <img
                    src={post.signedImageUrl}
                    alt="Evidence"
                    className="w-full h-auto max-h-125 sm:max-h-175 object-contain relative z-10"
                  />
                ) : (
                  <div className="text-center p-8 sm:p-12 relative z-10">
                    <Quote className="w-12 h-12 sm:w-16 sm:h-16 text-slate-700 mx-auto mb-3 sm:mb-4" />
                    <p className="text-slate-500 font-medium text-base sm:text-lg">Text-Only Content</p>
                  </div>
                )}
              </div>

              {/* Stats (Likes, Comments, Shares, Views) */}
              {post?.platform?.toLowerCase() !== "website" && (
                <div className=" px-4 py-3 sm:py-4 border-b border-slate-200 flex items-center justify-between flex-wrap bg-white">
                  <div className="flex items-center gap-1.5 group cursor-default">
                    <span className=' text-xs font-extrabold text-slate-400 tracking-wide' >likes</span>
                    <Heart className="w-5 h-5 text-slate-400 transition-colors" />
                    <span className="font-bold text-sm text-slate-700">{post?.stats?.like_count?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5 group cursor-default">
                    <span className=' text-xs font-extrabold text-slate-400 tracking-wide' >comments</span>
                    <MessageCircle className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                    <span className="font-bold text-sm text-slate-700">{post?.stats?.comment_count?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5 group cursor-default">
                    <span className=' text-xs font-extrabold text-slate-400 tracking-wide' >shares</span>
                    <Share2 className="w-5 h-5 text-slate-400 transition-colors" />
                    <span className="font-bold text-sm text-slate-700">{post?.stats?.share_count?.toLocaleString() || 0}</span>
                  </div>
                    <div className="flex items-center gap-1.5 group cursor-default">
                      <span className=' text-xs font-extrabold text-slate-400 tracking-wide' >views</span>
                      <Eye className="w-5 h-5 text-slate-400 group-hover:text-violet-500 transition-colors" />
                      <span className="font-bold text-sm text-slate-700">{post?.stats?.view_count?.toLocaleString() || 0}</span>
                    </div>
                  {/* {post?.stats?.view_count > 0 && ( */}
                  {/* )} */}
                </div>
              )}

              {/* Caption */}
              <div className="px-4 pb-5 pt-3 sm:px-5 sm:pb-6 bg-white">
                <div className="text-slate-800 leading-relaxed whitespace-pre-wrap text-sm sm:text-base font-sans">
                  {post?.caption || post?.content || post?.post_content?.caption ? (
                    <span>
                      <span className="font-bold mr-2 text-slate-900">{post?.user?.username || 'User'}</span>
                      {post?.caption || post?.content || post?.post_content?.caption}
                    </span>
                  ) : (
                    <span className="italic text-slate-400">No caption content available.</span>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
