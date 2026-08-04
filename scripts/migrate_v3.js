#!/usr/bin/env node

/**
 * Schema V3 source → target DB migration.
 *
 * Clones an entire tenant MongoDB database into a new DB name while transforming
 * Posts/Profiles into schema v3, deriving case_events + post_embeddings, and
 * copying all other collections as-is (Topics → topics).
 *
 * Usage:
 *   node scripts/migrate_v3.js --source <SOURCE_DB> --target <TARGET_DB> [--dry-run] [--force]
 *
 * Requires MONGO_URI in .env.local
 */

const { MongoClient, ObjectId } = require('mongodb')
const dotenv = require('dotenv')
const path = require('path')

const {
  transformPostToV3,
  transformProfileToV3,
  buildPostToProfileMap,
  buildUsernameProfileMap,
  normalizePlatform,
} = require('./lib/v3-transform')
const { ensureIndexesV3 } = require('./ensure_indexes_v3')

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const BATCH_SIZE = 100

/** Collections that are transformed rather than binary-copied. */
const TRANSFORMED_SOURCE_NAMES = new Set([
  'Posts',
  'posts',
  'Profiles',
  'profiles',
])

/** Source name → target name for rename-only copies. */
const RENAME_MAP = {
  Topics: 'topics',
  topics: 'topics',
}

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function parseArgs(argv) {
  const args = {
    source: null,
    target: null,
    dryRun: false,
    force: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--source' && argv[i + 1]) args.source = argv[++i]
    else if (a === '--target' && argv[i + 1]) args.target = argv[++i]
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--force') args.force = true
  }
  return args
}

async function upsertBatch(collection, docs, dryRun) {
  if (docs.length === 0) return { success: 0, failed: 0 }
  if (dryRun) return { success: docs.length, failed: 0 }

  const ops = docs.map((doc) => ({
    replaceOne: {
      filter: { _id: doc._id },
      replacement: doc,
      upsert: true,
    },
  }))
  await collection.bulkWrite(ops, { ordered: false })
  return { success: docs.length, failed: 0 }
}

async function insertEventsBatch(collection, events, dryRun) {
  if (events.length === 0) return 0
  if (dryRun) return events.length
  // case_events are append-only; use insertMany (new _ids)
  await collection.insertMany(events, { ordered: false })
  return events.length
}

async function copyCollectionAsIs(sourceCol, targetCol, dryRun, label) {
  const total = await sourceCol.countDocuments({})
  log(`  ${label}: ${total} docs`, 'cyan')
  if (total === 0) return { success: 0, failed: 0 }

  let processed = 0
  let success = 0
  const cursor = sourceCol.find({})
  let batch = []

  while (await cursor.hasNext()) {
    batch.push(await cursor.next())
    if (batch.length >= BATCH_SIZE) {
      const r = await upsertBatch(targetCol, batch, dryRun)
      success += r.success
      processed += batch.length
      batch = []
      if (processed % 500 === 0 || processed === total) {
        log(`    … ${processed}/${total}`, 'cyan')
      }
    }
  }
  if (batch.length > 0) {
    const r = await upsertBatch(targetCol, batch, dryRun)
    success += r.success
    processed += batch.length
  }
  return { success, failed: processed - success }
}

async function resolveSourceCollection(db, candidates) {
  for (const name of candidates) {
    const cols = await db.listCollections({ name }).toArray()
    if (cols.length > 0) return { name, collection: db.collection(name) }
  }
  return null
}

async function migrateProfiles(sourceDb, targetDb, dryRun) {
  const resolved = await resolveSourceCollection(sourceDb, ['Profiles', 'profiles'])
  if (!resolved) {
    log('  No Profiles/profiles collection — skipping', 'yellow')
    return {
      success: 0,
      failed: 0,
      postToProfile: new Map(),
      usernameMap: new Map(),
      sourceProfiles: [],
    }
  }

  const sourceProfiles = await resolved.collection.find({}).toArray()
  log(`  Profiles source (${resolved.name}): ${sourceProfiles.length}`, 'cyan')

  const postToProfile = buildPostToProfileMap(sourceProfiles)
  const usernameMap = buildUsernameProfileMap(sourceProfiles)

  const targetCol = targetDb.collection('profiles')
  let success = 0
  let failed = 0
  const batch = []

  for (const old of sourceProfiles) {
    try {
      const { profile } = transformProfileToV3(old)
      batch.push(profile)
      if (batch.length >= BATCH_SIZE) {
        const r = await upsertBatch(targetCol, batch, dryRun)
        success += r.success
        batch.length = 0
      }
    } catch (err) {
      failed++
      log(`  Profile transform error ${old._id}: ${err.message}`, 'red')
    }
  }
  if (batch.length > 0) {
    const r = await upsertBatch(targetCol, batch, dryRun)
    success += r.success
  }

  log(`  Profiles migrated: ${success} ok, ${failed} failed`, failed ? 'yellow' : 'green')
  return { success, failed, postToProfile, usernameMap, sourceProfiles }
}

function resolveProfileId(post, postToProfile, usernameMap) {
  const key = post._id.toString()
  if (postToProfile.has(key)) return postToProfile.get(key)

  const author = post.author_snapshot || post.profile || post.user || {}
  const platform = normalizePlatform(post.platform)
  const username = (
    author.username ||
    author.name ||
    post.profile?.username ||
    ''
  )
    .toLowerCase()
    .trim()
  if (username && usernameMap.has(`${platform}|${username}`)) {
    return usernameMap.get(`${platform}|${username}`)
  }
  return null
}

async function migratePosts(sourceDb, targetDb, dryRun, postToProfile, usernameMap, force) {
  const resolved = await resolveSourceCollection(sourceDb, ['Posts', 'posts'])
  if (!resolved) {
    log('  No Posts/posts collection — skipping', 'yellow')
    return { success: 0, failed: 0, embeddings: 0, events: 0 }
  }

  const total = await resolved.collection.countDocuments({})
  log(`  Posts source (${resolved.name}): ${total}`, 'cyan')

  const postsCol = targetDb.collection('posts')
  const embCol = targetDb.collection('post_embeddings')
  const eventsCol = targetDb.collection('case_events')

  // Re-runs would duplicate append-only case_events; clear derived collections when forcing
  if (force && !dryRun) {
    await eventsCol.deleteMany({ 'payload.migrated_from': { $exists: true } })
    await embCol.deleteMany({})
    log('  Cleared prior migrated case_events + post_embeddings (--force)', 'yellow')
  }

  let success = 0
  let failed = 0
  let embeddings = 0
  let events = 0
  let processed = 0

  const postBatch = []
  const embBatch = []
  const eventBatch = []

  const flush = async () => {
    if (postBatch.length > 0) {
      const r = await upsertBatch(postsCol, postBatch, dryRun)
      success += r.success
      postBatch.length = 0
    }
    if (embBatch.length > 0) {
      if (!dryRun) {
        const ops = embBatch.map((doc) => ({
          updateOne: {
            filter: { post_id: doc.post_id },
            update: {
              $set: {
                text_embedding: doc.text_embedding,
                image_embedding: doc.image_embedding,
                platform: doc.platform,
                effective_threat_score: doc.effective_threat_score,
              },
              $setOnInsert: { _id: new ObjectId(), post_id: doc.post_id },
            },
            upsert: true,
          },
        }))
        // Drop undefined embedding fields so we don't wipe the other modality
        for (const op of ops) {
          const set = op.updateOne.update.$set
          if (set.text_embedding === undefined) delete set.text_embedding
          if (set.image_embedding === undefined) delete set.image_embedding
        }
        await embCol.bulkWrite(ops, { ordered: false })
      }
      embeddings += embBatch.length
      embBatch.length = 0
    }
    if (eventBatch.length > 0) {
      events += await insertEventsBatch(eventsCol, eventBatch, dryRun)
      eventBatch.length = 0
    }
  }

  const cursor = resolved.collection.find({})
  while (await cursor.hasNext()) {
    const oldPost = await cursor.next()
    processed++
    try {
      const profileId = resolveProfileId(oldPost, postToProfile, usernameMap)
      const { post, embedding, events: evts } = transformPostToV3(oldPost, {
        profileId,
      })
      postBatch.push(post)
      if (embedding) embBatch.push(embedding)
      if (evts?.length) eventBatch.push(...evts)

      if (postBatch.length >= BATCH_SIZE) {
        await flush()
        log(`    … posts ${processed}/${total}`, 'cyan')
      }
    } catch (err) {
      failed++
      log(`  Post transform error ${oldPost._id}: ${err.message}`, 'red')
    }
  }
  await flush()

  log(
    `  Posts migrated: ${success} ok, ${failed} failed; embeddings=${embeddings}; events=${events}`,
    failed ? 'yellow' : 'green'
  )
  return { success, failed, embeddings, events }
}

async function reconcileProfileCounts(targetDb, dryRun) {
  if (dryRun) {
    log('  [dry-run] skip profile count reconcile', 'yellow')
    return
  }

  const profiles = targetDb.collection('profiles')
  const posts = targetDb.collection('posts')
  const allProfiles = await profiles.find({}, { projection: { _id: 1 } }).toArray()
  log(`  Reconciling list.* counts for ${allProfiles.length} profiles…`, 'cyan')

  let updated = 0
  for (const p of allProfiles) {
    const profileId = p._id
    const linked = await posts
      .find(
        { profile_id: profileId },
        { projection: { 'list.effective_threat_score': 1, 'workflow.review_status': 1 } }
      )
      .toArray()

    const postCount = linked.length
    const reviewed = linked.filter((x) => x.workflow?.review_status === 'reviewed')
    const scores = linked
      .map((x) => x.list?.effective_threat_score)
      .filter((s) => s != null && !Number.isNaN(Number(s)))
      .map(Number)
    const maxThreat = scores.length ? Math.max(...scores) : null

    await profiles.updateOne(
      { _id: profileId },
      {
        $set: {
          'list.post_count': postCount,
          'list.reviewed_post_count': reviewed.length,
          'list.max_threat_score': maxThreat,
        },
      }
    )
    updated++
  }
  log(`  Reconciled ${updated} profiles`, 'green')
}

async function copyPassthroughCollections(sourceDb, targetDb, dryRun) {
  const collections = await sourceDb.listCollections().toArray()
  const names = collections.map((c) => c.name).sort()

  let copied = 0
  for (const name of names) {
    if (TRANSFORMED_SOURCE_NAMES.has(name)) continue
    // Skip system collections
    if (name.startsWith('system.')) continue

    const targetName = RENAME_MAP[name] || name
    // Avoid double-copy if both Topics and topics exist
    if (name === 'Topics') {
      const hasLower = names.includes('topics')
      if (hasLower) {
        log(`  Skipping Topics (topics already present)`, 'yellow')
        continue
      }
    }

    log(`  Copy ${name} → ${targetName}`, 'cyan')
    const r = await copyCollectionAsIs(
      sourceDb.collection(name),
      targetDb.collection(targetName),
      dryRun,
      `${name}→${targetName}`
    )
    copied += r.success
  }
  return copied
}

async function targetHasData(db) {
  const cols = await db.listCollections().toArray()
  for (const c of cols) {
    if (c.name.startsWith('system.')) continue
    const count = await db.collection(c.name).estimatedDocumentCount()
    if (count > 0) return true
  }
  return false
}

async function runMigration() {
  const args = parseArgs(process.argv.slice(2))
  const mongoUri = process.env.MONGO_URI

  if (!mongoUri || !args.source || !args.target) {
    log('Usage: node scripts/migrate_v3.js --source <SOURCE_DB> --target <TARGET_DB> [--dry-run] [--force]', 'red')
    log('Requires MONGO_URI in .env.local', 'red')
    process.exit(1)
  }

  if (args.source === args.target) {
    log('ERROR: --source and --target must be different database names', 'red')
    process.exit(1)
  }

  log('========================================', 'bright')
  log(`Migration → schema v3 (${args.dryRun ? 'DRY RUN' : 'LIVE'})`, 'bright')
  log(`Source: ${args.source}`, 'yellow')
  log(`Target: ${args.target}`, 'yellow')
  log('========================================', 'bright')

  const client = new MongoClient(mongoUri)

  try {
    await client.connect()
    log('✓ Connected to MongoDB', 'green')

    const sourceDb = client.db(args.source)
    const targetDb = client.db(args.target)

    const sourceCols = await sourceDb.listCollections().toArray()
    if (sourceCols.length === 0) {
      log('ERROR: Source database has no collections', 'red')
      process.exit(1)
    }
    log(`Source collections: ${sourceCols.map((c) => c.name).join(', ')}`, 'cyan')

    if (!args.dryRun) {
      const occupied = await targetHasData(targetDb)
      if (occupied && !args.force) {
        log(
          'ERROR: Target DB already has data. Re-run with --force to upsert, or choose an empty DB name.',
          'red'
        )
        process.exit(1)
      }
      if (occupied && args.force) {
        log('⚠ Target has data; continuing with --force (upsert)', 'yellow')
      }
    }

    log('\n[1/4] Migrating profiles…', 'bright')
    const {
      postToProfile,
      usernameMap,
      failed: profileFailed,
    } = await migrateProfiles(sourceDb, targetDb, args.dryRun)

    log('\n[2/4] Migrating posts (+ embeddings, case_events)…', 'bright')
    const postResult = await migratePosts(
      sourceDb,
      targetDb,
      args.dryRun,
      postToProfile,
      usernameMap,
      args.force
    )

    log('\n[3/4] Copying remaining collections…', 'bright')
    const passthrough = await copyPassthroughCollections(
      sourceDb,
      targetDb,
      args.dryRun
    )
    log(`  Passthrough docs written: ${passthrough}`, 'green')

    log('\n[4/4] Reconciling profile list counts…', 'bright')
    await reconcileProfileCounts(targetDb, args.dryRun)

    if (!args.dryRun) {
      log('\nCreating v3 indexes on target…', 'bright')
      await ensureIndexesV3(targetDb, (msg) => log(msg, 'cyan'))
    } else {
      log('\n[dry-run] skip index creation', 'yellow')
    }

    log('\n========================================', 'bright')
    log('Migration Summary', 'bright')
    log(`Posts: ${postResult.success} ok / ${postResult.failed} failed`, 'cyan')
    log(`Embeddings: ${postResult.embeddings}`, 'cyan')
    log(`Case events: ${postResult.events}`, 'cyan')
    log(`Profile failures: ${profileFailed}`, profileFailed ? 'yellow' : 'cyan')
    log(
      args.dryRun
        ? 'Dry run complete — no data written.'
        : `Done. Point mongo_db_map / MONGO_DB to "${args.target}" and run: node scripts/verify_v3.js --db ${args.target}`,
      'green'
    )
    log(
      'NOTE: Create Atlas vector_index on post_embeddings (text_embedding / image_embedding) for the new DB.',
      'yellow'
    )
    log('========================================', 'bright')
  } catch (err) {
    log(`Fatal Error: ${err.message}`, 'red')
    console.error(err)
    process.exit(1)
  } finally {
    await client.close()
    log('✓ Disconnected', 'green')
  }
}

runMigration()
