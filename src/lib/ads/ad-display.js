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

/** Online vs taken-down badge for list rows. */
export function getAdVisibilityLabel(ad) {
  const status = String(
    ad?.visibility_status ?? ad?.workflow?.visibility_status ?? 'available',
  ).toLowerCase()
  const down = status === 'down'
  return {
    down,
    label: down ? 'Taken Down' : 'Online',
    status,
  }
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

/** Parse host + compact path/query display from an absolute URL. */
function parseDestinationUrl(url) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./i, '')
    const pathQuery = `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}${parsed.hash}`
    return {
      host,
      display: pathQuery ? `${host}${pathQuery}` : host,
    }
  } catch {
    return { host: url, display: url }
  }
}

/**
 * All destination link_urls for an ad (per-card + top-level), deduped by exact URL.
 * @returns {{ cardIndex: number|null, cardIndexes: number[], label: string|null, url: string, host: string, display: string }[]}
 */
export function getAdDestinationLinks(ad) {
  const content = ad?.content || {}
  const cards = Array.isArray(content.cards) ? content.cards : []
  const byUrl = new Map()

  cards.forEach((card, cardIndex) => {
    const url = firstRealText(card?.link_url)
    if (!url) return
    const existing = byUrl.get(url)
    if (existing) {
      existing.cardIndexes.push(cardIndex)
      return
    }
    const { host, display } = parseDestinationUrl(url)
    byUrl.set(url, { url, host, display, cardIndexes: [cardIndex] })
  })

  const topUrl = firstRealText(content.link_url)
  if (topUrl && !byUrl.has(topUrl)) {
    const { host, display } = parseDestinationUrl(topUrl)
    byUrl.set(topUrl, { url: topUrl, host, display, cardIndexes: [] })
  }

  const multiCard = cards.length > 1
  return Array.from(byUrl.values()).map((entry) => {
    let label = null
    if (entry.cardIndexes.length > 1) {
      label = `Cards ${entry.cardIndexes.map((i) => i + 1).join(', ')}`
    } else if (entry.cardIndexes.length === 1 && multiCard) {
      label = `Card ${entry.cardIndexes[0] + 1}`
    }
    return {
      cardIndex: entry.cardIndexes[0] ?? null,
      cardIndexes: entry.cardIndexes,
      label,
      url: entry.url,
      host: entry.host,
      display: entry.display,
    }
  })
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
