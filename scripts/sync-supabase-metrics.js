#!/usr/bin/env node
/**
 * Supabase Analytics Syncer
 *
 * Reads MongoDB posts (and optionally Ads) collections to recompute
 * daily_case_metrics and daily_reviewed_metrics in Supabase so that
 * the analytics dashboard reflects the actual state of reviewed
 * documents — especially after bulk-insert pipelines that bypass
 * the normal review UI (which normally triggers incremental updates).
 *
 * Usage:
 *   node scripts/sync-supabase-metrics.js                         # dry-run all projects
 *   node scripts/sync-supabase-metrics.js --apply                 # write to Supabase
 *   node scripts/sync-supabase-metrics.js --project Ambani        # single project
 *   node scripts/sync-supabase-metrics.js --project Ambani --apply
 *   node scripts/sync-supabase-metrics.js --since 2026-08-01      # only sync from date
 *
 * Env vars required:
 *   MONGO_URI                — MongoDB connection string
 *   NEXT_PUBLIC_SUPABASE_URL — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service-role key (bypasses RLS)
 */

const dotenv = require('dotenv')
const path = require('path')
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') })

const { MongoClient } = require('mongodb')
const { createClient } = require('@supabase/supabase-js')

// ── CLI args ────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = !args.includes('--apply')
const PROJECT_FILTER = (() => {
  const idx = args.indexOf('--project')
  return idx !== -1 ? args[idx + 1] : null
})()
const SINCE_DATE = (() => {
  const idx = args.indexOf('--since')
  return idx !== -1 ? args[idx + 1] : null
})()

// ── Connections ─────────────────────────────────────────────
const mongo = new MongoClient(process.env.MONGO_URI)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// ── Risk helpers (mirrors src/utils/supabase/metrics.js) ────
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
  const s = status.toLowerCase()
  if (s.includes('no action') || s.includes('no-action') || s === 'pass') return 'no-action'
  if (s === 'flag_for_takedown' || s === 'flag for takedown') return 'Flag for Takedown'
  if (s === 'takedown' || s === 'do_takedown' || s === 'takedown action') return 'Takedown'
  return null
}

// ── Aggregation ─────────────────────────────────────────────

/**
 * Aggregates posts (or Ads) into daily_case_metrics shape.
 * One row per (date, platform, project_name).
 *
 * "date" = list.reviewed_at (the date the review was submitted).
 * For daily_case_metrics this is when the case was *reviewed* (created by
 * the reviewer flow in the UI). We use list.reviewed_at because the
 * existing metrics.js updateDailyMetrics is called at review-submit time.
 */
async function aggregateCaseMetrics(db, collection, projectName, sinceDate) {
  const matchStage = { 'workflow.review_status': 'reviewed' }
  if (sinceDate) {
    matchStage['list.reviewed_at'] = { $gte: new Date(sinceDate) }
  }

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$list.reviewed_at' } },
          platform: { $toLower: { $ifNull: ['$platform', 'unknown'] } },
        },
        total_cases: { $sum: 1 },
        risk_high: { $sum: { $cond: [{ $gt: ['$list.effective_threat_score', 95] }, 1, 0] } },
        risk_medium: { $sum: { $cond: [{ $and: [{ $gt: ['$list.effective_threat_score', 75] }, { $lte: ['$list.effective_threat_score', 95] }] }, 1, 0] } },
        risk_low: { $sum: { $cond: [{ $and: [{ $gt: ['$list.effective_threat_score', 40] }, { $lte: ['$list.effective_threat_score', 75] }] }, 1, 0] } },
        risk_safe: { $sum: { $cond: [{ $or: [{ $lte: ['$list.effective_threat_score', 40] }, { $eq: ['$list.effective_threat_score', null] }] }, 1, 0] } },
        // Collect threat_types for category counting
        all_threat_types: { $push: '$list.threat_types' },
      },
    },
    { $sort: { '_id.date': 1 } },
  ]

  const rows = await db.collection(collection).aggregate(pipeline).toArray()

  return rows.map(row => {
    // Flatten and count categories
    const categories = {}
    for (const arr of row.all_threat_types) {
      if (!Array.isArray(arr)) continue
      for (const t of arr) {
        if (typeof t !== 'string') continue
        const key = t.toLowerCase().replace(/ /g, '_')
        categories[key] = (categories[key] || 0) + 1
      }
    }

    return {
      date: row._id.date,
      platform: row._id.platform,
      project_name: projectName,
      total_cases: row.total_cases,
      risk: {
        high: row.risk_high,
        medium: row.risk_medium,
        low: row.risk_low,
        safe: row.risk_safe,
      },
      categories,
    }
  })
}

/**
 * Aggregates posts (or Ads) into daily_reviewed_metrics shape.
 * Tracks client actions (no-action / flag / takedown) grouped by date of
 * client_status change. We use list.reviewed_at as the date proxy.
 */
async function aggregateReviewedMetrics(db, collection, projectName, sinceDate) {
  const matchStage = {
    'workflow.review_status': 'reviewed',
    'workflow.client_status': { $nin: [null, 'open'] },
  }
  if (sinceDate) {
    matchStage['list.reviewed_at'] = { $gte: new Date(sinceDate) }
  }

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$list.reviewed_at' } },
          platform: { $toLower: { $ifNull: ['$platform', 'unknown'] } },
        },
        docs: {
          $push: {
            score: '$list.effective_threat_score',
            client_status: '$workflow.client_status',
          },
        },
      },
    },
    { $sort: { '_id.date': 1 } },
  ]

  const rows = await db.collection(collection).aggregate(pipeline).toArray()

  return rows.map(row => {
    const risk = { safe: 0, low: 0, medium: 0, high: 0 }
    const reviewed = { 'no-action': 0, 'Flag for Takedown': 0, 'Takedown': 0 }
    let total = 0

    for (const doc of row.docs) {
      total++
      const rk = riskRank(doc.score)
      if (rk) risk[rk]++
      const ak = clientActionKey(doc.client_status)
      if (ak) reviewed[ak]++
    }

    return {
      date: row._id.date,
      platform: row._id.platform,
      project_name: projectName,
      total_reviewed: total,
      risk,
      reviewed,
    }
  })
}

// ── Supabase upsert ─────────────────────────────────────────

async function upsertMetrics(table, rows) {
  if (!rows.length) return { inserted: 0, updated: 0 }

  let inserted = 0
  let updated = 0

  for (const row of rows) {
    // Check if row exists
    const { data: existing } = await supabase
      .from(table)
      .select('id')
      .eq('date', row.date)
      .eq('platform', row.platform)
      .eq('project_name', row.project_name)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from(table)
        .update(row)
        .eq('id', existing.id)
      if (error) throw new Error(`Update ${table} id=${existing.id}: ${error.message}`)
      updated++
    } else {
      const { error } = await supabase
        .from(table)
        .insert(row)
      if (error) throw new Error(`Insert ${table}: ${error.message}`)
      inserted++
    }
  }

  return { inserted, updated }
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  await mongo.connect()
  console.log('Connected to MongoDB')

  // Fetch projects from Supabase
  let projectQuery = supabase.from('project').select('project_name, mongo_db_map')
  if (PROJECT_FILTER) {
    projectQuery = projectQuery.eq('project_name', PROJECT_FILTER)
  }
  const { data: projects, error: projErr } = await projectQuery
  if (projErr) throw new Error(`Failed to fetch projects: ${projErr.message}`)

  console.log(`\nFound ${projects.length} project(s) to sync${SINCE_DATE ? ` (since ${SINCE_DATE})` : ''}\n`)

  for (const proj of projects) {
    const { project_name, mongo_db_map } = proj
    if (!mongo_db_map) {
      console.log(`⏭  ${project_name}: no mongo_db_map, skipping`)
      continue
    }

    console.log(`\n── ${project_name} (${mongo_db_map}) ──`)
    const db = mongo.db(mongo_db_map)

    // Check which collections exist
    const collNames = (await db.listCollections().toArray()).map(c => c.name)
    const hasPosts = collNames.includes('Posts')
    const hasAds = collNames.includes('Ads')

    // Aggregate case metrics from Posts
    let caseRows = []
    let reviewedRows = []

    if (hasPosts) {
      const postCases = await aggregateCaseMetrics(db, 'Posts', project_name, SINCE_DATE)
      const postReviewed = await aggregateReviewedMetrics(db, 'Posts', project_name, SINCE_DATE)
      caseRows.push(...postCases)
      reviewedRows.push(...postReviewed)
      console.log(`  Posts: ${postCases.length} case-metric rows, ${postReviewed.length} reviewed-metric rows`)
    }

    if (hasAds) {
      const adCases = await aggregateCaseMetrics(db, 'Ads', project_name, SINCE_DATE)
      const adReviewed = await aggregateReviewedMetrics(db, 'Ads', project_name, SINCE_DATE)
      // Merge ads into same rows (same date/platform key gets combined)
      for (const adRow of adCases) {
        const existing = caseRows.find(r => r.date === adRow.date && r.platform === adRow.platform)
        if (existing) {
          existing.total_cases += adRow.total_cases
          existing.risk.high += adRow.risk.high
          existing.risk.medium += adRow.risk.medium
          existing.risk.low += adRow.risk.low
          existing.risk.safe += adRow.risk.safe
          Object.entries(adRow.categories).forEach(([k, v]) => {
            existing.categories[k] = (existing.categories[k] || 0) + v
          })
        } else {
          caseRows.push(adRow)
        }
      }
      for (const adRow of adReviewed) {
        const existing = reviewedRows.find(r => r.date === adRow.date && r.platform === adRow.platform)
        if (existing) {
          existing.total_reviewed += adRow.total_reviewed
          Object.entries(adRow.risk).forEach(([k, v]) => { existing.risk[k] += v })
          Object.entries(adRow.reviewed).forEach(([k, v]) => { existing.reviewed[k] += v })
        } else {
          reviewedRows.push(adRow)
        }
      }
      console.log(`  Ads:   ${adCases.length} case-metric rows, ${adReviewed.length} reviewed-metric rows`)
    }

    if (!hasPosts && !hasAds) {
      console.log(`  No Posts/Ads collections found, skipping`)
      console.log(`  Available collections: ${collNames.join(', ')}`)
      continue
    }

    // Filter out rows with null date (docs missing reviewed_at)
    caseRows = caseRows.filter(r => r.date)
    reviewedRows = reviewedRows.filter(r => r.date)

    console.log(`  Total: ${caseRows.length} case rows, ${reviewedRows.length} reviewed rows`)

    if (DRY_RUN) {
      const totalCases = caseRows.reduce((s, r) => s + r.total_cases, 0)
      const totalReviewed = reviewedRows.reduce((s, r) => s + r.total_reviewed, 0)
      console.log(`  Would sync: ${totalCases} total cases, ${totalReviewed} total reviewed`)

      if (caseRows.length > 0) {
        const dates = caseRows.map(r => r.date).sort()
        console.log(`  Date range: ${dates[0]} -> ${dates[dates.length - 1]}`)

        // Per-platform breakdown
        const byPlatform = {}
        for (const r of caseRows) {
          byPlatform[r.platform] = (byPlatform[r.platform] || 0) + r.total_cases
        }
        console.log(`  Per-platform cases:`)
        for (const [p, count] of Object.entries(byPlatform).sort((a, b) => b[1] - a[1])) {
          console.log(`    ${p}: ${count}`)
        }
      }

      if (reviewedRows.length > 0) {
        const byAction = { 'no-action': 0, 'Flag for Takedown': 0, 'Takedown': 0 }
        for (const r of reviewedRows) {
          Object.entries(r.reviewed).forEach(([k, v]) => { byAction[k] = (byAction[k] || 0) + v })
        }
        console.log(`  Review decisions: no-action=${byAction['no-action']}, flagged=${byAction['Flag for Takedown']}, takedown=${byAction['Takedown']}`)
      }
    } else {
      const caseResult = await upsertMetrics('daily_case_metrics', caseRows)
      const reviewedResult = await upsertMetrics('daily_reviewed_metrics', reviewedRows)
      console.log(`  ✅ daily_case_metrics: ${caseResult.inserted} inserted, ${caseResult.updated} updated`)
      console.log(`  ✅ daily_reviewed_metrics: ${reviewedResult.inserted}, ${reviewedResult.updated} updated`)
    }
  }

  console.log(`\n${DRY_RUN ? '🔍 DRY RUN complete. Pass --apply to write.' : '✅ Sync complete.'}`)
}

main()
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
  .finally(() => mongo.close())
