#!/usr/bin/env node

/**
 * MongoDB Posts Schema Migration V2
 *
 * Migrates posts from V1 schema (Source DB) to V2 schema (Target DB).
 * Based on 'new_data_strucutre.json' mapping.
 *
 * Usage:
 *   node scripts/migrate_v2.js --dry-run    # Preview changes
 *   node scripts/migrate_v2.js              # Execute migration
 */

const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const BATCH_SIZE = 100;
const SCHEMA_VERSION = 2;

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

function logProgress(current, total, info) {
    const percentage = ((current / total) * 100).toFixed(1);
    log(`Progress: ${current}/${total} (${percentage}%) - ${info}`, 'cyan');
}

/**
 * Transform V1 post structure to V2 schema
 */
function transformPostV2(oldPost) {
    try {
        const platform = oldPost.platform || 'instagram';
        const postId = oldPost.code || oldPost.post_id || oldPost.id || oldPost._id.toString();

        // Dates
        const createdAt = oldPost.metadata?.created_at ? new Date(oldPost.metadata.created_at) : (oldPost.created_at ? new Date(oldPost.created_at) : new Date());
        const updatedAt = new Date();
        const sourcedDate = oldPost.sourcing_date ? new Date(oldPost.sourcing_date) : (oldPost.taken_at ? new Date(oldPost.taken_at * 1000) : createdAt);

        // Media
        const media = [];
        if (oldPost.post_content?.media_urls && Array.isArray(oldPost.post_content.media_urls)) {
            oldPost.post_content.media_urls.forEach(m => {
                media.push({
                    type: m.type || 'image',
                    original_url: m.original_url || null,
                    s3_url: m.s3_url || null,
                    thumbnail_url: m.thumbnail_url || null,
                    // signed_url: null // Generated at runtime
                });
            });
        } else if (oldPost.media_urls && Array.isArray(oldPost.media_urls)) {
            oldPost.media_urls.forEach(m => {
                media.push({
                    type: m.type || (m.original_media_type === 1 ? 'image' : 'video'),
                    original_url: m.original_url || null,
                    s3_url: m.s3_url || null,
                    thumbnail_url: m.thumbnail_s3_url || null
                });
            });
        }

        // Analysis Status
        const analysisResults = oldPost.analysis_results || {};
        const hasAnalysis = Object.keys(analysisResults).length > 0;

        // Construct V2 Object
        const newPost = {
            _id: oldPost._id, // Preserve ID

            system_metadata: {
                schema_version: SCHEMA_VERSION,
                created_at: createdAt,
                updated_at: updatedAt,
                storage: {
                    s3_stored: oldPost.s3_stored || oldPost.metadata?.storage?.s3_stored || false
                },
                database_refs: {
                    case_id: oldPost.supabase_refs?.case_id || null,
                    alert_ids: oldPost.supabase_refs?.alert_ids || [],
                    chat_thread_ids: oldPost.supabase_refs?.chat_thread_ids || []
                }
            },

            ingestion_details: {
                type: oldPost.result_origin?.type || 'unknown',
                source_url: oldPost.result_origin?.source_url || oldPost.result_origin?.source || null,
                ingested_at: createdAt
            },

            post: {
                platform: platform,
                platform_post_id: postId,
                platform_numeric_id: oldPost.id || oldPost.platform_numeric_id || null,
                post_type: oldPost.post_content?.post_type || oldPost.type || 'feed',
                url: oldPost.original_url || oldPost.url || null,
                posted_at: sourcedDate,
                language: oldPost.post_content?.language || oldPost.lang || null,
                author: {
                    platform_user_id: oldPost.profile?.platform_user_id || oldPost.user?.id || null,
                    username: oldPost.profile?.username || oldPost.user?.username || 'unknown',
                    display_name: oldPost.profile?.display_name || oldPost.user?.full_name || null,
                    profile_url: oldPost.profile?.profile_url || (oldPost.profile?.username ? `https://${platform}.com/${oldPost.profile.username}` : null),
                    profile_pic_url: oldPost.profile?.profile_pic_url || oldPost.user?.profile_pic_url || null,
                    is_verified: oldPost.profile?.is_verified || oldPost.user?.is_verified || false
                },
                content: {
                    text: oldPost.post_content?.caption || oldPost.caption || oldPost.content || ''
                },
                media: media,
                metrics: {
                    likes: oldPost.engagement?.likes || oldPost.stats?.like_count || 0,
                    comments: oldPost.engagement?.comments || oldPost.stats?.comment_count || 0,
                    shares: oldPost.engagement?.shares || oldPost.stats?.share_count || 0,
                    views: oldPost.engagement?.views || oldPost.stats?.view_count || null,
                    retweets: oldPost.engagement?.retweets || oldPost.stats?.retweet_count || 0,
                    quotes: oldPost.engagement?.quotes || oldPost.stats?.quote_count || 0,
                    replies: oldPost.engagement?.replies || oldPost.stats?.reply_count || 0
                }
            },

            analysis: {
                status: hasAnalysis ? 'completed' : 'pending',
                analyzed_at: analysisResults.analyzed_at || null,
                overall_assessment: {
                    risk_score: analysisResults.risk_score || 0,
                    category: analysisResults.category || 'unknown',
                    summary_reason: analysisResults.categorization_reason || null
                },
                modules: {
                    poi_check: analysisResults.poi_check || null,
                    truth_check: analysisResults.truth_check || null,
                    aigc_check: analysisResults.aigc_check || null,
                    nsfw_check: analysisResults.nsfw_check || null,
                    hate_speech_check: analysisResults.hate_speech_check || null,
                    fraud_check: analysisResults.fraud_check || null,
                    humor_check: analysisResults.humor_check || null,
                    asset_misuse_check: analysisResults.asset_misuse_check || null,
                    nlp_extraction: analysisResults.verbs_nouns || null
                }
            },

            moderation_workflow: {
                review_details: oldPost.review_details || {},
                takedown_info: oldPost.takedown_info || {
                    is_in_takedown: false,
                    takedown_status: 'None',
                    client_reference_id: null,
                    platform_case_id: null,
                    initiated_at: null,
                    completed_at: null,
                    notes: null
                }
            }
        };

        return newPost;
    } catch (error) {
        throw new Error(`Transform error for ID ${oldPost._id}: ${error.message}`);
    }
}

async function migrateBatch(targetCollection, posts, dryRun) {
    let success = 0;
    let failed = 0;
    const errors = [];

    for (const post of posts) {
        try {
            const transformed = transformPostV2(post);

            if (dryRun) {
                // log(`  [Dry Run] Would insert: ${transformed.post.platform} - ${transformed.post.platform_post_id}`, 'green');
                success++;
            } else {
                await targetCollection.updateOne(
                    { _id: transformed._id },
                    { $set: transformed },
                    { upsert: true }
                );
                success++;
            }
        } catch (err) {
            failed++;
            errors.push({ id: post._id, error: err.message });
            log(`  Transformation Error: ${err.message}`, 'red');
        }
    }
    return { success, failed, errors };
}

async function runMigration() {
    const mongoUri = process.env.MONGO_URI;
    const sourceDbName = process.env.MONGO_DB_NAME;
    const targetDbName = process.env.MONGO_DB_NAME_V2;
    const dryRun = process.argv.includes('--dry-run');

    if (!mongoUri || !sourceDbName || !targetDbName) {
        log('ERROR: Missing DB Config. Check .env.local for MONGO_URI, MONGO_DB_NAME, MONGO_DB_NAME_V2', 'red');
        process.exit(1);
    }

    log('========================================', 'bright');
    log(`Migration V1 -> V2 (${dryRun ? 'DRY RUN' : 'LIVE'})`, 'bright');
    log(`Source: ${sourceDbName}`, 'yellow');
    log(`Target: ${targetDbName}`, 'yellow');
    log('========================================', 'bright');

    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        log('✓ Connected to MongoDB', 'green');

        const sourceDb = client.db(sourceDbName);
        const targetDb = client.db(targetDbName);

        const sourceCollection = sourceDb.collection('Posts');
        const targetCollection = targetDb.collection('Posts');

        const totalCount = await sourceCollection.countDocuments({});
        log(`Total posts to migrate: ${totalCount}`, 'cyan');

        if (totalCount === 0) {
            log('No posts found.', 'yellow');
            return;
        }

        let processed = 0;
        let totalSuccess = 0;
        let totalFailed = 0;

        const cursor = sourceCollection.find({});
        let batch = [];

        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            batch.push(doc);

            if (batch.length === BATCH_SIZE) {
                const results = await migrateBatch(targetCollection, batch, dryRun);
                totalSuccess += results.success;
                totalFailed += results.failed;
                processed += batch.length;
                logProgress(processed, totalCount, `Batch stats: ${results.success} ok, ${results.failed} err`);
                batch = [];
            }
        }

        if (batch.length > 0) {
            const results = await migrateBatch(targetCollection, batch, dryRun);
            totalSuccess += results.success;
            totalFailed += results.failed;
            processed += batch.length;
            logProgress(processed, totalCount, `Final Batch: ${results.success} ok, ${results.failed} err`);
        }

        log('========================================', 'bright');
        log('Migration Summary', 'bright');
        log(`Processed: ${processed}`, 'cyan');
        log(`Success: ${totalSuccess}`, 'green');
        log(`Failed: ${totalFailed}`, totalFailed > 0 ? 'red' : 'green');
        log('========================================', 'bright');

    } catch (err) {
        log(`Fatal Error: ${err.message}`, 'red');
        process.exit(1);
    } finally {
        await client.close();
        log('✓ Disconnected', 'green');
    }
}

runMigration();
