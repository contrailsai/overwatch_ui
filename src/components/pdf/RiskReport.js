import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Link } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { registerFonts } from './fontRegistration';

// --- FONT REGISTRATION ---
registerFonts();

// --- THEME & STYLES ---
const Theme = {
  PRIMARY_BLUE: '#174AFF',
  ACCENT_CYAN: '#0096C8',
  RED_ALERT: '#DC3232',
  GREEN_SAFE: '#28A03C',
  TEXT_MAIN: '#1E1E23',
  TEXT_SECONDARY: '#50555F',
  TEXT_TERTIARY: '#8C919B',
  BG_PAGE: '#FFFFFF',
  BG_LIGHT_BLUE: '#F8FAFF',
  BG_HEADER: '#F2F4F8',
  BG_PLACEHOLDER: '#EBEBEB',
};

const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: Theme.BG_PAGE,
    padding: 30, // Approx 12mm margin
    fontFamily: 'Outfit',
  },
  // Header
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#DCDCE1',
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
  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 9,
    color: Theme.TEXT_TERTIARY,
  },
  // Metrics Section
  metricsSection: {
    marginBottom: 20,
  },
  metricsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Theme.TEXT_MAIN,
  },
  periodText: {
    fontSize: 10,
    color: Theme.TEXT_SECONDARY,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: Theme.BG_LIGHT_BLUE,
    padding: 10,
    borderRadius: 4,
  },
  metricLabel: {
    fontSize: 8,
    color: Theme.TEXT_SECONDARY,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Theme.PRIMARY_BLUE,
  },
  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Theme.BG_HEADER,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#DCDCE1',
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: 'bold',
    color: Theme.TEXT_SECONDARY,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F0F0F5',
    alignItems: 'flex-start', // Align to top
  },
  // Columns (approx widths from Python: 78, 42, 25, 20, 21 -> total ~186)
  colContent: { width: '40%', paddingRight: 8 },
  colPlatform: { width: '22%', paddingRight: 4 },
  colThreat: { width: '15%', paddingRight: 4 },
  colRisk: { width: '12%', paddingRight: 4 },
  colStatus: { width: '11%' },

  // Content Cell Specifics
  contentContainer: {
    flexDirection: 'row',
  },
  postImage: {
    width: 60,
    height: 60,
    backgroundColor: Theme.BG_PLACEHOLDER,
    borderRadius: 2,
    marginRight: 8,
    objectFit: 'cover',
  },
  captionText: {
    fontSize: 9,
    color: Theme.TEXT_MAIN,
    lineHeight: 1.3,
    flex: 1,
  },
  // Platform Cell Specifics
  platformText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: Theme.PRIMARY_BLUE,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  usernameText: {
    fontSize: 9,
    fontWeight: 'medium',
    color: Theme.TEXT_MAIN,
    marginBottom: 2,
  },
  statsText: {
    fontSize: 8,
    color: Theme.TEXT_SECONDARY,
    marginBottom: 4,
  },
  linkText: {
    fontSize: 8,
    color: Theme.PRIMARY_BLUE,
    textDecoration: 'none',
  },
  // Threat Cell Specifics
  threatText: {
    fontSize: 9,
    fontWeight: 'medium',
    color: Theme.TEXT_SECONDARY,
    textTransform: 'capitalize',
  },
  // Risk Cell Specifics
  riskTextHigh: {
    fontSize: 9,
    fontWeight: 'bold',
    color: Theme.RED_ALERT,
  },
  riskTextLow: {
    fontSize: 9,
    fontWeight: 'bold',
    color: Theme.GREEN_SAFE,
  },
  // Status Cell Specifics
  statusText: {
    fontSize: 9,
    color: Theme.TEXT_TERTIARY,
  },
});

// --- COMPONENTS ---

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

const MetricCard = ({ label, value }) => (
  <View style={styles.metricCard}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
);

const MetricsSection = ({ posts }) => {
  const total = posts.length;
  const highRisk = posts.filter(p => (p.review_details?.threat_score || p.analysis_results?.risk_score || 0) > 75).length;
  const problematic = posts.filter(p => (p.review_details?.threat_score || p.analysis_results?.risk_score || 0) > 40).length;
  const safe = total - problematic; // Simplified logic, can be refined

  return (
    <View style={styles.metricsSection}>
      <View style={styles.metricsHeader}>
        <Text style={styles.sectionTitle}>Executive Summary</Text>
        {/* <Text style={styles.periodText}>Period: Aug 2025 - Dec 2025</Text> */}
        {/* Omitted period for now as it's dynamic */}
      </View>
      <View style={styles.metricsGrid}>
        <MetricCard label="Total Content Scanned" value={total.toLocaleString()} />
        <MetricCard label="Problematic Content" value={problematic.toLocaleString()} />
        <MetricCard label="High Risk Content" value={highRisk.toLocaleString()} />
        <MetricCard label="Safe Content" value={safe.toLocaleString()} />
      </View>
    </View>
  );
};

const TableHeader = () => (
  <View style={styles.tableHeader} fixed>
    <Text style={[styles.tableHeaderCell, styles.colContent]}>Content</Text>
    <Text style={[styles.tableHeaderCell, styles.colPlatform]}>Platform / User</Text>
    <Text style={[styles.tableHeaderCell, styles.colThreat]}>Threat Type</Text>
    <Text style={[styles.tableHeaderCell, styles.colRisk]}>Risk Level</Text>
    <Text style={[styles.tableHeaderCell, styles.colStatus]}>Status</Text>
  </View>
);

// --- UTILS ---
/**
 * Sanitizes text to only allow standard English (ASCII) and Emojis.
 * This prevents "Mojibake" garbage text and rendering errors in the PDF.
 */
const sanitizeText = (text) => {
  if (!text) return '';

  // 1. Convert string to an array of code points to handle multi-byte characters (emojis) correctly.
  return Array.from(text).map(char => {
    const codePoint = char.codePointAt(0);

    // 2. Keep Standard ASCII Printable (32-126) + Newline (10) + Carriage Return (13) + Tab (9)
    if ((codePoint >= 32 && codePoint <= 126) || codePoint === 10 || codePoint === 13 || codePoint === 9) {
      return char;
    }

    // 3. Keep Emoji Ranges
    // - Misc Symbols & Pictographs: \u{1F300}-\u{1F5FF}
    // - Emoticons: \u{1F600}-\u{1F64F}
    // - Transport & Map: \u{1F680}-\u{1F6FF}
    // - Supplemental Symbols: \u{1F900}-\u{1F9FF}
    // - Symbols & Dingbats: \u{2600}-\u{27BF}
    // - Regional Indicator (Flags): \u{1F1E6}-\u{1F1FF}
    // - Variation Selectors: \u{FE00}-\u{FE0F}
    const isEmoji = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}]/u.test(char);
    if (isEmoji) {
      return char;
    }

    // 4. Fallback for any other multi-byte or non-supported character (Tamil, Chinese, Bold styled text, etc.)
    return '#';
  }).join('');
};

const TableRow = ({ post }) => {
  const rawCaption = post.caption || 'No caption available';
  const caption = sanitizeText(rawCaption);
  // Reduced character limit to prevent overwrite
  const truncatedCaption = caption.length > 90 ? caption.substring(0, 87) + '...' : caption;

  const riskScore = post.review_details?.threat_score || post.analysis_results?.risk_score || 0;
  const isHighRisk = riskScore > 75;

  const threatType = (post.review_details?.threat_type || post.analysis_results?.category || 'General').replace(/_/g, ' ');

  return (
    <View style={styles.tableRow} wrap={false}>
      {/* Column 1: Content */}
      <View style={styles.colContent}>
        <View style={styles.contentContainer}>
          {post.signedImageUrl ? (
            <Image
              style={styles.postImage}
              src={post.signedImageUrl}
              alt="Post Evidence"
            />
          ) : (
            <View style={styles.postImage} />
          )}
          <Text style={styles.captionText}>{truncatedCaption}</Text>
        </View>
      </View>

      {/* Column 2: Platform */}
      <View style={styles.colPlatform}>
        <Text style={styles.platformText}>{sanitizeText(post.platform || 'Unknown')}</Text>
        <Text style={styles.usernameText}>@{sanitizeText(post.user?.username || 'unknown')}</Text>
        <Text style={styles.statsText}>
          Likes: {post.stats?.like_count || 0}  Comments: {post.stats?.comment_count || 0}
        </Text>
        <Link src={post.original_url || post.url || `https://www.instagram.com/p/${post.code}`} style={styles.linkText}>
          View Post
        </Link>
      </View>

      {/* Column 3: Threat */}
      <View style={styles.colThreat}>
        <Text style={styles.threatText}>{threatType}</Text>
      </View>

      {/* Column 4: Risk */}
      <View style={styles.colRisk}>
        <Text style={isHighRisk ? styles.riskTextHigh : styles.riskTextLow}>
          {isHighRisk ? 'HIGH' : 'LOW'}
        </Text>
      </View>

      {/* Column 5: Status */}
      <View style={styles.colStatus}>
        <Text style={styles.statusText}>In Progress</Text>
      </View>
    </View>
  );
};

// --- MAIN DOCUMENT ---
export const RiskReportDocument = ({ posts }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Header />
      <MetricsSection posts={posts} />

      <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>Case List Analysis</Text>
      <TableHeader />

      {posts.map((post, idx) => (
        <TableRow key={idx} post={post} />
      ))}

      <Footer />
    </Page>
  </Document>
);

export default RiskReportDocument;
