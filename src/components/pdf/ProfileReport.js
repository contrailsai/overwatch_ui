import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Link, Svg, Path } from '@react-pdf/renderer';
import { format, isValid, parseISO } from 'date-fns';
import { registerFonts } from './fontRegistration';
import { SingleCasePage } from './SingleCaseReport';

registerFonts();

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
  page: { paddingTop: 30, paddingHorizontal: 30, paddingBottom: 40, fontFamily: 'Outfit', backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: Theme.BORDER_LIGHT, paddingBottom: 12, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '900', color: Theme.PRIMARY_BLUE, letterSpacing: 0.5 },
  subtitle: { fontSize: 7, color: Theme.SECONDARY_GRAY, textTransform: 'uppercase', letterSpacing: 1.5 },
  headerRight: { alignItems: 'flex-end' },
  headerDate: { fontSize: 8, fontWeight: 'bold', color: Theme.PRIMARY_BLUE },
  headerID: { fontSize: 6, fontWeight: 'bold', color: Theme.SECONDARY_GRAY, marginTop: 2 },
  footer: { position: 'absolute', bottom: 20, left: 30, right: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', fontSize: 6.5, color: Theme.SECONDARY_GRAY, borderTopWidth: 0.5, borderTopColor: Theme.BORDER_LIGHT, paddingTop: 10 },
  footerLeft: { textTransform: 'uppercase', fontWeight: 'bold' },
  footerCenter: { textTransform: 'uppercase' },
  footerRight: { textTransform: 'uppercase', fontWeight: 'bold' },

  metricsSection: { marginBottom: 20 },
  sectionTitle: { fontSize: 10, fontWeight: '900', color: Theme.SECONDARY_GRAY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  metricsGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  metricCard: { flex: 1, backgroundColor: Theme.BG_SECTION, padding: 12, borderRadius: 6, borderWidth: 0.5, borderColor: Theme.BORDER_LIGHT, alignItems: 'center' },
  metricLabel: { fontSize: 6.5, color: Theme.SECONDARY_GRAY, marginBottom: 4, textTransform: 'uppercase', fontWeight: 'bold' },
  metricValue: { fontSize: 18, fontWeight: '900', color: Theme.PRIMARY_BLUE },

  profileBanner: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: Theme.BG_SECTION, padding: 16, borderRadius: 6, borderWidth: 0.5, borderColor: Theme.BORDER_LIGHT, marginBottom: 16 },
  profileBannerLeft: { flexDirection: 'row', gap: 16, width: '65%' },
  profileImage: { width: 60, height: 60, borderRadius: 30, borderWidth: 1, borderColor: Theme.BORDER_LIGHT, backgroundColor: '#FFFFFF', objectFit: 'cover' },
  profileInfo: { flex: 1, flexDirection: 'column', gap: 4 },
  profileName: { fontSize: 14, fontWeight: '900', color: Theme.PRIMARY_BLUE },
  profileUsername: { fontSize: 9, color: Theme.SECONDARY_GRAY, fontWeight: 'bold' },
  profileBio: { fontSize: 8, color: Theme.PRIMARY_BLUE, lineHeight: 1.4, marginTop: 4 },

  profileStatsRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  profileStatItem: { flexDirection: 'column' },
  profileStatValue: { fontSize: 10, fontWeight: '900', color: Theme.PRIMARY_BLUE },
  profileStatLabel: { fontSize: 6, color: Theme.SECONDARY_GRAY, textTransform: 'uppercase', fontWeight: 'bold', marginTop: 2 },

  profileBannerRight: { width: '30%', flexDirection: 'column', gap: 6, borderLeftWidth: 0.5, borderLeftColor: Theme.BORDER_LIGHT, paddingLeft: 16, justifyContent: 'center' },
  profileDetailRow: { flexDirection: 'row', alignItems: 'flex-start' },
  profileDetailLabel: { fontSize: 7, fontWeight: 'bold', color: Theme.SECONDARY_GRAY, width: 55, textTransform: 'uppercase' },
  profileDetailValue: { fontSize: 8, color: Theme.PRIMARY_BLUE, fontWeight: 'bold', flex: 1 },

  tableHeader: { flexDirection: 'row', backgroundColor: Theme.BG_SECTION, paddingVertical: 8, paddingHorizontal: 6, borderWidth: 0.5, borderColor: Theme.BORDER_LIGHT, borderRadius: 4, marginBottom: 6 },
  tableHeaderCell: { fontSize: 7, fontWeight: '900', color: Theme.SECONDARY_GRAY, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: Theme.BORDER_LIGHT, alignItems: 'flex-start' },
  colContent: { width: '34%', paddingRight: 8 },
  colPlatform: { width: '17%', paddingRight: 4 },
  colThreat: { width: '22%', paddingRight: 8 },
  colRisk: { width: '15%', paddingRight: 4 },
  colStatus: { width: '12%', alignItems: 'flex-start' },
  contentContainer: { flexDirection: 'row' },
  contentInfo: { flex: 1, flexDirection: 'column' },
  postImage: { width: 45, height: 45, borderRadius: 4, marginRight: 8, objectFit: 'cover', borderWidth: 0.5, borderColor: Theme.BORDER_LIGHT },
  captionText: { fontSize: 7.5, color: Theme.PRIMARY_BLUE, lineHeight: 1.4, marginBottom: 2 },
  linkText: { fontSize: 7, color: '#3B82F6', textDecoration: 'none' },
  platformText: { fontSize: 8, fontWeight: '900', color: Theme.PRIMARY_BLUE, textTransform: 'uppercase', marginBottom: 2 },
  usernameText: { fontSize: 8, color: Theme.SECONDARY_GRAY, marginBottom: 4 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  statsText: { fontSize: 6.5, color: Theme.SECONDARY_GRAY },
  threatContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  threatBadge: { backgroundColor: Theme.BG_SECTION, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, borderWidth: 0.3, borderColor: Theme.BORDER_LIGHT },
  threatText: { fontSize: 7, color: Theme.PRIMARY_BLUE, textTransform: 'capitalize' },
  riskBadgeTable: { paddingVertical: 4, paddingHorizontal: 6, borderRadius: 4, borderWidth: 1, alignItems: 'center', alignSelf: 'flex-start' },
  riskBadgeTextTable: { fontSize: 7, fontWeight: '900', textTransform: 'uppercase' },
  dateItem: { flexDirection: 'column', alignItems: 'flex-start', gap: 1, marginBottom: 6 },
  dateLabel: { fontSize: 5.5, color: Theme.SECONDARY_GRAY, textTransform: 'uppercase', fontWeight: 'bold' },
  dateValue: { fontSize: 6 }
});

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
    if (isValid(dateObj)) return format(dateObj, "dd MMM yyyy, hh:mm a");
  } catch (error) { return "N/A"; }
  return "N/A";
};

const getRiskLabel = (score) => {
  if (score > 95) return { label: 'High Risk', color: Theme.RISK_HIGH, bg: '#FFF1F2' };
  if (score > 75) return { label: 'Medium Risk', color: Theme.RISK_MEDIUM, bg: '#FFF7ED' };
  if (score > 40) return { label: 'Low Risk', color: Theme.RISK_LOW, bg: '#FFFBEB' };
  return { label: 'Safe Content', color: Theme.SAFE, bg: '#ECFDF5' };
};

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

const PageHeader = ({ profile }) => (
  <View style={styles.header} fixed>
    <View>
      <Text style={styles.title}>OVERWATCH</Text>
      <Text style={styles.subtitle}>Profile Investigation Report</Text>
    </View>
    <View style={styles.headerRight}>
      <Text style={styles.headerDate}>{formatCompleteDate(new Date())}</Text>
      <Text style={styles.headerID}>ID: {profile?._id ? String(profile._id).toUpperCase() : 'UNKNOWN'}</Text>
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

const ProfileSummarySection = ({ profile, profilePic }) => {
  const metadata = profile.metadata || {};
  return (
    <View style={styles.profileBanner}>
      <View style={styles.profileBannerLeft}>
        {profilePic ? (
          <Image style={styles.profileImage} src={profilePic} />
        ) : (
          <View style={[styles.profileImage, { justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontSize: 10, color: Theme.SECONDARY_GRAY }}>No Img</Text>
          </View>
        )}
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{profile.display_name || profile.username || 'Unknown Profile'}</Text>
          <Text style={styles.profileUsername}>
            @{profile.username || 'unknown'} • {(profile.platform || 'Unknown').toUpperCase()}
          </Text>

          {metadata.biography && (
            <Text style={styles.profileBio}>{processText(metadata.biography, 300)}</Text>
          )}

          <View style={styles.profileStatsRow}>
            <View style={styles.profileStatItem}>
              <Text style={styles.profileStatValue}>{metadata.follower_count?.toLocaleString() || 0}</Text>
              <Text style={styles.profileStatLabel}>Followers</Text>
            </View>
            <View style={styles.profileStatItem}>
              <Text style={styles.profileStatValue}>{metadata.following_count?.toLocaleString() || 0}</Text>
              <Text style={styles.profileStatLabel}>Following</Text>
            </View>
            <View style={styles.profileStatItem}>
              <Text style={styles.profileStatValue}>{metadata.media_count?.toLocaleString() || profile.posts?.length || 0}</Text>
              <Text style={styles.profileStatLabel}>Posts</Text>
            </View>
            {profile.profile_url && (
              <View style={styles.profileStatItem}>
                <Link src={profile.profile_url} style={{ fontSize: 10, color: '#3B82F6', textDecoration: 'none', fontWeight: 'bold' }}>View Profile</Link>
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.profileBannerRight}>
        {metadata.location && (
          <View style={styles.profileDetailRow}>
            <Text style={styles.profileDetailLabel}>Location:</Text>
            <Text style={styles.profileDetailValue}>{processText(metadata.location, 60)}</Text>
          </View>
        )}
        {metadata.category && (
          <View style={styles.profileDetailRow}>
            <Text style={styles.profileDetailLabel}>Category:</Text>
            <Text style={styles.profileDetailValue}>{processText(metadata.category, 60)}</Text>
          </View>
        )}
        {metadata.account_creation_date && (
          <View style={styles.profileDetailRow}>
            <Text style={styles.profileDetailLabel}>Joined:</Text>
            <Text style={styles.profileDetailValue}>
              {format(new Date(metadata.account_creation_date), 'MMM yyyy')}
            </Text>
          </View>
        )}
        {profile.is_verified && (
          <View style={styles.profileDetailRow}>
            <Text style={styles.profileDetailLabel}>Verified:</Text>
            <Text style={styles.profileDetailValue}>Yes</Text>
          </View>
        )}
        {metadata.is_business && (
          <View style={styles.profileDetailRow}>
            <Text style={styles.profileDetailLabel}>Business:</Text>
            <Text style={styles.profileDetailValue}>Yes</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const MetricsSection = ({ cases }) => {
  const total = cases.length;
  let safe_content = 0, low_content = 0, medium_content = 0, high_content = 0;

  cases.forEach(p => {
    const score = p.review_details?.threat_score ?? p.analysis_results?.risk_score ?? 0;
    if (score > 95) high_content++;
    else if (score > 75) medium_content++;
    else if (score > 40) low_content++;
    else safe_content++;
  });

  return (
    <View style={styles.metricsSection}>
      <Text style={styles.sectionTitle}>Profile Cases Summary</Text>
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

  let projectDetails = project?.project_details;
  if (typeof projectDetails === 'string') {
    try { projectDetails = JSON.parse(projectDetails); } catch (e) { projectDetails = {}; }
  }

  const projectLabels = projectDetails?.labels || [];
  const resolvedThreats = [];
  const severityMap = { high: 1, medium: 2, low: 3 };

  projectLabels.forEach(label => {
    if (review.flags?.[label.name] === true) {
      resolvedThreats.push({
        label: label.name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        severity: label.severity || 'medium',
        order: severityMap[label.severity] || 4
      });
    }
  });

  const legacyMapping = {
    is_nsfw: "NSFW", is_hate_speech: "Hate Speech", is_fake_news: "Misinformation",
    is_fraud: "Fraud", is_asset_misuse: "Asset Misuse", is_humor: "Satire",
    is_terrorism: "Terrorism", is_violence: "Violence"
  };

  Object.entries(legacyMapping).forEach(([key, label]) => {
    if (review.flags?.[key] === true && !resolvedThreats.some(t => t.label === label)) {
      resolvedThreats.push({ label, severity: 'medium', order: severityMap['medium'] });
    }
  });

  resolvedThreats.sort((a, b) => a.order - b.order);

  const imageUrl = compressedImage || post.compressedImage || post.signedImageUrl || post.image_url || null;
  const postedDate = formatCompleteDate(post.posted_date || post.metadata?.posted_date || post.timestamp || post.created_at);
  const sourcedDate = formatCompleteDate(post.metadata?.created_at || post.created_at);
  const reviewedDate = formatCompleteDate(post.updated_at || review.reviewed_at || post.created_at);

  return (
    <View style={styles.tableRow} wrap={false}>
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
            <Link src={post.original_url || post.url || '#'} style={styles.linkText} target="_blank">View Source</Link>
          </View>
        </View>
      </View>

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

      <View style={styles.colThreat}>
        <View style={styles.threatContainer}>
          {resolvedThreats.length > 0 && (
            resolvedThreats.map((threat, idx) => {
              let vColor = Theme.SECONDARY_GRAY;
              return (
                <View key={idx} style={[styles.threatBadge, { borderColor: vColor, backgroundColor: vColor + '15' }]}>
                  <Text style={[styles.threatText, { color: Theme.PRIMARY_BLUE }]}>{processText(threat.label, 25)}</Text>
                </View>
              );
            })
          )}
        </View>
      </View>

      <View style={styles.colRisk}>
        <View style={[styles.riskBadgeTable, { backgroundColor: riskInfo.bg, borderColor: riskInfo.color }]}>
          <Text style={[styles.riskBadgeTextTable, { color: riskInfo.color }]}>{riskInfo.label}</Text>
        </View>
      </View>

      <View style={styles.colStatus}>
        <View style={styles.dateItem}>
          <Text style={styles.dateLabel}>Posted:</Text>
          <Text style={styles.dateValue}>{postedDate}</Text>
        </View>
        <View style={styles.dateItem}>
          <Text style={styles.dateLabel}>Sourced:</Text>
          <Text style={styles.dateValue}>{sourcedDate}</Text>
        </View>
        <View style={styles.dateItem}>
          <Text style={styles.dateLabel}>Reviewed:</Text>
          <Text style={styles.dateValue}>{reviewedDate}</Text>
        </View>
      </View>
    </View>
  );
};

export const ProfileReportDocument = ({ profile, cases, project, compressedImages, compressedProfilePic }) => (
  <Document title={`ProfileReport_${profile.username || profile._id}`}>
    {/* Page 1: Profile Summary & Case List */}
    <Page size="A4" style={styles.page}>
      <PageHeader profile={profile} />
      <ProfileSummarySection profile={profile} profilePic={compressedProfilePic} />
      {cases && cases.length > 0 && <MetricsSection cases={cases} />}

      {cases && cases.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.sectionTitle}>Case List Analysis</Text>
          <TableHeader />
          {cases.map((post, idx) => (
            <TableRow
              key={post._id || idx}
              post={post}
              project={project}
              compressedImage={compressedImages?.[idx]}
            />
          ))}
        </View>
      )}

      <PageFooter />
    </Page>

    {/* Pages 2+: Single Case Reports */}
    {cases && cases.length > 0 && cases.map((post, idx) => (
      <SingleCasePage
        key={`page-${post._id || idx}`}
        post={post}
        project={project}
        compressedImage={compressedImages?.[idx]}
      />
    ))}
  </Document>
);

export default ProfileReportDocument;
