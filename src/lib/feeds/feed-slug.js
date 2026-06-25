/** URL-safe slug from a feed title. */
export function slugifyTitle(title = '') {
  return (
    title
      .toLowerCase()
      .trim()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'feed'
  )
}

/** Public feed URL segment: `{title-slug}-{last 8 chars of _id}`. */
export function buildFeedSlug(feed) {
  const id = typeof feed._id === 'string' ? feed._id : feed._id?.toString?.()
  const slug = slugifyTitle(feed?.title || 'feed')
  const suffix = id ? id.slice(-8).toLowerCase() : ''
  return suffix ? `${slug}-${suffix}` : slug
}

export function feedDetailPath(feed) {
  return `/feeds/${buildFeedSlug(feed)}`
}

/**
 * Parse a route param into either a full ObjectId or a short suffix.
 * Accepts legacy raw 24-char hex ids and slugged URLs.
 */
export function parseFeedSlugParam(slugParam) {
  if (!slugParam || typeof slugParam !== 'string') {
    return { fullId: null, suffix: null }
  }

  if (/^[a-f0-9]{24}$/i.test(slugParam)) {
    return { fullId: slugParam.toLowerCase(), suffix: null }
  }

  const match = slugParam.match(/-([a-f0-9]{6,24})$/i)
  if (!match) {
    return { fullId: null, suffix: null }
  }

  const token = match[1].toLowerCase()
  if (token.length === 24) {
    return { fullId: token, suffix: null }
  }

  return { fullId: null, suffix: token }
}
