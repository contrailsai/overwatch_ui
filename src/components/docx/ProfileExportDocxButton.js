'use client'

import React, { useState, useEffect } from 'react';
import { Download, Loader2, FileText } from 'lucide-react';
import { Button } from "@/components/ui/button"
import { sendGAEvent } from '@next/third-parties/google';
import { generateProfileDocx } from './ProfileReportDocx';
import { fetchAndCompressImage } from './CaseExportDocxButton';
import { getPostsByIds } from '@/app/(dashboard)/cases/actions';

export function ProfileExportDocxButton({ profile, project, className }) {
    const [imgState, setImgState] = useState({ compressedImages: [], compressedProfilePic: null, loading: true });
    const [fetchingData, setFetchingData] = useState(false);
    const [fullyLoadedPosts, setFullyLoadedPosts] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const processImages = async (postsToProcess) => {
            if (isMounted) setImgState(prev => ({ ...prev, loading: true }));

            try {
                // Compress profile pic
                let compressedProfilePic = null;
                const profilePicUrl = profile?.metadata?.profile_pic || null;
                if (profilePicUrl) {
                    try {
                        compressedProfilePic = await fetchAndCompressImage(profilePicUrl);
                        compressedProfilePic = compressedProfilePic || profilePicUrl;
                    } catch (e) {
                        console.warn("Failed to process profile image", e);
                        compressedProfilePic = profilePicUrl;
                    }
                }

                // Compress post images
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
                    setImgState({
                        compressedImages: images,
                        compressedProfilePic: compressedProfilePic,
                        loading: false
                    });
                }
            } catch (error) {
                console.error("Error processing images for profile report:", error);
                if (isMounted) {
                    setImgState(prev => ({ ...prev, loading: false }));
                }
            }
        };

        const loadDataAndProcess = async () => {
            if (!profile?.posts || profile.posts.length === 0) {
                setFullyLoadedPosts([]);
                processImages([]);
                return;
            }

            if (isMounted) setFetchingData(true);
            try {
                const fullPosts = await getPostsByIds(project, profile.posts);
                if (isMounted) {
                    setFullyLoadedPosts(fullPosts);
                    processImages(fullPosts);
                }
            } catch (err) {
                console.error("Failed to fetch full posts for profile report:", err);
            } finally {
                if (isMounted) setFetchingData(false);
            }
        };

        loadDataAndProcess();
        return () => { isMounted = false; };
    }, [profile, project]);

    const handleDownload = async () => {
        setIsGenerating(true);
        try {
            sendGAEvent('event', 'download_profile_report_docx', {
                event_id: 'profile_report_docx',
                status: 'downloading',
                profile_id: profile?._id
            });

            await generateProfileDocx(
                profile,
                fullyLoadedPosts,
                project,
                imgState.compressedImages,
                imgState.compressedProfilePic
            );

            sendGAEvent('event', 'download_profile_report_docx', {
                event_id: 'profile_report_docx',
                status: 'downloaded',
                profile_id: profile?._id
            });
        } catch (error) {
            console.error("Profile DOCX generation failed:", error);
            alert("Failed to generate profile DOCX report.");
        } finally {
            setIsGenerating(false);
        }
    };

    const isLoading = imgState.loading || fetchingData || isGenerating;

    return (
        <Button
            variant="outline"
            disabled={isLoading}
            onClick={handleDownload}
            className={className || "w-full cursor-pointer rounded-xl border-2 border-slate-200 text-slate-500 hover:border-blue-500 hover:text-blue-600 flex items-center justify-center gap-2 font-bold transition-all bg-white py-2"}
        >
            {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <FileText className="w-4 h-4" />
            )}
            {isLoading ? 'Preparing Report...' : 'Download DOCX Report'}
        </Button>
    );
}

export default ProfileExportDocxButton;
