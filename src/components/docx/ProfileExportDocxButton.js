'use client'

import React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button"
import { sendGAEvent } from '@next/third-parties/google';
import { useDocxExport } from './useDocxExport';
import { useClient } from '@/context/ClientContext';
import posthog from 'posthog-js';
import { trackClientActivity } from '@/utils/supabase/metrics';

export function ProfileExportDocxButton({ profile, project, className }) {
    const { clientDetails } = useClient();
    const { exportDocx, loading } = useDocxExport();

    const handleDownload = async () => {
        posthog.capture('Report Downloaded', { type: 'Profile Report', format: 'docx', profileId: profile?._id });
        sendGAEvent('event', 'download_profile_report_docx', {
            event_id: 'profile_report_docx',
            status: 'downloading',
            profile_id: profile?._id
        });

        if (clientDetails?.id && project?.project_name) {
            trackClientActivity(clientDetails.id, project.project_name, 'report_download', 'profile_docx', clientDetails.email);
        }

        // Build a minimal posts array from the profile so the service can look
        // up the full post objects from MongoDB (same pattern as the PDF pipeline)
        const posts = (profile?.posts || []).map(id =>
            typeof id === 'string' ? { _id: id } : id
        );

        await exportDocx({
            posts,
            project,
            profile,
            reportType: 'Profile',
            fileNamePrefix: `Profile_Report_${profile?.username || profile?._id || 'unknown'}`,
            gaEventName: 'download_profile_report_docx'
        });
    };

    return (
        <Button
            variant="outline"
            disabled={loading}
            onClick={handleDownload}
            className={className}
        >
            {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <Download className="w-4 h-4 shrink-0" />
            )}
            {loading ? 'Preparing Report...' : 'DOCX'}
        </Button>
    );
}

export default ProfileExportDocxButton;
