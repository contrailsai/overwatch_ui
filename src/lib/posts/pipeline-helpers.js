/**
 * Shared MongoDB pipeline helpers for Posts/cases queries (schema v3).
 */

import { getSignedImageUrl } from '@/utils/aws/s3'
import {
  ONLINE_VISIBILITY_VALUES,
  buildEffectiveThreatScoreRange,
  buildNormalizedPostForUi,
  fetchPostCaseEvents,
  getFirstMediaS3Url,
  mapUiClientStatusToV3,
  mapV3ClientStatusToUi,
} from '@/utils/mongodb/v3-schema'
import { withReviewedThreatScoreFilter } from '@/lib/posts/reviewed-post-filter'
import {
  UNIQUE_CLUSTER_LIST_SORT,
  UNIQUE_CLUSTER_EARLY_SORT,
  buildCasesListSortPipeline as buildListSortFromRiskBuckets,
  buildCasesReportSortPipeline as buildReportSortFromRiskBuckets,
} from '@/app/(dashboard)/cases/riskBuckets'

export { ONLINE_VISIBILITY_VALUES }

export const CASES_ALERT_HOUR_TIMEZONE = 'Asia/Kolkata'

export const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export async function normalizeS3Post(post, db = null) {
  const s3UrlToSign = getFirstMediaS3Url(post)
  const signedUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null
  let updateHistory = []

  if (db && post?._id) {
    try {
      updateHistory = await fetchPostCaseEvents(db, post._id.toString())
    } catch {
      updateHistory = []
    }
  } else if (post?.metadata?.update_history) {
    updateHistory = post.metadata.update_history.map((update) => ({
      ...update,
      updated_at: update.updated_at ? new Date(update.updated_at).toISOString() : null,
    }))
  }

  return buildNormalizedPostForUi(post, { updateHistory, signedImageUrl: signedUrl })
}

export function buildUniqueClustersStage(filters, { clusterSort = 'list' } = {}) {
  const clusterRankSort = clusterSort === 'early' ? UNIQUE_CLUSTER_EARLY_SORT : UNIQUE_CLUSTER_LIST_SORT

  if (filters.unique_clusters !== 'true' && filters.unique_clusters !== true) {
    return []
  }

  const useStrictUniqueClustering = process.env.USE_STRICT_UNIQUE_CLUSTERING === 'true'
  if (!useStrictUniqueClustering) {
    return [
      {
        $addFields: {
          _unique_group_key: {
            $ifNull: [{ $toString: '$list.cluster_id' }, { $toString: '$_id' }],
          },
        },
      },
      { $sort: { _unique_group_key: 1, ...clusterRankSort } },
      { $group: { _id: '$_unique_group_key', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $project: { _unique_group_key: 0 } },
    ]
  }

  return [
    {
      $match: {
        $or: [
          { 'list.is_cluster_representative': true },
          { 'list.cluster_id': { $exists: false } },
          { 'list.cluster_id': null },
        ],
      },
    },
    {
      $addFields: {
        _unique_group_key: {
          $ifNull: [{ $toString: '$list.cluster_id' }, { $toString: '$_id' }],
        },
      },
    },
    { $sort: { _unique_group_key: 1, ...clusterRankSort } },
    { $group: { _id: '$_unique_group_key', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
    { $project: { _unique_group_key: 0 } },
  ]
}

export function buildCasesMatchQuery(filters = {}) {
  const query = withReviewedThreatScoreFilter({})
  const andConditions = [
    { _is_embedding_stub: { $ne: true } },
    { 'ingestion.type': { $ne: 'embedding_stub' } },
  ]

  if (filters.platform && filters.platform !== 'all') {
    const escapedPlatform = escapeRegex(filters.platform)
    query.platform = { $regex: new RegExp(`^${escapedPlatform}$`, 'i') }
  }

  if (filters.visibility_status && filters.visibility_status !== 'all') {
    const visibilityLower = String(filters.visibility_status).toLowerCase()
    if (visibilityLower === 'down') {
      query['workflow.visibility_status'] = 'down'
    } else if (visibilityLower === 'active' || visibilityLower === 'online' || visibilityLower === 'available') {
      andConditions.push({
        $or: [
          { 'workflow.visibility_status': { $in: ONLINE_VISIBILITY_VALUES } },
          { 'workflow.visibility_status': { $exists: false } },
          { 'workflow.visibility_status': null },
        ],
      })
    }
  }

  if (filters.client_status && filters.client_status !== 'all') {
    const statusLower = filters.client_status.toLowerCase()
    const v3Status = mapUiClientStatusToV3(filters.client_status)
    if (statusLower === 'to be reviewed') {
      andConditions.push({
        $or: [
          { 'workflow.client_status': { $in: ['open', 'alerted'] } },
          { 'workflow.client_status': { $exists: false } },
          { 'workflow.client_status': null },
        ],
      })
    } else if (statusLower === 'takedown' || statusLower === 'takedowns') {
      query['workflow.client_status'] = 'takedown'
    } else {
      query['workflow.client_status'] = v3Status
    }
  }

  const threatRange = buildEffectiveThreatScoreRange(filters.risk_priority)
  if (threatRange) {
    query['list.effective_threat_score'] = threatRange
  }

  if (filters.violations && filters.violations !== 'all') {
    const violationsArray = filters.violations.split(',')
    if (violationsArray.length > 0) {
      const normalViolations = violationsArray.filter((v) => v !== 'aigc')
      const hasAigc = violationsArray.includes('aigc')
      const violationConditions = []
      if (normalViolations.length > 0) {
        violationConditions.push({ 'list.violation_flags': { $in: normalViolations } })
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
    query.$and = [...(query.$and || []), ...andConditions]
  }

  return query
}

/** Parse URL search params into the filter object consumed by buildCasesMatchQuery. */
export function parseCasesListFilters(searchParams = {}) {
  return {
    platform: searchParams.platform || 'all',
    client_status: searchParams.status || searchParams.client_status || 'all',
    visibility_status: searchParams.visibility_status || 'all',
    risk_priority: searchParams.risk_priority || 'all',
    violations: searchParams.violations || 'all',
    published_from: searchParams.published_from || searchParams.original_date_from || null,
    published_to: searchParams.published_to || searchParams.original_date_to || null,
    alert_from: searchParams.alert_from || searchParams.processed_from || null,
    alert_to: searchParams.alert_to || searchParams.processed_to || null,
    unique_clusters: searchParams.unique_clusters === 'true' || searchParams.unique_clusters === true,
  }
}

export function parseCasesListSort(searchParams = {}, { defaultField = 'threat_score' } = {}) {
  const rawSortField = searchParams.sortField
  const normalizedSortField = rawSortField === 'processed_date'
    ? 'alert_date'
    : rawSortField === 'original_date'
      ? 'published_date'
      : rawSortField

  return {
    field: normalizedSortField || defaultField,
    direction: searchParams.sortDirection === 'asc' ? 'asc' : 'desc',
  }
}

export function buildCasesDateFilterStage(filters = {}) {
  const dateFilterStage = {}

  if (filters.published_from || filters.published_to) {
    dateFilterStage['list.posted_at'] = {}
    if (filters.published_from) {
      dateFilterStage['list.posted_at'].$gte = new Date(filters.published_from)
    }
    if (filters.published_to) {
      dateFilterStage['list.posted_at'].$lte = new Date(filters.published_to)
    }
  }

  if (filters.alert_from || filters.alert_to) {
    dateFilterStage['list.reviewed_at'] = {}
    if (filters.alert_from) {
      dateFilterStage['list.reviewed_at'].$gte = new Date(filters.alert_from)
    }
    if (filters.alert_to) {
      dateFilterStage['list.reviewed_at'].$lte = new Date(filters.alert_to)
    }
  }

  return dateFilterStage
}

/** @deprecated v3 stores materialized list.* fields; kept for callers still spreading this object. */
export function buildCasesDateAddFieldsStage() {
  return {}
}

export function buildCasesListSortPipeline(sort = {}) {
  return buildListSortFromRiskBuckets(sort)
}

export function buildCasesReportSortPipeline() {
  return buildReportSortFromRiskBuckets()
}

export { mapV3ClientStatusToUi, mapUiClientStatusToV3 }
