import { useState, useEffect } from 'react';
import { sendGAEvent } from '@next/third-parties/google';
import { getReportDownloadUrl, getOrCreateReportJob } from '@/app/(dashboard)/cases/pdf_actions';
import { createClient } from '@/utils/supabase/client';

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

            // 1. Get or create the report job in the database
            const jobData = await getOrCreateReportJob({ posts, project, profile, reportType });
            
            if (!jobData || !jobData.jobId) {
                throw new Error('Failed to initiate PDF generation');
            }

            let s3Url = jobData.s3Path;

            // 2. If not already complete, listen for realtime updates
            if (!s3Url) {
                setStatusText(jobData.status || 'Waiting in queue...');
                
                const supabase = createClient();
                s3Url = await new Promise((resolve, reject) => {
                    let retryCount = 0;
                    
                    const subscribeToChannel = () => {
                        const channel = supabase.channel(`report-${jobData.jobId}-${retryCount}`)
                            .on(
                                'postgres_changes',
                                {
                                    event: 'UPDATE',
                                    schema: 'public',
                                    table: 'reports_generation',
                                    filter: `id=eq.${jobData.jobId}`
                                },
                                (payload) => {
                                    const newStatus = payload.new.status;
                                    if (newStatus) {
                                        setStatusText(newStatus);
                                    }
                                    
                                    if (payload.new.s3_path) {
                                        setStatusText('100% - Complete!');
                                        supabase.removeChannel(channel);
                                        resolve(payload.new.s3_path);
                                    } else if (newStatus && newStatus.toLowerCase().includes('failed')) {
                                        supabase.removeChannel(channel);
                                        reject(new Error('An error occurred while creating the PDF'));
                                    }
                                }
                            )
                            .subscribe((status) => {
                                if (status === 'CHANNEL_ERROR') {
                                    console.error('Subscription failed, retrying...');
                                    supabase.removeChannel(channel);
                                    if (retryCount < 3) {
                                        retryCount++;
                                        setTimeout(subscribeToChannel, 1000 * retryCount);
                                    } else {
                                        reject(new Error('An error occurred while creating the PDF'));
                                    }
                                }
                            });
                            
                        // Add a timeout fallback just in case Lambda dies without updating status (wait 5 minutes)
                        setTimeout(() => {
                            supabase.removeChannel(channel);
                            reject(new Error('An error occurred while creating the PDF'));
                        }, 5 * 60 * 1000);
                    };

                    subscribeToChannel();
                });
            }

            if (!s3Url) {
                throw new Error('An error occurred while creating the PDF');
            }

            setStatusText('Preparing download...');
            const fileName = `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.pdf`;
            
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
