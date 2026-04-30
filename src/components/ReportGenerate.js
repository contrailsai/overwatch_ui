'use client'

// IMPORT UI THINGS 
// import { Skeleton } from "@/components/ui/skeleton"
import { useState, useId } from 'react'
import {
  Loader2,
  DownloadIcon
} from 'lucide-react'


import { ReportButton } from '@/components/pdf/ReportButton'
import { DetailedReportButton } from '@/components/pdf/DetailedReportButton'
import { DetailedReportDocxButton } from '@/components/docx/DetailedReportDocxButton'
import { Button } from "@/components/ui/button"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

 export default function ReportGenerate({ selectedPostsArray, selectedCount, summaryState, detailedPdfState, detailedDocxState, setSummaryState, setDetailedPdfState, setDetailedDocxState, showToast, trackClientClick, project, showLabel = true }) {
  const idPrefix = useId();
  const [selectedFormat, setSelectedFormat] = useState('summary-pdf');
  const [downloadClicked, setDownloadClicked] = useState(false);
  
  const isLoading = summaryState.loading || detailedPdfState.loading || detailedDocxState.loading;
  const currentState = summaryState.loading ? summaryState : (detailedPdfState.loading ? detailedPdfState : detailedDocxState);

  const handleDownload = () => {
    
    if (selectedCount === 0) {
      showToast("Please select some cases before exporting", "error");
      return;
    }
    setDownloadClicked(true);
    const btnId = `${idPrefix}-btn-${selectedFormat}`;
    const container = document.getElementById(btnId);
    const actualButton = container?.querySelector('button');
    if (actualButton) {
      actualButton.click();
      trackClientClick(`export_${selectedFormat}`, { page: 'CasesList' });
    }
  };

  return (
    <div className={cn(
      "flex flex-col gap-2 shrink-0 w-full lg:ml-auto p-2 rounded-2xl border transition-all duration-300 lg:min-w-[240px]",
      isLoading 
        ? "bg-blue-50/50 border-blue-200 shadow-sm" 
        : "bg-white border-slate-200 shadow-sm hover:border-slate-300",
      showLabel ? "max-w-[280px]" : "w-auto"
    )}>
      <div className="flex items-center justify-between px-1">
         <div className="flex items-center gap-1.5">
           <Label className="text-[10px] uppercase font-black text-slate-500 tracking-wider">
            Download {selectedFormat === 'summary-pdf' ? 'Summary PDF' : (selectedFormat === 'detailed-pdf' ? 'Detailed PDF' : 'Detailed DOCX')}
           </Label>
         </div>
      </div>
      
      <div className="flex w-full items-stretch gap-2 h-11">
        <div className={cn("flex-1 grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl transition-all duration-300", isLoading && "opacity-50 pointer-events-none")}>
          {[
            { id: 'summary-pdf', label: 'PDF', sub: 'Sum' },
            { id: 'detailed-pdf', label: 'PDF', sub: 'Det' },
            { id: 'detailed-docx', label: 'DOCX', sub: 'Det' }
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFormat(f.id)}
              disabled={isLoading}
              className={cn(
                "flex flex-col items-center justify-center py-1 transition-all rounded-lg cursor-pointer border",
                selectedFormat === f.id
                  ? "bg-white border-white text-blue-600 shadow-sm scale-[1.02] z-10"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
            >
              <span className="text-[10px] font-black leading-tight uppercase">{f.label}</span>
              <span className="text-[8px] font-bold opacity-60 leading-tight uppercase tracking-tighter">{f.sub}</span>
            </button>
          ))}
        </div>
        
        <Button 
          size="sm" 
          variant="ghost"
          onClick={handleDownload}
          disabled={isLoading}
          className={cn(
            "flex flex-col items-center justify-center w-11 h-11 p-0 transition-all rounded-xl cursor-pointer border shadow-sm shrink-0",
            "bg-blue-600 border-blue-600 text-white hover:bg-blue-700 hover:border-blue-700 active:scale-95 disabled:opacity-50"
          )}
        >
          <DownloadIcon className="w-5 h-5" />
        </Button>
      </div>

      {/* <div className="flex-1 flex flex-col justify-end min-h-[36px]"> */}
        {(isLoading && downloadClicked) && (
          <div className="flex flex-col gap-1.5 p-1 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                  Downloading...
                </span>
              </div>
              {currentState.statusText?.includes('%') && (
                <span className="text-[10px] font-black text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">
                  {currentState.statusText.match(/\d+/)?.[0]}%
                </span>
              )}
            </div>
            
            <div className="space-y-1.5">
              <div className="h-1.5 w-full bg-blue-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 transition-all duration-700 ease-out"
                  style={{ 
                    width: currentState.statusText?.includes('%') 
                      ? currentState.statusText.match(/\d+/)?.[0] + '%' 
                      : '100%',
                    animation: !currentState.statusText?.includes('%') ? 'pulse 2s infinite' : 'none'
                  }}
                />
              </div>
              <p className="text-[9px] font-bold text-blue-600/80 uppercase tracking-tight truncate">
                {currentState.statusText || 'Preparing assets...'}
              </p>
            </div>
          </div>
        )}
      {/* </div> */}

      {/* Hidden Actual Buttons to preserve their logic */}
      <div className="hidden">
        <div id={`${idPrefix}-btn-summary-pdf`}>
          <ReportButton
            posts={selectedPostsArray}
            project={project}
            onStateChange={setSummaryState}
          />
        </div>
        <div id={`${idPrefix}-btn-detailed-pdf`}>
          <DetailedReportButton
            posts={selectedPostsArray}
            project={project}
            onStateChange={setDetailedPdfState}
          />
        </div>
        <div id={`${idPrefix}-btn-detailed-docx`}>
          <DetailedReportDocxButton
            posts={selectedPostsArray}
            project={project}
            onStateChange={setDetailedDocxState}
          />
        </div>
      </div>
    </div>
  )
}