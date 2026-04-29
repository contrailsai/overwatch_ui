'use client'

import React from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { usePdfExport } from './usePdfExport';
import posthog from 'posthog-js';

export function ReportButton({ posts, project, className, onStateChange }) {
  const { exportPdf, loading, statusText } = usePdfExport();

  React.useEffect(() => {
    onStateChange?.({ loading, statusText });
  }, [loading, statusText, onStateChange]);

  const handleDownload = () => {
    posthog.capture('Report Downloaded', { type: 'Summary Report', format: 'pdf', count: posts?.length || 0 });
    exportPdf({
      posts,
      project,
      reportType: 'Summary',
      fileNamePrefix: 'Overwatch_Report',
      gaEventName: 'download_summary_report'
    });
  };

  return (
    <button
      disabled={loading || posts?.length === 0}
      onClick={handleDownload}
      className={className || "flex cursor-pointer items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50 h-auto min-h-[38px]"}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        <FileDown className="w-4 h-4 shrink-0" />
      )}
      <span className="whitespace-pre-line text-left leading-snug">
        {loading ? statusText || 'Preparing...' : 'Export Summary PDF'}
      </span>
    </button>
  );
}
