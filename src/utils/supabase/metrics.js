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
