#!/usr/bin/env node

/**
 * Migration Verification Script V2
 *
 * Verifies the V2 schema migration in the Target DB.
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

async function verifyMigration() {
  const mongoUri = process.env.MONGO_URI;
  const targetDbName = process.env.MONGO_DB_NAME_V2;

  if (!mongoUri || !targetDbName) {
    log('ERROR: Missing MONGO_URI or MONGO_DB_NAME_V2 in .env.local', 'red');
    process.exit(1);
  }

  log('
========================================', 'bright');
  log(`Verification V2 (${targetDbName})`, 'bright');
  log('========================================
', 'bright');

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    log('✓ Connected to MongoDB', 'green');

    const db = client.db(targetDbName);
    const collection = db.collection('Posts');

    const totalCount = await collection.countDocuments({});
    log(`Total posts in Target DB: ${totalCount}`, 'cyan');

    if (totalCount === 0) {
      log('⚠️  No posts found in Target DB.', 'yellow');
      return;
    }

    // Sample one document
    const sample = await collection.findOne({});
    log('
Sample Document Structure:', 'bright');
    log(JSON.stringify(sample, null, 2));

    // Validate key fields
    const invalidDocs = await collection.countDocuments({
        $or: [
            { "system_metadata.schema_version": { $ne: 2 } },
            { "post.platform": { $exists: false } },
            { "analysis": { $exists: false } }
        ]
    });

    if (invalidDocs > 0) {
        log(`
⚠️  Found ${invalidDocs} documents with invalid schema!`, 'red');
    } else {
        log('
✓ All documents match basic V2 schema check.', 'green');
    }

  } catch (error) {
    log(`
✗ Verification failed: ${error.message}`, 'red');
  } finally {
    await client.close();
    log('
✓ Disconnected', 'green');
  }
}

verifyMigration();
