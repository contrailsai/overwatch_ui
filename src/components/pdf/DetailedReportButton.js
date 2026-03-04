'use client'

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { FileDown, Loader2 } from 'lucide-react';

const PDFDownloadLink = dynamic(
    () => import('@react-pdf/renderer').then((mod) => mod.PDFDownloadLink),
    { ssr: false, loading: () => <button className="flex cursor-pointer items-center gap-2 px-3 py-2 bg-slate-100 text-slate-400 border border-slate-200 font-medium rounded-lg text-sm shadow-sm" disabled><Loader2 className="w-4 h-4 animate-spin" /> Preparing...</button> }
);

import { DetailedCasesReportDocument } from './DetailedCasesReport';
import { fetchAndCompressImage } from './CaseExportButton';

export function DetailedReportButton({ posts, project, className }) {
    const [imgState, setImgState] = useState({ compressedImages: [], loading: true });

    useEffect(() => {
        let isMounted = true;
        const processImages = async () => {
            if (!posts || posts.length === 0) {
                if (isMounted) setImgState({ compressedImages: [], loading: false });
                return;
            }

            setImgState(prev => ({ ...prev, loading: true }));

            try {
                const imagePromises = posts.map(async (post) => {
                    try {
                        const sourceUrl = post?.signedImageUrl ||
                            post?.image_url ||
                            (post?.post_content?.media_urls?.[0]?.s3_url) ||
                            (post?.media_urls?.[0]?.s3_url) ||
                            (post?.post_content?.media_urls?.[0]?.original_url) ||
                            null;

                        if (sourceUrl) {
                            const compressed = await fetchAndCompressImage(sourceUrl);
                            return compressed || sourceUrl;
                        }
                    } catch (e) {
                        console.warn("Failed to process image for post:", post._id, e);
                    }
                    return null;
                });

                const images = await Promise.all(imagePromises);

                if (isMounted) {
                    setImgState({ compressedImages: images, loading: false });
                }
            } catch (error) {
                console.error("Error processing images for report:", error);
                if (isMounted) {
                    setImgState(prev => ({ ...prev, loading: false }));
                }
            }
        };
        processImages();
        return () => { isMounted = false; };
    }, [posts]);

    const fileName = `Detailed_Report_${new Date().toISOString().split('T')[0]}.pdf`;

    return (
        <PDFDownloadLink
            document={<DetailedCasesReportDocument posts={posts} project={project} compressedImages={imgState.compressedImages} />}
            fileName={fileName}
        >
            {({ blob, url, loading, error }) => (
                <button
                    disabled={loading || imgState.loading || posts?.length === 0}
                    className={className || "flex cursor-pointer items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"}
                >
                    {(loading || imgState.loading) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <FileDown className="w-4 h-4" />
                    )}
                    {(loading || imgState.loading) ? 'Preparing...' : 'Export Detailed Report'}
                </button>
            )}
        </PDFDownloadLink>
    );
}
