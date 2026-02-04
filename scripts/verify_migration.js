#!/usr/bin/env node

/**
 * Migration Verification Script
 *
 * Checks a sample of migrated posts to verify the schema is correct.
 *
 * Usage:
 *   node scripts/verify_migration.js
 */

const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

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

/**
 * Validate post schema
 */
function validatePost(post) {
  const errors = [];
  const warnings = [];

  // Check required fields
  if (!post.platform) errors.push('Missing: platform');
  if (!post.post_id) errors.push('Missing: post_id');
  if (!post.post_content) errors.push('Missing: post_content');
  if (!post.profile) errors.push('Missing: profile');
  if (!post.engagement) errors.push('Missing: engagement');
  if (!post.metadata) errors.push('Missing: metadata');
  if (post.metadata && post.metadata.schema_version !== 1) {
    errors.push(`Invalid schema_version: ${post.metadata.schema_version}`);
  }

  // Check post_content
  if (post.post_content && !post.post_content.caption && post.post_content.caption !== '') {
    warnings.push('post_content.caption is undefined (should be string or empty string)');
  }
  if (post.post_content && !Array.isArray(post.post_content.media_urls)) {
    errors.push('post_content.media_urls is not an array');
  }

  // Check profile
  if (post.profile && !post.profile.username) {
    warnings.push('profile.username is missing');
  }

  // Check engagement
  if (post.engagement) {
    if (typeof post.engagement.likes !== 'number') warnings.push('engagement.likes is not a number');
    if (typeof post.engagement.comments !== 'number') warnings.push('engagement.comments is not a number');
    if (!post.engagement.posted_at) warnings.push('engagement.posted_at is missing');
  }

  // Check takedown_info
  if (!post.takedown_info) {
    errors.push('Missing: takedown_info');
  }

  // Check supabase_refs
  if (!post.supabase_refs) {
    errors.push('Missing: supabase_refs');
  }

  return { errors, warnings };
}

/**
 * Main verification function
 */
async function verifyMigration() {
  const mongoUri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;

  if (!mongoUri || !dbName) {
    log('ERROR: Missing MONGO_URI or MONGO_DB_NAME in .env.local', 'red');
    process.exit(1);
  }

  log('\n========================================', 'bright');
  log('Migration Verification', 'bright');
  log('========================================\n', 'bright');

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    log('✓ Connected to MongoDB', 'green');

    const db = client.db(dbName);
    const collection = db.collection('Posts');

    // Get counts
    const totalCount = await collection.countDocuments({});
    const migratedCount = await collection.countDocuments({ 'metadata.schema_version': 1 });
    const oldSchemaCount = totalCount - migratedCount;

    log(`\nTotal posts: ${totalCount}`, 'cyan');
    log(`Migrated (v1): ${migratedCount}`, 'green');
    log(`Old schema: ${oldSchemaCount}`, oldSchemaCount > 0 ? 'yellow' : 'green');

    if (migratedCount === 0) {
      log('\n⚠️  No migrated posts found. Run the migration script first.', 'yellow');
      return;
    }

    // Sample posts by platform
    log('\n----------------------------------------', 'cyan');
    log('Checking sample posts by platform...', 'cyan');
    log('----------------------------------------\n', 'cyan');

    const platforms = ['instagram', 'facebook', 'x'];
    let totalErrors = 0;
    let totalWarnings = 0;

    for (const platform of platforms) {
      const samplePosts = await collection
        .find({
          platform: platform,
          'metadata.schema_version': 1
        })
        .limit(3)
        .toArray();

      if (samplePosts.length === 0) {
        log(`${platform}: No migrated posts found`, 'yellow');
        continue;
      }

      log(`\n${platform.toUpperCase()}:`, 'blue');

      samplePosts.forEach((post, idx) => {
        const { errors, warnings } = validatePost(post);

        if (errors.length === 0 && warnings.length === 0) {
          log(`  ✓ Post ${idx + 1} (${post.post_id}): Valid`, 'green');
        } else {
          log(`  Post ${idx + 1} (${post.post_id}):`, 'yellow');

          if (errors.length > 0) {
            log(`    Errors (${errors.length}):`, 'red');
            errors.forEach(err => log(`      - ${err}`, 'red'));
            totalErrors += errors.length;
          }

          if (warnings.length > 0) {
            log(`    Warnings (${warnings.length}):`, 'yellow');
            warnings.forEach(warn => log(`      - ${warn}`, 'yellow'));
            totalWarnings += warnings.length;
          }
        }
      });
    }

    // Check for specific field migrations
    log('\n----------------------------------------', 'cyan');
    log('Checking field migrations...', 'cyan');
    log('----------------------------------------\n', 'cyan');

    const samplePost = await collection.findOne({ 'metadata.schema_version': 1 });

    if (samplePost) {
      log('Sample post structure:', 'blue');
      log(`  Platform: ${samplePost.platform}`, 'cyan');
      log(`  Post ID: ${samplePost.post_id}`, 'cyan');
      log(`  Original URL: ${samplePost.original_url || 'N/A'}`, 'cyan');
      log(`  Caption: ${samplePost.post_content?.caption?.substring(0, 50)}...`, 'cyan');
      log(`  Username: ${samplePost.profile?.username}`, 'cyan');
      log(`  Likes: ${samplePost.engagement?.likes}`, 'cyan');
      log(`  Media URLs: ${samplePost.post_content?.media_urls?.length || 0}`, 'cyan');
      log(`  Schema Version: ${samplePost.metadata?.schema_version}`, 'cyan');
    }

    // Summary
    log('\n========================================', 'bright');
    log('Verification Summary', 'bright');
    log('========================================\n', 'bright');

    if (totalErrors === 0 && totalWarnings === 0) {
      log('✓ All checked posts are valid!', 'green');
    } else {
      if (totalErrors > 0) {
        log(`✗ Found ${totalErrors} errors`, 'red');
      }
      if (totalWarnings > 0) {
        log(`⚠  Found ${totalWarnings} warnings`, 'yellow');
      }
    }

    if (oldSchemaCount > 0) {
      log(`\n⚠️  ${oldSchemaCount} posts still using old schema`, 'yellow');
      log('   Run the migration script to update them.', 'yellow');
    }

  } catch (error) {
    log(`\n✗ Verification failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    await client.close();
    log('\n✓ Disconnected from MongoDB\n', 'green');
  }
}

verifyMigration().catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
