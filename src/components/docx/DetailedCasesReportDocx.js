import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, Header, Footer, PageNumber, VerticalAlign, PageBreak
} from "docx";
import { saveAs } from "file-saver";
import { formatCompleteDate, PAGE_WIDTH, noBorders, generateCaseSections } from './SingleCaseReportDocx';

export const generateDetailedCasesDocx = async (posts, project, compressedImages, clientDetails) => {
    let allDocChildren = [];

    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const compressedImage = compressedImages[i];
        
        // Add a page break before each new case (except the first one)
        if (i > 0) {
            allDocChildren.push(new Paragraph({ children: [new PageBreak()] }));
        }

        const caseSections = await generateCaseSections(post, project, compressedImage, i + 1);
        allDocChildren.push(...caseSections);
    }

    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: { font: "Inter" },
                },
            },
        },
        sections: [
            {
                properties: {
                    page: {
                        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
                    },
                    titlePage: true,
                },
                headers: {
                    first: new Header({
                        children: [
                            new Table({
                                // Header table: 2 equal columns
                                width: { size: PAGE_WIDTH, type: WidthType.DXA },
                                columnWidths: [Math.round(PAGE_WIDTH * 0.55), Math.round(PAGE_WIDTH * 0.45)],
                                borders: noBorders,
                                rows: [
                                    new TableRow({
                                        children: [
                                            new TableCell({
                                                width: { size: Math.round(PAGE_WIDTH * 0.55), type: WidthType.DXA },
                                                borders: { ...noBorders, bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" } },
                                                margins: { top: 0, bottom: 120, left: 0, right: 200 },
                                                verticalAlign: VerticalAlign.BOTTOM,
                                                children: [
                                                    new Paragraph({ children: [new TextRun({ text: "DETAILED ANALYSIS", bold: true, size: 34, color: "1E293B" })] }),
                                                ],
                                            }),
                                            new TableCell({
                                                width: { size: Math.round(PAGE_WIDTH * 0.45), type: WidthType.DXA },
                                                borders: { ...noBorders, bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" } },
                                                margins: { top: 0, bottom: 120, left: 200, right: 0 },
                                                verticalAlign: VerticalAlign.BOTTOM,
                                                children: [
                                                    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatCompleteDate(new Date()), bold: false, size: 15, color: "475569" })] }),
                                                    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Detailed Cases Report`, bold: true, size: 14, color: "64748B" })], spacing: { after: 80 } }),
                                                ],
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                        ],
                    }),
                },
                footers: {
                    default: new Footer({
                        children: [
                            new Table({
                                // Footer table: 3 equal columns
                                width: { size: PAGE_WIDTH, type: WidthType.DXA },
                                columnWidths: [Math.round(PAGE_WIDTH / 3), Math.round(PAGE_WIDTH / 3), PAGE_WIDTH - Math.round(PAGE_WIDTH / 3) * 2],
                                borders: noBorders,
                                rows: [
                                    new TableRow({
                                        children: [
                                            new TableCell({
                                                width: { size: Math.round(PAGE_WIDTH / 3), type: WidthType.DXA },
                                                borders: { ...noBorders, top: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" } },
                                                verticalAlign: VerticalAlign.CENTER,
                                                children: [new Paragraph({ children: [new TextRun({ text: clientDetails?.organization ? `REQUESTED BY ${clientDetails.organization.toUpperCase()}` : "REQUESTED BY CLIENT", bold: true, size: 14, color: "94A3B8" })], spacing: { before: 120 } })],
                                            }),
                                            new TableCell({
                                                width: { size: Math.round(PAGE_WIDTH / 3), type: WidthType.DXA },
                                                borders: { ...noBorders, top: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" } },
                                                verticalAlign: VerticalAlign.CENTER,
                                                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "POWERED BY OVERWATCH", size: 14, color: "94A3B8" })], spacing: { before: 120 } })],
                                            }),
                                            new TableCell({
                                                width: { size: PAGE_WIDTH - Math.round(PAGE_WIDTH / 3) * 2, type: WidthType.DXA },
                                                borders: { ...noBorders, top: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" } },
                                                verticalAlign: VerticalAlign.CENTER,
                                                children: [
                                                    new Paragraph({
                                                        alignment: AlignmentType.RIGHT,
                                                        spacing: { before: 120 },
                                                        children: [
                                                            new TextRun({ text: "Page ", bold: true, size: 14, color: "94A3B8" }),
                                                            new TextRun({ children: [PageNumber.CURRENT], bold: true, size: 14, color: "64748B" }),
                                                            new TextRun({ text: " of ", bold: true, size: 14, color: "94A3B8" }),
                                                            new TextRun({ children: [PageNumber.TOTAL_PAGES], bold: true, size: 14, color: "64748B" }),
                                                        ],
                                                    }),
                                                ],
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                        ],
                    }),
                    first: new Footer({
                        children: [
                            new Table({
                                // Footer table: 3 equal columns
                                width: { size: PAGE_WIDTH, type: WidthType.DXA },
                                columnWidths: [Math.round(PAGE_WIDTH / 3), Math.round(PAGE_WIDTH / 3), PAGE_WIDTH - Math.round(PAGE_WIDTH / 3) * 2],
                                borders: noBorders,
                                rows: [
                                    new TableRow({
                                        children: [
                                            new TableCell({
                                                width: { size: Math.round(PAGE_WIDTH / 3), type: WidthType.DXA },
                                                borders: { ...noBorders, top: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" } },
                                                verticalAlign: VerticalAlign.CENTER,
                                                children: [new Paragraph({ children: [new TextRun({ text: clientDetails?.organization ? `REQUESTED BY ${clientDetails.organization.toUpperCase()}` : "REQUESTED BY CLIENT", bold: true, size: 14, color: "94A3B8" })], spacing: { before: 120 } })],
                                            }),
                                            new TableCell({
                                                width: { size: Math.round(PAGE_WIDTH / 3), type: WidthType.DXA },
                                                borders: { ...noBorders, top: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" } },
                                                verticalAlign: VerticalAlign.CENTER,
                                                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "POWERED BY OVERWATCH", size: 14, color: "94A3B8" })], spacing: { before: 120 } })],
                                            }),
                                            new TableCell({
                                                width: { size: PAGE_WIDTH - Math.round(PAGE_WIDTH / 3) * 2, type: WidthType.DXA },
                                                borders: { ...noBorders, top: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" } },
                                                verticalAlign: VerticalAlign.CENTER,
                                                children: [
                                                    new Paragraph({
                                                        alignment: AlignmentType.RIGHT,
                                                        spacing: { before: 120 },
                                                        children: [
                                                            new TextRun({ text: "Page ", bold: true, size: 14, color: "94A3B8" }),
                                                            new TextRun({ children: [PageNumber.CURRENT], bold: true, size: 14, color: "64748B" }),
                                                            new TextRun({ text: " of ", bold: true, size: 14, color: "94A3B8" }),
                                                            new TextRun({ children: [PageNumber.TOTAL_PAGES], bold: true, size: 14, color: "64748B" }),
                                                        ],
                                                    }),
                                                ],
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                        ],
                    }),
                },
                children: allDocChildren,
            },
        ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Detailed_Report_${new Date().toISOString().split('T')[0]}.docx`);
};
