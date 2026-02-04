#!/usr/bin/env node

/**
 * MongoDB Posts Schema Migration Script
 *
 * Migrates all posts (Instagram, Facebook, X) to a unified, consistent schema.
 * Processes in batches of 100 for safety and error recovery.
 *
 * Usage:
 *   node scripts/migrate_posts_schema.js --dry-run    # Preview changes
 *   node scripts/migrate_posts_schema.js              # Execute migration
 */

const { MongoClient, ObjectId } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const BATCH_SIZE = 100;
const SCHEMA_VERSION = 1;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logProgress(current, total, platform) {
  const percentage = ((current / total) * 100).toFixed(1);
  log(`Progress: ${current}/${total} (${percentage}%) - ${platform}`, 'cyan');
}

/**
 * Generate platform-specific post URL
 */
function generatePostUrl(post) {
  const platform = post.platform || 'instagram';
  const postId = post.code || post.id;

  switch (platform) {
    case 'instagram':
      return `https://www.instagram.com/p/${postId}/`;

    case 'facebook':
      return `https://www.facebook.com/${postId}`;

    case 'x':
      // Try to get username, fallback to just post ID
      const username = post.author?.username || post.user?.username || 'i';
      return `https://x.com/${username}/status/${postId}`;

    default:
      return null;
  }
}

/**
 * Transform old post structure to new normalized schema
 */
function transformPost(oldPost) {
  try {
    const platform = oldPost.platform || 'instagram';
    const postId = oldPost.code || oldPost.id || oldPost._id.toString();

    // Extract timestamp
    let postedAt = null;
    if (oldPost.taken_at) {
      postedAt = typeof oldPost.taken_at === 'number'
        ? new Date(oldPost.taken_at * 1000)
        : new Date(oldPost.taken_at);
    } else if (oldPost.timestamp) {
      postedAt = typeof oldPost.timestamp === 'number'
        ? new Date(oldPost.timestamp * 1000)
        : new Date(oldPost.timestamp);
    }

    // Extract media URLs
    const mediaUrls = [];
    if (oldPost.media_urls && Array.isArray(oldPost.media_urls)) {
      oldPost.media_urls.forEach(media => {
        mediaUrls.push({
          type: media.original_media_type === 1 || media.original_type === 'image' ? 'image' : 'video',
          s3_url: media.s3_url || null,
          thumbnail_url: media.thumbnail_s3_url || null,
          original_url: media.original_url || null
        });
      });
    }

    // Fallback to root s3_url if no media_urls
    if (mediaUrls.length === 0 && oldPost.s3_url) {
      mediaUrls.push({
        type: 'image',
        s3_url: oldPost.s3_url,
        thumbnail_url: null,
        original_url: null
      });
    }

    // Extract profile information
    const profile = {
      platform_user_id: oldPost.user?.id || oldPost.author?.id || null,
      username: oldPost.user?.username || oldPost.author?.username || oldPost.author?.name || 'unknown',
      display_name: oldPost.user?.full_name || oldPost.author?.name || oldPost.user?.username || null,
      profile_url: oldPost.author?.url || (oldPost.user?.username ? `https://${platform}.com/${oldPost.user.username}` : null),
      is_verified: oldPost.user?.is_verified || oldPost.author?.verified || false
    };

    // Extract engagement metrics
    const engagement = {
      likes: oldPost.stats?.like_count || oldPost.stats?.likes || 0,
      comments: oldPost.stats?.comment_count || oldPost.stats?.comments || oldPost.stats?.replies || 0,
      shares: oldPost.stats?.shares || 0,
      retweets: oldPost.stats?.retweets || 0,
      quotes: oldPost.stats?.quotes || 0,
      replies: oldPost.stats?.replies || 0,
      views: oldPost.stats?.view_count || (oldPost.stats?.views ? parseInt(oldPost.stats.views) : null),
      posted_at: postedAt
    };

    // Build new normalized post
    const newPost = {
      // Platform & Identification
      platform: platform,
      post_id: postId,
      original_url: generatePostUrl(oldPost),

      // Post Content
      post_content: {
        caption: oldPost.caption || oldPost.content || '',
        media_urls: mediaUrls,
        post_type: oldPost.product_type || oldPost.type || 'post',
        language: oldPost.lang || null
      },

      // Profile
      profile: profile,

      // Engagement
      engagement: engagement,

      // Analysis Results (empty for now)
      analysis_results: {},

      // Review Details (empty - no preservation of test data)
      review_details: null,

      // Takedown Info (empty - no preservation of test data)
      takedown_info: {
        is_in_takedown: false,
        takedown_status: 'None',
        client_reference_id: null,
        platform_case_id: null,
        initiated_at: null,
        completed_at: null,
        notes: null
      },

      // Supabase References (placeholder)
      supabase_refs: {
        case_id: null,
        alert_ids: [],
        chat_thread_ids: []
      },

      // Source Information
      result_origin: oldPost.result_origin || {
        type: 'unknown',
        keyword: null,
        source: null
      },

      // Storage
      s3_stored: oldPost.s3_stored || false,

      // Processing Status
      processed: false,  // Reset processing status
      processed_at: null,

      // Metadata
      metadata: {
        created_at: oldPost.created_at ? new Date(oldPost.created_at) : new Date(),
        updated_at: new Date(),
        sourcing_date: oldPost.sourcing_date ? new Date(oldPost.sourcing_date) : (postedAt || new Date()),
        update_history: [{
          updated_at: new Date(),
          updated_by: 'migration_script_v1',
          changes_summary: 'Initial schema migration to v1'
        }],
        schema_version: SCHEMA_VERSION
      }
    };

    return newPost;
  } catch (error) {
    throw new Error(`Transform error: ${error.message}`);
  }
}

/**
 * Migrate posts in batches
 */
async function migrateBatch(collection, posts, dryRun = false) {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  for (const post of posts) {
    try {
      const transformedPost = transformPost(post);

      if (dryRun) {
        // In dry-run, just validate transformation
        log(`  ✓ Would migrate: ${post.platform || 'instagram'} - ${post.code || post._id}`, 'green');
        results.success++;
      } else {
        // Actually update the document
        await collection.updateOne(
          { _id: post._id },
          { $set: transformedPost }
        );
        log(`  ✓ Migrated: ${transformedPost.platform} - ${transformedPost.post_id}`, 'green');
        results.success++;
      }
    } catch (error) {
      results.failed++;
      results.errors.push({
        postId: post._id.toString(),
        platform: post.platform || 'unknown',
        code: post.code || 'N/A',
        error: error.message,
        oldData: post
      });
      log(`  ✗ Failed: ${post.code || post._id} - ${error.message}`, 'red');
    }
  }

  return results;
}

/**
 * Main migration function
 */
async function runMigration(dryRun = false) {
  const mongoUri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;

  if (!mongoUri || !dbName) {
    log('ERROR: Missing MONGO_URI or MONGO_DB_NAME in .env.local', 'red');
    process.exit(1);
  }

  log('\n========================================', 'bright');
  log('MongoDB Posts Schema Migration', 'bright');
  log('========================================\n', 'bright');

  if (dryRun) {
    log('🔍 DRY RUN MODE - No changes will be made\n', 'yellow');
  } else {
    log('⚠️  LIVE MODE - Database will be modified\n', 'yellow');
  }

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    log('✓ Connected to MongoDB', 'green');

    const db = client.db(dbName);
    const collection = db.collection('Posts');

    // Get total count
    const totalCount = await collection.countDocuments({});
    log(`\nTotal posts to migrate: ${totalCount}\n`, 'cyan');

    if (totalCount === 0) {
      log('No posts found to migrate.', 'yellow');
      return;
    }

    // Process in batches
    let processedCount = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    const allErrors = [];

    const cursor = collection.find({});
    let batch = [];

    while (await cursor.hasNext()) {
      const post = await cursor.next();
      batch.push(post);

      if (batch.length === BATCH_SIZE) {
        log(`\nProcessing batch ${Math.floor(processedCount / BATCH_SIZE) + 1}...`, 'blue');

        const results = await migrateBatch(collection, batch, dryRun);
        totalSuccess += results.success;
        totalFailed += results.failed;
        allErrors.push(...results.errors);

        processedCount += batch.length;
        logProgress(processedCount, totalCount, 'All platforms');

        batch = [];
      }
    }

    // Process remaining posts
    if (batch.length > 0) {
      log(`\nProcessing final batch...`, 'blue');
      const results = await migrateBatch(collection, batch, dryRun);
      totalSuccess += results.success;
      totalFailed += results.failed;
      allErrors.push(...results.errors);
      processedCount += batch.length;
    }

    // Summary
    log('\n========================================', 'bright');
    log('Migration Summary', 'bright');
    log('========================================\n', 'bright');
    log(`Total processed: ${processedCount}`, 'cyan');
    log(`Successful: ${totalSuccess}`, 'green');
    log(`Failed: ${totalFailed}`, totalFailed > 0 ? 'red' : 'cyan');

    // Log errors if any
    if (allErrors.length > 0) {
      log('\n⚠️  Errors encountered:', 'red');
      allErrors.forEach((err, idx) => {
        log(`\nError ${idx + 1}:`, 'red');
        log(`  Post ID: ${err.postId}`, 'yellow');
        log(`  Platform: ${err.platform}`, 'yellow');
        log(`  Code: ${err.code}`, 'yellow');
        log(`  Error: ${err.error}`, 'red');
        log(`  Old Data:`, 'yellow');
        console.log(JSON.stringify(err.oldData, null, 2));
      });
    }

    if (!dryRun) {
      log('\n✓ Migration completed successfully!', 'green');
    } else {
      log('\n✓ Dry run completed. Run without --dry-run to apply changes.', 'green');
    }

  } catch (error) {
    log(`\n✗ Migration failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    await client.close();
    log('\n✓ Disconnected from MongoDB', 'green');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// Run migration
runMigration(dryRun).catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
