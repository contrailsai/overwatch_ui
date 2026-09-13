#!/usr/bin/env node

/**
 * Label unique non-merged POIs that appear on reviewed AirForce posts.
 *
 * Usage:
 *   node scripts/label_airforce_poi_categories.js --dry-run
 *   node scripts/label_airforce_poi_categories.js --db AirForce-Data-Search
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

/** Exact lowercase display/alias → category slug. */
const NAME_TO_CATEGORY = {
  // Politicians
  'narendra modi': 'politician',
  modi: 'politician',
  'shehbaz sharif': 'politician',
  'shahbaz sharif': 'politician',
  'pm shahbaz sharif': 'politician',
  'donald trump': 'politician',
  'rajnath singh': 'politician',
  'ajit doval': 'politician',
  'xi jinping': 'politician',
  putin: 'politician',
  'amit shah': 'politician',
  'droupadi murmu': 'politician',
  'president of india': 'politician',
  'emmanuel macron': 'politician',
  'indira gandhi': 'politician',
  'atal bihari vajpayee': 'politician',
  'marco rubio': 'politician',
  'pervez musharraf': 'politician',
  'adhir ranjan chowdhury': 'politician',
  'subramanian swamy': 'politician',
  'rahul gandhi': 'politician',
  'indian parliamentarian': 'politician',

  // Indian military officials
  'air chief marshal ap singh': 'military_official',
  'air chief marshal a.p. singh': 'military_official',
  'a.p. singh': 'military_official',
  'air chief marshal amar preet singh': 'military_official',
  'amar preet singh': 'military_official',
  'ap singh': 'military_official',
  'amarpreet singh': 'military_official',
  'air marshal ashutosh dixit': 'military_official',
  'ashutosh dixit': 'military_official',
  'iaf chief': 'military_official',
  'indian air chief': 'military_official',
  'indian air force chief': 'military_official',
  'indian air chief marshal': 'military_official',
  'air chief': 'military_official',
  'general n.s. raja subramani': 'military_official',
  'general ns raja subramani': 'military_official',
  'lt gen ns raja subramani': 'military_official',
  'ns raja subramani': 'military_official',
  'general bakshi': 'military_official',
  'gd bakshi': 'military_official',
  'abhinandan varthaman': 'military_official',
  abhinandan: 'military_official',
  'wing commander abhinandan varthaman': 'military_official',
  'colonel sofiya qureshi': 'military_official',
  'anil chauhan': 'military_official',
  'iaf wing commander': 'military_official',
  'iaf officer': 'military_official',
  'sqn ldr brij pal singh sikand': 'military_official',
  'squadron leader sunil': 'military_official',
  'air marshal bharti': 'military_official',
  nachiketa: 'military_official',
  'ajay ahuja': 'military_official',
  ahuja: 'military_official',
  'general upendra dwivedi': 'military_official',
  'lieutenant general upendra dwivedi': 'military_official',
  'admiral dinesh tripathi': 'military_official',
  'air marshal narmdeshwar tiwari': 'military_official',
  'air marshal nagesh kapoor': 'military_official',
  'colonel sonal singh': 'military_official',
  'akshit singh': 'military_official',
  'capt kumar': 'military_official',

  // Opposition military officials
  'asim munir': 'adversary_military',
  'air vice marshal aurangzeb ahmed': 'adversary_military',
  'air vice marshal aurangzeb ahmad': 'adversary_military',
  'flight lieutenant hakimullah': 'adversary_military',
  'zaheer ahmed babar': 'adversary_military',
  'zaheer babar sindhu': 'adversary_military',
  'air commodore khalid chishti (r)': 'adversary_military',
  'khalid chishti': 'adversary_military',
  'avm sajid habib': 'adversary_military',
  'avm saheb': 'adversary_military',
  'khalid kidwai': 'adversary_military',
  'faisal raza khan': 'adversary_military',
  'khalid mehmood': 'adversary_military',
  'muhammad imran': 'adversary_military',
  'haider hayat khan': 'adversary_military',
  'wing commander bilal raza': 'adversary_military',

  // Indian armed forces / agencies
  'indian air force': 'armed_force',
  iaf: 'armed_force',
  'indian air force (iaf)': 'armed_force',
  'government of india': 'armed_force',

  // Opposition forces / agencies
  'pakistan air force': 'adversary_force',
  paf: 'adversary_force',
  'pakistan air force (paf)': 'adversary_force',
  'chinese air force': 'adversary_force',
  isi: 'adversary_force',
  'pakistan ordnance factory': 'adversary_force',
  'pakistan air defence': 'adversary_force',
  ttp: 'adversary_force',

  // Journalists / commentators
  'ahmed shareef': 'journalist',
  'arfa khanum sherwani': 'journalist',
  'praveen sawhney': 'journalist',
  'pravin sawhney': 'journalist',
  'gaurav arya': 'journalist',
  'major gaurav arya': 'journalist',
  'arnab goswami': 'journalist',
  'dinesh vohra': 'journalist',
  'shiv aroor': 'journalist',
  'riaz haq': 'journalist',
  vishnundtv: 'journalist',
  'rizwan saeed sheikh': 'journalist',
  'javed chaudhry': 'journalist',
  'adv. yousuf shakeel hashmi': 'journalist',

  // Companies
  tata: 'company',
  zomato: 'company',
  netflixindia: 'company',
  infosys: 'company',
  'hindustan aeronautics limited': 'company',

  // Aircraft / weapons
  rafale: 'platform_weapon',
  rafael: 'platform_weapon',
  tejas: 'platform_weapon',
  'hal tejas': 'platform_weapon',
  'j-20': 'platform_weapon',
  j10: 'platform_weapon',
  'pl-15 missile': 'platform_weapon',

  // Countries / places
  india: 'country_place',
  pakistan: 'country_place',
  china: 'country_place',
  'udhampur air base': 'country_place',

  // Parties / celebrity / ops
  bjp: 'politician',
  'kapil sharma': 'other',
  'operation sindoor': 'other',
}

function normalizeNameKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
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

function labelsForPoi(poi) {
  const out = []
  const seen = new Set()
  const push = (v) => {
    const key = normalizeNameKey(v)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(key)
  }
  push(poi.display_name)
  push(poi.name)
  for (const a of poi.aliases || []) push(a)
  for (const a of poi.alias_poi_names || []) push(a)
  return out
}

function isHandleValue(raw) {
  const s = String(raw || '').trim()
  if (!s || /\s/.test(s)) return false
  if (/[0-9_]/.test(s)) return true
  return /[a-z][A-Z]|[A-Z]{2,}[a-z]/.test(s)
}

function categoryForPoi(poi) {
  const labels = labelsForPoi(poi)
  if (labels.every(isHandleValue)) return null
  for (const key of labels) {
    if (NAME_TO_CATEGORY[key]) return NAME_TO_CATEGORY[key]
  }
  return 'other'
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI
  if (!mongoUri) {
    console.error('Requires MONGO_URI or MONGODB_URI in .env.local')
    process.exit(1)
  }

  const client = new MongoClient(mongoUri)
  await client.connect()
  const db = client.db(args.db)
  const posts = db.collection('Posts')
  const pois = db.collection('pois')

  const mentionRows = await posts
    .aggregate([
      { $match: { 'workflow.review_status': 'reviewed' } },
      { $project: { names: { $ifNull: ['$review_details.poi_names', []] } } },
      { $unwind: '$names' },
      { $group: { _id: '$names' } },
    ])
    .toArray()
  const mentionKeys = new Set(mentionRows.map((r) => normalizeNameKey(r._id)).filter(Boolean))

  const poiDocs = await pois
    .find(
      {
        status: { $ne: 'merged' },
        merged_into: null,
        merged_into_name: null,
      },
      {
        projection: {
          display_name: 1,
          name: 1,
          aliases: 1,
          alias_poi_names: 1,
          category: 1,
        },
      }
    )
    .toArray()

  const inScope = poiDocs.filter((poi) => labelsForPoi(poi).some((k) => mentionKeys.has(k)))
  const byCategory = {}
  let updated = 0

  for (const poi of inScope) {
    const slug = categoryForPoi(poi)
    if (!slug) continue
    const label = CATEGORY_LABELS[slug] || CATEGORY_LABELS.other
    if (!byCategory[slug]) byCategory[slug] = []
    byCategory[slug].push(poi.display_name || poi.name)
    if (poi.category === slug) continue
    updated += 1
    if (!args.dryRun) {
      await pois.updateOne(
        { _id: poi._id },
        {
          $set: {
            category: slug,
            category_label: label,
            updated_at: new Date(),
          },
        }
      )
    }
  }

  console.log(
    JSON.stringify(
      {
        db: args.db,
        dry_run: args.dryRun,
        reviewed_mention_strings: mentionKeys.size,
        pois_in_scope: inScope.length,
        would_update: updated,
        by_category: Object.fromEntries(
          Object.entries(byCategory).map(([k, names]) => [k, { n: names.length, names }])
        ),
      },
      null,
      2
    )
  )

  await client.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
