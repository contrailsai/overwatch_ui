'use client'

import React from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button"
import { usePdfExport } from './usePdfExport';

export function CaseExportButton({ post, project }) {
    const { exportPdf, loading, statusText } = usePdfExport();

    if (!post) return null;

    const handleDownload = () => {
        exportPdf({
            posts: [post],
            project,
            reportType: 'Single',
            fileNamePrefix: `Case_${post._id}`,
            gaEventName: 'download_single_case_report'
        });
    };

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={handleDownload}
            className="gap-2 cursor-pointer disabled:cursor-not-allowed border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-100 transition-all font-semibold shadow-sm h-8"
        >
            {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <FileDown className="w-4 h-4" />
            )}
            {loading ? statusText || 'Preparing...' : 'Download Content Report'}
        </Button>
    );
}
