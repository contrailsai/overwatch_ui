'use client'

import * as React from 'react'
import { useState, useEffect, useActionState, useRef } from 'react'
import { format } from 'date-fns'
import {
  submitAdReview,
  updateAdContent,
  initAdImageUpload,
  confirmAdImageUpload,
  deleteAdImage,
  updateAdVisibility,
  deleteAd,
} from './actions'
import { uploadFileViaPresignedUrl } from '@/utils/aws/upload-via-presigned-url'
import { REVIEW_IMAGE_MAX_BYTES, formatUploadSizeLimit } from '@/utils/aws/upload-validation'
import { buildReviewFormDefaults } from '@/utils/analysis/correctionRequestUtils'
import {
  Loader2, X, CheckCircle, ExternalLink, ChevronLeft, ChevronRight,
  Plus, Trash2, Upload, Pencil, Save, Eye, EyeOff, Megaphone,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { getRiskLabel } from '@/app/(dashboard)/cases/riskBuckets'

const initialState = { success: false, error: null }

const RISK_PRESETS = [
  { label: 'Safe', score: 20 },
  { label: 'Low', score: 55 },
  { label: 'Medium', score: 85 },
  { label: 'High', score: 98 },
]

function emptyCard() {
  return {
    title: '',
    body: '',
    caption: '',
    cta_text: '',
    cta_type: '',
    link_url: '',
    link_description: '',
    media: [],
  }
}

export default function ReviewAdForm({
  ad,
  project,
  clientDetails,
  onClose,
  onNavigate,
  hasPrev,
  hasNext,
  setAds,
  setSelectedAd,
}) {
  const { project_details } = project
  const projectLabels = project_details?.labels || []
  const projectLegalCodes = project_details?.legal_codes || []

  const defaults = buildReviewFormDefaults(ad, project_details)
  const submitBound = submitAdReview.bind(null, project, clientDetails)
  const [state, formAction, isPending] = useActionState(submitBound, initialState)

  const [localAd, setLocalAd] = useState(ad)
  const [showSuccess, setShowSuccess] = useState(false)
  const [activeCard, setActiveCard] = useState(0)
  const [editingContent, setEditingContent] = useState(false)
  const [contentDraft, setContentDraft] = useState(null)
  const [savingContent, setSavingContent] = useState(false)
  const [contentError, setContentError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const fileInputRef = useRef(null)

  // Verdict form state
  const [threatScore, setThreatScore] = useState(defaults.threatScore)
  const [threatTypes, setThreatTypes] = useState(defaults.threatTypes)
  const [selectedLegalCodes, setSelectedLegalCodes] = useState(defaults.selectedLegalCodes)
  const [isAIGC, setIsAIGC] = useState(defaults.isAIGC)
  const [facePresent, setFacePresent] = useState(defaults.facePresent)
  const [namePresent, setNamePresent] = useState(defaults.namePresent)
  const [poiNames, setPoiNames] = useState(defaults.poiNames)
  const [poiInput, setPoiInput] = useState('')
  const [reasoningText, setReasoningText] = useState(defaults.reasoningText)
  const [simpleReportText, setSimpleReportText] = useState(defaults.simpleReportText)
  const [reviewerComments, setReviewerComments] = useState(ad?.review_details?.reviewer_comments || '')
  const [visibilityOnline, setVisibilityOnline] = useState(
    String(ad?.workflow?.visibility_status || ad?.visibility_status || 'available').toLowerCase() !== 'down',
  )

  useEffect(() => {
    setLocalAd(ad)
    setActiveCard(0)
    setEditingContent(false)
    setContentDraft(null)
    const d = buildReviewFormDefaults(ad, project_details)
    setThreatScore(d.threatScore)
    setThreatTypes(d.threatTypes)
    setSelectedLegalCodes(d.selectedLegalCodes)
    setIsAIGC(d.isAIGC)
    setFacePresent(d.facePresent)
    setNamePresent(d.namePresent)
    setPoiNames(d.poiNames)
    setReasoningText(d.reasoningText)
    setSimpleReportText(d.simpleReportText)
    setReviewerComments(ad?.review_details?.reviewer_comments || '')
    setVisibilityOnline(
      String(ad?.workflow?.visibility_status || ad?.visibility_status || 'available').toLowerCase() !== 'down',
    )
  }, [ad, project_details])

  useEffect(() => {
    if (state?.success) {
      setShowSuccess(true)
      const updated = {
        ...localAd,
        review_details: state.updatedFields?.review_details,
        workflow: {
          ...(localAd.workflow || {}),
          review_status: 'reviewed',
        },
        list: {
          ...(localAd.list || {}),
          review_threat_score: state.updatedFields?.review_details?.threat_score,
          effective_threat_score: state.updatedFields?.review_details?.threat_score,
        },
        score: state.updatedFields?.review_details?.threat_score,
        content_reviewed_by: clientDetails?.email,
      }
      setLocalAd(updated)
      setSelectedAd?.(updated)
      setAds?.((prev) => prev.map((a) => (a._id === updated._id ? { ...a, ...updated } : a)))
      const t = setTimeout(() => setShowSuccess(false), 2000)
      return () => clearTimeout(t)
    }
  }, [state?.success]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const cards = localAd?.content?.cards?.length
    ? localAd.content.cards
    : [{ title: localAd?.content?.title, media: localAd?.content?.media || [] }]
  const currentCard = cards[Math.min(activeCard, cards.length - 1)] || cards[0]
  const previewUrl =
    currentCard?.media?.[0]?.signedUrl ||
    localAd?.signedImageUrl ||
    localAd?.content?.media?.[0]?.signedUrl

  const risk = getRiskLabel(threatScore)

  const startEditContent = () => {
    setContentDraft({
      title: localAd?.content?.title || '',
      body: localAd?.content?.body || '',
      caption: localAd?.content?.caption || '',
      cta_text: localAd?.content?.cta_text || '',
      cta_type: localAd?.content?.cta_type || '',
      display_format: localAd?.content?.display_format || localAd?.list?.display_format || '',
      link_url: localAd?.content?.link_url || '',
      link_description: localAd?.content?.link_description || '',
      language: localAd?.content?.language || '',
      cards: (localAd?.content?.cards || []).map((c) => ({
        title: c.title || '',
        body: c.body || '',
        caption: c.caption || '',
        cta_text: c.cta_text || '',
        cta_type: c.cta_type || '',
        link_url: c.link_url || '',
        link_description: c.link_description || '',
        media: (c.media || []).map((m) => ({
          original_url: m.original_url,
          s3_url: m.s3_url,
          type: m.type || 'image',
          role: m.role,
          card_index: m.card_index,
          uploaded_manually: m.uploaded_manually,
          media_type: m.media_type,
        })),
      })),
      media: (localAd?.content?.media || []).map((m) => ({
        original_url: m.original_url,
        s3_url: m.s3_url,
        type: m.type || 'image',
        role: m.role,
        card_index: m.card_index,
        uploaded_manually: m.uploaded_manually,
        media_type: m.media_type,
      })),
    })
    setEditingContent(true)
    setContentError(null)
  }

  const saveContent = async () => {
    if (!contentDraft) return
    setSavingContent(true)
    setContentError(null)
    try {
      const result = await updateAdContent(localAd._id, contentDraft)
      if (!result.success) {
        setContentError(result.error || 'Failed to save content')
        return
      }
      setLocalAd(result.ad)
      setSelectedAd?.(result.ad)
      setAds?.((prev) => prev.map((a) => (a._id === result.ad._id ? result.ad : a)))
      setEditingContent(false)
      setContentDraft(null)
      setToast({ type: 'success', message: 'Ad content saved' })
    } catch (e) {
      setContentError(e.message || 'Failed to save content')
    } finally {
      setSavingContent(false)
    }
  }

  const updateDraftCard = (index, patch) => {
    setContentDraft((prev) => {
      const cardsNext = [...(prev.cards || [])]
      cardsNext[index] = { ...cardsNext[index], ...patch }
      return { ...prev, cards: cardsNext }
    })
  }

  const addCard = () => {
    setContentDraft((prev) => ({
      ...prev,
      cards: [...(prev.cards || []), emptyCard()],
    }))
  }

  const removeCard = (index) => {
    setContentDraft((prev) => {
      const cardsNext = (prev.cards || []).filter((_, i) => i !== index)
      const media = (prev.media || []).filter((m) => m.card_index !== index).map((m) => ({
        ...m,
        card_index:
          m.card_index != null && m.card_index > index ? m.card_index - 1 : m.card_index,
      }))
      return { ...prev, cards: cardsNext, media }
    })
  }

  const handleImageUpload = async (file, cardIndex = null) => {
    if (!file) return
    setUploading(true)
    try {
      const init = await initAdImageUpload(localAd._id, {
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
      })
      if (!init.success) {
        setToast({ type: 'error', message: init.error || 'Upload init failed' })
        return
      }
      await uploadFileViaPresignedUrl(init.uploadUrl, file)
      const confirmed = await confirmAdImageUpload(localAd._id, {
        s3Key: init.s3Key,
        s3Url: init.s3Url,
        contentType: file.type,
        cardIndex,
      })
      if (!confirmed.success) {
        setToast({ type: 'error', message: confirmed.error || 'Confirm failed' })
        return
      }
      setLocalAd(confirmed.ad)
      setSelectedAd?.(confirmed.ad)
      setAds?.((prev) => prev.map((a) => (a._id === confirmed.ad._id ? confirmed.ad : a)))
      if (editingContent && contentDraft) {
        setContentDraft({
          ...contentDraft,
          ...(confirmed.ad.content || {}),
          cards: confirmed.ad.content?.cards || contentDraft.cards,
          media: (confirmed.ad.content?.media || []).map((m) => ({
            original_url: m.original_url,
            s3_url: m.s3_url,
            type: m.type,
            role: m.role,
            card_index: m.card_index,
            uploaded_manually: m.uploaded_manually,
            media_type: m.media_type,
          })),
        })
      }
      setToast({ type: 'success', message: 'Image uploaded' })
    } catch (e) {
      setToast({ type: 'error', message: e.message || 'Upload failed' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDeleteImage = async (s3Url) => {
    const result = await deleteAdImage(localAd._id, s3Url)
    if (!result.success) {
      setToast({ type: 'error', message: result.error || 'Delete failed' })
      return
    }
    setLocalAd(result.ad)
    setSelectedAd?.(result.ad)
    setAds?.((prev) => prev.map((a) => (a._id === result.ad._id ? result.ad : a)))
    setToast({ type: 'success', message: 'Image removed' })
  }

  const handleVisibilityToggle = async (online) => {
    setVisibilityOnline(online)
    const result = await updateAdVisibility(
      localAd._id,
      project,
      clientDetails,
      online ? 'available' : 'down',
    )
    if (result.success) {
      setLocalAd((prev) => ({
        ...prev,
        workflow: { ...(prev.workflow || {}), visibility_status: result.visibility_status },
        visibility_status: result.visibility_status,
      }))
    }
  }

  const handleDeleteAd = async () => {
    setIsDeleting(true)
    const result = await deleteAd(localAd._id)
    setIsDeleting(false)
    if (!result.success) {
      setToast({ type: 'error', message: result.error || 'Delete failed' })
      return
    }
    setAds?.((prev) => prev.filter((a) => a._id !== localAd._id))
    onClose?.()
  }

  const toggleLabel = (name) => {
    setThreatTypes((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    )
  }

  const toggleLegal = (code) => {
    setSelectedLegalCodes((prev) => {
      const exists = prev.find((c) => c.code === code)
      if (exists) return prev.filter((c) => c.code !== code)
      return [...prev, { code, reasoning: '' }]
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {toast && (
        <div
          className={cn(
            'absolute top-3 right-3 z-50 px-3 py-2 rounded-lg text-sm shadow-lg',
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white',
          )}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <div className="hidden lg:flex items-center gap-1">
          <Button variant="ghost" size="icon" disabled={!hasPrev} onClick={() => onNavigate?.(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" disabled={!hasNext} onClick={() => onNavigate?.(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900 truncate">
              {localAd.page_name || 'Advertiser'}
            </h2>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {localAd.platform}
            </Badge>
            {localAd.list?.display_format && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                {localAd.list.display_format}
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 truncate">
            ID {localAd.platform_ad_id}
            {localAd.original_url && (
              <>
                {' · '}
                <a
                  href={localAd.original_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 inline-flex items-center gap-0.5"
                >
                  Ads Library <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="hidden lg:inline-flex">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid lg:grid-cols-2 gap-0 min-h-full">
          {/* Preview + content */}
          <div className="p-4 space-y-4 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white">
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-square max-h-[420px] flex items-center justify-center relative">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <Megaphone className="h-12 w-12 text-slate-300" />
              )}
              {cards.length > 1 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {cards.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveCard(i)}
                      className={cn(
                        'h-2 w-2 rounded-full',
                        i === activeCard ? 'bg-blue-600' : 'bg-white/80 border border-slate-300',
                      )}
                    />
                  ))}
                </div>
              )}
            </div>

            {cards.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {cards.map((card, i) => {
                  const thumb = card.media?.[0]?.signedUrl
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveCard(i)}
                      className={cn(
                        'h-14 w-14 rounded-lg overflow-hidden border shrink-0',
                        i === activeCard ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200',
                      )}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-400">
                          {i + 1}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {currentCard?.title || localAd.content?.title || '—'}
                  </p>
                  <p className="text-slate-600 mt-1 whitespace-pre-wrap">
                    {currentCard?.body || localAd.content?.body || localAd.content?.caption || '—'}
                  </p>
                </div>
                {!editingContent && (
                  <Button variant="outline" size="sm" onClick={startEditContent} className="shrink-0 gap-1">
                    <Pencil className="h-3.5 w-3.5" /> Edit content
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(localAd.list?.publisher_platforms || localAd.ad_delivery?.publisher_platforms || []).map((p) => (
                  <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                ))}
                {localAd.list?.impressions_text && (
                  <Badge variant="outline" className="text-[10px]">
                    Impressions {localAd.list.impressions_text}
                  </Badge>
                )}
                {localAd.start_date && (
                  <Badge variant="outline" className="text-[10px]">
                    Start {format(new Date(localAd.start_date), 'dd MMM yyyy')}
                  </Badge>
                )}
              </div>

              {(currentCard?.link_url || localAd.content?.link_url) && (
                <a
                  href={currentCard?.link_url || localAd.content?.link_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 break-all inline-flex items-center gap-1"
                >
                  {currentCard?.link_url || localAd.content?.link_url}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              )}
            </div>

            {editingContent && contentDraft && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Edit ad content</h3>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingContent(false)
                        setContentDraft(null)
                      }}
                      disabled={savingContent}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={saveContent} disabled={savingContent} className="gap-1">
                      {savingContent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save
                    </Button>
                  </div>
                </div>
                {contentError && <p className="text-xs text-rose-600">{contentError}</p>}

                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Label className="text-xs">Title</Label>
                    <Input
                      value={contentDraft.title}
                      onChange={(e) => setContentDraft({ ...contentDraft, title: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Body</Label>
                    <Textarea
                      rows={3}
                      value={contentDraft.body || ''}
                      onChange={(e) => setContentDraft({ ...contentDraft, body: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Caption</Label>
                    <Input
                      value={contentDraft.caption || ''}
                      onChange={(e) => setContentDraft({ ...contentDraft, caption: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">CTA text</Label>
                    <Input
                      value={contentDraft.cta_text || ''}
                      onChange={(e) => setContentDraft({ ...contentDraft, cta_text: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Link URL</Label>
                    <Input
                      value={contentDraft.link_url || ''}
                      onChange={(e) => setContentDraft({ ...contentDraft, link_url: e.target.value })}
                    />
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cards</h4>
                  <Button type="button" variant="outline" size="sm" onClick={addCard} className="gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add card
                  </Button>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {(contentDraft.cards || []).map((card, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-700">Card {idx + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-rose-500"
                          onClick={() => removeCard(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <Input
                        placeholder="Title"
                        value={card.title}
                        onChange={(e) => updateDraftCard(idx, { title: e.target.value })}
                      />
                      <Textarea
                        placeholder="Body"
                        rows={2}
                        value={card.body}
                        onChange={(e) => updateDraftCard(idx, { body: e.target.value })}
                      />
                      <Input
                        placeholder="Link URL"
                        value={card.link_url}
                        onChange={(e) => updateDraftCard(idx, { link_url: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <Input
                          placeholder="CTA"
                          value={card.cta_text}
                          onChange={(e) => updateDraftCard(idx, { cta_text: e.target.value })}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={uploading}
                          onClick={() => {
                            fileInputRef.current?.setAttribute('data-card-index', String(idx))
                            fileInputRef.current?.click()
                          }}
                          className="gap-1 shrink-0"
                        >
                          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          Image
                        </Button>
                      </div>
                      {(card.media || []).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {card.media.map((m, mi) => (
                            <div key={mi} className="relative h-12 w-12 rounded border overflow-hidden">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={m.signedUrl || m.s3_url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                              {m.uploaded_manually && m.s3_url && (
                                <button
                                  type="button"
                                  className="absolute inset-0 bg-black/50 text-white text-[9px] opacity-0 hover:opacity-100"
                                  onClick={() => handleDeleteImage(m.s3_url)}
                                >
                                  Del
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-slate-500">
                  Max upload {formatUploadSizeLimit(REVIEW_IMAGE_MAX_BYTES)}. Manual images can be deleted; ingest media is preserved.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    const cardIndexAttr = e.target.getAttribute('data-card-index')
                    const cardIndex = cardIndexAttr != null ? Number(cardIndexAttr) : null
                    handleImageUpload(file, Number.isFinite(cardIndex) ? cardIndex : null)
                  }}
                />
              </div>
            )}
          </div>

          {/* Verdict form */}
          <form action={formAction} className="p-4 space-y-5 bg-slate-50/80">
            <input type="hidden" name="mongo_id" value={localAd._id} />
            <input type="hidden" name="threat_score" value={threatScore} />
            <input type="hidden" name="reasoning" value={reasoningText} />
            <input type="hidden" name="simple_report_description" value={simpleReportText} />
            <input type="hidden" name="reviewer_comments" value={reviewerComments} />
            <input type="hidden" name="poi_names" value={poiNames.join(',')} />
            <input type="hidden" name="face_present" value={facePresent ? 'on' : 'off'} />
            <input type="hidden" name="name_present" value={namePresent ? 'on' : 'off'} />
            <input type="hidden" name="is_aigc" value={isAIGC ? 'on' : 'off'} />
            {threatTypes.map((t) => (
              <input key={t} type="hidden" name={`flag_${t}`} value="on" />
            ))}
            {selectedLegalCodes.map((c) => (
              <React.Fragment key={c.code}>
                <input type="hidden" name={`legal_code_${c.code}`} value="on" />
                <input type="hidden" name={`legal_reasoning_${c.code}`} value={c.reasoning || ''} />
              </React.Fragment>
            ))}

            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                {visibilityOnline ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-slate-400" />}
                <span className="font-medium">{visibilityOnline ? 'Online / available' : 'Taken down'}</span>
              </div>
              <Switch checked={visibilityOnline} onCheckedChange={handleVisibilityToggle} />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Risk verdict</Label>
                <Badge className={cn('border', risk.color)}>{risk.label} · {threatScore}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {RISK_PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    size="sm"
                    variant={threatScore === p.score ? 'default' : 'outline'}
                    onClick={() => setThreatScore(p.score)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <Input
                type="number"
                min={0}
                max={100}
                value={threatScore}
                onChange={(e) => setThreatScore(Number(e.target.value) || 0)}
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
              <Label className="text-sm font-semibold">Violations</Label>
              <div className="flex flex-wrap gap-2">
                {projectLabels.map((label) => {
                  const name = typeof label === 'string' ? label : label?.name
                  if (!name) return null
                  const active = threatTypes.includes(name)
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleLabel(name)}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-full border transition-colors',
                        active
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                      )}
                    >
                      {name}
                    </button>
                  )
                })}
                {projectLabels.length === 0 && (
                  <p className="text-xs text-slate-500">No project labels configured.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="is_aigc" checked={isAIGC} onCheckedChange={(v) => setIsAIGC(Boolean(v))} />
                <Label htmlFor="is_aigc" className="text-sm">AI-generated content</Label>
              </div>
            </div>

            {projectLegalCodes.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                <Label className="text-sm font-semibold">Legal codes</Label>
                {projectLegalCodes.map((item) => {
                  const code = typeof item === 'string' ? item : item.code || item.name
                  if (!code) return null
                  const selected = selectedLegalCodes.find((c) => c.code === code)
                  return (
                    <div key={code} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`legal_${code}`}
                          checked={Boolean(selected)}
                          onCheckedChange={() => toggleLegal(code)}
                        />
                        <Label htmlFor={`legal_${code}`} className="text-sm">{code}</Label>
                      </div>
                      {selected && (
                        <Textarea
                          rows={2}
                          placeholder="Reasoning"
                          value={selected.reasoning || ''}
                          onChange={(e) =>
                            setSelectedLegalCodes((prev) =>
                              prev.map((c) =>
                                c.code === code ? { ...c, reasoning: e.target.value } : c,
                              ),
                            )
                          }
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
              <Label className="text-sm font-semibold">POI context</Label>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox checked={facePresent} onCheckedChange={(v) => setFacePresent(Boolean(v))} id="face" />
                  <Label htmlFor="face" className="text-sm">Face present</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={namePresent} onCheckedChange={(v) => setNamePresent(Boolean(v))} id="name" />
                  <Label htmlFor="name" className="text-sm">Name present</Label>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add POI name"
                  value={poiInput}
                  onChange={(e) => setPoiInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const v = poiInput.trim()
                      if (v && !poiNames.includes(v)) setPoiNames([...poiNames, v])
                      setPoiInput('')
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const v = poiInput.trim()
                    if (v && !poiNames.includes(v)) setPoiNames([...poiNames, v])
                    setPoiInput('')
                  }}
                >
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {poiNames.map((name) => (
                  <Badge key={name} variant="secondary" className="gap-1">
                    {name}
                    <button
                      type="button"
                      onClick={() => setPoiNames(poiNames.filter((n) => n !== name))}
                      className="ml-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
              <Label className="text-sm font-semibold">Analysis & notes</Label>
              <Textarea
                rows={4}
                placeholder="Reasoning"
                value={reasoningText}
                onChange={(e) => setReasoningText(e.target.value)}
              />
              <Textarea
                rows={2}
                placeholder="Simple report description"
                value={simpleReportText}
                onChange={(e) => setSimpleReportText(e.target.value)}
              />
              <Textarea
                rows={2}
                placeholder="Internal reviewer comments"
                value={reviewerComments}
                onChange={(e) => setReviewerComments(e.target.value)}
              />
            </div>

            {state?.error && (
              <p className="text-sm text-rose-600">{state.error}</p>
            )}

            <div className="flex flex-wrap gap-2 pb-6">
              <Button type="submit" disabled={isPending} className="gap-1.5">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : showSuccess ? <CheckCircle className="h-4 w-4" /> : null}
                {localAd.workflow?.review_status === 'reviewed' ? 'Update Review' : 'Submit Review'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
                onClick={() => setShowDeleteModal(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Delete ad
              </Button>
            </div>
          </form>
        </div>
      </div>

      {showDeleteModal && (
        <div className="absolute inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <h3 className="font-semibold text-slate-900">Delete this ad?</h3>
            <p className="text-sm text-slate-600">
              This permanently removes the Ads document. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteAd} disabled={isDeleting}>
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
