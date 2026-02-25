#!/usr/bin/env node

/**
 * MongoDB Script to Clear review_details from all Posts
 *
 * Sets review_details: {} for all documents in the Posts collection.
 * Processes in batches of 100 for safety and progress monitoring.
 *
 * Usage:
 *   node scripts/clear_review_details.js --dry-run    # Preview count
 *   node scripts/clear_review_details.js              # Execute reset
 */

const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const BATCH_SIZE = 100;

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

/**
 * Main function to run the reset
 */
async function runReset(dryRun = false) {
    const mongoUri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;

    if (!mongoUri || !dbName) {
        log('ERROR: Missing MONGO_URI or MONGO_DB_NAME in .env.local', 'red');
        process.exit(1);
    }

    log('\n========================================', 'bright');
    log('MongoDB Clear Review Details', 'bright');
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
        log(`\nTotal posts found in collection: ${totalCount}\n`, 'cyan');

        if (totalCount === 0) {
            log('No posts found to process.', 'yellow');
            return;
        }

        if (dryRun) {
            log(`DRY RUN: Found ${totalCount} posts that would have their review_details reset to {}.`, 'green');
            log('\n✓ Dry run completed. Run without --dry-run to apply changes.', 'green');
        } else {
            log(`Starting reset for ${totalCount} posts...\n`, 'blue');

            let processedCount = 0;
            const cursor = collection.find({}).project({ _id: 1 });
            let batch = [];

            while (await cursor.hasNext()) {
                const doc = await cursor.next();
                batch.push(doc._id);

                if (batch.length === BATCH_SIZE) {
                    await collection.updateMany(
                        { _id: { $in: batch } },
                        { $set: { review_details: {} } }
                    );
                    processedCount += batch.length;
                    const percentage = ((processedCount / totalCount) * 100).toFixed(1);
                    log(`Progress: ${processedCount}/${totalCount} (${percentage}%) - Updated`, 'cyan');
                    batch = [];
                }
            }

            // Process remaining posts
            if (batch.length > 0) {
                await collection.updateMany(
                    { _id: { $in: batch } },
                    { $set: { review_details: {} } }
                );
                processedCount += batch.length;
                log(`Progress: ${processedCount}/${totalCount} (100.0%) - Updated (final batch)`, 'cyan');
            }

            log('\n✓ Successfully reset review_details on all posts.', 'green');
        }

    } catch (error) {
        log(`\n✗ Reset failed: ${error.message}`, 'red');
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

// Run reset
runReset(dryRun).catch(error => {
    log(`Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});
