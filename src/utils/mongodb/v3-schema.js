import { ObjectId } from 'mongodb'
import { RISK_THRESHOLDS } from '@/app/(dashboard)/cases/riskBuckets'
import { caseEventsCollection } from '@/utils/mongodb/collections'

export const ONLINE_VISIBILITY_VALUES = ['active', 'online', 'available']

/** Map v3 workflow.client_status values to legacy UI labels. */
const V3_TO_UI_CLIENT_STATUS = {
  open: 'To Be Reviewed',
  alerted: 'To Be Reviewed',
  no_action: 'No Action',
  pass: 'No Action',
  flag_for_takedown: 'Flag for Takedown',
  takedown: 'Takedown',
}

/** Map UI filter/write values to v3 workflow.client_status. */
const UI_TO_V3_CLIENT_STATUS = {
  'to be reviewed': 'open',
  'no action': 'no_action',
  pass: 'no_action',
  'flag for takedown': 'flag_for_takedown',
  takedown: 'takedown',
  takedowns: 'takedown',
}

export function isSchemaV3(doc) {
  return doc?.schema_version === 3
}

export function toIsoDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Convert MongoDB values to plain JSON-safe data for Client Components. */
export function serializeForClient(value) {
  if (value == null) return value
  if (value instanceof Date) return value.toISOString()
  if (value instanceof ObjectId || value?._bsontype === 'ObjectId') return value.toString()
  if (Array.isArray(value)) return value.map(serializeForClient)
  if (typeof value === 'object') {
    const out = {}
    for (const [key, val] of Object.entries(value)) {
      out[key] = serializeForClient(val)
    }
    return out
  }
  return value
}

export function mapV3ClientStatusToUi(status) {
  if (!status) return 'To Be Reviewed'
  const key = String(status).toLowerCase()
  return V3_TO_UI_CLIENT_STATUS[key] || status
}

/**
 * Cases-list client status: client decisions only.
 * "Takedown" means the client clicked Do Takedown (workflow.client_status === 'takedown').
 * Pipeline sub-states (initiated, under_review, failed, successful, etc.) are not shown here.
 */
export function resolveClientStatusForUi(post) {
  const clientStatusRaw = post?.workflow?.client_status ?? post?.client_status
  return mapV3ClientStatusToUi(clientStatusRaw)
}

export function mapUiClientStatusToV3(status) {
  if (!status) return 'open'
  const key = String(status).toLowerCase()
  return UI_TO_V3_CLIENT_STATUS[key] || String(status).toLowerCase().replace(/\s+/g, '_')
}

export function getPostCaption(post) {
  if (post?.content?.caption != null) return String(post.content.caption)
  if (post?.post_content?.caption != null) return String(post.post_content.caption)
  if (post?.caption != null) return String(post.caption)
  if (typeof post?.content === 'string') return post.content
  return ''
}

export function getPostMedia(post) {
  if (Array.isArray(post?.content?.media) && post.content.media.length > 0) {
    return post.content.media
  }
  if (Array.isArray(post?.post_content?.media_urls) && post.post_content.media_urls.length > 0) {
    return post.post_content.media_urls
  }
  if (post?.s3_url) {
    return [{ s3_url: post.s3_url, original_url: null, thumbnail_url: null }]
  }
  return []
}

export function getFirstMediaS3Url(post) {
  const media = getPostMedia(post)
  if (!media.length) return null
  const first = media[0]
  return first?.s3_url || first?.thumbnail_url || first?.thumbnail_s3_url || null
}

export function getAuthorSnapshot(post) {
  if (post?.author_snapshot) {
    return {
      username: post.author_snapshot.username || 'Unknown',
      display_name: post.author_snapshot.display_name || post.author_snapshot.username || '',
      profile_url: post.author_snapshot.profile_url || '',
      is_verified: post.author_snapshot.is_verified || false,
    }
  }
  return {
    username: post?.profile?.username || post?.user?.username || post?.author?.username || 'Unknown',
    display_name: post?.profile?.display_name || post?.user?.full_name || post?.author?.name || '',
    profile_url: post?.profile?.profile_url || post?.profile?.profile_pic_url || post?.author?.url || '',
    is_verified: post?.profile?.is_verified || post?.user?.is_verified || post?.author?.verified || false,
  }
}

function toEngagementCount(value, fallback = 0) {
  if (value == null || value === '') return fallback
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Resolve raw engagement counts across v3 + legacy shapes.
 * Preference (future-canonical first):
 *   content.engagement → list.engagement (object) → top-level engagement →
 *   flat list.* counts → stats.*
 * Score stays on list.engagement_score.
 */
export function getPostEngagementMetrics(post) {
  const contentEng =
    post?.content?.engagement && typeof post.content.engagement === 'object'
      ? post.content.engagement
      : null
  const listEng =
    post?.list?.engagement && typeof post.list.engagement === 'object'
      ? post.list.engagement
      : null
  const legacyEng =
    post?.engagement && typeof post.engagement === 'object' ? post.engagement : null
  const stats = post?.stats && typeof post.stats === 'object' ? post.stats : null
  const list = post?.list && typeof post.list === 'object' ? post.list : null

  const fromNested = (...keys) => {
    for (const source of [contentEng, listEng, legacyEng]) {
      if (!source) continue
      for (const key of keys) {
        if (source[key] != null && source[key] !== '') return source[key]
      }
    }
    return undefined
  }

  return {
    likes: toEngagementCount(
      fromNested('likes', 'like_count') ?? list?.likes ?? stats?.like_count ?? stats?.likes
    ),
    comments: toEngagementCount(
      fromNested('comments', 'comment_count') ??
        list?.comments ??
        stats?.comment_count ??
        stats?.comments ??
        stats?.replies
    ),
    shares: toEngagementCount(
      fromNested('shares', 'share_count') ?? list?.shares ?? stats?.share_count ?? stats?.shares
    ),
    views: toEngagementCount(
      fromNested('views', 'view_count') ?? list?.views ?? stats?.view_count ?? stats?.views
    ),
    retweets: toEngagementCount(
      fromNested('retweets', 'retweet_count') ?? list?.retweets ?? stats?.retweet_count ?? stats?.retweets
    ),
    quotes: toEngagementCount(
      fromNested('quotes', 'quote_count') ?? list?.quotes ?? stats?.quote_count ?? stats?.quotes
    ),
    replies: toEngagementCount(
      fromNested('replies', 'reply_count') ?? list?.replies ?? stats?.reply_count ?? stats?.replies
    ),
    bookmarks: toEngagementCount(
      fromNested('bookmarks', 'bookmark_count') ?? list?.bookmarks ?? stats?.bookmark_count ?? stats?.bookmarks
    ),
    engagement_score:
      list?.engagement_score ?? fromNested('engagement_score') ?? stats?.engagement_score ?? null,
  }
}

/** UI `stats` shape used by cases / review-cases detail panels. */
export function buildPostStatsForUi(post) {
  const metrics = getPostEngagementMetrics(post)
  return {
    like_count: metrics.likes,
    comment_count: metrics.comments,
    share_count: metrics.shares,
    view_count: metrics.views,
    retweet_count: metrics.retweets,
    quote_count: metrics.quotes,
    reply_count: metrics.replies,
    engagement_score: metrics.engagement_score,
  }
}

export function buildTakedownInfoForUi(post) {
  const takedown = post?.takedown || {}
  const workflowStatus = post?.workflow?.takedown_status || takedown.status
  const legacy = post?.takedown_info || {}

  return {
    ...legacy,
    status: workflowStatus || legacy.status || 'none',
    takedown_status: workflowStatus || legacy.takedown_status || 'None',
    takedown_start_date: toIsoDate(takedown.initiated_at) || legacy.takedown_start_date || null,
    takedown_end_date: toIsoDate(takedown.completed_at) || legacy.takedown_end_date || null,
    in_takedown_process: ['initiated', 'under_review', 'pending'].includes(String(workflowStatus || '').toLowerCase()),
    events: legacy.events || [],
  }
}

export function mapCaseEventsToUpdateHistory(events = []) {
  return events.map((event) => ({
    updated_at: toIsoDate(event.occurred_at),
    updated_by: event.actor || event.payload?.updated_by || null,
    changes_summary: event.summary || event.event_type || '',
    event_type: event.event_type,
    payload: serializeForClient(event.payload) ?? null,
  }))
}

export async function fetchPostCaseEvents(db, postId) {
  const events = await caseEventsCollection(db)
    .find({
      entity_type: 'post',
      entity_id: new ObjectId(postId),
    })
    .sort({ occurred_at: -1 })
    .toArray()
  return mapCaseEventsToUpdateHistory(events)
}

export async function insertCaseEvent(db, {
  entityType,
  entityId,
  eventType,
  actor = null,
  summary,
  payload = {},
  source = 'client',
}) {
  return caseEventsCollection(db).insertOne({
    entity_type: entityType,
    entity_id: new ObjectId(entityId),
    event_type: eventType,
    actor,
    summary,
    payload,
    occurred_at: new Date(),
    source,
  })
}

/** Posts eligible for the reviewed cases list. */
export const REVIEWED_CASES_FILTER = {
  'workflow.review_status': 'reviewed',
  'list.review_threat_score': { $exists: true, $ne: null },
}

export function withReviewedCasesFilter(query = {}) {
  return {
    ...query,
    $and: [
      ...(query.$and || []),
      { $or: [{ 'workflow.review_status': 'reviewed' }, { 'list.review_threat_score': { $exists: true, $ne: null } }] },
    ],
  }
}

export function buildEffectiveThreatScoreRange(riskPriority) {
  if (!riskPriority || riskPriority === 'all') return null
  if (riskPriority === 'high') return { $gt: RISK_THRESHOLDS.HIGH }
  if (riskPriority === 'medium') return { $gt: RISK_THRESHOLDS.MEDIUM, $lte: RISK_THRESHOLDS.HIGH }
  if (riskPriority === 'low') return { $gt: RISK_THRESHOLDS.LOW, $lte: RISK_THRESHOLDS.MEDIUM }
  if (riskPriority === 'safe') return { $lte: RISK_THRESHOLDS.LOW }
  return null
}

export function buildNormalizedPostForUi(post, { updateHistory = [], signedImageUrl = null } = {}) {
  const author = getAuthorSnapshot(post)
  const visibility = post?.workflow?.visibility_status ?? post?.visibility_status ?? 'active'

  return {
    _id: post._id.toString(),
    created_at: toIsoDate(post?.system?.created_at ?? post?.metadata?.created_at),
    sourcing_date: toIsoDate(post?.list?.sourced_at ?? post?.metadata?.sourcing_date ?? post?.ingestion?.ingested_at),
    posted_date: toIsoDate(post?.list?.posted_at ?? post?.engagement?.posted_at ?? post?.metadata?.posted_date),
    taken_at: post?.post_content?.taken_at || post?.taken_at || null,
    updated_at: toIsoDate(post?.system?.updated_at ?? post?.metadata?.updated_at),
    reviewed_at: toIsoDate(post?.list?.reviewed_at ?? post?.review_details?.reviewed_at),
    update_history: updateHistory,
    platform: post?.platform ? String(post.platform).toLowerCase() : 'instagram',
    processed: Boolean(post?.workflow?.alerted_at ?? post?.processed),
    client_status: resolveClientStatusForUi(post),
    caption: getPostCaption(post),
    signedImageUrl,
    original_url: post?.original_url || null,
    post_id: post?.platform_post_id || post?.post_id || post?.code || post._id.toString(),
    visibility_status: visibility,
    user: {
      username: author.username,
      full_name: author.display_name,
      profile_pic_url: author.profile_url,
      is_verified: author.is_verified,
    },
    assigned_to: post?.assigned_to || null,
    content_reviewed_by: post?.content_reviewed_by || null,
    score: post?.list?.effective_threat_score ?? post?.review_details?.threat_score ?? post?.score ?? null,
    review_details: serializeForClient(post?.review_details) ?? null,
    takedown_info: buildTakedownInfoForUi(post),
    analysis_results: serializeForClient(post?.analysis_results) ?? null,
    client_notes: serializeForClient(post?.client_notes) ?? [],
    stats: buildPostStatsForUi(post),
    cluster_id: post?.list?.cluster_id
      ? post.list.cluster_id.toString()
      : post?.cluster_id
        ? post.cluster_id.toString()
        : null,
    profile_id: post?.profile_id ? post.profile_id.toString() : null,
    workflow: serializeForClient(post?.workflow) ?? null,
    list: serializeForClient(post?.list) ?? null,
  }
}

function buildProfileMetadataForUi(profile, signedProfilePic = null) {
  const enrichment = profile?.enrichment || {}
  const legacyMetadata = profile?.metadata || {}

  return {
    display_name: profile?.display_name || legacyMetadata.display_name,
    username: profile?.username || legacyMetadata.username,
    profile_url: profile?.profile_url || legacyMetadata.profile_url,
    follower_count: profile?.list?.follower_count ?? legacyMetadata.follower_count ?? null,
    location: profile?.list?.location ?? legacyMetadata.location ?? null,
    s3_url: enrichment.profile_pic_s3 || legacyMetadata.s3_url || null,
    // Prefer signed S3; fall back to platform CDN / legacy URL when no S3 object exists
    profile_pic:
      signedProfilePic ||
      enrichment.profile_pic ||
      legacyMetadata.profile_pic ||
      null,
    biography: enrichment.biography ?? legacyMetadata.biography ?? null,
    following_count: enrichment.following_count ?? legacyMetadata.following_count ?? null,
    media_count: enrichment.media_count ?? legacyMetadata.media_count ?? profile?.list?.post_count ?? null,
    account_creation_date: toIsoDate(enrichment.account_created_at ?? legacyMetadata.account_creation_date),
    is_business: enrichment.is_business ?? legacyMetadata.is_business ?? null,
    category: enrichment.category ?? legacyMetadata.category ?? null,
    full_name: profile?.display_name ?? legacyMetadata.full_name ?? null,
  }
}

export function buildNormalizedProfileForUi(profile, { signedProfilePic = null, postIds = [] } = {}) {
  const profileRisk = profile?.list?.risk_rank ?? profile?.list?.risk ?? profile?.review_details?.risk ?? null

  return {
    _id: profile._id.toString(),
    display_name: profile?.display_name || profile?.metadata?.display_name || profile?.username || 'Unknown',
    username: profile?.username || profile?.metadata?.username || null,
    platform: profile?.platform || 'unknown',
    is_verified: profile?.is_verified ?? profile?.metadata?.is_verified ?? false,
    posts: postIds,
    profile_url: profile?.profile_url || profile?.metadata?.profile_url || null,
    review_details: serializeForClient({
      ...(profile?.review_details || {}),
      risk: profileRisk,
    }),
    client_status: resolveClientStatusForUi(profile),
    client_notes: serializeForClient(profile?.client_notes) ?? [],
    last_relevant_publish_date: toIsoDate(profile?.list?.last_active_at ?? profile?.last_relevant_publish_date),
    cases_count: profile?.list?.post_count ?? postIds.length,
    list: serializeForClient(profile?.list) ?? null,
    workflow: serializeForClient(profile?.workflow) ?? null,
    enrichment: serializeForClient(profile?.enrichment) ?? null,
    metadata: serializeForClient(buildProfileMetadataForUi(profile, signedProfilePic)),
  }
}
