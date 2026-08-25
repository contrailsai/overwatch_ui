'use client'

import * as React from 'react'
import { useState, useEffect, useActionState } from 'react'
import {
  Loader2, X, CheckCircle, ExternalLink, ChevronLeft, ChevronRight,
  Plus, Globe, AlertCircle, Link2, Server, ShieldQuestion,
  ChevronDown, ChevronUp,
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
import { DomainAnalysisResults } from '@/components/domains/DomainAnalysisResults'
import { DomainCloakVariants } from '@/components/domains/DomainCloakVariants'
import {
  buildDomainReviewFormDefaults,
  applyDomainScamReviewPresets,
  domainScreenshotUrl,
  domainVisitUrl,
  isDomainOnline,
  isScamDisplayLabel,
} from '@/lib/domains/domain-display'
import { submitDomainReview, updateDomainVisibility } from './actions'

const initialState = { success: false, error: null }

const RISK_LEVELS = [
  { label: 'Safe', val: 0, active: (score) => score < 41, color: 'bg-emerald-500 border-emerald-600 shadow-emerald-200' },
  { label: 'Low Risk', val: 41, active: (score) => score > 40 && score < 76, color: 'bg-amber-400 border-amber-500 shadow-amber-200' },
  { label: 'Medium Risk', val: 76, active: (score) => score > 75 && score < 96, color: 'bg-orange-400 border-orange-500 shadow-orange-200' },
  { label: 'High Risk', val: 96, active: (score) => score > 95, color: 'bg-rose-500 border-rose-600 shadow-rose-200' },
]

const ANALYSIS_STATUS = {
  completed: { label: 'Analyzed', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  running: { label: 'Analyzing…', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  failed: { label: 'Analysis Failed', color: 'text-rose-700 bg-rose-50 border-rose-200' },
}

function analysisStatusConfig(status) {
  return ANALYSIS_STATUS[String(status || '').toLowerCase()]
    || { label: 'Awaiting Analysis', color: 'text-slate-500 bg-slate-50 border-slate-200' }
}

export default function ReviewDomainForm({
  domain,
  project,
  clientDetails,
  onClose,
  onNavigate,
  hasPrev,
  hasNext,
  setDomains,
  setSelectedDomain,
}) {
  const { project_details } = project
  const projectLabels = project_details?.labels || []
  const projectLegalCodes = project_details?.legal_codes || []

  const defaults = buildDomainReviewFormDefaults(domain, project_details)
  const submitBound = submitDomainReview.bind(null, project, clientDetails)
  const [state, formAction, isPending] = useActionState(submitBound, initialState)

  const [localDomain, setLocalDomain] = useState(domain)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showViolations, setShowViolations] = useState(true)
  const [showSiteFacts, setShowSiteFacts] = useState(false)
  const [toast, setToast] = useState(null)

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
  const [reviewerComments, setReviewerComments] = useState(domain?.review_details?.reviewer_comments || '')
  const [visibilityOnline, setVisibilityOnline] = useState(isDomainOnline(domain))

  useEffect(() => {
    setLocalDomain(domain)
    const d = buildDomainReviewFormDefaults(domain, project_details)
    setThreatScore(d.threatScore)
    setThreatTypes(d.threatTypes)
    setSelectedLegalCodes(d.selectedLegalCodes)
    setIsAIGC(d.isAIGC)
    setFacePresent(d.facePresent)
    setNamePresent(d.namePresent)
    setPoiNames(d.poiNames)
    setReasoningText(d.reasoningText)
    setSimpleReportText(d.simpleReportText)
    setReviewerComments(domain?.review_details?.reviewer_comments || '')
    setVisibilityOnline(isDomainOnline(domain))
  }, [domain, project_details])

  useEffect(() => {
    if (state?.success && state.domain) {
      setShowSuccess(true)
      setLocalDomain(state.domain)
      setSelectedDomain?.(state.domain)
      setDomains?.((prev) => prev.map((item) => (item._id === state.domain._id ? { ...item, ...state.domain } : item)))
      const t = setTimeout(() => setShowSuccess(false), 2000)
      return () => clearTimeout(t)
    }
  }, [state?.success]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const handleVisibilityToggle = async (online) => {
    setVisibilityOnline(online)
    const result = await updateDomainVisibility(localDomain._id, online ? 'up' : 'down')
    if (result.success) {
      const nextWorkflow = {
        ...(localDomain.workflow || {}),
        visibility_status: result.visibility_status,
      }
      setLocalDomain((prev) => ({
        ...prev,
        workflow: { ...(prev.workflow || {}), visibility_status: result.visibility_status },
      }))
      setSelectedDomain?.((prev) => (prev ? { ...prev, workflow: nextWorkflow } : prev))
      setDomains?.((prev) =>
        prev.map((item) =>
          item._id === localDomain._id
            ? { ...item, workflow: { ...(item.workflow || {}), visibility_status: result.visibility_status } }
            : item,
        ),
      )
    }
  }

  const handleRiskSelect = (level) => {
    setThreatScore(level.val)
    // High Risk = scam package for domain review
    if (level.val >= 96) {
      const preset = applyDomainScamReviewPresets(
        { threatTypes, selectedLegalCodes, threatScore: level.val },
        project_details,
      )
      setThreatTypes(preset.threatTypes)
      setSelectedLegalCodes(preset.selectedLegalCodes)
    }
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

  const labelNames = Array.from(new Set([
    ...projectLabels
      .map((label) => (typeof label === 'string' ? label : label?.name))
      .filter(Boolean),
    ...threatTypes,
  ]))

  const legalCodeNames = Array.from(new Set([
    ...projectLegalCodes
      .map((item) => (typeof item === 'string' ? item : item?.name || item?.code))
      .filter(Boolean),
    ...selectedLegalCodes.map((c) => c.code).filter(Boolean),
  ]))

  const hasReview = localDomain?.workflow?.review_status === 'reviewed'
    || localDomain?.review_details?.threat_score != null
  const visitUrl = domainVisitUrl(localDomain)
  const screenshotUrl = domainScreenshotUrl(localDomain)
  const analysisCfg = analysisStatusConfig(localDomain.analysis_status)

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
              {localDomain.domain_name}
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
            <Badge variant="outline" className={cn('text-[10px] shrink-0 font-bold', analysisCfg.color)}>
              <ShieldQuestion className="h-3 w-3 mr-1" />
              {analysisCfg.label}
            </Badge>
            {localDomain.category && !isScamDisplayLabel(localDomain.category) && (
              <Badge variant="outline" className="text-[10px] shrink-0 capitalize">
                {localDomain.category}
              </Badge>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="hidden lg:inline-flex">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row lg:divide-x divide-slate-200">
        <div className="shrink-0 lg:flex-1 lg:min-w-0 lg:min-h-0 lg:overflow-y-auto p-4 space-y-4 bg-white">
          {(localDomain.cloakVariants?.length > 0) ? (
            <DomainCloakVariants
              variants={localDomain.cloakVariants}
              primaryScreenshotUrl={screenshotUrl}
            />
          ) : (
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
              {screenshotUrl ? (
                <div className="max-h-[min(78vh,900px)] overflow-y-auto custom-scrollbar bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshotUrl}
                    alt={`Full-page capture of ${localDomain.domain_name}`}
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

          <div className="rounded-2xl border border-slate-200 bg-[#fbfcfd] overflow-hidden">
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
              <div className="px-4 pb-4 animate-in slide-in-from-top-1 fade-in duration-150">
                <DomainAnalysisResults analysisResults={localDomain.analysis_results} />
              </div>
            )}
          </div>
        </div>

        <form action={formAction} className="shrink-0 w-full lg:w-[min(360px,34%)] xl:w-[380px] lg:min-h-0 lg:overflow-y-auto p-5 md:p-6 space-y-6 bg-white border-t lg:border-t-0">
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
          <input type="hidden" name="mongo_id" value={localDomain._id} />
          <input type="hidden" name="threat_score" value={threatScore} />
          <input type="hidden" name="reasoning" value={reasoningText} />
          <input type="hidden" name="simple_report_description" value="" />
          <input type="hidden" name="reviewer_comments" value="" />
          <input type="hidden" name="poi_names" value="" />
          <input type="hidden" name="face_present" value="off" />
          <input type="hidden" name="name_present" value="off" />
          <input type="hidden" name="is_aigc" value="off" />
          <input type="hidden" name="is_parked" value="off" />
          <input type="hidden" name="visibility_status" value={visibilityOnline ? 'up' : 'down'} />

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
                      onClick={() => handleRiskSelect(level)}
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
          </div>
        </form>
      </div>
    </div>
  )
}
