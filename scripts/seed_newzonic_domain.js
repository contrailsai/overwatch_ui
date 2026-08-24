#!/usr/bin/env node

/**
 * Upsert domain review fixtures (live-captured analysis) into tenant DBs.
 *
 * Usage:
 *   node scripts/seed_newzonic_domain.js
 *   node scripts/seed_newzonic_domain.js --db PMO-Data-Search
 *
 * Loads every `Domains.json` / `Domains.*.json` sample in
 * sample_documents/mongodb_schema/. MONGO_URI is read from .env.local
 */

const fs = require('fs')
const path = require('path')
const { MongoClient, ObjectId, BSON } = require('mongodb')
const dotenv = require('dotenv')

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const SAMPLE_DIR = path.join(__dirname, '../sample_documents/mongodb_schema')

const TENANT_DBS = [
  'PMO-Data-v2',
  'PMO-Data-Search',
  'Delta-Exchange-Data',
  'PMO_Staging',
  'Ambani-Data-Search',
  'Bhutan-Online-Threats',
  'Giotuss-Data-Search',
  'i4c-Data',
  'ICICI-Data-Search',
  'Youtube-Data-Search',
  'Coindcx-Data-Search',
  'RIL-Data-Search',
  'MIB-PMO-Data-Search',
  'Red-Chillies-Data',
  'Airtel-Payments-Bank-Data',
  'TVS-Credit-Data',
  'jubilant-Data',
  'Goa-Gov-Data-Search',
  'SEBI-Data-Search',
  'Ads-Ingest-Smoke',
]

function parseArgs(argv) {
  const dbs = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db' && argv[i + 1]) dbs.push(argv[++i])
  }
  return { dbs }
}

function loadFixtures() {
  const files = fs.readdirSync(SAMPLE_DIR)
    .filter((name) => /^Domains(\..+)?\.json$/.test(name))
    .sort()
  return files.map((name) => {
    const raw = fs.readFileSync(path.join(SAMPLE_DIR, name), 'utf8')
    const doc = BSON.EJSON.parse(raw, { relaxed: false })
    delete doc._id
    return { name, doc }
  })
}

async function upsertDomain(db, doc) {
  const collection = db.collection('Domains')
  await collection.createIndex({ domain_name: 1 }, { unique: true, name: 'domain_name_unique' })
  await collection.createIndex(
    { 'workflow.review_status': 1, 'list.last_analyzed_at': -1 },
    { name: 'review_status_last_analyzed' },
  )

  const now = new Date()
  const existing = await collection.findOne({ domain_name: doc.domain_name })
  const next = {
    ...doc,
    system: {
      created_at: existing?.system?.created_at || doc.system?.created_at || now,
      updated_at: now,
    },
  }

  if (existing) {
    next._id = existing._id
    await collection.replaceOne({ _id: existing._id }, next)
    return { action: 'replaced', id: existing._id.toString() }
  }

  const result = await collection.insertOne(next)
  return { action: 'inserted', id: result.insertedId.toString() }
}

async function insertDiscoveredEvent(db, domainId, doc) {
  const events = db.collection('case_events')
  const existing = await events.findOne({
    entity_type: 'domain',
    entity_id: domainId,
    event_type: 'Domain Fixture Seeded',
  })
  if (existing) return
  await events.insertOne({
    entity_type: 'domain',
    entity_id: domainId,
    event_type: 'Domain Fixture Seeded',
    actor: 'seed_newzonic_domain',
    summary: `Seeded ${doc.domain_name} domain review fixture from live page capture`,
    payload: {
      domain_name: doc.domain_name,
      source_url: doc.discovery?.first_seen_url,
    },
    occurred_at: new Date(),
    source: 'ingest',
  })
}

async function main() {
  const { dbs: requested } = parseArgs(process.argv.slice(2))
  const mongoUri = process.env.MONGO_URI
  if (!mongoUri) {
    console.error('ERROR: Missing MONGO_URI in .env.local')
    process.exit(1)
  }

  const fixtures = loadFixtures()
  if (fixtures.length === 0) {
    console.error('No Domains*.json fixtures found.')
    process.exit(1)
  }

  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 8000 })
  await client.connect()

  try {
    const existingNames = new Set((await client.db().admin().listDatabases()).databases.map((d) => d.name))
    const targets = (requested.length ? requested : TENANT_DBS).filter((name) => existingNames.has(name))
    const missing = (requested.length ? requested : TENANT_DBS).filter((name) => !existingNames.has(name))

    if (targets.length === 0) {
      console.error('No matching tenant databases found.')
      process.exit(1)
    }

    for (const name of targets) {
      const db = client.db(name)
      for (const { doc } of fixtures) {
        const result = await upsertDomain(db, doc)
        await insertDiscoveredEvent(db, new ObjectId(result.id), doc)
        console.log(`✓ ${name}: ${result.action} ${doc.domain_name} (${result.id})`)
      }
    }

    if (missing.length) {
      console.log(`skipped missing dbs: ${missing.join(', ')}`)
    }
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
