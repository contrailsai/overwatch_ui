import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Link } from '@react-pdf/renderer';
import { format } from 'date-fns';
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
    SAFE: '#64748B',
};

const styles = StyleSheet.create({
    page: {
        paddingTop: 25,
        paddingHorizontal: 25,
        paddingBottom: 35,
        fontFamily: 'Outfit',
        backgroundColor: '#FFFFFF',
    },
    // ID-in-Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: Theme.BORDER_LIGHT,
        paddingBottom: 8,
        marginBottom: 12,
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
        letterSpacing: 2,
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

    // Layout Sections - Minimized Gaps
    topSection: {
        marginBottom: 12,
    },
    splitSection: {
        flexDirection: 'row',
        gap: 15,
    },
    leftCol: {
        width: '58%',
    },
    rightCol: {
        width: '38%',
    },

    sectionLabel: {
        fontSize: 7,
        fontWeight: '900',
        color: Theme.SECONDARY_GRAY,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4,
    },

    // Analysis Top Box
    reviewCard: {
        backgroundColor: Theme.BG_SECTION,
        borderWidth: 0.5,
        borderColor: Theme.BORDER_LIGHT,
        borderRadius: 6,
        padding: 10,
        flexDirection: 'column',
        gap: 8,
    },
    riskBox: {
        flexDirection: 'column',
    },
    riskLabel: {
        fontSize: 14,
        fontWeight: '900',
        textTransform: 'uppercase',
    },

    reasoningText: {
        fontSize: 8,
        lineHeight: 1.5,
        color: '#334155',
        marginTop: 4,
    },

    // Media
    imageWrapper: {
        borderWidth: 0.5,
        borderColor: Theme.BORDER_LIGHT,
        borderRadius: 6,
        overflow: 'hidden',
        backgroundColor: '#0F172A',
        width: '100%',
        marginBottom: 8,
    },
    evidenceImage: {
        width: '100%',
        height: 200,
        objectFit: 'contain',
    },
    captionBox: {
        padding: 8,
        backgroundColor: '#FFFFFF',
        borderWidth: 0.5,
        borderColor: Theme.BORDER_LIGHT,
        borderRadius: 4,
    },
    captionText: {
        fontSize: 7.5,
        lineHeight: 1.4,
        color: '#475569',
    },

    // Right Col Items
    entityInfo: {
        marginBottom: 10,
    },
    handleText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: Theme.PRIMARY_BLUE,
    },
    platformText: {
        paddingTop: 4,
        fontSize: 8,
        color: Theme.SECONDARY_GRAY,
    },

    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
        backgroundColor: Theme.BG_SECTION,
        padding: 6,
        borderRadius: 4,
    },
    metricItem: {
        alignItems: 'center',
    },
    metricValue: {
        fontSize: 9,
        fontWeight: 'bold',
        color: Theme.PRIMARY_BLUE,
    },
    metricLabel: {
        fontSize: 6,
        color: Theme.SECONDARY_GRAY,
        textTransform: 'uppercase',
    },

    dateRow: {
        marginBottom: 12,
    },
    dateLabel: {
        fontSize: 7,
        fontWeight: 'bold',
        color: Theme.SECONDARY_GRAY,
    },
    dateValue: {
        fontSize: 8,
        color: Theme.PRIMARY_BLUE,
    },

    // Violation Badges
    violationGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    violationBadge: {
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 3,
        borderWidth: 0.5,
        flexDirection: 'row',
        alignItems: 'center',
    },
    violationText: {
        fontSize: 7,
        fontWeight: 'bold',
    },

    link: {
        fontSize: 7,
        color: '#3B82F6',
        textDecoration: 'none',
        marginTop: 4,
    },

    footer: {
        position: 'absolute',
        bottom: 15,
        left: 25,
        right: 25,
        textAlign: 'center',
        fontSize: 6.5,
        color: Theme.SECONDARY_GRAY,
        borderTopWidth: 0.5,
        borderTopColor: Theme.BORDER_LIGHT,
        paddingTop: 8,
    }
});

const processText = (text, maxLength = 300) => {
    if (!text) return '';
    let sanitized = Array.from(text).filter(char => {
        const cp = char.codePointAt(0);
        return (cp >= 32 && cp <= 126) || cp === 10 || cp === 13 || cp === 9 ||
            /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}]/u.test(char);
    }).join('');
    return sanitized.length > maxLength ? sanitized.substring(0, maxLength) + '...' : sanitized;
};

const getRiskLabel = (score) => {
    if (score >= 96) return { label: 'High Risk', color: Theme.RISK_HIGH, bg: '#FFF1F2' };
    if (score >= 76) return { label: 'Medium Risk', color: Theme.RISK_MEDIUM, bg: '#FFF7ED' };
    if (score >= 41) return { label: 'Low Risk', color: Theme.RISK_LOW, bg: '#FFFBEB' };
    return { label: 'Safe Content', color: Theme.SAFE, bg: '#F8FAFC' };
};

const PageHeader = ({ caseId }) => (
    <View style={styles.header} fixed>
        <View>
            <Text style={styles.title}>OVERWATCH</Text>
        </View>
        <View style={styles.headerRight}>
            <Text style={styles.headerDate}>{format(new Date(), 'dd/MM/yyyy')}</Text>
            <Text style={styles.headerID}>CASEREF: {String(caseId).toUpperCase()}</Text>
        </View>
    </View>
);

const PageFooter = () => (
    <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) => (
        `CONFIDENTIAL DOCUMENT - PROPERTY OF CONTRAILS AI | PAGE ${pageNumber} OF ${totalPages}`
    )} />
);

export const SingleCaseReportDocument = ({ post, project, compressedImage }) => {
    const review = post.review_details || {};
    const analysis = post.analysis_results || {};
    const riskScore = review.threat_score ?? analysis.risk_score ?? 0;
    const riskInfo = getRiskLabel(riskScore);

    const reasoning = review.reasoning || analysis.categorization_reason || "Analyzed content for policy adherence.";

    // Active Violations Mapping
    const projectLabels = project?.project_details?.labels || [];
    const activeViolations = [];

    projectLabels.forEach(label => {
        if (review.flags?.[label.name] === true) {
            const labelTitle = label.name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            activeViolations.push({ title: labelTitle, severity: label.severity });
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
            activeViolations.push({ title, severity: 'medium' });
        }
    });

    // Dates & Metrics
    let posted_date = "N/A";
    let sourced_date = "N/A";

    if (post.posted_date) posted_date = format(new Date(post.posted_date), "dd/MM/yyyy");
    else if (post.metadata?.posted_date) posted_date = format(new Date(post.metadata.posted_date), "dd/MM/yyyy");
    else if (post.timestamp) posted_date = format(new Date(post.timestamp), "dd/MM/yyyy");
    else if (post.sourcing_date) posted_date = format(new Date(post.sourcing_date), "dd/MM/yyyy");

    if (post.metadata?.created_at) sourced_date = format(new Date(post.metadata.created_at), "dd/MM/yyyy");
    else if (post.created_at) sourced_date = format(new Date(post.created_at), "dd/MM/yyyy");

    const stats = post.stats || {};
    const imageUrl = compressedImage || post.signedImageUrl || post.image_url || null;

    return (
        <Document title={`CaseExport_${post._id}`}>
            <Page size="A4" style={styles.page}>
                <PageHeader caseId={post._id} />

                {/* SECTION 1: ANALYSIS & REVIEW */}
                <View style={styles.topSection}>
                    <Text style={styles.sectionLabel}>Analysis & Review</Text>
                    <View style={styles.reviewCard}>
                        <View style={styles.riskBox}>
                            <Text style={[styles.riskLabel, { color: riskInfo.color }]}>{riskInfo.label}</Text>
                            <Text style={styles.reasoningText}>{processText(reasoning, 220)}</Text>
                        </View>
                    </View>
                </View>

                {/* SECTION 2: CONTENT & INTELLIGENCE */}
                <View style={styles.splitSection}>
                    {/* LEFT: VISUALS */}
                    <View style={styles.leftCol}>
                        <Text style={styles.sectionLabel}>Visual Evidence</Text>
                        {imageUrl && (
                            <View style={styles.imageWrapper}>
                                <Image src={imageUrl} style={styles.evidenceImage} />
                            </View>
                        )}
                        <View style={styles.captionBox}>
                            <Text style={styles.captionText}>{processText(post.caption || post.content || "Empty content field.", 400)}</Text>
                        </View>
                    </View>

                    {/* RIGHT: TARGET DISCOVERY */}
                    <View style={styles.rightCol}>
                        <Text style={styles.sectionLabel}>Target Entity</Text>
                        <View style={styles.entityInfo}>
                            <Text style={styles.handleText}>@{post.user?.username || 'unknown'}</Text>
                            <Text style={styles.platformText}>Source Platform: {post.platform.toUpperCase()}</Text>
                        </View>

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
                            {
                                stats.share_count && stats.share_count !== 0 &&
                                <View style={styles.metricItem}>
                                    <Text style={styles.metricValue}>{stats.share_count ? stats.share_count.toLocaleString() : '0'}</Text>
                                    <Text style={styles.metricLabel}>Shares</Text>
                                </View>
                            }
                            {
                                stats.view_count && stats.view_count !== 0 &&
                                <View style={styles.metricItem}>
                                    <Text style={styles.metricValue}>{stats.view_count ? stats.view_count.toLocaleString() : '0'}</Text>
                                    <Text style={styles.metricLabel}>Views</Text>
                                </View>
                            }
                        </View>

                        <View style={styles.dateRow}>
                            <Text style={styles.dateLabel}>DATE POSTED</Text>
                            <Text style={styles.dateValue}>{posted_date}</Text>
                        </View>
                        <View style={styles.dateRow}>
                            <Text style={styles.dateLabel}>DATE SOURCED</Text>
                            <Text style={styles.dateValue}>{sourced_date}</Text>
                        </View>

                        <Text style={styles.sectionLabel}>Violations Detected</Text>
                        {activeViolations.length > 0 ? (
                            <View style={styles.violationGrid}>
                                {activeViolations.map((v, i) => {
                                    const vColor = v.severity === 'high' ? Theme.RISK_HIGH : v.severity === 'medium' ? Theme.RISK_MEDIUM : Theme.RISK_LOW;
                                    return (
                                        <View key={i} style={[styles.violationBadge, { borderColor: vColor + '40', backgroundColor: vColor + '10' }]}>
                                            <Text style={[styles.violationText, { color: vColor }]}>{v.title}</Text>
                                        </View>
                                    );
                                })}
                            </View>
                        ) : (
                            <Text style={{ fontSize: 7, color: Theme.SECONDARY_GRAY, italic: true }}>No specific violations flagged.</Text>
                        )}

                        <Text style={[styles.sectionLabel, { marginTop: 15 }]}>Primary URL</Text>
                        <Link src={post.original_url || post.url || "#"} style={styles.link}>
                            {processText(post.original_url || post.url || "N/A", 50)}
                        </Link>
                    </View>
                </View>

                <PageFooter />
            </Page>
        </Document>
    );
};

export default SingleCaseReportDocument;
