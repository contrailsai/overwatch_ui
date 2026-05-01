'use client'

import React, { useState, useEffect } from 'react';
import { FileDown, Loader2, FileText } from 'lucide-react';
import { Button } from "@/components/ui/button"
import { sendGAEvent } from '@next/third-parties/google';
import { generateSingleCaseDocx } from './SingleCaseReportDocx';

import { useClient } from '@/context/ClientContext';
import posthog from 'posthog-js';

export const fetchAndCompressImage = async (imageUrl, maxWidth = 800) => {
    try {
        // Fetch the image as a blob to bypass some strict rendering checks
        const response = await fetch(imageUrl, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const blob = await response.blob();

        if (!blob.type.startsWith('image/')) {
            console.warn(`Fetched resource is not an image (type: ${blob.type}), returning null`);
            return null;
        }

        return await new Promise((resolve, reject) => {
            const img = new window.Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                } catch (e) {
                    reject(new Error(`Canvas processing failed: ${e.message}`));
                }
            };
            img.onerror = () => reject(new Error('Image failed to load in browser context'));
            img.src = URL.createObjectURL(blob);
        });
    } catch (error) {
        console.warn("Failed to load/compress image for DOCX:", error.message);
        return null;
    }
};

export function CaseExportDocxButton({ post, project, className }) {
    const { clientDetails } = useClient();
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
            posthog.capture('Report Downloaded', { type: 'Single Case Report', format: 'docx', caseId: post._id });
            sendGAEvent('event', 'download_single_case_report_docx', {
                event_id: 'single_case_report_docx',
                status: 'downloading'
            });
            await generateSingleCaseDocx(post, project, imgState.compressedUrl, clientDetails);

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
            className={className || "gap-2 cursor-pointer disabled:cursor-not-allowed border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-100 transition-all font-semibold shadow-sm h-8"}
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
