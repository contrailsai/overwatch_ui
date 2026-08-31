#!/usr/bin/env node

/**
 * Read-only audit: v1 flat posts, partial v3, embedding shells, inline vectors.
 *
 * Usage:
 *   node scripts/audit_schema_health.js --db Rajasthan-Data-Search
 *   node scripts/audit_schema_health.js --dbs db1,db2
 *   node scripts/audit_schema_health.js --all-tenant-dbs
 *   node scripts/audit_schema_health.js --all-tenant-dbs --json-out scripts/out/audit_report.json
 *
 * Requires MONGO_URI in .env.local
 */

const fs = require('fs')
const path = require('path')
const { MongoClient } = require('mongodb')
const dotenv = require('dotenv')

const {
  auditDatabase,
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

function printRow(metrics) {
  const flag = metrics.needs_migration ? 'YES' : 'ok'
  log(
    [
      metrics.db.padEnd(28),
      String(metrics.total_posts).padStart(6),
      String(metrics.v1_flat).padStart(6),
      String(metrics.partial_v3).padStart(6),
      String(metrics.shells).padStart(6),
      String(metrics.inline_embeddings).padStart(6),
      (metrics.posts_collection || '-').padEnd(6),
      flag,
    ].join('  '),
    metrics.needs_migration ? 'yellow' : 'green'
  )
}

function printHeader() {
  log(
    [
      'Database'.padEnd(28),
      'Total'.padStart(6),
      'V1'.padStart(6),
      'Part'.padStart(6),
      'Shell'.padStart(6),
      'Inline'.padStart(6),
      'Coll'.padEnd(6),
      'Migrate?',
    ].join('  '),
    'bright'
  )
  log('-'.repeat(88), 'cyan')
}

async function main() {
  const args = parseDbArgs(process.argv.slice(2))
  const mongoUri = process.env.MONGO_URI

  if (!mongoUri) {
    log('ERROR: MONGO_URI missing in .env.local', 'red')
    process.exit(1)
  }

  const client = new MongoClient(mongoUri)
  const results = []

  try {
    await client.connect()
    log('✓ Connected to MongoDB', 'green')

    let dbNames = args.dbs
    if (args.allTenantDbs) {
      dbNames = await listTenantDatabases(client, { pattern: args.pattern })
      log(`Tenant DBs discovered: ${dbNames.length}`, 'cyan')
    }

    if (dbNames.length === 0) {
      log(
        'Usage: node scripts/audit_schema_health.js --db <DB> | --dbs a,b | --all-tenant-dbs [--pattern RegExp]',
        'red'
      )
      process.exit(1)
    }

    log('\nSchema health audit (read-only)\n', 'bright')
    printHeader()

    for (const dbName of dbNames) {
      const metrics = await auditDatabase(client.db(dbName))
      results.push(metrics)
      printRow(metrics)
    }

    const needsWork = results.filter((r) => r.needs_migration)
    const totalShells = results.reduce((n, r) => n + r.shells, 0)
    const totalV1 = results.reduce((n, r) => n + r.v1_flat, 0)

    log('\n----------------------------------------', 'bright')
    log(`Databases scanned: ${results.length}`, 'cyan')
    log(`Need migration: ${needsWork.length}`, needsWork.length ? 'yellow' : 'green')
    log(`Total v1 flat posts: ${totalV1}`, totalV1 ? 'yellow' : 'green')
    log(`Total embedding shells: ${totalShells}`, totalShells ? 'red' : 'green')

    if (needsWork.length > 0) {
      log('\nRecommended next steps:', 'bright')
      log('1. node scripts/cleanup_embedding_shells.js --dbs <...> --dry-run', 'cyan')
      log('2. node scripts/cleanup_embedding_shells.js --dbs <...> --apply', 'cyan')
      log('3. node scripts/migrate_v3_inplace.js --dbs <...> --dry-run', 'cyan')
      log('4. node scripts/migrate_v3_inplace.js --dbs <...> --force', 'cyan')
      log('5. node scripts/finish_v3_cutover.js --dbs <...> --apply', 'cyan')
      log('6. node scripts/verify_v3.js --db <each>', 'cyan')
    }

    const payload = {
      generated_at: new Date().toISOString(),
      summary: {
        databases: results.length,
        needs_migration: needsWork.length,
        total_v1_flat: totalV1,
        total_shells: totalShells,
      },
      databases: results,
    }

    if (args.jsonOut) {
      const outPath = path.isAbsolute(args.jsonOut)
        ? args.jsonOut
        : path.join(process.cwd(), args.jsonOut)
      fs.mkdirSync(path.dirname(outPath), { recursive: true })
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2))
      log(`\nWrote ${outPath}`, 'green')
    }

    log(JSON.stringify(payload.summary, null, 2), 'cyan')
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

module.exports = { main }
