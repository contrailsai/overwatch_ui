#!/usr/bin/env node
/**
 * Supabase Analytics Syncer
 *
 * One rebuild path for Posts, Ads, and Domains. Per tenant it detects which
 * collections exist and have reviewed docs, then writes separate entity_type
 * rows keyed by review/alert date (list.reviewed_at in IST) — never sourced_at
 * or first_seen_at. Project section flags are ignored; the dashboard hides
 * disabled types.
 *
 * Usage:
 *   node scripts/sync-supabase-metrics.js
 *   node scripts/sync-supabase-metrics.js --dry-run
 *   node scripts/sync-supabase-metrics.js --apply
 *   node scripts/sync-supabase-metrics.js --project Ambani --apply
 *   node scripts/sync-supabase-metrics.js --since 2026-08-01 --apply
 *   node scripts/sync-supabase-metrics.js --rebuild --project SEBI --apply
 *   node scripts/sync-supabase-metrics.js --types ad,domain --apply
 *
 * Env vars required:
 *   MONGO_URI
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const dotenv = require('dotenv')
const path = require('path')
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') })

const { MongoClient } = require('mongodb')
const { createClient } = require('@supabase/supabase-js')

const args = process.argv.slice(2)
const DRY_RUN = !args.includes('--apply')
const REBUILD = args.includes('--rebuild')
const PROJECT_FILTER = (() => {
  const idx = args.indexOf('--project')
  return idx !== -1 ? args[idx + 1] : null
})()
const SINCE_DATE = (() => {
  const idx = args.indexOf('--since')
  return idx !== -1 ? args[idx + 1] : null
})()

const ENTITY_SOURCES = [
  { collection: 'Posts', entityType: 'post', section: 'posts' },
  { collection: 'Ads', entityType: 'ad', section: 'ads' },
  { collection: 'Domains', entityType: 'domain', section: 'domains' },
]
const VALID_TYPES = new Set(ENTITY_SOURCES.map((s) => s.entityType))

const TYPE_FILTER = (() => {
  const idx = args.indexOf('--types')
  if (idx === -1) return ENTITY_SOURCES.map((s) => s.entityType)
  const parsed = String(args[idx + 1] || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((t) => VALID_TYPES.has(t))
  return parsed.length ? parsed : ENTITY_SOURCES.map((s) => s.entityType)
})()

const mongo = new MongoClient(process.env.MONGO_URI)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

function riskRank(score) {
  if (score == null || Number.isNaN(Number(score))) return null
  const n = Number(score)
  if (n > 95) return 'high'
  if (n > 75) return 'medium'
  if (n > 40) return 'low'
  return 'safe'
}

function clientActionKey(status) {
  if (!status) return null
  const s = String(status).toLowerCase().replace(/_/g, ' ').trim()
  if (s.includes('no action') || s.includes('no-action') || s === 'pass') return 'no-action'
  if (s.includes('flag for takedown')) return 'Flag for Takedown'
  if (s === 'takedown' || s === 'do takedown' || s === 'takedown action' || s === 'do_takedown') return 'Takedown'
  return null
}

function isOpenClientStatus(status) {
  if (!status) return true
  const ui = String(status).toLowerCase()
  return ui === 'to be reviewed' || ui === 'open' || ui === 'alerted'
}

const METRIC_TIMEZONE = 'Asia/Kolkata'

function toDateStr(value, timeZone = METRIC_TIMEZONE) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function normalizeDimValue(value) {
  if (value == null) return null
  const s = String(value).trim()
  if (!s) return null
  return s.toLowerCase().replace(/\s+/g, '_')
}

function boolBucket(value) {
  return value ? 'true' : 'false'
}

function platformForDoc(entityType, doc) {
  if (entityType === 'domain') return 'web'
  return String(doc.platform || (entityType === 'ad' ? 'meta' : 'unknown')).toLowerCase() || 'unknown'
}

function reviewDate(doc) {
  return toDateStr(doc.list?.reviewed_at || doc.review_details?.reviewed_at)
}

function inferAdChannel(doc) {
  const stored = doc.channel
  if (stored === 'ingestion' || stored === 'library' || stored === 'feed') return stored
  if (stored === 'ads_library') return 'library'
  if (doc.submitted_url) return 'ingestion'
  const ingestionType = String(doc.ingestion?.type || '')
  if (ingestionType === 'facebook_share_post' || ingestionType === 'client_request' || ingestionType === 'client_requested_link') {
    return 'ingestion'
  }
  const url = String(doc.original_url || doc.ingestion?.source_url || '')
  if (/\/ads\/library/i.test(url)) return 'library'
  return 'feed'
}

function cloakBucket(doc) {
  const probe = doc.analysis_results?.cloak_probe
  const variants = Array.isArray(probe?.variants) ? probe.variants : []
  if (probe?.unlocked === true || doc.discovery?.cloak_unlocked || doc.isCloaked) return 'unlocked'
  if (variants.some((v) => v?.label !== 'bare' && v?.differs_from_bare)) return 'unlocked'
  if (probe || variants.length) return 'none'
  return 'unknown'
}

function whoisAgeBucket(doc) {
  const created = doc.analysis_results?.whois?.created_at
  const analyzed = doc.list?.last_analyzed_at || doc.list?.first_seen_at
  if (!created) return 'unknown'
  const createdAt = new Date(created)
  const analyzedAt = analyzed ? new Date(analyzed) : new Date()
  if (Number.isNaN(createdAt.getTime()) || Number.isNaN(analyzedAt.getTime())) return 'unknown'
  const days = Math.max(0, Math.round((analyzedAt.getTime() - createdAt.getTime()) / 86400000))
  if (days <= 7) return '0-7d'
  if (days <= 30) return '8-30d'
  if (days <= 90) return '31-90d'
  return '90d+'
}

function extractDimValues(entityType, doc) {
  const values = {}
  const push = (dim, value) => {
    const normalized = normalizeDimValue(value)
    if (!normalized) return
    if (!values[dim]) values[dim] = []
    if (!values[dim].includes(normalized)) values[dim].push(normalized)
  }

  const score = doc.list?.effective_threat_score ?? doc.review_details?.threat_score ?? doc.list?.review_threat_score
  const risk = doc.list?.risk_rank || riskRank(score)
  if (risk) push('risk_rank', risk)

  const threatTypes = doc.list?.threat_types || doc.review_details?.threat_types || []
  if (Array.isArray(threatTypes)) {
    threatTypes.filter((t) => typeof t === 'string').forEach((t) => push('threat_type', t))
  }

  const legalCodes = doc.review_details?.legal_codes
    || doc.list?.legal_codes
    || doc.analysis_results?.legal_codes
    || []
  if (Array.isArray(legalCodes)) {
    legalCodes.forEach((item) => {
      const raw = typeof item === 'string' ? item : (item?.code || item?.name)
      if (raw) push('legal_code', raw)
    })
  }

  const action = clientActionKey(doc.workflow?.client_status || doc.client_status)
  if (action) push('client_status', action)

  if (entityType === 'post') {
    push('platform', platformForDoc('post', doc))
    push('post_type', doc.content?.post_type || doc.list?.post_type || 'post')
    push('language', doc.content?.language || doc.list?.language)
    push('poi_detected', boolBucket(Boolean(doc.list?.poi_detected || (doc.review_details?.poi_names || []).length)))
    push('is_aigc', boolBucket(Boolean(doc.review_details?.is_aigc || doc.analysis_results?.is_aigc)))
  }

  if (entityType === 'ad') {
    push('display_format', doc.list?.display_format || doc.content?.display_format)
    push('channel', inferAdChannel(doc))
    push('is_active', boolBucket(doc.list?.is_active !== false && doc.ad_delivery?.is_active !== false))
    push('cta_type', doc.content?.cta_type)
    const publishers = doc.list?.publisher_platforms || doc.ad_delivery?.publisher_platforms || []
    if (Array.isArray(publishers)) publishers.forEach((p) => push('publisher_platform', p))
  }

  if (entityType === 'domain') {
    push('category', doc.list?.category || doc.review_details?.category)
    push('hosting_country', doc.list?.hosting_country)
    push('hosting_provider', doc.list?.hosting_provider)
    push('registrar', doc.list?.registrar)
    push('visibility_status', doc.workflow?.visibility_status || 'unknown')
    if (doc.list?.ssl_valid != null) push('ssl_valid', boolBucket(doc.list.ssl_valid))
    if (doc.list?.is_reachable != null) push('is_reachable', boolBucket(doc.list.is_reachable))
    push('cloak', cloakBucket(doc))
    push('discovery_source', doc.discovery?.first_entity_type || 'unknown')
    push('whois_age_bucket', whoisAgeBucket(doc))
  }

  return values
}

function emptyRisk() {
  return { high: 0, medium: 0, low: 0, safe: 0 }
}

function emptyReviewed() {
  return { 'no-action': 0, 'Flag for Takedown': 0, Takedown: 0 }
}

function caseRowKey(date, platform) {
  return `${date}::${platform}`
}

function dimRowKey(date, dim, value) {
  return `${date}::${dim}::${value}`
}

function sectionFlags(projectDetails) {
  const raw = projectDetails?.sections || {}
  return {
    posts: raw.posts !== false,
    ads: raw.ads !== false,
    domains: raw.domains !== false,
  }
}

async function detectSources(db, collNames) {
  const detected = []
  for (const source of ENTITY_SOURCES) {
    if (!TYPE_FILTER.includes(source.entityType)) {
      console.log(`  ${source.collection}: filtered by --types, skip`)
      continue
    }
    if (!collNames.has(source.collection)) {
      console.log(`  ${source.collection}: collection missing, skip`)
      continue
    }
    const reviewed = await db.collection(source.collection).countDocuments(
      { 'workflow.review_status': 'reviewed' },
      { limit: 1 },
    )
    if (!reviewed) {
      console.log(`  ${source.collection}: no reviewed docs, skip`)
      continue
    }
    detected.push(source)
  }
  return detected
}

async function aggregateCollection(db, source, projectName, sinceDate) {
  const match = { 'workflow.review_status': 'reviewed' }
  if (sinceDate) {
    match['list.reviewed_at'] = { $gte: new Date(sinceDate) }
  }

  const projection = {
    platform: 1,
    channel: 1,
    submitted_url: 1,
    original_url: 1,
    ingestion: 1,
    workflow: 1,
    list: 1,
    content: 1,
    review_details: 1,
    analysis_results: 1,
    discovery: 1,
    ad_delivery: 1,
  }

  const caseRows = new Map()
  const reviewedRows = new Map()
  const dimRows = new Map()

  const cursor = db.collection(source.collection).find(match, { projection }).batchSize(500)

  for await (const doc of cursor) {
    const platform = platformForDoc(source.entityType, doc)
    const reviewedOn = reviewDate(doc)
    if (!reviewedOn) continue
    const score = doc.list?.effective_threat_score ?? doc.review_details?.threat_score ?? doc.list?.review_threat_score
    const rk = riskRank(score) || 'safe'
    const categories = {}
    const threatTypes = Array.isArray(doc.list?.threat_types)
      ? doc.list.threat_types
      : (Array.isArray(doc.review_details?.threat_types) ? doc.review_details.threat_types : [])
    for (const t of threatTypes) {
      if (typeof t !== 'string') continue
      const key = t.toLowerCase().replace(/ /g, '_')
      categories[key] = (categories[key] || 0) + 1
    }

    if (doc.review_details?.is_aigc || doc.analysis_results?.is_aigc) {
      categories.aigc = (categories.aigc || 0) + 1
    }

    const cKey = caseRowKey(reviewedOn, platform)
    const row = caseRows.get(cKey) || {
      date: reviewedOn,
      platform,
      project_name: projectName,
      entity_type: source.entityType,
      total_cases: 0,
      risk: emptyRisk(),
      categories: {},
    }
    row.total_cases += 1
    row.risk[rk] = (row.risk[rk] || 0) + 1
    Object.entries(categories).forEach(([k, v]) => {
      row.categories[k] = (row.categories[k] || 0) + v
    })
    caseRows.set(cKey, row)

    const dimValues = extractDimValues(source.entityType, doc)
    Object.entries(dimValues).forEach(([dim, vals]) => {
      vals.forEach((value) => {
        const dKey = dimRowKey(reviewedOn, dim, value)
        const dRow = dimRows.get(dKey) || {
          date: reviewedOn,
          project_name: projectName,
          entity_type: source.entityType,
          dim,
          value,
          count: 0,
        }
        dRow.count += 1
        dimRows.set(dKey, dRow)
      })
    })

    const clientStatus = doc.workflow?.client_status || doc.client_status
    if (clientStatus && !isOpenClientStatus(clientStatus)) {
      const rKey = caseRowKey(reviewedOn, platform)
      const row = reviewedRows.get(rKey) || {
        date: reviewedOn,
        platform,
        project_name: projectName,
        entity_type: source.entityType,
        total_reviewed: 0,
        risk: emptyRisk(),
        reviewed: emptyReviewed(),
      }
      row.total_reviewed += 1
      row.risk[rk] = (row.risk[rk] || 0) + 1
      const ak = clientActionKey(clientStatus)
      if (ak) row.reviewed[ak] = (row.reviewed[ak] || 0) + 1
      reviewedRows.set(rKey, row)
    }
  }

  return {
    caseRows: [...caseRows.values()].filter((r) => r.date),
    reviewedRows: [...reviewedRows.values()].filter((r) => r.date),
    dimRows: [...dimRows.values()].filter((r) => r.date),
  }
}

async function upsertRows(table, rows, conflictColumns) {
  if (!rows.length) return { upserted: 0 }
  const chunkSize = 200
  let upserted = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: conflictColumns })
    if (error) throw new Error(`Upsert ${table}: ${error.message}`)
    upserted += chunk.length
  }
  return { upserted }
}

async function assertAnalyticsSchema() {
  const { error: caseErr } = await supabase
    .from('daily_case_metrics')
    .select('entity_type')
    .limit(1)
  if (caseErr) {
    throw new Error(
      `Analytics schema not applied (${caseErr.message}). Run supabase/scripts/add-entity-type-and-metric-dims.sql on the Overwatch project, then retry.`,
    )
  }

  const { error: dimErr } = await supabase
    .from('daily_metric_dims')
    .select('id')
    .limit(1)
  if (dimErr) {
    throw new Error(
      `daily_metric_dims missing (${dimErr.message}). Run supabase/scripts/add-entity-type-and-metric-dims.sql on the Overwatch project, then retry.`,
    )
  }
}

async function deleteProjectMetrics(projectName, entityTypes) {
  const tables = ['daily_case_metrics', 'daily_reviewed_metrics', 'daily_metric_dims']
  for (const table of tables) {
    let query = supabase.from(table).delete().eq('project_name', projectName)
    if (entityTypes?.length) query = query.in('entity_type', entityTypes)
    const { error } = await query
    if (error) throw new Error(`Delete ${table}: ${error.message}`)
  }
}

async function main() {
  if (!process.env.MONGO_URI || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing MONGO_URI / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }

  await mongo.connect()
  console.log('Connected to MongoDB')
  await assertAnalyticsSchema()

  let projectQuery = supabase.from('project').select('project_name, mongo_db_map, project_details')
  if (PROJECT_FILTER) {
    projectQuery = PROJECT_FILTER.includes('-')
      ? projectQuery.eq('project_name', PROJECT_FILTER)
      : projectQuery.or(`project_name.eq.${PROJECT_FILTER},project_name.ilike.${PROJECT_FILTER}-%`)
  }
  const { data: projects, error: projErr } = await projectQuery
  if (projErr) throw new Error(`Failed to fetch projects: ${projErr.message}`)

  console.log(
    `\nFound ${projects.length} project(s)`
    + `${SINCE_DATE ? ` since ${SINCE_DATE}` : ''}`
    + `${REBUILD ? ' [rebuild]' : ''}`
    + ` types=${TYPE_FILTER.join(',')}`
    + ` (section flags ignored)\n`,
  )

  for (const proj of projects) {
    const { project_name, mongo_db_map, project_details } = proj
    if (!mongo_db_map) {
      console.log(`⏭  ${project_name}: no mongo_db_map, skipping`)
      continue
    }

    const flags = sectionFlags(project_details)
    const flagLabel = ENTITY_SOURCES
      .map((s) => `${s.entityType}:${flags[s.section] ? 'on' : 'off'}`)
      .join(' ')
    console.log(`\n── ${project_name} (${mongo_db_map}) ──`)
    console.log(`  UI sections ${flagLabel} — syncing all detected types`)

    const db = mongo.db(mongo_db_map)
    const collNames = new Set((await db.listCollections().toArray()).map((c) => c.name))
    const sources = await detectSources(db, collNames)

    if (!sources.length) {
      console.log(`  No reviewed Posts/Ads/Domains found`)
      console.log(`  Available: ${[...collNames].join(', ') || '(none)'}`)
      continue
    }

    const allCaseRows = []
    const allReviewedRows = []
    const allDimRows = []
    const syncedTypes = []

    for (const source of sources) {
      const result = await aggregateCollection(db, source, project_name, SINCE_DATE)
      console.log(
        `  ${source.collection}: ${result.caseRows.length} case rows, ${result.reviewedRows.length} reviewed rows, ${result.dimRows.length} dim rows`
        + `${flags[source.section] ? '' : ' (section disabled in UI)'}`,
      )
      if (!result.caseRows.length && !result.reviewedRows.length && !result.dimRows.length) {
        continue
      }
      allCaseRows.push(...result.caseRows)
      allReviewedRows.push(...result.reviewedRows)
      allDimRows.push(...result.dimRows)
      syncedTypes.push(source.entityType)
    }

    if (!syncedTypes.length) {
      console.log(`  Detected collections but no dated metric rows`)
      continue
    }

    const totalCases = allCaseRows.reduce((s, r) => s + r.total_cases, 0)
    const totalReviewed = allReviewedRows.reduce((s, r) => s + r.total_reviewed, 0)
    console.log(`  Total: ${allCaseRows.length} case / ${allReviewedRows.length} reviewed / ${allDimRows.length} dim | docs ${totalCases} cases, ${totalReviewed} decided`)

    if (DRY_RUN) {
      console.log('  Dry run — pass --apply to write')
      continue
    }

    if (REBUILD) {
      await deleteProjectMetrics(project_name, syncedTypes)
      console.log(`  Deleted existing metric rows for ${syncedTypes.join(', ')}`)
    }

    const caseResult = await upsertRows(
      'daily_case_metrics',
      allCaseRows,
      'date,platform,project_name,entity_type',
    )
    const reviewedResult = await upsertRows(
      'daily_reviewed_metrics',
      allReviewedRows,
      'date,platform,project_name,entity_type',
    )
    const dimResult = await upsertRows(
      'daily_metric_dims',
      allDimRows,
      'date,project_name,entity_type,dim,value',
    )
    console.log(`  Upserted case=${caseResult.upserted} reviewed=${reviewedResult.upserted} dims=${dimResult.upserted}`)
  }

  console.log(`\n${DRY_RUN ? 'DRY RUN complete. Pass --apply to write.' : 'Sync complete.'}`)
}

main()
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
  .finally(() => mongo.close())
