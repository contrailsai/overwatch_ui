'use client'

import React, { useState, useEffect } from 'react';
import { FileDown, Loader2, FileText } from 'lucide-react';
import { Button } from "@/components/ui/button"
import { sendGAEvent } from '@next/third-parties/google';
import { fetchAndCompressImage } from './CaseExportButton';
import { generateSingleCaseDocx } from './SingleCaseReportDocx';

export function CaseExportDocxButton({ post, project }) {
    const [imgState, setImgState] = useState({ compressedUrl: null, loading: true });
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const processImage = async () => {
            const sourceUrl = post?.signedImageUrl ||
                post?.image_url ||
                (post?.post_content?.media_urls?.[0]?.s3_url) ||
                (post?.media_urls?.[0]?.s3_url) ||
                (post?.post_content?.media_urls?.[0]?.original_url) ||
                null;

            if (sourceUrl) {
                const compressed = await fetchAndCompressImage(sourceUrl);
                if (isMounted) {
                    setImgState({ compressedUrl: compressed || sourceUrl, loading: false });
                }
            } else {
                if (isMounted) {
                    setImgState({ compressedUrl: null, loading: false });
                }
            }
        };
        processImage();
        return () => { isMounted = false; };
    }, [post]);

    if (!post) return null;

    const handleDownload = async () => {
        setIsGenerating(true);
        try {
            sendGAEvent('event', 'download_single_case_report_docx', {
                event_id: 'single_case_report_docx',
                status: 'downloading'
            });
            await generateSingleCaseDocx(post, project, imgState.compressedUrl);
            
            sendGAEvent('event', 'download_single_case_report_docx', {
                event_id: 'single_case_report_docx',
                status: 'downloaded'
            });
        } catch (error) {
            console.error("Docx generation failed:", error);
            alert("Failed to generate DOCX report.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={isGenerating || imgState.loading}
            onClick={handleDownload}
            className="gap-2 cursor-pointer disabled:cursor-not-allowed border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-100 transition-all font-semibold shadow-sm h-8"
        >
            {(isGenerating || imgState.loading) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <FileText className="w-4 h-4" />
            )}
            {(isGenerating || imgState.loading) ? 'Preparing...' : 'Download DOCX'}
        </Button>
    );
}
