/** Max URLs accepted in a single paste lookup. */
export const TAKEDOWN_URL_LOOKUP_CAP = 100

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'igsh',
])

const URL_TOKEN_RE = /https?:\/\/[^\s,;|]+/gi
const LOOSE_URL_RE = /^(https?:\/\/|www\.|(instagram|facebook|fb|x|twitter|youtube|youtu|reddit)\.[a-z]{2,})/i

/**
 * Split raw paste into tokens (newlines, commas, semicolons, pipes, whitespace).
 */
export function tokenizeLookupInput(raw = '') {
  return String(raw)
    .split(/[\n\r,;|\t]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Detect whether the smart search box should run URL lookup.
 * True when ≥1 parseable http(s) URL, or ≥2 tokens that look like URLs.
 */
export function detectUrlLookupMode(raw = '') {
  const text = String(raw || '').trim()
  if (!text) return false

  const httpMatches = text.match(URL_TOKEN_RE)
  if (httpMatches && httpMatches.length >= 1) return true

  const tokens = tokenizeLookupInput(text)
  const urlish = tokens.filter((t) => LOOSE_URL_RE.test(t) || t.includes('://'))
  return urlish.length >= 2
}

/**
 * Extract URL strings from paste (http(s) preferred; also promote www./domain tokens).
 * Returns { urls, leftoverTokens, truncated }.
 */
export function extractUrlsFromInput(raw = '', cap = TAKEDOWN_URL_LOOKUP_CAP) {
  const text = String(raw || '')
  const found = []
  const seen = new Set()

  const push = (u) => {
    const trimmed = String(u || '').trim().replace(/[),.;]+$/g, '')
    if (!trimmed) return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    found.push(trimmed)
  }

  const httpMatches = text.match(URL_TOKEN_RE) || []
  httpMatches.forEach(push)

  const tokens = tokenizeLookupInput(text)
  const leftoverTokens = []
  for (const token of tokens) {
    if (URL_TOKEN_RE.test(token)) {
      URL_TOKEN_RE.lastIndex = 0
      continue
    }
    URL_TOKEN_RE.lastIndex = 0
    if (LOOSE_URL_RE.test(token)) {
      const withScheme = token.startsWith('http') ? token : `https://${token.replace(/^\/\//, '')}`
      push(withScheme)
    } else if (!httpMatches.some((m) => m.includes(token) || token.includes(m))) {
      leftoverTokens.push(token)
    }
  }

  const truncated = found.length > cap
  return {
    urls: found.slice(0, cap),
    leftoverTokens,
    truncated,
  }
}

/**
 * Normalize a URL for comparison: lowercase host, strip www, trailing slash, hash, trackers.
 */
export function normalizePostUrl(input) {
  if (!input || typeof input !== 'string') return ''
  let raw = input.trim()
  if (!raw) return ''

  if (!/^https?:\/\//i.test(raw) && LOOSE_URL_RE.test(raw)) {
    raw = `https://${raw.replace(/^\/\//, '')}`
  }

  try {
    const url = new URL(raw)
    let host = url.hostname.toLowerCase().replace(/^www\./, '')
    // Unify twitter → x
    if (host === 'twitter.com' || host === 'mobile.twitter.com') host = 'x.com'
    if (host === 'm.facebook.com' || host === 'web.facebook.com' || host === 'fb.com') host = 'facebook.com'
    if (host === 'm.youtube.com' || host === 'youtu.be') {
      /* keep for path handling */
    }

    const params = new URLSearchParams(url.search)
    for (const key of [...params.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) params.delete(key)
    }

    let pathname = url.pathname.replace(/\/+$/, '') || ''
    // Instagram: drop /reel vs keep code elsewhere
    const query = params.toString()
    const normalized = `${host}${pathname}${query ? `?${query}` : ''}`
    return normalized.toLowerCase()
  } catch {
    return raw
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '')
      .split('#')[0]
      .split('?')[0]
  }
}

/**
 * Extract platform short codes / status ids from a URL for secondary matching.
 */
export function extractPlatformIdsFromUrl(input) {
  const ids = new Set()
  if (!input || typeof input !== 'string') return []

  let raw = input.trim()
  if (!/^https?:\/\//i.test(raw) && LOOSE_URL_RE.test(raw)) {
    raw = `https://${raw.replace(/^\/\//, '')}`
  }

  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    const path = url.pathname

    // Instagram /p/CODE or /reel/CODE or /tv/CODE
    const ig = path.match(/\/(?:p|reel|tv|reels)\/([A-Za-z0-9_-]+)/i)
    if (ig?.[1]) ids.add(ig[1])

    // X / Twitter status
    const x = path.match(/\/status(?:es)?\/(\d+)/i)
    if (x?.[1]) ids.add(x[1])

    // Facebook story_fbid / fbid
    const fbid = url.searchParams.get('story_fbid') || url.searchParams.get('fbid')
    if (fbid) ids.add(fbid)

    // Facebook /posts/ID or /videos/ID
    const fbPost = path.match(/\/(?:posts|videos|permalink\.php)\/(\d+)/i)
    if (fbPost?.[1]) ids.add(fbPost[1])

    // YouTube
    if (host.includes('youtu')) {
      const v = url.searchParams.get('v')
      if (v) ids.add(v)
      const ytShort = path.match(/\/(?:shorts|embed|v)\/([A-Za-z0-9_-]+)/)
      if (ytShort?.[1]) ids.add(ytShort[1])
      if (host === 'youtu.be') {
        const code = path.replace(/^\//, '').split('/')[0]
        if (code) ids.add(code)
      }
    }

    // Reddit comment/post id
    const reddit = path.match(/\/comments\/([a-z0-9]+)/i)
    if (reddit?.[1]) ids.add(reddit[1])
  } catch {
    // ignore
  }

  return [...ids]
}

/**
 * Collect all URL-like fields from a post document.
 */
export function collectPostUrlCandidates(post) {
  const candidates = [
    post?.original_url,
    post?.url,
    post?.metadata?.url,
    post?.ingestion?.source_url,
    post?.original_link,
  ]
  return candidates.filter((u) => typeof u === 'string' && u.trim())
}

/**
 * Preferred display/source URL (GetPostLink preference).
 */
export function resolvePostSourceUrl(post) {
  return (
    post?.original_url ||
    post?.url ||
    post?.metadata?.url ||
    post?.ingestion?.source_url ||
    post?.original_link ||
    ''
  )
}
