'use client'

import React from 'react';
import dynamic from 'next/dynamic';
import { FileDown, Loader2 } from 'lucide-react';

// Dynamic import for PDFDownloadLink to avoid server-side rendering issues
const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then((mod) => mod.PDFDownloadLink),
  { ssr: false, loading: () => <button className="px-4 py-2 bg-slate-100 text-slate-400 rounded-lg flex items-center gap-2" disabled><Loader2 className="w-4 h-4 animate-spin" /> Preparing...</button> }
);

import RiskReportDocument from './RiskReport';

export function ReportButton({ posts }) {
  const fileName = `Overwatch_Report_${new Date().toISOString().split('T')[0]}.pdf`;

  return (
    <PDFDownloadLink
      document={<RiskReportDocument posts={posts} />}
      fileName={fileName}
    >
      {({ blob, url, loading, error }) => (
        <button
          disabled={loading}
          className="flex cursor-pointer items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm shadow-sm"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileDown className="w-4 h-4" />
          )}
          {loading ? 'Generating...' : 'Export Report'}
        </button>
      )}
    </PDFDownloadLink>
  );
}
