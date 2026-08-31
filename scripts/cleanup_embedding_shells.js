#!/usr/bin/env node

/**
 * Remove empty embedding shells: merge vectors into post_embeddings on the real post, delete shell.
 *
 * Shell pattern: { platform: { $exists: false }, post_id: { $exists: true } }
 * where post_id references another Posts doc that has platform + content.
 *
 * Usage:
 *   node scripts/cleanup_embedding_shells.js --db Rajasthan-Data-Search --dry-run
 *   node scripts/cleanup_embedding_shells.js --dbs Rajasthan-Data-Search,AirForce-Data-Search --apply
 *
 * Requires MONGO_URI in .env.local
 */

const { MongoClient, ObjectId } = require('mongodb')
const dotenv = require('dotenv')
const path = require('path')

const { extractPostEmbedding } = require('./lib/v3-transform')
const {
  SHELL_FILTER,
  resolvePostsCollection,
  findRealPost,
  hasEmbeddingVectors,
  listTenantDatabases,
  parseDbArgs,
} = require('./lib/schema-health')

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function upsertEmbedding(embCol, embedding, dryRun) {
  if (!embedding) return false

  const set = {
    platform: embedding.platform,
    effective_threat_score: embedding.effective_threat_score ?? null,
  }
  if (embedding.text_embedding) set.text_embedding = embedding.text_embedding
  if (embedding.image_embedding) set.image_embedding = embedding.image_embedding

  if (dryRun) return true

  await embCol.updateOne(
    { post_id: embedding.post_id },
    {
      $set: set,
      $setOnInsert: { _id: new ObjectId(), post_id: embedding.post_id },
    },
    { upsert: true }
  )
  return true
}

async function cleanupDatabase(db, dryRun) {
  const resolved = await resolvePostsCollection(db)
  if (!resolved) {
    return {
      db: db.databaseName,
      ok: true,
      skipped: true,
      reason: 'no Posts/posts collection',
      shells_found: 0,
      merged: 0,
      deleted: 0,
      orphans: 0,
    }
  }

  const { name: postsName, collection: postsCol } = resolved
  const embCol = db.collection('post_embeddings')

  const shells = await postsCol.find(SHELL_FILTER).toArray()
  let merged = 0
  let deleted = 0
  let orphans = 0
  const orphanIds = []

  for (const shell of shells) {
    const real = await findRealPost(postsCol, shell)

    if (!real) {
      orphans++
      orphanIds.push(shell._id.toString())
      log(`  orphan shell ${shell._id} (post_id=${shell.post_id}) — no real post`, 'yellow')
      continue
    }

    if (real._id.toString() === shell._id.toString()) {
      continue
    }

    const stubPost = {
      _id: real._id,
      platform: real.platform,
      list: real.list || {},
      text_embedding: shell.text_embedding,
      image_embedding: shell.image_embedding,
      embeddings: shell.embeddings,
    }
    const embedding = extractPostEmbedding(shell, stubPost)

    if (embedding) {
      const didMerge = await upsertEmbedding(embCol, embedding, dryRun)
      if (didMerge) merged++
      log(
        `  ${dryRun ? '[dry-run] ' : ''}merge embeddings shell ${shell._id} → real ${real._id}`,
        'cyan'
      )
    } else if (hasEmbeddingVectors(shell)) {
      log(`  shell ${shell._id} has vectors but extract failed — skipping delete`, 'yellow')
      continue
    }

    if (dryRun) {
      deleted++
    } else {
      await postsCol.deleteOne({ _id: shell._id })
      deleted++
    }
  }

  return {
    db: db.databaseName,
    ok: true,
    skipped: false,
    posts_collection: postsName,
    shells_found: shells.length,
    merged,
    deleted,
    orphans,
    orphan_ids: orphanIds.slice(0, 20),
  }
}

async function main() {
  const args = parseDbArgs(process.argv.slice(2))
  const mongoUri = process.env.MONGO_URI

  if (!mongoUri) {
    log('ERROR: MONGO_URI missing in .env.local', 'red')
    process.exit(1)
  }

  const dryRun = !args.apply
  const client = new MongoClient(mongoUri)
  const results = []

  try {
    await client.connect()
    log('✓ Connected to MongoDB', 'green')
    log(dryRun ? 'Mode: DRY RUN (use --apply to write)' : 'Mode: APPLY', dryRun ? 'yellow' : 'red')

    let dbNames = args.dbs
    if (args.allTenantDbs) {
      dbNames = await listTenantDatabases(client, { pattern: args.pattern })
    }

    if (dbNames.length === 0) {
      log(
        'Usage: node scripts/cleanup_embedding_shells.js --db <DB> [--dry-run|--apply]',
        'red'
      )
      process.exit(1)
    }

    for (const dbName of dbNames) {
      log('\n========================================', 'bright')
      log(`${dbName}`, 'bright')
      log('========================================', 'bright')
      const result = await cleanupDatabase(client.db(dbName), dryRun)
      results.push(result)
      log(
        `Shells: ${result.shells_found}, merged: ${result.merged}, deleted: ${result.deleted}, orphans: ${result.orphans}`,
        result.shells_found ? 'yellow' : 'green'
      )
    }

    const totals = results.reduce(
      (acc, r) => ({
        shells: acc.shells + r.shells_found,
        merged: acc.merged + r.merged,
        deleted: acc.deleted + r.deleted,
        orphans: acc.orphans + r.orphans,
      }),
      { shells: 0, merged: 0, deleted: 0, orphans: 0 }
    )

    log('\n----------------------------------------', 'bright')
    log(`Totals — shells: ${totals.shells}, merged: ${totals.merged}, deleted: ${totals.deleted}, orphans: ${totals.orphans}`, 'cyan')
    if (dryRun && totals.deleted > 0) {
      log('Re-run with --apply to execute deletes and embedding upserts.', 'yellow')
    }
  } catch (err) {
    log(`Fatal: ${err.message}`, 'red')
    console.error(err)
    process.exit(1)
  } finally {
    await client.close()
  }
}

if (require.main === module) {
  main()
}

module.exports = { cleanupDatabase, main }
