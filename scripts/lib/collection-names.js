/**
 * Canonical MongoDB collection names — must match src/utils/mongodb/collections.js
 */
module.exports = {
  POSTS: 'Posts',
  /** @deprecated Mistaken lowercase collection from old migration scripts; drop after cutover */
  LEGACY_POSTS: 'posts',
  PROFILES: 'profiles',
  LEGACY_PROFILES: 'Profiles',
  POST_EMBEDDINGS: 'post_embeddings',
  CASE_EVENTS: 'case_events',
  TOPICS: 'topics',
  LEGACY_TOPICS: 'Topics',
}
