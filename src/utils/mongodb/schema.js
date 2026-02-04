/**
 * MongoDB Schema Helper Functions
 *
 * Helper functions to work with the normalized post schema (v1)
 */

/**
 * Check if a post is using the new schema
 */
export function isNewSchema(post) {
  return post.metadata?.schema_version === 1;
}

/**
 * Get caption from post (supports both old and new schema)
 */
export function getCaption(post) {
  return post.post_content?.caption || post.caption || post.content || '';
}

/**
 * Get username from post (supports both old and new schema)
 */
export function getUsername(post) {
  return post.profile?.username ||
         post.user?.username ||
         post.author?.username ||
         post.author?.name ||
         'Unknown';
}

/**
 * Get display name from post (supports both old and new schema)
 */
export function getDisplayName(post) {
  return post.profile?.display_name ||
         post.user?.full_name ||
         post.author?.name ||
         getUsername(post);
}

/**
 * Get profile URL from post (supports both old and new schema)
 */
export function getProfileUrl(post) {
  return post.profile?.profile_url ||
         post.author?.url ||
         null;
}

/**
 * Get verification status from post (supports both old and new schema)
 */
export function isVerified(post) {
  return post.profile?.is_verified ||
         post.user?.is_verified ||
         post.author?.verified ||
         false;
}

/**
 * Get media URLs from post (supports both old and new schema)
 */
export function getMediaUrls(post) {
  if (post.post_content?.media_urls) {
    return post.post_content.media_urls;
  }

  // Fallback to old schema
  if (post.media_urls && Array.isArray(post.media_urls)) {
    return post.media_urls;
  }

  // Fallback to root s3_url
  if (post.s3_url) {
    return [{
      type: 'image',
      s3_url: post.s3_url,
      thumbnail_url: null,
      original_url: null
    }];
  }

  return [];
}

/**
 * Get first media URL for preview (supports both old and new schema)
 */
export function getFirstMediaUrl(post) {
  const mediaUrls = getMediaUrls(post);

  if (mediaUrls.length > 0) {
    const first = mediaUrls[0];
    return first.thumbnail_url || first.s3_url || first.thumbnail_s3_url || null;
  }

  return null;
}

/**
 * Get likes count (supports both old and new schema)
 */
export function getLikes(post) {
  return post.engagement?.likes ||
         post.stats?.like_count ||
         post.stats?.likes ||
         0;
}

/**
 * Get comments count (supports both old and new schema)
 */
export function getComments(post) {
  return post.engagement?.comments ||
         post.stats?.comment_count ||
         post.stats?.comments ||
         post.stats?.replies ||
         0;
}

/**
 * Get shares count (supports both old and new schema)
 */
export function getShares(post) {
  return post.engagement?.shares ||
         post.stats?.shares ||
         0;
}

/**
 * Get retweets count (supports both old and new schema)
 */
export function getRetweets(post) {
  return post.engagement?.retweets ||
         post.stats?.retweets ||
         0;
}

/**
 * Get quotes count (supports both old and new schema)
 */
export function getQuotes(post) {
  return post.engagement?.quotes ||
         post.stats?.quotes ||
         0;
}

/**
 * Get views count (supports both old and new schema)
 */
export function getViews(post) {
  const views = post.engagement?.views ||
                post.stats?.view_count ||
                post.stats?.views;

  return typeof views === 'string' ? parseInt(views) : views;
}

/**
 * Get posted date (supports both old and new schema)
 */
export function getPostedAt(post) {
  if (post.engagement?.posted_at) {
    return new Date(post.engagement.posted_at);
  }

  // Fallback to old schema
  const timestamp = post.taken_at || post.timestamp;

  if (!timestamp) return null;

  if (typeof timestamp === 'number') {
    return new Date(timestamp * 1000);
  }

  if (typeof timestamp === 'string') {
    return new Date(timestamp);
  }

  return null;
}

/**
 * Get posted timestamp in seconds (supports both old and new schema)
 */
export function getPostedTimestamp(post) {
  const date = getPostedAt(post);
  return date ? Math.floor(date.getTime() / 1000) : null;
}

/**
 * Get platform (supports both old and new schema)
 */
export function getPlatform(post) {
  return post.platform || 'instagram';
}

/**
 * Get post ID (supports both old and new schema)
 */
export function getPostId(post) {
  return post.post_id || post.code || post.id || post._id?.toString();
}

/**
 * Get original post URL (supports both old and new schema)
 */
export function getOriginalUrl(post) {
  return post.original_url || null;
}

/**
 * Check if post has been reviewed
 */
export function isReviewed(post) {
  return post.review_details !== null && post.review_details !== undefined;
}

/**
 * Get review details (supports both old and new schema)
 */
export function getReviewDetails(post) {
  return post.review_details || null;
}

/**
 * Get takedown info (supports both old and new schema)
 */
export function getTakedownInfo(post) {
  return post.takedown_info || null;
}

/**
 * Normalize a post from old schema to displayable format
 * This is a temporary helper until all posts are migrated
 */
export function normalizePostForDisplay(post) {
  return {
    _id: post._id.toString(),
    platform: getPlatform(post),
    post_id: getPostId(post),
    original_url: getOriginalUrl(post),
    caption: getCaption(post),
    username: getUsername(post),
    display_name: getDisplayName(post),
    profile_url: getProfileUrl(post),
    is_verified: isVerified(post),
    media_urls: getMediaUrls(post),
    likes: getLikes(post),
    comments: getComments(post),
    shares: getShares(post),
    retweets: getRetweets(post),
    quotes: getQuotes(post),
    views: getViews(post),
    posted_at: getPostedTimestamp(post),
    review_details: getReviewDetails(post),
    takedown_info: getTakedownInfo(post),
    is_new_schema: isNewSchema(post)
  };
}
