import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Link, Svg, Path } from '@react-pdf/renderer';
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
  SAFE: '#10B981',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingHorizontal: 30,
    paddingBottom: 40,
    fontFamily: 'Outfit',
    backgroundColor: '#FFFFFF',
  },
  // --- HEADERS & FOOTERS ---
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
  },

  // --- METRICS SECTION ---
  metricsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: Theme.SECONDARY_GRAY,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: Theme.BG_SECTION,
    padding: 12,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: Theme.BORDER_LIGHT,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 6.5,
    color: Theme.SECONDARY_GRAY,
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '900',
    color: Theme.PRIMARY_BLUE,
  },

  // --- TABLE STYLES ---
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Theme.BG_SECTION,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderWidth: 0.5,
    borderColor: Theme.BORDER_LIGHT,
    borderRadius: 4,
    marginBottom: 6,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontWeight: '900',
    color: Theme.SECONDARY_GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: Theme.BORDER_LIGHT,
    alignItems: 'flex-start',
  },

  // Column Widths
  colContent: { width: '34%', paddingRight: 8 },
  colPlatform: { width: '17%', paddingRight: 4 },
  colThreat: { width: '22%', paddingRight: 8 },
  colRisk: { width: '15%', paddingRight: 4 },
  colStatus: { width: '12%', alignItems: 'flex-start' },

  // Cell Specifics
  contentContainer: {
    flexDirection: 'row',
  },
  contentInfo: {
    flex: 1,
    flexDirection: 'column',
  },
  postImage: {
    width: 45,
    height: 45,
    borderRadius: 4,
    marginRight: 8,
    objectFit: 'cover',
    borderWidth: 0.5,
    borderColor: Theme.BORDER_LIGHT,
  },
  captionText: {
    fontSize: 7.5,
    color: Theme.PRIMARY_BLUE,
    lineHeight: 1.4,
    marginBottom: 2,
  },
  captionDate: {
    fontSize: 6,
    color: Theme.SECONDARY_GRAY,
    fontWeight: 'bold',
  },
  platformText: {
    fontSize: 8,
    fontWeight: '900',
    color: Theme.PRIMARY_BLUE,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  usernameText: {
    fontSize: 8,
    color: Theme.SECONDARY_GRAY,
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  statsText: {
    fontSize: 6.5,
    color: Theme.SECONDARY_GRAY,
  },
  linkText: {
    fontSize: 7,
    color: '#3B82F6',
    textDecoration: 'none',
  },
  threatContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  threatBadge: {
    backgroundColor: Theme.BG_SECTION,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.3,
    borderColor: Theme.BORDER_LIGHT,
  },
  threatText: {
    fontSize: 7,
    // fontWeight: 'bold',
    color: Theme.PRIMARY_BLUE,
    textTransform: 'capitalize',
  },

  // Table Risk Badge
  riskBadgeTable: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  riskBadgeTextTable: {
    fontSize: 7,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  statusText: {
    fontSize: 6.5,
    fontWeight: 'bold',
    color: Theme.PRIMARY_BLUE,
    marginBottom: 4,
    textAlign: 'left',
  },
  dateItem: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 1,
    marginBottom: 6,
  },
  dateLabel: {
    fontSize: 5.5,
    color: Theme.SECONDARY_GRAY,
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  dateValue: {
    fontSize: 6,
    // color: Theme.SECONDARY_GRAY,
  }
});

// --- ICONS ---
const LikeIcon = () => (
  <Svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke={Theme.SECONDARY_GRAY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="none" />
  </Svg>
);

const CommentIcon = () => (
  <Svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke={Theme.SECONDARY_GRAY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" />
  </Svg>
);

const ViewIcon = () => (
  <Svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke={Theme.SECONDARY_GRAY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="none" />
    <Path d="M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6z" fill="none" />
  </Svg>
);

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

// DD/MM/YYYY
const formatShortDate = (dateInput) => {
  if (!dateInput) return "N/A";
  try {
    const dateObj = typeof dateInput === 'string' ? parseISO(dateInput) : new Date(dateInput);
    if (isValid(dateObj)) return format(dateObj, "dd MMM yy");
  } catch (error) { return "N/A"; }
  return "N/A";
};

// DD/MM/YYYY, hh:mm a
const formatCompleteDate = (dateInput) => {
  if (!dateInput) return "N/A";
  try {
    const dateObj = typeof dateInput === 'string' ? parseISO(dateInput) : new Date(dateInput);
    if (isValid(dateObj)) {
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

// --- COMPONENTS ---
const PageHeader = () => (
  <View style={styles.header} fixed>
    <View>
      <Text style={styles.title}>OVERWATCH</Text>
      <Text style={styles.subtitle}>Digital Risk Protection Report</Text>
    </View>
    <View style={styles.headerRight}>
      <Text style={styles.headerDate}>{formatCompleteDate(new Date())}</Text>
      {/* <Text style={styles.headerID}> SUMMARY REPORT </Text> */}
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

const MetricsSection = ({ posts }) => {
  const total = posts.length;
  let safe_content = 0;
  let low_content = 0;
  let medium_content = 0;
  let high_content = 0;
  // let problematic = 0;

  posts.forEach(p => {
    const score = p.review_details?.threat_score ?? p.analysis_results?.risk_score ?? 0;
    if (score > 95) high_content++;
    else if (score > 75) medium_content++;
    else if (score > 40) low_content++;
    else safe_content++;
  });

  // const safe = total - problematic;

  return (
    <View style={styles.metricsSection}>
      <Text style={styles.sectionTitle}>Executive Summary</Text>
      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total Scanned</Text>
          <Text style={styles.metricValue}>{total.toLocaleString()}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Safe Content</Text>
          <Text style={[styles.metricValue, { color: Theme.SAFE }]}>{safe_content.toLocaleString()}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Low Risk</Text>
          <Text style={[styles.metricValue, { color: Theme.RISK_LOW }]}>{low_content.toLocaleString()}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Medium Risk</Text>
          <Text style={[styles.metricValue, { color: Theme.RISK_MEDIUM }]}>{medium_content.toLocaleString()}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>High Risk</Text>
          <Text style={[styles.metricValue, { color: Theme.RISK_HIGH }]}>{high_content.toLocaleString()}</Text>
        </View>
      </View>
    </View>
  );
};

const TableHeader = () => (
  <View style={styles.tableHeader} fixed>
    <Text style={[styles.tableHeaderCell, styles.colContent]}>Visual & Caption</Text>
    <Text style={[styles.tableHeaderCell, styles.colPlatform]}>Source Details</Text>
    <Text style={[styles.tableHeaderCell, styles.colThreat]}>Violations</Text>
    <Text style={[styles.tableHeaderCell, styles.colRisk]}>Risk Severity</Text>
    <Text style={[styles.tableHeaderCell, styles.colStatus]}>Analysis Dates</Text>
  </View>
);

const TableRow = ({ post, project, compressedImage }) => {
  const review = post.review_details || {};
  const riskScore = review.threat_score ?? post.analysis_results?.risk_score ?? 0;
  const riskInfo = getRiskLabel(riskScore);

  // Safely parse project details if it's a string
  let projectDetails = project?.project_details;
  if (typeof projectDetails === 'string') {
    try {
      projectDetails = JSON.parse(projectDetails);
    } catch (e) {
      projectDetails = {};
    }
  }

  const projectLabels = projectDetails?.labels || [];
  const resolvedThreats = [];
  const severityMap = { high: 1, medium: 2, low: 3 };
  const threatTypes = Array.isArray(review.threat_types) ? review.threat_types : [];

  // Check if it's a legacy case
  const isLegacyCase = projectLabels.length > 0 && projectLabels.every(l => !l.severity);

  projectLabels.forEach(label => {
    const inFlags = review.flags?.[label.name] === true;
    const inThreatTypes = threatTypes.includes(label.name);
    if (inFlags || inThreatTypes) {
      resolvedThreats.push({
        label: label.name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        severity: label.severity || 'medium',
        order: severityMap[label.severity] || 4
      });
    }
  });

  // Check Legacy Flags (Backward Compatibility)
  const legacyMapping = {
    is_nsfw: "NSFW",
    is_hate_speech: "Hate Speech",
    is_fake_news: "Misinformation",
    is_fraud: "Fraud",
    is_asset_misuse: "Asset Misuse",
    is_humor: "Satire",
    is_terrorism: "Terrorism",
    is_violence: "Violence"
  };

  Object.entries(legacyMapping).forEach(([key, label]) => {
    if (review.flags?.[key] === true && !resolvedThreats.some(t => t.label === label)) {
      resolvedThreats.push({
        label,
        severity: 'medium',
        order: severityMap['medium']
      });
    }
  });

  // Fallback: include any threat_types that haven't been matched via project labels or legacy flags.
  // Covers cases where review_details was saved with threat_types but no matching flags entry.
  threatTypes.forEach(type => {
    if (!type || type === 'safe') return;
    const formattedLabel = type.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (!resolvedThreats.some(t => t.label.toLowerCase() === formattedLabel.toLowerCase())) {
      resolvedThreats.push({
        label: formattedLabel,
        severity: 'medium',
        order: severityMap['medium']
      });
    }
  });

  // Sort violations: High > Medium > Low
  resolvedThreats.sort((a, b) => a.order - b.order);

  // Correctly prioritize image sources
  const imageUrl = compressedImage || post.compressedImage || post.signedImageUrl || post.image_url || null;
  const postedDate = formatCompleteDate(post.posted_date || post.metadata?.posted_date || post.timestamp || post.created_at);
  const sourcedDate = formatCompleteDate(post.metadata?.created_at || post.created_at);
  const reviewedDate = formatCompleteDate(post.updated_at || review.reviewed_at || post.created_at);

  return (
    <View style={styles.tableRow} wrap={false}>
      {/* Column 1: Content */}
      <View style={styles.colContent}>
        <View style={styles.contentContainer}>
          {imageUrl ? (
            <Image style={styles.postImage} src={imageUrl} />
          ) : (
            <View style={[styles.postImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: Theme.BG_SECTION }]}>
              <Text style={{ fontSize: 6, color: Theme.SECONDARY_GRAY }}>No Img</Text>
            </View>
          )}
          <View style={styles.contentInfo}>
            <Text style={styles.captionText}>{processText(post.caption || post.content, 85, 4)}</Text>
            {/* <Text style={styles.captionDate}>Posted: {postedDate}</Text> */}
            <Link src={post.original_url || post.url || '#'} style={styles.linkText} target="_blank" >
              View Source
            </Link>
          </View>
        </View>
      </View>

      {/* Column 2: Platform */}
      <View style={styles.colPlatform}>
        <Text style={styles.platformText}>{processText(post.platform || 'Unknown')}</Text>
        <Text style={styles.usernameText}>@{processText(post.user?.username || 'unknown')}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <LikeIcon />
            <Text style={styles.statsText}>{post.stats?.like_count || 0}</Text>
          </View>
          <View style={styles.statItem}>
            <CommentIcon />
            <Text style={styles.statsText}>{post.stats?.comment_count || 0}</Text>
          </View>
          {post.stats?.view_count > 0 && (
            <View style={styles.statItem}>
              <ViewIcon />
              <Text style={styles.statsText}>{post.stats.view_count.toLocaleString()}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Column 3: Threat */}
      <View style={styles.colThreat}>
        <View style={styles.threatContainer}>
          {resolvedThreats.length > 0 && (
            resolvedThreats.map((threat, idx) => {
              let vColor = Theme.SECONDARY_GRAY;

              // NO BADGE COLORING FOR NOW (DISTRUPTS WITH RISK SEVERITY)
              // if (isLegacyCase) {
              //   vColor = Theme.PRIMARY_BLUE;
              // } else {
              //   vColor = threat.severity === 'high' ? Theme.RISK_HIGH : threat.severity === 'medium' ? Theme.RISK_MEDIUM : Theme.RISK_LOW;
              // }

              return (
                <View key={idx} style={[styles.threatBadge, { borderColor: vColor, backgroundColor: vColor + '15' }]}>
                  <Text style={[styles.threatText, { color: Theme.PRIMARY_BLUE }]}>{processText(threat.label, 25)}</Text>
                </View>
              );
            })
          )}
        </View>
      </View>

      {/* Column 4: Risk */}
      <View style={styles.colRisk}>
        <View style={[styles.riskBadgeTable, { backgroundColor: riskInfo.bg, borderColor: riskInfo.color }]}>
          <Text style={[styles.riskBadgeTextTable, { color: riskInfo.color }]}>{riskInfo.label}</Text>
        </View>
      </View>

      {/* Column 5: Status */}
      <View style={styles.colStatus}>
        <View style={styles.dateItem}>
          <Text style={styles.dateLabel}>Publish Date:</Text>
          <Text style={styles.dateValue}>{postedDate}</Text>
        </View>
        <View style={styles.dateItem}>
          <Text style={styles.dateLabel}>Alert Date:</Text>
          <Text style={styles.dateValue}>{sourcedDate}</Text>
        </View>
        <View style={styles.dateItem}>
          <Text style={styles.dateLabel}>Review Date:</Text>
          <Text style={styles.dateValue}>{reviewedDate}</Text>
        </View>
      </View>
    </View>
  );
};

// --- MAIN DOCUMENT ---
export const RiskReportDocument = ({ posts, project, compressedImages }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <PageHeader />

      <MetricsSection posts={posts} />

      <View style={{ marginTop: 10 }}>
        <Text style={styles.sectionTitle}>Case List Analysis</Text>
        <TableHeader />
        {posts.map((post, idx) => (
          <TableRow
            key={post._id || idx}
            post={post}
            project={project}
            compressedImage={compressedImages?.[idx]}
          />
        ))}
      </View>

      <PageFooter />
    </Page>
  </Document>
);

export default RiskReportDocument;