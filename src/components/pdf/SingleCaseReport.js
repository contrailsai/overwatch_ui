import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Link } from '@react-pdf/renderer';
import { format, isValid, parseISO } from 'date-fns';
import { registerFonts } from './fontRegistration';

// --- FONT REGISTRATION ---
registerFonts();

// --- THEME & STYLES ---
const Theme = {
    PRIMARY_BLUE: '#1E293B',
    SECONDARY_GRAY: '#64748B',
    BORDER_LIGHT: '#E2E8F0',
    BG_SECTION: '#F8FAFC',
    RISK_HIGH: '#F43F5E',
    RISK_MEDIUM: '#F97316',
    RISK_LOW: '#F59E0B',
    SAFE: '#10B981', // Changed safe to a clear green
};

const styles = StyleSheet.create({
    page: {
        paddingTop: 30,
        paddingHorizontal: 30,
        paddingBottom: 40,
        fontFamily: 'Outfit',
        backgroundColor: '#FFFFFF',
    },
    // ID-in-Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: Theme.BORDER_LIGHT,
        paddingBottom: 12,
        marginBottom: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: '900',
        color: Theme.PRIMARY_BLUE,
        letterSpacing: 0.5,
    },
    subtitle: {
        fontSize: 7,
        color: Theme.SECONDARY_GRAY,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
    },
    headerRight: {
        alignItems: 'flex-end',
    },
    headerDate: {
        fontSize: 8,
        fontWeight: 'bold',
        color: Theme.PRIMARY_BLUE,
    },
    headerID: {
        fontSize: 6,
        fontWeight: 'bold',
        color: Theme.SECONDARY_GRAY,
        marginTop: 2,
    },

    // --- TOP BANNER (Details + Risk) ---
    topBanner: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: Theme.BG_SECTION,
        padding: 12,
        borderRadius: 6,
        borderWidth: 0.5,
        borderColor: Theme.BORDER_LIGHT,
        marginBottom: 16,
    },
    bannerLeft: {
        width: '65%',
        flexDirection: 'column',
        gap: 6,
    },
    bannerRight: {
        width: '30%',
        alignItems: 'flex-end',
        justifyContent: 'center',
    },

    // Risk Badge
    riskBadgeLarge: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 6,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    riskBadgeText: {
        fontSize: 14,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    // --- SPLIT LAYOUT ---
    splitSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    leftCol: {
        width: '55%',
        flexDirection: 'column',
        gap: 12,
    },
    rightCol: {
        width: '40%',
        flexDirection: 'column',
        gap: 12,
    },

    sectionLabel: {
        fontSize: 8,
        fontWeight: '900',
        color: Theme.SECONDARY_GRAY,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 6,
    },

    // --- LEFT COL ITEMS ---
    imageWrapper: {
        borderWidth: 0.5,
        borderColor: Theme.BORDER_LIGHT,
        borderRadius: 6,
        overflow: 'hidden',
        backgroundColor: '#0F172A',
        width: '100%',
    },
    evidenceImage: {
        width: '100%',
        height: 220,
        objectFit: 'contain',
    },
    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: Theme.BG_SECTION,
        padding: 8,
        borderRadius: 6,
        borderWidth: 0.5,
        borderColor: Theme.BORDER_LIGHT,
    },
    metricItem: {
        alignItems: 'center',
    },
    metricValue: {
        fontSize: 10,
        fontWeight: '900',
        color: Theme.PRIMARY_BLUE,
    },
    metricLabel: {
        fontSize: 6,
        color: Theme.SECONDARY_GRAY,
        textTransform: 'uppercase',
        marginTop: 2,
    },
    contentBox: {
        padding: 10,
        backgroundColor: Theme.BG_SECTION,
        borderWidth: 0.5,
        borderColor: Theme.BORDER_LIGHT,
        borderRadius: 6,
    },
    contentText: {
        fontSize: 8,
        lineHeight: 1.5,
        color: Theme.PRIMARY_BLUE,
    },

    // --- RIGHT COL ITEMS ---
    analysisBox: {
        padding: 8,
        backgroundColor: '#FFFFFF',
        borderWidth: 0.5,
        borderColor: Theme.BORDER_LIGHT,
        borderRadius: 6,
    },
    reasoningText: {
        fontSize: 8.5,
        lineHeight: 1.6,
        color: Theme.PRIMARY_BLUE,
        marginTop: 8,
    },
    violationGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    violationBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    violationText: {
        fontSize: 7.5,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    commentsBox: {
        padding: 6,
        backgroundColor: '#FFFBEB', // Light yellow tint for notes
        borderWidth: 0.5,
        borderColor: '#FDE68A',
        borderRadius: 6,
    },
    commentText: {
        fontSize: 8,
        lineHeight: 1.5,
        color: '#92400E',
        // fontStyle: 'italic',
    },
    singleComment: {
        marginBottom: 6,
    },
    commentMetaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 6,
    },
    commentMeta: {
        fontSize: 6,
        color: '#C28B6B', // Duller, more whitish/greyish color
        fontWeight: 'bold',
    },
    commentDivider: {
        borderBottomWidth: 0.5,
        borderBottomColor: '#FCD34D',
        marginVertical: 4,
    },

    // --- TYPOGRAPHY HELPERS ---
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    detailLabel: {
        fontSize: 7,
        fontWeight: 'bold',
        color: Theme.SECONDARY_GRAY,
        width: 65,
        textTransform: 'uppercase',
    },
    detailValue: {
        fontSize: 8,
        color: Theme.PRIMARY_BLUE,
        fontWeight: 'bold',
    },
    link: {
        fontSize: 8,
        color: '#3B82F6',
        textDecoration: 'none',
    },
    footer: {
        position: 'absolute',
        bottom: 20,
        left: 30,
        right: 30,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 6.5,
        color: Theme.SECONDARY_GRAY,
        borderTopWidth: 0.5,
        borderTopColor: Theme.BORDER_LIGHT,
        paddingTop: 10,
    },
    footerLeft: {
        textTransform: 'uppercase',
        fontWeight: 'bold',
    },
    footerCenter: {
        textTransform: 'uppercase',
    },
    footerRight: {
        textTransform: 'uppercase',
        fontWeight: 'bold',
    }
});

// --- UTILS ---
const processText = (text, maxLength = 500, maxLines = null) => {
    if (!text) return '';
    let sanitized = Array.from(text).filter(char => {
        const cp = char.codePointAt(0);
        return (cp >= 32 && cp <= 126) || cp === 10 || cp === 13 || cp === 9 ||
            /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}]/u.test(char);
    }).join('');

    let result = sanitized;
    let truncated = false;

    if (maxLines) {
        const lines = result.split(/\r\n|\r|\n/);
        if (lines.length > maxLines) {
            result = lines.slice(0, maxLines).join('\n');
            truncated = true;
        }
    }

    if (result.length > maxLength) {
        result = result.substring(0, maxLength);
        truncated = true;
    }

    return truncated ? result.trim() + '...' : result;
};

const formatCompleteDate = (dateInput) => {
    if (!dateInput) return "N/A";
    try {
        const dateObj = typeof dateInput === 'string' ? parseISO(dateInput) : new Date(dateInput);
        if (isValid(dateObj)) {
            // Displays: 02 Mar 2026, 02:30 PM
            return format(dateObj, "dd MMM yyyy, hh:mm a");
        }
    } catch (error) {
        return "N/A";
    }
    return "N/A";
};

const getRiskLabel = (score) => {
    if (score > 95) return { label: 'High Risk', color: Theme.RISK_HIGH, bg: '#FFF1F2' };
    if (score > 75) return { label: 'Medium Risk', color: Theme.RISK_MEDIUM, bg: '#FFF7ED' };
    if (score > 40) return { label: 'Low Risk', color: Theme.RISK_LOW, bg: '#FFFBEB' };
    return { label: 'Safe Content', color: Theme.SAFE, bg: '#ECFDF5' };
};

// --- SUB-COMPONENTS ---
const PageHeader = ({ caseId }) => (
    <View style={styles.header} fixed>
        <View>
            <Text style={styles.title}>OVERWATCH</Text>
            <Text style={styles.subtitle}>Threat Intelligence Platform</Text>
        </View>
        <View style={styles.headerRight}>
            <Text style={styles.headerDate}>{formatCompleteDate(new Date())} </Text>
            <Text style={styles.headerID}>CASE-ID: {String(caseId).toUpperCase()}</Text>
        </View>
    </View>
);

const PageFooter = () => (
    <View style={styles.footer} fixed>
        <Text style={styles.footerLeft}>CONFIDENTIAL DOCUMENT</Text>
        <Text style={styles.footerCenter}>POWERED BY CONTRAILS AI</Text>
        <Text style={styles.footerRight} render={({ pageNumber, totalPages }) => (
            `PAGE ${pageNumber} OF ${totalPages}`
        )} />
    </View>
);

// --- MAIN DOCUMENT ---
export const SingleCasePage = ({ post, project, compressedImage }) => {
    const review = post.review_details || {};
    const analysis = post.analysis_results || {};
    const riskScore = review.threat_score ?? analysis.risk_score ?? 0;
    const riskInfo = getRiskLabel(riskScore);

    const reasoning = review.reasoning || analysis.categorization_reason || "Analyzed content for policy adherence. No detailed reasoning provided.";
    const simpleReportDescription = review.simple_report_description || analysis.simple_report_description || null;

    // Safely parse project details if it's a string
    let projectDetails = project?.project_details;
    if (typeof projectDetails === 'string') {
        try {
            projectDetails = JSON.parse(projectDetails);
        } catch (e) {
            projectDetails = {};
        }
    }

    // Active Violations Mapping
    const projectLabels = projectDetails?.labels || [];
    const activeViolations = [];
    const severityMap = { high: 1, medium: 2, low: 3 };

    // Check if it's a legacy case (no severities defined in project labels)
    const isLegacyCase = projectLabels.length > 0 && projectLabels.every(l => !l.severity);

    projectLabels.forEach(label => {
        if (review.flags?.[label.name] === true) {
            const labelTitle = label.name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            activeViolations.push({
                title: labelTitle,
                severity: label.severity || 'medium',
                order: severityMap[label.severity] || 4
            });
        }
    });

    const legacyFlags = {
        is_nsfw: "NSFW Content",
        is_hate_speech: "Hate Speech",
        is_fake_news: "Misinformation",
        is_fraud: "Fraud",
        is_asset_misuse: "Asset Misuse",
        is_terrorism: "Terrorism",
        is_violence: "Violence"
    };

    Object.entries(legacyFlags).forEach(([key, title]) => {
        if (review.flags?.[key] === true && !activeViolations.some(v => v.title === title)) {
            activeViolations.push({
                title,
                severity: 'medium',
                order: severityMap['medium']
            });
        }
    });

    // Sort violations: High > Medium > Low
    activeViolations.sort((a, b) => a.order - b.order);

    // Dates & Metrics
    const posted_date = formatCompleteDate(post.posted_date || post.metadata?.posted_date || post.timestamp || post.sourcing_date);
    const sourced_date = formatCompleteDate(post.metadata?.created_at || post.created_at);
    const reviewedDate = formatCompleteDate(post.updated_at || review.reviewed_at || post.created_at);


    const stats = post.stats || {};
    const imageUrl = compressedImage || post.signedImageUrl || post.image_url || null;
    const legalCodes = review.legal_codes || [];

    // Safely parse client notes/comments
    let parsedComments = [];
    const rawComments = post.client_notes || post.notes || post.comments;

    if (Array.isArray(rawComments)) {
        parsedComments = rawComments;
    } else if (typeof rawComments === 'string') {
        try {
            parsedComments = JSON.parse(rawComments);
        } catch (e) {
            // If it fails to parse but isn't empty, treat it as a plain text comment
            if (rawComments.trim().length > 0 && rawComments !== '[]') {
                parsedComments = [{ text: rawComments }];
            }
        }
    }
    // Fallbacks for client comments/notes
    // const clientNotes = post.client_notes || post.notes || post.comments || "No client notes or comments provided for this case.";

    return (
        <Page size="A4" style={styles.page}>
            <PageHeader caseId={post._id} />

            {/* --- SECTION 1: TOP BANNER --- */}
            <View style={styles.topBanner}>
                <View style={styles.bannerLeft}>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Account:</Text>
                        <Text style={styles.detailValue}>@{post.user?.username || 'unknown'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Platform:</Text>
                        <Text style={styles.detailValue}>{(post.platform || 'Unknown').toUpperCase()}</Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>URL:</Text>
                        <Link src={post.original_url || post.url || "#"} style={styles.link}>
                            {processText(post.original_url || post.url || "N/A", 60)}
                        </Link>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Publish Date:</Text>
                        <Text style={styles.detailValue}>{posted_date}</Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Alert Date:</Text>
                        <Text style={styles.detailValue}>{sourced_date}</Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Review Date:</Text>
                        <Text style={styles.detailValue}>{reviewedDate}</Text>
                    </View>

                </View>

                <View style={styles.bannerRight}>
                    <View style={[styles.riskBadgeLarge, { backgroundColor: riskInfo.bg, borderColor: riskInfo.color }]}>
                        <Text style={[styles.riskBadgeText, { color: riskInfo.color }]}>{riskInfo.label}</Text>
                    </View>
                </View>
            </View>

            {/* --- SECTION 2: SPLIT CONTENT & ANALYSIS --- */}
            <View style={styles.splitSection}>

                {/* LEFT COL: CONTENT DETAILS */}
                <View style={styles.leftCol}>
                    <View>
                        <Text style={styles.sectionLabel}>Visual Evidence</Text>
                        {imageUrl ? (
                            <View style={styles.imageWrapper}>
                                <Image src={imageUrl} style={styles.evidenceImage} />
                            </View>
                        ) : (
                            <View style={[styles.imageWrapper, { height: 100, justifyContent: 'center', alignItems: 'center' }]}>
                                <Text style={{ color: Theme.SECONDARY_GRAY, fontSize: 8 }}>No Image Available</Text>
                            </View>
                        )}
                    </View>

                    <View>
                        <Text style={styles.sectionLabel}>Engagement Stats</Text>
                        <View style={styles.metricRow}>
                            <View style={styles.metricItem}>
                                <Text style={styles.metricValue}>{stats.like_count ? stats.like_count.toLocaleString() : '0'}</Text>
                                <Text style={styles.metricLabel}>Likes</Text>
                            </View>
                            <View style={styles.metricItem}>
                                <Text style={styles.metricValue}>{stats.comment_count ? stats.comment_count.toLocaleString() : '0'}</Text>
                                <Text style={styles.metricLabel}>Comments</Text>
                            </View>
                            {stats.share_count !== undefined && (
                                <View style={styles.metricItem}>
                                    <Text style={styles.metricValue}>{stats.share_count.toLocaleString()}</Text>
                                    <Text style={styles.metricLabel}>Shares</Text>
                                </View>
                            )}
                            {stats.view_count !== undefined && stats.view_count !== 0 && (
                                <View style={styles.metricItem}>
                                    <Text style={styles.metricValue}>{stats.view_count.toLocaleString()}</Text>
                                    <Text style={styles.metricLabel}>Views</Text>
                                </View>
                            )}
                        </View>
                    </View>

                    <View>
                        <Text style={styles.sectionLabel}>Caption / Content</Text>
                        <View style={styles.contentBox}>
                            <Text style={styles.contentText}>
                                {processText(post.caption || post.content || "Empty content field.", 600, 14)}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* RIGHT COL: ANALYSIS & THREATS */}
                <View style={styles.rightCol}>

                    <View>
                        <Text style={styles.sectionLabel}>Violations</Text>
                        <View style={styles.analysisBox}>
                            {activeViolations.length > 0 ? (
                                <View style={styles.violationGrid}>
                                    {activeViolations.map((v, i) => {
                                        // For older/legacy cases, use a uniform color (Theme.PRIMARY_BLUE or just the medium color)
                                        // The user said "show all of them in the same color" for older cases.
                                        let vColor;
                                        if (isLegacyCase) {
                                            vColor = Theme.PRIMARY_BLUE;
                                        } else {
                                            vColor = v.severity === 'high' ? Theme.RISK_HIGH : v.severity === 'medium' ? Theme.RISK_MEDIUM : Theme.RISK_LOW;
                                        }

                                        return (
                                            <View key={i} style={[styles.violationBadge, { borderColor: vColor, backgroundColor: vColor + '15' }]}>
                                                <Text style={[styles.violationText, { color: vColor }]}>{v.title}</Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            ) : (
                                <Text style={{ fontSize: 8, color: Theme.SECONDARY_GRAY }}>No specific violations flagged by the system.</Text>
                            )}
                        </View>
                    </View>

                    {legalCodes.length > 0 && (
                        <View>
                            <Text style={styles.sectionLabel}>Legal Framework</Text>
                            <View style={styles.analysisBox}>
                                <View style={styles.violationGrid}>
                                    {legalCodes.map((item, i) => {
                                        const code = typeof item === 'string' ? item : item.code;
                                        const projectCode = project?.project_details?.legal_codes?.find(pc => pc.name === code);
                                        const badgeContent = (
                                            <View style={[styles.violationBadge, { borderColor: '#8B5CF6', backgroundColor: '#8B5CF615' }]}>
                                                <Text style={[styles.violationText, { color: '#8B5CF6' }]}>{code}</Text>
                                            </View>
                                        );

                                        return (
                                            <View key={i}>
                                                {projectCode?.referenceLink ? (
                                                    <Link src={projectCode.referenceLink} style={{ textDecoration: 'none' }}>
                                                        {badgeContent}
                                                    </Link>
                                                ) : badgeContent}
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        </View>
                    )}

                    {simpleReportDescription && (
                        <View>
                            <Text style={styles.sectionLabel}>Simple Reasoning</Text>
                            <View style={[styles.analysisBox, { minHeight: 60 }]}>
                                <Text style={styles.reasoningText}>{simpleReportDescription}</Text>
                            </View>
                        </View>
                    )}

                    <View>
                        <Text style={styles.sectionLabel}>Analysis & Complete Reasoning</Text>
                        <View style={[styles.analysisBox, { minHeight: 120 }]}>
                            <Text style={styles.reasoningText}>{reasoning}</Text>
                        </View>
                    </View>

                    {parsedComments && parsedComments.length > 0 && (
                        <View>
                            <Text style={styles.sectionLabel}>Client Notes & Comments</Text>
                            <View style={styles.commentsBox}>
                                {parsedComments.map((comment, index) => (
                                    <View key={index} style={styles.singleComment}>
                                        <Text style={styles.commentText}>"{comment.text}"</Text>

                                        {/* Show email and date if they exist */}
                                        {(comment.email || comment.created_at) && (
                                            <View style={styles.commentMetaRow}>
                                                <Text style={styles.commentMeta}>
                                                    {comment.email || 'Unknown User'}
                                                </Text>
                                                {comment.created_at && (
                                                    <Text style={styles.commentMeta}>
                                                        {formatCompleteDate(comment.created_at)}
                                                    </Text>
                                                )}
                                            </View>
                                        )}

                                        {/* Divider between multiple comments */}
                                        {index < parsedComments.length - 1 && (
                                            <View style={styles.commentDivider} />
                                        )}
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                </View>
            </View>

            <PageFooter />
        </Page>
    );
};

export const SingleCaseReportDocument = ({ post, project, compressedImage }) => {
    return (
        <Document title={`CaseExport_${post._id}`}>
            <SingleCasePage post={post} project={project} compressedImage={compressedImage} />
        </Document>
    );
};

export default SingleCaseReportDocument;