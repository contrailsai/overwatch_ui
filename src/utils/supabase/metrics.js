'use server'

/**
 * Updates the daily metrics in Supabase based on a case review.
 * Handles both new reviews and updates to existing reviews.
 */
import { createClient } from '@/utils/supabase/server'
import { logActionError, logActionWarn, LOKI_STREAMS } from '@/utils/otel-logger'

const DUPLICATE_KEY_CODE = '23505'

function isDuplicateKeyError(error) {
  return error?.code === DUPLICATE_KEY_CODE
    || (typeof error?.message === 'string' && error.message.includes('duplicate'))
}

function mergeJsonCounters(existing = {}, deltas = {}) {
  const merged = { ...existing }
  Object.keys(deltas).forEach(key => {
    merged[key] = Math.max(0, (merged[key] || 0) + deltas[key])
  })
  return merged
}

async function fetchDailyMetricRow(supabase, table, { date, platform, project_name }) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('date', date)
    .eq('platform', platform)
    .eq('project_name', project_name)
    .order('id', { ascending: true })
    .limit(1)

  if (error) throw error
  return data?.[0] ?? null
}

async function upsertDailyMetricRow({
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

export async function updateDailyMetrics(project, reviewData, previousReviewData = null) {
  const supabase = await createClient()
  const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const platform = reviewData.platform || 'unknown'
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

  // Helper to determine risk bucket
  // Safe: 0-40, Low: 40-75, Mid: 76-95, High: 96-100 (based on ReviewDetails.js)
  const getRiskBucket = (score) => {
    if (score === undefined || score === null) return null
    if (score > 95) return 'high'
    if (score > 75) return 'medium'
    if (score > 40) return 'low'
    return 'safe'
  }

  // Calculate deltas for JSON fields
  const riskDeltas = { safe: 0, low: 0, medium: 0, high: 0 }
  const categoryDeltas = {}

  // 1. Add current review data
  const currentRiskBucket = getRiskBucket(reviewData.threat_score)
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

  // 2. Subtract previous review data if it's an update
  if (previousReviewData) {
    totalDelta = 0 // Net change 0 for total if updating
    const prevRiskBucket = getRiskBucket(previousReviewData.threat_score)
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

  const key = { date, platform, project_name }

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
export async function updateClientReviewedMetrics(project, reviewData, previousReviewData = null) {
  const supabase = await createClient()
  const date = new Date().toISOString().split('T')[0]
  const platform = reviewData.platform || 'unknown'
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
  const key = { date, platform, project_name }

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

  const getActionKey = (status) => {
    if (!status) return null
    if (status.toLowerCase().includes('no action') || status.toLowerCase().includes('no-action')) return 'no-action'
    if (status === 'Flag for Takedown') return 'Flag for Takedown'
    if (status === 'Takedown' || status === 'do_takedown' || status === 'Takedown Action') return 'Takedown'
    return null
  }

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
export async function updateClientReviewedMetricsBatch(project, posts, targetStatus) {
  if (!posts?.length) return

  const platformBuckets = new Map()

  for (const post of posts) {
    const platform = post?.platform?.toLowerCase() || 'unknown'
    const currentReviewData = {
      risk_score: post.review_details?.threat_score || 0,
      client_status: targetStatus,
      platform,
    }
    const previousReviewData = post.client_status && post.client_status !== 'To Be Reviewed'
      ? {
          risk_score: post.review_details?.threat_score || 0,
          client_status: post.client_status,
          platform,
        }
      : null

    if (!platformBuckets.has(platform)) {
      platformBuckets.set(platform, {
        riskDeltas: { safe: 0, low: 0, medium: 0, high: 0 },
        actionDeltas: { 'no-action': 0, 'Flag for Takedown': 0, 'Takedown': 0 },
        totalDelta: 0,
      })
    }

    accumulateClientReviewedDeltas(platformBuckets.get(platform), currentReviewData, previousReviewData)
  }

  const supabase = await createClient()
  const date = new Date().toISOString().split('T')[0]
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

  await Promise.all([...platformBuckets.entries()].map(async ([platform, deltas]) => {
    const key = { date, platform, project_name }

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

export async function updateClientMetaStats(project_name, client_email, action) {
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

    // 2. Initialize or update meta_stats
    const metaStats = clientData.meta_stats || { reviewed_cases: 0, reviewed_profiles: 0 }

    // 3. Handle action increment
    if (action === 'reviewed_case') {
      metaStats.reviewed_cases = (metaStats.reviewed_cases || 0) + 1
      trackClientActivity(clientData.id, project_name, 'reviewed_case').catch(err => logActionError({
        loki_stream: LOKI_STREAMS.shared,
        app_caller: 'supabase/metrics',
        app_action: 'trackClientActivity',
        message: 'Failed to track reviewed_case activity',
      }, err))
    }
    else if (action === 'reviewed_profile') {
      metaStats.reviewed_profiles = (metaStats.reviewed_profiles || 0) + 1
      trackClientActivity(clientData.id, project_name, 'reviewed_profile').catch(err => logActionError({
        loki_stream: LOKI_STREAMS.shared,
        app_caller: 'supabase/metrics',
        app_action: 'trackClientActivity',
        message: 'Failed to track reviewed_profile activity',
      }, err))
    }

    // 4. Update the client row
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
export async function trackClientActivity(client_id, project_name, actionType = 'login', details = null, clientEmail = null) {
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

  try {
    const now = new Date()
    const date = now.toISOString().split('T')[0] // YYYY-MM-DD
    const time = now.toISOString().split('T')[1].split('.')[0] + 'Z' // HH:MM:SSZ

    // Helper to perform the update on an existing record safely
    const updateExisting = async (existingRecord) => {
      const updates = { last_activity: time }

      if (actionType === 'login' && !existingRecord.login_time) {
        updates.login_time = time
      } else if (actionType === 'reviewed_case') {
        updates.reviewed_cases = (existingRecord.reviewed_cases || 0) + 1
      } else if (actionType === 'reviewed_profile') {
        updates.reviewed_profiles = (existingRecord.reviewed_profiles || 0) + 1
      } else if (actionType === 'report_download' && details) {
        const currentReports = existingRecord.reports_download || {}
        updates.reports_download = {
          ...currentReports,
          [details]: (currentReports[details] || 0) + 1
        }
      }

      const { error: updateError } = await supabase
        .from('client_logs')
        .update(updates)
        .eq('id', existingRecord.id)

      if (updateError) throw updateError
    }

    // We use a single query approach to avoid race conditions.
    // First, check if the record for today already exists
    const { data: existingArray, error: fetchError } = await supabase
      .from('client_logs')
      .select('*')
      .eq('client_id', client_id)
      .eq('project_name', project_name)
      .eq('date', date)
      .limit(1)

    if (fetchError) throw fetchError
    const existing = existingArray && existingArray.length > 0 ? existingArray[0] : null

    if (!existing) {
      // First activity of the day, attempt insert
      const newData = {
        client_id,
        project_name,
        date,
        login_time: actionType === 'login' ? time : null,
        last_activity: time,
        reviewed_cases: actionType === 'reviewed_case' ? 1 : 0,
        reviewed_profiles: actionType === 'reviewed_profile' ? 1 : 0,
        reports_download: actionType === 'report_download' && details ? { [details]: 1 } : {}
      }

      const { error: insertError } = await supabase
        .from('client_logs')
        .insert(newData)

      if (insertError) {
        // Handle race condition: another concurrent request successfully inserted the record.
        // This requires the 'client_logs_unique_day' constraint to be active in the DB!
        if (isDuplicateKeyError(insertError)) {
          // Fetch the newly created record and update it instead
          const { data: retryArray, error: retryFetchError } = await supabase
            .from('client_logs')
            .select('*')
            .eq('client_id', client_id)
            .eq('project_name', project_name)
            .eq('date', date)
            .limit(1)

          if (retryFetchError) throw retryFetchError
          const retryExisting = retryArray && retryArray.length > 0 ? retryArray[0] : null
          
          if (retryExisting) {
            await updateExisting(retryExisting)
            return
          }
        }
        // If it's a different error (or constraint is missing), throw it
        throw insertError
      }
    } else {
      // Already active today, update metrics
      await updateExisting(existing)
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

