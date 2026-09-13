'use server'

import { ObjectId } from 'mongodb'
import clientPromise from '@/utils/mongodb/client'
import { requireAuthContext } from '@/utils/auth-context'
import { logActionError, LOKI_STREAMS } from '@/utils/otel-logger'
import {
  adsCollection,
  adProfilesCollection,
  domainsCollection,
  postsCollection,
  profilesCollection,
  topicsCollection,
  poisCollection,
} from '@/utils/mongodb/collections'
import { buildPoiTopicsGraph } from '@/lib/feeds/build-poi-topics-graph'
import { parentPoiFilter, normalizePoiNameKey } from '@/lib/pois/poi-helpers'
import {
  buildParentTopicTreeGraph,
  buildProfileHubsGraph,
  buildPoiCategoryGraph,
  buildAdProfileGraph,
  buildDomainAdsGraph,
  fetchPostLeafStubsForTopics,
  fetchPostLeafStubsForProfiles,
  fetchPostLeafStubsForPois,
  fetchAdLeafStubsForProfiles,
  fetchAdLeafStubsForDomains,
  fetchAdLeafStubsByIds,
  buildReviewedPostsMatchForPois,
  summarizeReviewedPoiMentions,
  toObjectIds,
  DEFAULT_LEAF_CAP_PER_PARENT,
} from '@/lib/nexus/queries'
import { getSignedImageUrl } from '@/utils/aws/s3'
import { normalizeS3Post } from '@/lib/posts/pipeline-helpers'
import { normalizeAdForUi } from '@/lib/ads/ad-helpers'
import {
  buildFeedPostsFacetPipeline,
  resolveFeedAdObjectIds,
} from '@/lib/feeds/resolve-feed-posts'
import { FEEDS_COLLECTION } from '@/lib/feeds/feed-schema'
import {
  CLIENT_VISIBLE_AD_PROFILE_FILTER,
  REVIEWED_ADS_FILTER,
} from '@/lib/ads/reviewed-ad-filter'
import { REVIEWED_DOMAINS_FILTER } from '@/lib/domains/domain-helpers'
import {
  CLIENT_VISIBLE_PROFILE_FILTER,
} from '@/lib/posts/reviewed-post-filter'
import { FAMILY_PALETTE, orderColorKeys } from '@/lib/nexus/colors'
import { NODE_TYPES, emptyNexusGraph, fromPoiTopicsGraph } from '@/lib/nexus/schema'
import { parsePoiNexusId, poiCategoryLabel, poiCategorySlugsForHub } from '@/lib/nexus/poi-categories'
import { serializeForClient } from '@/utils/mongodb/v3-schema'

const LOG = { loki_stream: LOKI_STREAMS.cases }

async function getDb() {
  const { dbName } = await requireAuthContext()
  const client = await clientPromise
  return client.db(dbName)
}

/** L1 — Feeds / POI→Topics structural graph (canonical nexus contract). */
export async function getFeedsNexusGraph() {
  try {
    const db = await getDb()
    const [topics, pois] = await Promise.all([
      topicsCollection(db)
        .find(
          {},
          {
            projection: {
              _id: 1,
              topic_id: 1,
              title: 1,
              category: 1,
              type: 1,
              status: 1,
              parent_topic_id: 1,
              post_count: 1,
              poi_names: 1,
            },
          }
        )
        .toArray(),
      poisCollection(db)
        .find(parentPoiFilter(), { projection: { display_name: 1, name: 1, post_count: 1 } })
        .toArray(),
    ])
    return serializeForClient(fromPoiTopicsGraph(buildPoiTopicsGraph({ topics, pois })))
  } catch (e) {
    logActionError({ ...LOG, app_action: 'getFeedsNexusGraph', message: 'failed' }, e)
    return serializeForClient(fromPoiTopicsGraph(buildPoiTopicsGraph({ topics: [], pois: [] })))
  }
}

/** L2 — leaf stubs for topic clusters (posts). */
export async function getNexusLeafStubs({
  preset = 'feeds-poi-topics',
  parentIds = [],
  filters = {},
  cap = DEFAULT_LEAF_CAP_PER_PARENT,
  labels,
} = {}) {
  try {
    const db = await getDb()
    const ids = (parentIds || []).map(String).filter(Boolean)
    if (!ids.length) return { clusters: [], colorAxis: { keys: [] } }

    if (preset === 'posts-poi-categories') {
      return fetchPostLeafStubsForPois(
        poisCollection(db),
        postsCollection(db),
        ids,
        { cap, labels }
      )
    }

    if (preset === 'feeds-poi-topics' || preset === 'posts-parent-topics' || preset === 'posts-poi') {
      // Strip cluster: prefix if any; topic ids are plain topic_id
      const topicIds = ids.map((id) => id.replace(/^cluster:/, ''))
      return fetchPostLeafStubsForTopics(
        db,
        topicsCollection(db),
        postsCollection(db),
        topicIds,
        { cap, filters, labels }
      )
    }

    if (preset === 'posts-profiles') {
      const profileIds = ids.map((id) => id.replace(/^cluster:/, ''))
      return fetchPostLeafStubsForProfiles(db, postsCollection(db), profileIds, { cap, labels })
    }

    if (preset === 'ads-ad-profiles') {
      const profileIds = ids.map((id) => id.replace(/^cluster:/, ''))
      return fetchAdLeafStubsForProfiles(adsCollection(db), profileIds, { cap })
    }

    if (preset === 'ads-domains') {
      const domainIds = ids.map((id) => id.replace(/^cluster:/, ''))
      return fetchAdLeafStubsForDomains(adsCollection(db), domainIds, { cap })
    }

    return { clusters: [], colorAxis: { keys: [] } }
  } catch (e) {
    logActionError({ ...LOG, app_action: 'getNexusLeafStubs', message: 'failed' }, e)
    return { clusters: [], colorAxis: { keys: [] } }
  }
}

/** L1 — Posts understanding by parent mode. */
export async function getPostsNexusGraph(parentMode = 'parent_topic') {
  try {
    const db = await getDb()

    if (parentMode === 'poi') {
      const [mentionPosts, pois] = await Promise.all([
        postsCollection(db)
          .find(
            { 'workflow.review_status': 'reviewed' },
            {
              projection: {
                'review_details.poi_names': 1,
                'analysis_results.poi_check.poi_names': 1,
                'list.sourced_at': 1,
              },
            }
          )
          .toArray(),
        poisCollection(db)
          .find(parentPoiFilter(), {
            projection: {
              display_name: 1,
              name: 1,
              aliases: 1,
              alias_poi_names: 1,
              category: 1,
              tier: 1,
              post_count: 1,
              first_seen: 1,
              last_seen: 1,
              'image.s3_url': 1,
            },
          })
          .toArray(),
      ])
      const mentionKeys = new Set()
      for (const post of mentionPosts) {
        for (const name of post.review_details?.poi_names || []) {
          const key = normalizePoiNameKey(name)
          if (key) mentionKeys.add(key)
        }
      }
      const { poiStats, hubStats } = summarizeReviewedPoiMentions(pois, mentionPosts)
      const withImages = await Promise.all(
        pois.map(async (poi) => {
          let imageUrl = null
          if (poi.image?.s3_url) {
            try {
              imageUrl = await getSignedImageUrl(poi.image.s3_url)
            } catch {
              imageUrl = null
            }
          }
          const stats = poiStats.get(poi._id.toString())
          return {
            ...poi,
            imageUrl,
            post_count: stats?.count ?? 0,
            first_seen: stats?.firstSeen || poi.first_seen || null,
            last_seen: stats?.lastSeen || poi.last_seen || null,
          }
        })
      )
      return serializeForClient(buildPoiCategoryGraph({ pois: withImages, mentionKeys, hubStats }))
    }

    if (parentMode === 'profile') {
      const profiles = await profilesCollection(db)
        .find(
          CLIENT_VISIBLE_PROFILE_FILTER,
          {
            projection: {
              _id: 1,
              display_name: 1,
              username: 1,
              handle: 1,
              'list.post_count': 1,
              'list.reviewed_post_count': 1,
              post_count: 1,
            },
          }
        )
        .sort({ 'list.reviewed_post_count': -1, 'list.post_count': -1 })
        .limit(200)
        .toArray()
      const normalized = profiles.map((p) => ({
        ...p,
        reviewed_post_count: p.list?.reviewed_post_count ?? 0,
        post_count: p.list?.reviewed_post_count ?? p.post_count ?? p.list?.post_count ?? 0,
      }))
      return serializeForClient(buildProfileHubsGraph({ profiles: normalized }))
    }

    // parent_topic (default)
    const topics = await topicsCollection(db)
      .find(
        {},
        {
          projection: {
            _id: 1,
            topic_id: 1,
            title: 1,
            type: 1,
            parent_topic_id: 1,
            post_count: 1,
          },
        }
      )
      .toArray()
    return serializeForClient(buildParentTopicTreeGraph({ topics }))
  } catch (e) {
    logActionError({ ...LOG, app_action: 'getPostsNexusGraph', message: 'failed' }, e)
    return serializeForClient(buildParentTopicTreeGraph({ topics: [] }))
  }
}

/** L1 — Ads understanding. */
export async function getAdsNexusGraph(parentMode = 'ad_profile') {
  try {
    const db = await getDb()

    if (parentMode === 'domain') {
      // Aggregate reviewed ad counts per linked domain; keep only reviewed domains
      const rows = await adsCollection(db)
        .aggregate([
          { $match: { ...REVIEWED_ADS_FILTER, linked_domain_ids: { $exists: true, $ne: [] } } },
          { $unwind: '$linked_domain_ids' },
          { $group: { _id: '$linked_domain_ids', ad_count: { $sum: 1 } } },
          { $sort: { ad_count: -1 } },
          { $limit: 200 },
        ])
        .toArray()

      const domainIds = rows.map((r) => r._id).filter(Boolean)
      const domains = domainIds.length
        ? await domainsCollection(db)
            .find(
              { _id: { $in: domainIds }, ...REVIEWED_DOMAINS_FILTER },
              { projection: { host: 1, domain: 1, domain_name: 1, name: 1 } }
            )
            .toArray()
        : []
      const byId = new Map(domains.map((d) => [d._id.toString(), d]))
      const merged = rows
        .map((r) => {
          const id = r._id?.toString?.() || String(r._id)
          const doc = byId.get(id)
          if (!doc) return null
          return {
            _id: r._id,
            host: doc.host || doc.domain_name || doc.domain || doc.name || id,
            ad_count: r.ad_count,
          }
        })
        .filter(Boolean)
      return serializeForClient(buildDomainAdsGraph({ domains: merged }))
    }

    const profiles = await adProfilesCollection(db)
      .find(CLIENT_VISIBLE_AD_PROFILE_FILTER, {
        projection: {
          _id: 1,
          page_name: 1,
          name: 1,
          'list.ad_count': 1,
          'list.reviewed_ad_count': 1,
          ad_count: 1,
          'advertiser_snapshot.page_name': 1,
        },
      })
      .sort({ 'list.reviewed_ad_count': -1, 'list.ad_count': -1 })
      .limit(200)
      .toArray()

    const normalized = profiles.map((p) => ({
      ...p,
      reviewed_ad_count: p.list?.reviewed_ad_count ?? 0,
      ad_count: p.list?.reviewed_ad_count ?? p.ad_count ?? p.list?.ad_count ?? 0,
    }))

    return serializeForClient(buildAdProfileGraph({ profiles: normalized }))
  } catch (e) {
    logActionError({ ...LOG, app_action: 'getAdsNexusGraph', message: 'failed' }, e)
    return serializeForClient(buildAdProfileGraph({ profiles: [] }))
  }
}

/** L3 — paginated posts for a cluster (topic, POI, or profile). */
export async function getNexusClusterPosts(clusterId, page = 1, limit = 25) {
  try {
    const db = await getDb()
    const id = String(clusterId || '').replace(/^cluster:/, '')
    const parsedPoi = parsePoiNexusId(id)

    if (parsedPoi.kind === 'category' || parsedPoi.kind === 'poi') {
      let poiDocs = []
      let title = id
      if (parsedPoi.kind === 'category') {
        title = poiCategoryLabel(parsedPoi.slug)
        poiDocs = await poisCollection(db)
          .find(
            { ...parentPoiFilter(), category: { $in: poiCategorySlugsForHub(parsedPoi.slug) } },
            { projection: { display_name: 1, name: 1, aliases: 1, alias_poi_names: 1 } }
          )
          .toArray()
      } else {
        let poiOid
        try {
          poiOid = new ObjectId(parsedPoi.poiId)
        } catch {
          return serializeForClient({
            kind: 'poi',
            meta: { id, title },
            posts: [],
            totalCount: 0,
            page,
            totalPages: 0,
          })
        }
        const poi = await poisCollection(db).findOne(
          { _id: poiOid },
          { projection: { display_name: 1, name: 1, aliases: 1, alias_poi_names: 1 } }
        )
        if (poi) {
          poiDocs = [poi]
          title = poi.display_name || poi.name || id
        }
      }

      const match = buildReviewedPostsMatchForPois(poiDocs)
      const totalCount = match._id?.$exists === false
        ? 0
        : await postsCollection(db).countDocuments(match)
      const docs = totalCount
        ? await postsCollection(db)
            .find(match)
            .sort({ 'list.posted_at': -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .toArray()
        : []
      const processed = await Promise.all(docs.map((p) => normalizeS3Post(p, db)))
      return serializeForClient({
        kind: parsedPoi.kind === 'category' ? 'poi_category' : 'poi',
        meta: { id, title },
        posts: processed,
        totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit) || 0,
      })
    }

    // Topic path
    const topic = await topicsCollection(db).findOne(
      { topic_id: id },
      { projection: { topic_id: 1, title: 1, posts: 1, post_count: 1, narrative: 1 } }
    )

    if (topic) {
      const postObjectIds = toObjectIds(topic.posts || [])
      if (!postObjectIds.length) {
        return serializeForClient({
          kind: 'topic',
          meta: {
            id: topic.topic_id,
            title: topic.title,
            narrative: topic.narrative,
            post_count: topic.post_count,
          },
          posts: [],
          totalCount: 0,
          page,
          totalPages: 0,
        })
      }
      const pipeline = buildFeedPostsFacetPipeline(
        postObjectIds,
        {},
        { field: 'published_date', direction: 'desc' },
        page,
        limit
      )
      const facetResult = pipeline
        ? await postsCollection(db).aggregate(pipeline).toArray()
        : []
      const posts = facetResult?.[0]?.data || []
      const totalCount = facetResult?.[0]?.total?.[0]?.total || 0
      const processed = await Promise.all(posts.map((p) => normalizeS3Post(p, db)))
      return serializeForClient({
        kind: 'topic',
        meta: {
          id: topic.topic_id,
          title: topic.title,
          narrative: topic.narrative,
          post_count: topic.post_count,
        },
        posts: processed,
        totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit) || 0,
      })
    }

    // Profile path
    let profileOid
    try {
      profileOid = new ObjectId(id)
    } catch {
      return serializeForClient({
        kind: null,
        meta: null,
        posts: [],
        totalCount: 0,
        page: 1,
        totalPages: 0,
      })
    }

    const match = { profile_id: profileOid, 'workflow.review_status': 'reviewed' }
    const totalCount = await postsCollection(db).countDocuments(match)
    const docs = await postsCollection(db)
      .find(match)
      .sort({ 'list.posted_at': -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()
    const processed = await Promise.all(docs.map((p) => normalizeS3Post(p, db)))
    const profile = await profilesCollection(db).findOne(
      { _id: profileOid },
      { projection: { display_name: 1, username: 1 } }
    )
    return serializeForClient({
      kind: 'profile',
      meta: {
        id,
        title: profile?.display_name || profile?.username || id,
      },
      posts: processed,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit) || 0,
    })
  } catch (e) {
    logActionError({ ...LOG, app_action: 'getNexusClusterPosts', message: 'failed' }, e)
    return serializeForClient({
      kind: null,
      meta: null,
      posts: [],
      totalCount: 0,
      page: 1,
      totalPages: 0,
    })
  }
}

/** L3 — paginated ads for an ad-profile or domain cluster. */
export async function getNexusClusterAds(clusterId, parentMode = 'ad_profile', page = 1, limit = 25) {
  try {
    const db = await getDb()
    const id = String(clusterId || '').replace(/^cluster:/, '')
    let oid
    try {
      oid = new ObjectId(id)
    } catch {
      return { ads: [], totalCount: 0, page: 1, totalPages: 0, meta: null }
    }

    const match =
      parentMode === 'domain'
        ? { linked_domain_ids: oid, ...REVIEWED_ADS_FILTER }
        : { ad_profile_id: oid, ...REVIEWED_ADS_FILTER }

    const totalCount = await adsCollection(db).countDocuments(match)
    const docs = await adsCollection(db)
      .find(match)
      .sort({ 'list.sourced_at': -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()
    const ads = await Promise.all(docs.map((ad) => normalizeAdForUi(ad, db)))

    let title = id
    if (parentMode === 'domain') {
      const domain = await domainsCollection(db).findOne(
        { _id: oid },
        { projection: { host: 1, domain: 1 } }
      )
      title = domain?.host || domain?.domain || id
    } else {
      const profile = await adProfilesCollection(db).findOne(
        { _id: oid },
        { projection: { page_name: 1, name: 1 } }
      )
      title = profile?.page_name || profile?.name || id
    }

    return {
      ads,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit) || 0,
      meta: { id, title },
    }
  } catch (e) {
    logActionError({ ...LOG, app_action: 'getNexusClusterAds', message: 'failed' }, e)
    return { ads: [], totalCount: 0, page: 1, totalPages: 0, meta: null }
  }
}

/**
 * L1 skeleton for a single feed: topic clusters + optional Manual ads hub.
 * Supports mixed post/ad leaves via L2 getFeedMixedLeafStubs.
 */
export async function getFeedMixedNexusGraph(feedId) {
  try {
    const db = await getDb()
    let objectId
    try {
      objectId = new ObjectId(feedId)
    } catch {
      return serializeForClient(emptyNexusGraph({ preset: 'feed-mixed' }))
    }

    const feed = await db.collection(FEEDS_COLLECTION).findOne({ _id: objectId })
    if (!feed) return serializeForClient(emptyNexusGraph({ preset: 'feed-mixed' }))

    const graph = emptyNexusGraph({
      preset: 'feed-mixed',
      parentMode: 'feed',
      leafKind: 'mixed',
      feedId: objectId.toString(),
      title: feed.title,
    })

    const topicIds = Array.isArray(feed.topic_ids) ? feed.topic_ids : []
    const topics = topicIds.length
      ? await topicsCollection(db)
          .find(
            { topic_id: { $in: topicIds } },
            { projection: { topic_id: 1, title: 1, post_count: 1, poi_names: 1 } }
          )
          .toArray()
      : []

    const hubId = 'feed-root'
    graph.nodes.push({
      id: hubId,
      type: NODE_TYPES.HUB,
      label: feed.title || 'Feed',
      parentId: null,
      familyId: hubId,
      count: 0,
      hubKind: 'feed',
      familyColor: FAMILY_PALETTE[0],
    })

    for (const topic of topics) {
      const id = String(topic.topic_id)
      graph.nodes.push({
        id,
        type: NODE_TYPES.CLUSTER,
        label: topic.title || id,
        parentId: hubId,
        familyId: hubId,
        count: topic.post_count ?? 0,
        clusterKind: 'topic',
        familyColor: FAMILY_PALETTE[0],
      })
      graph.links.push({ source: hubId, target: id, type: 'hub_cluster' })
    }

    const adIds = Array.isArray(feed.manual_ad_ids) ? feed.manual_ad_ids : []
    if (adIds.length) {
      graph.nodes.push({
        id: 'manual-ads',
        type: NODE_TYPES.CLUSTER,
        label: 'Manual ads',
        parentId: hubId,
        familyId: hubId,
        count: adIds.length,
        clusterKind: 'manual_ads',
        familyColor: FAMILY_PALETTE[1],
      })
      graph.links.push({ source: hubId, target: 'manual-ads', type: 'hub_cluster' })
    }

    graph.meta.hubCount = 1
    graph.meta.clusterCount = graph.nodes.filter((n) => n.type === NODE_TYPES.CLUSTER).length
    graph.meta.manualAdCount = adIds.length
    return serializeForClient(graph)
  } catch (e) {
    logActionError({ ...LOG, app_action: 'getFeedMixedNexusGraph', message: 'failed' }, e)
    return serializeForClient(emptyNexusGraph({ preset: 'feed-mixed' }))
  }
}

/**
 * L2 mixed stubs for one feed: topic posts (leafKind=post) + manual ads (leafKind=ad).
 */
export async function getFeedMixedLeafStubs(feedId, { cap = DEFAULT_LEAF_CAP_PER_PARENT } = {}) {
  try {
    const db = await getDb()
    let objectId
    try {
      objectId = new ObjectId(feedId)
    } catch {
      return { clusters: [], colorAxis: { keys: [] } }
    }

    const feed = await db.collection(FEEDS_COLLECTION).findOne({ _id: objectId })
    if (!feed) return { clusters: [], colorAxis: { keys: [] } }

    const topicIds = Array.isArray(feed.topic_ids) ? feed.topic_ids : []
    const postStubs = await fetchPostLeafStubsForTopics(
      db,
      topicsCollection(db),
      postsCollection(db),
      topicIds,
      { cap }
    )

    const adObjectIds = await resolveFeedAdObjectIds(db, feed)
    const adStubs = adObjectIds.length
      ? await fetchAdLeafStubsByIds(
          adsCollection(db),
          adObjectIds.map((id) => id.toString()),
          { cap, clusterId: 'manual-ads', familyId: 'feed-root' }
        )
      : { clusters: [], colorAxis: { keys: [] } }

    const allKeys = orderColorKeys([
      ...(postStubs.colorAxis?.keys || []),
      ...(adStubs.colorAxis?.keys || []),
    ])

    // Re-index leaves against unioned color axis
    const indexByKey = new Map(allKeys.map((k, i) => [k, i]))
    const reindex = (clusters) =>
      clusters.map((c) => ({
        ...c,
        leaves: (c.leaves || []).map((leaf) => ({
          ...leaf,
          k: leaf.colorKeys?.[0] != null && indexByKey.has(leaf.colorKeys[0])
            ? indexByKey.get(leaf.colorKeys[0])
            : leaf.k,
        })),
      }))

    return {
      clusters: [...reindex(postStubs.clusters || []), ...reindex(adStubs.clusters || [])],
      colorAxis: { keys: allKeys },
    }
  } catch (e) {
    logActionError({ ...LOG, app_action: 'getFeedMixedLeafStubs', message: 'failed' }, e)
    return { clusters: [], colorAxis: { keys: [] } }
  }
}
