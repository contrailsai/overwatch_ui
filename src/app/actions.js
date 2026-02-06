'use server'

import { createClient } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { getSignedImageUrl } from '@/utils/aws/s3'

export async function getDashboardData() {
  const supabase = await createClient()

  // 1. Fetch daily_metrics with date ordering
  const { data: dailyMetrics, error: metricsError } = await supabase
    .from('daily_metrics')
    .select('*')
    .order('date', { ascending: true })

  if (metricsError) {
    console.error('Error fetching daily metrics:', metricsError)
  }

  // 2. Fetch Takedown Cases with all details
  const { data: takedownCases, error: takedownsError } = await supabase
    .from('takedown_cases')
    .select('*')

  if (takedownsError) {
    console.error('Error fetching takedown cases:', takedownsError)
  }

  // 3. Fetch Total Posts from MongoDB
  let totalPosts = 0
  let recentPosts = []
  try {
    const client = await clientPromise
    const db = client.db(process.env.MONGO_DB_NAME)
    const collection = db.collection('Posts')

    totalPosts = await collection.countDocuments({})

    // Get recent 10 posts for quick view
    const posts = await collection.find({})
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
        code: post.code,
        platform: post.platform || 'instagram',
        caption: post.caption || post.content || '',
        username: post.user?.username || post.author?.username || post.author?.name || 'Unknown',
        taken_at: normalizedTimestamp,
        signedImageUrl: signedUrl,
        threat_type: 'pending',
        threat_score: null
      }
    }))
  } catch (e) {
    console.error('MongoDB Error:', e)
  }

  // --- Data Processing ---
  const metricsData = dailyMetrics || []
  const takedownsData = takedownCases || []

  // === Summary Metrics ===
  const totalReviewed = metricsData.reduce((acc, curr) => acc + (curr.total_reviewed || 0), 0)
  const totalSafe = metricsData.reduce((acc, curr) => acc + (curr.threat_safe_count || 0), 0)
  const totalRiskHigh = metricsData.reduce((acc, curr) => acc + (curr.risk_high_count || 0), 0)
  const totalRiskMedium = metricsData.reduce((acc, curr) => acc + (curr.risk_medium_count || 0), 0)
  const totalRiskLow = metricsData.reduce((acc, curr) => acc + (curr.risk_low_count || 0), 0)
  const totalRiskSafe = metricsData.reduce((acc, curr) => acc + (curr.risk_safe_count || 0), 0)

  const totalThreats = totalReviewed - totalSafe
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
    { name: 'High Risk', value: totalRiskHigh, color: '#f87171', fill: '#f87171' }, // Red 400
    { name: 'Medium Risk', value: totalRiskMedium, color: '#fbbf24', fill: '#fbbf24' }, // Amber 400
    { name: 'Low Risk', value: totalRiskLow, color: '#fcd34d', fill: '#fcd34d' }, // Amber 300
    { name: 'Safe', value: totalRiskSafe, color: '#4fd1c5', fill: '#4fd1c5' } // Teal 300
  ]

  // === Threat Type Distribution ===
  const threatTypeDistribution = [
    { name: 'Scam', value: metricsData.reduce((acc, curr) => acc + (curr.threat_scam_count || 0), 0), fill: '#818cf8' }, // Indigo 400
    { name: 'Hate Speech', value: metricsData.reduce((acc, curr) => acc + (curr.threat_hate_speech_count || 0), 0), fill: '#94a3b8' }, // Slate 400
    { name: 'Fake News', value: metricsData.reduce((acc, curr) => acc + (curr.threat_fake_news_count || 0), 0), fill: '#64748b' }, // Slate 500
    { name: 'NSFW', value: metricsData.reduce((acc, curr) => acc + (curr.threat_nsfw_count || 0), 0), fill: '#475569' }, // Slate 600
    { name: 'AIGC', value: metricsData.reduce((acc, curr) => acc + (curr.threat_aigc_count || 0), 0), fill: '#334155' }, // Slate 700
    { name: 'Other', value: metricsData.reduce((acc, curr) => acc + (curr.threat_other_count || 0), 0), fill: '#1e293b' } // Slate 800
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
    platformMetrics[platform].reviewed += (row.total_reviewed || 0)
    platformMetrics[platform].threats += ((row.total_reviewed || 0) - (row.threat_safe_count || 0))
    platformMetrics[platform].takedowns += (row.takedowns_initiated || 0)
  })
  const platformDistribution = Object.values(platformMetrics)

  // === Daily Trends (last 30 days) ===
  const dailyTrends = metricsData.slice(-30).map(row => {
    const dateObj = new Date(row.date)
    return {
      date: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullDate: row.date,
      reviewed: row.total_reviewed || 0,
      threats: (row.total_reviewed || 0) - (row.threat_safe_count || 0),
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
    recentPosts: recentPosts
  }
}

export async function getCases() {
  const supabase = await createClient()

  const { data: cases, error } = await supabase
    .from('cases_metadata')
    .select('*')
    .order('created_at', { ascending: false })

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
}
