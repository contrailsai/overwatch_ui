#!/usr/bin/env node

/**
 * Seed / refresh tenant `pois` docs from distinct review_details.poi_names on Posts.
 *
 * Usage:
 *   node scripts/seed_pois_from_posts.js --db Ambani-Data-Search --from 2026-08-01 --dry-run
 *   node scripts/seed_pois_from_posts.js --db Ambani-Data-Search --from 2026-08-01
 *   node scripts/seed_pois_from_posts.js --db Ambani-Data-Search --force-meta
 *
 * Idempotent: upserts by lowercase `name`. Re-runs refresh `post_count` only unless --force-meta.
 */

const { MongoClient } = require('mongodb')
const dotenv = require('dotenv')
const path = require('path')

dotenv.config({ path: path.join(__dirname, '../.env.local') })

function parseArgs(argv) {
  const out = {
    db: null,
    from: null,
    to: null,
    dryRun: false,
    forceMeta: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--db') out.db = argv[++i]
    else if (a === '--from') out.from = argv[++i]
    else if (a === '--to') out.to = argv[++i]
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--force-meta') out.forceMeta = true
  }
  return out
}

function normalizeNameKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function parseDateBound(value, endOfDay) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${value}`)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && endOfDay) {
    d.setUTCHours(23, 59, 59, 999)
  }
  return d
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const mongoUri = process.env.MONGO_URI
  const dbName = args.db || process.env.MONGO_DB || process.env.MONGO_DB_NAME

  if (!mongoUri || !dbName) {
    console.error('Usage: node scripts/seed_pois_from_posts.js --db <DB> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run] [--force-meta]')
    console.error('Requires MONGO_URI in .env.local')
    process.exit(1)
  }

  const from = parseDateBound(args.from, false)
  const to = parseDateBound(args.to, true)

  const client = new MongoClient(mongoUri)
  await client.connect()
  const db = client.db(dbName)
  const posts = db.collection('Posts')
  const pois = db.collection('pois')

  console.log(`DB: ${dbName}`)
  console.log(`Dry run: ${args.dryRun}`)
  console.log(`Force meta: ${args.forceMeta}`)
  if (from) console.log(`From sourced_at: ${from.toISOString()}`)
  if (to) console.log(`To sourced_at: ${to.toISOString()}`)

  await pois.createIndex({ name: 1 }, { unique: true, name: 'name_unique' })
  await posts.createIndex(
    { 'review_details.poi_names': 1, 'list.sourced_at': -1 },
    { name: 'poi_names_sourced_at' }
  )

  const match = {
    'review_details.poi_names.0': { $exists: true },
  }
  if (from || to) {
    match['list.sourced_at'] = {}
    if (from) match['list.sourced_at'].$gte = from
    if (to) match['list.sourced_at'].$lte = to
  }

  const rows = await posts
    .aggregate([
      { $match: match },
      { $unwind: '$review_details.poi_names' },
      {
        $group: {
          _id: '$review_details.poi_names',
          post_count: { $sum: 1 },
          first_seen: { $min: '$list.sourced_at' },
        },
      },
      { $sort: { post_count: -1 } },
    ])
    .toArray()

  console.log(`Distinct POI name strings: ${rows.length}`)

  const now = new Date()
  let created = 0
  let updated = 0
  let skipped = 0

  for (const row of rows) {
    const displayName = String(row._id || '').trim()
    if (!displayName) {
      skipped += 1
      continue
    }
    const name = normalizeNameKey(displayName)
    if (!name) {
      skipped += 1
      continue
    }

    const existing = await pois.findOne({ name })
    const postCount = row.post_count || 0

    if (!existing) {
      const doc = {
        name,
        display_name: displayName,
        aliases: [],
        tier: 'other',
        summary: '',
        image: { s3_url: null, s3_key: null },
        meta: {
          title: '',
          organization: '',
          state: '',
          notes: '',
        },
        topics: [],
        topic_count: 0,
        post_count: postCount,
        is_shell: false,
        status: 'active',
        merged_into: null,
        created_at: now,
        updated_at: now,
      }
      console.log(`CREATE ${displayName} (posts=${postCount})`)
      if (!args.dryRun) {
        await pois.insertOne(doc)
      }
      created += 1
      continue
    }

    const setFields = {
      post_count: postCount,
      updated_at: now,
    }

    if (args.forceMeta) {
      setFields.display_name = displayName
      setFields.tier = existing.tier || 'other'
      if (!Array.isArray(existing.aliases)) setFields.aliases = []
      if (!existing.image) setFields.image = { s3_url: null, s3_key: null }
      if (!existing.meta) {
        setFields.meta = { title: '', organization: '', state: '', notes: '' }
      }
      if (existing.summary == null) setFields.summary = ''
      if (existing.status == null) setFields.status = 'active'
      if (existing.merged_into === undefined) setFields.merged_into = null
      if (existing.is_shell == null) setFields.is_shell = false
    } else {
      // Fill missing informatics fields without clobbering human edits
      if (existing.tier == null) setFields.tier = 'other'
      if (!Array.isArray(existing.aliases)) setFields.aliases = []
      if (existing.summary == null) setFields.summary = ''
      if (!existing.image) setFields.image = { s3_url: null, s3_key: null }
      if (!existing.meta) {
        setFields.meta = { title: '', organization: '', state: '', notes: '' }
      }
      if (existing.status == null) setFields.status = 'active'
      if (existing.merged_into === undefined) setFields.merged_into = null
    }

    console.log(`UPDATE ${existing.display_name || displayName} (posts=${postCount})`)
    if (!args.dryRun) {
      await pois.updateOne({ _id: existing._id }, { $set: setFields })
    }
    updated += 1
  }

  console.log('\nDone.')
  console.log(JSON.stringify({ created, updated, skipped, total: rows.length, dryRun: args.dryRun }, null, 2))
  await client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
