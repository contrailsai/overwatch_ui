'use client'

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button"

// Dynamic import for PDFDownloadLink to avoid server-side rendering issues
const PDFDownloadLink = dynamic(
    () => import('@react-pdf/renderer').then((mod) => mod.PDFDownloadLink),
    {
        ssr: false,
        loading: () => (
            <Button variant="outline" size="sm" disabled className="gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Preparing...
            </Button>
        )
    }
);

import SingleCaseReportDocument from './SingleCaseReport';

export const fetchAndCompressImage = async (imageUrl, maxWidth = 800) => {
    try {
        // Fetch the image as a blob to bypass some strict rendering checks
        const response = await fetch(imageUrl, { mode: 'cors' });
        const blob = await response.blob();

        return new Promise((resolve, reject) => {
            const img = new window.Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Downscale if the image is massive
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Export as a standard, safe JPEG
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
    } catch (error) {
        console.error("Failed to load/compress image for PDF:", error);
        return null;
    }
};

export function CaseExportButton({ post }) {
    const [imgState, setImgState] = useState({ compressedUrl: null, loading: true });

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
                    setImgState({ compressedUrl: compressed || sourceUrl, loading: false }); // Fallback to sourceUrl if compression fails
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

    const fileName = `Case_${post._id}_${new Date().toISOString().split('T')[0]}.pdf`;

    return (
        <PDFDownloadLink
            document={<SingleCaseReportDocument post={post} compressedImage={imgState.compressedUrl} />}
            fileName={fileName}
        >
            {({ blob, url, loading, error }) => (
                <Button
                    variant="outline"
                    size="sm"
                    disabled={loading || imgState.loading}
                    className="gap-2 border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-100 transition-all font-semibold shadow-sm h-8"
                >
                    {(loading || imgState.loading) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <FileDown className="w-4 h-4" />
                    )}
                    {(loading || imgState.loading) ? 'Preparing...' : 'Download Case Report'}
                </Button>
            )}
        </PDFDownloadLink>
    );
}
