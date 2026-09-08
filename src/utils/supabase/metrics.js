'use server'

/**
 * Updates the daily metrics in Supabase based on a case review.
 * Handles both new reviews and updates to existing reviews.
 */
import { createClient } from '@/utils/supabase/server'
import { logActionError, logActionWarn, LOKI_STREAMS } from '@/utils/otel-logger'
import { clientActionKey, reviewDateStr, riskRankFromScore, todayDateStr } from '@/lib/analytics/dims'

const DUPLICATE_KEY_CODE = '23505'
const MISSING_RPC_CODE = 'PGRST202'
const RPC_TYPE_COERCION_CODE = '42846'
const ROW_FETCH_RETRIES = 3
const ROW_FETCH_RETRY_MS = 50
const UPSERT_MAX_ATTEMPTS = 3

function isDuplicateKeyError(error) {
  return error?.code === DUPLICATE_KEY_CODE
    || (typeof error?.message === 'string' && error.message.includes('duplicate'))
}

function isMissingRpcError(error) {
  return error?.code === MISSING_RPC_CODE
    || (typeof error?.message === 'string' && error.message.includes('Could not find the function'))
}

function shouldFallbackFromClientLogRpc(error) {
  return isMissingRpcError(error)
    || error?.code === RPC_TYPE_COERCION_CODE
    || (typeof error?.message === 'string' && error.message.includes('COALESCE could not convert type json to jsonb'))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runWithUpsertRetries(operation, maxAttempts = UPSERT_MAX_ATTEMPTS) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await operation()
      return
    } catch (error) {
      if (!isDuplicateKeyError(error) || attempt === maxAttempts - 1) throw error
      await sleep(ROW_FETCH_RETRY_MS * (attempt + 1))
    }
  }
}

async function fetchRowWithRetry(queryFn) {
  for (let attempt = 0; attempt <= ROW_FETCH_RETRIES; attempt++) {
    const { data, error } = await queryFn()
    if (error) throw error
    const row = data?.[0] ?? null
    if (row) return row
    if (attempt < ROW_FETCH_RETRIES) {
      await sleep(ROW_FETCH_RETRY_MS * (attempt + 1))
    }
  }
  return null
}

function mergeJsonCounters(existing = {}, deltas = {}) {
  const merged = { ...existing }
  Object.keys(deltas).forEach(key => {
    merged[key] = Math.max(0, (merged[key] || 0) + deltas[key])
  })
  return merged
}

async function fetchDailyMetricRow(supabase, table, { date, platform, project_name, entity_type }) {
  let query = supabase
    .from(table)
    .select('*')
    .eq('date', date)
    .eq('platform', platform)
    .eq('project_name', project_name)
    .order('id', { ascending: true })
    .limit(1)
  if (entity_type) query = query.eq('entity_type', entity_type)
  return fetchRowWithRetry(() => query)
}

async function fetchDimRow(supabase, key) {
  return fetchRowWithRetry(() => supabase
    .from('daily_metric_dims')
    .select('*')
    .eq('date', key.date)
    .eq('project_name', key.project_name)
    .eq('entity_type', key.entity_type)
    .eq('dim', key.dim)
    .eq('value', key.value)
    .order('id', { ascending: true })
    .limit(1))
}

async function upsertDimRowOnce({ supabase, key, delta }) {
  const applyUpdate = async (existing) => {
    const { error: updateError } = await supabase
      .from('daily_metric_dims')
      .update({ count: Math.max(0, (existing.count || 0) + delta) })
      .eq('id', existing.id)
    if (updateError) throw updateError
  }

  const existing = await fetchDimRow(supabase, key)
  if (existing) {
    await applyUpdate(existing)
    return
  }

  const { error: insertError } = await supabase
    .from('daily_metric_dims')
    .insert({
      date: key.date,
      project_name: key.project_name,
      entity_type: key.entity_type,
      dim: key.dim,
      value: key.value,
      count: Math.max(0, delta),
    })

  if (insertError) {
    if (isDuplicateKeyError(insertError)) {
      const retryExisting = await fetchDimRow(supabase, key)
      if (retryExisting) {
        await applyUpdate(retryExisting)
        return
      }
    }
    throw insertError
  }
}

async function upsertMetricDims(supabase, { date, project_name, entity_type, dims }) {
  if (!dims?.length || !date || !project_name || !entity_type) return
  await Promise.all(dims.map((entry) => {
    if (!entry?.dim || entry.value == null || entry.value === '' || !entry.delta) return Promise.resolve()
    return runWithUpsertRetries(() => upsertDimRowOnce({
      supabase,
      key: {
        date,
        project_name,
        entity_type,
        dim: entry.dim,
        value: entry.value,
      },
      delta: entry.delta,
    }))
  }))
}

function normalizeEntityType(value) {
  if (value === 'ad' || value === 'domain' || value === 'post') return value
  return 'post'
}

async function fetchClientLogRow(supabase, { client_id, project_name, date }) {
  return fetchRowWithRetry(() => supabase
    .from('client_logs')
    .select('*')
    .eq('client_id', client_id)
    .eq('project_name', project_name)
    .eq('date', date)
    .order('id', { ascending: true })
    .limit(1))
}

async function upsertClientLogRow({
  supabase,
  key,
  buildInitialRow,
  buildUpdatePayload,
}) {
  const applyUpdate = async (existing) => {
    const { error: updateError } = await supabase
      .from('client_logs')
      .update(buildUpdatePayload(existing))
      .eq('id', existing.id)

    if (updateError) throw updateError
  }

  const existing = await fetchClientLogRow(supabase, key)

  if (existing) {
    await applyUpdate(existing)
    return
  }

  const { error: insertError } = await supabase
    .from('client_logs')
    .insert(buildInitialRow())

  if (insertError) {
    if (isDuplicateKeyError(insertError)) {
      const retryExisting = await fetchClientLogRow(supabase, key)
      if (retryExisting) {
        await applyUpdate(retryExisting)
        return
      }
    }
    throw insertError
  }
}

function buildClientLogRpcParams(actionType, details, increment, time) {
  const delta = Math.max(0, Number(increment) || 0)
  const params = {
    p_reviewed_cases_delta: 0,
    p_reviewed_profiles_delta: 0,
    p_report_download_key: null,
    p_report_download_delta: 0,
    p_login_time: null,
  }

  if (actionType === 'login') {
    params.p_login_time = time
  } else if (actionType === 'reviewed_case') {
    params.p_reviewed_cases_delta = delta
  } else if (actionType === 'reviewed_profile') {
    params.p_reviewed_profiles_delta = delta
  } else if (actionType === 'report_download' && details) {
    params.p_report_download_key = details
    params.p_report_download_delta = delta || 1
  }

  return params
}

async function incrementClientLogActivityRpc(supabase, {
  client_id,
  project_name,
  date,
  time,
  actionType,
  details,
  increment,
}) {
  const rpcParams = buildClientLogRpcParams(actionType, details, increment, time)
  const { error } = await supabase.rpc('increment_client_log_activity', {
    p_client_id: client_id,
    p_project_name: project_name,
    p_date: date,
    p_last_activity: time,
    ...rpcParams,
  })

  if (error) {
    if (shouldFallbackFromClientLogRpc(error)) return false
    throw error
  }

  return true
}

async function incrementClientMetaStatsRpc(supabase, client_id, project_name, casesDelta, profilesDelta) {
  const { error } = await supabase.rpc('increment_client_meta_stats', {
    p_client_id: client_id,
    p_project_name: project_name,
    p_reviewed_cases_delta: casesDelta,
    p_reviewed_profiles_delta: profilesDelta,
  })

  if (error) {
    if (isMissingRpcError(error)) return false
    throw error
  }

  return true
}

async function upsertDailyMetricRowOnce({
  supabase,
  table,
  key,
  buildInitialRow,
  buildUpdatePayload,
}) {
  const applyUpdate = async (existing) => {
    const { error: updateError } = await supabase
      .from(table)
      .update(buildUpdatePayload(existing))
      .eq('id', existing.id)

    if (updateError) throw updateError
  }

  const existing = await fetchDailyMetricRow(supabase, table, key)

  if (existing) {
    await applyUpdate(existing)
    return
  }

  const { error: insertError } = await supabase
    .from(table)
    .insert(buildInitialRow())

  if (insertError) {
    if (isDuplicateKeyError(insertError)) {
      const retryExisting = await fetchDailyMetricRow(supabase, table, key)
      if (retryExisting) {
        await applyUpdate(retryExisting)
        return
      }
    }
    throw insertError
  }
}

async function upsertDailyMetricRow(params) {
  return runWithUpsertRetries(() => upsertDailyMetricRowOnce(params))
}

export async function updateDailyMetrics(project, reviewData, previousReviewData = null, options = {}) {
  const supabase = await createClient()
  const entity_type = normalizeEntityType(options.entityType || reviewData.entity_type)
  const date = options.reviewDate || options.sourcedDate || todayDateStr()
  const platform = reviewData.platform || (entity_type === 'domain' ? 'web' : 'unknown')
  const project_name = project?.project_name

  if (!project_name) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'supabase/metrics',
      app_action: 'updateDailyMetrics',
      message: 'Project name is missing in updateDailyMetrics',
    })
    console.error('Project name is missing in updateDailyMetrics')
    return
  }

  const riskDeltas = { safe: 0, low: 0, medium: 0, high: 0 }
  const categoryDeltas = {}

  const currentRiskBucket = riskRankFromScore(reviewData.threat_score)
  if (currentRiskBucket) riskDeltas[currentRiskBucket]++

  const currentTypes = Array.isArray(reviewData.threat_types)
    ? reviewData.threat_types
    : [reviewData.threat_type || 'safe']

  currentTypes.filter(t => typeof t === 'string').forEach(type => {
    const normalized = type.toLowerCase().replace(/ /g, '_')
    categoryDeltas[normalized] = (categoryDeltas[normalized] || 0) + 1
  })

  if (reviewData.is_aigc) {
    categoryDeltas['aigc'] = (categoryDeltas['aigc'] || 0) + 1
  }

  let totalDelta = 1

  if (previousReviewData) {
    totalDelta = 0
    const prevRiskBucket = riskRankFromScore(previousReviewData.threat_score)
    if (prevRiskBucket) riskDeltas[prevRiskBucket]--

    const prevTypes = Array.isArray(previousReviewData.threat_types)
      ? previousReviewData.threat_types
      : [previousReviewData.threat_type || 'safe']

    prevTypes.filter(t => typeof t === 'string').forEach(type => {
      const normalized = type.toLowerCase().replace(/ /g, '_')
      categoryDeltas[normalized] = (categoryDeltas[normalized] || 0) - 1
    })

    if (previousReviewData.is_aigc) {
      categoryDeltas['aigc'] = (categoryDeltas['aigc'] || 0) - 1
    }
  }

  const key = { date, platform, project_name, entity_type }

  try {
    await upsertDailyMetricRow({
      supabase,
      table: 'daily_case_metrics',
      key,
      buildInitialRow: () => {
        const initialRisk = {}
        Object.keys(riskDeltas).forEach(riskKey => {
          initialRisk[riskKey] = Math.max(0, riskDeltas[riskKey])
        })

        const initialCategories = {}
        Object.keys(categoryDeltas).forEach(categoryKey => {
          initialCategories[categoryKey] = Math.max(0, categoryDeltas[categoryKey])
        })

        return {
          date,
          platform,
          project_name,
          entity_type,
          total_cases: Math.max(0, totalDelta),
          risk: initialRisk,
          categories: initialCategories,
        }
      },
      buildUpdatePayload: (existing) => ({
        total_cases: Math.max(0, (existing.total_cases || 0) + totalDelta),
        risk: mergeJsonCounters(existing.risk || { safe: 0, low: 0, medium: 0, high: 0 }, riskDeltas),
        categories: mergeJsonCounters(existing.categories || {}, categoryDeltas),
      }),
    })

    await upsertMetricDims(supabase, {
      date,
      project_name,
      entity_type,
      dims: options.dims,
    }).catch((err) => {
      logActionError({
        loki_stream: LOKI_STREAMS.shared,
        app_caller: 'supabase/metrics',
        app_action: 'updateDailyMetrics',
        message: 'Failed to update daily_metric_dims',
      }, err)
    })
  } catch (err) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'supabase/metrics',
      app_action: 'updateDailyMetrics',
      message: 'Failed to update daily_case_metrics',
    }, err)
    console.error('Failed to update daily_case_metrics:', err)
  }
}

/**
 * Updates the client reviewed metrics in Supabase.
 * Tracks client decisions: 'no-action', 'Flag for Takedown', 'Takedown'
 */
export async function updateClientReviewedMetrics(project, reviewData, previousReviewData = null, options = {}) {
  const supabase = await createClient()
  const entity_type = normalizeEntityType(options.entityType || reviewData.entity_type)
  const date = options.reviewDate || todayDateStr()
  const platform = reviewData.platform || (entity_type === 'domain' ? 'web' : 'unknown')
  const project_name = project?.project_name

  if (!project_name) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'supabase/metrics',
      app_action: 'updateClientReviewedMetrics',
      message: 'Project name is missing in updateClientReviewedMetrics',
    })
    console.error('Project name is missing in updateClientReviewedMetrics')
    return
  }

  const { riskDeltas, actionDeltas, totalDelta } = computeClientReviewedDeltas(reviewData, previousReviewData)
  const key = { date, platform, project_name, entity_type }

  try {
    await upsertDailyMetricRow({
      supabase,
      table: 'daily_reviewed_metrics',
      key,
      buildInitialRow: () => {
        const initialRisk = {}
        Object.keys(riskDeltas).forEach(riskKey => {
          initialRisk[riskKey] = Math.max(0, riskDeltas[riskKey])
        })

        const initialAction = {}
        Object.keys(actionDeltas).forEach(actionKey => {
          initialAction[actionKey] = Math.max(0, actionDeltas[actionKey])
        })

        return {
          date,
          platform,
          project_name,
          entity_type,
          total_reviewed: Math.max(0, totalDelta),
          risk: initialRisk,
          reviewed: initialAction,
        }
      },
      buildUpdatePayload: (existing) => ({
        total_reviewed: Math.max(0, (existing.total_reviewed || 0) + totalDelta),
        risk: mergeJsonCounters(existing.risk || { safe: 0, low: 0, medium: 0, high: 0 }, riskDeltas),
        reviewed: mergeJsonCounters(
          existing.reviewed || { 'no-action': 0, 'Flag for Takedown': 0, 'Takedown': 0 },
          actionDeltas
        ),
      }),
    })
  } catch (err) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'supabase/metrics',
      app_action: 'updateClientReviewedMetrics',
      message: 'Failed to update daily_reviewed_metrics',
    }, err)
    console.error('Failed to update daily_reviewed_metrics:', err)
  }
}

function computeClientReviewedDeltas(reviewData, previousReviewData = null) {
  const getRiskBucket = (score) => {
    if (score === undefined || score === null) return null
    if (score > 95) return 'high'
    if (score > 75) return 'medium'
    if (score > 40) return 'low'
    return 'safe'
  }

  const getActionKey = (status) => clientActionKey(status)

  const riskDeltas = { safe: 0, low: 0, medium: 0, high: 0 }
  const actionDeltas = { 'no-action': 0, 'Flag for Takedown': 0, 'Takedown': 0 }

  const currentRiskBucket = getRiskBucket(reviewData.risk_score)
  if (currentRiskBucket) riskDeltas[currentRiskBucket]++

  const currentActionKey = getActionKey(reviewData.client_status)
  if (currentActionKey) actionDeltas[currentActionKey]++

  let totalDelta = 1

  if (previousReviewData) {
    totalDelta = 0
    const prevRiskBucket = getRiskBucket(previousReviewData.risk_score)
    if (prevRiskBucket) riskDeltas[prevRiskBucket]--

    const prevActionKey = getActionKey(previousReviewData.client_status)
    if (prevActionKey) actionDeltas[prevActionKey]--
  }

  return { riskDeltas, actionDeltas, totalDelta }
}

function accumulateClientReviewedDeltas(target, reviewData, previousReviewData = null) {
  const { riskDeltas, actionDeltas, totalDelta } = computeClientReviewedDeltas(reviewData, previousReviewData)

  Object.keys(riskDeltas).forEach(key => {
    target.riskDeltas[key] = (target.riskDeltas[key] || 0) + riskDeltas[key]
  })
  Object.keys(actionDeltas).forEach(key => {
    target.actionDeltas[key] = (target.actionDeltas[key] || 0) + actionDeltas[key]
  })
  target.totalDelta += totalDelta
}

/**
 * Batch update client reviewed metrics grouped by platform.
 */
export async function updateClientReviewedMetricsBatch(project, posts, targetStatus, options = {}) {
  if (!posts?.length) return

  const entity_type = normalizeEntityType(options.entityType)
  const platformBuckets = new Map()

  for (const post of posts) {
    const platform = post?.platform?.toLowerCase() || (entity_type === 'domain' ? 'web' : 'unknown')
    const date = reviewDateStr(post) || options.reviewDate || todayDateStr()
    const bucketKey = `${date}::${platform}`
    const previousStatus = post.workflow?.client_status || post.client_status
    const currentReviewData = {
      risk_score: post.review_details?.threat_score || post.list?.effective_threat_score || 0,
      client_status: targetStatus,
      platform,
    }
    const previousReviewData = previousStatus && !['To Be Reviewed', 'open', 'alerted'].includes(previousStatus)
      ? {
          risk_score: post.review_details?.threat_score || post.list?.effective_threat_score || 0,
          client_status: previousStatus,
          platform,
        }
      : null

    if (!platformBuckets.has(bucketKey)) {
      platformBuckets.set(bucketKey, {
        date,
        platform,
        riskDeltas: { safe: 0, low: 0, medium: 0, high: 0 },
        actionDeltas: { 'no-action': 0, 'Flag for Takedown': 0, 'Takedown': 0 },
        totalDelta: 0,
      })
    }

    accumulateClientReviewedDeltas(platformBuckets.get(bucketKey), currentReviewData, previousReviewData)
  }

  const supabase = await createClient()
  const project_name = project?.project_name

  if (!project_name) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'supabase/metrics',
      app_action: 'updateClientReviewedMetricsBatch',
      message: 'Project name is missing in updateClientReviewedMetricsBatch',
    })
    console.error('Project name is missing in updateClientReviewedMetricsBatch')
    return
  }

  await Promise.all([...platformBuckets.values()].map(async (deltas) => {
    const { date, platform } = deltas
    const key = { date, platform, project_name, entity_type }

    try {
      await upsertDailyMetricRow({
        supabase,
        table: 'daily_reviewed_metrics',
        key,
        buildInitialRow: () => {
          const initialRisk = {}
          Object.keys(deltas.riskDeltas).forEach(riskKey => {
            initialRisk[riskKey] = Math.max(0, deltas.riskDeltas[riskKey])
          })

          const initialAction = {}
          Object.keys(deltas.actionDeltas).forEach(actionKey => {
            initialAction[actionKey] = Math.max(0, deltas.actionDeltas[actionKey])
          })

          return {
            date,
            platform,
            project_name,
            entity_type,
            total_reviewed: Math.max(0, deltas.totalDelta),
            risk: initialRisk,
            reviewed: initialAction,
          }
        },
        buildUpdatePayload: (existing) => ({
          total_reviewed: Math.max(0, (existing.total_reviewed || 0) + deltas.totalDelta),
          risk: mergeJsonCounters(existing.risk || { safe: 0, low: 0, medium: 0, high: 0 }, deltas.riskDeltas),
          reviewed: mergeJsonCounters(
            existing.reviewed || { 'no-action': 0, 'Flag for Takedown': 0, 'Takedown': 0 },
            deltas.actionDeltas
          ),
        }),
      })
    } catch (err) {
      logActionError({
        loki_stream: LOKI_STREAMS.shared,
        app_caller: 'supabase/metrics',
        app_action: 'updateClientReviewedMetricsBatch',
        message: 'Failed to update daily_reviewed_metrics',
      }, err)
      console.error('Failed to update daily_reviewed_metrics:', err)
    }
  }))
}

export async function updateClientMetaStats(project_name, client_email, action, count = 1) {
  const supabase = await createClient()

  if (!project_name || !client_email) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'supabase/metrics',
      app_action: 'updateClientMetaStats',
      message: 'Project name or client email is missing in updateClientMetaStats',
    })
    console.error('Project name or client email is missing in updateClientMetaStats')
    return
  }

  try {
    // 1. Fetch existing client data
    const { data: clientData, error: fetchError } = await supabase
      .from('client_details')
      .select('id, meta_stats')
      .eq('project_name', project_name)
      .eq('email', client_email)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!clientData) {
      logActionWarn({
        loki_stream: LOKI_STREAMS.shared,
        app_caller: 'supabase/metrics',
        app_action: 'updateClientMetaStats',
        message: `No client found with project: ${project_name} and email: ${client_email}`,
      })
      console.warn(`No client found with project: ${project_name} and email: ${client_email}`)
      return
    }

    const safeCount = Math.max(0, Number(count) || 0)
    if (safeCount === 0) return

    const casesDelta = action === 'reviewed_case' ? safeCount : 0
    const profilesDelta = action === 'reviewed_profile' ? safeCount : 0
    const activityType = action === 'reviewed_profile' ? 'reviewed_profile' : 'reviewed_case'

    await trackClientActivity(clientData.id, project_name, activityType, null, null, safeCount)

    const usedRpc = await incrementClientMetaStatsRpc(
      supabase,
      clientData.id,
      project_name,
      casesDelta,
      profilesDelta
    )

    if (usedRpc) return

    const metaStats = clientData.meta_stats || { reviewed_cases: 0, reviewed_profiles: 0 }
    if (casesDelta > 0) {
      metaStats.reviewed_cases = (metaStats.reviewed_cases || 0) + casesDelta
    }
    if (profilesDelta > 0) {
      metaStats.reviewed_profiles = (metaStats.reviewed_profiles || 0) + profilesDelta
    }

    const { error: updateError } = await supabase
      .from('client_details')
      .update({ meta_stats: metaStats })
      .eq('id', clientData.id)

    if (updateError) throw updateError
  } catch (err) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'supabase/metrics',
      app_action: 'updateClientMetaStats',
      message: 'Failed to update client meta stats',
    }, err)
    console.error('Failed to update client meta stats:', err)
  }
}

/**
 * Tracks the daily login/activity of a client in a project.
 * If the entry for today doesn't exist, it inserts one.
 */
export async function trackClientActivity(client_id, project_name, actionType = 'login', details = null, clientEmail = null, increment = 1) {
  const supabase = await createClient()

  if (!client_id || !project_name) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'supabase/metrics',
      app_action: 'trackClientActivity',
      message: 'Missing client_id or project_name in trackClientActivity',
    })
    console.error('Missing client_id or project_name in trackClientActivity')
    return
  }

  const safeIncrement = Math.max(0, Number(increment) || 0)
  if (actionType !== 'login' && safeIncrement === 0) return

  try {
    const now = new Date()
    const date = now.toISOString().split('T')[0] // YYYY-MM-DD
    const time = now.toISOString().split('T')[1].split('.')[0] + 'Z' // HH:MM:SSZ
    const key = { client_id, project_name, date }

    const usedRpc = await incrementClientLogActivityRpc(supabase, {
      client_id,
      project_name,
      date,
      time,
      actionType,
      details,
      increment: actionType === 'login' ? 1 : safeIncrement,
    })

    if (!usedRpc) {
      const incrementValue = actionType === 'login' ? 1 : safeIncrement
      await runWithUpsertRetries(() => upsertClientLogRow({
        supabase,
        key,
        buildInitialRow: () => ({
          client_id,
          project_name,
          date,
          login_time: actionType === 'login' ? time : null,
          last_activity: time,
          reviewed_cases: actionType === 'reviewed_case' ? incrementValue : 0,
          reviewed_profiles: actionType === 'reviewed_profile' ? incrementValue : 0,
          reports_download: actionType === 'report_download' && details ? { [details]: incrementValue } : {},
        }),
        buildUpdatePayload: (existing) => {
          const updates = { last_activity: time }

          if (actionType === 'login' && !existing.login_time) {
            updates.login_time = time
          } else if (actionType === 'reviewed_case') {
            updates.reviewed_cases = (existing.reviewed_cases || 0) + incrementValue
          } else if (actionType === 'reviewed_profile') {
            updates.reviewed_profiles = (existing.reviewed_profiles || 0) + incrementValue
          } else if (actionType === 'report_download' && details) {
            const currentReports = existing.reports_download || {}
            updates.reports_download = {
              ...currentReports,
              [details]: (currentReports[details] || 0) + incrementValue,
            }
          }

          return updates
        },
      }))
    }
  } catch (err) {
    logActionError({
      loki_stream: LOKI_STREAMS.shared,
      app_caller: 'supabase/metrics',
      app_action: 'trackClientActivity',
      message: 'Failed to track daily activity in client_logs',
    }, err)
    console.error('Failed to track daily activity in client_logs:', err)
  }

  // Send Slack notification for report generation
  if (actionType === 'report_download' && details) {
    try {
      const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL_REPORT_GENERATION
      if (SLACK_WEBHOOK_URL) {
        const email = clientEmail || client_id

        // Fire-and-forget fetch to avoid blocking the client response
        fetch(SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            "report-type": details,
            project: project_name
          })
        }).catch(err => {
          logActionError({
            loki_stream: LOKI_STREAMS.shared,
            app_caller: 'supabase/metrics',
            app_action: 'trackClientActivity',
            message: 'Slack webhook error',
          }, err)
          console.error('Slack webhook error:', err)
        })
      }
    } catch (slackError) {
      logActionError({
        loki_stream: LOKI_STREAMS.shared,
        app_caller: 'supabase/metrics',
        app_action: 'trackClientActivity',
        message: 'Slack notification setup failed',
      }, slackError)
      console.error('Slack notification setup failed:', slackError)
    }
  }
}

