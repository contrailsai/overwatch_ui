#!/usr/bin/env node

/**
 * Seed IAF parent-topic hubs (+ residual child catch-alls) into AirForce-Data-Search.topics
 * so Posts Nexus → Parent topics has a tree to render.
 *
 * Does not assign posts. Run classify.py after GEMINI_API_KEY is set.
 *
 *   node scripts/iaf_parent_topics/seed_parents.js --dry-run
 *   node scripts/iaf_parent_topics/seed_parents.js --replace --db AirForce-Data-Search
 */

const { MongoClient } = require('mongodb')
const dotenv = require('dotenv')
const fs = require('fs')
const path = require('path')

dotenv.config({ path: path.join(__dirname, '../../.env.local') })

const taxonomy = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'taxonomy.json'), 'utf8')
)

function parseArgs(argv) {
  const out = { dryRun: false, db: taxonomy.db, withSeeds: true, replace: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--no-seeds') out.withSeeds = false
    else if (a === '--replace') out.replace = true
    else if (a === '--db' && argv[i + 1]) out.db = argv[++i]
  }
  return out
}

function parentDoc(pillar, now) {
  return {
    topic_id: pillar.topic_id,
    title: pillar.name,
    narrative: pillar.description,
    category: pillar.pillar_id,
    type: 'active',
    parent_topic_id: null,
    pillar_id: pillar.pillar_id,
    pois: [],
    poi_names: [],
    keywords: [],
    posts: [],
    post_count: 0,
    first_posted_at: null,
    last_posted_at: null,
    created_at: now,
    updated_at: now,
    created_by: 'iaf_parent_topics_pipeline',
    status: 'active',
    seed: false,
    hub_kind: 'parent_topic',
  }
}

function seedDoc(seed, pillarById, now) {
  const pillar = pillarById[seed.pillar_id]
  return {
    topic_id: seed.topic_id,
    title: seed.name,
    narrative: seed.summary,
    category: seed.pillar_id,
    type: 'passive',
    parent_topic_id: pillar.topic_id,
    pillar_id: seed.pillar_id,
    pois: [],
    poi_names: [],
    keywords: [],
    posts: [],
    post_count: 0,
    first_posted_at: null,
    last_posted_at: null,
    created_at: now,
    updated_at: now,
    created_by: 'iaf_parent_topics_pipeline',
    status: 'active',
    seed: true,
    hub_kind: 'topic',
  }
}

async function main() {
  const args = parseArgs(process.argv)
  const uri = process.env.MONGO_URI
  if (!uri) throw new Error('MONGO_URI missing')

  const now = new Date()
  const pillarById = Object.fromEntries(
    taxonomy.pillars.map((p) => [p.pillar_id, p])
  )
  const docs = taxonomy.pillars.map((p) => parentDoc(p, now))
  if (args.withSeeds) {
    docs.push(...taxonomy.seeds.map((s) => seedDoc(s, pillarById, now)))
  }

  console.log(
    JSON.stringify(
      {
        db: args.db,
        dryRun: args.dryRun,
        replace: args.replace,
        parents: docs.filter((d) => !d.parent_topic_id).length,
        seeds: docs.filter((d) => d.seed).length,
        topic_ids: docs.map((d) => d.topic_id),
      },
      null,
      2
    )
  )

  if (args.dryRun) return

  const client = new MongoClient(uri)
  await client.connect()
  const coll = client.db(args.db).collection('topics')
  await coll.createIndex({ topic_id: 1 }, { unique: true, name: 'topic_id_unique' })

  if (args.replace) {
    const keep = new Set(docs.map((d) => d.topic_id))
    const deleted = await coll.deleteMany({
      created_by: 'iaf_parent_topics_pipeline',
      topic_id: { $nin: [...keep] },
    })
    console.log(JSON.stringify({ deleted_stale: deleted.deletedCount }))
  }

  let upserted = 0
  for (const doc of docs) {
    const {
      topic_id,
      created_at,
      posts,
      post_count,
      first_posted_at,
      last_posted_at,
      ...meta
    } = doc
    const result = await coll.updateOne(
      { topic_id },
      {
        $set: { ...meta, updated_at: now },
        $setOnInsert: {
          topic_id,
          created_at,
          posts: posts || [],
          post_count: post_count || 0,
          first_posted_at: first_posted_at ?? null,
          last_posted_at: last_posted_at ?? null,
        },
      },
      { upsert: true }
    )
    if (result.upsertedCount || result.modifiedCount) upserted += 1
  }

  const total = await coll.countDocuments()
  console.log(JSON.stringify({ upserted, topics_total: total }, null, 2))
  await client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
