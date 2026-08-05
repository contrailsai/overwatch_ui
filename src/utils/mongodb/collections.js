/** MongoDB collection names for schema v3 tenant databases. */
export const COLLECTIONS = {
  posts: 'Posts',
  profiles: 'profiles',
  case_events: 'case_events',
  post_embeddings: 'post_embeddings',
  profile_embeddings: 'profile_embeddings',
  topics: 'topics',
  pois: 'pois',
  unique_clusters: 'unique_clusters',
}

export function postsCollection(db) {
  return db.collection(COLLECTIONS.posts)
}

export function profilesCollection(db) {
  return db.collection(COLLECTIONS.profiles)
}

export function caseEventsCollection(db) {
  return db.collection(COLLECTIONS.case_events)
}

export function postEmbeddingsCollection(db) {
  return db.collection(COLLECTIONS.post_embeddings)
}

export function topicsCollection(db) {
  return db.collection(COLLECTIONS.topics)
}

export function poisCollection(db) {
  return db.collection(COLLECTIONS.pois)
}
