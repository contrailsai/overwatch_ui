'use client'

import { getTopicForPost, getTopicsForPosts } from '@/lib/feeds/topic-membership-actions'

const cache = new Map()
/** postId -> Promise<topic|null> */
const inflight = new Map()

export function getCachedTopicForPost(postId) {
  if (!postId) return undefined
  return cache.get(String(postId))
}

export function setCachedTopicForPost(postId, topic) {
  if (!postId) return
  cache.set(String(postId), topic ?? null)
}

export async function fetchTopicForPost(postId, { force = false } = {}) {
  const key = String(postId)
  if (!key) return null
  if (!force && cache.has(key)) return cache.get(key)

  const pending = inflight.get(key)
  if (pending) return pending

  const promise = getTopicForPost(key)
    .then((res) => {
      if (res?.success) {
        const topic = res.topic ?? null
        cache.set(key, topic)
        return topic
      }
      throw new Error(res?.error || 'Failed to load topic.')
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}

/** Populate cache for visible posts — single batch server action. */
export async function warmTopicCacheForPosts(postIds) {
  const missing = [...new Set((postIds || []).map(String).filter(Boolean))]
    .filter((id) => !cache.has(id) && !inflight.has(id))

  if (missing.length === 0) return

  const batchPromise = getTopicsForPosts(missing)
    .then((res) => {
      if (res?.success) {
        for (const id of missing) {
          cache.set(id, res.topicsByPostId?.[id] ?? null)
        }
      }
      return res
    })
    .finally(() => {
      for (const id of missing) {
        inflight.delete(id)
      }
    })

  for (const id of missing) {
    inflight.set(id, batchPromise.then(() => cache.get(id) ?? null))
  }

  return batchPromise
}

/** Prefetch neighbors without blocking UI. */
export function prefetchTopicsForPosts(postIds) {
  void warmTopicCacheForPosts(postIds)
}
