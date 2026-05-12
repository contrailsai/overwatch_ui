import { useState, useEffect } from 'react';
import { sendGAEvent } from '@next/third-parties/google';
import { getReportDownloadUrl, getOrCreateReportJob } from '@/app/(dashboard)/cases/pdf_actions';
import { createClient } from '@/utils/supabase/client';
import { isReportSuccess } from '@/utils/reports/report-generation-status';
import { waitForReportGenerationRow } from '@/utils/reports/waitForReportGenerationRow';

export function usePdfExport() {
    const [loading, setLoading] = useState(false);
    const [statusText, setStatusText] = useState('');

    useEffect(() => {
        if (!loading || !statusText || statusText.includes('(please wait...)') || statusText.includes('Complete!')) return;
        
        const timer = setTimeout(() => {
            setStatusText(prev => prev + '\n(please wait...)');
        }, 30000);
        
        return () => clearTimeout(timer);
    }, [statusText, loading]);

    const exportPdf = async ({ posts, project, profile, reportType, fileNamePrefix, gaEventName }) => {
        if (!posts || posts.length === 0) return;
        
        try {
            setLoading(true);
            setStatusText('Initializing...');

            const jobData = await getOrCreateReportJob({ posts, project, profile, reportType });
            
            if (!jobData || !jobData.jobId) {
                throw new Error('Failed to initiate PDF generation');
            }

            let s3Url =
                jobData.s3Path && isReportSuccess(jobData.s3Path, jobData.status)
                    ? jobData.s3Path
                    : null;

            if (!s3Url) {
                setStatusText(jobData.status || '[0%] Queued');
                const supabase = createClient();
                s3Url = await waitForReportGenerationRow(supabase, {
                    jobId: jobData.jobId,
                    channelPrefix: 'report',
                    initialStatus: jobData.status,
                    initialS3Path: jobData.s3Path,
                    onStatus: (s) => setStatusText(s),
                    timeoutMessage: 'An error occurred while creating the PDF',
                    failureMessageFallback: 'An error occurred while creating the PDF',
                    telemetry: { reportFormat: 'pdf', reportType },
                });
            }

            if (!s3Url) {
                throw new Error('An error occurred while creating the PDF');
            }

            setStatusText('Preparing download...');
            const fileName = `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.pdf`;
            
            const signedUrl = await getReportDownloadUrl(s3Url, fileName);

            if (!signedUrl) {
                throw new Error('Failed to sign download URL');
            }

            const a = document.createElement('a');
            a.href = signedUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            if (gaEventName) {
                sendGAEvent('event', gaEventName, {
                    event_id: reportType.toLowerCase() + '_report',
                    status: 'downloaded'
                });
            }

        } catch (error) {
            console.error('Report Generation Error:', error);
            alert('Failed to generate report: ' + (error.message || 'An error occurred while creating the PDF'));
        } finally {
            setLoading(false);
            setStatusText('');
        }
    };

    return { exportPdf, loading, statusText };
}
