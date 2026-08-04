#!/usr/bin/env node

/**
 * Verify a schema v3 tenant database after migration.
 *
 * Usage:
 *   node scripts/verify_v3.js --db <TARGET_DB> [--source <SOURCE_DB>]
 *
 * With --source, also compares post/profile document counts.
 * Requires MONGO_URI in .env.local
 */

const { MongoClient } = require('mongodb')
const dotenv = require('dotenv')
const path = require('path')

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
  const args = { db: null, source: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db' && argv[i + 1]) args.db = argv[++i]
    else if (argv[i] === '--source' && argv[i + 1]) args.source = argv[++i]
  }
  return args
}

async function resolveCount(db, names) {
  for (const name of names) {
    const cols = await db.listCollections({ name }).toArray()
    if (cols.length > 0) {
      return { name, count: await db.collection(name).countDocuments({}) }
    }
  }
  return { name: names[0], count: 0 }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const mongoUri = process.env.MONGO_URI

  if (!mongoUri || !args.db) {
    console.error('Usage: node scripts/verify_v3.js --db <TARGET_DB> [--source <SOURCE_DB>]')
    process.exit(1)
  }

  const client = new MongoClient(mongoUri)
  const errors = []
  const warnings = []

  const fail = (msg) => errors.push(msg)
  const warn = (msg) => warnings.push(msg)

  try {
    await client.connect()
    const db = client.db(args.db)

    log('========================================', 'bright')
    log(`Verify v3: ${args.db}`, 'bright')
    log('========================================', 'bright')

    const postsCount = await db.collection('posts').countDocuments({})
    const profilesCount = await db.collection('profiles').countDocuments({})
    const embCount = await db.collection('post_embeddings').countDocuments({})
    const eventsCount = await db.collection('case_events').countDocuments({})

    log(`posts: ${postsCount}`, 'cyan')
    log(`profiles: ${profilesCount}`, 'cyan')
    log(`post_embeddings: ${embCount}`, 'cyan')
    log(`case_events: ${eventsCount}`, 'cyan')

    if (postsCount === 0) {
      warn('No posts in target DB')
    }

    // Sample posts for schema checks
    const sampleSize = Math.min(50, postsCount)
    const samplePosts =
      sampleSize > 0
        ? await db
            .collection('posts')
            .aggregate([{ $sample: { size: sampleSize } }])
            .toArray()
        : []

    let missingSchema = 0
    let hasEmbeddingOnPost = 0
    let missingList = 0
    let missingWorkflow = 0

    for (const p of samplePosts) {
      if (p.schema_version !== 3) missingSchema++
      if (!p.list) missingList++
      if (!p.workflow) missingWorkflow++
      if (p.text_embedding || p.image_embedding) hasEmbeddingOnPost++
    }

    if (samplePosts.length > 0) {
      if (missingSchema > 0) {
        fail(`${missingSchema}/${samplePosts.length} sampled posts missing schema_version 3`)
      } else {
        log(`✓ Sampled posts have schema_version 3 (${samplePosts.length})`, 'green')
      }
      if (missingList > 0) {
        fail(`${missingList}/${samplePosts.length} sampled posts missing list.*`)
      }
      if (missingWorkflow > 0) {
        fail(`${missingWorkflow}/${samplePosts.length} sampled posts missing workflow.*`)
      }
      if (hasEmbeddingOnPost > 0) {
        fail(
          `${hasEmbeddingOnPost}/${samplePosts.length} sampled posts still have text/image_embedding on the post doc`
        )
      } else {
        log('✓ Sampled posts have no inline embeddings', 'green')
      }
    }

    // Embedding post_id integrity
    if (embCount > 0) {
      const orphaned = await db
        .collection('post_embeddings')
        .aggregate([
          {
            $lookup: {
              from: 'posts',
              localField: 'post_id',
              foreignField: '_id',
              as: 'post',
            },
          },
          { $match: { post: { $size: 0 } } },
          { $limit: 5 },
          { $project: { post_id: 1 } },
        ])
        .toArray()
      if (orphaned.length > 0) {
        fail(`Found post_embeddings with no matching post (e.g. ${orphaned[0].post_id})`)
      } else {
        log('✓ post_embeddings.post_id resolve to posts', 'green')
      }
    }

    if (embCount > postsCount) {
      warn(`More embeddings (${embCount}) than posts (${postsCount})`)
    }

    // case_events spot-check
    if (eventsCount > 0) {
      const sampleEvents = await db
        .collection('case_events')
        .find({ entity_type: 'post' })
        .limit(20)
        .toArray()
      let unresolved = 0
      for (const ev of sampleEvents) {
        const found = await db.collection('posts').findOne(
          { _id: ev.entity_id },
          { projection: { _id: 1 } }
        )
        if (!found) unresolved++
      }
      if (unresolved > 0) {
        fail(`${unresolved}/${sampleEvents.length} sampled case_events entity_id missing post`)
      } else if (sampleEvents.length > 0) {
        log('✓ Sampled case_events resolve to posts', 'green')
      }
    } else {
      warn('case_events is empty (ok if source had no update_history)')
    }

    // Profiles
    const sampleProfiles = await db
      .collection('profiles')
      .find({})
      .limit(Math.min(30, profilesCount))
      .toArray()

    let profilesWithPostsArr = 0
    let countMismatch = 0
    for (const profile of sampleProfiles) {
      if (Array.isArray(profile.posts)) profilesWithPostsArr++
      if (profile.schema_version !== 3) {
        fail(`Profile ${profile._id} missing schema_version 3`)
      }
      const actual = await db.collection('posts').countDocuments({
        profile_id: profile._id,
      })
      const listed = profile.list?.post_count
      if (listed != null && listed !== actual) {
        countMismatch++
      }
    }
    if (profilesWithPostsArr > 0) {
      fail(`${profilesWithPostsArr} sampled profiles still have posts[]`)
    } else if (sampleProfiles.length > 0) {
      log('✓ Sampled profiles have no posts[]', 'green')
    }
    if (countMismatch > 0) {
      warn(
        `${countMismatch}/${sampleProfiles.length} sampled profiles: list.post_count ≠ posts.count({profile_id})`
      )
    } else if (sampleProfiles.length > 0) {
      log('✓ Sampled list.post_count matches linked posts', 'green')
    }

    // Source vs target counts
    if (args.source) {
      const sourceDb = client.db(args.source)
      const srcPosts = await resolveCount(sourceDb, ['Posts', 'posts'])
      const srcProfiles = await resolveCount(sourceDb, ['Profiles', 'profiles'])
      log(
        `Source posts (${srcPosts.name}): ${srcPosts.count} → target posts: ${postsCount}`,
        'cyan'
      )
      log(
        `Source profiles (${srcProfiles.name}): ${srcProfiles.count} → target profiles: ${profilesCount}`,
        'cyan'
      )
      if (srcPosts.count !== postsCount) {
        fail(`Post count mismatch: source ${srcPosts.count} vs target ${postsCount}`)
      } else {
        log('✓ Post counts match source', 'green')
      }
      if (srcProfiles.count !== profilesCount) {
        fail(
          `Profile count mismatch: source ${srcProfiles.count} vs target ${profilesCount}`
        )
      } else {
        log('✓ Profile counts match source', 'green')
      }
    }

    log('\n========================================', 'bright')
    if (warnings.length) {
      for (const w of warnings) log(`WARN: ${w}`, 'yellow')
    }
    if (errors.length) {
      for (const e of errors) log(`FAIL: ${e}`, 'red')
      log(`Verification FAILED (${errors.length} error(s))`, 'red')
      process.exit(1)
    }
    log('Verification PASSED', 'green')
    log('========================================', 'bright')
  } catch (err) {
    log(`Fatal: ${err.message}`, 'red')
    console.error(err)
    process.exit(1)
  } finally {
    await client.close()
  }
}

main()
