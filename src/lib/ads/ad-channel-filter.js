import { AD_CHANNEL } from '@/lib/ads/ad-display'

const CLIENT_INGESTION_TYPES = [
  'facebook_share_post',
  'client_request',
  'client_requested_link',
]

const CANONICAL_CHANNELS = [
  AD_CHANNEL.INGESTION,
  AD_CHANNEL.LIBRARY,
  AD_CHANNEL.FEED,
  'ads_library',
]

const LIBRARY_URL_REGEX = /\/ads\/library/i

const NO_CANONICAL_CHANNEL = {
  $or: [
    { channel: { $exists: false } },
    { channel: null },
    { channel: { $nin: CANONICAL_CHANNELS } },
  ],
}

const INGESTION_SIGNALS = {
  $or: [
    { submitted_url: { $exists: true, $ne: null, $ne: '' } },
    { 'ingestion.type': { $in: CLIENT_INGESTION_TYPES } },
  ],
}

const LIBRARY_URL = {
  $or: [
    { original_url: { $regex: LIBRARY_URL_REGEX } },
    { original_link: { $regex: LIBRARY_URL_REGEX } },
    { 'ingestion.source_url': { $regex: LIBRARY_URL_REGEX } },
  ],
}

const INGESTION_MATCH = {
  $or: [
    { channel: AD_CHANNEL.INGESTION },
    { $and: [NO_CANONICAL_CHANNEL, INGESTION_SIGNALS] },
  ],
}

const LIBRARY_MATCH = {
  $or: [
    { channel: { $in: [AD_CHANNEL.LIBRARY, 'ads_library'] } },
    { $and: [NO_CANONICAL_CHANNEL, { $nor: [INGESTION_SIGNALS] }, LIBRARY_URL] },
  ],
}

const FEED_MATCH = {
  $or: [
    { channel: AD_CHANNEL.FEED },
    { $and: [NO_CANONICAL_CHANNEL, { $nor: [INGESTION_SIGNALS] }, { $nor: [LIBRARY_URL] }] },
  ],
}

/**
 * MongoDB $match fragment for ad channel filter.
 * Mirrors getAdChannel() priority in ad-display.js.
 */
export function buildAdChannelMatchCondition(channel) {
  const key = String(channel || '').toLowerCase()
  if (!key || key === 'all') return null

  if (key === AD_CHANNEL.INGESTION) return INGESTION_MATCH
  if (key === AD_CHANNEL.LIBRARY) return LIBRARY_MATCH
  if (key === AD_CHANNEL.FEED) return FEED_MATCH

  return null
}
