#!/usr/bin/env node

/**
 * Finish v3 cutover: ensure canonical `Posts` collection, drop stray lowercase `posts`,
 * legacy `Profiles`, and orphan case_events.
 *
 * Usage:
 *   node scripts/finish_v3_cutover.js --db MIB-PMO-Data-Search [--dry-run|--apply]
 *   node scripts/finish_v3_cutover.js --all-tenant-dbs --apply
 */

const { MongoClient } = require('mongodb')
const dotenv = require('dotenv')
const path = require('path')

const { POSTS, LEGACY_POSTS, LEGACY_PROFILES, PROFILES } = require('./lib/collection-names')
const {
  collectionExists,
  parseDbArgs,
  listTenantDatabases,
  v1FlatFilter,
  SHELL_FILTER,
} = require('./lib/schema-health')
const { migratePostsToPosts } = require('./migrate_posts_to_Posts')

dotenv.config({ path: path.join(__dirname, '../.env.local') })

async function cleanupOrphanCaseEvents(db, postsColName, dryRun) {
  const eventsCol = db.collection('case_events')
  const eventCount = await eventsCol.countDocuments({ entity_type: 'post' })
  if (eventCount === 0) return 0

  const orphaned = await eventsCol
    .aggregate([
      { $match: { entity_type: 'post' } },
      {
        $lookup: {
          from: postsColName,
          localField: 'entity_id',
          foreignField: '_id',
          as: 'post',
        },
      },
      { $match: { post: { $size: 0 } } },
      { $project: { _id: 1 } },
    ])
    .toArray()

  if (orphaned.length === 0) return 0
  if (!dryRun) {
    await eventsCol.deleteMany({ _id: { $in: orphaned.map((e) => e._id) } })
  }
  return orphaned.length
}

async function finishOneDb(db, dryRun) {
  const dbName = db.databaseName
  const actions = []

  const hasPosts = await collectionExists(db, POSTS)
  const hasPostsLower = await collectionExists(db, LEGACY_POSTS)
  const hasProfiles = await collectionExists(db, LEGACY_PROFILES)
  const hasProfilesLower = await collectionExists(db, PROFILES)

  let postsColName = null

  if (hasPosts && !hasPostsLower) {
    postsColName = POSTS
  } else if (!hasPosts && hasPostsLower) {
    actions.push(`promote ${LEGACY_POSTS} → ${POSTS}`)
    if (!dryRun) {
      await migratePostsToPosts(db, false, (msg) => actions.push(`  ${msg}`))
    }
    postsColName = POSTS
  } else if (hasPosts && hasPostsLower) {
    const postsCount = await db.collection(POSTS).countDocuments({})
    const v1Posts = await db.collection(POSTS).countDocuments(v1FlatFilter())
    const shells = await db.collection(POSTS).countDocuments(SHELL_FILTER)
    const lowerCount = await db.collection(LEGACY_POSTS).countDocuments({})

    if (v1Posts > 0 || shells > 0) {
      actions.push(`${POSTS} not clean: v1=${v1Posts}, shells=${shells}`)
    } else {
      actions.push(`drop stray ${LEGACY_POSTS} (${lowerCount} docs; ${POSTS}=${postsCount} v3)`)
      if (!dryRun) await db.collection(LEGACY_POSTS).drop()
    }
    postsColName = POSTS
  }

  if (hasProfiles && hasProfilesLower) {
    const legacyCount = await db.collection(LEGACY_PROFILES).countDocuments({})
    actions.push(`drop legacy ${LEGACY_PROFILES} (${legacyCount} docs)`)
    if (!dryRun) await db.collection(LEGACY_PROFILES).drop()
  }

  let orphanEvents = 0
  if (postsColName) {
    orphanEvents = await cleanupOrphanCaseEvents(db, postsColName, dryRun)
    if (orphanEvents > 0) {
      actions.push(
        `${dryRun ? '[dry-run] ' : ''}delete ${orphanEvents} orphan case_events`
      )
    }
  }

  return { db: dbName, actions, orphanEvents, postsColName }
}

async function main() {
  const args = parseDbArgs(process.argv.slice(2))
  const mongoUri = process.env.MONGO_URI
  const dryRun = !args.apply

  if (!mongoUri) {
    console.error('Requires MONGO_URI in .env.local')
    process.exit(1)
  }

  let dbNames = args.dbs
  const client = new MongoClient(mongoUri)
  try {
    await client.connect()
    if (args.allTenantDbs) {
      dbNames = await listTenantDatabases(client, { pattern: args.pattern })
    }
    if (dbNames.length === 0) {
      console.error('Usage: node scripts/finish_v3_cutover.js --db <DB> [--apply]')
      process.exit(1)
    }

    console.log(dryRun ? 'DRY RUN' : 'APPLY')
    for (const name of dbNames) {
      const result = await finishOneDb(client.db(name), dryRun)
      console.log(`\n${result.db}:`)
      for (const a of result.actions) console.log(`  - ${a}`)
      if (result.actions.length === 0) console.log('  (nothing to do)')
    }
  } finally {
    await client.close()
  }
}

if (require.main === module) main()

module.exports = { finishOneDb, cleanupOrphanCaseEvents }
