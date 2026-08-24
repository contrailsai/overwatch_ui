#!/usr/bin/env node

/**
 * Create schema v3 indexes on a tenant MongoDB database.
 *
 * Usage:
 *   node scripts/ensure_indexes_v3.js --db <TARGET_DB>
 *
 * MONGO_URI is read from .env.local
 */

const { MongoClient } = require('mongodb')
const dotenv = require('dotenv')
const path = require('path')

dotenv.config({ path: path.join(__dirname, '../.env.local') })

function parseArgs(argv) {
  const args = { db: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db' && argv[i + 1]) {
      args.db = argv[++i]
    }
  }
  return args
}

/**
 * Legacy tenants can have multiple profile docs sharing the same
 * (platform, platform_user_id) — e.g. Reddit subreddit names stored as
 * platform_user_id, or re-ingested accounts with renamed usernames.
 *
 * Keep the doc with the highest list.post_count (then newest updated_at),
 * and null platform_user_id on the extras so the partial unique index can build.
 * Profile _ids and post.profile_id links are left intact.
 */
async function resolveDuplicatePlatformUserIds(profiles, log = console.log) {
  const dups = await profiles
    .aggregate([
      { $match: { platform_user_id: { $type: 'string', $gt: '' } } },
      {
        $group: {
          _id: { platform: '$platform', platform_user_id: '$platform_user_id' },
          count: { $sum: 1 },
          docs: {
            $push: {
              _id: '$_id',
              username: '$username',
              post_count: '$list.post_count',
              updated_at: '$system.updated_at',
            },
          },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray()

  if (dups.length === 0) return { groups: 0, cleared: 0 }

  let cleared = 0
  for (const group of dups) {
    const sorted = [...group.docs].sort((a, b) => {
      const pc = (Number(b.post_count) || 0) - (Number(a.post_count) || 0)
      if (pc !== 0) return pc
      const at = a.updated_at ? new Date(a.updated_at).getTime() : 0
      const bt = b.updated_at ? new Date(b.updated_at).getTime() : 0
      return bt - at
    })
    const keep = sorted[0]
    const dropIds = sorted.slice(1).map((d) => d._id)
    const result = await profiles.updateMany(
      { _id: { $in: dropIds } },
      { $set: { platform_user_id: null } }
    )
    cleared += result.modifiedCount
    log(
      `  dedupe ${group._id.platform}/${group._id.platform_user_id}: keep ${keep._id} (${keep.username}), cleared platform_user_id on ${dropIds.length}`
    )
  }

  log(`  Resolved ${dups.length} duplicate platform_user_id group(s); cleared ${cleared} profile(s)`)
  return { groups: dups.length, cleared }
}

/**
 * Legacy tenants can have multiple post docs sharing the same
 * (platform, platform_post_id) — e.g. re-ingested posts kept under new _ids.
 *
 * Keep the doc with the highest effective_threat_score (then engagement,
 * then newest updated_at), and delete the extras plus their embeddings /
 * case_events so the unique index can build.
 */
async function resolveDuplicatePlatformPostIds(
  posts,
  postEmbeddings,
  caseEvents,
  log = console.log
) {
  const dups = await posts
    .aggregate([
      { $match: { platform_post_id: { $type: 'string', $gt: '' } } },
      {
        $group: {
          _id: { platform: '$platform', platform_post_id: '$platform_post_id' },
          count: { $sum: 1 },
          docs: {
            $push: {
              _id: '$_id',
              threat: '$list.effective_threat_score',
              engagement: '$list.engagement_score',
              updated_at: '$system.updated_at',
            },
          },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray()

  if (dups.length === 0) return { groups: 0, deleted: 0 }

  let deleted = 0
  for (const group of dups) {
    const sorted = [...group.docs].sort((a, b) => {
      const t = (Number(b.threat) || 0) - (Number(a.threat) || 0)
      if (t !== 0) return t
      const e = (Number(b.engagement) || 0) - (Number(a.engagement) || 0)
      if (e !== 0) return e
      const at = a.updated_at ? new Date(a.updated_at).getTime() : 0
      const bt = b.updated_at ? new Date(b.updated_at).getTime() : 0
      return bt - at
    })
    const keep = sorted[0]
    const dropIds = sorted.slice(1).map((d) => d._id)
    await posts.deleteMany({ _id: { $in: dropIds } })
    if (postEmbeddings) {
      await postEmbeddings.deleteMany({ post_id: { $in: dropIds } })
    }
    if (caseEvents) {
      await caseEvents.deleteMany({
        entity_type: 'post',
        entity_id: { $in: dropIds },
      })
    }
    deleted += dropIds.length
    log(
      `  dedupe post ${group._id.platform}/${group._id.platform_post_id}: keep ${keep._id}, deleted ${dropIds.length}`
    )
  }

  log(
    `  Resolved ${dups.length} duplicate platform_post_id group(s); deleted ${deleted} post(s)`
  )
  return { groups: dups.length, deleted }
}

async function createIndexSafe(collection, keys, options, label, log) {
  try {
    await collection.createIndex(keys, options)
    log(`  ${label}`)
    return true
  } catch (err) {
    // Same key pattern already exists under a different name (e.g. Topics → topics rename)
    const nameMatch = /already exists with a different name:\s*(\S+)/i.exec(
      err.message || ''
    )
    if (nameMatch) {
      try {
        await collection.dropIndex(nameMatch[1])
        await collection.createIndex(keys, options)
        log(`  ${label} (replaced ${nameMatch[1]})`)
        return true
      } catch (retryErr) {
        log(`  FAILED ${label}: ${retryErr.message}`)
        return false
      }
    }
    log(`  FAILED ${label}: ${err.message}`)
    return false
  }
}

async function ensureIndexesV3(db, log = console.log) {
  const posts = db.collection('Posts')
  const profiles = db.collection('profiles')
  const caseEvents = db.collection('case_events')
  const postEmbeddings = db.collection('post_embeddings')
  const topics = db.collection('topics')

  log('Creating v3 indexes...')

  let failed = 0
  const ok = async (collection, keys, options, label) => {
    const success = await createIndexSafe(collection, keys, options, label, log)
    if (!success) failed++
  }

  // Clear colliding platform_post_id values before unique index
  log('Checking duplicate post platform_post_id values…')
  await resolveDuplicatePlatformPostIds(posts, postEmbeddings, caseEvents, log)

  await ok(
    posts,
    { platform: 1, platform_post_id: 1 },
    { unique: true, name: 'platform_platform_post_id_unique' },
    'Posts: { platform, platform_post_id } unique'
  )

  await ok(
    posts,
    {
      'workflow.review_status': 1,
      'list.risk_rank': -1,
      'list.alert_hour_ist': -1,
      'list.engagement_score': -1,
    },
    { name: 'review_status_risk_alert_engagement' },
    'Posts: review_status + risk_rank + alert_hour + engagement'
  )

  await ok(
    posts,
    { platform: 1, 'workflow.client_status': 1, 'list.reviewed_at': -1 },
    { name: 'platform_client_status_reviewed_at' },
    'Posts: platform + client_status + reviewed_at'
  )

  await ok(
    posts,
    { 'list.effective_threat_score': -1, 'list.reviewed_at': -1 },
    { name: 'effective_threat_score_reviewed_at' },
    'Posts: effective_threat_score + reviewed_at'
  )

  await ok(
    posts,
    { 'list.violation_flags': 1, 'list.reviewed_at': -1 },
    { name: 'violation_flags_reviewed_at' },
    'Posts: violation_flags + reviewed_at'
  )

  await ok(
    posts,
    {
      'workflow.review_status': 1,
      'workflow.ai_status': 1,
      'list.sourced_at': -1,
    },
    { name: 'review_ai_status_sourced_at' },
    'Posts: review_status + ai_status + sourced_at'
  )

  await ok(
    posts,
    { profile_id: 1, 'list.posted_at': -1 },
    { name: 'profile_id_posted_at' },
    'Posts: profile_id + posted_at'
  )

  await ok(
    posts,
    {
      'list.cluster_id': 1,
      'list.is_cluster_representative': 1,
      'list.risk_rank': -1,
    },
    { name: 'cluster_representative_risk' },
    'Posts: cluster_id + is_cluster_representative + risk_rank'
  )

  await ok(
    posts,
    { 'workflow.takedown_status': 1, 'takedown.initiated_at': -1 },
    { name: 'takedown_status_initiated_at' },
    'Posts: takedown_status + initiated_at'
  )

  // Clear colliding platform_user_id values before unique index
  log('Checking duplicate profile platform_user_id values…')
  await resolveDuplicatePlatformUserIds(profiles, log)

  await ok(
    profiles,
    { platform: 1, platform_user_id: 1 },
    {
      unique: true,
      name: 'platform_platform_user_id_unique',
      // Many profiles have null platform_user_id; partial avoids null collisions
      partialFilterExpression: {
        platform_user_id: { $type: 'string', $gt: '' },
      },
    },
    'profiles: { platform, platform_user_id } unique (partial)'
  )

  await ok(
    profiles,
    {
      'workflow.review_status': 1,
      'list.risk_rank': -1,
      'list.last_active_at': -1,
    },
    { name: 'review_status_risk_last_active' },
    'profiles: review_status + risk_rank + last_active_at'
  )

  await ok(
    profiles,
    { 'list.follower_count': -1 },
    { name: 'follower_count' },
    'profiles: follower_count'
  )

  await ok(
    profiles,
    { 'list.post_count': -1 },
    { name: 'post_count' },
    'profiles: post_count'
  )

  const ads = db.collection('Ads')
  await ok(
    ads,
    { platform: 1, platform_ad_id: 1 },
    { unique: true, name: 'uniq_platform_ad_id' },
    'Ads: { platform, platform_ad_id } unique'
  )
  await ok(
    ads,
    { 'workflow.review_status': 1, 'list.sourced_at': -1, _id: -1 },
    { name: 'review_status_sourced_at_id' },
    'Ads: review_status + sourced_at + _id (reviewer queue sort)'
  )
  await ok(
    ads,
    {
      'workflow.review_status': 1,
      'list.effective_threat_score': -1,
      'list.sourced_at': -1,
      _id: 1,
    },
    { name: 'review_status_threat_sourced' },
    'Ads: review_status + threat + sourced_at (client list default)'
  )
  await ok(
    ads,
    {
      'workflow.review_status': 1,
      'list.effective_threat_score': -1,
      'list.start_date': -1,
      _id: 1,
    },
    { name: 'review_status_threat_start_date' },
    'Ads: review_status + threat + start_date (reports / date sort)'
  )
  await ok(
    ads,
    {
      'workflow.review_status': 1,
      'workflow.client_status': 1,
      'list.effective_threat_score': -1,
      'list.sourced_at': -1,
    },
    { name: 'review_client_status_threat_sourced' },
    'Ads: review_status + client_status + threat + sourced_at'
  )
  await ok(
    ads,
    {
      'workflow.ai_status': 1,
      'workflow.review_status': 1,
      'list.sourced_at': -1,
    },
    { name: 'ai_status_review_sourced' },
    'Ads: ai_status + review_status + sourced_at'
  )
  await ok(
    ads,
    { ad_profile_id: 1, 'list.sourced_at': -1 },
    { name: 'ad_profile_id_sourced_at' },
    'Ads: ad_profile_id + sourced_at'
  )
  await ok(
    ads,
    { platform: 1, 'list.is_active': 1, 'list.start_date': -1 },
    { name: 'filter_active_start' },
    'Ads: platform + is_active + start_date'
  )
  await ok(
    ads,
    { 'list.review_threat_score': 1 },
    { name: 'review_threat_score_sparse', sparse: true },
    'Ads: review_threat_score sparse (client reviewed $or compat arm)'
  )
  await ok(
    ads,
    { linked_domain_ids: 1 },
    { name: 'linked_domain_ids' },
    'Ads: linked_domain_ids'
  )

  const adProfiles = db.collection('Ad_profiles')
  await ok(
    adProfiles,
    { platform: 1, platform_page_id: 1 },
    { unique: true, name: 'uniq_platform_page_id' },
    'Ad_profiles: { platform, platform_page_id } unique'
  )
  await ok(
    adProfiles,
    { platform: 1, profile_url: 1 },
    { name: 'platform_profile_url' },
    'Ad_profiles: platform + profile_url'
  )
  await ok(
    adProfiles,
    { 'list.ad_count': -1, 'list.max_threat_score': -1, _id: 1 },
    { name: 'ad_count_threat_id' },
    'Ad_profiles: ad_count + max_threat + _id (reviewer default sort)'
  )
  await ok(
    adProfiles,
    {
      'workflow.review_status': 1,
      'list.ad_count': -1,
      'list.max_threat_score': -1,
      _id: 1,
    },
    { name: 'review_status_ad_count_threat' },
    'Ad_profiles: review_status + ad_count + max_threat'
  )
  await ok(
    adProfiles,
    {
      'workflow.review_status': 1,
      'workflow.reviewed_at': -1,
      'list.last_active_at': -1,
      _id: 1,
    },
    { name: 'review_status_reviewed_last_active' },
    'Ad_profiles: review_status + reviewed_at + last_active (client list)'
  )
  await ok(
    adProfiles,
    {
      'workflow.review_status': 1,
      'workflow.client_status': 1,
      'workflow.reviewed_at': -1,
    },
    { name: 'review_status_client_reviewed' },
    'Ad_profiles: review_status + client_status + reviewed_at'
  )
  await ok(
    adProfiles,
    { 'workflow.review_status': 1, 'list.max_threat_score': -1 },
    { name: 'ad_profile_review' },
    'Ad_profiles: review_status + max_threat_score'
  )

  const domains = db.collection('Domains')
  await ok(
    domains,
    { domain_name: 1 },
    { unique: true, name: 'domain_name_unique' },
    'Domains: { domain_name } unique'
  )
  await ok(
    domains,
    {
      'workflow.review_status': 1,
      'list.last_analyzed_at': -1,
      'list.last_seen_at': -1,
      _id: -1,
    },
    { name: 'review_status_analyzed_seen_id' },
    'Domains: review_status + last_analyzed + last_seen + _id (reviewer queue)'
  )
  await ok(
    domains,
    { 'workflow.review_status': 1, 'list.last_seen_at': -1, _id: 1 },
    { name: 'review_status_last_seen' },
    'Domains: review_status + last_seen (client list default)'
  )
  await ok(
    domains,
    {
      'workflow.review_status': 1,
      'workflow.client_status': 1,
      'list.last_seen_at': -1,
    },
    { name: 'review_status_client_last_seen' },
    'Domains: review_status + client_status + last_seen'
  )
  await ok(
    domains,
    { 'workflow.review_status': 1, 'list.effective_threat_score': -1, _id: 1 },
    { name: 'review_status_threat' },
    'Domains: review_status + effective_threat_score'
  )
  await ok(
    domains,
    { 'workflow.review_status': 1, 'list.occurrence_count': -1, _id: 1 },
    { name: 'review_status_occurrence' },
    'Domains: review_status + occurrence_count'
  )
  await ok(
    domains,
    {
      'workflow.review_status': 1,
      'workflow.analysis_status': 1,
      'list.last_analyzed_at': -1,
    },
    { name: 'review_status_analysis_analyzed' },
    'Domains: review_status + analysis_status + last_analyzed'
  )
  await ok(
    domains,
    { 'list.risk_rank': 1, 'list.last_seen_at': -1 },
    { name: 'risk_rank_last_seen' },
    'Domains: risk_rank + last_seen'
  )
  await ok(
    domains,
    { 'discovery.occurrences.entity_id': 1 },
    { name: 'occurrence_entity' },
    'Domains: discovery.occurrences.entity_id'
  )
  await ok(
    domains,
    { linked_ad_ids: 1 },
    { name: 'linked_ad_ids' },
    'Domains: linked_ad_ids'
  )

  await ok(
    caseEvents,
    { entity_type: 1, entity_id: 1, occurred_at: -1 },
    { name: 'entity_type_id_occurred_at' },
    'case_events: entity_type + entity_id + occurred_at'
  )

  await ok(
    caseEvents,
    { occurred_at: -1 },
    { name: 'occurred_at' },
    'case_events: occurred_at'
  )

  await ok(
    postEmbeddings,
    { post_id: 1 },
    { unique: true, name: 'post_id_unique' },
    'post_embeddings: post_id unique'
  )

  await ok(
    topics,
    { topic_id: 1 },
    { unique: true, name: 'topic_id_unique' },
    'topics: topic_id unique'
  )

  await ok(topics, { posts: 1 }, { name: 'posts_multikey' }, 'topics: posts multikey')

  if (failed > 0) {
    throw new Error(`v3 indexes incomplete: ${failed} index(es) failed`)
  }
  log('✓ v3 indexes ensured')
}

async function main() {
  const { db: dbName } = parseArgs(process.argv.slice(2))
  const mongoUri = process.env.MONGO_URI

  if (!mongoUri || !dbName) {
    console.error('Usage: node scripts/ensure_indexes_v3.js --db <TARGET_DB>')
    console.error('Requires MONGO_URI in .env.local')
    process.exit(1)
  }

  const client = new MongoClient(mongoUri)
  try {
    await client.connect()
    await ensureIndexesV3(client.db(dbName))
  } catch (err) {
    console.error('Failed to create indexes:', err.message)
    process.exit(1)
  } finally {
    await client.close()
  }
}

if (require.main === module) {
  main()
}

module.exports = {
  ensureIndexesV3,
  resolveDuplicatePlatformUserIds,
  resolveDuplicatePlatformPostIds,
}
