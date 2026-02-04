const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: '.env.local' });

async function createIndexes() {
  const mongoUri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;

  if (!mongoUri || !dbName) {
    console.error('ERROR: Missing MONGO_URI or MONGO_DB_NAME in .env.local');
    process.exit(1);
  }

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    console.log('✓ Connected to MongoDB');

    const db = client.db(dbName);
    const collection = db.collection('Posts');

    console.log('Creating indexes...');

    // Index for default unreviewed view
    await collection.createIndex({ processed: 1, 'metadata.created_at': -1 });
    console.log('✓ Index created: { processed: 1, "metadata.created_at": -1 }');

    // Index for platform filtering
    await collection.createIndex({ processed: 1, platform: 1, 'metadata.created_at': -1 });
    console.log('✓ Index created: { processed: 1, platform: 1, "metadata.created_at": -1 }');

    // Index for sourcing date filtering
    await collection.createIndex({ processed: 1, 'metadata.sourcing_date': -1 });
    console.log('✓ Index created: { processed: 1, "metadata.sourcing_date": -1 }');

    // Index for AI Analyzed filtering
    await collection.createIndex({ "analysis_results.risk_score": 1, "metadata.created_at": -1 }, { sparse: true });
    console.log('✓ Index created: { "analysis_results.risk_score": 1, "metadata.created_at": -1 } (sparse)');

    console.log('\n✓ All indexes created successfully!');
  } catch (error) {
    console.error('✗ Failed to create indexes:', error);
  } finally {
    await client.close();
  }
}

createIndexes();
