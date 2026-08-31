#!/usr/bin/env node

/**
 * Legacy cleanup: copy mistaken lowercase `posts` → canonical `Posts`, then drop `posts`.
 *
 * Prefer migrate_v3_inplace.js (writes directly to Posts). Use this script only when a
 * tenant DB still has v3 data in lowercase `posts` with no `Posts` collection.
 *
 * Usage:
 *   node scripts/migrate_posts_to_Posts.js --db Ambani-Data-Search --dry-run
 *   node scripts/migrate_posts_to_Posts.js --db Ambani-Data-Search
 *
 * Requires MONGO_URI in .env.local
 */

const { MongoClient } = require('mongodb')
const dotenv = require('dotenv')
const path = require('path')
const { ensureIndexesV3 } = require('./ensure_indexes_v3')

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const SOURCE = 'posts'
const TARGET = 'Posts'
const BATCH_SIZE = 200

function parseArgs(argv) {
  const args = { db: null, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db' && argv[i + 1]) {
      args.db = argv[++i]
    } else if (argv[i] === '--dry-run') {
      args.dryRun = true
    }
  }
  return args
}

async function collectionExists(db, name) {
  const cols = await db.listCollections({ name }).toArray()
  return cols.length > 0
}

async function copyIndexes(sourceCol, targetCol, dryRun, log) {
  const indexes = await sourceCol.indexes()
  let copied = 0
  for (const idx of indexes) {
    if (idx.name === '_id_') continue
    const { key, name, ...options } = idx
    delete options.v
    delete options.ns
    log(`  index: ${name}`)
    if (dryRun) {
      copied++
      continue
    }
    try {
      await targetCol.createIndex(key, { ...options, name })
      copied++
    } catch (err) {
      if (/already exists/i.test(err.message || '')) {
        log(`    (already exists: ${name})`)
        copied++
      } else {
        throw err
      }
    }
  }
  return copied
}

async function migratePostsToPosts(db, dryRun, log) {
  const hasSource = await collectionExists(db, SOURCE)
  if (!hasSource) {
    log(`Source collection "${SOURCE}" does not exist — nothing to migrate.`)
    return { copied: 0, sourceCount: 0, targetBefore: 0, targetAfter: 0 }
  }

  const sourceCol = db.collection(SOURCE)
  const targetCol = db.collection(TARGET)

  const sourceCount = await sourceCol.countDocuments({})
  const targetBefore = await targetCol.countDocuments({})
  log(`Counts before: ${SOURCE}=${sourceCount}, ${TARGET}=${targetBefore}`)

  if (sourceCount === 0) {
    log(`Source "${SOURCE}" is empty — skipping document copy.`)
  } else {
    let processed = 0
    const cursor = sourceCol.find({})
    let batch = []

    for await (const doc of cursor) {
      batch.push(doc)
      if (batch.length >= BATCH_SIZE) {
        if (!dryRun) {
          const ops = batch.map((d) => ({
            replaceOne: {
              filter: { _id: d._id },
              replacement: d,
              upsert: true,
            },
          }))
          await targetCol.bulkWrite(ops, { ordered: false })
        }
        processed += batch.length
        log(`  copied ${processed}/${sourceCount}`)
        batch = []
      }
    }

    if (batch.length > 0) {
      if (!dryRun) {
        const ops = batch.map((d) => ({
          replaceOne: {
            filter: { _id: d._id },
            replacement: d,
            upsert: true,
          },
        }))
        await targetCol.bulkWrite(ops, { ordered: false })
      }
      processed += batch.length
      log(`  copied ${processed}/${sourceCount}`)
    }
  }

  log(`Copying indexes from ${SOURCE} → ${TARGET}…`)
  const indexCount = await copyIndexes(sourceCol, targetCol, dryRun, log)
  log(`Indexes copied/skipped: ${indexCount}`)

  if (!dryRun) {
    log('Ensuring v3 indexes on Posts…')
    await ensureIndexesV3(db, log)
  } else {
    log('[dry-run] would run ensureIndexesV3 on Posts')
  }

  const targetAfter = dryRun
    ? targetBefore + sourceCount
    : await targetCol.countDocuments({})

  if (!dryRun && targetAfter < sourceCount + targetBefore) {
    throw new Error(
      `Post-migration count check failed: expected at least ${sourceCount + targetBefore}, got ${targetAfter}`
    )
  }

  const sample = dryRun ? null : await targetCol.findOne({ schema_version: 3 })
  if (!dryRun && sourceCount > 0 && !sample) {
    log('Warning: no schema_version:3 sample found in Posts after migration')
  } else if (sample) {
    log(
      `Sample doc ok: _id=${sample._id}, schema_version=${sample.schema_version}, review_status=${sample.workflow?.review_status ?? 'n/a'}`
    )
  }

  if (!dryRun) {
    await db.collection(SOURCE).drop()
    log(`Dropped collection "${SOURCE}"`)
  } else {
    log(`[dry-run] would drop collection "${SOURCE}"`)
  }

  const stillHasSource = dryRun ? hasSource : await collectionExists(db, SOURCE)
  log(`Final: ${TARGET}=${targetAfter}, ${SOURCE} exists=${stillHasSource}`)

  return {
    copied: sourceCount,
    sourceCount,
    targetBefore,
    targetAfter,
    indexCount,
  }
}

async function main() {
  const { db: dbName, dryRun } = parseArgs(process.argv.slice(2))
  const mongoUri = process.env.MONGO_URI

  if (!mongoUri || !dbName) {
    console.error('Usage: node scripts/migrate_posts_to_Posts.js --db <TARGET_DB> [--dry-run]')
    console.error('Requires MONGO_URI in .env.local')
    process.exit(1)
  }

  const log = (msg) => console.log(dryRun ? `[dry-run] ${msg}` : msg)
  log(`Migrating ${SOURCE} → ${TARGET} in database "${dbName}"`)

  const client = new MongoClient(mongoUri)
  try {
    await client.connect()
    const result = await migratePostsToPosts(client.db(dbName), dryRun, log)
    log('Done.')
    log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error('Migration failed:', err.message)
    process.exit(1)
  } finally {
    await client.close()
  }
}

if (require.main === module) {
  main()
}

module.exports = { migratePostsToPosts }
