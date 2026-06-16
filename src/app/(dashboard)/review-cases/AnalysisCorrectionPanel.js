'use client'

import { Loader2, Sparkles, Wand2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

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

export default function AnalysisCorrectionPanel({
  diff,
  prompt,
  onPromptChange,
  onSubmit,
  isPending,
  isCorrectionPolling,
  pollTimedOut,
  correctionInFlight,
  onManualRefresh,
  onResumePolling,
  hasAnalysis,
  hasReview,
  disabled,
}) {
  if (!hasAnalysis) return null

  const blockedByInFlight = correctionInFlight && !isCorrectionPolling && !isPending
  const canSubmit =
    (diff?.hasChanges || prompt?.trim()) &&
    !isPending &&
    !isCorrectionPolling &&
    !disabled &&
    !correctionInFlight

  const hasWorkerChanges = diff?.hasChanges
  const extraSummary = (diff?.summary || []).filter((line) => line.includes('add to note') || line.includes('AIGC'))

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold">
          <Wand2 className="w-3.5 h-3.5" />
        </span>
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">AI Correction</h3>
      </div>

      <div className="bg-violet-50/40 rounded-xl p-4 border border-violet-100 shadow-sm space-y-4">
        <p className="text-xs text-slate-600 leading-relaxed">
          {hasReview
            ? 'Changes below compare your current form to the last AI analysis. Use Request AI Update to refresh AI reasoning while keeping your review workflow separate.'
            : 'Edit violations, legal codes, or risk above first. Detected changes are listed below — add a note only when the AI needs extra context.'}
        </p>

        {correctionInFlight && (isCorrectionPolling || pollTimedOut) && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50/80 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">
                {isCorrectionPolling ? 'AI is updating analysis…' : 'Still waiting on the AI worker'}
              </p>
              <p className="text-amber-800/90 leading-relaxed">
                {pollTimedOut
                  ? 'This is taking longer than usual. The correction may still be running server-side — use Refresh to check again.'
                  : 'Form edits are locked until the update completes or fails.'}
              </p>
            </div>
          </div>
        )}

        {blockedByInFlight && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onManualRefresh} className="text-xs">
              Check status
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onResumePolling} className="text-xs">
              Resume waiting
            </Button>
          </div>
        )}

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
          <p className="text-xs text-slate-400 italic">
            No changes from AI baseline — adjust violations, risk, or legal codes in the sections above.
          </p>
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

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
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

          {pollTimedOut && isCorrectionPolling === false && correctionInFlight && (
            <Button type="button" variant="outline" size="sm" onClick={onManualRefresh} className="text-xs">
              Refresh status
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
