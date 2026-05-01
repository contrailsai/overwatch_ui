'use client'

import React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { usePdfExport } from './usePdfExport';
import posthog from 'posthog-js';

export function ProfileExportButton({ profile, project, className }) {
    const { exportPdf, loading, statusText } = usePdfExport();

    const handleDownload = () => {
        posthog.capture('Report Downloaded', { type: 'Profile Report', format: 'pdf', profileId: profile?._id });
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
            className={className}
            onClick={handleDownload}
        >
            {loading ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
                <Download className="w-4 h-4 shrink-0" />
            )}
            <span className="whitespace-pre-line text-left leading-snug">
                {loading ? statusText || 'Preparing Report...' : 'PDF'}
            </span>
        </button>
    );
}

export default ProfileExportButton;
