import React from 'react';
import { Document } from '@react-pdf/renderer';
import { SingleCasePage } from './SingleCaseReport';
import { registerFonts } from './fontRegistration';

// --- FONT REGISTRATION ---
registerFonts();

export const DetailedCasesReportDocument = ({ posts, project, compressedImages }) => {
    return (
        <Document title={`Detailed_Report`}>
            {posts.map((post, index) => (
                <SingleCasePage 
                    key={post._id || index} 
                    post={post} 
                    project={project} 
                    compressedImage={compressedImages[index]} 
                />
            ))}
        </Document>
    );
};

export default DetailedCasesReportDocument;