'use client'

import React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { usePdfExport } from './usePdfExport';
import posthog from 'posthog-js';
import { useClient } from '@/context/ClientContext';
import { trackClientActivity } from '@/utils/supabase/metrics';

export function ProfileExportButton({ profile, project, className }) {
    const { exportPdf, loading, statusText } = usePdfExport();
    const { clientDetails } = useClient();

    const handleDownload = () => {
        posthog.capture('Report Downloaded', { type: 'Profile Report', format: 'pdf', profileId: profile?._id });

        if (clientDetails?.id && project?.project_name) {
            trackClientActivity(clientDetails.id, project.project_name, 'report_download', 'profile_pdf', clientDetails.email);
        }

        // profile.posts contains the array of post IDs
        // We pass the profile object so the server can extract metadata like profile pic
        exportPdf({
            posts: profile.posts.map(id => ({ _id: id })), // Wrap IDs in objects
            project,
            profile,
            reportType: 'Profile',
            fileNamePrefix: `Profile_Report_${profile?.username || profile?._id}`,
            gaEventName: 'download_profile_report_pdf'
        });
    };

    return (
        <button
            disabled={loading}
            className={className || "w-full cursor-pointer rounded-xl border-2 border-slate-200 text-slate-500 hover:border-blue-500 hover:text-blue-600 flex items-center justify-center gap-2 font-bold transition-all bg-white py-2 disabled:cursor-not-allowed disabled:opacity-50 h-auto min-h-[44px]"}
            onClick={handleDownload}
        >
            {loading ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
                <Download className="w-4 h-4 shrink-0" />
            )}
            <span className="whitespace-pre-line text-left leading-snug">
                {loading ? statusText || 'Preparing Report...' : 'Download PDF Report'}
            </span>
        </button>
    );
}

export default ProfileExportButton;
