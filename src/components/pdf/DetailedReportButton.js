'use client'

import React from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { usePdfExport } from './usePdfExport';

export function DetailedReportButton({ posts, project, className }) {
    const { exportPdf, loading, statusText } = usePdfExport();

    const handleDownload = () => {
        exportPdf({
            posts,
            project,
            reportType: 'Detailed',
            fileNamePrefix: 'Detailed_Report',
            gaEventName: 'download_detailed_report'
        });
    };

    return (
        <button
            onClick={handleDownload}
            disabled={loading || posts?.length === 0}
            className={className || "flex cursor-pointer items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50 h-auto min-h-[38px]"}
        >
            {loading ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
                <FileDown className="w-4 h-4 shrink-0" />
            )}
            <span className="whitespace-pre-line text-left leading-snug">
                {loading ? statusText || 'Generating PDF...' : 'Export Detailed Report'}
            </span>
        </button>
    );
}
