/**
 * Display helpers for Review Ads UI.
 */

const TEMPLATE_VAR_RE = /\{\{[^}]+\}\}/

export const DISPLAY_FORMAT_LABELS = {
  DPA: 'Dynamic Product Ad',
  CAROUSEL: 'Carousel',
  IMAGE: 'Image',
  VIDEO: 'Video',
  SINGLE_IMAGE: 'Single image',
  SINGLE_VIDEO: 'Single video',
  MULTI_IMAGES: 'Multi image',
  MULTI_VIDEOS: 'Multi video',
  SLIDESHOW: 'Slideshow',
  PAGE_LIKE: 'Page like',
  EVENT: 'Event',
}

export function formatDisplayFormat(raw) {
  if (!raw) return null
  const key = String(raw).trim().toUpperCase()
  return DISPLAY_FORMAT_LABELS[key] || String(raw).replace(/_/g, ' ')
}

export function isTemplatePlaceholder(value) {
  if (value == null) return true
  const s = String(value).trim()
  if (!s) return true
  return TEMPLATE_VAR_RE.test(s)
}

function firstRealText(...values) {
  for (const value of values) {
    if (value == null) continue
    const s = String(value).trim()
    if (!s) continue
    if (isTemplatePlaceholder(s)) continue
    return s
  }
  return null
}

/** Best human-readable title for list + detail headers. */
export function getAdDisplayTitle(ad) {
  const content = ad?.content || {}
  const firstCard = content.cards?.[0] || {}
  return (
    firstRealText(
      content.title,
      firstCard.title,
      content.caption,
      firstCard.caption,
      content.body,
      firstCard.body,
    ) || 'Untitled ad'
  )
}

/** Best body/preview line for list rows. */
export function getAdDisplayPreview(ad) {
  const content = ad?.content || {}
  const firstCard = content.cards?.[0] || {}
  return firstRealText(
    content.body,
    firstCard.body,
    content.caption,
    firstCard.caption,
    content.link_description,
    firstCard.link_description,
    content.cta_text,
    firstCard.cta_text,
  )
}

export function getAdImpressions(ad) {
  const text =
    ad?.list?.impressions_text ||
    ad?.ad_delivery?.impressions_text ||
    null
  const index =
    ad?.list?.impressions_index ??
    ad?.ad_delivery?.impressions_index ??
    null
  return { text, index }
}

export function formatAdDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const datePart = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const timePart = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${datePart} ${timePart}`
}

/** Labeled creative fields for the detail info panel. */
export function getAdCreativeFields(ad, card = null) {
  const content = ad?.content || {}
  const active = card || content.cards?.[0] || {}

  const title = firstRealText(active.title, content.title)
  const body = firstRealText(active.body, content.body)
  const caption = firstRealText(active.caption, content.caption)
  const linkDescription = firstRealText(active.link_description, content.link_description)
  const cta = firstRealText(active.cta_text, content.cta_text)
  const ctaType = firstRealText(active.cta_type, content.cta_type)
  const linkUrl = firstRealText(active.link_url, content.link_url)
  const displayUrl = firstRealText(content.caption, active.caption)

  return {
    title,
    body,
    caption,
    linkDescription,
    cta,
    ctaType,
    linkUrl,
    displayUrl: displayUrl && !displayUrl.startsWith('http') ? displayUrl : null,
    formatRaw: content.display_format || ad?.list?.display_format || null,
    formatLabel: formatDisplayFormat(content.display_format || ad?.list?.display_format),
  }
}
