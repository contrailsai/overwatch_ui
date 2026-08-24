const URL_IN_TEXT_REGEX = /(https?:\/\/[^\s,]+)/g

export function isValidHttpUrl(raw) {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (!trimmed) return false
  try {
    new URL(trimmed)
    return true
  } catch {
    return false
  }
}

/** Extract unique valid http(s) URLs from free text (bulk paste, CSV, etc.). */
export function parseUrlsFromText(text) {
  if (!text || typeof text !== 'string') return []
  const matches = text.match(URL_IN_TEXT_REGEX) || []
  const valid = matches.map((link) => link.trim()).filter(isValidHttpUrl)
  return [...new Set(valid)]
}

/**
 * Meta Ads ingest is Facebook-only in v1. Used to skip / warn on non-Facebook URLs
 * when the uploader has selected Ads rather than Posts.
 */
export function isMetaAdUrl(raw) {
  try {
    const u = new URL(typeof raw === 'string' ? raw.trim() : '')
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    return host === 'facebook.com' || host === 'fb.com' || host.endsWith('.facebook.com') || host.endsWith('.fb.com')
  } catch {
    return false
  }
}

/**
 * Partition an array of raw link strings into valid URLs and invalid entries.
 */
export function partitionUrls(rawLinks) {
  const validLinks = []
  const invalidLinks = []

  for (const raw of rawLinks ?? []) {
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    if (!trimmed) continue
    if (isValidHttpUrl(trimmed)) {
      validLinks.push(trimmed)
    } else {
      invalidLinks.push(trimmed)
    }
  }

  return {
    validLinks: [...new Set(validLinks)],
    invalidLinks,
  }
}
