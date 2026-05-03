'use client'

import React from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button"
import { usePdfExport } from './usePdfExport';
import posthog from 'posthog-js';
import { useClient } from '@/context/ClientContext';
import { trackClientActivity } from '@/utils/supabase/metrics';

export function CaseExportButton({ post, project }) {
    const { exportPdf, loading, statusText } = usePdfExport();
    const { clientDetails } = useClient();

    if (!post) return null;

    const handleDownload = () => {
        posthog.capture('Report Downloaded', { type: 'Single Case Report', format: 'pdf', caseId: post._id });

        if (clientDetails?.id && project?.project_name) {
            trackClientActivity(clientDetails.id, project.project_name, 'report_download', 'single_case_pdf', clientDetails.email);
        }

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
            className="gap-2 cursor-pointer disabled:cursor-not-allowed border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-100 transition-all font-semibold shadow-sm h-auto min-h-[32px] py-1.5"
        >
            {loading ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
                <FileDown className="w-4 h-4 shrink-0" />
            )}
            <span className="whitespace-pre-line text-left leading-snug">
                {loading ? statusText || 'Preparing...' : 'Download Content Report'}
            </span>
        </Button>
    );
}
