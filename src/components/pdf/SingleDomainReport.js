import React from 'react'
import { Page, Text, View, Document, StyleSheet, Image, Link } from '@react-pdf/renderer'
import { registerFonts } from './fontRegistration'
import {
  DomainPdfTheme as Theme,
  DomainPageHeader,
  DomainPageFooter,
  formatPdfDate,
  formatPdfDay,
  getDomainRiskInfo,
  landerImageSrc,
  reportLanderForDomain,
  landerCaption,
  sslDateRange,
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
  topBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: Theme.BG_SECTION,
    padding: 12,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: Theme.BORDER_LIGHT,
    marginBottom: 12,
  },
  bannerLeft: { width: '68%', flexDirection: 'column', gap: 4 },
  bannerRight: { width: '30%', alignItems: 'flex-end' },
  domainName: { fontSize: 13, fontWeight: '900', color: Theme.PRIMARY_BLUE },
  meta: { fontSize: 7.5, color: Theme.SECONDARY_GRAY },
  link: { fontSize: 7.5, color: '#3B82F6', textDecoration: 'none' },
  riskBadge: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    width: '100%',
  },
  riskText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  split: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  leftCol: { width: '55%', gap: 6 },
  rightCol: { width: '42%', gap: 6 },
  sectionLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: Theme.SECONDARY_GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  hero: {
    width: '100%',
    maxHeight: 220,
    objectFit: 'cover',
    objectPosition: 'top',
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: Theme.BORDER_LIGHT,
  },
  heroFallback: {
    height: 120,
    backgroundColor: Theme.BG_SECTION,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  body: { fontSize: 8, lineHeight: 1.45, color: Theme.PRIMARY_BLUE },
  muted: { fontSize: 7, color: Theme.SECONDARY_GRAY, fontStyle: 'italic' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: {
    fontSize: 7,
    fontWeight: 'bold',
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: Theme.BORDER_LIGHT,
    backgroundColor: Theme.BG_SECTION,
  },
  legalBox: {
    padding: 6,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#FECDD3',
    backgroundColor: '#FFF1F2',
    marginBottom: 4,
  },
  legalCode: { fontSize: 8, fontWeight: '900', color: '#9F1239' },
  band: {
    marginTop: 4,
    padding: 8,
    backgroundColor: Theme.BG_SECTION,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: Theme.BORDER_LIGHT,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', paddingVertical: 3, paddingRight: 8 },
  cellLabel: { fontSize: 6.5, fontWeight: 'bold', color: Theme.SECONDARY_GRAY, textTransform: 'uppercase' },
  cellValue: { fontSize: 7.5, color: Theme.PRIMARY_BLUE, fontWeight: 'bold' },
  captionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: Theme.BORDER_LIGHT,
  },
  fullShot: { width: '100%', maxHeight: 680, objectFit: 'contain' },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mediaCell: { width: '48%' },
  mediaImg: { width: '100%', height: 180, objectFit: 'cover', borderRadius: 4 },
  mediaCap: { fontSize: 6.5, color: Theme.SECONDARY_GRAY, marginTop: 3 },
})

function InfoCell({ label, value }) {
  if (value == null || value === '' || value === 'N/A') return null
  const display = Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value)
  if (!display) return null
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{processPdfText(display, 120)}</Text>
    </View>
  )
}

function legalItems(review) {
  const codes = Array.isArray(review?.legal_codes) ? review.legal_codes : []
  return codes.map((item) => (
    typeof item === 'string'
      ? { code: item, reasoning: '' }
      : { code: item?.code || '', reasoning: item?.reasoning || '' }
  )).filter((c) => c.code)
}

function archivedMedia(lander) {
  const images = lander?.media?.images || []
  const videos = lander?.media?.videos || []
  const items = []
  images.forEach((img, idx) => {
    const src = img.signedUrl || img.s3_url
    if (src) items.push({ type: 'image', src, alt: img.alt || `Image ${idx + 1}`, url: img.source_url })
  })
  videos.forEach((vid, idx) => {
    const src = vid.poster || vid.thumbnail || vid.signedUrl || vid.s3_url
    if (src) items.push({ type: 'video', src, alt: `Video ${idx + 1}`, url: vid.source_url })
  })
  return items
}

function DossierPage({ domain, project, compressedImage }) {
  const review = domain.review_details || {}
  const list = domain.list || {}
  const analysis = domain.analysis_results || {}
  const lander = reportLanderForDomain(domain)
  const risk = getDomainRiskInfo(domain)
  const visitUrl = lander?.url || domainVisitUrl(domain)
  const imageUrl = landerImageSrc(lander, domain, compressedImage)
  const visible = clientVisibleCloakVariants(domain)
  const allCount = visible.length
  const cloaked = domainHasCloaking(domain)
  const legal = legalItems(review)
  const violations = collectDomainViolations(domain)
  const whois = analysis.whois || {}
  const hosting = analysis.hosting || {}
  const ssl = analysis.ssl || {}
  const dns = analysis.dns || {}
  const content = analysis.content_classification || {}
  const sslDates = sslDateRange(ssl)
  const ads = Array.isArray(domain.discovery?.occurrences)
    ? domain.discovery.occurrences.filter((o) => String(o?.entity_type || '').toLowerCase() === 'ad')
    : []
  const media = archivedMedia(lander)
  const otherLanders = Math.max(0, allCount - 1)
  const projectCodes = project?.project_details?.legal_codes || []

  return (
    <Page size="A4" style={styles.page}>
      <DomainPageHeader domainName={domain.domain_name} />

      <View style={styles.topBanner}>
        <View style={styles.bannerLeft}>
          <Text style={styles.domainName}>{domain.domain_name || 'Unknown domain'}</Text>
          <Text style={styles.meta}>
            {cloaked ? 'Cloaked' : 'Not cloaked'}
            {'  ·  '}
            {landerCaption(lander)}
            {lander?.kind ? `  ·  ${String(lander.kind).toUpperCase()}` : ''}
          </Text>
          {visitUrl ? (
            <Link src={visitUrl} style={styles.link}>{processPdfText(visitUrl, 90)}</Link>
          ) : null}
          <Text style={styles.meta}>Status: {domain.client_status || list.client_status || '—'}</Text>
        </View>
        <View style={styles.bannerRight}>
          <View style={[styles.riskBadge, { backgroundColor: risk.bg, borderColor: risk.color }]}>
            <Text style={[styles.riskText, { color: risk.color }]}>{risk.label}</Text>
          </View>
        </View>
      </View>

      <View style={styles.split}>
        <View style={styles.leftCol}>
          <Text style={styles.sectionLabel}>Selected lander</Text>
          {imageUrl ? (
            <Image style={styles.hero} src={imageUrl} />
          ) : (
            <View style={styles.heroFallback}>
              <Text style={styles.muted}>No screenshot</Text>
            </View>
          )}
          {lander?.title ? <Text style={styles.body}>{processPdfText(lander.title, 160)}</Text> : null}
          {lander?.excerpt ? <Text style={styles.muted}>{processPdfText(lander.excerpt, 280)}</Text> : null}
          <Text style={styles.muted}>
            {media.filter((m) => m.type === 'image').length} archived images
            {' · '}
            {media.filter((m) => m.type === 'video').length} videos
          </Text>
        </View>

        <View style={styles.rightCol}>
          <Text style={styles.sectionLabel}>Legal & reasoning</Text>
          {legal.length > 0 ? legal.map((item, idx) => {
            const projectCode = projectCodes.find((pc) => (typeof pc === 'string' ? pc : pc?.name || pc?.code) === item.code)
            const ref = typeof projectCode === 'object' ? projectCode?.referenceLink : null
            return (
              <View key={`${item.code}-${idx}`} style={styles.legalBox}>
                <Text style={styles.legalCode}>{item.code}</Text>
                {item.reasoning ? <Text style={styles.body}>{processPdfText(item.reasoning, 400)}</Text> : null}
                {ref ? <Link src={ref} style={styles.link}>Reference</Link> : null}
              </View>
            )
          }) : <Text style={styles.muted}>No legal codes recorded.</Text>}

          {review.simple_report_description ? (
            <View>
              <Text style={styles.sectionLabel}>Simple reasoning</Text>
              <Text style={styles.body}>{processPdfText(review.simple_report_description, 500)}</Text>
            </View>
          ) : null}

          <Text style={styles.sectionLabel}>Reasoning</Text>
          <Text style={styles.body}>
            {processPdfText(review.reasoning || 'No reviewer reasoning recorded.', 700)}
          </Text>

          <Text style={styles.sectionLabel}>Violations</Text>
          <View style={styles.chipRow}>
            {violations.length > 0 ? violations.map((v) => (
              <Text key={v} style={styles.chip}>{String(v).replace(/[-_]/g, ' ')}</Text>
            )) : <Text style={styles.muted}>None identified.</Text>}
          </View>

          {review.reviewer_comments ? (
            <View>
              <Text style={styles.sectionLabel}>Reviewer notes</Text>
              <Text style={styles.body}>{processPdfText(review.reviewer_comments, 300)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.band}>
        <Text style={styles.sectionLabel}>Infrastructure & discovery</Text>
        <View style={styles.grid}>
          <InfoCell label="Category" value={domain.category && String(domain.category).toLowerCase() !== 'scam' ? domain.category : null} />
          <InfoCell label="First seen" value={formatPdfDay(domain.first_seen_at || list.first_seen_at)} />
          <InfoCell label="Last seen" value={formatPdfDay(domain.last_seen_at || list.last_seen_at)} />
          <InfoCell label="Last analyzed" value={formatPdfDate(domain.last_analyzed_at || list.last_analyzed_at)} />
          <InfoCell label="First-seen URL" value={domain.discovery?.first_seen_url} />
          <InfoCell label="Linked ads" value={linkedAdCount(domain)} />
          <InfoCell label="Registrar" value={whois.registrar || list.registrar} />
          <InfoCell label="WHOIS created" value={formatPdfDay(whois.created_at)} />
          <InfoCell label="Age (days)" value={whois.age_days_at_analysis} />
          <InfoCell label="Privacy" value={whois.privacy_protected == null ? null : (whois.privacy_protected ? 'Yes' : 'No')} />
          <InfoCell label="Registrant country" value={whois.registrant_country} />
          <InfoCell label="Hosting" value={hosting.provider || list.hosting_provider} />
          <InfoCell label="Hosting country" value={hosting.country || list.hosting_country} />
          <InfoCell label="CDN" value={hosting.is_cdn == null ? null : (hosting.is_cdn ? 'Yes' : 'No')} />
          <InfoCell label="SSL issuer" value={ssl.issuer} />
          <InfoCell label="SSL valid" value={ssl.is_valid == null && list.ssl_valid == null ? null : ((ssl.is_valid ?? list.ssl_valid) ? 'Yes' : 'No')} />
          <InfoCell label="SSL from" value={formatPdfDay(sslDates.from)} />
          <InfoCell label="SSL to" value={formatPdfDay(sslDates.to)} />
          <InfoCell label="Nameservers" value={dns.nameservers || dns.ns} />
          <InfoCell label="DNS A" value={dns.a} />
          <InfoCell label="DNS MX" value={dns.mx} />
          <InfoCell label="Page title" value={content.title} />
          <InfoCell label="Spoofed brands" value={content.spoofed_brands} />
          <InfoCell label="Tech stack" value={analysis.tech_stack} />
          <InfoCell label="Cloak unlocked" value={cloaked ? 'Yes' : 'No'} />
          <InfoCell label="Landers captured" value={`${allCount} (this PDF covers 1)`} />
        </View>
        {content.summary ? <Text style={styles.muted}>{processPdfText(content.summary, 280)}</Text> : null}
        {Array.isArray(analysis.redirect_chain) && analysis.redirect_chain.length > 0 ? (
          <Text style={styles.muted}>
            Redirects: {analysis.redirect_chain.slice(0, 6).map((h) => `${h?.status_code || '—'} ${h?.url || ''}`).join(' → ')}
          </Text>
        ) : null}
        {ads.length > 0 ? (
          <Text style={styles.muted}>
            Ads: {ads.slice(0, 8).map((a) => String(a.entity_id)).join(', ')}
            {ads.length > 8 ? ` +${ads.length - 8} more` : ''}
          </Text>
        ) : null}
        {otherLanders > 0 ? (
          <Text style={styles.muted}>
            Other captured landers exist; this report covers {cloakKey(lander)} only.
          </Text>
        ) : null}
      </View>

      <DomainPageFooter />
    </Page>
  )
}

function cloakKey(lander) {
  if (!lander) return 'Bare'
  const key = lander.label || lander.param || 'bare'
  return key === 'bare' ? 'Bare' : String(key)
}

function CapturePage({ domain, compressedImage }) {
  const lander = reportLanderForDomain(domain)
  const imageUrl = landerImageSrc(lander, domain, compressedImage)
  const captured = lander?.screenshot?.captured_at
  const visitUrl = lander?.url || domainVisitUrl(domain)

  return (
    <Page size="A4" style={styles.page}>
      <DomainPageHeader domainName={domain.domain_name} />
      <View style={styles.captionBar}>
        <View>
          <Text style={styles.sectionLabel}>{domain.domain_name}</Text>
          <Text style={styles.meta}>{landerCaption(lander)}</Text>
          {visitUrl ? <Link src={visitUrl} style={styles.link}>{processPdfText(visitUrl, 100)}</Link> : null}
        </View>
        <Text style={styles.meta}>Captured {formatPdfDate(captured)}</Text>
      </View>
      {imageUrl ? (
        <Image style={styles.fullShot} src={imageUrl} />
      ) : (
        <View style={styles.heroFallback}>
          <Text style={styles.muted}>No full-page capture for this lander</Text>
        </View>
      )}
      <DomainPageFooter />
    </Page>
  )
}

function MediaPages({ domain }) {
  const lander = reportLanderForDomain(domain)
  const items = archivedMedia(lander)
  if (items.length === 0) return null

  const pages = []
  for (let i = 0; i < items.length; i += 4) {
    const slice = items.slice(i, i + 4)
    pages.push(
      <Page key={`media-${i}`} size="A4" style={styles.page}>
        <DomainPageHeader domainName={domain.domain_name} />
        <View style={styles.captionBar}>
          <View>
            <Text style={styles.sectionLabel}>{domain.domain_name}</Text>
            <Text style={styles.meta}>{landerCaption(lander)} · archived media</Text>
          </View>
          <Text style={styles.meta}>{i + 1}–{Math.min(i + 4, items.length)} of {items.length}</Text>
        </View>
        <View style={styles.mediaGrid}>
          {slice.map((item, idx) => (
            <View key={`${item.src}-${idx}`} style={styles.mediaCell}>
              <Image style={styles.mediaImg} src={item.src} />
              <Text style={styles.mediaCap}>
                {item.type === 'video' ? 'Video poster · ' : ''}
                {processPdfText(item.alt || '', 80)}
                {item.url ? ` · ${processPdfText(item.url, 60)}` : ''}
              </Text>
            </View>
          ))}
        </View>
        <DomainPageFooter />
      </Page>,
    )
  }
  return pages
}

/** One domain: dossier + full capture + media pages. Used by detailed/single domain PDFs. */
export function SingleDomainPages({ domain, project, compressedImage }) {
  const lander = reportLanderForDomain(domain)
  const hasShot = Boolean(landerImageSrc(lander, domain, compressedImage))
  return (
    <>
      <DossierPage domain={domain} project={project} compressedImage={compressedImage} />
      {hasShot ? <CapturePage domain={domain} compressedImage={compressedImage} /> : null}
      <MediaPages domain={domain} />
    </>
  )
}

export function SingleDomainDocument({ domain, post, project, compressedImage }) {
  const doc = domain || post
  return (
    <Document title={`Domain_${doc?.domain_name || 'report'}`}>
      <SingleDomainPages domain={doc} project={project} compressedImage={compressedImage} />
    </Document>
  )
}

export default SingleDomainDocument
