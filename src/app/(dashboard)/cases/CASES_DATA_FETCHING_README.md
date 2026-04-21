# Cases Data Fetching Documentation

This document explains the data fetching mechanisms and architecture for the `/cases` route in the dashboard. The data fetching is primarily handled by server actions in `actions.js`, which securely interact directly with MongoDB.

## Overview

The Cases page features a rich table of content (posts) fetched from the `Posts` collection in MongoDB. Since the amount of data can be huge, we rely heavily on MongoDB Aggregation Pipelines to filter, sort, limit, and augment data efficiently before sending it to the client.

All posts are passed through a normalizer (`normalized_S3_post`) which structures the diverse fields into a consistent schema for the React components and generates short-lived presigned URLs for S3 images.

## Key Server Actions

### `getPosts`
The primary function for fetching cases.
- **Pagination:** Uses `$skip` and `$limit`.
- **Filtering:** Supports filtering by platform, status, risk severity, visibility, specific violations, publish date (`original_date`), alert date (`processed_date`), and whether the post is a representative of a cluster (`unique_clusters`).
- **Sorting:** Complex sorting is handled via an `$addFields` stage (`sort_original_date`, `sort_processed_after`) using `$toDate` to normalize timestamps, followed by a `$sort` stage.

### `getAllPostIds`
Used primarily for bulk actions (like Select All Filtered or Export).
- Mirrors the aggregation pipeline of `getPosts` but strips out pagination and only projects the `_id` field.

### `getSimilarPosts`
Finds cases visually or semantically similar to a specific source post.
- Uses MongoDB Atlas Vector Search (`$vectorSearch`).
- The vector search stage *must* be the first stage in the pipeline. 
- Filters and sorting are applied via subsequent `$match` and `$sort` stages.

### `getSemanticSearchPosts`
Processes natural language queries to find relevant cases.
- First calls an external embedding service (`process.env.EMBEDDING_SERVICE_API`) to vectorize the text query.
- Uses `$vectorSearch` with the resulting embedding against the `text_embedding` field in the `Posts` collection.
- Falls back to or includes Atlas Text Search (`$search`) on specific text paths (like `content`, `profile.display_name`) with fuzzy matching.

### `getPostById`
Fetches a single post using its ObjectId, normalizes it, and returns it. Used for deep-linking into specific cases.

### `getIdenticalPosts`
Used to fetch exact identical posts that belong to the same cluster.
- Given a `cluster_id`, it looks up the document in the `unique_clusters` collection.
- Retrieves the array of `member_ids` and fetches all those related posts (excluding the current one).

## The Pipeline Architecture

Most functions use an aggregation pipeline approach:

1. **`$match`**: Filters via standard query operators.
2. **`$lookup` & `$match` (Unique Clusters)**: If the `unique_clusters` filter is active, it joins the `unique_clusters` collection to ensure the post's `_id` matches the `representative_post_id`.
3. **`$addFields`**: Normalizes fields, specifically dates (e.g., `$toDate: { $ifNull: [...] }`), so that subsequent filtering/sorting works flawlessly regardless of data inconsistencies.
4. **`$match` (Dates)**: Filters posts by the normalized date fields.
5. **`$sort`**: Applies sorting logic.
6. **`$skip` / `$limit`**: Pagination.
7. **`$project`**: Strips heavy fields like `text_embedding` and `image_embedding` to reduce bandwidth.

## `normalized_S3_post` Helper
A crucial utility that standardizes every raw MongoDB document before it hits the frontend. It maps values to:
- `created_at`, `posted_date`, `sourcing_date`
- `platform`, `client_status`
- `user` (profile details)
- `stats` (likes, comments, views, shares)
- Checks arrays of `media_urls` or `s3_url` to generate secure, time-limited presigned S3 URLs via `getSignedImageUrl`.

## Best Practices & Gotchas

- **Date Filtering:** Social media platforms output dates in wildly varying formats (strings, timestamps, ISO). Always use the `$toDate` aggregation operator (as seen in `$addFields`) to standardize dates before performing `$gte` or `$lte` queries.
- **Vector Search Constraints:** In `getSimilarPosts` and `getSemanticSearchPosts`, the `$vectorSearch` stage must be the first stage in the pipeline. Heavy pre-filtering isn't natively supported inside the vector stage unless indexed, so we fetch extra `numCandidates` and apply `$match` right after.
- **Performance:** For counts (`totalCount`), we don't paginate. We duplicate the pipeline without `$skip`/`$limit` and use `$count: "total"`. If there are no complex pipeline conditions like dates, we fallback to a faster `collection.countDocuments(query)`.