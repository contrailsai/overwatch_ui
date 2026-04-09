import { useState } from 'react';
import { sendGAEvent } from '@next/third-parties/google';
import { getReportDownloadUrl } from '@/app/(dashboard)/cases/pdf_actions';

function getProgressMessage(progress) {
    if (!progress) return "Waiting in queue...";
    if (progress < 30) return "Fetching case data...";
    if (progress < 50) return "Processing images...";
    if (progress < 70) return "Rendering PDF...please wait";
    if (progress < 90) return "Uploading to secure storage...";
    if (progress < 100) return "Finalizing report...";
    return "Complete!";
}

export function usePdfExport() {
    const [loading, setLoading] = useState(false);
    const [statusText, setStatusText] = useState('');

    const exportPdf = async ({ posts, project, profile, reportType, fileNamePrefix, gaEventName }) => {
        if (!posts || posts.length === 0) return;
        
        try {
            setLoading(true);
            setStatusText('Initializing...');

            const postIds = posts.map(p => p._id);
            const pdfServiceUrl = process.env.NEXT_PUBLIC_PDF_SERVICE_URL || 'https://overwatch-pdf.contrails.ai';

            // 1. Trigger job
            const generateResponse = await fetch(`${pdfServiceUrl}/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    projectId: project?.project_name || 'unknown',
                    reportType: reportType,
                    database_name: project?.mongo_db_map,
                    postIds: postIds,
                    project: project,
                    profile: profile
                })
            });

            if (!generateResponse.ok) {
                throw new Error('Failed to initiate PDF generation');
            }

            const generateData = await generateResponse.json();
            
            let s3Url = null;

            if (generateData.status === 'completed' && generateData.url) {
                // Cache hit
                s3Url = generateData.url;
            } else if (generateData.status === 'processing' && generateData.jobId) {
                // Poll for completion
                setStatusText('Waiting in queue...');
                let jobStatus = 'processing';
                
                while (jobStatus === 'processing' || jobStatus === 'active' || jobStatus === 'waiting') {
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Poll every 1s
                    
                    const statusResponse = await fetch(`${pdfServiceUrl}/job-status/${generateData.jobId}`);
                    if (!statusResponse.ok) throw new Error('Failed to check job status');
                    
                    const statusData = await statusResponse.json();
                    jobStatus = statusData.status;
                    
                    if (jobStatus === 'processing' || jobStatus === 'active' || jobStatus === 'waiting') {
                        const prog = statusData.progress || 0;
                        setStatusText(`${prog}% - ${getProgressMessage(prog)}`);
                    }
                    
                    if (jobStatus === 'completed') {
                        setStatusText(`100% - Complete!`);
                        s3Url = statusData.url;
                        break;
                    } else if (jobStatus === 'failed') {
                        throw new Error(statusData.error || 'PDF generation failed on server');
                    }
                }
            } else {
                throw new Error('Unexpected response from PDF service');
            }

            if (!s3Url) {
                throw new Error('No valid PDF URL returned');
            }

            setStatusText('Preparing download...');
            const fileName = `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.pdf`;
            
            // 2. Sign URL for download
            const signedUrl = await getReportDownloadUrl(s3Url, fileName);

            if (!signedUrl) {
                throw new Error('Failed to sign download URL');
            }

            // 3. Trigger download
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
            alert('Failed to generate report: ' + error.message);
        } finally {
            setLoading(false);
            setStatusText('');
        }
    };

    return { exportPdf, loading, statusText };
}
