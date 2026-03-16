'use client'

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Download, Loader2 } from 'lucide-react';

const PDFDownloadLink = dynamic(
    () => import('@react-pdf/renderer').then((mod) => mod.PDFDownloadLink),
    { 
        ssr: false, 
        loading: () => <button className="w-full cursor-not-allowed rounded-xl border-2 border-slate-200 text-slate-400 flex items-center justify-center gap-2 font-bold transition-all bg-slate-50 py-2.5" disabled><Loader2 className="w-4 h-4 animate-spin" /> Preparing Report...</button> 
    }
);

import { ProfileReportDocument } from './ProfileReport';
import { fetchAndCompressImage } from './CaseExportButton';
import { getPostsByIds } from '@/app/(dashboard)/cases/actions';

export function ProfileExportButton({ profile, project, className }) {
    const [imgState, setImgState] = useState({ compressedImages: [], compressedProfilePic: null, loading: true });
    const [fetchingData, setFetchingData] = useState(false);
    const [fullyLoadedPosts, setFullyLoadedPosts] = useState([]);

    useEffect(() => {
        let isMounted = true;

        const processImages = async (postsToProcess) => {
            setImgState(prev => ({ ...prev, loading: true }));

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

    const fileName = `Profile_Report_${profile?.username || profile?._id}.pdf`;

    return (
        <PDFDownloadLink
            document={
                <ProfileReportDocument 
                    profile={profile} 
                    cases={fullyLoadedPosts} 
                    project={project} 
                    compressedImages={imgState.compressedImages} 
                    compressedProfilePic={imgState.compressedProfilePic}
                />
            }
            fileName={fileName}
        >
            {({ blob, url, loading, error }) => (
                <button
                    disabled={loading || imgState.loading || fetchingData}
                    className={className || "w-full cursor-pointer rounded-xl border-2 border-slate-200 text-slate-500 hover:border-blue-500 hover:text-blue-600 flex items-center justify-center gap-2 font-bold transition-all bg-white py-2"}
                >
                    {(loading || imgState.loading || fetchingData) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Download className="w-4 h-4" />
                    )}
                    {(loading || imgState.loading || fetchingData) ? 'Preparing Report...' : 'Download PDF Report'}
                </button>
            )}
        </PDFDownloadLink>
    );
}

export default ProfileExportButton;
