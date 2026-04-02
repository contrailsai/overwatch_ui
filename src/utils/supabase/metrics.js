'use server'

/**
 * Updates the daily metrics in Supabase based on a case review.
 * Handles both new reviews and updates to existing reviews.
 */
import { createClient } from '@/utils/supabase/server'

export async function updateDailyMetrics(project, reviewData, previousReviewData = null) {
  const supabase = await createClient()
  const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const platform = reviewData.platform || 'unknown'
  const project_name = project?.project_name

  if (!project_name) {
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

  try {
    // 1. Try to fetch existing row
    const { data: existing, error: fetchError } = await supabase
      .from('daily_case_metrics')
      .select('*')
      .eq('date', date)
      .eq('platform', platform)
      .eq('project_name', project_name)
      .maybeSingle()

    if (fetchError) throw fetchError

    if (existing) {
      // Merge risk JSON
      const updatedRisk = { ...(existing.risk || { safe: 0, low: 0, medium: 0, high: 0 }) }
      Object.keys(riskDeltas).forEach(key => {
        updatedRisk[key] = Math.max(0, (updatedRisk[key] || 0) + riskDeltas[key])
      })

      // Merge categories JSON
      const updatedCategories = { ...(existing.categories || {}) }
      Object.keys(categoryDeltas).forEach(key => {
        updatedCategories[key] = Math.max(0, (updatedCategories[key] || 0) + categoryDeltas[key])
      })

      const { error: updateError } = await supabase
        .from('daily_case_metrics')
        .update({
          total_cases: Math.max(0, (existing.total_cases || 0) + totalDelta),
          risk: updatedRisk,
          categories: updatedCategories,
          // created_at is automatic, but maybe we want an updated_at? (not in schema provided)
        })
        .eq('id', existing.id)

      if (updateError) throw updateError
    } else {
      // Insert new row
      // Initialize risk and categories with deltas, ensuring no negatives (though unlikely on insert)
      const initialRisk = {}
      Object.keys(riskDeltas).forEach(key => {
        initialRisk[key] = Math.max(0, riskDeltas[key])
      })

      const initialCategories = {}
      Object.keys(categoryDeltas).forEach(key => {
        initialCategories[key] = Math.max(0, categoryDeltas[key])
      })

      const { error: insertError } = await supabase
        .from('daily_case_metrics')
        .insert({
          date,
          platform,
          project_name,
          total_cases: Math.max(0, totalDelta),
          risk: initialRisk,
          categories: initialCategories
        })

      if (insertError) throw insertError
    }
  } catch (err) {
    console.error('Failed to update daily_case_metrics:', err)
  }
}

/**
 * Manages takedown cases in Supabase
 */
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
    console.error('Project name is missing in updateClientReviewedMetrics')
    return
  }

  const getRiskBucket = (score) => {
    if (score === undefined || score === null) return null
    if (score > 95) return 'high'
    if (score > 75) return 'medium'
    if (score > 40) return 'low'
    return 'safe'
  }

  // Map status to the exact keys provided in the requirement
  const getActionKey = (status) => {
    if (!status) return null
    if (status.toLowerCase().includes('no action') || status.toLowerCase().includes('no-action')) return 'no-action'
    if (status === 'Flag for Takedown') return 'Flag for Takedown'
    if (status === 'Takedown' || status === 'do_takedown' || status === 'Takedown Action') return 'Takedown'
    return null
  }

  const riskDeltas = { safe: 0, low: 0, medium: 0, high: 0 }
  const actionDeltas = { 'no-action': 0, 'Flag for Takedown': 0, 'Takedown': 0 }

  // 1. Add current state
  const currentRiskBucket = getRiskBucket(reviewData.risk_score)
  if (currentRiskBucket) riskDeltas[currentRiskBucket]++

  const currentActionKey = getActionKey(reviewData.client_status)
  if (currentActionKey) actionDeltas[currentActionKey]++

  let totalDelta = 1

  // 2. Subtract previous state if update
  if (previousReviewData) {
    totalDelta = 0
    const prevRiskBucket = getRiskBucket(previousReviewData.risk_score)
    if (prevRiskBucket) riskDeltas[prevRiskBucket]--

    const prevActionKey = getActionKey(previousReviewData.client_status)
    if (prevActionKey) actionDeltas[prevActionKey]--
  }

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('daily_reviewed_metrics')
      .select('*')
      .eq('date', date)
      .eq('platform', platform)
      .eq('project_name', project_name)
      .maybeSingle()

    if (fetchError) throw fetchError

    if (existing) {
      const updatedRisk = { ...(existing.risk || { safe: 0, low: 0, medium: 0, high: 0 }) }
      Object.keys(riskDeltas).forEach(key => {
        updatedRisk[key] = Math.max(0, (updatedRisk[key] || 0) + riskDeltas[key])
      })

      const updatedAction = { ...(existing.reviewed || { 'no-action': 0, 'Flag for Takedown': 0, 'Takedown': 0 }) }
      Object.keys(actionDeltas).forEach(key => {
        updatedAction[key] = Math.max(0, (updatedAction[key] || 0) + actionDeltas[key])
      })

      const { error: updateError } = await supabase
        .from('daily_reviewed_metrics')
        .update({
          total_reviewed: Math.max(0, (existing.total_reviewed || 0) + totalDelta),
          risk: updatedRisk,
          reviewed: updatedAction
        })
        .eq('id', existing.id)

      if (updateError) throw updateError
    } else {
      const initialRisk = {}
      Object.keys(riskDeltas).forEach(key => {
        initialRisk[key] = Math.max(0, riskDeltas[key])
      })

      const initialAction = {}
      Object.keys(actionDeltas).forEach(key => {
        initialAction[key] = Math.max(0, actionDeltas[key])
      })

      const { error: insertError } = await supabase
        .from('daily_reviewed_metrics')
        .insert({
          date,
          platform,
          project_name,
          total_reviewed: Math.max(0, totalDelta),
          risk: initialRisk,
          reviewed: initialAction
        })

      if (insertError) throw insertError
    }
  } catch (err) {
    console.error('Failed to update daily_reviewed_metrics:', err)
  }
}

export async function updateClientMetaStats(project_name, client_email, action) {
  const supabase = await createClient()

  if (!project_name || !client_email) {
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
      console.warn(`No client found with project: ${project_name} and email: ${client_email}`)
      return
    }

    // 2. Initialize or update meta_stats
    const metaStats = clientData.meta_stats || { reviewed_cases: 0, reviewed_profiles: 0 }

    // 3. Handle action increment
    if (action === 'reviewed_case') {
      metaStats.reviewed_cases = (metaStats.reviewed_cases || 0) + 1
      trackClientActivity(clientData.id, project_name, 'reviewed_case').catch(console.error)
    }
    else if (action === 'reviewed_profile') {
      metaStats.reviewed_profiles = (metaStats.reviewed_profiles || 0) + 1
      trackClientActivity(clientData.id, project_name, 'reviewed_profile').catch(console.error)
    }

    // 4. Update the client row
    const { error: updateError } = await supabase
      .from('client_details')
      .update({ meta_stats: metaStats })
      .eq('id', clientData.id)

    if (updateError) throw updateError
  } catch (err) {
    console.error('Failed to update client meta stats:', err)
  }
}

export async function manageTakedownCase(data) {
  const supabase = await createClient()
  const {
    mongo_post_id,
    post_platform_id,
    platform,
    is_in_takedown,
    risk_score,
    threat_type
  } = data

  if (!is_in_takedown) {
    // If not in takedown, we might want to remove it or mark resolved? 
    // For now, let's just ignore or leave as is.
    return null
  }

  try {
    const { data: record, error } = await supabase
      .from('takedown_cases')
      .upsert({
        mongo_post_id,
        post_platform_id,
        platform,
        status: 'initiated',
        risk_score,
        threat_type,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'mongo_post_id'
      })
      .select()
      .single()

    if (error) throw error
    return record
  } catch (err) {
    console.error('Failed to manage takedown case:', err)
    return null
  }
}

/**
 * Tracks the daily login/activity of a client in a project.
 * If the entry for today doesn't exist, it inserts one.
 */
export async function trackClientActivity(client_id, project_name, actionType = 'login') {
  const supabase = await createClient()

  if (!client_id || !project_name) {
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
        reviewed_profiles: actionType === 'reviewed_profile' ? 1 : 0
      }

      const { error: insertError } = await supabase
        .from('client_logs')
        .insert(newData)

      if (insertError) {
        // Handle race condition: another concurrent request successfully inserted the record.
        // This requires the 'client_logs_unique_day' constraint to be active in the DB!
        if (insertError.code === '23505' || (insertError.message && insertError.message.includes('duplicate'))) {
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
    console.error('Failed to track daily activity in client_logs:', err)
  }
}


