import React from 'react'
import { Page, Text, View, Document, StyleSheet, Image, Link } from '@react-pdf/renderer'
import { format, isValid, parseISO } from 'date-fns'
import { registerFonts } from './fontRegistration'
import {
  clientVisibleCloakVariants,
  collectDomainViolations,
  domainHasCloaking,
  domainVisitUrl,
  resolveReportLander,
  cloakVariantKey,
} from '@/lib/domains/domain-display'

registerFonts()

export const DomainPdfTheme = {
  PRIMARY_BLUE: '#1E293B',
  SECONDARY_GRAY: '#64748B',
  BORDER_LIGHT: '#E2E8F0',
  BG_SECTION: '#F8FAFC',
  RISK_HIGH: '#F43F5E',
  RISK_MEDIUM: '#F97316',
  RISK_LOW: '#F59E0B',
  SAFE: '#10B981',
}

export function processPdfText(text, maxLength = 500, maxLines = null) {
  if (!text) return ''
  let sanitized = Array.from(String(text)).filter((char) => {
    const cp = char.codePointAt(0)
    return (cp >= 32 && cp <= 126) || cp === 10 || cp === 13 || cp === 9
      || /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}]/u.test(char)
  }).join('')

  let result = sanitized
  let truncated = false
  if (maxLines) {
    const lines = result.split(/\r\n|\r|\n/)
    if (lines.length > maxLines) {
      result = lines.slice(0, maxLines).join('\n')
      truncated = true
    }
  }
  if (result.length > maxLength) {
    result = result.substring(0, maxLength)
    truncated = true
  }
  return truncated ? `${result.trim()}...` : result
}

export function formatPdfDate(dateInput) {
  if (!dateInput) return 'N/A'
  try {
    const dateObj = typeof dateInput === 'string' ? parseISO(dateInput) : new Date(dateInput)
    if (isValid(dateObj)) return format(dateObj, 'dd MMM yyyy, hh:mm a')
  } catch {
    return 'N/A'
  }
  return 'N/A'
}

export function formatPdfDay(dateInput) {
  if (!dateInput) return 'N/A'
  try {
    const dateObj = typeof dateInput === 'string' ? parseISO(dateInput) : new Date(dateInput)
    if (isValid(dateObj)) return format(dateObj, 'dd MMM yyyy')
  } catch {
    return 'N/A'
  }
  return 'N/A'
}

export function getDomainRiskInfo(domain) {
  const v = String(domain?.list?.risk_rank || domain?.risk_rank || '').toLowerCase()
  if (v === 'high') return { label: 'High Risk', color: DomainPdfTheme.RISK_HIGH, bg: '#FFF1F2' }
  if (v === 'mid' || v === 'medium') return { label: 'Medium Risk', color: DomainPdfTheme.RISK_MEDIUM, bg: '#FFF7ED' }
  if (v === 'low') return { label: 'Low Risk', color: DomainPdfTheme.RISK_LOW, bg: '#FFFBEB' }
  return { label: 'Safe', color: DomainPdfTheme.SAFE, bg: '#ECFDF5' }
}

export function landerImageSrc(lander, domain, compressedImage) {
  return compressedImage
    || lander?.signedScreenshotUrl
    || lander?.screenshot?.s3_url
    || lander?.screenshot?.url
    || domain?.screenshotUrl
    || domain?.analysis_results?.screenshot?.s3_url
    || null
}

export function reportLanderForDomain(domain) {
  if (domain?.reportLander) return domain.reportLander
  return resolveReportLander(domain, domain?.reportVariantKey)
}

export function landerCaption(lander) {
  if (!lander) return 'Lander: Bare'
  const key = cloakVariantKey(lander) || 'bare'
  const label = key === 'bare' ? 'Bare' : key
  return `Lander: ${label}`
}

export function sslDateRange(ssl = {}) {
  const from = ssl.valid_from || ssl.not_before || ssl.issued_at
  const to = ssl.valid_to || ssl.not_after || ssl.expires_at
  return { from, to }
}

export function linkedAdCount(domain) {
  const occurrences = Array.isArray(domain?.discovery?.occurrences) ? domain.discovery.occurrences : []
  return occurrences.filter((o) => String(o?.entity_type || '').toLowerCase() === 'ad').length
}

export function DomainPageHeader({ domainName }) {
  return (
    <View style={shared.header} fixed>
      <View>
        <Text style={shared.title}>OVERWATCH</Text>
        <Text style={shared.subtitle}>Threat Intelligence Platform</Text>
      </View>
      <View style={shared.headerRight}>
        <Text style={shared.headerDate}>{formatPdfDate(new Date())}</Text>
        <Text style={shared.headerID}>DOMAIN: {String(domainName || '').toUpperCase()}</Text>
      </View>
    </View>
  )
}

export function DomainPageFooter() {
  return (
    <View style={shared.footer} fixed>
      <Text style={shared.footerLeft}>CONFIDENTIAL DOCUMENT</Text>
      <Text style={shared.footerCenter}>POWERED BY CONTRAILS AI</Text>
      <Text
        style={shared.footerRight}
        render={({ pageNumber, totalPages }) => `PAGE ${pageNumber} OF ${totalPages}`}
      />
    </View>
  )
}

const shared = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: DomainPdfTheme.BORDER_LIGHT,
    paddingBottom: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: DomainPdfTheme.PRIMARY_BLUE,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 7,
    color: DomainPdfTheme.SECONDARY_GRAY,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  headerRight: { alignItems: 'flex-end' },
  headerDate: { fontSize: 8, fontWeight: 'bold', color: DomainPdfTheme.PRIMARY_BLUE },
  headerID: { fontSize: 6, fontWeight: 'bold', color: DomainPdfTheme.SECONDARY_GRAY, marginTop: 2 },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 6.5,
    color: DomainPdfTheme.SECONDARY_GRAY,
    borderTopWidth: 0.5,
    borderTopColor: DomainPdfTheme.BORDER_LIGHT,
    paddingTop: 10,
  },
  footerLeft: { textTransform: 'uppercase', fontWeight: 'bold' },
  footerCenter: { textTransform: 'uppercase' },
  footerRight: { textTransform: 'uppercase', fontWeight: 'bold' },
})

export {
  clientVisibleCloakVariants,
  collectDomainViolations,
  domainHasCloaking,
  domainVisitUrl,
}
