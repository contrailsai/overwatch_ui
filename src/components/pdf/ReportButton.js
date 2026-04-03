'use client'

import React from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { usePdfExport } from './usePdfExport';

export function ReportButton({ posts, project, className }) {
  const { exportPdf, loading, statusText } = usePdfExport();

  const handleDownload = () => {
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
      className={className || "flex cursor-pointer items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <FileDown className="w-4 h-4" />
      )}
      {loading ? statusText || 'Preparing...' : 'Export Summary Report'}
    </button>
  );
}
