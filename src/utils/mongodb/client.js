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

let cachedClientPromise = null

function getClientPromise() {
  if (process.env.NODE_ENV === 'development') {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (Hot Module Replacement).
    if (!global._mongoClientPromise) {
      const client = new MongoClient(uri, options)
      global._mongoClientPromise = client.connect().catch(err => {
        console.error('MongoDB connection failed in development:', err.message)
        global._mongoClientPromise = null // Clear so next attempt retries
        throw err
      })
    }
    return global._mongoClientPromise
  } else {
    // In production mode, it's best to not use a global variable.
    if (!cachedClientPromise) {
      const client = new MongoClient(uri, options)
      cachedClientPromise = client.connect().catch(err => {
        console.error('MongoDB connection failed in production:', err.message)
        cachedClientPromise = null // Clear so next attempt retries
        throw err
      })
    }
    return cachedClientPromise
  }
}

const clientPromise = {
  then: function(onFulfilled, onRejected) {
    return getClientPromise().then(onFulfilled, onRejected)
  },
  catch: function(onRejected) {
    return getClientPromise().catch(onRejected)
  },
  finally: function(onFinally) {
    return getClientPromise().finally(onFinally)
  }
}

export default clientPromise
