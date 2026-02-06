'use server'

/**
 * Updates the daily metrics in Supabase based on a case review.
 * Handles both new reviews and updates to existing reviews.
 */
import { createClient } from '@/utils/supabase/server'

export async function updateDailyMetrics(reviewData, previousReviewData = null) {
  const supabase = await createClient()
  const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const platform = reviewData.platform || 'unknown'

  // Helper to determine risk bucket
  // Safe: 0-40, Low: 40-60, Mid: 60-85, High: 85-100
  const getRiskBucket = (score) => {
    if (score >= 85) return 'risk_high_count'
    if (score >= 60) return 'risk_medium_count'
    if (score >= 40) return 'risk_low_count'
    return 'risk_safe_count'
  }

  // Helper to determine threat column
  const getThreatColumn = (type) => {
    const map = {
      'safe': 'threat_safe_count',
      'scam': 'threat_scam_count',
      'hate_speech': 'threat_hate_speech_count',
      'fake_news': 'threat_fake_news_count',
      'nsfw': 'threat_nsfw_count',
      'aigc': 'threat_aigc_count',
      'other': 'threat_other_count'
    }
    // Normalize type string just in case
    const normalized = type ? type.toLowerCase().replace(/ /g, '_') : 'other'
    return map[normalized] || 'threat_other_count'
  }

  // Calculate deltas
  const updates = {
    total_reviewed: 0,
    risk_high_count: 0,
    risk_medium_count: 0,
    risk_low_count: 0,
    risk_safe_count: 0,
    threat_safe_count: 0,
    threat_scam_count: 0,
    threat_hate_speech_count: 0,
    threat_fake_news_count: 0,
    threat_nsfw_count: 0,
    threat_aigc_count: 0,
    threat_other_count: 0
  }

  // If this is a new review (not an update to a previous one done TODAY), increment total
  // Note: If previousReviewData exists, we assume it's an adjustment.

  // Add new values
  updates.total_reviewed++
  updates[getRiskBucket(reviewData.threat_score)]++
  updates[getThreatColumn(reviewData.is_aigc && 'aigc')]++

  const currentTypes = Array.isArray(reviewData.threat_types)
    ? reviewData.threat_types
    : [reviewData.threat_type || 'safe']

  currentTypes.forEach(type => {
    updates[getThreatColumn(type)]++
  })

  // Subtract old values if they exist
  if (previousReviewData) {
    updates.total_reviewed-- // Net change 0 for total if updating
    updates[getRiskBucket(previousReviewData.threat_score)]--

    const prevTypes = Array.isArray(previousReviewData.threat_types)
      ? previousReviewData.threat_types
      : [previousReviewData.threat_type || 'safe']

    prevTypes.forEach(type => {
      updates[getThreatColumn(type)]--
    })
  }

  try {
    // 1. Try to fetch existing row
    const { data: existing, error: fetchError } = await supabase
      .from('daily_metrics')
      .select('*')
      .eq('date', date)
      .eq('platform', platform)
      .maybeSingle()

    if (fetchError) throw fetchError

    if (existing) {
      // 2. Update existing row
      const { error: updateError } = await supabase
        .from('daily_metrics')
        .update({
          total_reviewed: existing.total_reviewed + updates.total_reviewed,
          risk_high_count: existing.risk_high_count + updates.risk_high_count,
          risk_medium_count: existing.risk_medium_count + updates.risk_medium_count,
          risk_low_count: existing.risk_low_count + updates.risk_low_count,
          risk_safe_count: (existing.risk_safe_count || 0) + updates.risk_safe_count,

          threat_safe_count: existing.threat_safe_count + updates.threat_safe_count,
          threat_scam_count: existing.threat_scam_count + updates.threat_scam_count,
          threat_hate_speech_count: existing.threat_hate_speech_count + updates.threat_hate_speech_count,
          threat_fake_news_count: existing.threat_fake_news_count + updates.threat_fake_news_count,
          threat_nsfw_count: existing.threat_nsfw_count + updates.threat_nsfw_count,
          threat_aigc_count: (existing.threat_aigc_count || 0) + updates.threat_aigc_count,
          threat_other_count: existing.threat_other_count + updates.threat_other_count,

          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)

      if (updateError) throw updateError
    } else {
      // 3. Insert new row
      const { error: insertError } = await supabase
        .from('daily_metrics')
        .insert({
          date,
          platform,
          total_reviewed: Math.max(0, updates.total_reviewed),
          risk_high_count: Math.max(0, updates.risk_high_count),
          risk_medium_count: Math.max(0, updates.risk_medium_count),
          risk_low_count: Math.max(0, updates.risk_low_count),
          risk_safe_count: Math.max(0, updates.risk_safe_count),

          threat_safe_count: Math.max(0, updates.threat_safe_count),
          threat_scam_count: Math.max(0, updates.threat_scam_count),
          threat_hate_speech_count: Math.max(0, updates.threat_hate_speech_count),
          threat_fake_news_count: Math.max(0, updates.threat_fake_news_count),
          threat_nsfw_count: Math.max(0, updates.threat_nsfw_count),
          threat_aigc_count: Math.max(0, updates.threat_aigc_count),
          threat_other_count: Math.max(0, updates.threat_other_count),

          takedowns_initiated: 0 // handled separately
        })

      if (insertError) throw insertError
    }
  } catch (err) {
    console.error('Failed to update metrics:', err)
  }
}

/**
 * Tracks a takedown initiation event in metrics
 */
export async function trackTakedownEvent(platform) {
  const supabase = await createClient()
  const date = new Date().toISOString().split('T')[0]

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('daily_metrics')
      .select('*')
      .eq('date', date)
      .eq('platform', platform)
      .maybeSingle()

    if (fetchError) throw fetchError

    if (existing) {
      await supabase.from('daily_metrics')
        .update({
          takedowns_initiated: (existing.takedowns_initiated || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
    } else {
      await supabase.from('daily_metrics')
        .insert({
          date,
          platform,
          takedowns_initiated: 1,
          // Default others to 0
          total_reviewed: 0
        })
    }
  } catch (err) {
    console.error('Failed to track takedown event:', err)
  }
}

/**
 * Manages takedown cases in Supabase
 */
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
