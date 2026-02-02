'use server'

import { createClient } from '@/utils/supabase/server'
import clientPromise from '@/utils/mongodb/client'
import { getSignedImageUrl } from '@/utils/aws/s3'

export async function getDashboardData() {
  const supabase = await createClient()

  // Fetch all cases from Supabase
  const { data: cases, error } = await supabase
    .from('cases_metadata')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching dashboard data:', error)
    return {
      metrics: { totalPosts: 0, totalThreats: 0, activeTakedowns: 0, completedTakedowns: 0 },
      threatsByType: [],
      platformTrends: [],
      contentDistribution: [],
      threatsByPlatform: [],
      recentCases: []
    }
  }

  // Fetch total posts count from MongoDB
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

  // Calculate Metrics
  const totalThreats = cases.length
  const activeTakedowns = cases.filter(c =>
    c.is_in_takedown && c.takedown_status !== 'completed'
  ).length
  const completedTakedowns = cases.filter(c =>
    c.is_in_takedown && c.takedown_status === 'completed'
  ).length

  // Threat Distribution by Type
  const threatCounts = cases.reduce((acc, curr) => {
    const type = curr.threat_type || 'Unknown'
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {})

  const threatsByType = Object.entries(threatCounts).map(([name, value]) => ({
    name,
    value
  }))

  // Platform Trends (threats over time by platform)
  const platformData = cases.reduce((acc, curr) => {
    const platform = curr.platform || 'instagram'
    const date = new Date(curr.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    if (!acc[date]) {
      acc[date] = { date, instagram: 0, facebook: 0, x: 0 }
    }
    acc[date][platform] = (acc[date][platform] || 0) + 1
    return acc
  }, {})

  const platformTrends = Object.values(platformData).slice(-14) // Last 14 days

  // Content Distribution (total content : threats : takedowns)
  const totalContent = totalPosts
  const threats = totalThreats
  const takedowns = cases.filter(c => c.is_in_takedown).length

  const contentDistribution = [
    { name: 'Total Content', value: totalContent, fill: '#3b82f6' },
    { name: 'Threats', value: threats, fill: '#f59e0b' },
    { name: 'Takedowns', value: takedowns, fill: '#ef4444' }
  ]

  // Threats by Category and Platform
  const categoryPlatformData = cases.reduce((acc, curr) => {
    const category = curr.threat_type || 'other'
    const platform = curr.platform || 'instagram'

    const key = category
    if (!acc[key]) {
      acc[key] = { category, instagram: 0, facebook: 0, x: 0 }
    }
    acc[key][platform] = (acc[key][platform] || 0) + 1
    return acc
  }, {})

  const threatsByPlatform = Object.values(categoryPlatformData)

  return {
    metrics: {
      totalPosts,
      totalThreats,
      activeTakedowns,
      completedTakedowns
    },
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
