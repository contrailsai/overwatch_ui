'use client'

import * as React from 'react'
import Link from 'next/link'
import { useState, useEffect, useActionState, useRef } from 'react'
import {
  submitAdReview,
  updateAdContent,
  initAdImageUpload,
  confirmAdImageUpload,
  deleteAdImage,
  updateAdVisibility,
  deleteAd,
  getAdUpdateHistory,
} from './actions'
import { uploadFileViaPresignedUrl } from '@/utils/aws/upload-via-presigned-url'
import { REVIEW_IMAGE_MAX_BYTES, formatUploadSizeLimit } from '@/utils/aws/upload-validation'
import { buildReviewFormDefaults } from '@/utils/analysis/correctionRequestUtils'
import {
  Loader2, X, CheckCircle, ExternalLink, ChevronLeft, ChevronRight,
  Plus, Trash2, Upload, Pencil, Save, Eye, Megaphone, CalendarDays,
  ChevronDown, ChevronUp, Bot, Globe, AlertCircle, User, History,
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
import SafeDate from '@/components/SafeDate'
import {
  formatDisplayFormat,
  formatAdDate,
  getAdCreativeFields,
  getAdDestinationLinks,
  getAdImpressions,
  isTemplatePlaceholder,
} from '@/lib/ads/ad-display'
import {
  AdDestinationLinks,
  AdTargetUrlsInfo,
  adDestinationLabel,
} from '@/lib/ads/AdDestinationLinks'
import { getDomainsByNames } from '@/app/(dashboard)/domains/actions'
import { isSectionEnabled } from '@/lib/project-sections'

function InfoRow({ label, children, multiline = false }) {
  if (children == null || children === '') return null
  return (
    <div className={cn('grid gap-1', multiline ? 'sm:grid-cols-1' : 'sm:grid-cols-[110px_1fr] sm:gap-3')}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 pt-0.5">
        {label}
      </dt>
      <dd className={cn('text-sm text-slate-800', multiline && 'whitespace-pre-wrap leading-relaxed')}>
        {children}
      </dd>
    </div>
  )
}

const initialState = { success: false, error: null }

const RISK_LEVELS = [
  { label: 'Safe', val: 0, active: (score) => score < 41, color: 'bg-emerald-500 border-emerald-600 shadow-emerald-200' },
  { label: 'Low Risk', val: 41, active: (score) => score > 40 && score < 76, color: 'bg-amber-400 border-amber-500 shadow-amber-200' },
  { label: 'Medium Risk', val: 76, active: (score) => score > 75 && score < 96, color: 'bg-orange-400 border-orange-500 shadow-orange-200' },
  { label: 'High Risk', val: 96, active: (score) => score > 95, color: 'bg-rose-500 border-rose-600 shadow-rose-200' },
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
  const [showViolations, setShowViolations] = useState(true)
  const [showPOI, setShowPOI] = useState(true)
  const [showActionLogs, setShowActionLogs] = useState(false)
  const [actionHistory, setActionHistory] = useState([])
  const [actionHistoryLoading, setActionHistoryLoading] = useState(false)
  const [actionHistoryError, setActionHistoryError] = useState(null)
  const [actionHistoryLoadedForId, setActionHistoryLoadedForId] = useState(null)
  const [domainsByHost, setDomainsByHost] = useState(null)
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
    setDomainsByHost(null)
    setShowActionLogs(false)
    setActionHistory([])
    setActionHistoryError(null)
    setActionHistoryLoadedForId(null)
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

    if (!ad || !isSectionEnabled(project, 'domains')) return undefined

    const hosts = getAdDestinationLinks(ad)
      .map((l) => l.host)
      .filter(Boolean)
    if (hosts.length === 0) return undefined

    let cancelled = false
    getDomainsByNames(hosts, { includeUnreviewed: true }).then((map) => {
      if (!cancelled) setDomainsByHost(map || {})
    })
    return () => { cancelled = true }
  }, [ad, project_details, project])

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

  const creative = getAdCreativeFields(localAd, currentCard)
  const impressions = getAdImpressions(localAd)
  const formatLabel = formatDisplayFormat(localAd?.list?.display_format || localAd?.content?.display_format)
  const startDateLabel = formatAdDate(localAd.start_date || localAd.list?.start_date)
  const endDateLabel = formatAdDate(localAd.end_date || localAd.list?.end_date)
  const sourcedLabel = formatAdDate(localAd.sourcing_date)
  const platforms = localAd.list?.publisher_platforms || localAd.ad_delivery?.publisher_platforms || []

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

  const toggleThreatType = (name) => {
    setThreatTypes((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    )
  }

  const toggleLegalCode = (code) => {
    setSelectedLegalCodes((prev) => {
      const exists = prev.find((c) => c.code === code)
      if (exists) return prev.filter((c) => c.code !== code)
      return [...prev, { code, reasoning: '' }]
    })
  }

  const updateLegalCodeReasoning = (code, reasoning) => {
    setSelectedLegalCodes((prev) =>
      prev.map((c) => (c.code === code ? { ...c, reasoning } : c)),
    )
  }

  const handleAddPoi = () => {
    const v = poiInput.trim()
    if (!v) return
    if (!poiNames.includes(v)) setPoiNames([...poiNames, v])
    setPoiInput('')
  }

  const toggleActionLogs = async () => {
    const next = !showActionLogs
    setShowActionLogs(next)
    if (!next || !localAd?._id || actionHistoryLoading) return
    if (actionHistoryLoadedForId === localAd._id) return

    setActionHistoryLoading(true)
    setActionHistoryError(null)
    const result = await getAdUpdateHistory(localAd._id)
    setActionHistoryLoading(false)
    if (!result?.success) {
      setActionHistoryError(result?.error || 'Failed to load action logs')
      setActionHistory([])
      return
    }
    setActionHistory(result.history || [])
    setActionHistoryLoadedForId(localAd._id)
  }

  const labelNames = projectLabels
    .map((label) => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean)

  const legalCodeNames = projectLegalCodes
    .map((item) => (typeof item === 'string' ? item : item?.name || item?.code))
    .filter(Boolean)

  const hasReview = localAd?.workflow?.review_status === 'reviewed'
    || localAd?.review_details?.threat_score != null

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden relative">
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
          <div className="flex items-center gap-2 flex-wrap">
            {localAd.ad_profile_id ? (
              <Link
                href={`/review-ad-profiles?profile_id=${localAd.ad_profile_id}`}
                className="text-base font-semibold text-slate-900 truncate hover:text-blue-700 hover:underline"
              >
                {localAd.page_name || 'Advertiser'}
              </Link>
            ) : (
              <h2 className="text-base font-semibold text-slate-900 truncate">
                {localAd.page_name || 'Advertiser'}
              </h2>
            )}
            <Badge variant="outline" className="text-[10px] shrink-0 capitalize">
              {localAd.platform}
            </Badge>
            {formatLabel && (
              <span
                className="text-[11px] text-slate-500 shrink-0"
                title={localAd.list?.display_format || undefined}
              >
                {formatLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 truncate">
            Ad ID {localAd.platform_ad_id}
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

      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row lg:divide-x divide-slate-200">
          {/* Preview + content */}
          <div className="shrink-0 lg:flex-1 lg:min-h-0 lg:overflow-y-auto p-4 space-y-4 bg-white">
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

            <div className="rounded-2xl border border-slate-200 bg-[#fbfcfd] p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Ad creative
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {cards.length > 1
                      ? `Card ${Math.min(activeCard, cards.length - 1) + 1} of ${cards.length}`
                      : 'Single creative'}
                    {formatLabel ? ` · ${formatLabel}` : ''}
                  </p>
                </div>
                {!editingContent && (
                  <Button variant="outline" size="sm" onClick={startEditContent} className="shrink-0 gap-1">
                    <Pencil className="h-3.5 w-3.5" /> Edit content
                  </Button>
                )}
              </div>

              <dl className="space-y-3.5">
                <InfoRow label="Title">
                  {creative.title || (
                    <span className="text-slate-400 italic">
                      {isTemplatePlaceholder(currentCard?.title || localAd.content?.title)
                        ? 'Dynamic product placeholder (no fixed title)'
                        : 'No title'}
                    </span>
                  )}
                </InfoRow>
                <InfoRow label="Content text" multiline>
                  {creative.body}
                </InfoRow>
                <InfoRow label="Caption / display">
                  {creative.caption}
                </InfoRow>
                <InfoRow label="Link description" multiline>
                  {creative.linkDescription}
                </InfoRow>
                <InfoRow label="Call to action">
                  {creative.cta
                    ? (
                      <span>
                        {creative.cta}
                        {creative.ctaType ? (
                          <span className="text-slate-400"> · {String(creative.ctaType).replace(/_/g, ' ')}</span>
                        ) : null}
                      </span>
                    )
                    : null}
                </InfoRow>
                <InfoRow label={adDestinationLabel(localAd)}>
                  <AdDestinationLinks
                    ad={localAd}
                    activeCard={activeCard}
                  />
                </InfoRow>
              </dl>

              <AdTargetUrlsInfo
                ad={localAd}
                domainsByHost={domainsByHost}
                domainsHrefBase={isSectionEnabled(project, 'domains') ? '/review-domains' : null}
              />

              <Separator />

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" /> Impressions
                  </p>
                  <p className="text-lg font-semibold text-slate-900 tabular-nums mt-1">
                    {impressions.text || '—'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Estimated reach from Ads Library
                    {impressions.index != null ? ` · band ${impressions.index}` : ''}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" /> Schedule
                  </p>
                  <div className="mt-1.5 space-y-1 text-sm text-slate-800">
                    <p>
                      <span className="text-slate-400 text-xs mr-2">Started</span>
                      {startDateLabel || '—'}
                    </p>
                    <p>
                      <span className="text-slate-400 text-xs mr-2">Ends</span>
                      {endDateLabel || '—'}
                    </p>
                    {sourcedLabel && (
                      <p>
                        <span className="text-slate-400 text-xs mr-2">Sourced</span>
                        {sourcedLabel}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {platforms.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-2">
                    Publisher platforms
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {platforms.map((p) => (
                      <Badge key={p} variant="outline" className="text-[10px] font-medium">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
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

          {/* Review form — aligned with /review-cases ReviewDetails */}
          <form action={formAction} className="shrink-0 w-full lg:w-[min(360px,38%)] xl:w-[380px] lg:min-h-0 lg:overflow-y-auto p-5 md:p-6 space-y-6 bg-white border-t lg:border-t-0">
            {Array.from(new Set([...labelNames, ...threatTypes])).map((labelName, index) => (
              <input
                key={`flag_${index}`}
                type="hidden"
                name={`flag_${labelName}`}
                value={threatTypes.includes(labelName) ? 'on' : 'off'}
              />
            ))}
            {Array.from(new Set([...legalCodeNames, ...selectedLegalCodes.map((c) => c.code)])).map((codeName, index) => {
              const selected = selectedLegalCodes.find((c) => c.code === codeName)
              return (
                <React.Fragment key={`legal_${index}`}>
                  <input type="hidden" name={`legal_code_${codeName}`} value={selected ? 'on' : 'off'} />
                  {selected && (
                    <input type="hidden" name={`legal_reasoning_${codeName}`} value={selected.reasoning || ''} />
                  )}
                </React.Fragment>
              )
            })}
            <input type="hidden" name="mongo_id" value={localAd._id} />
            <input type="hidden" name="threat_score" value={threatScore} />
            <input type="hidden" name="reasoning" value={reasoningText} />
            <input type="hidden" name="simple_report_description" value={simpleReportText} />
            <input type="hidden" name="reviewer_comments" value={reviewerComments} />
            <input type="hidden" name="poi_names" value={poiNames.join(',')} />
            <input type="hidden" name="face_present" value={facePresent ? 'on' : 'off'} />
            <input type="hidden" name="name_present" value={namePresent ? 'on' : 'off'} />
            <input type="hidden" name="is_aigc" value={isAIGC ? 'on' : 'off'} />

            {/* 1. Visibility */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">1</span>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Visibility Status</h3>
                </div>
                {hasReview && (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> Reviewed
                  </Badge>
                )}
              </div>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all shadow-inner',
                    visibilityOnline
                      ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                      : 'bg-slate-100 border-slate-200 text-slate-400',
                  )}>
                    {visibilityOnline ? <Globe className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {visibilityOnline ? 'Online' : 'Taken Down'}
                    </p>
                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                      Current status on source
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('text-[10px] font-bold uppercase tracking-widest', !visibilityOnline ? 'text-slate-900' : 'text-slate-400')}>
                    Down
                  </span>
                  <Switch checked={visibilityOnline} onCheckedChange={handleVisibilityToggle} />
                  <span className={cn('text-[10px] font-bold uppercase tracking-widest', visibilityOnline ? 'text-slate-900' : 'text-slate-400')}>
                    Online
                  </span>
                </div>
              </div>
            </section>

            {/* 2. Verdict & Risk Level — buckets only */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">2</span>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Verdict & Risk Level</h3>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 shadow-sm">
                <div className="flex gap-2">
                  {RISK_LEVELS.map((level) => {
                    const isActive = level.active(Number(threatScore) || 0)
                    return (
                      <button
                        key={level.label}
                        type="button"
                        onClick={() => setThreatScore(level.val)}
                        className={cn(
                          'flex-1 py-2.5 px-2 sm:px-3 rounded-lg border cursor-pointer text-xs sm:text-sm font-bold transition-all',
                          isActive
                            ? `${level.color} text-white border-b-0 translate-y-[1px]`
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300',
                        )}
                      >
                        {level.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>

            {/* 3. Violations — checkboxes */}
            <section className="space-y-3">
              <div
                className="flex items-center justify-between mb-1 cursor-pointer group"
                onClick={() => setShowViolations(!showViolations)}
              >
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">3</span>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider group-hover:text-blue-600 transition-colors">
                    Violations
                  </h3>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-slate-400 group-hover:text-blue-600">
                  {showViolations ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </div>

              {showViolations && (
                <div className="animate-in slide-in-from-top-2 fade-in duration-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={cn(
                        'col-span-1 sm:col-span-2 flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-200 group',
                        isAIGC
                          ? 'bg-blue-50/50 border-blue-200 shadow-sm ring-1 ring-blue-100'
                          : 'bg-slate-50/30 border-slate-200 hover:border-blue-200 hover:bg-white',
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
                          isAIGC ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400',
                        )}>
                          <Bot className="w-5 h-5" />
                        </div>
                        <span className={cn('text-xs font-bold uppercase tracking-wider', isAIGC ? 'text-blue-900' : 'text-slate-500')}>
                          AI Generated Content
                        </span>
                      </div>
                      <Checkbox
                        checked={isAIGC}
                        onCheckedChange={(checked) => setIsAIGC(Boolean(checked))}
                        className={cn('w-5 h-5 border-2', isAIGC ? 'bg-blue-600 border-blue-600' : 'border-slate-300')}
                      />
                    </label>

                    {labelNames.map((name) => (
                      <label
                        key={name}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
                          threatTypes.includes(name)
                            ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200'
                            : 'bg-white border-slate-200 hover:border-blue-200',
                        )}
                      >
                        <Checkbox
                          checked={threatTypes.includes(name)}
                          onCheckedChange={() => toggleThreatType(name)}
                          className="border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                        />
                        <span className={cn(
                          'text-xs font-bold uppercase',
                          threatTypes.includes(name) ? 'text-blue-700' : 'text-slate-600',
                        )}>
                          {name}
                        </span>
                      </label>
                    ))}
                  </div>

                  {labelNames.length === 0 && (
                    <p className="text-xs text-slate-500 mt-2">No project labels configured.</p>
                  )}

                  {legalCodeNames.length > 0 && (
                    <div className="pt-4">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                        Legal Framework Codes
                      </h4>
                      <div className="grid grid-cols-1 gap-3">
                        {legalCodeNames.map((code) => {
                          const selected = selectedLegalCodes.find((c) => c.code === code)
                          const isSelected = Boolean(selected)
                          return (
                            <div
                              key={code}
                              className={cn(
                                'flex flex-col gap-2 p-3 rounded-lg border transition-all hover:shadow-sm',
                                isSelected
                                  ? 'bg-purple-50 border-purple-200 ring-1 ring-purple-200'
                                  : 'bg-white border-slate-200 hover:border-purple-200',
                              )}
                            >
                              <label className="flex items-center gap-3 cursor-pointer">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleLegalCode(code)}
                                  className="border-slate-300 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                />
                                <span className={cn(
                                  'text-xs font-bold uppercase',
                                  isSelected ? 'text-purple-700' : 'text-slate-600',
                                )}>
                                  {code}
                                </span>
                              </label>
                              {isSelected && (
                                <Textarea
                                  value={selected.reasoning || ''}
                                  onChange={(e) => updateLegalCodeReasoning(code, e.target.value)}
                                  placeholder={`Provide reasoning for selecting ${code}...`}
                                  className="mt-1 text-sm bg-white border-purple-200 min-h-[60px]"
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* 4. POI Context */}
            <section className="space-y-3">
              <div
                className="flex items-center justify-between mb-1 cursor-pointer group"
                onClick={() => setShowPOI(!showPOI)}
              >
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">4</span>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider group-hover:text-blue-600 transition-colors">
                    POI Context
                  </h3>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-slate-400 group-hover:text-blue-600">
                  {showPOI ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </div>

              {showPOI && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4 animate-in slide-in-from-top-2 fade-in duration-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
                      <Label htmlFor="face-present" className="text-sm font-semibold text-slate-700 cursor-pointer">
                        Face Detected
                      </Label>
                      <Switch id="face-present" checked={facePresent} onCheckedChange={setFacePresent} />
                    </div>
                    <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
                      <Label htmlFor="name-present" className="text-sm font-semibold text-slate-700 cursor-pointer">
                        Name Mentioned
                      </Label>
                      <Switch id="name-present" checked={namePresent} onCheckedChange={setNamePresent} />
                    </div>
                  </div>

                  <Separator className="bg-slate-200" />

                  <div className="space-y-3">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Tagged Subjects</Label>
                    <div className="flex flex-wrap gap-2 min-h-[32px] items-center">
                      {poiNames.map((name) => (
                        <Badge
                          key={name}
                          variant="secondary"
                          className="pl-2.5 pr-1 py-1 h-7 bg-white border border-blue-200 text-blue-700 shadow-sm flex items-center gap-1"
                        >
                          {name}
                          <button
                            type="button"
                            onClick={() => setPoiNames(poiNames.filter((n) => n !== name))}
                            className="hover:bg-red-50 hover:text-red-600 rounded-full p-0.5 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                      {poiNames.length === 0 && (
                        <span className="text-xs text-slate-400 italic">No tags added</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={poiInput}
                        onChange={(e) => setPoiInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddPoi()
                          }
                        }}
                        placeholder="Add subject name..."
                        className="h-9 bg-white text-sm"
                      />
                      <Button
                        type="button"
                        onClick={handleAddPoi}
                        size="sm"
                        className="h-9 px-4 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        <Plus className="w-4 h-4 mr-1" /> Add
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* 5. Analysis & notes */}
            <section className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase">Reasoning</Label>
                <Textarea
                  value={reasoningText}
                  onChange={(e) => setReasoningText(e.target.value)}
                  placeholder="Enter your analysis reasoning here..."
                  className="min-h-[100px] bg-slate-50 border-slate-200 text-sm focus:bg-white transition-colors resize-y"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase">Simple Reasoning</Label>
                <Textarea
                  value={simpleReportText}
                  onChange={(e) => setSimpleReportText(e.target.value)}
                  placeholder="Concise summary for reports..."
                  className="min-h-[80px] bg-slate-50 border-slate-200 text-sm focus:bg-white transition-colors resize-y"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase">
                  Reviewer Comments
                  <span className="ml-2 text-[10px] font-medium normal-case tracking-normal text-slate-400">
                    (internal only)
                  </span>
                </Label>
                <Textarea
                  value={reviewerComments}
                  onChange={(e) => setReviewerComments(e.target.value)}
                  placeholder="Internal notes..."
                  className="min-h-[70px] bg-slate-50 border-slate-200 text-sm focus:bg-white transition-colors resize-y"
                />
              </div>
            </section>

            {/* Action Logs — loaded on demand */}
            <section className="space-y-3 pt-2 border-t border-slate-100">
              <div
                className="flex items-center justify-between mb-1 cursor-pointer group"
                onClick={() => toggleActionLogs()}
              >
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider group-hover:text-blue-600 transition-colors">
                    Action Logs
                  </h3>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-slate-400 group-hover:text-blue-600">
                  {showActionLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </div>

              {showActionLogs && (
                <div className="animate-in slide-in-from-top-2 fade-in duration-200">
                  {actionHistoryLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading action logs…
                    </div>
                  ) : actionHistoryError ? (
                    <p className="text-sm text-rose-600 py-2">{actionHistoryError}</p>
                  ) : actionHistory.length > 0 ? (
                    <div className="space-y-5 relative before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-slate-100">
                      {actionHistory.map((entry, idx) => (
                        <div key={`${entry.updated_at}-${idx}`} className="relative pl-12">
                          <div className="absolute left-0 top-0 h-8 w-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center z-10">
                            <User className="w-4 h-4 text-slate-400" />
                          </div>
                          <div className="flex flex-col gap-0.5 pt-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-slate-900">
                                {entry.updated_by || 'System'}
                              </span>
                              {entry.updated_at && (
                                <span className="text-[11px] text-slate-400">
                                  <SafeDate date={entry.updated_at} formatStr="dd/MM/yyyy HH:mm" />
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-600">
                              {entry.changes_summary || entry.event_type || 'Update'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : localAd?.content_reviewed_by ? (
                    <div className="relative pl-12 py-1">
                      <div className="absolute left-0 top-0 h-8 w-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center">
                        <User className="w-4 h-4 text-slate-400" />
                      </div>
                      <div className="flex flex-col gap-0.5 pt-1.5">
                        <span className="text-sm font-bold text-slate-900">
                          {localAd.content_reviewed_by}
                        </span>
                        <p className="text-sm text-slate-600">Ad reviewed and finalized.</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 py-2">No action logs yet.</p>
                  )}
                </div>
              )}
            </section>

            {state?.error && (
              <p className="text-sm text-rose-600">{state.error}</p>
            )}

            <div className="flex flex-wrap gap-2 pb-4 pt-2 border-t border-slate-100">
              <Button type="submit" disabled={isPending} className="gap-1.5 min-w-[140px]">
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : showSuccess ? (
                  <CheckCircle className="h-4 w-4" />
                ) : null}
                {hasReview ? 'Update Review' : 'Submit Review'}
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
