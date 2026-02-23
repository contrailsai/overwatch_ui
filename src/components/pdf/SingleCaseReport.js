import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font, Image, Link } from '@react-pdf/renderer';
import { format } from 'date-fns';

// --- FONT REGISTRATION ---
Font.register({
    family: 'Outfit',
    fonts: [
        { src: '/fonts/Outfit-Regular.ttf' },
        { src: '/fonts/Outfit-Bold.ttf', fontWeight: 'bold' },
        { src: '/fonts/Outfit-Medium.ttf', fontWeight: 'medium' },
    ]
});

Font.registerEmojiSource({
    format: 'png',
    url: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/'
});

// --- THEME & STYLES ---
const Theme = {
    PRIMARY_BLUE: '#174AFF',
    ACCENT_CYAN: '#0096C8',
    RED_ALERT: '#DC3232',
    ORANGE_WARN: '#F59E0B',
    GREEN_SAFE: '#28A03C',
    TEXT_MAIN: '#1E1E23',
    TEXT_SECONDARY: '#50555F',
    TEXT_TERTIARY: '#8C919B',
    BG_PAGE: '#FFFFFF',
    BG_LIGHT_BLUE: '#F8FAFF',
    BG_HEADER: '#F2F4F8',
    BG_PLACEHOLDER: '#EBEBEB',
    BORDER_COLOR: '#DCDCE1',
};

const styles = StyleSheet.create({
    page: {
        padding: 30,
        fontFamily: 'Outfit',
        backgroundColor: Theme.BG_PAGE,
        flexDirection: 'column',
    },
    // Header (Matched with RiskReport.js)
    headerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
        borderBottomWidth: 0.5,
        borderBottomColor: Theme.BORDER_COLOR,
        paddingBottom: 10,
    },
    headerLeft: {
        flexDirection: 'column',
    },
    headerRight: {
        flexDirection: 'column',
        alignItems: 'flex-end',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: Theme.PRIMARY_BLUE,
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 11,
        fontWeight: 'medium',
        color: Theme.TEXT_SECONDARY,
    },
    poweredBy: {
        fontSize: 10,
        fontWeight: 'medium',
        color: Theme.TEXT_TERTIARY,
        marginBottom: 4,
    },
    date: {
        fontSize: 10,
        color: Theme.TEXT_TERTIARY,
    },

    // Footer (Matched with RiskReport.js)
    footer: {
        position: 'absolute',
        bottom: 20,
        left: 30,
        right: 30,
        textAlign: 'center',
        fontSize: 9,
        color: Theme.TEXT_TERTIARY,
    },

    // Section layout
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: Theme.TEXT_MAIN,
        marginBottom: 10,
    },

    // Content Card
    contentCard: {
        flexDirection: 'row',
        gap: 15,
        marginBottom: 10,
        alignItems: 'flex-start',
    },
    imageContainer: {
        backgroundColor: Theme.BG_PLACEHOLDER,
        borderRadius: 4,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        maxWidth: '40%',
    },
    mainImage: {
        maxWidth: '100%',
        maxHeight: 250,
        objectFit: 'contain',
    },
    textContentPlaceholder: {
        padding: 20,
        fontSize: 10,
        color: Theme.TEXT_TERTIARY,
        fontWeight: 'medium',
    },
    contentDetails: {
        flex: 1,
        flexDirection: 'column',
    },
    userBadge: {
        marginBottom: 8,
    },
    username: {
        fontSize: 12,
        fontWeight: 'bold',
        color: Theme.PRIMARY_BLUE,
        textDecoration: 'none',
    },
    fullName: {
        fontSize: 10,
        color: Theme.TEXT_SECONDARY,
        marginTop: 2,
    },
    caption: {
        fontSize: 10,
        lineHeight: 1.4,
        color: Theme.TEXT_MAIN,
        marginBottom: 10,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 15,
        backgroundColor: Theme.BG_LIGHT_BLUE,
        padding: 8,
        borderRadius: 4,
        marginTop: 'auto',
    },
    statItem: {
        flexDirection: 'column',
    },
    statLabel: {
        fontSize: 7,
        color: Theme.TEXT_SECONDARY,
        textTransform: 'uppercase',
        marginBottom: 1,
    },
    statValue: {
        fontSize: 10,
        fontWeight: 'bold',
        color: Theme.TEXT_MAIN,
    },
    sourceLink: {
        fontSize: 8,
        color: Theme.PRIMARY_BLUE,
        textDecoration: 'none',
        marginTop: 8,
        fontWeight: 'bold',
    },

    // Intelligence Section
    intelGrid: {
        flexDirection: 'row',
        gap: 15,
    },
    riskCard: {
        width: '35%',
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    riskValue: {
        fontSize: 28,
        fontWeight: 'bold',
        color: 'white',
    },
    riskLabel: {
        fontSize: 9,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        marginTop: 2,
        color: 'white',
        opacity: 0.9,
    },
    riskCategory: {
        fontSize: 10,
        fontWeight: 'bold',
        marginTop: 8,
        textTransform: 'capitalize',
        color: 'white',
    },
    signalsList: {
        flex: 1,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    signalItem: {
        width: '48%',
        padding: 6,
        borderRadius: 6,
        borderWidth: 0.5,
        flexDirection: 'column',
        justifyContent: 'center',
        minHeight: 35,
    },
    signalTitle: {
        fontSize: 8,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    signalExtra: {
        fontSize: 7,
        opacity: 0.9,
        marginTop: 1,
    },

    // Analysis / Note
    noteBox: {
        padding: 12,
        backgroundColor: '#FFFBEB',
        borderWidth: 0.5,
        borderColor: '#FEF3C7',
        borderRadius: 6,
    },
    noteTitle: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#92400E',
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    noteText: {
        fontSize: 9,
        lineHeight: 1.4,
        color: '#78350F',
    },
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
        return '#';
    }).join('');
};

const Header = () => (
    <View style={styles.headerContainer} fixed>
        <View style={styles.headerLeft}>
            <Text style={styles.title}>OVERWATCH</Text>
            <Text style={styles.subtitle}>Digital Risk Protection Report</Text>
        </View>
        <View style={styles.headerRight}>
            <Text style={styles.poweredBy}>Powered by Contrails AI</Text>
            <Text style={styles.date}>Report Date: {format(new Date(), 'MMMM d, yyyy')}</Text>
        </View>
    </View>
);

const Footer = () => (
    <Text style={styles.footer} fixed>
        © {new Date().getFullYear()} Overwatch by Contrails AI.
    </Text>
);

const SignalItem = ({ active, title, color, extra }) => {
    if (!active) return null;

    const colors = {
        purple: { bg: '#F3E8FF', border: '#E9D5FF', text: '#7E22CE' },
        rose: { bg: '#FFE4E6', border: '#FECDD3', text: '#BE123C' },
        orange: { bg: '#FFEDD5', border: '#FED7AA', text: '#C2410C' },
        indigo: { bg: '#E0E7FF', border: '#C7D2FE', text: '#4338CA' },
        blue: { bg: '#E0F2FE', border: '#BAE6FD', text: '#0369A1' },
        yellow: { bg: '#FEF3C7', border: '#FDE68A', text: '#A16207' },
    }[color] || { bg: '#F1F5F9', border: '#E2E8F0', text: '#475569' };

    return (
        <View style={[styles.signalItem, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <Text style={[styles.signalTitle, { color: colors.text }]}>{title}</Text>
            {extra && <Text style={[styles.signalExtra, { color: colors.text }]}>{sanitizeText(extra)}</Text>}
        </View>
    );
};

export const SingleCaseReportDocument = ({ post }) => {
    const review = post.review_details || {};
    const analysis = post.analysis_results || {};
    const riskScore = review.threat_score ?? analysis.risk_score ?? 0;

    const riskColor = riskScore > 75 ? Theme.RED_ALERT : riskScore > 40 ? Theme.ORANGE_WARN : Theme.GREEN_SAFE;

    let category = review.primary_threat_type || review.threat_type || analysis.category || 'Unknown';
    if (Array.isArray(review.threat_types) && review.threat_types.length > 0) {
        category = review.threat_types.join(', ').replace(/_/g, ' ');
    }

    const isPoiPresent = review.flags?.poi_confirmed ?? (analysis.poi_check?.poi_name_found || analysis.poi_check?.face_present) ?? false;
    const isNsfw = review.flags?.is_nsfw ?? (analysis.nsfw_check?.is_safe === false) ?? false;
    const isHateSpeech = review.flags?.is_hate_speech ?? (analysis.hate_speech_check?.is_safe === false) ?? false;
    const isFakeNews = review.flags?.is_fake_news ?? (analysis.truth_check?.is_credible === false) ?? false;
    const isAigc = review.flags?.is_aigc ?? analysis.aigc_check?.is_aigc ?? false;
    const isFraud = review.flags?.is_fraud ?? (analysis.fraud_check?.is_fraud === true) ?? false;
    const isAssetMisuse = review.flags?.is_asset_misuse ?? (analysis.asset_misuse_check?.is_asset_misuse === true) ?? false;
    const isSatire = review.flags?.is_humor ?? (analysis.is_humor?.is_humor === true) ?? false;
    const poiNames = review.poi_names || analysis.poi_check?.poi_names || [];

    const reviewerNote = review.reviewer_comments || null;
    const postUrl = post.original_url || post.url || '#';
    const profileUrl = post.user?.url || '#';

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <Header />

                {/* Content Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Content Evidence</Text>
                    <View style={styles.contentCard}>
                        {post.signedImageUrl ? (
                            <View style={styles.imageContainer}>
                                <Image src={post.signedImageUrl} style={styles.mainImage} />
                            </View>
                        ) : (
                            <View style={[styles.imageContainer, { width: 150 }]}>
                                <Text style={styles.textContentPlaceholder}>Text-Only Content</Text>
                            </View>
                        )}

                        <View style={styles.contentDetails}>
                            <View style={styles.userBadge}>
                                <Link src={profileUrl} style={styles.username}>
                                    @{sanitizeText(post.user?.username || 'unknown')}
                                </Link>
                                <Text style={styles.fullName}>{sanitizeText(post.user?.full_name || 'Unknown User')}</Text>
                            </View>

                            <Text style={styles.caption}>{sanitizeText(post.caption || 'No caption provided.')}</Text>

                            <Link src={postUrl} style={styles.sourceLink}>
                                View Original Post &rarr;
                            </Link>

                            <View style={styles.statsRow}>
                                <View style={styles.statItem}>
                                    <Text style={styles.statLabel}>Likes</Text>
                                    <Text style={styles.statValue}>{post.stats?.like_count?.toLocaleString() || 0}</Text>
                                </View>
                                <View style={styles.statItem}>
                                    <Text style={styles.statLabel}>Comments</Text>
                                    <Text style={styles.statValue}>{post.stats?.comment_count?.toLocaleString() || 0}</Text>
                                </View>
                                <View style={styles.statItem}>
                                    <Text style={styles.statLabel}>Shares</Text>
                                    <Text style={styles.statValue}>{post.stats?.share_count?.toLocaleString() || 0}</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Intelligence Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Risk Assessment</Text>
                    <View style={styles.intelGrid}>
                        <View style={[styles.riskCard, { backgroundColor: riskColor }]}>
                            <Text style={styles.riskValue}>{riskScore}</Text>
                            <Text style={styles.riskLabel}>Total Score</Text>
                            <Text style={styles.riskCategory}>{category}</Text>
                        </View>
                        <View style={styles.signalsList}>
                            <SignalItem active={isPoiPresent} title="POI Detected" color="indigo" extra={poiNames.length > 0 ? poiNames[0] : null} />
                            <SignalItem active={isAigc} title="AI Generated" color="purple" />
                            <SignalItem active={isHateSpeech} title="Hate Speech" color="rose" />
                            <SignalItem active={isFakeNews} title="Misinformation" color="orange" />
                            <SignalItem active={isNsfw} title="NSFW Content" color="indigo" />
                            <SignalItem active={isFraud} title="Fraud" color="rose" />
                            <SignalItem active={isAssetMisuse} title="Asset Misuse" color="yellow" />
                            <SignalItem active={isSatire} title="Satire" color="blue" />
                        </View>
                    </View>
                </View>

                {/* Analyst Notes */}
                {reviewerNote && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Analyst Observations</Text>
                        <View style={styles.noteBox}>
                            <Text style={styles.noteTitle}>Internal Review Note</Text>
                            <Text style={styles.noteText}>{sanitizeText(reviewerNote)}</Text>
                        </View>
                    </View>
                )}

                <Footer />
            </Page>
        </Document>
    );
};

export default SingleCaseReportDocument;
