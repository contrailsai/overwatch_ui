import { useState, useEffect } from 'react';
import { sendGAEvent } from '@next/third-parties/google';
import { getReportDownloadUrl, getOrCreateDocxReportJob } from '@/app/(dashboard)/cases/docx_actions';
import { createClient } from '@/utils/supabase/client';

/**
 * useDocxExport – mirrors usePdfExport but for the DOCX pipeline.
 *
 * The service (`overwatch-pdf-creation-service`) accepts `reportFormat: 'docx'`
 * in the SQS / local backend payload, generates a DOCX buffer, uploads it to S3
 * and writes the S3 URL back to the `reports_generation` Supabase row.
 * This hook polls that row until the URL is available, then triggers a download.
 */
export function useDocxExport() {
    const [loading, setLoading] = useState(false);
    const [statusText, setStatusText] = useState('');

    useEffect(() => {
        if (!loading || !statusText || statusText.includes('(please wait...)') || statusText.includes('Complete!')) return;

        const timer = setTimeout(() => {
            setStatusText(prev => prev + '\n(please wait...)');
        }, 30000);

        return () => clearTimeout(timer);
    }, [statusText, loading]);

    const exportDocx = async ({ posts, project, profile, reportType, fileNamePrefix, gaEventName }) => {
        if (!posts || posts.length === 0) return;

        try {
            setLoading(true);
            setStatusText('Initializing...');

            // 1. Get or create the DOCX report job
            const jobData = await getOrCreateDocxReportJob({ posts, project, profile, reportType });

            if (!jobData || !jobData.jobId) {
                throw new Error('Failed to initiate DOCX generation');
            }

            let s3Url = jobData.s3Path;

            // 2. If not already complete, listen for realtime updates
            if (!s3Url) {
                setStatusText(jobData.status || 'Waiting in queue...');

                const supabase = createClient();
                s3Url = await new Promise((resolve, reject) => {
                    let retryCount = 0;
                    let isResolved = false;
                    let pollInterval;
                    let channel;
                    let consecutiveErrors = 0;
                    let timeoutId;

                    const cleanup = () => {
                        isResolved = true;
                        if (pollInterval) clearInterval(pollInterval);
                        if (channel) supabase.removeChannel(channel);
                        if (timeoutId) clearTimeout(timeoutId);
                    };

                    const checkStatus = async () => {
                        if (isResolved) return;
                        try {
                            const { data, error } = await supabase
                                .from('reports_generation')
                                .select('status, s3_path')
                                .eq('id', jobData.jobId)
                                .single();

                            if (error) throw error;

                            consecutiveErrors = 0;

                            if (data) {
                                if (data.status) setStatusText(data.status);
                                if (data.s3_path) {
                                    cleanup();
                                    setStatusText('100% - Complete!');
                                    resolve(data.s3_path);
                                } else if (data.status && data.status.toLowerCase().includes('failed')) {
                                    cleanup();
                                    reject(new Error(data.status || 'An error occurred while creating the DOCX'));
                                }
                            }
                        } catch (err) {
                            console.error('Error polling DOCX status:', err);
                            consecutiveErrors++;

                            if (consecutiveErrors >= 5) {
                                cleanup();
                                reject(new Error('Network connection lost or server unreachable. Please check your connection and try again.'));
                            } else if (consecutiveErrors >= 2) {
                                setStatusText(`Network issue, retrying... (${consecutiveErrors}/5)`);
                            }
                        }
                    };

                    pollInterval = setInterval(checkStatus, 3000);

                    const subscribeToChannel = () => {
                        if (isResolved) return;
                        channel = supabase.channel(`docx-report-${jobData.jobId}-${retryCount}`)
                            .on(
                                'postgres_changes',
                                {
                                    event: 'UPDATE',
                                    schema: 'public',
                                    table: 'reports_generation',
                                    filter: `id=eq.${jobData.jobId}`
                                },
                                (payload) => {
                                    if (isResolved) return;
                                    const newStatus = payload.new.status;
                                    if (newStatus) setStatusText(newStatus);

                                    if (payload.new.s3_path) {
                                        cleanup();
                                        setStatusText('100% - Complete!');
                                        resolve(payload.new.s3_path);
                                    } else if (newStatus && newStatus.toLowerCase().includes('failed')) {
                                        cleanup();
                                        reject(new Error('An error occurred while creating the DOCX'));
                                    }
                                }
                            )
                            .subscribe((status) => {
                                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                                    console.error(`DOCX subscription failed: ${status}, retrying...`);
                                    if (channel) supabase.removeChannel(channel);
                                    if (retryCount < 3 && !isResolved) {
                                        retryCount++;
                                        setTimeout(subscribeToChannel, 1000 * retryCount);
                                    } else if (!isResolved) {
                                        console.warn('Realtime connection failed for DOCX, falling back to polling');
                                    }
                                }
                            });

                        timeoutId = setTimeout(() => {
                            if (!isResolved) {
                                cleanup();
                                reject(new Error('An error occurred while creating the DOCX'));
                            }
                        }, 5 * 60 * 1000);
                    };

                    subscribeToChannel();
                });
            }

            if (!s3Url) {
                throw new Error('An error occurred while creating the DOCX');
            }

            setStatusText('Preparing download...');
            const fileName = `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.docx`;

            // 3. Sign URL for download
            const signedUrl = await getReportDownloadUrl(s3Url, fileName);

            if (!signedUrl) {
                throw new Error('Failed to sign download URL');
            }

            // 4. Trigger download
            const a = document.createElement('a');
            a.href = signedUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            if (gaEventName) {
                sendGAEvent('event', gaEventName, {
                    event_id: reportType.toLowerCase() + '_docx_report',
                    status: 'downloaded'
                });
            }

        } catch (error) {
            console.error('DOCX Report Generation Error:', error);
            alert('Failed to generate DOCX report: ' + (error.message || 'An error occurred while creating the DOCX'));
        } finally {
            setLoading(false);
            setStatusText('');
        }
    };

    return { exportDocx, loading, statusText };
}
