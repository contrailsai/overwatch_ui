'use client'

import React from 'react';
import dynamic from 'next/dynamic';
import { FileDown, Loader2 } from 'lucide-react';
import { sendGAEvent } from '@next/third-parties/google';

// Dynamic import for PDFDownloadLink to avoid server-side rendering issues
const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then((mod) => mod.PDFDownloadLink),
  { ssr: false, loading: () => <button className="px-4 py-2 bg-slate-100 text-slate-400 rounded-lg flex items-center gap-2" disabled><Loader2 className="w-4 h-4 animate-spin" /> Preparing...</button> }
);

import RiskReportDocument from './SummaryReport';
import { fetchAndCompressImage } from './CaseExportButton';
import { getPostsByIds } from '@/app/(dashboard)/cases/actions';

export function ReportButton({ posts, project, className }) {
  const [imgState, setImgState] = React.useState({ compressedImages: [], loading: true });
  const [fetchingData, setFetchingData] = React.useState(false);
  const [fullyLoadedPosts, setFullyLoadedPosts] = React.useState([]);

  React.useEffect(() => {
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
            console.warn("Failed to process image for summary report:", post._id, e);
          }
          return null;
        });

        const images = await Promise.all(imagePromises);

        if (isMounted) {
          setImgState({ compressedImages: images, loading: false });
        }
      } catch (error) {
        console.error("Error processing images for summary report:", error);
        if (isMounted) {
          setImgState(prev => ({ ...prev, loading: false }));
        }
      }
    };

    const loadDataAndProcess = async () => {
      if (!posts || posts.length === 0) {
        setFullyLoadedPosts([]);
        processImages([]);
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
          console.error("Failed to fetch full posts:", err);
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

  const fileName = `Overwatch_Report_${new Date().toISOString().split('T')[0]}.pdf`;

  return (
    <PDFDownloadLink
      document={<RiskReportDocument posts={fullyLoadedPosts} project={project} compressedImages={imgState.compressedImages} />}
      fileName={fileName}
    >
      {({ blob, url, loading, error }) => (
        <button
          disabled={loading || imgState.loading || fetchingData}
          onClick={() => {
            sendGAEvent('event', 'download_summary_report', {
              event_id: 'summary_report',
              status: 'downloaded'
            })
          }}
          className={className || "flex cursor-pointer items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm shadow-sm"}
        >
          {(loading || imgState.loading || fetchingData) ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileDown className="w-4 h-4" />
          )}
          {(loading || imgState.loading || fetchingData) ? 'Preparing...' : 'Export Summary Report'}
        </button>
      )}
    </PDFDownloadLink>
  );
}
