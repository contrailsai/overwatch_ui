import {
    Document, Packer, Paragraph, TextRun, ImageRun,
    Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType,
    Header, Footer, PageNumber,
    VerticalAlign, ShadingType,
    HeadingLevel, ExternalHyperlink,
} from "docx";
import { saveAs } from "file-saver";
import { format, isValid, parseISO } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const formatCompleteDate = (dateInput) => {
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

export const processText = (text, maxLength = 500, maxLines = null) => {
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

export const base64ToUint8Array = (base64) => {
    const raw = window.atob(base64);
    const array = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) array[i] = raw.charCodeAt(i);
    return array;
};

export const getImageDimensions = (base64Src) => {
    return new Promise((resolve) => {
        const img = new window.Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => resolve({ width: 400, height: 400 }); // fallback
        img.src = base64Src;
    });
};

// ─── Border / Shading presets ─────────────────────────────────────────────────

export const noBorders = {
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
export const PAGE_WIDTH = 10080;

// A simple spacing paragraph
export const sectionDivider = (space = 300) =>
    new Paragraph({
        spacing: { before: 0, after: space },
    });

// Section heading paragraph
export const sectionHeading = (text) =>
    new Paragraph({
        children: [
            new TextRun({
                text: text.toUpperCase(),
                bold: true,
                color: "1E293B",
                size: 24,
            }),
        ],
        spacing: { before: 200, after: 100 },
    });

// Body text paragraph
export const bodyPara = (text, opts = {}) =>
    new Paragraph({
        children: [
            new TextRun({
                text,
                color: opts.color || "374151",
                size: opts.size || 20,
                bold: opts.bold || false,
            }),
        ],
        spacing: { before: opts.spaceBefore || 0, after: opts.spaceAfter || 100 },
    });

export const metaPara = (label, value, isUrl = false, linkOverride = null) => {
    const children = [
        new TextRun({ text: `${label}: `, bold: true, color: "1E293B", size: 22 }),
    ];

    if (isUrl && value && value !== "N/A") {
        children.push(
            new ExternalHyperlink({
                children: [
                    new TextRun({
                        text: value,
                        color: "2563EB",
                        size: 22,
                        underline: { color: "2563EB" },
                    }),
                ],
                link: linkOverride || value,
            })
        );
    } else {
        children.push(
            new TextRun({ text: value, color: "374151", size: 22 })
        );
    }

    return new Paragraph({
        children: children,
        spacing: { after: 60 },
    });
};

export const getCaseData = (post, project) => {
    const review = post.review_details || {};
    const analysis = post.analysis_results || {};
    const riskScore = review.threat_score ?? analysis.risk_score ?? 0;

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

    return {
        review, analysis, riskScore, reasoning, activeViolations,
        posted_date, sourced_date, reviewedDate, stats, legalCodes, parsedComments
    };
};

export const generateCaseSections = async (post, project, compressedImage, caseNumber = null) => {
    const {
        posted_date, sourced_date, reviewedDate, stats, legalCodes,
        activeViolations, reasoning, parsedComments
    } = getCaseData(post, project);

    const docChildren = [];

    // ── CASE NUMBER (Optional) ──
    if (caseNumber !== null) {
        docChildren.push(
            new Paragraph({
                children: [
                    new TextRun({ text: `CASE #${caseNumber}`, bold: true, size: 28, color: "2563EB" }),
                ],
                spacing: { before: 400, after: 200 },
            })
        );
    }

    // ── 1. BASIC META INFORMATION ──────────────────────────────────────────
    docChildren.push(metaPara("Account", `@${post.user?.username || 'unknown'}`));
    docChildren.push(metaPara("Platform", (post.platform || 'Unknown').toUpperCase()));
    const fullUrl = post.original_url || post.url;
    docChildren.push(metaPara("URL", processText(fullUrl || "N/A", 100), !!fullUrl, fullUrl));
    docChildren.push(metaPara("Posted", posted_date));
    docChildren.push(metaPara("Sourced", sourced_date));
    docChildren.push(metaPara("Reviewed", reviewedDate));

    docChildren.push(sectionDivider(200));

    // ── 2. VISUAL EVIDENCE ────────────────────────────────────────────────────
    let imageRun = null;
    if (compressedImage?.startsWith('data:image/')) {
        try {
            const dimensions = await getImageDimensions(compressedImage);

            const MAX_SIZE = 400;
            let { width, height } = dimensions;

            if (width > MAX_SIZE || height > MAX_SIZE) {
                if (width > height) {
                    height = Math.round((height * MAX_SIZE) / width);
                    width = MAX_SIZE;
                } else {
                    width = Math.round((width * MAX_SIZE) / height);
                    height = MAX_SIZE;
                }
            }

            const base64Data = compressedImage.split(',')[1];
            const uint8Arr = base64ToUint8Array(base64Data);
            imageRun = new ImageRun({ data: uint8Arr, transformation: { width, height } });
        } catch (err) {
            console.error("Failed to include image in DOCX", err);
        }
    }

    docChildren.push(sectionHeading("Visual Evidence"));

    if (imageRun) {
        docChildren.push(
            new Paragraph({ children: [imageRun], alignment: AlignmentType.CENTER })
        );
    } else {
        docChildren.push(
            new Paragraph({
                children: [new TextRun({ text: "No image available for this case.", color: "94A3B8", size: 20 })],
            })
        );
    }
    docChildren.push(sectionDivider(200));

    // ── 3. ENGAGEMENT STATS ───────────────────────────────────────────────────
    docChildren.push(sectionHeading("Engagement Stats"));

    const statsParts = [];
    statsParts.push(`Likes: ${stats.like_count ? stats.like_count.toLocaleString() : '0'}`);
    statsParts.push(`Comments: ${stats.comment_count ? stats.comment_count.toLocaleString() : '0'}`);
    if (stats.share_count !== undefined) statsParts.push(`Shares: ${stats.share_count.toLocaleString()}`);
    if (stats.view_count !== undefined && stats.view_count !== 0) statsParts.push(`Views: ${stats.view_count.toLocaleString()}`);

    docChildren.push(
        new Paragraph({
            children: [new TextRun({ text: statsParts.join("   |   "), color: "374151", size: 20 })],
        })
    );
    docChildren.push(sectionDivider(200));

    // ── 4. CAPTION / CONTENT ──────────────────────────────────────────────────
    docChildren.push(sectionHeading("Caption / Content"));
    docChildren.push(
        new Paragraph({
            children: [new TextRun({ text: processText(post.caption || post.content || "Empty content field.", 800, 20), color: "374151", size: 20 })],
        })
    );
    docChildren.push(sectionDivider(200));

    // ── 5. VIOLATIONS ─────────────────────────────────────────────────────────
    docChildren.push(sectionHeading("Violations"));

    if (activeViolations.length > 0) {
        activeViolations.forEach(v => {
            docChildren.push(
                new Paragraph({
                    children: [
                        new TextRun({ text: `• ${v.title}`, color: "374151", size: 20 }),
                    ],
                    spacing: { after: 40 },
                })
            );
        });
    } else {
        docChildren.push(
            new Paragraph({
                children: [new TextRun({ text: "No specific violations flagged by the system.", color: "94A3B8", size: 20 })],
            })
        );
    }
    docChildren.push(sectionDivider(200));

    // ── 6. LEGAL FRAMEWORK (conditional) ─────────────────────────────────────
    if (legalCodes.length > 0) {
        docChildren.push(sectionHeading("Legal Framework"));
        docChildren.push(
            new Paragraph({
                children: [new TextRun({ text: legalCodes.join("  ·  "), color: "374151", size: 20 })],
            })
        );
        docChildren.push(sectionDivider(200));
    }

    // ── 7. ANALYSIS & COMPLETE REASONING ─────────────────────────────────────
    docChildren.push(sectionHeading("Analysis & Complete Reasoning"));

    const reasoningParagraphs = reasoning.split(/\n+/).filter(p => p.trim().length > 0);
    reasoningParagraphs.forEach((para) => {
        docChildren.push(
            new Paragraph({
                children: [new TextRun({ text: para.trim(), color: "374151", size: 20 })],
                spacing: { after: 80 },
            })
        );
    });
    docChildren.push(sectionDivider(200));

    return docChildren;
};

// ─── Main export ──────────────────────────────────────────────────────────────

export const generateSingleCaseDocx = async (post, project, compressedImage) => {
    const docChildren = await generateCaseSections(post, project, compressedImage);

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
                            // new Paragraph({ spacing: { after: 320 } }),
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
