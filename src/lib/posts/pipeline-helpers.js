/**
 * Shared MongoDB pipeline helpers for Posts/cases queries.
 * Plain module (no 'use server') — safe to import from server actions without
 * registering each helper as a Next.js Server Action endpoint.
 */

import { getSignedImageUrl } from '@/utils/aws/s3'
import { withReviewedThreatScoreFilter } from '@/lib/posts/reviewed-post-filter'
import {
  UNIQUE_CLUSTER_LIST_SORT,
  UNIQUE_CLUSTER_EARLY_SORT,
} from '@/app/(dashboard)/cases/riskBuckets'

export const ONLINE_VISIBILITY_VALUES = ['active', 'online', 'available']

export const CASES_ALERT_HOUR_TIMEZONE = 'Asia/Kolkata'

export const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export async function normalizeS3Post(post) {
  let s3UrlToSign = null
  if (post.post_content?.media_urls && post.post_content.media_urls.length > 0) {
    const firstMedia = post.post_content.media_urls[0]
    s3UrlToSign = firstMedia.s3_url
  } else if (post.s3_url) {
    s3UrlToSign = post.s3_url
  }

  const signedUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null

  return {
    _id: post._id.toString(),
    created_at: post.metadata?.created_at ? new Date(post.metadata.created_at).toISOString() : null,
    sourcing_date: post.metadata?.sourcing_date ? new Date(post.metadata.sourcing_date).toISOString() : null,
    posted_date: post.engagement?.posted_at
      ? new Date(post.engagement.posted_at).toISOString()
      : post.metadata?.posted_date
        ? new Date(post.metadata.posted_date).toISOString()
        : null,
    taken_at: post.post_content?.taken_at || post.taken_at || null,
    updated_at: post.metadata?.updated_at ? new Date(post.metadata.updated_at).toISOString() : null,
    reviewed_at: post.review_details?.reviewed_at
      ? new Date(post.review_details.reviewed_at).toISOString()
      : null,
    update_history: post.metadata?.update_history
      ? post.metadata.update_history.map((update) => ({
          ...update,
          updated_at: update.updated_at ? new Date(update.updated_at).toISOString() : null,
        }))
      : [],
    platform: post.platform ? post.platform.toLowerCase() : 'instagram',
    processed: post.processed || false,
    client_status: post.client_status || 'To Be Reviewed',
    caption: post.post_content?.caption || post.caption || '',
    signedImageUrl: signedUrl,
    original_url: post.original_url,
    post_id: post.post_id || post.code,
    visibility_status: post.visibility_status || 'active',
    user: {
      username: post.profile?.username || post.user?.username || 'Unknown',
      full_name: post.profile?.display_name || '',
      profile_pic_url: post.profile?.profile_pic_url || post.profile?.profile_url || '',
      is_verified: post.profile?.is_verified || false,
    },
    assigned_to: post?.assigned_to || null,
    content_reviewed_by: post?.content_reviewed_by || null,
    score: post.score || null,
    review_details: post.review_details || null,
    takedown_info: post.takedown_info || null,
    analysis_results: post.analysis_results || null,
    client_notes: post.client_notes || [],
    stats: {
      like_count: post.engagement?.likes || 0,
      comment_count: post.engagement?.comments || 0,
      share_count: post.engagement?.shares || 0,
      view_count: post.engagement?.views || 0,
    },
    cluster_id: post.cluster_id ? post.cluster_id.toString() : null,
  }
}

export function buildUniqueClustersStage(filters, { clusterSort = 'list' } = {}) {
  const clusterRankSort = clusterSort === 'early' ? UNIQUE_CLUSTER_EARLY_SORT : UNIQUE_CLUSTER_LIST_SORT
  if (filters.unique_clusters === 'true' || filters.unique_clusters === true) {
    const useStrictUniqueClustering = process.env.USE_STRICT_UNIQUE_CLUSTERING === 'true'
    if (!useStrictUniqueClustering) {
      return [
        {
          $addFields: {
            _unique_group_key: {
              $ifNull: [{ $toString: '$cluster_id' }, { $toString: '$_id' }],
            },
          },
        },
        {
          $sort: {
            _unique_group_key: 1,
            ...clusterRankSort,
          },
        },
        {
          $group: {
            _id: '$_unique_group_key',
            doc: { $first: '$$ROOT' },
          },
        },
        { $replaceRoot: { newRoot: '$doc' } },
        {
          $project: {
            _unique_group_key: 0,
          },
        },
      ]
    }

    return [
      {
        $addFields: {
          _cluster_id_str: {
            $cond: [
              { $ifNull: ['$cluster_id', false] },
              { $toString: '$cluster_id' },
              null,
            ],
          },
          _doc_id_str: { $toString: '$_id' },
        },
      },
      {
        $lookup: {
          from: 'unique_clusters',
          let: { clusterIdObj: '$cluster_id', clusterIdStr: '$_cluster_id_str' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$_id', '$$clusterIdObj'] },
                    { $eq: [{ $toString: '$_id' }, '$$clusterIdStr'] },
                  ],
                },
              },
            },
          ],
          as: 'cluster_info',
        },
      },
      {
        $unwind: {
          path: '$cluster_info',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          _representative_post_id_str: {
            $cond: [
              { $ifNull: ['$cluster_info.representative_post_id', false] },
              { $toString: '$cluster_info.representative_post_id' },
              null,
            ],
          },
          _member_ids_str: {
            $map: {
              input: { $ifNull: ['$cluster_info.member_ids', []] },
              as: 'memberId',
              in: { $toString: '$$memberId' },
            },
          },
        },
      },
      {
        $addFields: {
          _is_representative: { $eq: ['$_doc_id_str', '$_representative_post_id_str'] },
          _is_member: { $in: ['$_doc_id_str', '$_member_ids_str'] },
          _has_cluster_info: { $ne: ['$cluster_info', null] },
          _unique_group_key: {
            $ifNull: [{ $toString: '$cluster_info._id' }, '$_doc_id_str'],
          },
        },
      },
      {
        $match: {
          $expr: {
            $or: [
              { $not: ['$_has_cluster_info'] },
              '$_is_representative',
              '$_is_member',
            ],
          },
        },
      },
      {
        $sort: {
          _unique_group_key: 1,
          _is_representative: -1,
          ...clusterRankSort,
        },
      },
      {
        $group: {
          _id: '$_unique_group_key',
          doc: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$doc' } },
      {
        $project: {
          _cluster_id_str: 0,
          _doc_id_str: 0,
          _representative_post_id_str: 0,
          _member_ids_str: 0,
          _is_representative: 0,
          _is_member: 0,
          _has_cluster_info: 0,
          _unique_group_key: 0,
          cluster_info: 0,
        },
      },
    ]
  }
  return []
}

export function buildCasesMatchQuery(filters = {}) {
  const query = withReviewedThreatScoreFilter({})
  const andConditions = []

  if (filters.platform && filters.platform !== 'all') {
    const escapedPlatform = escapeRegex(filters.platform)
    query.platform = { $regex: new RegExp(`^${escapedPlatform}$`, 'i') }
  }

  if (filters.visibility_status && filters.visibility_status !== 'all') {
    const visibilityLower = String(filters.visibility_status).toLowerCase()
    if (visibilityLower === 'down') {
      query.visibility_status = 'down'
    } else if (visibilityLower === 'active' || visibilityLower === 'online' || visibilityLower === 'available') {
      andConditions.push({
        $or: [
          { visibility_status: { $in: ONLINE_VISIBILITY_VALUES } },
          { visibility_status: { $exists: false } },
          { visibility_status: null },
        ],
      })
    }
  }

  if (filters.client_status && filters.client_status !== 'all') {
    const statusLower = filters.client_status.toLowerCase()
    const escapedStatus = escapeRegex(filters.client_status)
    if (statusLower === 'to be reviewed') {
      andConditions.push({
        $or: [
          { client_status: { $exists: false } },
          { client_status: null },
          { client_status: { $regex: new RegExp('^to be reviewed$', 'i') } },
        ],
      })
    } else if (statusLower === 'takedown' || statusLower === 'takedowns') {
      query.client_status = { $regex: new RegExp('^takedowns?$', 'i') }
    } else {
      query.client_status = { $regex: new RegExp(`^${escapedStatus}$`, 'i') }
    }
  }

  if (filters.risk_priority && filters.risk_priority !== 'all') {
    if (filters.risk_priority === 'high') {
      query['review_details.threat_score'] = { $exists: true, $gt: 95 }
    } else if (filters.risk_priority === 'medium') {
      query['review_details.threat_score'] = { $exists: true, $gt: 75, $lte: 95 }
    } else if (filters.risk_priority === 'low') {
      query['review_details.threat_score'] = { $exists: true, $gt: 40, $lte: 75 }
    } else if (filters.risk_priority === 'safe') {
      query['review_details.threat_score'] = { $exists: true, $lte: 40 }
    }
  }

  if (filters.violations && filters.violations !== 'all') {
    const violationsArray = filters.violations.split(',')
    if (violationsArray.length > 0) {
      const normalViolations = violationsArray.filter((v) => v !== 'aigc')
      const hasAigc = violationsArray.includes('aigc')
      const violationConditions = []
      if (normalViolations.length > 0) {
        violationConditions.push({ 'review_details.threat_types': { $in: normalViolations } })
        const flagConditions = normalViolations.map((v) => ({ [`review_details.flags.${v}`]: true }))
        violationConditions.push(...flagConditions)
      }
      if (hasAigc) {
        violationConditions.push({ 'review_details.is_aigc': true })
      }
      if (violationConditions.length > 0) {
        andConditions.push({ $or: violationConditions })
      }
    }
  }

  if (andConditions.length > 0) {
    query.$and = andConditions
  }

  return query
}

export function buildCasesDateAddFieldsStage() {
  return {
    sort_original_date: {
      $toDate: {
        $ifNull: ['$engagement.posted_at', '$metadata.posted_date'],
      },
    },
    sort_processed_after: {
      $toDate: {
        $ifNull: ['$review_details.reviewed_at', '$metadata.updated_at'],
      },
    },
    sort_processed_after_hour: {
      $cond: [
        { $ne: [{ $ifNull: ['$review_details.reviewed_at', '$metadata.updated_at'] }, null] },
        {
          $dateTrunc: {
            date: {
              $toDate: {
                $ifNull: ['$review_details.reviewed_at', '$metadata.updated_at'],
              },
            },
            unit: 'hour',
            timezone: CASES_ALERT_HOUR_TIMEZONE,
          },
        },
        null,
      ],
    },
  }
}

export function buildCasesDateFilterStage(filters = {}) {
  const dateFilterStage = {}

  if (filters.original_date_from || filters.original_date_to) {
    dateFilterStage.sort_original_date = {}
    if (filters.original_date_from) {
      dateFilterStage.sort_original_date.$gte = new Date(filters.original_date_from)
    }
    if (filters.original_date_to) {
      dateFilterStage.sort_original_date.$lte = new Date(filters.original_date_to)
    }
  }

  if (filters.processed_from || filters.processed_to) {
    dateFilterStage.sort_processed_after = {}
    if (filters.processed_from) {
      dateFilterStage.sort_processed_after.$gte = new Date(filters.processed_from)
    }
    if (filters.processed_to) {
      dateFilterStage.sort_processed_after.$lte = new Date(filters.processed_to)
    }
  }

  return dateFilterStage
}
