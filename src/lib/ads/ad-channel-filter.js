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

/**
 * Aggregation expression: lower rank = higher list priority.
 * ingestion (0) > feed (1) > library (2). Mirrors getAdChannel().
 */
export function buildAdChannelRankExpression() {
  const channelLower = { $toLower: { $ifNull: ['$channel', ''] } }
  const submittedUrl = { $ifNull: ['$submitted_url', ''] }
  const ingestionType = { $ifNull: ['$ingestion.type', ''] }
  const sourceUrl = {
    $ifNull: [
      '$original_url',
      { $ifNull: ['$original_link', { $ifNull: ['$ingestion.source_url', ''] }] },
    ],
  }

  const isClientIngested = {
    $or: [
      { $gt: [{ $strLenCP: submittedUrl }, 0] },
      { $in: [ingestionType, CLIENT_INGESTION_TYPES] },
    ],
  }

  const isLibraryUrl = {
    $regexMatch: {
      input: { $ifNull: [sourceUrl, ''] },
      regex: LIBRARY_URL_REGEX,
    },
  }

  return {
    $switch: {
      branches: [
        { case: { $eq: [channelLower, AD_CHANNEL.INGESTION] }, then: 0 },
        { case: { $in: [channelLower, [AD_CHANNEL.LIBRARY, 'ads_library']] }, then: 2 },
        { case: { $eq: [channelLower, AD_CHANNEL.FEED] }, then: 1 },
        { case: isClientIngested, then: 0 },
        { case: isLibraryUrl, then: 2 },
      ],
      default: 1,
    },
  }
}
