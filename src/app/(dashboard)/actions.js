'use server'

import { cache } from 'react'
import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { traceAction } from '@/utils/tracing'
import { posthogServer } from '@/utils/posthog'

export const getDashboardData = traceAction('getDashboardData', async (project, queryParams) => {
  const supabase = await createClient()
  const projectName = typeof project === 'string' ? project : project?.project_name

  const { days, from, to } = queryParams || {}
  
  // Track this server action with PostHog
  const user = await getAuthenticatedUser()
  if (user) {
    posthogServer.capture({
      distinctId: user.email || user.id,
      event: 'server_action_called',
      properties: {
        action_name: 'getDashboardData',
        project: projectName,
        days_range: days
      }
    })
  }
  
  // Compute date range
  const now = new Date()
  let startDate = new Date(now)
  let endDate = new Date(now)
  
  if (from && to) {
    startDate = new Date(from)
    endDate = new Date(to)
  } else {
    const defaultDays = [1, 7].includes(days) ? days : 7
    startDate.setDate(startDate.getDate() - defaultDays)
  }
  
  const startDateStr = startDate.toISOString().split('T')[0] // YYYY-MM-DD
  const endDateStr = endDate.toISOString().split('T')[0]

  // Prior window of equal length (immediately preceding) — for KPI deltas
  const dayMs = 24 * 60 * 60 * 1000
  const windowDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / dayMs) + 1)
  const priorEndDate = new Date(startDate.getTime() - dayMs)
  const priorStartDate = new Date(priorEndDate.getTime() - (windowDays - 1) * dayMs)
  const priorStartStr = priorStartDate.toISOString().split('T')[0]
  const priorEndStr = priorEndDate.toISOString().split('T')[0]

  const buildCasesQuery = (start, end) => {
    let q = supabase
      .from('daily_case_metrics')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
    if (projectName) q = q.eq('project_name', projectName)
    return q
  }
  const buildReviewedQuery = (start, end) => {
    let q = supabase
      .from('daily_reviewed_metrics')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
    if (projectName) q = q.eq('project_name', projectName)
    return q
  }

  // Fire all four queries in parallel
  const [
    { data: casesMetrics, error: casesError },
    { data: reviewedMetrics, error: reviewedError },
    { data: priorCasesMetrics },
    { data: priorReviewedMetrics },
  ] = await Promise.all([
    buildCasesQuery(startDateStr, endDateStr),
    buildReviewedQuery(startDateStr, endDateStr),
    buildCasesQuery(priorStartStr, priorEndStr),
    buildReviewedQuery(priorStartStr, priorEndStr),
  ])

  if (casesError) {
    console.error('Error fetching daily_case_metrics:', casesError)
  }
  if (reviewedError) {
    console.error('Error fetching daily_reviewed_metrics:', reviewedError)
  }

  const casesData = casesMetrics || []
  const reviewedData = reviewedMetrics || []
  const priorCasesData = priorCasesMetrics || []
  const priorReviewedData = priorReviewedMetrics || []

  // Helper to safely parse JSON fields that may arrive as string or object
  const parseJsonField = (field) => {
    if (!field) return {}
    if (typeof field === 'string') {
      try { return JSON.parse(field) } catch { return {} }
    }
    return field
  }

  // =========================================================
  // SECTION 1 — CLIENT ACTION TRACKER
  // =========================================================

  // Aggregate review stats
  let totalReviewed = 0
  let totalSafe = 0
  let totalFlagForTakedown = 0
  let totalTakedown = 0
  // Risk breakdown from reviewed_metrics
  let reviewedRiskSafe = 0, reviewedRiskLow = 0, reviewedRiskMedium = 0, reviewedRiskHigh = 0

  reviewedData.forEach(row => {
    totalReviewed += row.total_reviewed || 0
    const reviewed = parseJsonField(row.reviewed)
    // console.log("Reviewed breakdown for", row.date, reviewed)
    totalSafe += reviewed['no-action'] || 0
    totalFlagForTakedown += reviewed['Flag for Takedown'] || 0
    totalTakedown += reviewed.Takedown || 0
    const risk = parseJsonField(row.risk)
    reviewedRiskSafe += risk.safe || 0
    reviewedRiskLow += risk.low || 0
    reviewedRiskMedium += risk.medium || 0
    reviewedRiskHigh += risk.high || 0
  })

  // Aggregate total cases discovered in window
  let totalCasesDiscovered = 0
  let caseRiskSafe = 0, caseRiskLow = 0, caseRiskMedium = 0, caseRiskHigh = 0

  casesData.forEach(row => {
    totalCasesDiscovered += row.total_cases || 0
    const risk = parseJsonField(row.risk)
    caseRiskSafe += risk.safe || 0
    caseRiskLow += risk.low || 0
    caseRiskMedium += risk.medium || 0
    caseRiskHigh += risk.high || 0
  })

  // Pending cases = total discovered - total reviewed (clamped to 0)
  const totalPending = Math.max(0, totalCasesDiscovered - totalReviewed)

  // ── Prior window aggregates (for KPI deltas) ─────────────
  let priorReviewed = 0
  let priorTakedown = 0
  priorReviewedData.forEach(row => {
    priorReviewed += row.total_reviewed || 0
    const r = parseJsonField(row.reviewed)
    priorTakedown += r.Takedown || 0
  })
  let priorCasesDiscovered = 0
  priorCasesData.forEach(row => {
    priorCasesDiscovered += row.total_cases || 0
  })
  const priorPending = Math.max(0, priorCasesDiscovered - priorReviewed)

  const calcDelta = (curr, prev) => {
    if (prev === 0) return curr === 0 ? 0 : 100
    return Math.round(((curr - prev) / prev) * 1000) / 10
  }

  const deltas = {
    totalReviewed: calcDelta(totalReviewed, priorReviewed),
    totalCasesDiscovered: calcDelta(totalCasesDiscovered, priorCasesDiscovered),
    totalPending: calcDelta(totalPending, priorPending),
    totalTakedown: calcDelta(totalTakedown, priorTakedown),
  }

  // Distribute pending proportionally across risk levels using cases risk ratio
  const caseRiskTotal = caseRiskSafe + caseRiskLow + caseRiskMedium + caseRiskHigh || 1
  const pendingRisk = {
    safe: Math.round((caseRiskSafe / caseRiskTotal) * totalPending),
    low: Math.round((caseRiskLow / caseRiskTotal) * totalPending),
    medium: Math.round((caseRiskMedium / caseRiskTotal) * totalPending),
    high: Math.round((caseRiskHigh / caseRiskTotal) * totalPending),
  }

  // =========================================================
  // SECTION 2 — ANALYTICS (static / grows over time)
  // =========================================================

  // Category Distribution — aggregate all categories from daily_cases_metrics
  const categoryTotals = {}
  casesData.forEach(row => {
    const cats = parseJsonField(row.categories)
    Object.entries(cats).forEach(([cat, count]) => {
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (count || 0)
    })
  })
  const categoryDistribution = Object.entries(categoryTotals)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  // Risk Distribution — from cases data for the full picture
  const RISK_COLORS = {
    high: '#ff0000',    // red
    medium: '#ffaa00',  // orange
    low: '#2c43f5',     // making blue
    safe: '#10b981',    // emerald
  }
  const riskDistribution = [
    { name: 'High', value: caseRiskHigh, fill: RISK_COLORS.high },
    { name: 'Medium', value: caseRiskMedium, fill: RISK_COLORS.medium },
    { name: 'Low', value: caseRiskLow, fill: RISK_COLORS.low },
    { name: 'Safe', value: caseRiskSafe, fill: RISK_COLORS.safe },
  ]

  // Platform Line Chart — cases per platform per date
  // 1. Identify all unique platforms in the result set
  const platformsSet = new Set()
  casesData.forEach(row => {
    const platform = (row.platform || 'unknown').toLowerCase()
    platformsSet.add(platform)
  })
  const platforms = Array.from(platformsSet)

  // 2. Generate all dates in the range [startDate, endDate]
  const platformLineData = []
  const dateCursor = new Date(startDate)
  const endLimit = new Date(endDate)
  endLimit.setHours(23, 59, 59, 999) // include endDate fully

  while (dateCursor <= endLimit) {
    const dateLabel = dateCursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const entry = { date: dateLabel, rawDate: dateCursor.toISOString().split('T')[0] }

    // Initialize all platforms to 0
    platforms.forEach(p => { entry[p] = 0 })
    platformLineData.push(entry)

    dateCursor.setDate(dateCursor.getDate() + 1)
  }

  // 3. Fill in actual data
  casesData.forEach(row => {
    const rowDateStr = new Date(row.date).toISOString().split('T')[0]
    const platform = (row.platform || 'unknown').toLowerCase()

    // Find matching date entry
    const entry = platformLineData.find(d => d.rawDate === rowDateStr)
    if (entry) {
      entry[platform] = (entry[platform] || 0) + (row.total_cases || 0)
    }
  })

  // Clean up rawDate before returning
  platformLineData.forEach(d => delete d.rawDate)

  // Daily Category Line Chart — top N categories per date
  const TOP_N_CATEGORIES = 5
  const topCategoryNames = categoryDistribution.slice(0, TOP_N_CATEGORIES).map(c => c.name)

  const categoryLineData = []
  const catCursor = new Date(startDate)
  const catEndLimit = new Date(endDate)
  catEndLimit.setHours(23, 59, 59, 999)

  while (catCursor <= catEndLimit) {
    const dateLabel = catCursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const entry = { date: dateLabel, rawDate: catCursor.toISOString().split('T')[0] }
    topCategoryNames.forEach(c => { entry[c] = 0 })
    categoryLineData.push(entry)
    catCursor.setDate(catCursor.getDate() + 1)
  }

  casesData.forEach(row => {
    const rowDateStr = new Date(row.date).toISOString().split('T')[0]
    const cats = parseJsonField(row.categories)
    const entry = categoryLineData.find(d => d.rawDate === rowDateStr)
    if (!entry) return
    topCategoryNames.forEach(c => {
      if (cats[c]) entry[c] = (entry[c] || 0) + cats[c]
    })
  })

  categoryLineData.forEach(d => delete d.rawDate)

  const PLATFORM_COLORS = {
    instagram: '#e1306c',
    facebook: '#1877f2',
    x: '#0f172a',
    twitter: '#1da1f2',
    reddit: '#ff4500',
    youtube: '#ff0000',
    website: '#8b5cf6',
    tiktok: '#010101',
    unknown: '#94a3b8',
  }

  return {
    // Date filter context
    days: days || 'custom',
    from: startDateStr,
    to: endDateStr,

    // ---- Section 1: Client Action Tracker ----
    clientTracker: {
      totalReviewed,
      totalSafe,
      totalFlagForTakedown,
      totalTakedown,
      totalPending,
      pendingRisk,
      totalCasesDiscovered,
      deltas,
    },

    // ---- Section 2: Analytics ----
    riskDistribution,
    categoryDistribution,
    categoryLineData,
    topCategoryNames,
    platformLineData,
    platforms,
    platformColors: PLATFORM_COLORS,
    riskColors: RISK_COLORS,
  }
})

export const getUser = traceAction('getUser', cache(async () => {
  const user = await getAuthenticatedUser()

  if (!user) return { user: null, clientDetails: null }

  const supabase = await createClient()
  const { data: clientDetails, error } = await supabase
    .from('client_details')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching client details:', error)
    return { user, clientDetails: null }
  }

  return { user, clientDetails }
}))

export const getClientandProjectDetails = traceAction('getClientandProjectDetails', cache(async () => {
  const user = await getAuthenticatedUser()

  if (!user) return null

  const supabase = await createClient()

  // Combine fetching client details and project details into a single query using a JOIN
  // This significantly reduces latency by avoiding sequential network round-trips.
  const { data: clientDetails, error } = await supabase
    .from('client_details')
    .select('*, project:project_name(*)')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Error fetching client/project details:', error)
    return { user, clientDetails: null, project: null }
  }

  // Extract project from the JOINed result and normalize
  const project = clientDetails.project

  return {
    user,
    clientDetails: { ...clientDetails, project: undefined }, // Clean up JOINed field if necessary
    project
  }
}))

export const getCases = traceAction('getCases', async (projectName) => {
  const supabase = await createClient()

  let query = supabase
    .from('cases_metadata')
    .select('*')
    .order('created_at', { ascending: false })

  if (projectName) {
    query = query.eq('project_name', projectName)
  }

  const { data: cases, error } = await query

  if (error) {
    console.error('Error fetching cases:', error)
    return []
  }

  // Process cases with signed URLs
  const processedCases = await Promise.all(cases.map(async (c) => {
    const signedUrl = c.image_key ? await getSignedImageUrl(c.image_key) : null

    return {
      ...c,
      signedImageUrl: signedUrl
    }
  }))

  return processedCases
})
