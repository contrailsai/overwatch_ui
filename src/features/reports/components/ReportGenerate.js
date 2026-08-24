'use client'

import { useState, useId, useMemo } from 'react'
import { Loader2, DownloadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { ReportExportButton } from '@/features/reports/components/ReportExportButton'

const FORMAT_OPTIONS = [
  { id: 'summary-pdf', label: 'PDF', sub: 'Sum', compactLabel: 'Summary', preset: 'summaryPdf', downloadLabel: 'Summary PDF' },
  { id: 'detailed-pdf', label: 'PDF', sub: 'Det', compactLabel: 'Detail PDF', preset: 'detailedPdf', downloadLabel: 'Detailed PDF' },
  { id: 'detailed-docx', label: 'DOCX', sub: 'Det', compactLabel: 'Detail DOCX', preset: 'detailedDocx', downloadLabel: 'Detailed DOCX' },
]

function ExportProgress({ statusText, className }) {
  const pctMatch = statusText?.match(/(\d+)\s*%/)
  const pct = pctMatch ? Number(pctMatch[1]) : null
  const hasPct = pct != null && !Number.isNaN(pct)

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Loader2 className="w-3 h-3 text-blue-600 animate-spin shrink-0" />
          <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wide truncate">
            {hasPct ? `Exporting ${pct}%` : 'Preparing export…'}
          </span>
        </div>
        {hasPct && (
          <span className="text-[10px] font-bold text-blue-700 tabular-nums shrink-0">
            {pct}%
          </span>
        )}
      </div>
      <div className="h-1 w-full bg-blue-100 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full bg-blue-600 rounded-full transition-all duration-500 ease-out',
            !hasPct && 'animate-pulse',
          )}
          style={{ width: hasPct ? `${Math.min(100, Math.max(4, pct))}%` : '40%' }}
        />
      </div>
      {statusText && !hasPct && (
        <p className="text-[9px] font-medium text-slate-500 truncate">{statusText}</p>
      )}
    </div>
  )
}

export default function ReportGenerate({
  selectedPostsArray,
  selectedCount,
  summaryState,
  detailedPdfState,
  detailedDocxState,
  setSummaryState,
  setDetailedPdfState,
  setDetailedDocxState,
  showToast,
  trackClientClick,
  project,
  showLabel = true,
  compact = false,
  toolbar = false,
  formatIds,
  entityLabel = 'cases',
  entityType,
  analyticsPage = 'CasesList',
}) {
  const idPrefix = useId()
  const availableFormats = useMemo(
    () => (formatIds ? FORMAT_OPTIONS.filter((f) => formatIds.includes(f.id)) : FORMAT_OPTIONS),
    [formatIds]
  )
  const [selectedFormat, setSelectedFormat] = useState(availableFormats[0]?.id || 'summary-pdf')
  const [downloadClicked, setDownloadClicked] = useState(false)

  const isLoading = summaryState.loading || detailedPdfState.loading || detailedDocxState.loading
  const currentState = summaryState.loading
    ? summaryState
    : detailedPdfState.loading
      ? detailedPdfState
      : detailedDocxState

  const selectedOption = availableFormats.find((f) => f.id === selectedFormat) ?? availableFormats[0]
  const activeFormatId = selectedOption?.id || 'summary-pdf'
  const formatGridCols = availableFormats.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
  const showProgress = isLoading && downloadClicked

  const onStateByFormat = {
    'summary-pdf': setSummaryState,
    'detailed-pdf': setDetailedPdfState,
    'detailed-docx': setDetailedDocxState,
  }

  const hiddenExportButtons = (
    <div className="hidden">
      {availableFormats.map((f) => (
        <div key={f.id} id={`${idPrefix}-btn-${f.id}`}>
          <ReportExportButton
            preset={f.preset}
            posts={selectedPostsArray}
            project={project}
            entityType={entityType}
            onStateChange={onStateByFormat[f.id]}
          />
        </div>
      ))}
    </div>
  )

  const handleDownload = () => {
    if (selectedCount === 0) {
      showToast(`Please select some ${entityLabel} before exporting`, 'error')
      return
    }
    setDownloadClicked(true)
    document.getElementById(`${idPrefix}-btn-${activeFormatId}`)?.querySelector('button')?.click()
    trackClientClick(`export_${activeFormatId}`, { page: analyticsPage })
  }

  if (toolbar) {
    return (
      <div className="flex shrink-0 flex-col gap-1.5 min-w-0">
        <div className={cn('flex shrink-0 flex-wrap items-center gap-2', isLoading && 'opacity-60')}>
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {availableFormats.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFormat(f.id)}
                disabled={isLoading}
                title={f.downloadLabel}
                aria-label={f.downloadLabel}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap',
                  activeFormatId === f.id
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {f.compactLabel}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={isLoading}
            title="Download report"
            className="h-9 gap-1.5 bg-blue-600 px-3 text-white hover:bg-blue-700 border border-blue-600"
          >
            {showProgress ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <DownloadIcon className="w-4 h-4" />
            )}
            <span className="text-xs font-bold">{showProgress ? 'Exporting' : 'Export'}</span>
          </Button>
        </div>
        {showProgress && (
          <ExportProgress statusText={currentState.statusText} className="px-0.5" />
        )}
        {hiddenExportButtons}
      </div>
    )
  }

  if (compact) {
    return (
      <div className="shrink-0 flex flex-col gap-1.5 min-w-0 w-full max-w-full">
        <div className="flex items-center gap-1 min-w-0">
          <div
            className={cn(
              'flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200 min-w-0',
              isLoading && 'opacity-60 pointer-events-none'
            )}
          >
            {availableFormats.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFormat(f.id)}
                disabled={isLoading}
                title={f.downloadLabel}
                aria-label={f.downloadLabel}
                className={cn(
                  'px-1.5 py-1 rounded-md text-[9px] font-bold leading-tight text-center transition-all cursor-pointer whitespace-nowrap',
                  activeFormatId === f.id
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500'
                )}
              >
                {f.compactLabel}
              </button>
            ))}
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDownload}
            disabled={isLoading}
            title={showProgress ? 'Exporting report…' : 'Download report'}
            className="h-8 w-8 shrink-0 bg-blue-600 hover:bg-blue-700 text-white rounded-lg border border-blue-600"
          >
            {showProgress ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <DownloadIcon className="w-4 h-4" />
            )}
          </Button>
        </div>
        {showProgress && (
          <ExportProgress
            statusText={currentState.statusText}
            className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-1.5"
          />
        )}
        {hiddenExportButtons}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2 shrink-0 w-full p-2 rounded-xl border transition-colors duration-200',
        showProgress
          ? 'bg-white border-blue-200 shadow-sm'
          : 'bg-white border-slate-200 shadow-sm hover:border-slate-300',
        showLabel ? 'max-w-[280px]' : 'w-auto max-w-full'
      )}
    >
      {showLabel && !showProgress && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] uppercase font-black text-slate-500 tracking-wider">
              Download {selectedOption?.downloadLabel}
            </Label>
          </div>
        </div>
      )}

      {showProgress ? (
        <ExportProgress statusText={currentState.statusText} className="px-0.5 py-0.5" />
      ) : (
        <div className="flex w-full items-stretch gap-2 h-11">
          <div
            className={cn(
              'flex-1 grid gap-1 bg-slate-100 p-1 rounded-xl transition-all duration-300',
              formatGridCols,
            )}
          >
            {availableFormats.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFormat(f.id)}
                disabled={isLoading}
                className={cn(
                  'flex flex-col items-center justify-center py-1 transition-all rounded-lg cursor-pointer border',
                  activeFormatId === f.id
                    ? 'bg-white border-white text-blue-600 shadow-sm scale-[1.02] z-10'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/50'
                )}
              >
                <span className="text-[10px] font-black leading-tight uppercase">{f.label}</span>
                <span className="text-[8px] font-bold opacity-60 leading-tight uppercase tracking-tighter">
                  {f.sub}
                </span>
              </button>
            ))}
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleDownload}
            disabled={isLoading}
            className={cn(
              'flex flex-col items-center justify-center w-11 h-11 p-0 transition-all rounded-xl cursor-pointer border shadow-sm shrink-0',
              'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 hover:border-blue-700 active:scale-95 disabled:opacity-50'
            )}
          >
            <DownloadIcon className="w-5 h-5" />
          </Button>
        </div>
      )}

      {hiddenExportButtons}
    </div>
  )
}
