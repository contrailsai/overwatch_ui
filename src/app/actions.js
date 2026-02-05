'use server'

import { createClient } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { getSignedImageUrl } from '@/utils/aws/s3'

export async function getDashboardData() {
  const supabase = await createClient()

  // 1. Fetch Aggregated Metrics from daily_metrics
  const { data: dailyMetrics, error: metricsError } = await supabase
    .from('daily_metrics')
    .select('*')
    .order('date', { ascending: true })

  if (metricsError) {
    console.error('Error fetching daily metrics:', metricsError)
  }

  // 2. Fetch Takedown Cases for Status Counts
  const { data: takedownCases, error: takedownsError } = await supabase
    .from('takedown_cases')
    .select('status')

  if (takedownsError) {
    console.error('Error fetching takedown cases:', takedownsError)
  }

  // 3. Fetch Total Posts from MongoDB (existing logic)
  let totalPosts = 0
  let recentPosts = []
  try {
    const client = await clientPromise
    const db = client.db(process.env.MONGO_DB_NAME)
    const collection = db.collection('Posts')

    totalPosts = await collection.countDocuments({})

    // Get recent 30 posts for the table
    const posts = await collection.find({})
      .sort({ taken_at: -1, timestamp: -1 })
      .limit(30)
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
        threat_type: 'pending', // Default for unreviewed
        threat_score: null
      }
    }))
  } catch (e) {
    console.error('MongoDB Error:', e)
  }

  // --- Aggregation Logic ---

  const metricsData = dailyMetrics || []
  const takedownsData = takedownCases || []

  // Calculate Totals using daily_metrics
  // Total Reviewed = sum(total_reviewed)
  // Total Threats = sum(all reviewed) - sum(safe)
  const totalReviewed = metricsData.reduce((acc, curr) => acc + (curr.total_reviewed || 0), 0)
  const totalSafe = metricsData.reduce((acc, curr) => acc + (curr.threat_safe_count || 0), 0)
  const totalThreats = totalReviewed - totalSafe

  // Calculate Takedown Statuses using takedown_cases
  const activeTakedowns = takedownsData.filter(c =>
    ['initiated', 'processing'].includes(c.status)
  ).length
  const completedTakedowns = takedownsData.filter(c =>
    ['resolved', 'rejected'].includes(c.status) // treating rejected as completed/closed
  ).length

  // Metric Object
  const metrics = {
    totalPosts, // From MongoDB
    totalThreats,
    activeTakedowns,
    completedTakedowns
  }

  // Threats By Type (sum from daily_metrics)
  const threatTypesStart = {
    scam: 0,
    hate_speech: 0,
    violence: 0,
    fake_news: 0,
    nsfw: 0,
    other: 0
  }

  const threatCounts = metricsData.reduce((acc, curr) => {
    acc.scam += (curr.threat_scam_count || 0)
    acc.hate_speech += (curr.threat_hate_speech_count || 0)
    acc.violence += (curr.threat_violence_count || 0)
    acc.fake_news += (curr.threat_fake_news_count || 0)
    acc.nsfw += (curr.threat_nsfw_count || 0)
    acc.other += (curr.threat_other_count || 0)
    return acc
  }, threatTypesStart)

  const threatsByType = Object.entries(threatCounts).map(([name, value]) => ({
    name: name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()), // proper case
    value
  }))

  // Platform Trends (group by date)
  const trendsMap = {}

  metricsData.forEach(row => {
    const dateStr = new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (!trendsMap[dateStr]) {
      trendsMap[dateStr] = { date: dateStr, instagram: 0, facebook: 0, x: 0 }
    }
    const threatsCount = (row.total_reviewed || 0) - (row.threat_safe_count || 0)
    const platform = (row.platform || 'other').toLowerCase()

    if (trendsMap[dateStr][platform] !== undefined) {
      trendsMap[dateStr][platform] += threatsCount
    }
  })

  const platformTrends = Object.values(trendsMap)

  // Content Distribution
  const contentDistribution = [
    { name: 'Total Content', value: totalPosts, fill: '#3b82f6' },
    { name: 'Threats', value: totalThreats, fill: '#f59e0b' },
    { name: 'Takedowns', value: takedownsData.length, fill: '#ef4444' }
  ]

  // Threats by Category and Platform
  const threatCategories = ['scam', 'hate_speech', 'violence', 'fake_news', 'nsfw', 'other']
  const threatsByPlatformMap = {} // Key: category

  threatCategories.forEach(cat => {
    threatsByPlatformMap[cat] = {
      category: cat.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      instagram: 0,
      facebook: 0,
      x: 0
    }
  })

  metricsData.forEach(row => {
    const platform = (row.platform || 'other').toLowerCase()

    threatCategories.forEach(cat => {
      const colName = `threat_${cat}_count`
      const val = row[colName] || 0

      if (threatsByPlatformMap[cat]) {
        if (threatsByPlatformMap[cat][platform] !== undefined) {
          threatsByPlatformMap[cat][platform] += val
        }
      }
    })
  })

  const threatsByPlatform = Object.values(threatsByPlatformMap)

  return {
    metrics,
    threatsByType,
    platformTrends,
    contentDistribution,
    threatsByPlatform,
    recentCases: recentPosts
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
