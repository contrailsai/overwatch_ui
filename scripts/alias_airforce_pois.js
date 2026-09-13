#!/usr/bin/env node

/**
 * Collapse repeat and raw-value POIs in AirForce-Data-Search into aliases of
 * the canonical person, force, or platform. Then recount unique reviewed posts
 * and the sourced_at span so badges match the posts the graph can open.
 *
 * Usage:
 *   node scripts/alias_airforce_pois.js --dry-run
 *   node scripts/alias_airforce_pois.js --db AirForce-Data-Search
 */

const { MongoClient } = require('mongodb')
const dotenv = require('dotenv')
const path = require('path')

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const CATEGORY_LABELS = {
  politician: 'Politicians and parties',
  military_official: 'Indian military officials',
  adversary_military: 'Opposition military officials',
  armed_force: 'Indian armed forces',
  adversary_force: 'Opposition forces and agencies',
  journalist: 'Journalists and commentators',
  company: 'Companies',
  platform_weapon: 'Aircraft and weapons',
  country_place: 'Countries and places',
  other: 'Other',
}

/** parent name-key → alias name-keys, plus optional display rename. */
const GROUPS = [
  {
    parent: 'indian air force',
    aliases: ['indian air force (iaf)', 'iaf officer', 'iaf wing commander', 'iaf air marshals'],
  },
  {
    parent: 'pakistan air force',
    aliases: ['paf', 'pakistan air force (paf)'],
  },
  {
    parent: 'narendra modi',
    aliases: ['modi', 'pm modi', 'modi sarkar'],
  },
  {
    parent: 'donald trump',
    aliases: ['trump', 'president trump'],
  },
  {
    parent: 'air chief marshal ap singh',
    aliases: [
      'iaf chief',
      'indian air chief',
      'indian air force chief',
      'indian air chief marshal',
      'air chief',
      'indian cas',
      'amarpreet singh',
    ],
  },
  {
    parent: 'abhinandan varthaman',
    aliases: ['abhinandan', 'wing commander abhinandan varthaman'],
  },
  {
    parent: 'anil chauhan',
    aliases: ['general anil chauhan', 'cds anil chohan'],
  },
  {
    parent: 'pravin sawhney',
    aliases: ['praveen sawhney', 'pravinsawhney', 'pravin sahney'],
  },
  {
    parent: 'gaurav arya',
    aliases: ['major gaurav arya'],
  },
  {
    parent: 'shiv aroor',
    aliases: ['shivaroor'],
  },
  {
    parent: 'air vice marshal aurangzeb ahmed',
    aliases: ['aurangzeb ahmed'],
  },
  {
    parent: 'air marshal nagesh kapoor',
    aliases: ['nagesh kapur', 'vcas nagesh kapoor'],
  },
  {
    parent: 'air commodore khalid chishti (r)',
    aliases: ['khalid chishti'],
  },
  {
    parent: 'zaheer babar sindhu',
    aliases: ['zaheer ahmed babar'],
    display_name: 'Zaheer Ahmed Babar Sidhu',
    extraAliases: ['Zaheer Babar Sindhu'],
  },
  {
    parent: 'hal tejas',
    aliases: ['tejas'],
  },
  {
    parent: 'j-10ce',
    aliases: ['j10', 'j10c', 'paf j-10c'],
    display_name: 'J-10C',
    extraAliases: ['J-10CE'],
  },
  {
    parent: 'rafale',
    aliases: ['dassault rafale', 'iaf rafale'],
  },
  {
    parent: 'droupadi murmu',
    aliases: ['president of india'],
  },
  {
    parent: 'rajnath singh',
    aliases: ['indian parliamentarian'],
  },
  {
    parent: 'general upendra dwivedi',
    aliases: ['lieutenant general upendra dwivedi', 'army chief'],
  },
  {
    parent: 'ajay ahuja',
    aliases: ['ahuja'],
  },
  {
    parent: 'netflix india',
    aliases: ['netflixindia'],
  },
  {
    parent: 'putin',
    aliases: [],
    display_name: 'Vladimir Putin',
    extraAliases: ['Putin'],
  },
]

function normalizeNameKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function uniqueStrings(values, limit = 80, { caseSensitive = false } = {}) {
  const out = []
  const seen = new Set()
  for (const raw of values || []) {
    const s = String(raw || '').trim()
    if (!s) continue
    const key = caseSensitive ? s : s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= limit) break
  }
  return out
}

function isHandleValue(raw) {
  const s = String(raw || '').trim()
  if (!s || /\s/.test(s) || s.includes('-')) return false
  if (/[0-9_]/.test(s)) return true
  return /[a-z][A-Z]|[A-Z]{2,}[a-z]/.test(s)
}

function parseArgs(argv) {
  const out = { db: 'AirForce-Data-Search', dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--db') out.db = argv[++i]
    else if (a === '--dry-run') out.dryRun = true
  }
  return out
}

function labelsFor(poi) {
  return uniqueStrings([
    poi.display_name,
    poi.name,
    ...(poi.aliases || []),
    ...(poi.alias_poi_names || []),
  ])
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI
  if (!uri) {
    console.error('Requires MONGO_URI or MONGODB_URI in .env.local')
    process.exit(1)
  }

  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db(args.db)
  const pois = db.collection('pois')
  const posts = db.collection('Posts')
  const now = new Date()

  const docs = await pois.find({}).toArray()
  const byName = new Map()
  for (const doc of docs) {
    const key = normalizeNameKey(doc.name || doc.display_name)
    if (key && !byName.has(key)) byName.set(key, doc)
  }

  const merges = []
  const missing = []
  const skipped = []

  for (const group of GROUPS) {
    const parent = byName.get(group.parent)
    if (!parent) {
      missing.push({ parent: group.parent, reason: 'parent missing' })
      continue
    }
    if (parent.status === 'merged' || parent.merged_into || parent.merged_into_name) {
      missing.push({ parent: group.parent, reason: 'parent is already an alias' })
      continue
    }

    if (group.display_name && group.display_name !== parent.display_name) {
      merges.push({
        kind: 'rename',
        parent: parent.display_name,
        display_name: group.display_name,
      })
    }

    for (const aliasKey of group.aliases) {
      const alias = byName.get(aliasKey)
      if (!alias) {
        missing.push({ parent: group.parent, alias: aliasKey, reason: 'alias doc missing' })
        continue
      }
      if (String(alias._id) === String(parent._id)) continue
      if (alias.status === 'merged' || alias.merged_into || alias.merged_into_name) {
        const into = normalizeNameKey(alias.merged_into_name)
        if (into === group.parent) {
          skipped.push({ alias: alias.display_name || alias.name, into: group.parent })
          continue
        }
        missing.push({
          parent: group.parent,
          alias: alias.display_name || alias.name,
          reason: `already merged into ${alias.merged_into_name || alias.merged_into}`,
        })
        continue
      }
      merges.push({
        kind: 'alias',
        parent: parent.display_name || parent.name,
        alias: alias.display_name || alias.name,
        aliasKey,
        posts: alias.post_count || 0,
      })
    }
  }

  console.log(JSON.stringify({ dry_run: args.dryRun, merges, missing, skipped }, null, 2))

  if (!args.dryRun) {
    for (const group of GROUPS) {
      const parent = byName.get(group.parent)
      if (!parent || parent.status === 'merged' || parent.merged_into) continue

      const aliasDocs = []
      for (const aliasKey of group.aliases) {
        const alias = byName.get(aliasKey)
        if (!alias || String(alias._id) === String(parent._id)) continue
        if (alias.status === 'merged' || alias.merged_into || alias.merged_into_name) continue
        aliasDocs.push(alias)
      }

      let aliases = [...(parent.aliases || [])]
      let aliasPoiNames = [...(parent.alias_poi_names || [])]
      let summary = parent.summary || ''
      let image = parent.image || { s3_url: null, s3_key: null }
      let category = parent.category || ''
      let categoryLabel = parent.category_label || ''

      if (group.display_name && group.display_name !== parent.display_name) {
        aliases.push(parent.display_name)
      }
      for (const extra of group.extraAliases || []) aliases.push(extra)

      for (const alias of aliasDocs) {
        aliases.push(alias.display_name, alias.name, ...(alias.aliases || []))
        aliasPoiNames.push(alias.name, ...(alias.alias_poi_names || []))
        if (!String(summary || '').trim() && alias.summary) summary = alias.summary
        const parentHasImage = Boolean(image?.s3_url || image?.s3_key)
        const aliasHasImage = Boolean(alias.image?.s3_url || alias.image?.s3_key)
        if (!parentHasImage && aliasHasImage) image = alias.image
        if (!category && alias.category) {
          category = alias.category
          categoryLabel = alias.category_label || CATEGORY_LABELS[alias.category] || ''
        }
      }

      const nextDisplay = group.display_name || parent.display_name
      aliases = uniqueStrings(aliases, 80, { caseSensitive: true }).filter(
        (s) => s !== parent.name && s !== nextDisplay
      )
      aliasPoiNames = uniqueStrings([
        ...aliasPoiNames,
        ...aliasDocs.map((a) => a.name),
      ]).filter((s) => normalizeNameKey(s) !== normalizeNameKey(parent.name))

      const parentSet = {
        display_name: nextDisplay,
        aliases,
        alias_poi_names: aliasPoiNames,
        summary: summary || '',
        image: image || { s3_url: null, s3_key: null },
        updated_at: now,
      }
      if (category) {
        parentSet.category = category
        parentSet.category_label = categoryLabel || CATEGORY_LABELS[category] || category
      }

      await pois.updateOne({ _id: parent._id }, { $set: parentSet })
      parent.display_name = nextDisplay
      parent.aliases = aliases
      parent.alias_poi_names = aliasPoiNames
      if (category) {
        parent.category = category
        parent.category_label = parentSet.category_label
      }

      if (aliasDocs.length) {
        await pois.updateMany(
          { _id: { $in: aliasDocs.map((a) => a._id) } },
          {
            $set: {
              status: 'merged',
              merged_into: parent._id,
              merged_into_name: parent.name,
              alias_poi_names: [],
              updated_at: now,
            },
          }
        )
        for (const alias of aliasDocs) {
          alias.status = 'merged'
          alias.merged_into = parent._id
          alias.merged_into_name = parent.name
        }
      }
    }

    const active = await pois
      .find({
        status: { $ne: 'merged' },
        merged_into: null,
        merged_into_name: null,
      })
      .toArray()

    const handleHidden = []
    for (const poi of active) {
      const label = poi.display_name || poi.name
      if (!isHandleValue(label) && !isHandleValue(poi.name)) continue
      if (!poi.category) continue
      handleHidden.push(label)
      await pois.updateOne(
        { _id: poi._id },
        {
          $unset: { category: '', category_label: '' },
          $set: {
            updated_at: now,
            'meta.notes': 'Raw social handle, not a canonical POI. Hidden from the Posts nexus.',
          },
        }
      )
      delete poi.category
      delete poi.category_label
    }

    const reviewed = await posts
      .find(
        { 'workflow.review_status': 'reviewed' },
        {
          projection: {
            'review_details.poi_names': 1,
            'analysis_results.poi_check.poi_names': 1,
            'list.sourced_at': 1,
          },
        }
      )
      .toArray()

    const exactByKey = new Map()
    for (const post of reviewed) {
      const names = [
        ...(post.review_details?.poi_names || []),
        ...(post.analysis_results?.poi_check?.poi_names || []),
      ]
      for (const name of names) {
        const key = normalizeNameKey(name)
        const exact = String(name || '').trim()
        if (!key || !exact) continue
        if (!exactByKey.has(key)) exactByKey.set(key, [])
        const list = exactByKey.get(key)
        if (!list.some((s) => s === exact)) list.push(exact)
      }
    }

    for (const poi of active) {
      const keys = new Set(labelsFor(poi).map(normalizeNameKey))
      const extras = []
      for (const key of keys) extras.push(...(exactByKey.get(key) || []))
      const aliases = uniqueStrings([...(poi.aliases || []), ...extras], 80, { caseSensitive: true }).filter(
        (s) => s !== poi.name && s !== poi.display_name
      )
      if (aliases.length === (poi.aliases || []).length && aliases.every((s, i) => s === poi.aliases[i])) {
        continue
      }
      poi.aliases = aliases
      await pois.updateOne({ _id: poi._id }, { $set: { aliases, updated_at: now } })
    }

    const labelToIds = new Map()
    for (const poi of active) {
      for (const label of labelsFor(poi)) {
        const key = normalizeNameKey(label)
        if (!key) continue
        if (!labelToIds.has(key)) labelToIds.set(key, [])
        labelToIds.get(key).push(poi._id.toString())
      }
    }

    const stats = new Map()
    for (const post of reviewed) {
      const names = uniqueStrings([
        ...(post.review_details?.poi_names || []),
        ...(post.analysis_results?.poi_check?.poi_names || []),
      ])
      const hit = new Set()
      for (const name of names) {
        const ids = labelToIds.get(normalizeNameKey(name))
        if (!ids) continue
        for (const id of ids) hit.add(id)
      }
      const at = post.list?.sourced_at ? new Date(post.list.sourced_at) : null
      for (const id of hit) {
        const row = stats.get(id) || { count: 0, first: null, last: null }
        row.count += 1
        if (at && !Number.isNaN(at.getTime())) {
          if (!row.first || at < row.first) row.first = at
          if (!row.last || at > row.last) row.last = at
        }
        stats.set(id, row)
      }
    }

    let recounted = 0
    for (const poi of active) {
      const row = stats.get(poi._id.toString()) || { count: 0, first: null, last: null }
      const set = {
        post_count: row.count,
        first_seen: row.first,
        last_seen: row.last,
        updated_at: now,
      }
      if (poi.category && CATEGORY_LABELS[poi.category]) {
        set.category_label = CATEGORY_LABELS[poi.category]
      }
      await pois.updateOne({ _id: poi._id }, { $set: set })
      recounted += 1
    }

    const top = active
      .map((poi) => ({
        name: poi.display_name || poi.name,
        count: (stats.get(poi._id.toString()) || {}).count || 0,
        first: stats.get(poi._id.toString())?.first?.toISOString?.()?.slice(0, 10) || null,
        last: stats.get(poi._id.toString())?.last?.toISOString?.()?.slice(0, 10) || null,
        category: poi.category || null,
        aliases: (poi.aliases || []).length,
      }))
      .filter((row) => row.category)
      .sort((a, b) => b.count - a.count)

    console.log(
      JSON.stringify(
        {
          applied: true,
          recounted,
          handle_hidden: handleHidden,
          categorized: top,
        },
        null,
        2
      )
    )
  }

  await client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
