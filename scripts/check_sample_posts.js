#!/usr/bin/env node

const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function checkPost() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db(process.env.MONGO_DB_NAME);
    const collection = db.collection('Posts');

    // Get one Instagram post
    const instagram = await collection.findOne({ platform: 'instagram' });
    console.log('\n========== INSTAGRAM POST (Truncated) ==========');
    delete instagram._id; // Remove for cleaner display
    console.log(JSON.stringify(instagram, null, 2).substring(0, 3000));

    // Get one Facebook post
    const facebook = await collection.findOne({ platform: 'facebook' });
    console.log('\n\n========== FACEBOOK POST (Truncated) ==========');
    delete facebook._id;
    console.log(JSON.stringify(facebook, null, 2).substring(0, 3000));

    // Get one X post
    const x = await collection.findOne({ platform: 'x' });
    console.log('\n\n========== X (TWITTER) POST (Truncated) ==========');
    delete x._id;
    console.log(JSON.stringify(x, null, 2).substring(0, 3000));

  } finally {
    await client.close();
  }
}

checkPost();
