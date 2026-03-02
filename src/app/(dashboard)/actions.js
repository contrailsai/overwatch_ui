'use server'

import { cache } from 'react'
import { createClient, getAuthenticatedUser } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { traceAction } from '@/utils/tracing'

export const getDashboardData = traceAction('getDashboardData', async (projectName) => {
  const supabase = await createClient()

  // 1. Fetch daily_metrics with date ordering
  let query = supabase
    .from('daily_metrics')
    .select('*')
    .order('date', { ascending: true })

  if (projectName) {
    query = query.eq('project_name', projectName)
  }

  const { data: dailyMetrics, error: metricsError } = await query

  if (metricsError) {
    console.error('Error fetching daily metrics:', metricsError)
  }

  // 2. Fetch Takedown Cases with all details
  let takedownQuery = supabase
    .from('takedown_cases')
    .select('*')

  if (projectName) {
    takedownQuery = takedownQuery.eq('project_name', projectName)
  }

  const { data: takedownCases, error: takedownsError } = await takedownQuery

  if (takedownsError) {
    console.error('Error fetching takedown cases:', takedownsError)
  }

  // 3. Fetch Total Posts from MongoDB
  let totalPosts = 0
  let recentPosts = []
  let projectDetails = { showTakedowns: true }

  try {
    let dbName = process.env.MONGO_DB_NAME

    // Fetch project-specific details
    if (projectName) {
      const { data: projectData } = await supabase
        .from('project')
        .select('mongo_db_map, project_details')
        .eq('project_name', projectName)
        .single()

      if (projectData?.mongo_db_map) {
        dbName = projectData.mongo_db_map
      }

      if (projectData?.project_details) {
        try {
          const details = typeof projectData.project_details === 'string'
            ? JSON.parse(projectData.project_details)
            : projectData.project_details

          if (details.do_takedowns === false) {
            projectDetails.showTakedowns = false
          }
          projectDetails.description = details.description
        } catch (parseError) {
          console.error('Error parsing project_details:', parseError)
        }
      }
    }

    const client = await clientPromise
    const db = client.db(dbName)
    const collection = db.collection('Posts')
    const filters = {}

    totalPosts = await collection.countDocuments(filters)

    // Get recent 10 processed posts for quick view
    const posts = await collection.find({ processed: true })
      .sort({ taken_at: -1, timestamp: -1 })
      .limit(10)
      .toArray()

    // Process posts with signed URLs
    recentPosts = await Promise.all(posts.map(async (post) => {
      let s3UrlToSign = post.s3_url || post.media_urls?.[0]?.thumbnail_s3_url || post.media_urls?.[0]?.s3_url
      const signedUrl = s3UrlToSign ? await getSignedImageUrl(s3UrlToSign) : null

      const timestamp = post.taken_at || post.timestamp
      const normalizedTimestamp = typeof timestamp === 'string' ?
        Math.floor(new Date(timestamp).getTime() / 1000) : timestamp

      return {
        _id: post._id.toString(),
        code: post.code || post.post_id,
        platform: post.platform || 'instagram',
        caption: post.post_content?.caption || post.caption || post.content || '',
        username: post.profile?.username || post.user?.username || post.author?.username || post.author?.name || 'Unknown',
        taken_at: normalizedTimestamp,
        signedImageUrl: signedUrl,
        threat_type: post.review_details?.primary_threat_type || 'pending',
        threat_score: post.review_details?.threat_score || null
      }
    }))
  } catch (e) {
    console.error('MongoDB Error:', e)
  }

  // --- Data Processing ---
  const metricsData = dailyMetrics || []
  const takedownsData = takedownCases || []

  // === Summary Metrics ===
  const totalRiskHigh = metricsData.reduce((acc, curr) => acc + (curr.risk_high_count || 0), 0)
  const totalRiskMedium = metricsData.reduce((acc, curr) => acc + (curr.risk_medium_count || 0), 0)
  const totalRiskLow = metricsData.reduce((acc, curr) => acc + (curr.risk_low_count || 0), 0)
  const totalRiskSafe = metricsData.reduce((acc, curr) => acc + (curr.risk_safe_count || 0), 0)

  // Calculate totalReviewed and totalThreats by summing risk buckets 
  // This is more robust than relying on 'total_reviewed' which might be misaligned in DB
  const totalReviewed = totalRiskHigh + totalRiskMedium + totalRiskLow + totalRiskSafe
  const totalThreats = totalRiskHigh + totalRiskMedium + totalRiskLow
  const totalTakedownsInitiated = metricsData.reduce((acc, curr) => acc + (curr.takedowns_initiated || 0), 0)

  // Takedown Status Counts
  const takedownsByStatus = {
    initiated: takedownsData.filter(c => c.status === 'initiated').length,
    email_sent: takedownsData.filter(c => c.email_sent && c.status !== 'resolved').length,
    platform_replied: takedownsData.filter(c => c.platform_replied && c.status !== 'resolved').length,
    resolved: takedownsData.filter(c => c.status === 'resolved').length,
    rejected: takedownsData.filter(c => c.status === 'rejected').length,
  }

  const activeTakedowns = takedownsByStatus.initiated + takedownsByStatus.email_sent + takedownsByStatus.platform_replied
  const completedTakedowns = takedownsByStatus.resolved + takedownsByStatus.rejected

  // === Risk Distribution ===
  const riskDistribution = [
    { name: 'High Risk', value: totalRiskHigh, color: '#f43f5e', fill: '#f43f5e' }, // Rose 500
    { name: 'Medium Risk', value: totalRiskMedium, color: '#f97316', fill: '#f97316' }, // Orange 500
    { name: 'Low Risk', value: totalRiskLow, color: '#f59e0b', fill: '#f59e0b' }, // Amber 500
    { name: 'Safe', value: totalRiskSafe, color: '#64748b', fill: '#64748b' } // Slate 500
  ]


  // === Threat Type Distribution ===
  const threatTypeDistribution = [
    { name: 'Scam', value: metricsData.reduce((acc, curr) => acc + (curr.threat_scam_count || 0), 0), fill: '#fecdd3' },        // Rose 200
    { name: 'Hate Speech', value: metricsData.reduce((acc, curr) => acc + (curr.threat_hate_speech_count || 0), 0), fill: '#ddd6fe' }, // Violet 200
    { name: 'Fake News', value: metricsData.reduce((acc, curr) => acc + (curr.threat_fake_news_count || 0), 0), fill: '#bae6fd' },    // Sky 200
    { name: 'NSFW', value: metricsData.reduce((acc, curr) => acc + (curr.threat_nsfw_count || 0), 0), fill: '#fde68a' },         // Amber 200
    { name: 'AIGC', value: metricsData.reduce((acc, curr) => acc + (curr.threat_aigc_count || 0), 0), fill: '#a7f3d0' },         // Emerald 200
    { name: 'Other', value: metricsData.reduce((acc, curr) => acc + (curr.threat_other_count || 0), 0), fill: '#e2e8f0' }        // Slate 200
  ]

  // === Platform Distribution ===
  const platformMetrics = {}
  metricsData.forEach(row => {
    const platform = row.platform || 'unknown'
    if (!platformMetrics[platform]) {
      platformMetrics[platform] = {
        platform,
        reviewed: 0,
        threats: 0,
        takedowns: 0
      }
    }
    platformMetrics[platform].reviewed += ((row.risk_high_count || 0) + (row.risk_medium_count || 0) + (row.risk_low_count || 0) + (row.risk_safe_count || 0))
    platformMetrics[platform].threats += ((row.risk_high_count || 0) + (row.risk_medium_count || 0) + (row.risk_low_count || 0))
    platformMetrics[platform].takedowns += (row.takedowns_initiated || 0)
  })
  const platformDistribution = Object.values(platformMetrics)

  // === Daily Trends (last 30 days) ===
  const dailyTrends = metricsData.slice(-30).map(row => {
    const dateObj = new Date(row.date)
    return {
      date: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullDate: row.date,
      reviewed: (row.risk_high_count || 0) + (row.risk_medium_count || 0) + (row.risk_low_count || 0) + (row.risk_safe_count || 0),
      threats: (row.risk_high_count || 0) + (row.risk_medium_count || 0) + (row.risk_low_count || 0),
      highRisk: row.risk_high_count || 0,
      mediumRisk: row.risk_medium_count || 0,
      lowRisk: row.risk_low_count || 0,
      takedowns: row.takedowns_initiated || 0,
      platform: row.platform
    }
  })

  // Group daily trends by date (aggregate platforms)
  const dailyTrendsMap = {}
  dailyTrends.forEach(day => {
    if (!dailyTrendsMap[day.date]) {
      dailyTrendsMap[day.date] = {
        date: day.date,
        reviewed: 0,
        threats: 0,
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: 0,
        takedowns: 0
      }
    }
    dailyTrendsMap[day.date].reviewed += day.reviewed
    dailyTrendsMap[day.date].threats += day.threats
    dailyTrendsMap[day.date].highRisk += day.highRisk
    dailyTrendsMap[day.date].mediumRisk += day.mediumRisk
    dailyTrendsMap[day.date].lowRisk += day.lowRisk
    dailyTrendsMap[day.date].takedowns += day.takedowns
  })
  const aggregatedDailyTrends = Object.values(dailyTrendsMap)

  // === Takedown Funnel Data ===
  const takedownFunnel = [
    { stage: 'Initiated', count: takedownsByStatus.initiated, fill: '#818cf8' }, // Indigo 400
    { stage: 'Email Sent', count: takedownsByStatus.email_sent, fill: '#94a3b8' }, // Slate 400
    { stage: 'Platform Replied', count: takedownsByStatus.platform_replied, fill: '#64748b' }, // Slate 500
    { stage: 'Resolved', count: takedownsByStatus.resolved, fill: '#4fd1c5' }, // Teal 300
  ]

  return {
    // Summary Cards
    summary: {
      totalPosts,
      totalReviewed,
      totalThreats,
      totalTakedownsInitiated,
      activeTakedowns,
      completedTakedowns,
      threatDetectionRate: totalReviewed > 0 ? ((totalThreats / totalReviewed) * 100).toFixed(1) : 0,
      takedownSuccessRate: (takedownsByStatus.resolved + takedownsByStatus.rejected) > 0
        ? ((takedownsByStatus.resolved / (takedownsByStatus.resolved + takedownsByStatus.rejected)) * 100).toFixed(1)
        : 0
    },

    // Chart Data
    riskDistribution,
    threatTypeDistribution,
    platformDistribution,
    dailyTrends: aggregatedDailyTrends,
    takedownFunnel,
    takedownsByStatus,

    // Recent posts for quick view
    recentPosts: recentPosts,

    // Project Details for UI logic
    projectDetails
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
