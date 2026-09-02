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

/** UI label for platform_ad_id — feed posts show Post ID. */
export function getAdIdentityLabel(ad) {
  return getAdChannel(ad) === AD_CHANNEL.FEED ? 'Post ID' : 'Ad ID'
}

/** UI label for original_url link — channel-aware. */
export function getAdSourceLinkLabel(ad) {
  const channel = getAdChannel(ad)
  if (channel === AD_CHANNEL.FEED) return 'View Post'
  if (channel === AD_CHANNEL.LIBRARY) return 'Ads Library'
  return 'Source'
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

function isUrlLike(value) {
  const s = String(value || '').trim()
  if (!s) return false
  if (/^https?:\/\//i.test(s)) return true
  try {
    // eslint-disable-next-line no-new
    new URL(s)
    return true
  } catch {
    return false
  }
}

export function isTemplatePlaceholder(value) {
  if (value == null) return true
  const s = String(value).trim()
  if (!s) return true
  // Real destination URLs may contain Meta macro tokens in query params.
  if (isUrlLike(s)) return false
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

/** Like firstRealText but keeps URL-like values even when they contain {{…}} macros. */
function firstRealDestinationUrl(...values) {
  for (const value of values) {
    if (value == null) continue
    const s = String(value).trim()
    if (!s) continue
    if (isUrlLike(s)) return s
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

function mediaPosterUrl(item, { allowS3 = false } = {}) {
  return (
    item?.thumbnailSignedUrl ||
    (allowS3 ? item?.thumbnail_s3_url : null) ||
    item?.thumbnail_url ||
    null
  )
}

function resolveMediaCandidates(ad, card = null) {
  const content = ad?.content || {}
  const mode = getAdCreativeMode(ad)
  if (mode === 'card') {
    const active = card || content.cards?.[0] || null
    return Array.isArray(active?.media) ? active.media : []
  }
  return Array.isArray(content.media) ? content.media : []
}

/**
 * All playable media items for the active creative scope.
 * @returns {{ type: 'image' | 'video', url: string, role?: string, posterUrl?: string }[]}
 */
export function getAdViewableMedia(ad, card = null) {
  const candidates = resolveMediaCandidates(ad, card)
  const items = []

  for (const item of candidates) {
    const url = mediaPlayableUrl(item, { allowS3: true })
    if (!url) continue
    const type = mediaTypeOf(item) || 'image'
    items.push({
      type,
      url,
      role: item?.role || null,
      posterUrl: type === 'video' ? mediaPosterUrl(item, { allowS3: true }) : null,
    })
  }

  if (items.length === 0 && ad?.signedImageUrl) {
    const looksVideo = /\.(mp4|webm|mov)(\?|$)/i.test(String(ad.signedImageUrl))
    items.push({
      type: looksVideo ? 'video' : 'image',
      url: ad.signedImageUrl,
      role: null,
      posterUrl: null,
    })
  }

  return items
}

/** Default filmstrip index — thumbnail / first image first. */
export function getDefaultMediaIndex(viewableMedia) {
  if (!Array.isArray(viewableMedia) || viewableMedia.length === 0) return 0
  const thumbIdx = viewableMedia.findIndex((m) => m.role === 'thumbnail')
  if (thumbIdx >= 0) return thumbIdx
  const imageIdx = viewableMedia.findIndex((m) => m.type === 'image')
  if (imageIdx >= 0) return imageIdx
  return 0
}

/**
 * Navigation mode for detail creative stage.
 * @returns {{ kind: 'cards' | 'media' | 'none', count: number }}
 */
export function getAdMediaNav(ad, card = null) {
  const content = ad?.content || {}
  const cards = Array.isArray(content.cards) ? content.cards : []
  if (cards.length > 1) {
    return { kind: 'cards', count: cards.length }
  }
  const viewable = getAdViewableMedia(ad, card)
  if (viewable.length > 1) {
    return { kind: 'media', count: viewable.length }
  }
  return { kind: 'none', count: Math.max(viewable.length, 1) }
}

/** Subtitle for creative panel — card vs flat media navigation. */
export function getAdCreativeNavLabel(ad, { activeCard = 0, activeMediaIndex = 0, card = null } = {}) {
  const nav = getAdMediaNav(ad, card)
  if (nav.kind === 'cards') {
    return `Card ${Math.min(activeCard, nav.count - 1) + 1} of ${nav.count}`
  }
  if (nav.kind === 'media') {
    return `Media ${Math.min(activeMediaIndex, nav.count - 1) + 1} of ${nav.count}`
  }
  return 'Single creative'
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
  const thumbImage = media.find(
    (m) =>
      (m.role === 'thumbnail' || mediaTypeOf(m) === 'image') && mediaPlayableUrl(m),
  )
  if (thumbImage) {
    return { kind: 'image', url: mediaPlayableUrl(thumbImage) }
  }
  const videoWithPoster = media.find(
    (m) => mediaTypeOf(m) === 'video' && mediaPosterUrl(m),
  )
  if (videoWithPoster) {
    return { kind: 'image', url: mediaPosterUrl(videoWithPoster) }
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
export function getAdPrimaryMedia(ad, card = null, mediaIndex = null) {
  const viewable = getAdViewableMedia(ad, card)
  if (viewable.length === 0) return { type: null }
  const idx =
    mediaIndex == null
      ? getDefaultMediaIndex(viewable)
      : Math.min(Math.max(0, mediaIndex), viewable.length - 1)
  const item = viewable[idx]
  return {
    type: item.type,
    url: item.url,
    poster: item.posterUrl || undefined,
  }
}

/** Thumb kind for a single media item (e.g. card filmstrip). */
export function getMediaItemThumb(item) {
  if (!item) return { kind: 'none' }
  const type = mediaTypeOf(item)
  const url = mediaPlayableUrl(item, { allowS3: true })
  if (type === 'image' && url) return { kind: 'image', url }
  if (type === 'video') {
    const poster = mediaPosterUrl(item, { allowS3: true })
    if (poster) return { kind: 'image', url: poster }
    return { kind: 'video' }
  }
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

function collectPayloadDestinationUrls(ad) {
  const payload = ad?.source_payload || {}
  const collected = []

  for (const link of payload.links || []) {
    const url = firstRealDestinationUrl(link?.destination_url)
    if (!url) continue
    const role = link?.role ? String(link.role) : null
    collected.push({ url, payloadLabel: role })
  }

  const ctaUrl = firstRealDestinationUrl(payload.cta?.destination_url)
  if (ctaUrl) {
    collected.push({ url: ctaUrl, payloadLabel: 'cta' })
  }

  return collected
}

/**
 * All destination link_urls for an ad (per-card + top-level + source_payload), deduped by exact URL.
 * @returns {{ cardIndex: number|null, cardIndexes: number[], label: string|null, url: string, host: string, display: string }[]}
 */
export function getAdDestinationLinks(ad) {
  const content = ad?.content || {}
  const cards = Array.isArray(content.cards) ? content.cards : []
  const byUrl = new Map()

  const addUrl = (url, { cardIndex = null, payloadLabel = null } = {}) => {
    if (!url) return
    const existing = byUrl.get(url)
    if (existing) {
      if (cardIndex != null && !existing.cardIndexes.includes(cardIndex)) {
        existing.cardIndexes.push(cardIndex)
      }
      if (payloadLabel && !existing.payloadLabels.includes(payloadLabel)) {
        existing.payloadLabels.push(payloadLabel)
      }
      return
    }
    const { host, display } = parseDestinationUrl(url)
    byUrl.set(url, {
      url,
      host,
      display,
      cardIndexes: cardIndex != null ? [cardIndex] : [],
      payloadLabels: payloadLabel ? [payloadLabel] : [],
    })
  }

  cards.forEach((card, cardIndex) => {
    const url = firstRealDestinationUrl(card?.link_url)
    if (!url) return
    addUrl(url, { cardIndex })
  })

  const topUrl = firstRealDestinationUrl(content.link_url)
  if (topUrl) addUrl(topUrl)

  for (const { url, payloadLabel } of collectPayloadDestinationUrls(ad)) {
    if (!byUrl.has(url)) addUrl(url, { payloadLabel })
  }

  const multiCard = cards.length > 1
  return Array.from(byUrl.values()).map((entry) => {
    let label = null
    if (entry.cardIndexes.length > 1) {
      label = `Cards ${entry.cardIndexes.map((i) => i + 1).join(', ')}`
    } else if (entry.cardIndexes.length === 1 && multiCard) {
      label = `Card ${entry.cardIndexes[0] + 1}`
    } else if (entry.payloadLabels.length > 0 && entry.cardIndexes.length === 0) {
      label = entry.payloadLabels
        .map((role) => role.replace(/_/g, ' '))
        .join(', ')
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

/**
 * Feed engagement counts when stored on the ad or in source_payload.
 * @returns {{ likes: number, comments: number, shares: number, views: number } | null}
 */
export function getAdFeedEngagement(ad) {
  const eng = ad?.feed_engagement || ad?.source_payload?.feed_engagement
  if (!eng || typeof eng !== 'object') return null

  const likes = Number(eng.likes)
  const comments = Number(eng.comments)
  const shares = Number(eng.shares)
  const views = Number(eng.views)
  const hasAny = [likes, comments, shares, views].some(
    (value) => Number.isFinite(value) && value > 0,
  )
  if (!hasAny) return null

  return {
    likes: Number.isFinite(likes) ? likes : 0,
    comments: Number.isFinite(comments) ? comments : 0,
    shares: Number.isFinite(shares) ? shares : 0,
    views: Number.isFinite(views) ? views : 0,
  }
}

/** Share/submitted URL used at ingest when it differs from canonical original_url. */
export function getAdIngestionSourceUrl(ad) {
  const ingested = String(ad?.ingestion_source_url || ad?.ingestion?.source_url || '').trim()
  const original = String(ad?.original_url || '').trim()
  if (!ingested || ingested === original) return null
  return ingested
}

/** Labeled creative fields for the detail info panel. */
export function getAdCreativeFields(ad, card = null) {
  const content = ad?.content || {}
  const active = card || content.cards?.[0] || {}
  const payloadCta = ad?.source_payload?.cta || {}

  const title = firstRealText(active.title, content.title)
  const body = firstRealText(resolveBodyText(active.body), resolveBodyText(content.body))
  const caption = firstRealText(active.caption, content.caption)
  const linkDescription = firstRealText(active.link_description, content.link_description)
  const cta = firstRealText(active.cta_text, content.cta_text, payloadCta.title)
  const ctaType = firstRealText(active.cta_type, content.cta_type, payloadCta.link_style)
  const linkUrl = firstRealDestinationUrl(active.link_url, content.link_url, payloadCta.destination_url)
  const displayUrl = firstRealText(content.caption, active.caption, payloadCta.link_display)

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
