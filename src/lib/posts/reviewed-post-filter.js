/** Posts eligible for cases list, report ordering, and export pipelines. */
export const REVIEWED_THREAT_SCORE_FILTER = {
  'workflow.review_status': 'reviewed',
}

/** Profiles shown on the client Profiles list / Posts Nexus profile hubs.
 *  Both must hold: reviewed in review-profiles, and at least one reviewed post. */
export const CLIENT_VISIBLE_PROFILE_FILTER = {
  $and: [
    { 'workflow.review_status': 'reviewed' },
    { 'list.reviewed_post_count': { $gt: 0 } },
  ],
}

export function withReviewedThreatScoreFilter(query = {}) {
  return {
    ...query,
    $and: [
      ...(query.$and || []),
      {
        $or: [
          { 'workflow.review_status': 'reviewed' },
          { 'list.review_threat_score': { $exists: true, $ne: null } },
        ],
      },
    ],
  }
}

/** Human profile review submitted from review-profiles. */
export function isProfileReviewed(profile) {
  return profile?.workflow?.review_status === 'reviewed'
}

function violationName(item) {
  if (!item) return ''
  if (typeof item === 'string') return item.trim()
  return String(item.name || item.label || '').trim()
}

/**
 * Unique project-label violations from posts already reviewed.
 * Excludes "safe". Names match project labels so checkboxes line up.
 */
export function unionViolationsFromReviewedPosts(posts = [], labels = []) {
  const canonical = new Map()
  for (const label of labels || []) {
    const name = typeof label === 'string' ? label.trim() : String(label?.name || '').trim()
    if (name) canonical.set(name.toLowerCase(), name)
  }

  const seen = new Set()
  const out = []
  for (const post of posts) {
    if (post?.workflow?.review_status !== 'reviewed') continue
    const lists = [
      post?.review_details?.threat_types,
      post?.review_details?.violations,
      post?.list?.threat_types,
      post?.list?.violation_flags,
    ]
    for (const list of lists) {
      if (!Array.isArray(list)) continue
      for (const item of list) {
        const name = violationName(item)
        const key = name.toLowerCase()
        if (!name || key === 'safe' || seen.has(key)) continue
        if (canonical.size > 0 && !canonical.has(key)) continue
        seen.add(key)
        out.push(canonical.get(key) || name)
      }
    }
  }
  return out
}

export function isPendingReviewCase(post) {
  return post?.workflow?.review_status === 'pending'
    || post?.list?.review_threat_score == null
}

export function getCaseInspectHref(postId, { pending }) {
  return pending ? `/review-cases/${postId}` : `/cases/${postId}`
}
