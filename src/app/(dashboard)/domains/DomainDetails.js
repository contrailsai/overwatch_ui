'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { addDomainClientNote, updateDomainClientStatus } from './actions'
import {
  ExternalLink, X, Globe, CheckCircle, ClockFading, Info, Siren,
  TriangleAlert, TrendingDown, Smile, Send, Loader2, CheckCircle2,
  AlertTriangle, ChevronLeft, ChevronRight, Link2, Server, ShieldQuestion,
  ChevronDown, ChevronUp, Megaphone, Fingerprint, MessageSquareWarning,
  Laugh, EyeOff, ShieldX, FishingHook, UserRoundX, AlertCircle, TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { DomainAnalysisResults } from '@/components/domains/DomainAnalysisResults'
import { DomainCloakVariants } from '@/components/domains/DomainCloakVariants'
import {
  domainVisitUrl,
  domainScreenshotUrl,
  hrefForDomainOccurrence,
  isScamDisplayLabel,
} from '@/lib/domains/domain-display'

const getRiskBadge = (risk) => {
  const v = typeof risk === 'string' ? risk.toLowerCase() : risk
  if (v === 'high') return { label: 'High', className: 'bg-rose-50 text-rose-700 border-rose-200', icon: Siren }
  if (v === 'mid' || v === 'medium') return { label: 'Medium', className: 'bg-orange-50 text-orange-700 border-orange-200', icon: TriangleAlert }
  if (v === 'low') return { label: 'Low', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: TrendingDown }
  return { label: 'Safe', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Smile }
}

const getStatusConfig = (status) => {
  if (status === 'To Be Reviewed' || !status) {
    return { label: 'To Be Reviewed', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: ClockFading }
  }
  if (status === 'No Action' || status === 'Pass') {
    return { label: 'No Action', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle }
  }
  if (status === 'Flag for Takedown') {
    return { label: 'Flag for Takedown', color: 'text-rose-700 bg-rose-50 border-rose-200', icon: Siren }
  }
  return { label: status, color: 'text-slate-600 bg-slate-50 border-slate-200', icon: Info }
}

const getAnalysisStatusConfig = (status) => {
  const s = status?.toLowerCase()
  if (s === 'completed') return { label: 'Analyzed', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
  if (s === 'running') return { label: 'Analyzing…', color: 'text-blue-700 bg-blue-50 border-blue-200' }
  if (s === 'failed') return { label: 'Analysis Failed', color: 'text-rose-700 bg-rose-50 border-rose-200' }
  return { label: 'Awaiting Analysis', color: 'text-slate-500 bg-slate-50 border-slate-200' }
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

function InfoRow({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="text-xs font-semibold text-slate-700 truncate max-w-[220px]">{value}</span>
    </div>
  )
}

function collectViolations(domain) {
  const fromReview = domain?.review_details?.threat_types || domain?.review_details?.flags || []
  const fromList = domain?.list?.threat_types || domain?.list?.violation_flags || []
  const flagObj = domain?.review_details?.flags
  const fromFlagObj = flagObj && !Array.isArray(flagObj)
    ? Object.entries(flagObj).filter(([, v]) => v).map(([k]) => k)
    : []
  const reviewFlags = Array.isArray(fromReview) ? fromReview : fromFlagObj
  return [...new Set([...reviewFlags, ...fromList].filter(Boolean).map(String))]
}

export default function DomainDetailPanel({
  domain,
  project,
  onClose,
  onUpdate,
  onNavigate,
  hasNext,
  hasPrev,
}) {
  const [localNotes, setLocalNotes] = useState([])
  const [noteText, setNoteText] = useState('')
  const [isSubmittingNote, setIsSubmittingNote] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [clientStatus, setClientStatus] = useState('To Be Reviewed')
  const [showProcessed, setShowProcessed] = useState(false)
  const [showSiteFacts, setShowSiteFacts] = useState(false)

  useEffect(() => {
    if (!domain) return
    setLocalNotes(domain.client_notes || [])
    setClientStatus(domain.client_status || 'To Be Reviewed')
    setNoteText('')
    setShowSiteFacts(false)
  }, [domain?._id])

  if (!domain) return null

  const handleAddNote = async () => {
    if (!noteText.trim() || isSubmittingNote) return
    setIsSubmittingNote(true)
    const res = await addDomainClientNote(domain._id, noteText)
    if (res.success) {
      const updatedNotes = [...localNotes, res.note]
      setLocalNotes(updatedNotes)
      setNoteText('')
      onUpdate?.(domain._id, { client_notes: updatedNotes })
    }
    setIsSubmittingNote(false)
  }

  const handleUpdateStatus = async (newStatus) => {
    if (isUpdatingStatus) return
    setIsUpdatingStatus(true)
    const res = await updateDomainClientStatus(domain._id, newStatus)
    if (res.success) {
      setClientStatus(newStatus)
      onUpdate?.(domain._id, { client_status: newStatus })
      setShowProcessed(true)
      setTimeout(() => setShowProcessed(false), 3000)
    }
    setIsUpdatingStatus(false)
  }

  const list = domain.list || {}
  const review = domain.review_details || {}
  const risk = getRiskBadge(list.risk_rank || domain.risk_rank || review.category)
  const RiskIcon = risk.icon
  const analysisStatusCfg = getAnalysisStatusConfig(domain.analysis_status)
  const visitUrl = domainVisitUrl(domain)
  const screenshotUrl = domainScreenshotUrl(domain)
  const statusCfg = getStatusConfig(clientStatus)
  const StatusIcon = statusCfg.icon

  const legalCodes = Array.isArray(review.legal_codes) ? review.legal_codes : []
  const violations = collectViolations(domain)
  const simpleReportDescription = review.simple_report_description || ''
  const reviewerComments = review.reviewer_comments || ''
  const reviewedAt = review.reviewed_at || domain.reviewed_at || list.reviewed_at

  const occurrences = Array.isArray(domain.discovery?.occurrences)
    ? domain.discovery.occurrences
    : []
  const linkedAds = occurrences.filter(
    (o) => String(o?.entity_type || '').toLowerCase() === 'ad' && o?.entity_id,
  )

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden relative">
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
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h2 className="text-base font-semibold text-slate-900 font-mono truncate max-w-[40%]">
              {domain.domain_name}
            </h2>
            {visitUrl && (
              <a
                href={visitUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 inline-flex items-center gap-0.5 truncate min-w-0 max-w-[min(100%,28rem)]"
                title={visitUrl}
              >
                <span className="truncate">{visitUrl}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            )}
            <Badge variant="outline" className={cn('text-[10px] shrink-0 font-bold gap-1', risk.className)}>
              <RiskIcon className="h-3 w-3" />
              {risk.label} Risk
            </Badge>
            <Badge variant="outline" className={cn('text-[10px] shrink-0 font-bold gap-1', statusCfg.color)}>
              <StatusIcon className="h-3 w-3" />
              {statusCfg.label}
            </Badge>
            <Badge variant="outline" className={cn('text-[10px] shrink-0 font-bold', analysisStatusCfg.color)}>
              <ShieldQuestion className="h-3 w-3 mr-1" />
              {analysisStatusCfg.label}
            </Badge>
            {domain.category && !isScamDisplayLabel(domain.category) && (
              <Badge variant="outline" className="text-[10px] shrink-0 capitalize">
                {domain.category}
              </Badge>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="hidden lg:inline-flex">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Cases/Ads-style: evidence (left) | analysis (right) on lg+ */}
      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row lg:divide-x divide-slate-200">
        {/* COLUMN 2 — Domain evidence */}
        <div className="flex-none lg:flex-1 lg:min-w-0 lg:overflow-y-auto p-4 space-y-4 bg-slate-50/50">
          {(domain.cloakVariants?.length > 0) ? (
            <DomainCloakVariants
              variants={domain.cloakVariants}
              primaryScreenshotUrl={screenshotUrl}
            />
          ) : (
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
              {screenshotUrl ? (
                <div className="max-h-[min(78vh,900px)] overflow-y-auto custom-scrollbar bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshotUrl}
                    alt={`Full-page capture of ${domain.domain_name}`}
                    className="w-full h-auto block"
                  />
                </div>
              ) : (
                <div className="aspect-video flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Globe className="h-10 w-10 text-slate-300" />
                  <p className="text-xs font-semibold">No screenshot captured yet</p>
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSiteFacts((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50/80 transition-colors"
            >
              <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5" /> Site facts
              </h4>
              {showSiteFacts ? (
                <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              )}
            </button>
            {showSiteFacts && (
              <div className="px-4 pb-4 space-y-3 animate-in slide-in-from-top-1 fade-in duration-150">
                <InfoRow
                  label="Category"
                  value={domain.category && !isScamDisplayLabel(domain.category) ? domain.category : null}
                />
                <InfoRow label="Registrar" value={list.registrar} />
                <InfoRow label="Hosting" value={list.hosting_provider} />
                <InfoRow label="Hosting Country" value={list.hosting_country} />
                <InfoRow label="Reachable" value={list.is_reachable == null ? null : (list.is_reachable ? 'Yes' : 'No')} />
                <InfoRow label="SSL Valid" value={list.ssl_valid == null ? null : (list.ssl_valid ? 'Yes' : 'No')} />
                <InfoRow label="First seen" value={domain.first_seen_at ? <SafeDate date={domain.first_seen_at} fmt="dd MMM yyyy" /> : null} />
                <InfoRow label="Last seen" value={domain.last_seen_at ? <SafeDate date={domain.last_seen_at} fmt="dd MMM yyyy" /> : null} />
                <InfoRow label="Last analyzed" value={domain.last_analyzed_at ? <SafeDate date={domain.last_analyzed_at} /> : null} />
                {domain.discovery?.first_seen_url && (
                  <a
                    href={domain.discovery.first_seen_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-start gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline break-all pt-1"
                  >
                    <Link2 className="w-3 h-3 shrink-0 mt-0.5" />
                    {domain.discovery.first_seen_url}
                  </a>
                )}
                <div className="pt-1">
                  <DomainAnalysisResults analysisResults={domain.analysis_results} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* COLUMN 3 — Reviewer analysis + actions */}
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
                      (pc) => (typeof pc === 'string' ? pc : pc?.name || pc?.code) === code,
                    )
                    const referenceLink = typeof projectCode === 'object' ? projectCode?.referenceLink : null
                    const bgClass = idx % 2 === 0
                      ? 'bg-rose-50/50 border-rose-100'
                      : 'bg-orange-50/50 border-orange-100'
                    const textClass = idx % 2 === 0 ? 'text-rose-800' : 'text-orange-800'

                    return (
                      <div key={`${code}-${idx}`} className={cn('p-3 rounded-xl border flex flex-col gap-1.5', bgClass)}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn('font-bold text-sm', textClass)}>{code}</span>
                          {referenceLink && (
                            <a
                              href={referenceLink}
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
                <Badge variant="outline" className={cn('text-[11px] shadow-none font-bold px-2 py-0.5 gap-1 h-6', risk.className)}>
                  <RiskIcon className="w-3 h-3" />
                  {risk.label} Risk
                </Badge>
                {reviewedAt && (
                  <span className="text-[11px] text-slate-400 ml-auto">
                    Reviewed <SafeDate date={reviewedAt} />
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
                {violations.length > 0 ? (
                  violations.map((v, idx) => {
                    const config = getLabelConfig(v)
                    const colorMap = VIOLATION_COLOR_MAP[config.color] || 'bg-slate-50 text-slate-700 border-slate-200'
                    return (
                      <Badge
                        key={idx}
                        variant="outline"
                        className={cn('text-[11px] shadow-none px-2 py-0.5 capitalize font-semibold', colorMap)}
                      >
                        {v.replace(/[-_]/g, ' ')}
                      </Badge>
                    )
                  })
                ) : (
                  <p className="text-xs text-slate-400 italic">No specific violations identified.</p>
                )}
              </div>
            </div>

            {legalCodes.length === 0 && (
              <div className="space-y-2 py-3 first:pt-0 border-b border-slate-100">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Legal Violations
                </h4>
                <p className="text-xs text-slate-400 italic">No legal violation codes recorded for this domain.</p>
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

            {/* Linked Ads */}
            <div className="space-y-2.5 py-3 first:pt-0 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Megaphone className="w-3.5 h-3.5" />
                  Linked Ads
                </h4>
                <Badge variant="outline" className="text-[10px] font-bold tabular-nums border-slate-200 text-slate-600 h-5 px-1.5">
                  {linkedAds.length > 0
                    ? `${linkedAds.length} ${linkedAds.length === 1 ? 'ad' : 'ads'}`
                    : (domain.occurrence_count != null
                      ? `${domain.occurrence_count} ${(domain.occurrence_count === 1) ? 'sighting' : 'sightings'}`
                      : '0 ads')}
                </Badge>
              </div>
              {linkedAds.length > 0 ? (
                <ul className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-0.5">
                  {linkedAds.map((occ, idx) => {
                    const href = hrefForDomainOccurrence('ad', occ.entity_id)
                    return (
                      <li
                        key={`${occ.entity_id}-${idx}`}
                        className="flex items-start justify-between gap-2 text-xs border border-slate-100 rounded-lg p-2.5 bg-slate-50/80"
                      >
                        <div className="min-w-0">
                          {href ? (
                            <Link
                              href={href}
                              className="font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                            >
                              Ad
                              <span className="font-mono font-medium text-slate-400 text-[10px]">
                                …{String(occ.entity_id).slice(-6)}
                              </span>
                              <ExternalLink className="w-3 h-3 opacity-60" />
                            </Link>
                          ) : (
                            <span className="font-bold text-slate-700">Ad</span>
                          )}
                          {occ.url && (
                            <p className="text-[10px] text-slate-400 truncate mt-0.5 font-mono">{occ.url}</p>
                          )}
                        </div>
                        {occ.seen_at && (
                          <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                            <SafeDate date={occ.seen_at} fmt="dd MMM" />
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  This domain has not been linked to any ads yet.
                </p>
              )}
            </div>

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
                <p className="text-sm font-bold text-emerald-800">Domain Updated</p>
                <p className="text-xs text-emerald-700 mt-0.5">The client status has been successfully updated.</p>
              </div>
            </div>
          )}

          <div className="p-3 border-t border-slate-100 bg-white shrink-0 sticky bottom-0">
            <div className="flex gap-2.5">
              <Button
                onClick={() => {
                  if (clientStatus !== 'No Action' && clientStatus !== 'Pass') handleUpdateStatus('No Action')
                }}
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
                onClick={() => {
                  if (clientStatus !== 'Flag for Takedown') handleUpdateStatus('Flag for Takedown')
                }}
                disabled={isUpdatingStatus}
                className={cn(
                  'flex-1 h-10 font-bold text-white transition-all duration-200 opacity-50 hover:opacity-100',
                  project?.project_details?.do_takedowns ? 'bg-amber-500' : 'bg-rose-600',
                  clientStatus === 'Flag for Takedown'
                    ? cn(
                      'opacity-100 cursor-default ring-2 ring-offset-2',
                      project?.project_details?.do_takedowns
                        ? 'hover:bg-amber-500 ring-amber-600'
                        : 'hover:bg-rose-600 ring-rose-700',
                    )
                    : cn(
                      'cursor-pointer',
                      project?.project_details?.do_takedowns ? 'hover:bg-amber-600' : 'hover:bg-rose-700',
                    ),
                )}
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Flag for Takedown
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
