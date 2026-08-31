#!/usr/bin/env node

/**
 * Move mis-ingested Posts → Ads as single-creative documents (video/image).
 * Preserves media S3 URLs, analysis, workflow, and full post context in source_payload.
 *
 * Usage:
 *   node scripts/migrate_posts_to_ads.js --db SEBI-Data-Search --dry-run
 *   node scripts/migrate_posts_to_ads.js --db SEBI-Data-Search
 *   node scripts/migrate_posts_to_ads.js --db SEBI-Data-Search --filter '{"ingestion.type":"facebook_link"}'
 *
 * Requires MONGO_URI in .env.local
 */

const fs = require('fs')
const path = require('path')
const { MongoClient, ObjectId } = require('mongodb')
const dotenv = require('dotenv')
const {
  normalizeAdPlatform,
  extractAdArchiveId,
  resolvePageId,
  buildAdProfileFromAuthor,
  transformPostToAd,
} = require('./lib/posts-to-ads-transform')

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

function parseArgs(argv) {
  const args = {
    db: null,
    dryRun: false,
    filter: {},
    out: null,
    keepPosts: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--db' && argv[i + 1]) args.db = argv[++i]
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--keep-posts') args.keepPosts = true
    else if (a === '--filter' && argv[i + 1]) {
      args.filter = JSON.parse(argv[++i])
    } else if (a === '--out' && argv[i + 1]) args.out = argv[++i]
  }
  return args
}

async function resolveAdProfileId(db, post, profileCache, dryRun) {
  const platform = normalizeAdPlatform(post.platform)
  const author = post.author_snapshot || {}
  const pageId = resolvePageId(author)
  const cacheKey = `${platform}:${pageId || author.display_name || post._id}`

  if (profileCache.has(cacheKey)) {
    return profileCache.get(cacheKey)
  }

  const adProfiles = db.collection('Ad_profiles')
  let existing = null
  if (pageId) {
    existing = await adProfiles.findOne({ platform, platform_page_id: String(pageId) })
  }

  if (existing) {
    profileCache.set(cacheKey, existing._id)
    return existing._id
  }

  const now = new Date()
  const profileDoc = buildAdProfileFromAuthor(author, platform, now)
  const result = dryRun
    ? { insertedId: new ObjectId() }
    : await adProfiles.insertOne(profileDoc)

  profileCache.set(cacheKey, result.insertedId)
  return result.insertedId
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.db) {
    log('Usage: node scripts/migrate_posts_to_ads.js --db <TENANT_DB> [--dry-run] [--keep-posts]', 'red')
    process.exit(1)
  }
  if (!process.env.MONGO_URI) {
    log('MONGO_URI not set in .env.local', 'red')
    process.exit(1)
  }

  const client = new MongoClient(process.env.MONGO_URI)
  await client.connect()
  const db = client.db(args.db)

  try {
    const postsCol = db.collection('Posts')
    const adsCol = db.collection('Ads')
    const eventsCol = db.collection('case_events')

    const posts = await postsCol.find(args.filter).toArray()
    log(`\n${colors.bright}${args.db}${colors.reset}: ${posts.length} post(s) to migrate`, 'cyan')
    if (posts.length === 0) {
      log('Nothing to do.', 'yellow')
      return
    }

    const profileCache = new Map()
    const results = {
      db: args.db,
      dry_run: args.dryRun,
      migrated_at: new Date().toISOString(),
      total: posts.length,
      inserted: 0,
      skipped_existing: 0,
      profiles_created: 0,
      events_updated: 0,
      posts_deleted: 0,
      items: [],
    }

    for (const post of posts) {
      const platform = normalizeAdPlatform(post.platform)
      const platformAdId = extractAdArchiveId(post)
      const existingAd = await adsCol.findOne({ platform, platform_ad_id: platformAdId })

      if (existingAd) {
        results.skipped_existing++
        results.items.push({
          post_id: String(post._id),
          platform_ad_id: platformAdId,
          status: 'skipped_existing_ad',
        })
        log(`  skip ${post._id} — ad already exists (${platformAdId})`, 'yellow')
        continue
      }

      const profilesBefore = profileCache.size
      const adProfileId = await resolveAdProfileId(db, post, profileCache, args.dryRun)
      if (profileCache.size > profilesBefore) results.profiles_created++

      const ad = transformPostToAd(post, adProfileId)
      const mediaSummary = (ad.content.media || []).map((m) => ({
        type: m.type,
        role: m.role,
        has_s3: Boolean(m.s3_url),
      }))

      if (!args.dryRun) {
        await adsCol.insertOne(ad)

        const eventUpdate = await eventsCol.updateMany(
          { entity_type: 'post', entity_id: post._id },
          { $set: { entity_type: 'ad' } },
        )
        results.events_updated += eventUpdate.modifiedCount

        if (!args.keepPosts) {
          await postsCol.deleteOne({ _id: post._id })
          results.posts_deleted++
        }

        await db.collection('Ad_profiles').updateOne(
          { _id: adProfileId },
          { $inc: { 'list.ad_count': 1 } },
        )
      }

      results.inserted++
      results.items.push({
        post_id: String(post._id),
        ad_id: String(ad._id),
        platform_ad_id: ad.platform_ad_id,
        display_format: ad.list.display_format,
        media: mediaSummary,
        ad_profile_id: String(adProfileId),
        status: args.dryRun ? 'would_insert' : 'inserted',
      })

      log(
        `  ${args.dryRun ? 'would migrate' : 'migrated'} ${post._id} → Ads/${ad.platform_ad_id} (${ad.list.display_format}, ${mediaSummary.length} media)`,
        'green',
      )
    }

    if (args.out) {
      fs.mkdirSync(path.dirname(args.out), { recursive: true })
      fs.writeFileSync(args.out, JSON.stringify(results, null, 2))
      log(`\nWrote ${args.out}`, 'cyan')
    }

    log('\nSummary:', 'bright')
    log(`  inserted: ${results.inserted}`)
    log(`  profiles_created: ${results.profiles_created}`)
    log(`  skipped_existing: ${results.skipped_existing}`)
    if (!args.dryRun) {
      log(`  events_updated: ${results.events_updated}`)
      log(`  posts_deleted: ${results.posts_deleted}`)
    }
    if (args.dryRun) log('\n(dry-run — no writes performed)', 'yellow')
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  log(`Error: ${err.message}`, 'red')
  console.error(err)
  process.exit(1)
})
