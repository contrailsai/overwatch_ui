#!/usr/bin/env node

/**
 * MongoDB Backup Script
 * Creates a JSON backup of all posts before migration
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function backupMongoDB() {
  const mongoUri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;

  if (!mongoUri || !dbName) {
    log('ERROR: Missing MONGO_URI or MONGO_DB_NAME in .env.local', 'red');
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(__dirname, '../backups');
  const backupFile = path.join(backupDir, `posts_backup_${timestamp}.json`);

  log('\n========================================', 'bright');
  log('MongoDB Backup', 'bright');
  log('========================================\n', 'bright');

  const client = new MongoClient(mongoUri);

  try {
    // Create backup directory if it doesn't exist
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
      log('✓ Created backup directory', 'green');
    }

    await client.connect();
    log('✓ Connected to MongoDB', 'green');

    const db = client.db(dbName);
    const collection = db.collection('Posts');

    const totalCount = await collection.countDocuments({});
    log(`\nTotal posts to backup: ${totalCount}`, 'cyan');

    log('\nExporting posts...', 'yellow');
    const posts = await collection.find({}).toArray();

    log('Writing to file...', 'yellow');
    fs.writeFileSync(backupFile, JSON.stringify(posts, null, 2));

    const stats = fs.statSync(backupFile);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    log('\n========================================', 'bright');
    log('Backup Complete!', 'bright');
    log('========================================\n', 'bright');
    log(`✓ Backed up ${totalCount} posts`, 'green');
    log(`✓ File: ${backupFile}`, 'green');
    log(`✓ Size: ${fileSizeMB} MB`, 'green');

  } catch (error) {
    log(`\n✗ Backup failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    await client.close();
    log('\n✓ Disconnected from MongoDB\n', 'green');
  }
}

backupMongoDB().catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
