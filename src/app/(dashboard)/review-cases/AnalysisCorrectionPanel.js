'use client'

import { useState, useEffect, useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Loader2, Sparkles, Wand2, RotateCcw, XCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatStoredCorrectionForDisplay } from '@/utils/analysis/buildAnalysisCorrectionDiff'

export const CORRECTION_LONG_WAIT_MS = 10 * 60 * 1000

function DiffChip({ children, variant = 'neutral' }) {
  const styles = {
    added: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    removed: 'bg-rose-50 text-rose-800 border-rose-200',
    changed: 'bg-amber-50 text-amber-800 border-amber-200',
    neutral: 'bg-slate-50 text-slate-700 border-slate-200',
  }
  return (
    <Badge variant="outline" className={cn('text-[10px] font-semibold uppercase tracking-wide', styles[variant])}>
      {children}
    </Badge>
  )
}

function StoredCorrectionChips({ storedDisplay }) {
  const hasChips =
    storedDisplay.update_risk != null ||
    storedDisplay.add?.['AI violations']?.length > 0 ||
    storedDisplay.remove?.['AI violations']?.length > 0 ||
    storedDisplay.add?.['legal violations']?.length > 0 ||
    storedDisplay.remove?.['legal violations']?.length > 0

  if (!hasChips) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {storedDisplay.update_risk != null && (
        <DiffChip variant="changed">Risk → {storedDisplay.update_risk}</DiffChip>
      )}
      {storedDisplay.add?.['AI violations']?.map((v) => (
        <DiffChip key={`add-${v}`} variant="added">+ {v}</DiffChip>
      ))}
      {storedDisplay.remove?.['AI violations']?.map((v) => (
        <DiffChip key={`rem-${v}`} variant="removed">- {v}</DiffChip>
      ))}
      {storedDisplay.add?.['legal violations']?.map((c) => (
        <DiffChip key={`legal-add-${c}`} variant="added">+ Legal: {c}</DiffChip>
      ))}
      {storedDisplay.remove?.['legal violations']?.map((c) => (
        <DiffChip key={`legal-rem-${c}`} variant="removed">- Legal: {c}</DiffChip>
      ))}
    </div>
  )
}

function useElapsedMs(sinceIso, active) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!sinceIso || !active) {
      setElapsed(0)
      return undefined
    }

    const compute = () => {
      const start = new Date(sinceIso).getTime()
      if (Number.isNaN(start)) {
        setElapsed(0)
        return
      }
      setElapsed(Math.max(0, Date.now() - start))
    }

    compute()
    const interval = setInterval(compute, 1000)
    return () => clearInterval(interval)
  }, [sinceIso, active])

  return elapsed
}

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min >= 60) {
    const hr = Math.floor(min / 60)
    const remMin = min % 60
    return `${hr}h ${remMin}m`
  }
  return `${min}m ${String(sec).padStart(2, '0')}s`
}

function StatusBadge({ status }) {
  if (status === 'pending') {
    return <Badge variant="outline" className="text-[10px] font-bold bg-slate-100 text-slate-700 border-slate-200">Queued</Badge>
  }
  if (status === 'processing') {
    return <Badge variant="outline" className="text-[10px] font-bold bg-amber-50 text-amber-800 border-amber-200">Updating analysis</Badge>
  }
  return null
}

function ConfirmModal({ open, title, description, confirmLabel, confirmClassName, onConfirm, onCancel, isPending }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isPending && onCancel()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto animate-in zoom-in-95 fade-in duration-200 overflow-hidden p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">{description}</p>
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending} className="flex-1 font-semibold">
            Go back
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isPending} className={cn('flex-1 font-bold', confirmClassName)}>
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function AnalysisCorrectionPanel({
  diff,
  prompt,
  onPromptChange,
  onSubmit,
  isPending,
  isCorrectionPolling,
  pollTimedOut,
  correctionInFlight,
  activeCorrectionRequest,
  failedCorrectionRequest,
  onCheckStatus,
  isCheckingStatus,
  onRestartCorrection,
  isRestarting,
  onCancelCorrection,
  isCancelling,
  onTryAgain,
  onDismissFailure,
  hasAnalysis,
  hasReview,
  disabled,
}) {
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const isActiveInFlight =
    correctionInFlight &&
    (activeCorrectionRequest?.status === 'pending' || activeCorrectionRequest?.status === 'processing')

  const storedDisplay = useMemo(
    () => formatStoredCorrectionForDisplay(activeCorrectionRequest?.correction),
    [activeCorrectionRequest?.correction]
  )

  const failedDisplay = useMemo(
    () => formatStoredCorrectionForDisplay(failedCorrectionRequest?.correction),
    [failedCorrectionRequest?.correction]
  )

  const elapsedMs = useElapsedMs(activeCorrectionRequest?.requested_at, isActiveInFlight)
  const showLongWaitActions = isActiveInFlight && elapsedMs >= CORRECTION_LONG_WAIT_MS

  if (!hasAnalysis) return null

  const canSubmit =
    (diff?.hasChanges || prompt?.trim()) &&
    !isPending &&
    !isCorrectionPolling &&
    !disabled &&
    !correctionInFlight

  const hasWorkerChanges = diff?.hasChanges
  const extraSummary = (diff?.summary || []).filter((line) => line.includes('add to note') || line.includes('AIGC'))

  const isCancelledFailure = failedCorrectionRequest?.error === 'Cancelled by reviewer'

  const panelTone = isActiveInFlight
    ? 'border-amber-200/80 bg-white shadow-sm'
    : failedCorrectionRequest && !isActiveInFlight
      ? 'border-rose-200/80 bg-white shadow-sm'
      : 'border-violet-100 bg-violet-50/40 shadow-sm'

  return (
    <section className="space-y-3" aria-live="polite">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold',
            isActiveInFlight
              ? 'bg-amber-100 text-amber-700'
              : failedCorrectionRequest && !isActiveInFlight
                ? 'bg-rose-100 text-rose-600'
                : 'bg-violet-100 text-violet-700'
          )}
        >
          {isActiveInFlight ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : failedCorrectionRequest && !isActiveInFlight ? (
            <XCircle className="w-3.5 h-3.5" />
          ) : (
            <Wand2 className="w-3.5 h-3.5" />
          )}
        </span>
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">AI Correction</h3>
          {isActiveInFlight && <StatusBadge status={activeCorrectionRequest?.status} />}
        </div>
        {isActiveInFlight && (
          <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-slate-600 tabular-nums shrink-0">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            {formatElapsed(elapsedMs)}
          </span>
        )}
      </div>

      <div className={cn('rounded-xl p-4 border space-y-4', panelTone)}>
        {!isActiveInFlight && !failedCorrectionRequest && (
          <p className="text-xs text-slate-600 leading-relaxed">
            {hasReview
              ? 'Changes below compare your current form to the last AI analysis. Use Request AI Update to refresh AI reasoning while keeping your review workflow separate.'
              : 'Edit violations, legal codes, or risk above first. Detected changes are listed below — add a note only when the AI needs extra context.'}
          </p>
        )}

        {isActiveInFlight && (
          <>
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">
                Revising analysis from your submitted correction
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">
                Form edits are paused until this finishes. Usually ready in 1–3 minutes.
              </p>
              {activeCorrectionRequest?.requested_by && (
                <p className="text-[11px] text-slate-400 pt-0.5">
                  Requested by {activeCorrectionRequest.requested_by}
                  {activeCorrectionRequest.requested_at && (
                    <> · {formatDistanceToNow(new Date(activeCorrectionRequest.requested_at), { addSuffix: true })}</>
                  )}
                </p>
              )}
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Submitted correction</p>
              <StoredCorrectionChips storedDisplay={storedDisplay} />
              {storedDisplay.update_note && (
                <p className="text-xs text-slate-600 italic leading-relaxed border-l-2 border-slate-200 pl-2.5">
                  {storedDisplay.update_note}
                </p>
              )}
              {!storedDisplay.hasChanges && !storedDisplay.update_note && (
                <p className="text-xs text-slate-400 italic">No structured changes — note-only correction.</p>
              )}
            </div>

            {(pollTimedOut && !isCorrectionPolling) || showLongWaitActions ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
                {showLongWaitActions
                  ? 'This is taking longer than usual. Check status again, restart with the same correction, or cancel to unlock the form.'
                  : 'Still working — use Check correction status to query progress without reloading the case.'}
              </p>
            ) : null}

            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCheckStatus}
                  disabled={isCheckingStatus || isRestarting || isCancelling}
                  className="text-xs"
                >
                  {isCheckingStatus ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : null}
                  Check correction status
                </Button>
                {showLongWaitActions && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setConfirmRestart(true)}
                      disabled={isCheckingStatus || isRestarting || isCancelling}
                      className="text-xs bg-violet-600 hover:bg-violet-700 text-white"
                    >
                      {isRestarting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
                      Restart correction
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmCancel(true)}
                      disabled={isCheckingStatus || isRestarting || isCancelling}
                      className="text-xs text-slate-600"
                    >
                      Cancel correction
                    </Button>
                  </>
                )}
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Checks correction progress and updated AI analysis only — does not reload the case or reset your review.
              </p>
            </div>
          </>
        )}

        {failedCorrectionRequest && !isActiveInFlight && (
          <>
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">
                {isCancelledFailure ? 'Correction cancelled' : 'Correction failed'}
                {failedCorrectionRequest.completed_at && (
                  <span className="font-normal text-slate-500">
                    {' '}· {formatDistanceToNow(new Date(failedCorrectionRequest.completed_at), { addSuffix: true })}
                  </span>
                )}
              </p>
              {failedCorrectionRequest.error && !isCancelledFailure && (
                <p className="text-xs text-rose-700 leading-relaxed">{failedCorrectionRequest.error}</p>
              )}
              {isCancelledFailure && (
                <p className="text-xs text-slate-500 leading-relaxed">
                  The form is unlocked. Any in-progress AI run for the previous request will be ignored.
                </p>
              )}
            </div>

            {failedDisplay.hasChanges && (
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Last submitted correction</p>
                <StoredCorrectionChips storedDisplay={failedDisplay} />
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100">
              <Button type="button" size="sm" onClick={onTryAgain} className="text-xs bg-violet-600 hover:bg-violet-700 text-white">
                Try again
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onDismissFailure} className="text-xs text-slate-600">
                Dismiss
              </Button>
            </div>
          </>
        )}

        {!isActiveInFlight && (
          <>
            {hasWorkerChanges || extraSummary.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {diff.update_risk != null && (
                  <DiffChip variant="changed">Risk → {diff.update_risk}</DiffChip>
                )}
                {diff.add?.['AI violations']?.map((v) => (
                  <DiffChip key={`add-${v}`} variant="added">+ {v}</DiffChip>
                ))}
                {diff.remove?.['AI violations']?.map((v) => (
                  <DiffChip key={`rem-${v}`} variant="removed">- {v}</DiffChip>
                ))}
                {diff.add?.['legal violations']?.map((c) => (
                  <DiffChip key={`legal-add-${c}`} variant="added">+ Legal: {c}</DiffChip>
                ))}
                {diff.remove?.['legal violations']?.map((c) => (
                  <DiffChip key={`legal-rem-${c}`} variant="removed">- Legal: {c}</DiffChip>
                ))}
                {extraSummary.map((line, i) => (
                  <DiffChip key={`extra-${i}`} variant="neutral">{line}</DiffChip>
                ))}
              </div>
            ) : (
              !failedCorrectionRequest && (
                <p className="text-xs text-slate-400 italic">
                  No changes from AI baseline — adjust violations, risk, or legal codes in the sections above.
                </p>
              )
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Update note for AI (optional)
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => onPromptChange(e.target.value)}
                placeholder="e.g. Not anti-India propaganda — add Violence for inflammatory genocide accusation..."
                disabled={isPending || isCorrectionPolling || disabled || correctionInFlight}
                className="min-h-[60px] bg-white border-violet-200 text-sm resize-y"
                rows={2}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit}
                className="bg-violet-600 hover:bg-violet-700 text-white font-bold shadow-sm"
              >
                {isPending || isCorrectionPolling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {isCorrectionPolling ? 'AI updating analysis...' : 'Submitting...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Request AI Update
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>

      <ConfirmModal
        open={confirmRestart}
        title="Restart this correction?"
        description="This sends the same correction to the AI queue again. If a previous run is still active, it will be replaced."
        confirmLabel="Restart"
        confirmClassName="bg-violet-600 hover:bg-violet-700 text-white"
        isPending={isRestarting}
        onCancel={() => setConfirmRestart(false)}
        onConfirm={async () => {
          await onRestartCorrection?.()
          setConfirmRestart(false)
        }}
      />

      <ConfirmModal
        open={confirmCancel}
        title="Cancel this correction?"
        description="The form will unlock. Any in-progress AI run for this request will be ignored."
        confirmLabel="Cancel correction"
        confirmClassName="bg-rose-600 hover:bg-rose-700 text-white"
        isPending={isCancelling}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={async () => {
          await onCancelCorrection?.()
          setConfirmCancel(false)
        }}
      />
    </section>
  )
}
