const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: '.env.local' });

async function debug() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db(process.env.MONGO_DB_NAME);
    const collection = db.collection('Posts');

    const total = await collection.countDocuments({});
    const processedTrue = await collection.countDocuments({ processed: true });
    const processedFalse = await collection.countDocuments({ processed: false });
    const processedMissing = await collection.countDocuments({ processed: { $exists: false } });
    const processedNull = await collection.countDocuments({ processed: null });
    
    const hasAI = await collection.countDocuments({ "analysis_results.risk_score": { $exists: true } });
    const hasAIAndUnprocessed = await collection.countDocuments({
      $and: [
        { $or: [{ processed: { $exists: false } }, { processed: false }] },
        { "analysis_results.risk_score": { $exists: true } }
      ]
    });

    console.log('--- MongoDB Debug ---');
    console.log('Total posts:', total);
    console.log('Processed (true):', processedTrue);
    console.log('Processed (false):', processedFalse);
    console.log('Processed (missing):', processedMissing);
    console.log('Processed (null):', processedNull);
    console.log('Has AI risk_score:', hasAI);
    console.log('Has AI AND Unprocessed (current logic):', hasAIAndUnprocessed);

    if (hasAI > 0) {
        const sampleAI = await collection.findOne({ "analysis_results.risk_score": { $exists: true } });
        console.log('Sample AI Post Processed Status:', sampleAI.processed);
    }

  } finally {
    await client.close();
  }
}

debug();