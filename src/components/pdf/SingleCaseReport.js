import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Link } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { registerFonts } from './fontRegistration';

// --- FONT REGISTRATION ---
registerFonts();

// --- THEME & STYLES ---
const Theme = {
    PRIMARY_BLUE: '#1E3A8A', // Formal Dark Blue
    SECONDARY_GRAY: '#4B5563',
    BORDER_DARK: '#1F2937',
    BORDER_LIGHT: '#E5E7EB',
    RED_ALERT: '#B91C1C',
    AMBER_WARN: '#D97706',
    GREEN_SAFE: '#059669',
    BG_SECTION: '#F9FAFB',
};

const styles = StyleSheet.create({
    page: {
        paddingTop: 40,
        paddingHorizontal: 40,
        paddingBottom: 70, // Increased to protect footer
        fontFamily: 'Outfit',
        backgroundColor: '#FFFFFF',
        flexDirection: 'column',
    },
    // Unified Header (Parity with CasesList)
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderBottomWidth: 2,
        borderBottomColor: Theme.PRIMARY_BLUE,
        paddingBottom: 15,
        marginBottom: 20,
    },
    headerLeft: {
        flexDirection: 'column',
    },
    headerRight: {
        flexDirection: 'column',
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: Theme.PRIMARY_BLUE,
        letterSpacing: 1,
    },
    subtitle: {
        fontSize: 10,
        color: Theme.SECONDARY_GRAY,
        marginTop: 2,
        textTransform: 'uppercase',
    },
    headerInfo: {
        fontSize: 9,
        color: Theme.SECONDARY_GRAY,
    },

    // Report Section Styling
    sectionHeader: {
        fontSize: 13,
        fontWeight: 'bold',
        color: Theme.PRIMARY_BLUE,
        backgroundColor: Theme.BG_SECTION,
        padding: 6,
        paddingLeft: 10,
        borderLeftWidth: 3,
        borderLeftColor: Theme.PRIMARY_BLUE,
        marginBottom: 12,
        marginTop: 18,
        textTransform: 'uppercase',
    },

    // Data Grid
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 10,
    },
    field: {
        width: '50%',
        marginBottom: 10,
    },
    fullField: {
        width: '100%',
        marginBottom: 12,
    },
    label: {
        fontSize: 8,
        fontWeight: 'bold',
        color: Theme.SECONDARY_GRAY,
        textTransform: 'uppercase',
        marginBottom: 3,
        letterSpacing: 0.5,
    },
    value: {
        fontSize: 10,
        color: '#111827',
        lineHeight: 1.4,
    },
    valueBold: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#111827',
    },
    link: {
        fontSize: 10,
        color: '#2563EB',
        textDecoration: 'none',
    },

    // Content Evidence Container
    evidenceContainer: {
        flexDirection: 'column',
        gap: 15,
        width: '100%',
        alignItems: 'center',
    },

    // Image Container
    imageWrapper: {
        borderWidth: 1,
        borderColor: Theme.BORDER_LIGHT,
        borderRadius: 2,
        overflow: 'hidden',
        backgroundColor: '#f8f9fa',
        alignSelf: 'center',
    },
    evidenceImage: {
        maxWidth: '100%',
        maxHeight: 400,
        objectFit: 'contain',
    },

    // Formal Text Blocks
    formalTextBox: {
        padding: 10,
        borderWidth: 0.5,
        borderColor: Theme.BORDER_LIGHT,
        backgroundColor: '#FCFDFF',
        borderRadius: 2,
        marginTop: 4,
        width: '100%',
    },
    textDescription: {
        marginBottom: 10,
        fontSize: 9,
        lineHeight: 1.6,
        color: '#374151',
    },

    // Intelligence Summary (Text based)
    riskRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 10,
    },
    riskTag: {
        fontSize: 9,
        fontWeight: 'bold',
        color: 'white',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 2,
    },

    signalsList: {
        flexDirection: 'column',
        gap: 8,
        marginTop: 5,
    },
    signalEntry: {
        flexDirection: 'row',
        borderBottomWidth: 0.5,
        borderBottomColor: '#F3F4F6',
        paddingBottom: 4,
    },
    signalLabel: {
        width: '30%',
        fontSize: 9,
        fontWeight: 'bold',
        color: Theme.SECONDARY_GRAY,
    },
    signalValue: {
        flex: 1,
        fontSize: 9,
        color: Theme.PRIMARY_BLUE,
        fontWeight: 'medium',
    },
    signalValueRed: {
        flex: 1,
        fontSize: 9,
        color: Theme.RED_ALERT,
        fontWeight: 'medium',
    },
    signalValueGreen: {
        flex: 1,
        fontSize: 9,
        color: Theme.GREEN_SAFE,
        fontWeight: 'medium',
    },

    footer: {
        position: 'absolute',
        bottom: 25,
        left: 40,
        right: 40,
        textAlign: 'center',
        fontSize: 8,
        color: Theme.SECONDARY_GRAY,
        borderTopWidth: 0.5,
        borderTopColor: Theme.BORDER_LIGHT,
        paddingTop: 10,
    }
});

/**
 * Sanitizes text to only allow standard English (ASCII) and Emojis.
 */
const sanitizeText = (text) => {
    if (!text) return '';
    return Array.from(text).map(char => {
        const codePoint = char.codePointAt(0);
        if ((codePoint >= 32 && codePoint <= 126) || codePoint === 10 || codePoint === 13 || codePoint === 9) {
            return char;
        }
        const isEmoji = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}]/u.test(char);
        if (isEmoji) return char;
        return '[]';
    }).join('');
};

const PageHeader = () => (
    <View style={styles.header} fixed>
        <View style={styles.headerLeft}>
            <Text style={styles.title}>OVERWATCH</Text>
            <Text style={styles.subtitle}>Digital Intelligence & Compliance Report</Text>
        </View>
        <View style={styles.headerRight}>
            <Text style={styles.headerInfo}>SECURED BY CONTRAILS AI</Text>
            <Text style={[styles.headerInfo, { fontWeight: 'bold' }]}>{format(new Date(), 'dd/MM/yyyy')} IST</Text>
        </View>
    </View>
);

const PageFooter = () => (
    <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) => (
        `CONFIDENTIAL - PROPERTY OF CONTRAILS AI | PAGE ${pageNumber} OF ${totalPages}`
    )} />
);

export const SingleCaseReportDocument = ({ post, compressedImage }) => {
    const review = post.review_details || {};
    const analysis = post.analysis_results || {};
    const riskScore = review.threat_score ?? analysis.risk_score ?? 0;

    // Urgency Calculation
    let urgency = "Low";
    if (riskScore >= 90) urgency = "Critical";
    else if (riskScore >= 75) urgency = "High";
    else if (riskScore > 40) urgency = "Medium";

    // Policy / Category
    let category = (review.primary_threat_type || review.threat_type || analysis.category || 'General Violation').replace(/_/g, ' ');

    const disclosureDate = post.sourcing_date?.["$date"] || post.sourcing_date || post.metadata?.sourcing_date?.["$date"] || new Date();
    const discoveryFormatted = format(new Date(disclosureDate), 'dd/MM/yyyy, HH:mm') + ' IST';

    const isPoiPresent = review.flags?.poi_confirmed ?? (analysis.poi_check?.poi_name_found || analysis.poi_check?.face_present) ?? false;
    const isAigc = review.flags?.is_aigc ?? analysis.aigc_check?.is_aigc ?? false;
    const isHateSpeech = review.flags?.is_hate_speech ?? (analysis.hate_speech_check?.is_safe === false) ?? false;
    const isNsfw = review.flags?.is_nsfw ?? (analysis.nsfw_check?.is_safe === false) ?? false;
    const isFraud = review.flags?.is_fraud ?? (analysis.fraud_check?.is_fraud === true) ?? false;
    const isAssetMisuse = review.flags?.is_asset_misuse ?? (analysis.asset_misuse_check?.is_asset_misuse === true) ?? false;

    const harmStatement = review.notes || analysis.categorization_reason || "Analyzed content suggests a potential breach of community standards regarding " + category.toLowerCase() + ".";

    const riskColor = riskScore >= 75 ? Theme.RED_ALERT : riskScore > 40 ? Theme.AMBER_WARN : Theme.GREEN_SAFE;

    // Image URL Resolution: Try signed URL first, then fallbacks from various possible paths
    const imageUrl = compressedImage || 
                     post.signedImageUrl || 
                     post.image_url || 
                     (post.post_content?.media_urls?.[0]?.s3_url) || 
                     (post.media_urls?.[0]?.s3_url) || 
                     (post.post_content?.media_urls?.[0]?.original_url) || 
                     null;
    return (
        <Document title={`Report_${post._id}`}>
            {/* PAGE 1: PRIMARY EVIDENCE */}
            <Page size="A4" style={styles.page}>
                <PageHeader />

                {/* Section 1: Case Overview */}
                <Text style={styles.sectionHeader}>CASE OVERVIEW</Text>
                <View style={styles.grid}>
                    <View style={styles.field}>
                        <Text style={styles.label}>Internal Case ID</Text>
                        <Text style={styles.valueBold}>{sanitizeText(String(post._id))}</Text>
                    </View>
                    <View style={styles.field}>
                        <Text style={styles.label}>Platform</Text>
                        <Text style={[styles.valueBold, { textTransform: 'capitalize' }]}>{sanitizeText(post.platform)}</Text>
                    </View>
                    <View style={styles.field}>
                        <Text style={styles.label}>Date & Time of Discovery</Text>
                        <Text style={styles.value}>{sanitizeText(discoveryFormatted)}</Text>
                    </View>
                    <View style={styles.field}>
                        <Text style={styles.label}>Urgency Level</Text>
                        <Text style={[styles.valueBold, { color: riskColor }]}>
                            {urgency}
                        </Text>
                    </View>
                </View>

                {/* Section 2: Violation Details */}
                <Text style={styles.sectionHeader}>VIOLATION DETAILS</Text>
                <View style={styles.grid}>
                    <View style={styles.fullField}>
                        <Text style={styles.label}>Direct Link to Post/Video</Text>
                        <Link src={post.original_url || post.url || "#"} style={styles.link}>
                            {sanitizeText(post.original_url || post.url || "N/A")}
                        </Link>
                    </View>
                    <View style={styles.field}>
                        <Text style={styles.label}>Target User/Handle</Text>
                        <Link src={post.user?.url || "#"} style={styles.link}>
                            @{sanitizeText(post.user?.username || 'unknown')}
                        </Link>
                    </View>
                    <View style={styles.field}>
                        <Text style={styles.label}>Specific Policy Violated</Text>
                        <Text style={[styles.valueBold, { textTransform: 'capitalize' }]}>{sanitizeText(category)}</Text>
                    </View>
                </View>

                {/* Section 3: Content Evidence */}
                <Text style={styles.sectionHeader}>CONTENT EVIDENCE</Text>

                <View style={styles.evidenceContainer}>
                    {imageUrl && (
                        <View style={styles.imageWrapper} wrap={false}>
                            <Image
                                src={imageUrl}
                                style={styles.evidenceImage}
                            />
                        </View>
                    )}
                    <View style={{ width: '100%' }}>
                        <Text style={styles.label}>Transcript / Description Summary</Text>
                        <View style={styles.formalTextBox}>
                            <Text style={styles.textDescription}>{sanitizeText(post.caption || post.content || "No transcript available.")}</Text>
                        </View>
                    </View>
                </View>

                <PageFooter />
            </Page>

            {/* PAGE 2: INTELLIGENCE & OBSERVATIONS */}
            <Page size="A4" style={styles.page}>
                <PageHeader />

                {/* Section 4: Intelligence & Analyst Observations */}
                <Text style={styles.sectionHeader}>INTELLIGENCE & ANALYST OBSERVATIONS</Text>

                <View style={styles.grid}>
                    <View style={styles.field}>
                        <Text style={styles.label}>Consolidated Risk Index</Text>
                        <View style={styles.riskRow}>
                            <Text style={[styles.riskTag, { backgroundColor: riskColor }]}>{riskScore}/100</Text>
                            <Text style={[styles.valueBold, { textTransform: 'uppercase' }]}>{urgency} Risk</Text>
                        </View>
                    </View>
                    <View style={styles.field}>
                        <Text style={styles.label}>Violation Category</Text>
                        <Text style={[styles.valueBold, { textTransform: 'capitalize' }]}>{category}</Text>
                    </View>
                </View>

                {/* Harm Statement */}
                <View style={styles.fullField}>
                    <Text style={styles.label}>Potential Harm Statement</Text>
                    <View style={[styles.formalTextBox, { borderLeftWidth: 2, borderLeftColor: Theme.RED_ALERT }]}>
                        <Text style={styles.textDescription}>{sanitizeText(harmStatement)}</Text>
                    </View>
                </View>

                {/* Detection Signals */}
                <View style={styles.fullField}>
                    <Text style={styles.label}>Automated Detection Signals</Text>
                    <View style={styles.signalsList}>
                        <View style={styles.signalEntry}>
                            <Text style={styles.signalLabel}>POI Identification:</Text>
                            <Text style={styles.signalValue}>{isPoiPresent ? (analysis.poi_check?.poi_names?.join(', ') || 'Identified') : 'Negative'}</Text>
                        </View>
                        <View style={styles.signalEntry}>
                            <Text style={styles.signalLabel}>AI Synthetic Media:</Text>
                            <Text style={isAigc ? styles.signalValueRed : styles.signalValueGreen}>{isAigc ? 'Positive' : 'Negative'}</Text>
                        </View>
                        <View style={styles.signalEntry}>
                            <Text style={styles.signalLabel}>Hate Speech Flag:</Text>
                            <Text style={isHateSpeech ? styles.signalValueRed : styles.signalValueGreen}>{isHateSpeech ? 'Positive' : 'Negative'}</Text>
                        </View>
                        <View style={styles.signalEntry}>
                            <Text style={styles.signalLabel}>Adult Content:</Text>
                            <Text style={isNsfw ? styles.signalValueRed : styles.signalValueGreen}>{isNsfw ? 'Positive' : 'Negative'}</Text>
                        </View>
                        <View style={styles.signalEntry}>
                            <Text style={styles.signalLabel}>Financial Fraud:</Text>
                            <Text style={isFraud ? styles.signalValueRed : styles.signalValueGreen}>{isFraud ? 'Positive' : 'Negative'}</Text>
                        </View>
                        <View style={styles.signalEntry}>
                            <Text style={styles.signalLabel}>Asset Misuse:</Text>
                            <Text style={isAssetMisuse ? styles.signalValueRed : styles.signalValueGreen}>{isAssetMisuse ? 'Positive' : 'Negative'}</Text>
                        </View>
                    </View>
                </View>

                {/* Reviewer Note (Formalized) */}
                {review.reviewer_comments && (
                    <View style={[styles.fullField, { marginTop: 10 }]}>
                        <Text style={styles.label}>Reviewer Observations & Recommendations</Text>
                        <View style={styles.formalTextBox}>
                            <Text style={styles.textDescription}>{sanitizeText(review.reviewer_comments)}</Text>
                        </View>
                        <Text style={[styles.headerInfo, { marginTop: 8, fontSize: 8 }]}>
                            Verified by Overwatch Compliance Analyst on {discoveryFormatted}
                        </Text>
                    </View>
                )}

                <PageFooter />
            </Page>
        </Document>
    );
};

export default SingleCaseReportDocument;
