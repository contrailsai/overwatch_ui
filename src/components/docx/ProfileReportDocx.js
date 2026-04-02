import {
    Document, Packer, Paragraph, TextRun, ImageRun,
    Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType,
    Header, Footer, PageNumber,
    VerticalAlign,
} from "docx";
import { saveAs } from "file-saver";
import {
    formatCompleteDate,
    processText,
    base64ToUint8Array,
    getImageDimensions,
    noBorders,
    PAGE_WIDTH,
    sectionDivider,
    sectionHeading,
    metaPara,
    generateCaseSections
} from "./SingleCaseReportDocx";
import { format } from 'date-fns'

export const generateProfileDocx = async (profile, cases, project, compressedImages, compressedProfilePic) => {
    const docChildren = [];

    // ── 1. PROFILE OVERVIEW (With Top-Right Image) ───────────────────────────

    // Prepare Profile Image if exists
    let profileImageRun = null;
    if (compressedProfilePic?.startsWith('data:image/')) {
        try {
            const dimensions = await getImageDimensions(compressedProfilePic);
            const TARGET_SIZE = 60; // Slightly larger than 30x30 for better visibility in DOCX
            let { width, height } = dimensions;

            if (width > TARGET_SIZE || height > TARGET_SIZE) {
                if (width > height) {
                    height = Math.round((height * TARGET_SIZE) / width);
                    width = TARGET_SIZE;
                } else {
                    width = Math.round((width * TARGET_SIZE) / height);
                    height = TARGET_SIZE;
                }
            }

            const base64Data = compressedProfilePic.split(',')[1];
            const uint8Arr = base64ToUint8Array(base64Data);
            profileImageRun = new ImageRun({
                data: uint8Arr,
                transformation: { width, height }
            });
        } catch (err) {
            console.error("Failed to include profile image in DOCX", err);
        }
    }

    // Header Table for Overview + Image
    docChildren.push(
        new Table({
            width: { size: PAGE_WIDTH, type: WidthType.DXA },
            columnWidths: [Math.round(PAGE_WIDTH * 0.8), Math.round(PAGE_WIDTH * 0.2)],
            borders: noBorders,
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            width: { size: Math.round(PAGE_WIDTH * 0.8), type: WidthType.DXA },
                            children: [
                                new Paragraph({
                                    children: [
                                        new TextRun({ text: "PROFILE OVERVIEW", bold: true, size: 32, color: "1E293B" }),
                                    ],
                                    spacing: { before: 0, after: 200 },
                                }),
                                metaPara("Username", `@${profile?.username || profile?._id || 'unknown'}`),
                                metaPara("Platform", (profile?.platform || 'Unknown').toUpperCase()),
                                metaPara("Full Name", profile?.metadata?.full_name || "N/A"),
                                profile?.metadata?.biography && metaPara("Bio", processText(profile?.metadata?.biography || profile?.metadata?.description || "N/A", 300)),
                                metaPara("Followers", profile?.metadata?.follower_count?.toLocaleString() || "0"),
                                metaPara("Following", profile?.metadata?.following_count?.toLocaleString() || "0"),
                                metaPara("Total Posts", profile?.metadata?.media_count?.toLocaleString() || "0"),
                                metaPara("Verified", profile?.metadata?.verified ? "Yes" : "No"),
                                profile?.metadata?.account_creation_date && metaPara("Account Creation Date", format(new Date(profile.metadata.account_creation_date), 'dd MMM yyyy') || "N/A"),
                                profile?.metadata?.location && metaPara("Location", profile?.metadata?.location || "N/A"),
                                profile?.profile_url && metaPara("Profile URL", profile.profile_url, true)
                            ],
                        }),
                        new TableCell({
                            width: { size: Math.round(PAGE_WIDTH * 0.2), type: WidthType.DXA },
                            verticalAlign: VerticalAlign.TOP,
                            children: profileImageRun ? [
                                new Paragraph({
                                    children: [profileImageRun],
                                    alignment: AlignmentType.RIGHT,
                                })
                            ] : [],
                        }),
                    ],
                }),
            ],
        })
    );

    docChildren.push(sectionDivider(200));

    // ── 2. ACCOUNT'S CASES REVIEWED TITLE ──────────────────────────────────────
    docChildren.push(
        new Paragraph({
            children: [
                new TextRun({ text: "ACCOUNT'S CASES REVIEWED", bold: true, size: 32, color: "1E293B" }),
            ],
            alignment: AlignmentType.LEFT,
            spacing: { before: 400, after: 400 },
        })
    );

    // ── 3. INDIVIDUAL CASES ────────────────────────────────────────────────────
    for (let i = 0; i < cases.length; i++) {
        const post = cases[i];
        const compressedImage = compressedImages[i];

        // Start every case from a new page
        const caseSections = await generateCaseSections(post, project, compressedImage, i + 1);

        // Add a page break paragraph before every case
        // docChildren.push(
        //     new Paragraph({
        //         children: [new TextRun({ text: "", break: 1 })],
        //     })
        // );

        docChildren.push(...caseSections);

        // Optional divider between cases in the same document if we don't want just whitespace
        if (i < cases.length - 1) {
            docChildren.push(sectionDivider(200));
        }
    }

    // ─── Document config ──────────────────────────────────────────────────────

    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: { font: "Outfit" },
                },
            },
        },
        sections: [
            {
                properties: {
                    page: {
                        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
                    },
                },
                headers: {
                    default: new Header({
                        children: [
                            new Table({
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
                                                    new Paragraph({ children: [new TextRun({ text: "OVERWATCH", bold: true, size: 34, color: "1E293B" })] }),
                                                    new Paragraph({ children: [new TextRun({ text: "Threat Intelligence Platform", size: 14, color: "64748B" })], spacing: { after: 80 } }),
                                                ],
                                            }),
                                            new TableCell({
                                                width: { size: Math.round(PAGE_WIDTH * 0.45), type: WidthType.DXA },
                                                borders: { ...noBorders, bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" } },
                                                margins: { top: 0, bottom: 120, left: 200, right: 0 },
                                                verticalAlign: VerticalAlign.BOTTOM,
                                                children: [
                                                    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatCompleteDate(new Date()), bold: false, size: 15, color: "475569" })] }),
                                                    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Profile Report: @${profile?.username || "N/A"}`, bold: true, size: 14, color: "64748B" })], spacing: { after: 80 } }),
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
                                                children: [new Paragraph({ children: [new TextRun({ text: "CONFIDENTIAL", bold: true, size: 14, color: "94A3B8" })], spacing: { before: 120 } })],
                                            }),
                                            new TableCell({
                                                width: { size: Math.round(PAGE_WIDTH / 3), type: WidthType.DXA },
                                                borders: { ...noBorders, top: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" } },
                                                verticalAlign: VerticalAlign.CENTER,
                                                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "POWERED BY CONTRAILS AI", size: 14, color: "94A3B8" })], spacing: { before: 120 } })],
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
                children: docChildren,
            },
        ],
    });

    const blob = await Packer.toBlob(doc);
    const fileName = `Profile_Report_${profile?.username || profile?._id}_${new Date().toISOString().split('T')[0]}.docx`;
    saveAs(blob, fileName);
};
