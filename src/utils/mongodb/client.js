import { MongoClient } from 'mongodb'

if (!process.env.MONGO_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGO_URI"')
}

const uri = process.env.MONGO_URI
const options = {
  maxPoolSize: 10, // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds (fails before serverless timeout)
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
}

let client
let clientPromise

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options)
    global._mongoClientPromise = client.connect()
    // Suppress unhandled rejection warning, log it instead
    global._mongoClientPromise.catch(err => {
      console.error('MongoDB connection failed in development:', err.message)
    })
  }
  clientPromise = global._mongoClientPromise
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options)
  clientPromise = client.connect()
  // Suppress unhandled rejection warning, log it instead
  clientPromise.catch(err => {
    console.error('MongoDB connection failed in production:', err.message)
  })
}

export default clientPromise
