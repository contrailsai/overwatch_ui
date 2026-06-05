#!/usr/bin/env node

/**
 * Merge duplicate rows in daily_reviewed_metrics and daily_case_metrics.
 *
 * Keeps the lowest id per (date, platform, project_name), sums counters,
 * merges JSON fields key-by-key, and deletes the extra rows.
 *
 * Usage:
 *   node scripts/dedupe-daily-metrics.js --dry-run
 *   node scripts/dedupe-daily-metrics.js
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
const path = require('path')

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const DRY_RUN = process.argv.includes('--dry-run')

const TABLES = [
  {
    name: 'daily_reviewed_metrics',
    totalField: 'total_reviewed',
    jsonFields: ['reviewed', 'risk'],
  },
  {
    name: 'daily_case_metrics',
    totalField: 'total_cases',
    jsonFields: ['categories', 'risk'],
  },
]

function mergeJsonField(rows, field) {
  const merged = {}
  for (const row of rows) {
    const value = row[field]
    if (!value || typeof value !== 'object') continue
    for (const [key, count] of Object.entries(value)) {
      merged[key] = (merged[key] || 0) + (Number(count) || 0)
    }
  }
  return merged
}

function groupKey(row) {
  return `${row.date}|${row.platform}|${row.project_name}`
}

async function fetchAllRows(supabase, tableName) {
  const pageSize = 1000
  let from = 0
  const allRows = []

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error
    if (!data?.length) break

    allRows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return allRows
}

async function dedupeTable(supabase, tableConfig) {
  const { name, totalField, jsonFields } = tableConfig
  const rows = await fetchAllRows(supabase, name)
  const groups = new Map()

  for (const row of rows) {
    const key = groupKey(row)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  const duplicateGroups = [...groups.values()].filter(group => group.length > 1)
  console.log(`[${name}] rows=${rows.length} duplicate_groups=${duplicateGroups.length}`)

  for (const group of duplicateGroups) {
    const sorted = [...group].sort((a, b) => a.id - b.id)
    const keep = sorted[0]
    const remove = sorted.slice(1)

    const mergedPayload = {
      [totalField]: sorted.reduce((sum, row) => sum + (Number(row[totalField]) || 0), 0),
    }

    for (const field of jsonFields) {
      mergedPayload[field] = mergeJsonField(sorted, field)
    }

    console.log(
      `[${name}] merge keep_id=${keep.id} remove_ids=${remove.map(r => r.id).join(',')} ` +
      `${totalField}=${mergedPayload[totalField]}`
    )

    if (DRY_RUN) continue

    const { error: updateError } = await supabase
      .from(name)
      .update(mergedPayload)
      .eq('id', keep.id)

    if (updateError) throw updateError

    const { error: deleteError } = await supabase
      .from(name)
      .delete()
      .in('id', remove.map(r => r.id))

    if (deleteError) throw deleteError
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(DRY_RUN ? 'DRY RUN — no writes' : 'LIVE RUN — merging duplicates')

  for (const table of TABLES) {
    await dedupeTable(supabase, table)
  }

  console.log('Done.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
