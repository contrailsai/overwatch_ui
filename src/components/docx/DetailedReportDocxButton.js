'use client'

import React, { useEffect } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { sendGAEvent } from '@next/third-parties/google';
import { useDocxExport } from './useDocxExport';
import { useClient } from '@/context/ClientContext';
import posthog from 'posthog-js';
import { trackClientActivity } from '@/utils/supabase/metrics';

export function DetailedReportDocxButton({ posts, project, className, onStateChange }) {
    const { clientDetails } = useClient();
    const { exportDocx, loading, statusText } = useDocxExport();

    // Propagate loading state up (same contract as the PDF detailed button)
    useEffect(() => {
        onStateChange?.({ loading, statusText: loading ? (statusText || 'Generating DOCX...') : '' });
    }, [loading, statusText, onStateChange]);

    const handleDownload = async () => {
        posthog.capture('Report Downloaded', { type: 'Detailed Case Report', format: 'docx', count: posts?.length || 0 });
        sendGAEvent('event', 'download_detailed_cases_report_docx', {
            event_id: 'detailed_cases_report_docx',
            status: 'downloading'
        });

        if (clientDetails?.id && project?.project_name) {
            trackClientActivity(clientDetails.id, project.project_name, 'report_download', 'detailed_docx', clientDetails.email);
        }

        await exportDocx({
            posts,
            project,
            reportType: 'Detailed',
            fileNamePrefix: 'Detailed_Report',
            gaEventName: 'download_detailed_cases_report_docx'
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
                <FileText className="w-4 h-4" />
            )}
            {loading ? 'Preparing...' : 'Export Detailed DOCX'}
        </button>
    );
}
