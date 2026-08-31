/**
 * Display helpers for Review Ads UI.
 */

const TEMPLATE_VAR_RE = /\{\{[^}]+\}\}/

export const AD_CHANNEL = {
  INGESTION: 'ingestion',
  LIBRARY: 'library',
  FEED: 'feed',
}

export const AD_CHANNEL_LABELS = {
  ingestion: 'Ingestion',
  library: 'Library',
  feed: 'Feed',
}

const LIBRARY_URL_RE = /\/ads\/library/i
const FEED_URL_RE =
  /\/share\/|\/posts\/|\/reels\/|permalink\.php|story_fbid|fbid|facebook\.com\/\d+\/posts\//i

/** Client Upload Content requests — show as ingestion even when the link is library or feed. */
function isClientIngestedAd(ad) {
  if (ad?.channel === AD_CHANNEL.INGESTION) return true
  if (ad?.submitted_url) return true
  const ingestionType = String(ad?.ingestion?.type || '')
  return (
    ingestionType === 'facebook_share_post' ||
    ingestionType === 'client_request' ||
    ingestionType === 'client_requested_link'
  )
}

/** Classify by URL shape when the ad was not client-requested. */
export function inferAdChannelFromUrl(originalUrl) {
  const url = String(originalUrl || '')
  if (LIBRARY_URL_RE.test(url)) return AD_CHANNEL.LIBRARY
  if (FEED_URL_RE.test(url)) return AD_CHANNEL.FEED
  return AD_CHANNEL.FEED
}

export function getAdChannel(ad) {
  const stored = ad?.channel
  if (stored === 'ads_library') return AD_CHANNEL.LIBRARY
  if (
    stored === AD_CHANNEL.INGESTION ||
    stored === AD_CHANNEL.LIBRARY ||
    stored === AD_CHANNEL.FEED
  ) {
    return stored
  }
  if (isClientIngestedAd(ad)) return AD_CHANNEL.INGESTION
  const url =
    ad?.original_url ||
    ad?.original_link ||
    ad?.ingestion?.source_url ||
    ad?.submitted_url ||
    ''
  return inferAdChannelFromUrl(url)
}

export function formatAdChannelLabel(channel) {
  if (channel === 'ads_library') return AD_CHANNEL_LABELS.library
  return AD_CHANNEL_LABELS[channel] || AD_CHANNEL_LABELS.feed
}

export function getAdChannelBadgeClass(channel) {
  const resolved = channel === 'ads_library' ? AD_CHANNEL.LIBRARY : channel
  if (resolved === AD_CHANNEL.INGESTION) {
    return 'bg-violet-50 text-violet-700 border-violet-100'
  }
  if (resolved === AD_CHANNEL.LIBRARY) {
    return 'bg-indigo-50 text-indigo-700 border-indigo-100'
  }
  return 'bg-amber-50 text-amber-800 border-amber-100'
}

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

/** Card creatives have cards[]; everything else is single top-level content. */
export function getAdCreativeMode(ad) {
  const cards = ad?.content?.cards
  return Array.isArray(cards) && cards.length > 0 ? 'card' : 'single'
}

function mediaTypeOf(item) {
  const raw = String(item?.type || '').toLowerCase()
  if (raw === 'video') return 'video'
  if (raw === 'image') return 'image'
  const url = String(item?.signedUrl || item?.s3_url || item?.original_url || '')
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video'
  if (url) return 'image'
  return null
}

function mediaPlayableUrl(item, { allowS3 = false } = {}) {
  return item?.signedUrl || (allowS3 ? item?.s3_url : null) || null
}

/** Normalize body which may be a string or `{ text }` from Meta ingest. */
function resolveBodyText(body) {
  if (body == null) return null
  if (typeof body === 'string') return body
  if (typeof body === 'object' && typeof body.text === 'string') return body.text
  return null
}

function flattenAdMedia(ad) {
  const content = ad?.content || {}
  if (Array.isArray(content.media) && content.media.length > 0) {
    return content.media
  }
  const fromCards = []
  for (const [idx, card] of (content.cards || []).entries()) {
    for (const m of card?.media || []) {
      fromCards.push({ ...m, card_index: m.card_index ?? idx })
    }
  }
  return fromCards
}

/**
 * List thumb: prefer first image signed URL; if only video exists, kind=video (no url for <img>).
 * @returns {{ kind: 'image' | 'video' | 'none', url?: string }}
 */
export function getAdListThumb(ad) {
  const media = flattenAdMedia(ad)
  const firstImage = media.find((m) => mediaTypeOf(m) === 'image' && mediaPlayableUrl(m))
  if (firstImage) {
    return { kind: 'image', url: mediaPlayableUrl(firstImage) }
  }
  const hasVideo = media.some((m) => mediaTypeOf(m) === 'video')
  if (hasVideo) return { kind: 'video' }
  // Legacy: signedImageUrl may be an image; never treat unknown video-like as image
  if (ad?.signedImageUrl) {
    const legacyLooksVideo = /\.(mp4|webm|mov)(\?|$)/i.test(String(ad.signedImageUrl))
    if (!legacyLooksVideo) return { kind: 'image', url: ad.signedImageUrl }
    return { kind: 'video' }
  }
  return { kind: 'none' }
}

/**
 * Primary media for detail stage (active card or top-level).
 * @returns {{ type: 'image' | 'video' | null, url?: string }}
 */
export function getAdPrimaryMedia(ad, card = null) {
  const content = ad?.content || {}
  const mode = getAdCreativeMode(ad)
  let candidates = []

  if (mode === 'card') {
    const active = card || content.cards?.[0] || null
    candidates = Array.isArray(active?.media) ? active.media : []
  } else {
    candidates = Array.isArray(content.media) ? content.media : []
  }

  // allowS3: review edit drafts may only have s3_url before re-sign
  const withUrl = candidates.find((m) => mediaPlayableUrl(m, { allowS3: true }))
  if (withUrl) {
    return {
      type: mediaTypeOf(withUrl) || 'image',
      url: mediaPlayableUrl(withUrl, { allowS3: true }),
    }
  }

  // Fallbacks used by older list aliases
  if (ad?.signedImageUrl) {
    const looksVideo = /\.(mp4|webm|mov)(\?|$)/i.test(String(ad.signedImageUrl))
    return {
      type: looksVideo ? 'video' : 'image',
      url: ad.signedImageUrl,
    }
  }
  return { type: null }
}

/** Thumb kind for a single media item (e.g. card filmstrip). */
export function getMediaItemThumb(item) {
  if (!item) return { kind: 'none' }
  const type = mediaTypeOf(item)
  const url = mediaPlayableUrl(item, { allowS3: true })
  if (type === 'image' && url) return { kind: 'image', url }
  if (type === 'video') return { kind: 'video' }
  if (url && !/\.(mp4|webm|mov)(\?|$)/i.test(String(url))) {
    return { kind: 'image', url }
  }
  if (type === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(String(url || ''))) {
    return { kind: 'video' }
  }
  return { kind: 'none' }
}

/** First line / short snippet of body for list titles. */
function bodySnippet(body, maxLen = 120) {
  if (!body) return null
  const firstLine = String(body).split(/\r?\n/).map((l) => l.trim()).find(Boolean)
  if (!firstLine) return null
  if (firstLine.length <= maxLen) return firstLine
  return `${firstLine.slice(0, maxLen - 1).trimEnd()}…`
}

/** Best human-readable title for list + detail headers. */
export function getAdDisplayTitle(ad) {
  const content = ad?.content || {}
  const mode = getAdCreativeMode(ad)

  if (mode === 'single') {
    return (
      firstRealText(
        content.title,
        bodySnippet(resolveBodyText(content.body)),
        content.cta_text,
      ) || 'Untitled ad'
    )
  }

  const firstCard = content.cards?.[0] || {}
  return (
    firstRealText(
      content.title,
      firstCard.title,
      content.caption,
      firstCard.caption,
      resolveBodyText(content.body),
      resolveBodyText(firstCard.body),
    ) || 'Untitled ad'
  )
}

/** Best body/preview line for list rows. */
export function getAdDisplayPreview(ad) {
  const content = ad?.content || {}
  const mode = getAdCreativeMode(ad)
  const title = getAdDisplayTitle(ad)

  if (mode === 'single') {
    const bodyText = firstRealText(resolveBodyText(content.body))
    // If title already took the first body line, use remaining body or CTA
    if (bodyText) {
      const snippet = bodySnippet(bodyText)
      if (snippet && snippet !== title && bodyText !== title) {
        // Prefer a later line when title is the first line
        const lines = String(bodyText).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        const rest = lines.slice(1).join(' ')
        if (rest) return rest.length > 160 ? `${rest.slice(0, 159).trimEnd()}…` : rest
      }
      if (bodyText !== title && snippet !== title) return bodyText
    }
    return firstRealText(content.cta_text, content.link_description)
  }

  const firstCard = content.cards?.[0] || {}
  return firstRealText(
    resolveBodyText(content.body),
    resolveBodyText(firstCard.body),
    content.caption,
    firstCard.caption,
    content.link_description,
    firstCard.link_description,
    content.cta_text,
    firstCard.cta_text,
  )
}

const BODY_URL_RE = /https?:\/\/[^\s<>"')\]]+/gi
const BODY_PHONE_RE = /(?:\+?\d[\d\s\-()]{7,}\d)/g

/**
 * URLs and phone numbers already present in body text (no invented fields).
 * @returns {{ urls: string[], phones: string[] }}
 */
export function extractBodyContacts(body) {
  const text = resolveBodyText(body) || ''
  if (!text.trim()) return { urls: [], phones: [] }

  const urls = [...new Set((text.match(BODY_URL_RE) || []).map((u) => u.replace(/[.,;:]+$/, '')))]
  const phones = [
    ...new Set(
      (text.match(BODY_PHONE_RE) || [])
        .map((p) => p.trim())
        .filter((p) => p.replace(/\D/g, '').length >= 8),
    ),
  ]
  return { urls, phones }
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
  const body = firstRealText(resolveBodyText(active.body), resolveBodyText(content.body))
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
