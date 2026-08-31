#!/usr/bin/env node

/**
 * Schema V3 in-place migration.
 *
 * Rewrites Posts/Profiles inside the same tenant DB to schema v3 in the canonical
 * `Posts` collection (PascalCase — matches the UI and ingest contract).
 * Derives case_events + post_embeddings, renames Topics → topics, drops stray
 * lowercase `posts` / legacy `Profiles` (unless --keep-legacy).
 *
 * Usage:
 *   node scripts/migrate_v3_inplace.js --db <DB> [--dry-run] [--force] [--keep-legacy]
 *   node scripts/migrate_v3_inplace.js --dbs db1,db2,... [--dry-run] [--force] [--keep-legacy]
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
const {
  POSTS,
  LEGACY_POSTS,
  LEGACY_PROFILES,
  PROFILES,
  LEGACY_TOPICS,
  TOPICS,
} = require('./lib/collection-names')
const {
  collectionExists,
  resolvePostsSource,
} = require('./lib/schema-health')
const { ensureIndexesV3 } = require('./ensure_indexes_v3')

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const BATCH_SIZE = 100

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
    dbs: [],
    dryRun: false,
    force: false,
    keepLegacy: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--db' && argv[i + 1]) {
      args.dbs.push(argv[++i])
    } else if (a === '--dbs' && argv[i + 1]) {
      args.dbs.push(
        ...argv[++i]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    } else if (a === '--dry-run') args.dryRun = true
    else if (a === '--force') args.force = true
    else if (a === '--keep-legacy') args.keepLegacy = true
  }
  args.dbs = [...new Set(args.dbs)]
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

async function dropIndexSafe(collection, indexName) {
  try {
    await collection.dropIndex(indexName)
    return true
  } catch (err) {
    if (
      err.code === 27 ||
      err.code === 26 ||
      /index not found/i.test(err.message || '') ||
      /ns not found/i.test(err.message || '')
    ) {
      return false
    }
    throw err
  }
}

async function insertEventsBatch(collection, events, dryRun) {
  if (events.length === 0) return 0
  if (dryRun) return events.length
  await collection.insertMany(events, { ordered: false })
  return events.length
}

async function resolveLegacyOrCurrent(db, legacyName, currentName) {
  if (await collectionExists(db, legacyName)) {
    return { name: legacyName, collection: db.collection(legacyName) }
  }
  if (await collectionExists(db, currentName)) {
    return { name: currentName, collection: db.collection(currentName) }
  }
  return null
}

async function isAlreadyMigrated(db) {
  const hasCanonical = await collectionExists(db, POSTS)
  const hasStrayLower = await collectionExists(db, LEGACY_POSTS)
  if (!hasCanonical) return false
  if (hasStrayLower) return false
  const v3 = await db.collection(POSTS).countDocuments({ schema_version: 3 }, { limit: 1 })
  if (v3 > 0) return true
  const total = await db.collection(POSTS).estimatedDocumentCount()
  return total === 0
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

async function migrateProfiles(db, dryRun) {
  const resolved = await resolveLegacyOrCurrent(db, LEGACY_PROFILES, PROFILES)
  if (!resolved) {
    log('  No Profiles/profiles — ensuring empty profiles collection', 'yellow')
    if (!dryRun) await db.createCollection(PROFILES).catch(() => {})
    return {
      success: 0,
      failed: 0,
      postToProfile: new Map(),
      usernameMap: new Map(),
      sourceCount: 0,
      sourceName: null,
    }
  }

  const sourceProfiles = await resolved.collection.find({}).toArray()
  log(`  Profiles source (${resolved.name}): ${sourceProfiles.length}`, 'cyan')

  const postToProfile = buildPostToProfileMap(sourceProfiles)
  const usernameMap = buildUsernameProfileMap(sourceProfiles)
  const targetCol = db.collection(PROFILES)

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
      batch.length = 0
      log(`  Profile transform error ${old._id}: ${err.message}`, 'red')
    }
  }
  if (batch.length > 0) {
    try {
      const r = await upsertBatch(targetCol, batch, dryRun)
      success += r.success
    } catch (err) {
      failed += batch.length
      log(`  Profile batch upsert error: ${err.message}`, 'red')
    }
    batch.length = 0
  }

  log(`  Profiles migrated: ${success} ok, ${failed} failed`, failed ? 'yellow' : 'green')
  return {
    success,
    failed,
    postToProfile,
    usernameMap,
    sourceCount: sourceProfiles.length,
    sourceName: resolved.name,
  }
}

async function migratePosts(db, dryRun, postToProfile, usernameMap, force) {
  const resolved = await resolvePostsSource(db)
  if (!resolved) {
    log(`  No ${POSTS}/${LEGACY_POSTS} — ensuring empty ${POSTS} collection`, 'yellow')
    if (!dryRun) await db.createCollection(POSTS).catch(() => {})
    return {
      success: 0,
      failed: 0,
      embeddings: 0,
      events: 0,
      sourceCount: 0,
      sourceName: null,
      skippedShells: 0,
    }
  }

  const total = await resolved.collection.countDocuments({})
  log(`  Posts source (${resolved.name}): ${total}`, 'cyan')

  const postsCol = db.collection(POSTS)
  const embCol = db.collection('post_embeddings')
  const eventsCol = db.collection('case_events')

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
  let skippedShells = 0

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
    const isShell =
      (oldPost.platform == null || oldPost.platform === '') && oldPost.post_id != null
    if (isShell) {
      skippedShells++
      continue
    }
    try {
      const profileId = resolveProfileId(oldPost, postToProfile, usernameMap)
      const { post, embedding, events: evts } = transformPostToV3(oldPost, { profileId })
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

  if (skippedShells > 0) {
    log(
      `  Skipped ${skippedShells} embedding shell(s) — run cleanup_embedding_shells.js first`,
      'yellow'
    )
  }
  log(
    `  Posts migrated → ${POSTS}: ${success} ok, ${failed} failed; embeddings=${embeddings}; events=${events}`,
    failed ? 'yellow' : 'green'
  )
  return {
    success,
    failed,
    embeddings,
    events,
    skippedShells,
    sourceCount: total,
    sourceName: resolved.name,
  }
}

async function reconcileProfileCounts(db, dryRun) {
  if (dryRun) {
    log('  [dry-run] skip profile count reconcile', 'yellow')
    return
  }

  const profiles = db.collection(PROFILES)
  const posts = db.collection(POSTS)
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

async function renameTopicsIfNeeded(db, dryRun) {
  const hasTopics = await collectionExists(db, LEGACY_TOPICS)
  const hasLower = await collectionExists(db, TOPICS)
  if (!hasTopics) {
    log('  No Topics collection — skip rename', 'cyan')
    return
  }
  if (hasLower) {
    log('  topics already exists — leaving Topics in place (use --force later to drop)', 'yellow')
    return
  }
  if (dryRun) {
    log(`  [dry-run] would rename ${LEGACY_TOPICS} → ${TOPICS}`, 'yellow')
    return
  }
  await db.renameCollection(LEGACY_TOPICS, TOPICS)
  log(`  Renamed ${LEGACY_TOPICS} → ${TOPICS}`, 'green')
}

async function dropStrayCollections(db, dryRun, keepLegacy) {
  if (keepLegacy) {
    log(`  --keep-legacy: leaving ${LEGACY_POSTS}/${LEGACY_PROFILES} in place`, 'yellow')
    return { dropped: [] }
  }
  if (dryRun) {
    log(`  [dry-run] would drop stray ${LEGACY_POSTS} / ${LEGACY_PROFILES}`, 'yellow')
    return { dropped: [] }
  }

  const dropped = []
  for (const name of [LEGACY_POSTS, LEGACY_PROFILES, LEGACY_TOPICS]) {
    if (!(await collectionExists(db, name))) continue
    if (name === LEGACY_TOPICS && !(await collectionExists(db, TOPICS))) continue
    await db.collection(name).drop()
    dropped.push(name)
    log(`  Dropped stray collection: ${name}`, 'green')
  }
  return { dropped }
}

async function migrateOneDb(client, dbName, opts) {
  const { dryRun, force, keepLegacy } = opts
  const db = client.db(dbName)

  log('\n========================================', 'bright')
  log(`In-place → schema v3 (${dryRun ? 'DRY RUN' : 'LIVE'}): ${dbName}`, 'bright')
  log('========================================', 'bright')

  const cols = await db.listCollections().toArray()
  log(
    `Collections: ${cols.map((c) => c.name).sort().join(', ') || '(none)'}`,
    'cyan'
  )

  if (!dryRun && (await isAlreadyMigrated(db)) && !force) {
    log(
      `Already migrated (${POSTS} is v3, no stray ${LEGACY_POSTS}). Skip — re-run with --force to rewrite.`,
      'yellow'
    )
    return { db: dbName, skipped: true, ok: true }
  }

  // Both Posts + posts: if Posts is fully v3, just drop stray lowercase posts.
  if (
    !dryRun &&
    (await collectionExists(db, POSTS)) &&
    (await collectionExists(db, LEGACY_POSTS)) &&
    !force
  ) {
    const postsCount = await db.collection(POSTS).countDocuments({})
    const v3Count = await db.collection(POSTS).countDocuments({ schema_version: 3 })
    const strayCount = await db.collection(LEGACY_POSTS).countDocuments({})
    if (postsCount > 0 && v3Count === postsCount) {
      log(
        `${POSTS} is fully v3 (${postsCount}); dropping stray ${LEGACY_POSTS} (${strayCount})…`,
        'yellow'
      )
      if (await collectionExists(db, LEGACY_PROFILES)) {
        const profilesV3 = await db.collection(PROFILES).countDocuments({ schema_version: 3 })
        const profilesTotal = await db.collection(PROFILES).countDocuments({})
        if (profilesTotal > 0 && profilesV3 !== profilesTotal) {
          log('profiles is not fully v3 — refusing stray drop. Re-run with --force.', 'red')
          return {
            db: dbName,
            skipped: false,
            ok: false,
            error: 'partial dual collections; profiles not fully v3; need --force',
          }
        }
      }
      await reconcileProfileCounts(db, false)
      await ensureIndexesV3(db, (msg) => log(msg, 'cyan'))
      const { dropped } = await dropStrayCollections(db, false, keepLegacy)
      log(`Done. Dropped: ${dropped.join(', ') || '(none)'}`, 'green')
      return {
        db: dbName,
        skipped: false,
        ok: true,
        posts: postsCount,
        profiles: await db.collection(PROFILES).countDocuments({}),
        embeddings: await db.collection('post_embeddings').countDocuments({}),
        events: await db.collection('case_events').countDocuments({}),
      }
    }
    if (strayCount > 0) {
      log(
        `Both ${POSTS} and ${LEGACY_POSTS} exist (partial prior run). Re-run with --force.`,
        'red'
      )
      return {
        db: dbName,
        skipped: false,
        ok: false,
        error: 'partial dual collections; need --force',
      }
    }
  }

  if (force && !dryRun) {
    const droppedPostIdx = await dropIndexSafe(
      db.collection(POSTS),
      'platform_platform_post_id_unique'
    )
    const droppedProfileIdx = await dropIndexSafe(
      db.collection(PROFILES),
      'platform_platform_user_id_unique'
    )
    if (droppedPostIdx || droppedProfileIdx) {
      log(
        `  Dropped unique indexes for --force rewrite (${[
          droppedPostIdx && POSTS,
          droppedProfileIdx && PROFILES,
        ]
          .filter(Boolean)
          .join(', ')})`,
        'yellow'
      )
    }
  }

  log('\n[1/5] Migrating profiles…', 'bright')
  const profileResult = await migrateProfiles(db, dryRun)

  log('\n[2/5] Migrating posts (+ embeddings, case_events)…', 'bright')
  const postResult = await migratePosts(
    db,
    dryRun,
    profileResult.postToProfile,
    profileResult.usernameMap,
    force
  )

  log('\n[3/5] Topics rename…', 'bright')
  await renameTopicsIfNeeded(db, dryRun)

  log('\n[4/5] Reconciling profile list counts…', 'bright')
  await reconcileProfileCounts(db, dryRun)

  if (!dryRun) {
    log('\n[5/5] Creating v3 indexes…', 'bright')
    await ensureIndexesV3(db, (msg) => log(msg, 'cyan'))
  } else {
    log('\n[5/5] [dry-run] skip index creation', 'yellow')
  }

  if (!dryRun) {
    const targetPosts = await db.collection(POSTS).countDocuments({})
    const targetProfiles = await db.collection(PROFILES).countDocuments({})
    if (targetPosts > postResult.sourceCount) {
      throw new Error(
        `Post count mismatch: source=${postResult.sourceCount} vs ${POSTS}=${targetPosts}`
      )
    }
    if (targetPosts < postResult.sourceCount) {
      log(
        `  Post count: source=${postResult.sourceCount} → ${POSTS}=${targetPosts} (dupes pruned)`,
        'yellow'
      )
    }
    if (
      profileResult.sourceName === LEGACY_PROFILES &&
      profileResult.sourceCount !== targetProfiles
    ) {
      if (targetProfiles >= profileResult.sourceCount) {
        log(
          `  Profile count: source ${LEGACY_PROFILES}=${profileResult.sourceCount} → ${PROFILES}=${targetProfiles}`,
          'yellow'
        )
      } else {
        throw new Error(
          `Profile count mismatch: source ${LEGACY_PROFILES}=${profileResult.sourceCount} vs ${PROFILES}=${targetProfiles}`
        )
      }
    }
    log(`  Count check ok: ${POSTS}=${targetPosts}, ${PROFILES}=${targetProfiles}`, 'green')
  }

  log('\nDropping stray collections…', 'bright')
  const { dropped } = await dropStrayCollections(db, dryRun, keepLegacy)

  log('\n----------------------------------------', 'bright')
  log(`Summary: ${dbName}`, 'bright')
  log(`Posts: ${postResult.success} ok / ${postResult.failed} failed`, 'cyan')
  log(`Embeddings: ${postResult.embeddings}`, 'cyan')
  log(`Case events: ${postResult.events}`, 'cyan')
  log(`Profile failures: ${profileResult.failed}`, profileResult.failed ? 'yellow' : 'cyan')
  if (dropped.length) log(`Dropped stray: ${dropped.join(', ')}`, 'cyan')
  log(
    dryRun
      ? 'Dry run complete — no data written.'
      : `Done. Run: node scripts/verify_v3.js --db ${dbName}`,
    'green'
  )
  log(
    'NOTE: Create/point Atlas vector_index at post_embeddings for this DB.',
    'yellow'
  )

  return {
    db: dbName,
    skipped: false,
    ok: postResult.failed === 0 && profileResult.failed === 0,
    posts: postResult.success,
    profiles: profileResult.success,
    embeddings: postResult.embeddings,
    events: postResult.events,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const mongoUri = process.env.MONGO_URI

  if (!mongoUri || args.dbs.length === 0) {
    log(
      'Usage: node scripts/migrate_v3_inplace.js --db <DB> [--dry-run] [--force] [--keep-legacy]',
      'red'
    )
    log(
      '   or: node scripts/migrate_v3_inplace.js --dbs db1,db2,... [--dry-run] [--force] [--keep-legacy]',
      'red'
    )
    log('Requires MONGO_URI in .env.local', 'red')
    process.exit(1)
  }

  const client = new MongoClient(mongoUri)
  const results = []

  try {
    await client.connect()
    log('✓ Connected to MongoDB', 'green')
    log(`Databases: ${args.dbs.join(', ')}`, 'yellow')

    for (const dbName of args.dbs) {
      try {
        const r = await migrateOneDb(client, dbName, args)
        results.push(r)
        if (!r.ok && !r.skipped) {
          log(`FAILED: ${dbName}`, 'red')
        }
      } catch (err) {
        log(`Fatal for ${dbName}: ${err.message}`, 'red')
        console.error(err)
        results.push({ db: dbName, ok: false, error: err.message })
      }
    }
  } finally {
    await client.close()
    log('\n✓ Disconnected', 'green')
  }

  log('\n========================================', 'bright')
  log('Batch summary', 'bright')
  for (const r of results) {
    if (r.skipped) log(`  ${r.db}: skipped (already migrated)`, 'yellow')
    else if (r.ok) log(`  ${r.db}: OK (Posts=${r.posts ?? '?'})`, 'green')
    else log(`  ${r.db}: FAIL ${r.error || ''}`, 'red')
  }
  log('========================================', 'bright')

  if (results.some((r) => !r.ok && !r.skipped)) process.exit(1)
}

main()
