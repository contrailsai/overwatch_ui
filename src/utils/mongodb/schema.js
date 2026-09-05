/**
 * MongoDB Schema Helper Functions
 *
 * Primary helpers for schema v3 with legacy fallbacks for older documents.
 */

import {
  buildNormalizedPostForUi,
  buildTakedownInfoForUi,
  getAuthorSnapshot,
  getFirstMediaS3Url,
  getPostCaption,
  getPostEngagementMetrics,
  getPostMedia,
  isSchemaV3,
  mapV3ClientStatusToUi,
  toIsoDate,
} from '@/utils/mongodb/v3-schema'

export function isNewSchema(post) {
  return isSchemaV3(post) || post.metadata?.schema_version === 1
}

export function getCaption(post) {
  return getPostCaption(post)
}

export function getUsername(post) {
  return getAuthorSnapshot(post).username
}

export function getDisplayName(post) {
  return getAuthorSnapshot(post).display_name
}

export function getProfileUrl(post) {
  return getAuthorSnapshot(post).profile_url
}

export function isVerified(post) {
  return getAuthorSnapshot(post).is_verified
}

export function getMediaUrls(post) {
  return getPostMedia(post)
}

export function getFirstMediaUrl(post) {
  return getFirstMediaS3Url(post)
}

export function getLikes(post) {
  return getPostEngagementMetrics(post).likes
}

export function getComments(post) {
  return getPostEngagementMetrics(post).comments
}

export function getShares(post) {
  return getPostEngagementMetrics(post).shares
}

export function getRetweets(post) {
  return getPostEngagementMetrics(post).retweets
}

export function getQuotes(post) {
  return getPostEngagementMetrics(post).quotes
}

export function getViews(post) {
  return getPostEngagementMetrics(post).views
}

export function getPostedAt(post) {
  const raw = post.list?.posted_at ?? post.engagement?.posted_at ?? post.taken_at ?? post.timestamp
  if (!raw) return null
  if (typeof raw === 'number') return new Date(raw < 1e12 ? raw * 1000 : raw)
  return new Date(raw)
}

export function getPostedTimestamp(post) {
  const date = getPostedAt(post)
  return date ? Math.floor(date.getTime() / 1000) : null
}

export function getPlatform(post) {
  return post.platform || 'instagram'
}

export function getPostId(post) {
  return post.platform_post_id || post.post_id || post.code || post.id || post._id?.toString()
}

export function getOriginalUrl(post) {
  return post.original_url || null
}

export function isReviewed(post) {
  return post.workflow?.review_status === 'reviewed'
    || (post.review_details !== null && post.review_details !== undefined && post.review_details.threat_score != null)
}

export function getReviewDetails(post) {
  return post.review_details || null
}

export function getTakedownInfo(post) {
  return buildTakedownInfoForUi(post)
}

export function normalizePostForDisplay(post) {
  return buildNormalizedPostForUi(post)
}

export { toIsoDate, mapV3ClientStatusToUi }
