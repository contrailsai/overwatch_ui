'use server'

import { cache } from 'react'
import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { traceAction } from '@/utils/tracing'

export const getDashboardData = traceAction('getDashboardData', async (project, days = 30) => {
  const supabase = await createClient()
  const projectName = typeof project === 'string' ? project : project?.project_name

  // Compute date range
  const now = new Date()
  const startDate = new Date(now)
  startDate.setDate(startDate.getDate() - days)
  const startDateStr = startDate.toISOString().split('T')[0] // YYYY-MM-DD

  // 1. Fetch daily_cases_metrics (total cases discovered, risk & category breakdowns)
  let casesQuery = supabase
    .from('daily_case_metrics')
    .select('*')
    .gte('date', startDateStr)
    .order('date', { ascending: true })

  if (projectName) {
    casesQuery = casesQuery.eq('project_name', projectName)
  }

  const { data: casesMetrics, error: casesError } = await casesQuery

  if (casesError) {
    console.error('Error fetching daily_case_metrics:', casesError)
  }

  // 2. Fetch daily_reviewed_metrics (what the client has reviewed)
  let reviewedQuery = supabase
    .from('daily_reviewed_metrics')
    .select('*')
    .gte('date', startDateStr)
    .order('date', { ascending: true })

  if (projectName) {
    reviewedQuery = reviewedQuery.eq('project_name', projectName)
  }

  const { data: reviewedMetrics, error: reviewedError } = await reviewedQuery

  if (reviewedError) {
    console.error('Error fetching daily_reviewed_metrics:', reviewedError)
  }

  const casesData = casesMetrics || []
  const reviewedData = reviewedMetrics || []

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
  let totalPass = 0
  let totalFlagForTakedown = 0
  let totalTakedown = 0
  // Risk breakdown from reviewed_metrics
  let reviewedRiskSafe = 0, reviewedRiskLow = 0, reviewedRiskMedium = 0, reviewedRiskHigh = 0

  reviewedData.forEach(row => {
    totalReviewed += row.total_reviewed || 0
    const reviewed = parseJsonField(row.reviewed)
    totalPass += reviewed.pass || 0
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
    high: '#f43f5e',    // rose-500
    medium: '#f97316',  // orange-500
    low: '#f59e0b',     // amber-500
    safe: '#64748b',    // slate-500
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

  // 2. Generate all dates in the range [startDate, now]
  const platformLineData = []
  const dateCursor = new Date(startDate)
  const today = new Date()
  today.setHours(23, 59, 59, 999) // include today fully

  while (dateCursor <= today) {
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

  const PLATFORM_COLORS = {
    instagram: '#e1306c',
    facebook: '#1877f2',
    x: '#0f172a',
    twitter: '#1da1f2',
    youtube: '#ff0000',
    website: '#8b5cf6',
    tiktok: '#010101',
    unknown: '#94a3b8',
  }

  return {
    // Date filter context
    days,

    // ---- Section 1: Client Action Tracker ----
    clientTracker: {
      totalReviewed,
      totalPass,
      totalFlagForTakedown,
      totalTakedown,
      totalPending,
      pendingRisk,
      totalCasesDiscovered,
    },

    // ---- Section 2: Analytics ----
    riskDistribution,
    categoryDistribution,
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
