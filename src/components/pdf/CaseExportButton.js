'use client'

import React from 'react';
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

export function CaseExportButton({ post }) {
    if (!post) return null;

    const fileName = `Case_${post._id}_${new Date().toISOString().split('T')[0]}.pdf`;

    return (
        <PDFDownloadLink
            document={<SingleCaseReportDocument post={post} />}
            fileName={fileName}
        >
            {({ blob, url, loading, error }) => (
                <Button
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    className="gap-2 border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-100 transition-all font-semibold shadow-sm h-8"
                >
                    {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <FileDown className="w-4 h-4" />
                    )}
                    {loading ? 'Generating...' : 'Export PDF'}
                </Button>
            )}
        </PDFDownloadLink>
    );
}
