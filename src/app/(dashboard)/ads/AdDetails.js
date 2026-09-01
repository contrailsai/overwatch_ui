'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { addAdClientNote, updateAdClientStatus } from './actions'
import {
  ExternalLink, X, Facebook, Instagram, Youtube, CheckCircle, ClockFading, Info,
  Globe, Siren, TriangleAlert, TrendingDown, Smile, Send, Loader2, CheckCircle2,
  AlertTriangle, ChevronLeft, ChevronRight, Eye, CalendarDays,
  Fingerprint, MessageSquareWarning, Laugh, EyeOff, ShieldX,
  FishingHook, UserRoundX, AlertCircle, TrendingUp, Copy, Check,
} from 'lucide-react'
import { Twitter, Reddit } from '@/utils/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { getRiskLabel } from '@/app/(dashboard)/cases/riskBuckets'
import {
  formatDisplayFormat,
  formatAdDate,
  getAdCreativeFields,
  getAdCreativeMode,
  getAdCreativeNavLabel,
  getAdDestinationLinks,
  getAdIdentityLabel,
  getAdImpressions,
  getAdMediaNav,
  getAdPrimaryMedia,
  getAdSourceLinkLabel,
  getAdViewableMedia,
  getAdVisibilityLabel,
  getDefaultMediaIndex,
  isTemplatePlaceholder,
} from '@/lib/ads/ad-display'
import {
  AdDestinationLinks,
  AdTargetUrlsInfo,
  AdLinkedDomainsAnalysis,
  adDestinationLabel,
} from '@/lib/ads/AdDestinationLinks'
import { AdMediaStage } from '@/components/ads/AdMediaStage'
import { AdMediaCounter, AdMediaNavigator } from '@/components/ads/AdMediaNavigator'
import { AdAdvertiserAvatar } from '@/components/ads/AdAdvertiserAvatar'
import { AdBodyContacts } from '@/components/ads/AdBodyContacts'
import { getDomainsByNames } from '@/app/(dashboard)/domains/actions'
import { isSectionEnabled } from '@/lib/project-sections'

const PlatformIcon = ({ platform, className }) => {
  const p = platform?.toLowerCase()
  if (p === 'instagram') return <Instagram className={cn('w-3.5 h-3.5 text-pink-500', className)} />
  if (p === 'facebook' || p === 'meta') return <Facebook className={cn('w-3.5 h-3.5 text-blue-600', className)} />
  if (p === 'x') return (
    <span className="w-3.5 h-3.5">
      <Twitter className={cn('max-w-3.5 max-h-3.5 text-slate-900', className)} />
    </span>
  )
  if (p === 'reddit') return (
    <span className="w-3.5 h-3.5">
      <Reddit className={cn('max-w-3.5 max-h-3.5', className)} />
    </span>
  )
  if (p === 'youtube') return <Youtube className={cn('w-3.5 h-3.5 text-red-500', className)} />
  return <Globe className={cn('w-3.5 h-3.5 text-slate-400', className)} />
}

const RiskIcon = ({ label }) => {
  if (label === 'High') return <Siren className="w-3 h-3" />
  if (label === 'Medium') return <TriangleAlert className="w-3 h-3" />
  if (label === 'Low') return <TrendingDown className="w-3 h-3" />
  return <Smile className="w-3 h-3" />
}

const getStatusConfig = (status) => {
  if (status === 'To Be Reviewed' || !status) return { label: 'To Be Reviewed', color: 'text-slate-700 bg-slate-100 border-slate-200', icon: ClockFading }
  if (status === 'No Action' || status === 'Pass') return { label: 'No Action', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle }
  if (status === 'Flag for Takedown') return { label: 'Flag for Takedown', color: 'text-rose-700 bg-rose-50 border-rose-200', icon: Siren }
  return { label: status, color: 'text-slate-600 bg-slate-50 border-slate-200', icon: Info }
}

const VIOLATION_COLOR_MAP = {
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
}

const getLabelConfig = (labelName) => {
  const name = String(labelName).toLowerCase().replace(/[-_]/g, ' ')
  if (name.includes('scam') || name.includes('fraud')) return { icon: Fingerprint, color: 'rose' }
  if (name.includes('investment')) return { icon: TrendingUp, color: 'emerald' }
  if (name.includes('misinformation') || name.includes('fake')) return { icon: ShieldX, color: 'orange' }
  if (name.includes('hate')) return { icon: MessageSquareWarning, color: 'red' }
  if (name.includes('satire') || name.includes('humor')) return { icon: Laugh, color: 'blue' }
  if (name.includes('nsfw')) return { icon: EyeOff, color: 'indigo' }
  if (name.includes('violence') || name.includes('terrorism')) return { icon: Siren, color: 'red' }
  if (name.includes('spam')) return { icon: ShieldX, color: 'blue' }
  if (name.includes('phishing')) return { icon: FishingHook, color: 'indigo' }
  if (name.includes('propaganda')) return { icon: UserRoundX, color: 'red' }
  return { icon: AlertCircle, color: 'amber' }
}

const SafeDate = ({ date, fmt = 'dd MMM yyyy, HH:mm' }) => {
  const [formatted, setFormatted] = useState(null)
  useEffect(() => {
    if (date) setFormatted(format(new Date(date), fmt))
  }, [date, fmt])
  return <span>{formatted || (date ? '...' : '—')}</span>
}

function InfoRow({ label, children, multiline = false }) {
  if (children == null || children === '') return null
  return (
    <div className={cn('grid gap-1', multiline ? 'sm:grid-cols-1' : 'sm:grid-cols-[100px_1fr] sm:gap-3')}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 pt-0.5">
        {label}
      </dt>
      <dd className={cn('text-sm text-slate-800', multiline && 'whitespace-pre-wrap leading-relaxed')}>
        {children}
      </dd>
    </div>
  )
}

function collectViolations(ad) {
  const fromReview = ad?.review_details?.threat_types || ad?.review_details?.flags || []
  const fromList = ad?.list?.threat_types || ad?.list?.violation_flags || []
  const flagObj = ad?.review_details?.flags
  const fromFlagObj = flagObj && !Array.isArray(flagObj)
    ? Object.entries(flagObj).filter(([, v]) => v).map(([k]) => k)
    : []
  const reviewFlags = Array.isArray(fromReview) ? fromReview : fromFlagObj
  return [...new Set([...reviewFlags, ...fromList].filter(Boolean).map(String))]
}

export default function AdDetailPanel({
  ad,
  project,
  onClose,
  onUpdate,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
}) {
  const [localNotes, setLocalNotes] = useState([])
  const [noteText, setNoteText] = useState('')
  const [isSubmittingNote, setIsSubmittingNote] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [clientStatus, setClientStatus] = useState('To Be Reviewed')
  const [showProcessed, setShowProcessed] = useState(false)
  const [activeCard, setActiveCard] = useState(0)
  const [activeMediaIndex, setActiveMediaIndex] = useState(0)
  const [domainsByHost, setDomainsByHost] = useState(null)
  const [copiedId, setCopiedId] = useState(false)

  useEffect(() => {
    if (!ad) return
    setLocalNotes(ad.client_notes || [])
    setClientStatus(ad.client_status || 'To Be Reviewed')
    setNoteText('')
    setActiveCard(0)
    setActiveMediaIndex(getDefaultMediaIndex(getAdViewableMedia(ad)))
    setShowProcessed(false)
    setCopiedId(false)
    setDomainsByHost(null)

    if (!isSectionEnabled(project, 'domains')) {
      setDomainsByHost({})
      return undefined
    }

    const hosts = getAdDestinationLinks(ad)
      .map((l) => l.host)
      .filter(Boolean)
    if (hosts.length === 0) {
      setDomainsByHost({})
      return undefined
    }

    let cancelled = false
    getDomainsByNames(hosts).then((map) => {
      if (!cancelled) setDomainsByHost(map || {})
    })
    return () => { cancelled = true }
  }, [ad?._id, project])

  if (!ad) return null

  const handleAddNote = async () => {
    if (!noteText.trim() || isSubmittingNote) return
    setIsSubmittingNote(true)
    const res = await addAdClientNote(ad._id, noteText)
    if (res.success) {
      const updatedNotes = [...localNotes, res.note]
      setLocalNotes(updatedNotes)
      setNoteText('')
      onUpdate?.(ad._id, { client_notes: updatedNotes })
    }
    setIsSubmittingNote(false)
  }

  const handleUpdateStatus = async (newStatus) => {
    if (isUpdatingStatus) return
    setIsUpdatingStatus(true)
    const res = await updateAdClientStatus(ad._id, newStatus)
    if (res.success) {
      setClientStatus(newStatus)
      onUpdate?.(ad._id, { client_status: newStatus })
      setShowProcessed(true)
      setTimeout(() => setShowProcessed(false), 3000)
    }
    setIsUpdatingStatus(false)
  }

  const cards = ad?.content?.cards?.length
    ? ad.content.cards
    : [{ title: ad?.content?.title, media: ad?.content?.media || [] }]
  const currentCard = cards[Math.min(activeCard, cards.length - 1)] || cards[0]
  const creativeMode = getAdCreativeMode(ad)
  const mediaNav = getAdMediaNav(ad, creativeMode === 'card' ? currentCard : null)
  const viewableMedia = getAdViewableMedia(
    ad,
    creativeMode === 'card' ? currentCard : null,
  )
  const primaryMedia = getAdPrimaryMedia(
    ad,
    creativeMode === 'card' ? currentCard : null,
    activeMediaIndex,
  )
  const identityLabel = getAdIdentityLabel(ad)
  const sourceLinkLabel = getAdSourceLinkLabel(ad)
  const creativeNavLabel = getAdCreativeNavLabel(ad, {
    activeCard,
    activeMediaIndex,
    card: creativeMode === 'card' ? currentCard : null,
  })
  const creative = getAdCreativeFields(ad, currentCard)
  const impressions = getAdImpressions(ad)
  const formatLabel = formatDisplayFormat(ad?.list?.display_format || ad?.content?.display_format)
  const startDateLabel = formatAdDate(ad.start_date || ad.list?.start_date)
  const endDateLabel = formatAdDate(ad.end_date || ad.list?.end_date)
  const sourcedLabel = formatAdDate(ad.sourcing_date)
  const platforms = ad.list?.publisher_platforms || ad.ad_delivery?.publisher_platforms || []
  const risk = getRiskLabel(ad.score)
  const statusCfg = getStatusConfig(clientStatus)
  const StatusIcon = statusCfg.icon
  const review = ad.review_details || {}
  const violations = collectViolations(ad)
  const legalCodes = Array.isArray(review.legal_codes) ? review.legal_codes : []
  const simpleReportDescription = review.simple_report_description || null
  const reviewerComments = review.reviewer_comments || null
  const poiNames = Array.isArray(review.poi_names) ? review.poi_names.filter(Boolean) : []
  const isPoiPresent = Boolean(
    review.face_present || review.name_present || poiNames.length > 0 || review.flags?.poi_confirmed,
  )
  const isAigc = Boolean(review.is_aigc || review.flags?.is_aigc)
  const domainsEnabled = isSectionEnabled(project, 'domains')
  const visibility = getAdVisibilityLabel(ad)
  const advertiserPic = ad.advertiser_snapshot?.signed_profile_pic
  const pageName = ad.page_name || 'Advertiser'
  const showTitleRow =
    Boolean(creative.title) ||
    (creativeMode === 'card' && isTemplatePlaceholder(currentCard?.title || ad.content?.title))

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-white font-sans overflow-hidden">
      {/* Cases-style: creative (left) | analysis (right) on lg+; stacked below */}
      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row lg:divide-x divide-slate-200">
        {/* COLUMN 2 — Square creative + narrative */}
        <div className="flex-none lg:flex-1 lg:min-w-0 lg:overflow-y-auto bg-slate-50/50 flex flex-col">
          <div className="shrink-0 border-b border-slate-100 bg-white/90 backdrop-blur-md sticky top-0 z-20 px-3 sm:px-4 py-2 space-y-1">
            {/* Row 1 — primary: nav, identity, close */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="hidden lg:flex items-center gap-0.5 shrink-0">
                <Button variant="ghost" size="icon" disabled={!hasPrev} onClick={onPrev} className="h-8 w-8">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" disabled={!hasNext} onClick={onNext} className="h-8 w-8">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <AdAdvertiserAvatar
                src={advertiserPic}
                name={pageName}
                className="w-8 h-8"
              />

              <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                {ad.ad_profile_id ? (
                  <Link
                    href={`/ad-profiles?profile_id=${ad.ad_profile_id}`}
                    className="text-[15px] font-semibold text-slate-900 truncate max-w-full hover:text-blue-700 hover:underline"
                  >
                    {pageName}
                  </Link>
                ) : (
                  <h2 className="text-[15px] font-semibold text-slate-900 truncate">
                    {pageName}
                  </h2>
                )}
                <Badge variant="outline" className="text-[10px] shrink-0 capitalize gap-1 h-5">
                  <PlatformIcon platform={ad.platform} />
                  {ad.platform}
                </Badge>
              </div>

              <Button variant="ghost" size="icon" onClick={onClose} className="hidden lg:inline-flex shrink-0 h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Row 2 — compact meta + status (text-only height) */}
            <div className="flex items-center gap-x-2 gap-y-1 flex-wrap min-w-0 pl-0 lg:pl-[4.25rem]">
              <div className="flex items-center gap-1 min-w-0 text-[11px] text-slate-500 leading-none">
                <span className="shrink-0">{identityLabel}</span>
                <button
                  type="button"
                  onClick={async () => {
                    const id = String(ad.platform_ad_id || ad._id || '')
                    if (!id) return
                    try {
                      await navigator.clipboard.writeText(id)
                      setCopiedId(true)
                      setTimeout(() => setCopiedId(false), 1500)
                    } catch {
                      /* ignore */
                    }
                  }}
                  title={`Copy ${identityLabel}`}
                  className="inline-flex items-center gap-1 font-mono text-slate-700 hover:text-blue-700 hover:underline truncate max-w-[14rem] sm:max-w-[18rem]"
                >
                  <span className="truncate">{ad.platform_ad_id || ad._id}</span>
                  {copiedId ? (
                    <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                  ) : (
                    <Copy className="h-3 w-3 shrink-0 opacity-60" />
                  )}
                </button>
                {ad.original_url && (
                  <>
                    <span className="text-slate-300 shrink-0">·</span>
                    <a
                      href={ad.original_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 inline-flex items-center gap-0.5 hover:underline shrink-0"
                    >
                      {sourceLinkLabel} <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                )}
              </div>
              <span className="hidden sm:inline text-slate-200">|</span>
              <div className="flex flex-wrap items-center gap-1">
                <Badge variant="outline" className={cn('rounded-md font-semibold border gap-1 pl-1 h-5 text-[10px]', risk.color)}>
                  <RiskIcon label={risk.label} />
                  {risk.label} Risk
                </Badge>
                <Badge variant="outline" className={cn('rounded-md capitalize font-semibold border gap-1 pl-1 h-5 text-[10px]', statusCfg.color)}>
                  <StatusIcon className="w-2.5 h-2.5" />
                  {statusCfg.label}
                </Badge>
                {visibility.down ? (
                  <Badge variant="outline" className="rounded-md font-semibold border h-5 text-[10px] bg-slate-100 text-slate-600 border-slate-200">
                    Taken Down
                  </Badge>
                ) : (
                  <Badge variant="outline" className="rounded-md font-semibold border h-5 text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                    Online
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="p-3 sm:p-4 space-y-3">
            {/* Full-width square stage + filmstrip */}
            <div className="flex gap-2 w-full items-stretch">
              <div className="relative aspect-square flex-1 min-w-0 rounded-xl border border-slate-200 bg-[#0f1419] overflow-hidden bg-[radial-gradient(ellipse_at_center,_#1a222c_0%,_#0f1419_70%)]">
                <AdMediaStage
                  media={primaryMedia}
                  className="absolute inset-0"
                  emptyIconClassName="h-12 w-12 text-slate-600"
                />
                <AdMediaCounter
                  activeIndex={mediaNav.kind === 'cards' ? activeCard : activeMediaIndex}
                  total={mediaNav.count}
                />
              </div>

              {mediaNav.kind === 'cards' && (
                <AdMediaNavigator
                  theme="light"
                  items={cards}
                  activeIndex={activeCard}
                  onSelect={(i) => {
                    setActiveCard(i)
                    setActiveMediaIndex(getDefaultMediaIndex(getAdViewableMedia(ad, cards[i])))
                  }}
                  getThumbItem={(_, i) => cards[i]?.media?.[0]}
                />
              )}
              {mediaNav.kind === 'media' && (
                <AdMediaNavigator
                  theme="light"
                  items={viewableMedia}
                  activeIndex={activeMediaIndex}
                  onSelect={setActiveMediaIndex}
                />
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-3.5 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Ad creative
                </p>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {creativeNavLabel}
                  {formatLabel ? ` · ${formatLabel}` : ''}
                </p>
              </div>

              <dl className="space-y-2.5">
                {showTitleRow && (
                  <InfoRow label="Title">
                    {creative.title || (
                      <span className="text-slate-400 italic">
                        {isTemplatePlaceholder(currentCard?.title || ad.content?.title)
                          ? 'Dynamic product placeholder (no fixed title)'
                          : 'No title'}
                      </span>
                    )}
                  </InfoRow>
                )}
                <InfoRow label="Content text" multiline>
                  {creative.body ? (
                    <>
                      {creative.body}
                      <AdBodyContacts body={creative.body} />
                    </>
                  ) : null}
                </InfoRow>
                <InfoRow label="Caption / display">
                  {creative.caption}
                </InfoRow>
                <InfoRow label="Link description" multiline>
                  {creative.linkDescription}
                </InfoRow>
                <InfoRow label="Call to action">
                  {creative.cta ? (
                    <span>
                      {creative.cta}
                      {creative.ctaType ? (
                        <span className="text-slate-400"> · {String(creative.ctaType).replace(/_/g, ' ')}</span>
                      ) : null}
                    </span>
                  ) : null}
                </InfoRow>
                <InfoRow label={adDestinationLabel(ad)}>
                  <AdDestinationLinks
                    ad={ad}
                    activeCard={activeCard}
                  />
                </InfoRow>
              </dl>

              <AdTargetUrlsInfo
                ad={ad}
                domainsByHost={domainsByHost}
                domainsHrefBase={domainsEnabled ? '/domains' : null}
              />

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 flex items-center gap-1">
                    <Eye className="h-3 w-3" /> Impressions
                  </p>
                  <p className="text-base font-semibold text-slate-900 tabular-nums mt-0.5">
                    {impressions.text || '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" /> Schedule
                  </p>
                  <div className="mt-0.5 space-y-0.5 text-[12px] text-slate-800 leading-snug">
                    <p><span className="text-slate-400">Start </span>{startDateLabel || '—'}</p>
                    <p><span className="text-slate-400">End </span>{endDateLabel || '—'}</p>
                    {sourcedLabel && (
                      <p><span className="text-slate-400">Sourced </span>{sourcedLabel}</p>
                    )}
                  </div>
                </div>
              </div>

              {platforms.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 mr-0.5">
                    Platforms
                  </span>
                  {platforms.map((p) => (
                    <Badge key={p} variant="outline" className="text-[10px] font-medium h-5">
                      {p}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* COLUMN 3 — Review analysis + actions */}
        <div className="relative w-full bg-white flex flex-col shrink-0 border-t border-slate-100 lg:border-t-0 lg:w-[min(420px,38%)] lg:h-full">
          <div className="lg:flex-1 lg:overflow-y-auto custom-scrollbar p-3 sm:p-4 space-y-0">
            {/* Legal Violations */}
            {legalCodes.length > 0 && (
              <div className="space-y-3 py-3 first:pt-0 border-b border-slate-100">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Legal Violations
                </h4>
                <div className="flex flex-col gap-2.5">
                  {legalCodes.map((item, idx) => {
                    const code = typeof item === 'string' ? item : item.code
                    const reasoning = typeof item === 'string' ? '' : (item.reasoning || '')
                    const projectCode = project?.project_details?.legal_codes?.find(
                      (pc) => pc.name === code,
                    )
                    const bgClass = idx % 2 === 0
                      ? 'bg-rose-50/50 border-rose-100'
                      : 'bg-orange-50/50 border-orange-100'
                    const textClass = idx % 2 === 0 ? 'text-rose-800' : 'text-orange-800'

                    return (
                      <div key={`${code}-${idx}`} className={cn('p-3 rounded-xl border flex flex-col gap-1.5', bgClass)}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn('font-bold text-sm', textClass)}>{code}</span>
                          {projectCode?.referenceLink && (
                            <a
                              href={projectCode.referenceLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn('p-1 rounded-md hover:bg-black/5 transition-colors shrink-0', textClass)}
                              title="View Reference"
                            >
                              <ExternalLink className="w-3.5 h-3.5 opacity-70 hover:opacity-100" />
                            </a>
                          )}
                        </div>
                        {reasoning ? (
                          <p className={cn('text-sm font-medium leading-relaxed whitespace-pre-wrap', textClass)}>
                            {reasoning}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400 italic">No reasoning text for this code.</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {simpleReportDescription && (
              <div className="space-y-2 py-3 first:pt-0 border-b border-slate-100">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Simple Reasoning
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
                  {simpleReportDescription}
                </p>
              </div>
            )}

            <div className="space-y-2.5 py-3 first:pt-0 border-b border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Reasoning
                </h4>
                <Badge variant="outline" className={cn('text-[11px] shadow-none font-bold px-2 py-0.5 gap-1 h-6', risk.color)}>
                  <RiskIcon label={risk.label} />
                  {risk.label} Risk
                </Badge>
                {review.reviewed_at && (
                  <span className="text-[11px] text-slate-400 ml-auto">
                    Reviewed <SafeDate date={review.reviewed_at} />
                  </span>
                )}
              </div>
              {review.reasoning ? (
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {review.reasoning}
                </p>
              ) : (
                <p className="text-xs text-slate-400 italic">No reviewer reasoning recorded.</p>
              )}
            </div>

            <div className="space-y-2 py-3 first:pt-0 border-b border-slate-100">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Detected Violations
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {isPoiPresent && (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] shadow-none px-2 py-0.5 font-semibold">
                    POI Detected
                  </Badge>
                )}
                {isAigc && (
                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[11px] shadow-none px-2 py-0.5 font-semibold">
                    AI Generated
                  </Badge>
                )}
                {violations.length > 0 ? (
                  violations.map((v, idx) => {
                    const config = getLabelConfig(v)
                    const colorMap = VIOLATION_COLOR_MAP[config.color] || 'bg-slate-50 text-slate-700 border-slate-200'
                    return (
                      <Badge key={idx} variant="outline" className={cn('text-[11px] shadow-none px-2 py-0.5 capitalize font-semibold', colorMap)}>
                        {v.replace(/[-_]/g, ' ')}
                      </Badge>
                    )
                  })
                ) : !isPoiPresent && !isAigc ? (
                  <p className="text-xs text-slate-400 italic">No specific violations identified.</p>
                ) : null}
              </div>
              {poiNames.length > 0 && (
                <p className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] mr-1.5">POI</span>
                  {poiNames.join(', ')}
                </p>
              )}
            </div>

            {legalCodes.length === 0 && (
              <div className="space-y-2 py-3 first:pt-0 border-b border-slate-100">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Legal Violations
                </h4>
                <p className="text-xs text-slate-400 italic">No legal violation codes recorded for this ad.</p>
              </div>
            )}

            {reviewerComments && (
              <div className="space-y-2 py-3 first:pt-0 border-b border-slate-100">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Reviewer Notes
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {reviewerComments}
                </p>
              </div>
            )}

            {domainsEnabled && (
              <div className="py-3 first:pt-0 border-b border-slate-100">
                <AdLinkedDomainsAnalysis
                  ad={ad}
                  domainsByHost={domainsByHost}
                  domainsHrefBase="/domains"
                />
              </div>
            )}

            <div className="py-3 first:pt-0">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Comments</h4>

              {localNotes.length > 0 && (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar mb-2">
                  {localNotes.map((note, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-bold text-slate-400">{note.email || 'Unknown User'}</span>
                        <span className="text-[10px] text-slate-400"><SafeDate date={note.created_at} /></span>
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.text}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative">
                <Textarea
                  placeholder="Add a comment"
                  className="min-h-[72px] pr-12 text-sm resize-none bg-white border-slate-200 focus-visible:ring-blue-500"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleAddNote()
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute cursor-pointer bottom-2 right-2 h-8 w-8 hover:text-blue-600 bg-white transition-colors duration-200 disabled:opacity-50"
                  onClick={handleAddNote}
                  disabled={!noteText.trim() || isSubmittingNote}
                >
                  {isSubmittingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          {showProcessed && (
            <div className="mx-3 mb-2 p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-800">Ad Updated</p>
                <p className="text-xs text-emerald-700 mt-0.5">The client status has been successfully updated.</p>
              </div>
            </div>
          )}

          <div className="p-3 border-t border-slate-100 bg-white shrink-0 sticky bottom-0">
            <div className="flex gap-2.5">
              <Button
                onClick={() => { if (clientStatus !== 'No Action' && clientStatus !== 'Pass') handleUpdateStatus('No Action') }}
                disabled={isUpdatingStatus}
                className={cn(
                  'flex-1 h-10 font-bold text-white transition-all duration-200 shadow-emerald-900/20 bg-emerald-500 opacity-50 hover:opacity-100',
                  (clientStatus === 'No Action' || clientStatus === 'Pass')
                    ? 'opacity-100 cursor-default hover:bg-emerald-500 ring-2 ring-emerald-600 ring-offset-2'
                    : 'cursor-pointer hover:bg-emerald-600',
                )}
              >
                {isUpdatingStatus && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                No Action
              </Button>
              <Button
                onClick={() => { if (clientStatus !== 'Flag for Takedown') handleUpdateStatus('Flag for Takedown') }}
                disabled={isUpdatingStatus}
                className={cn(
                  'flex-1 h-10 font-bold text-white transition-all duration-200 opacity-50 hover:opacity-100',
                  project?.project_details?.do_takedowns ? 'shadow-amber-900/20 bg-amber-500' : 'shadow-rose-900/20 bg-rose-600',
                  clientStatus === 'Flag for Takedown'
                    ? cn('opacity-100 cursor-default ring-2 ring-offset-2', project?.project_details?.do_takedowns ? 'hover:bg-amber-500 ring-amber-600' : 'hover:bg-rose-600 ring-rose-700')
                    : cn('cursor-pointer', project?.project_details?.do_takedowns ? 'hover:bg-amber-600' : 'hover:bg-rose-700'),
                )}
              >
                {isUpdatingStatus === true ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <AlertTriangle className="w-4 h-4 mr-2" />
                )}
                Flag for Takedown
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
