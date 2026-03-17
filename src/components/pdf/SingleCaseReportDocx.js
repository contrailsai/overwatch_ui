import {
    Document, Packer, Paragraph, TextRun, ImageRun,
    Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType,
    Header, Footer, PageNumber,
    VerticalAlign, ShadingType,
    HeadingLevel,
} from "docx";
import { saveAs } from "file-saver";
import { format, isValid, parseISO } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCompleteDate = (dateInput) => {
    if (!dateInput) return "N/A";
    try {
        const dateObj = typeof dateInput === 'string' ? parseISO(dateInput) : new Date(dateInput);
        if (isValid(dateObj)) return format(dateObj, "dd MMM yyyy, hh:mm a");
    } catch (_) { /* fall through */ }
    return "N/A";
};

const getRiskLabel = (score) => {
    if (score > 95) return { label: 'HIGH RISK', color: 'E11D48', bg: 'FFF1F2' };
    if (score > 75) return { label: 'MEDIUM RISK', color: 'EA580C', bg: 'FFF7ED' };
    if (score > 40) return { label: 'LOW RISK', color: 'D97706', bg: 'FFFBEB' };
    return { label: 'SAFE CONTENT', color: '059669', bg: 'ECFDF5' };
};

const processText = (text, maxLength = 500, maxLines = null) => {
    if (!text) return '';
    let result = text;
    let truncated = false;
    if (maxLines) {
        const lines = result.split(/\r\n|\r|\n/);
        if (lines.length > maxLines) { result = lines.slice(0, maxLines).join('\n'); truncated = true; }
    }
    if (result.length > maxLength) { result = result.substring(0, maxLength); truncated = true; }
    return truncated ? result.trim() + '…' : result;
};

const base64ToUint8Array = (base64) => {
    const raw = window.atob(base64);
    const array = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) array[i] = raw.charCodeAt(i);
    return array;
};

// ─── Border / Shading presets ─────────────────────────────────────────────────

const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

// Page geometry (US Letter, margins 1080 TWIPs each side)
// 1 inch = 1440 TWIPs, Letter = 12240 TWIPs wide
// Available body width: 12240 - 1080*2 = 10080 TWIPs
const PAGE_WIDTH = 10080;

// A thin horizontal rule rendered as a 1-row table with a bottom border
const sectionDivider = () =>
    new Table({
        width: { size: PAGE_WIDTH, type: WidthType.DXA },
        columnWidths: [PAGE_WIDTH],
        borders: noBorders,
        rows: [
            new TableRow({
                height: { value: 20, rule: "exact" },
                children: [
                    new TableCell({
                        width: { size: PAGE_WIDTH, type: WidthType.DXA },
                        borders: {
                            ...noBorders,
                            bottom: { style: BorderStyle.SINGLE, size: 6, color: "E2E8F0" },
                        },
                        children: [new Paragraph({ children: [] })],
                    }),
                ],
            }),
        ],
    });

// Section heading paragraph
const sectionHeading = (text) =>
    new Paragraph({
        children: [
            new TextRun({
                text: text.toUpperCase(),
                bold: true,
                color: "334155",
                size: 22,
                allCaps: false,
            }),
        ],
        spacing: { before: 480, after: 160 },
    });

// Body text paragraph
const bodyPara = (text, opts = {}) =>
    new Paragraph({
        children: [
            new TextRun({
                text,
                color: opts.color || "1E293B",
                size: opts.size || 20,
                bold: opts.bold || false,
            }),
        ],
        spacing: { before: opts.spaceBefore || 0, after: opts.spaceAfter || 200 },
    });

// ─── Main export ──────────────────────────────────────────────────────────────

export const generateSingleCaseDocx = async (post, project, compressedImage) => {
    const review = post.review_details || {};
    const analysis = post.analysis_results || {};
    const riskScore = review.threat_score ?? analysis.risk_score ?? 0;
    const riskInfo = getRiskLabel(riskScore);

    const reasoning = review.reasoning
        || analysis.categorization_reason
        || "Analyzed content for policy adherence. No detailed reasoning provided.";

    // Project labels / violations
    let projectDetails = project?.project_details;
    if (typeof projectDetails === 'string') {
        try { projectDetails = JSON.parse(projectDetails); } catch (_) { projectDetails = {}; }
    }
    const projectLabels = projectDetails?.labels || [];
    const activeViolations = [];
    const severityMap = { high: 1, medium: 2, low: 3 };

    projectLabels.forEach(label => {
        if (review.flags?.[label.name] === true) {
            activeViolations.push({
                title: label.name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                severity: label.severity || 'medium',
                order: severityMap[label.severity] || 4,
            });
        }
    });

    const legacyFlags = {
        is_nsfw: "NSFW Content", is_hate_speech: "Hate Speech",
        is_fake_news: "Misinformation", is_fraud: "Fraud",
        is_asset_misuse: "Asset Misuse", is_terrorism: "Terrorism", is_violence: "Violence",
    };
    Object.entries(legacyFlags).forEach(([key, title]) => {
        if (review.flags?.[key] === true && !activeViolations.some(v => v.title === title)) {
            activeViolations.push({ title, severity: 'medium', order: severityMap['medium'] });
        }
    });
    activeViolations.sort((a, b) => a.order - b.order);

    // Dates & misc
    const posted_date = formatCompleteDate(post.posted_date || post.metadata?.posted_date || post.timestamp || post.sourcing_date);
    const sourced_date = formatCompleteDate(post.metadata?.created_at || post.created_at);
    const reviewedDate = formatCompleteDate(post.updated_at || review.reviewed_at || post.created_at);
    const stats = post.stats || {};
    const legalCodes = review.legal_codes || [];

    let parsedComments = [];
    const rawComments = post.client_notes || post.notes || post.comments;
    if (Array.isArray(rawComments)) {
        parsedComments = rawComments;
    } else if (typeof rawComments === 'string') {
        try { parsedComments = JSON.parse(rawComments); }
        catch (_) { if (rawComments.trim().length > 0 && rawComments !== '[]') parsedComments = [{ text: rawComments }]; }
    }

    // ─── Document body ────────────────────────────────────────────────────────

    const docChildren = [];

    // ── 1. BANNER TABLE ──────────────────────────────────────────────────────
    //   Available width = PAGE_WIDTH (10080 TWIPs, defined above)
    const LEFT_COL_TWIPS = Math.round(PAGE_WIDTH * 0.65); // 6552
    const RIGHT_COL_TWIPS = PAGE_WIDTH - LEFT_COL_TWIPS;   // 3528

    const bannerTable = new Table({
        width: { size: PAGE_WIDTH, type: WidthType.DXA },
        columnWidths: [LEFT_COL_TWIPS, RIGHT_COL_TWIPS],
        borders: noBorders,
        rows: [
            new TableRow({
                height: { value: 1200, rule: "atLeast" },
                children: [
                    // Left cell – metadata
                    new TableCell({
                        width: { size: LEFT_COL_TWIPS, type: WidthType.DXA },
                        shading: { type: ShadingType.SOLID, color: "F8FAFC" },
                        borders: noBorders,
                        margins: { top: 220, bottom: 220, left: 280, right: 280 },
                        verticalAlign: VerticalAlign.CENTER,
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({ text: "Account: ", bold: true, color: "64748B", size: 18 }),
                                    new TextRun({ text: `@${post.user?.username || 'unknown'}`, color: "1E293B", size: 20, bold: true }),
                                ],
                                spacing: { after: 80 },
                            }),
                            new Paragraph({
                                children: [
                                    new TextRun({ text: "Platform: ", bold: true, color: "64748B", size: 18 }),
                                    new TextRun({ text: (post.platform || 'Unknown').toUpperCase(), color: "1E293B", size: 20 }),
                                ],
                                spacing: { after: 80 },
                            }),
                            new Paragraph({
                                children: [
                                    new TextRun({ text: "URL: ", bold: true, color: "64748B", size: 18 }),
                                    new TextRun({ text: processText(post.original_url || post.url || "N/A", 70), color: "2563EB", size: 18 }),
                                ],
                                spacing: { after: 80 },
                            }),
                            new Paragraph({
                                children: [
                                    new TextRun({ text: "Posted: ", bold: true, color: "64748B", size: 18 }),
                                    new TextRun({ text: posted_date, color: "1E293B", size: 18 }),
                                ],
                                spacing: { after: 80 },
                            }),
                            new Paragraph({
                                children: [
                                    new TextRun({ text: "Sourced: ", bold: true, color: "64748B", size: 18 }),
                                    new TextRun({ text: sourced_date, color: "1E293B", size: 18 }),
                                ],
                                spacing: { after: 80 },
                            }),
                            new Paragraph({
                                children: [
                                    new TextRun({ text: "Reviewed: ", bold: true, color: "64748B", size: 18 }),
                                    new TextRun({ text: reviewedDate, color: "1E293B", size: 18 }),
                                ],
                                spacing: { after: 0 },
                            }),
                        ],
                    }),
                    // Right cell – risk badge, CENTERED both axes
                    new TableCell({
                        width: { size: RIGHT_COL_TWIPS, type: WidthType.DXA },
                        shading: { type: ShadingType.SOLID, color: riskInfo.bg },
                        borders: noBorders,
                        margins: { top: 220, bottom: 220, left: 200, right: 200 },
                        verticalAlign: VerticalAlign.CENTER,
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                spacing: { before: 0, after: 60 },
                                children: [
                                    new TextRun({ text: riskInfo.label, bold: true, color: riskInfo.color, size: 32 }),
                                ],
                            }),
                            // new Paragraph({
                            //     alignment: AlignmentType.CENTER,
                            //     spacing: { before: 0, after: 0 },
                            //     children: [
                            //         new TextRun({ text: `Score: ${riskScore}`, color: riskInfo.color, size: 22, bold: false }),
                            //     ],
                            // }),
                        ],
                    }),
                ],
            }),
        ],
    });

    docChildren.push(bannerTable);
    docChildren.push(new Paragraph({ spacing: { after: 280 } }));

    // ── 2. VISUAL EVIDENCE ────────────────────────────────────────────────────

    let imageRun = null;
    if (compressedImage?.startsWith('data:image/')) {
        try {
            const base64Data = compressedImage.split(',')[1];
            const uint8Arr = base64ToUint8Array(base64Data);
            imageRun = new ImageRun({ data: uint8Arr, transformation: { width: 480, height: 300 } });
        } catch (err) {
            console.error("Failed to include image in DOCX", err);
        }
    }

    docChildren.push(sectionDivider());
    docChildren.push(sectionHeading("Visual Evidence"));

    if (imageRun) {
        docChildren.push(
            new Paragraph({ children: [imageRun], alignment: AlignmentType.CENTER, spacing: { after: 200 } })
        );
    } else {
        docChildren.push(
            new Paragraph({
                children: [new TextRun({ text: "No image available for this case.", color: "94A3B8", size: 20 })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
            })
        );
    }

    // ── 3. ENGAGEMENT STATS ───────────────────────────────────────────────────

    docChildren.push(sectionDivider());
    docChildren.push(sectionHeading("Engagement Stats"));

    const statsParts = [];
    statsParts.push(`Likes: ${stats.like_count ? stats.like_count.toLocaleString() : '0'}`);
    statsParts.push(`Comments: ${stats.comment_count ? stats.comment_count.toLocaleString() : '0'}`);
    if (stats.share_count !== undefined) statsParts.push(`Shares: ${stats.share_count.toLocaleString()}`);
    if (stats.view_count !== undefined && stats.view_count !== 0) statsParts.push(`Views: ${stats.view_count.toLocaleString()}`);

    docChildren.push(
        new Paragraph({
            children: [new TextRun({ text: statsParts.join("   |   "), color: "1E293B", bold: true, size: 21 })],
            spacing: { after: 240 },
        })
    );

    // ── 4. CAPTION / CONTENT ──────────────────────────────────────────────────

    docChildren.push(sectionDivider());
    docChildren.push(sectionHeading("Caption / Content"));
    docChildren.push(
        new Paragraph({
            children: [new TextRun({ text: processText(post.caption || post.content || "Empty content field.", 800, 20), color: "374151", size: 20 })],
            spacing: { after: 240 },
        })
    );

    // ── 5. VIOLATIONS ─────────────────────────────────────────────────────────

    docChildren.push(sectionDivider());
    docChildren.push(sectionHeading("Violations"));

    if (activeViolations.length > 0) {
        const severityColor = { high: "E11D48", medium: "EA580C", low: "D97706" };
        activeViolations.forEach(v => {
            docChildren.push(
                new Paragraph({
                    children: [
                        new TextRun({ text: "▸  ", color: severityColor[v.severity] || "EA580C", size: 24, bold: true }),
                        new TextRun({ text: v.title, color: "1E293B", bold: true, size: 20 }),
                        // new TextRun({ text: `   [${v.severity.toUpperCase()}]`, color: severityColor[v.severity] || "EA580C", size: 17 }),
                    ],
                    spacing: { before: 80, after: 80 },
                })
            );
        });
        docChildren.push(new Paragraph({ spacing: { after: 200 } }));
    } else {
        docChildren.push(
            new Paragraph({
                children: [new TextRun({ text: "No specific violations flagged by the system.", color: "94A3B8", size: 20 })],
                spacing: { after: 240 },
            })
        );
    }

    // ── 6. LEGAL FRAMEWORK (conditional) ─────────────────────────────────────

    if (legalCodes.length > 0) {
        docChildren.push(sectionDivider());
        docChildren.push(sectionHeading("Legal Framework"));
        docChildren.push(
            new Paragraph({
                children: [new TextRun({ text: legalCodes.join("  ·  "), color: "7C3AED", bold: true, size: 20 })],
                spacing: { after: 240 },
            })
        );
    }

    // ── 7. ANALYSIS & COMPLETE REASONING ─────────────────────────────────────

    docChildren.push(sectionDivider());
    docChildren.push(sectionHeading("Analysis & Complete Reasoning"));

    // Split reasoning into paragraphs if it contains newlines
    const reasoningParagraphs = reasoning.split(/\n+/).filter(p => p.trim().length > 0);
    reasoningParagraphs.forEach((para, idx) => {
        docChildren.push(
            new Paragraph({
                children: [new TextRun({ text: para.trim(), color: "374151", size: 20 })],
                spacing: { before: idx === 0 ? 0 : 120, after: 120 },
            })
        );
    });
    docChildren.push(new Paragraph({ spacing: { after: 240 } }));

    // ── 8. CLIENT NOTES & COMMENTS (conditional) ──────────────────────────────

    if (parsedComments && parsedComments.length > 0) {
        docChildren.push(sectionDivider());
        docChildren.push(sectionHeading("Client Notes & Comments"));

        parsedComments.forEach((comment) => {
            const commentParts = [
                new TextRun({ text: `"${comment.text}"`, color: "92400E", size: 20, italics: true }),
            ];
            if (comment.email || comment.created_at) {
                const meta = [comment.email, comment.created_at ? formatCompleteDate(comment.created_at) : null].filter(Boolean).join(" · ");
                commentParts.push(new TextRun({ text: `\n— ${meta}`, color: "B45309", size: 16 }));
            }
            docChildren.push(new Paragraph({ children: commentParts, spacing: { before: 80, after: 200 } }));
        });
    }

    // ── Trailing space before footer
    docChildren.push(new Paragraph({ spacing: { after: 400 } }));

    // ─── Document config ──────────────────────────────────────────────────────

    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: { font: "Calibri" },
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
                                                    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Case ID: ${String(post._id).toUpperCase()}`, bold: true, size: 14, color: "64748B" })], spacing: { after: 80 } }),
                                                ],
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                            new Paragraph({ spacing: { after: 320 } }),
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
    const fileName = `Case_${post._id}_${new Date().toISOString().split('T')[0]}.docx`;
    saveAs(blob, fileName);
};
