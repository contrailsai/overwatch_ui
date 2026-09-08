import React from 'react'
import { Page, Text, View, Document, StyleSheet, Image, Link } from '@react-pdf/renderer'
import { registerFonts } from './fontRegistration'
import {
  DomainPdfTheme as Theme,
  DomainPageHeader,
  DomainPageFooter,
  getDomainRiskInfo,
  landerImageSrc,
  reportLanderForDomain,
  linkedAdCount,
  processPdfText,
  collectDomainViolations,
  domainHasCloaking,
  domainVisitUrl,
  clientVisibleCloakVariants,
} from './domainPdfShared'

registerFonts()

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingHorizontal: 30,
    paddingBottom: 40,
    fontFamily: 'Outfit',
    backgroundColor: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: Theme.SECONDARY_GRAY,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  metricsGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  metricCard: {
    flex: 1,
    padding: 8,
    backgroundColor: Theme.BG_SECTION,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: Theme.BORDER_LIGHT,
  },
  metricLabel: { fontSize: 6.5, fontWeight: 'bold', color: Theme.SECONDARY_GRAY, textTransform: 'uppercase' },
  metricValue: { fontSize: 14, fontWeight: '900', color: Theme.PRIMARY_BLUE, marginTop: 2 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Theme.BG_SECTION,
    borderBottomWidth: 1,
    borderBottomColor: Theme.BORDER_LIGHT,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableHeaderCell: {
    fontSize: 6.5,
    fontWeight: '900',
    color: Theme.SECONDARY_GRAY,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: Theme.BORDER_LIGHT,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  colThumb: { width: '16%' },
  colDomain: { width: '28%', paddingRight: 4 },
  colRisk: { width: '12%' },
  colCloak: { width: '12%' },
  colViol: { width: '14%' },
  colAds: { width: '6%' },
  colHost: { width: '12%' },
  thumb: { width: 48, height: 36, objectFit: 'cover', borderRadius: 3 },
  thumbFallback: {
    width: 48,
    height: 36,
    backgroundColor: Theme.BG_SECTION,
    justifyContent: 'center',
    alignItems: 'center',
  },
  domainName: { fontSize: 8, fontWeight: '900', color: Theme.PRIMARY_BLUE },
  link: { fontSize: 6.5, color: '#3B82F6', textDecoration: 'none' },
  cell: { fontSize: 7, color: Theme.PRIMARY_BLUE, fontWeight: 'bold' },
  muted: { fontSize: 6.5, color: Theme.SECONDARY_GRAY },
})

function riskRank(domain) {
  return String(domain?.list?.risk_rank || domain?.risk_rank || 'safe').toLowerCase()
}

function Metrics({ domains }) {
  const total = domains.length
  const high = domains.filter((d) => riskRank(d) === 'high').length
  const medium = domains.filter((d) => riskRank(d) === 'mid' || riskRank(d) === 'medium').length
  const low = domains.filter((d) => riskRank(d) === 'low').length
  const safe = domains.filter((d) => {
    const r = riskRank(d)
    return r === 'safe' || r === '' || r === 'null'
  }).length
  const cloaked = domains.filter((d) => domainHasCloaking(d)).length

  return (
    <View>
      <Text style={styles.sectionTitle}>Executive Summary</Text>
      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total</Text>
          <Text style={styles.metricValue}>{total}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>High</Text>
          <Text style={[styles.metricValue, { color: Theme.RISK_HIGH }]}>{high}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Medium</Text>
          <Text style={[styles.metricValue, { color: Theme.RISK_MEDIUM }]}>{medium}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Low</Text>
          <Text style={[styles.metricValue, { color: Theme.RISK_LOW }]}>{low}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Safe</Text>
          <Text style={[styles.metricValue, { color: Theme.SAFE }]}>{safe}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Cloaked</Text>
          <Text style={styles.metricValue}>{cloaked}</Text>
        </View>
      </View>
    </View>
  )
}

function TableRow({ domain, compressedImage }) {
  const lander = reportLanderForDomain(domain)
  const thumb = landerImageSrc(lander, domain, compressedImage)
  const risk = getDomainRiskInfo(domain)
  const visitUrl = domainVisitUrl(domain)
  const visible = clientVisibleCloakVariants(domain)
  const violations = collectDomainViolations(domain).slice(0, 3).join(', ')
  const host = domain.list?.hosting_country || domain.analysis_results?.hosting?.country || '—'

  return (
    <View style={styles.tableRow} wrap={false}>
      <View style={styles.colThumb}>
        {thumb ? (
          <Image style={styles.thumb} src={thumb} />
        ) : (
          <View style={styles.thumbFallback}>
            <Text style={styles.muted}>—</Text>
          </View>
        )}
      </View>
      <View style={styles.colDomain}>
        <Text style={styles.domainName}>{processPdfText(domain.domain_name || '—', 40)}</Text>
        {visitUrl ? (
          <Link src={visitUrl} style={styles.link}>{processPdfText(visitUrl, 48)}</Link>
        ) : null}
      </View>
      <View style={styles.colRisk}>
        <Text style={[styles.cell, { color: risk.color }]}>{risk.label}</Text>
      </View>
      <View style={styles.colCloak}>
        <Text style={styles.cell}>
          {domainHasCloaking(domain) ? 'Y' : 'N'} · {visible.length}
        </Text>
      </View>
      <View style={styles.colViol}>
        <Text style={styles.muted}>{processPdfText(violations || '—', 40)}</Text>
      </View>
      <View style={styles.colAds}>
        <Text style={styles.cell}>{linkedAdCount(domain)}</Text>
      </View>
      <View style={styles.colHost}>
        <Text style={styles.muted}>{processPdfText(host, 24)}</Text>
        <Text style={styles.muted}>{processPdfText(domain.client_status || '—', 20)}</Text>
      </View>
    </View>
  )
}

export function SummaryDomainsReportDocument({ domains, posts, project, compressedImages }) {
  const list = domains || posts || []
  return (
    <Document title="Overwatch_Domain_Report">
      <Page size="A4" style={styles.page} orientation="landscape">
        <DomainPageHeader domainName={project?.project_name || 'Domains'} />
        <Metrics domains={list} />
        <Text style={styles.sectionTitle}>Selected domains</Text>
        <View style={styles.tableHeader} fixed>
          <Text style={[styles.tableHeaderCell, styles.colThumb]}>Thumb</Text>
          <Text style={[styles.tableHeaderCell, styles.colDomain]}>Domain</Text>
          <Text style={[styles.tableHeaderCell, styles.colRisk]}>Risk</Text>
          <Text style={[styles.tableHeaderCell, styles.colCloak]}>Cloak / n</Text>
          <Text style={[styles.tableHeaderCell, styles.colViol]}>Violations</Text>
          <Text style={[styles.tableHeaderCell, styles.colAds]}>Ads</Text>
          <Text style={[styles.tableHeaderCell, styles.colHost]}>Host / status</Text>
        </View>
        {list.map((domain, idx) => (
          <TableRow
            key={domain._id || idx}
            domain={domain}
            compressedImage={compressedImages?.[idx]}
          />
        ))}
        <DomainPageFooter />
      </Page>
    </Document>
  )
}

export default SummaryDomainsReportDocument
