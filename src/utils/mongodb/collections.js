/** MongoDB collection names for schema v3 tenant databases. */
export const COLLECTIONS = {
  posts: 'Posts',
  profiles: 'profiles',
  ads: 'Ads',
  ad_profiles: 'Ad_profiles',
  domains: 'Domains',
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

export function adsCollection(db) {
  return db.collection(COLLECTIONS.ads)
}

export function adProfilesCollection(db) {
  return db.collection(COLLECTIONS.ad_profiles)
}

export function domainsCollection(db) {
  return db.collection(COLLECTIONS.domains)
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
