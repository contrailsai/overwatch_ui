const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: '.env.local' });

async function createPoiIndex() {
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

    console.log('Creating POI index...');

    // Index for POI Detected filtering
    // Sparse index since not all documents have this field
    await collection.createIndex(
      { "analysis_results.poi_check.poi_name_found": 1, "metadata.created_at": -1 }, 
      { sparse: true }
    );
    console.log('✓ Index created: { "analysis_results.poi_check.poi_name_found": 1, "metadata.created_at": -1 } (sparse)');

    console.log('\n✓ POI index created successfully!');
  } catch (error) {
    console.error('✗ Failed to create index:', error);
  } finally {
    await client.close();
  }
}

createPoiIndex();
