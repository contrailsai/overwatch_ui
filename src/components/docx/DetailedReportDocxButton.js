'use client'

import React, { useState, useEffect } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { sendGAEvent } from '@next/third-parties/google';
import { fetchAndCompressImage } from './CaseExportDocxButton';
import { getPostsByIds } from '@/app/(dashboard)/cases/actions';
import { generateDetailedCasesDocx } from './DetailedCasesReportDocx';
import { useClient } from '@/context/ClientContext';

export function DetailedReportDocxButton({ posts, project, className }) {
    const { clientDetails } = useClient();
    const [imgState, setImgState] = useState({ compressedImages: [], loading: true });
    const [fetchingData, setFetchingData] = useState(false);
    const [fullyLoadedPosts, setFullyLoadedPosts] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const processImages = async (postsToProcess) => {
            if (!postsToProcess || postsToProcess.length === 0) {
                if (isMounted) setImgState({ compressedImages: [], loading: false });
                return;
            }

            setImgState(prev => ({ ...prev, loading: true }));

            try {
                const imagePromises = postsToProcess.map(async (post) => {
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

        const loadDataAndProcess = async () => {
            if (!posts || posts.length === 0) {
                if (isMounted) {
                    setFullyLoadedPosts([]);
                    processImages([]);
                }
                return;
            }

            // Check if we have placeholder posts (only _id)
            const placeholderIds = posts
                .filter(p => !p.caption && !p.user && p._id)
                .map(p => p._id);

            let finalPosts = [...posts];

            if (placeholderIds.length > 0) {
                if (isMounted) setFetchingData(true);
                try {
                    const fullPosts = await getPostsByIds(project, placeholderIds);
                    // Merge full posts back into our list
                    finalPosts = posts.map(p => {
                        const full = fullPosts.find(fp => fp._id === p._id);
                        return full || p;
                    });
                } catch (err) {
                    console.error("Failed to fetch full posts for detailed report:", err);
                } finally {
                    if (isMounted) setFetchingData(false);
                }
            }

            if (isMounted) {
                setFullyLoadedPosts(finalPosts);
                processImages(finalPosts);
            }
        };

        loadDataAndProcess();
        return () => { isMounted = false; };
    }, [posts, project]);

    const handleDownload = async () => {
        setIsGenerating(true);
        try {
            sendGAEvent('event', 'download_detailed_cases_report_docx', {
                event_id: 'detailed_cases_report_docx',
                status: 'downloading'
            });
            
            await generateDetailedCasesDocx(fullyLoadedPosts, project, imgState.compressedImages, clientDetails);

            sendGAEvent('event', 'download_detailed_cases_report_docx', {
                event_id: 'detailed_cases_report_docx',
                status: 'downloaded'
            });
        } catch (error) {
            console.error("Docx generation failed:", error);
            alert("Failed to generate DOCX report.");
        } finally {
            setIsGenerating(false);
        }
    };

    const isLoading = imgState.loading || fetchingData || isGenerating;

    return (
        <button
            disabled={isLoading || posts?.length === 0}
            onClick={handleDownload}
            className={className || "flex cursor-pointer items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"}
        >
            {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <FileText className="w-4 h-4" />
            )}
            {isLoading ? 'Preparing...' : 'Export Detailed DOCX'}
        </button>
    );
}
