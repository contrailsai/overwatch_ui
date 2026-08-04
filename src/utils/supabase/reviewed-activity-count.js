import { resolveClientStatusForUi } from '@/utils/mongodb/v3-schema'

function getPostClientStatus(post) {
  return resolveClientStatusForUi(post)
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

/** Net reviewed-case activity count for client_logs / meta_stats (matches daily_reviewed_metrics batch). */
export function countReviewedCaseActivityDelta(posts, targetStatus) {
  if (!posts?.length) return 0

  let total = 0
  for (const post of posts) {
    const platform = post?.platform?.toLowerCase() || 'unknown'
    const currentReviewData = {
      risk_score: post.review_details?.threat_score || 0,
      client_status: targetStatus,
      platform,
    }
    const previousReviewData = (() => {
      const previousStatus = getPostClientStatus(post)
      if (!previousStatus || previousStatus === 'To Be Reviewed') return null
      return {
        risk_score: post.review_details?.threat_score || post.list?.review_threat_score || 0,
        client_status: previousStatus,
        platform,
      }
    })()

    total += computeClientReviewedDeltas(currentReviewData, previousReviewData).totalDelta
  }

  return total
}
