# MongoDB Posts Schema Migration Guide

This migration script standardizes all posts (Instagram, Facebook, X) into a unified, consistent schema.

## Features

✅ Batch processing (100 posts at a time)
✅ Dry-run mode to preview changes
✅ Comprehensive error handling and logging
✅ Progress tracking
✅ Zero data loss - all fields preserved
✅ Detailed error reports with original data

## Prerequisites

Ensure your `.env.local` file has:
```env
MONGO_URI=mongodb+srv://...
MONGO_DB_NAME=your-database-name
```

## Usage

### 1. Dry Run (Preview Changes)

**Always run this first to see what will change:**

```bash
node scripts/migrate_posts_schema.js --dry-run
```

This will:
- Show you which posts would be migrated
- Display any transformation errors
- NOT modify any data

### 2. Execute Migration

**After reviewing the dry run, execute the migration:**

```bash
node scripts/migrate_posts_schema.js
```

This will:
- Process posts in batches of 100
- Transform each post to the new schema
- Update MongoDB in real-time
- Show progress and success/failure counts

## New Schema Structure

```javascript
{
  // Platform & Identification
  platform: "instagram" | "facebook" | "x",
  post_id: String,
  original_url: String,

  // Post Content
  post_content: {
    caption: String,
    media_urls: [{
      type: "image" | "video",
      s3_url: String,
      thumbnail_url: String,
      original_url: String
    }],
    post_type: String,
    language: String
  },

  // Profile
  profile: {
    platform_user_id: String,
    username: String,
    display_name: String,
    profile_url: String,
    is_verified: Boolean
  },

  // Engagement
  engagement: {
    likes: Number,
    comments: Number,
    shares: Number,
    retweets: Number,
    quotes: Number,
    replies: Number,
    views: Number,
    posted_at: Date
  },

  // Analysis Results (empty for now)
  analysis_results: {},

  // Review Details (empty after migration)
  review_details: null,

  // Takedown Info
  takedown_info: {
    is_in_takedown: Boolean,
    takedown_status: String,
    client_reference_id: String,
    platform_case_id: String,
    initiated_at: Date,
    completed_at: Date,
    notes: String
  },

  // Supabase References (placeholder)
  supabase_refs: {
    case_id: String,
    alert_ids: [String],
    chat_thread_ids: [String]
  },

  // Source
  result_origin: {
    type: String,
    keyword: String,
    source: String
  },

  // Storage & Processing
  s3_stored: Boolean,
  processed: Boolean,
  processed_at: Date,

  // Metadata
  metadata: {
    created_at: Date,
    updated_at: Date,
    sourcing_date: Date,
    update_history: [{
      updated_at: Date,
      updated_by: String,
      changes_summary: String
    }],
    schema_version: Number
  }
}
```

## What Gets Migrated

### Instagram Posts
- ✅ Caption → `post_content.caption`
- ✅ User info → `profile.*`
- ✅ Stats → `engagement.*`
- ✅ Media URLs → `post_content.media_urls`
- ✅ Timestamp → `engagement.posted_at`

### Facebook Posts
- ✅ Content → `post_content.caption`
- ✅ Author info → `profile.*`
- ✅ Stats → `engagement.*`
- ✅ Media URLs → `post_content.media_urls`
- ✅ Timestamp → `engagement.posted_at`

### X (Twitter) Posts
- ✅ Content → `post_content.caption`
- ✅ Author info → `profile.*`
- ✅ Stats (likes, retweets, quotes) → `engagement.*`
- ✅ Media URLs → `post_content.media_urls`
- ✅ Timestamp (string format) → `engagement.posted_at` (converted)

## Important Notes

1. **Review data is NOT preserved** - All existing review_details and takedown_info will be reset (as requested, since they were test data)

2. **Analysis results are empty** - The `analysis_results` object is initialized as empty, ready for future AI analysis

3. **Supabase IDs are placeholders** - The `supabase_refs.case_id` will be null initially

4. **Processing status is reset** - All posts will have `processed: false` after migration

5. **Schema version** - All migrated posts will have `metadata.schema_version: 1`

## Monitoring Progress

The script will show:
- Current batch being processed
- Success/failure count per batch
- Overall progress percentage
- Platform of each post being migrated

## Error Handling

If errors occur:
- The script continues processing other posts
- Failed posts are logged with full details
- Original data is printed to console for debugging
- At the end, you'll see a summary of all errors

## After Migration

Once migration is complete, you should:

1. **Verify data** - Check a few posts in MongoDB to ensure proper transformation
2. **Update application code** - Modify `getUnreviewedPosts` to work with new schema
3. **Test the review interface** - Ensure it works with the new structure
4. **Update dashboard queries** - Adjust any queries using old field names

## Rollback

If you need to rollback:
1. Restore from your MongoDB backup (always backup before running!)
2. Or re-import the original data

## Support

If you encounter issues:
1. Check the error logs printed to console
2. Verify your `.env.local` configuration
3. Ensure MongoDB connection is stable
4. Review the "Old Data" section in error logs to understand what failed
