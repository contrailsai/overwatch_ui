# Feeds Feature — Implementation Review (Phase 1)

**Status:** Reviewer-side **Manage Feeds** is implemented. Client-facing **Feeds** viewer is not started yet.

**Last updated:** June 2026

---

## 1. Goal

Feeds let reviewers curate themed collections of content for clients. A feed combines:

- **Topics** — pre-grouped sets of related posts (MongoDB `Topics` collection)
- **Individual posts** — hand-picked cases added via search, outside of any topic

Clients will eventually browse each feed like the cases list (filters, reports, publishing-date chart). **Phase 1** delivers only the reviewer tooling to create and edit feeds.

---

## 2. Product decisions (locked in during planning)

| Decision | Choice |
|----------|--------|
| Topic sync | **Live** — feed reflects current topic membership; no frozen snapshot of post IDs on the feed document |
| Post eligibility | **Reviewed only** — same gate as `/cases` (`review_details.threat_score` must exist) |
| Topic inclusion | **Whole topic** — adding a topic includes all its posts (filtered to reviewed at read time) |
| Visibility | **All users in project** — no per-user feed assignment or draft/publish toggle yet |
| Reviewer page | **Manage Feeds** at `/manage-feeds` |
| Client page (future) | **Feeds** at `/feeds` (not built) |

---

## 3. What is implemented

### 3.1 MongoDB — `Feeds` collection

New per-project collection (tenant DB from `project.mongo_db_map`). Auto-created on first `insertOne`; no migration script.

**Sample document:** [`sample_documents/mongodb/Feed.json`](../../sample_documents/mongodb/Feed.json)

```json
{
  "_id": { "$oid": "..." },
  "title": "anant_ambani_gossip",
  "description": "gossip about information on anant ambani and his personal life",
  "topic_ids": ["T00022", "T00051", "T00033"],
  "manual_post_ids": [],
  "cover_image_url": null,
  "created_by": "reviewer@contrails.ai",
  "created_at": { "$date": "..." },
  "updated_at": { "$date": "..." },
  "update_history": [
    { "updated_at": { "$date": "..." }, "updated_by": "...", "changes_summary": "feed created" }
  ]
}
```

**Design note:** The feed stores **references only** (`topic_ids`, `manual_post_ids`). It does **not** denormalize post documents. At read time (future client page), posts are resolved in two bounded queries:

1. `Topics.find({ topic_id: { $in: feed.topic_ids } })` → union `posts[]`
2. `Posts.aggregate` with `_id: { $in: unionedIds }` + reviewed filter + cases-list pipeline

This keeps feeds live when topics gain new posts.

### 3.2 Topics collection (existing, now consumed)

**Sample:** [`sample_documents/mongodb/topics.json`](../../sample_documents/mongodb/topics.json)

Topics were introduced outside this app; Manage Feeds is the first UI that reads them.

| Field | Purpose |
|-------|---------|
| `topic_id` | Stable string ID referenced by feeds (e.g. `T00002`) |
| `title` | Human-readable label for search/display |
| `posts` | Array of `Posts._id` hex strings |
| `post_count` | Denormalized count |
| `first_posted_at` / `last_posted_at` | Date bounds for the topic’s posts |

Collection name in code: `Topics` (see `TOPICS_COLLECTION` in feed-schema).

### 3.3 Schema & helpers

**File:** [`src/lib/feeds/feed-schema.js`](../../src/lib/feeds/feed-schema.js)

| Export | Role |
|--------|------|
| `FEEDS_COLLECTION` | `'Feeds'` |
| `TOPICS_COLLECTION` | `'Topics'` |
| `serializeFeed(doc)` | Plain object for UI (counts, ISO dates) |
| `serializeTopicOption(doc)` | Lightweight topic for picker lists |
| `sanitizeStringArray(arr)` | Dedupe/trim `topic_ids` / `manual_post_ids` |
| `escapeRegex(value)` | Safe regex for topic title search |

### 3.4 Server actions (reviewer-only)

**File:** [`src/app/(dashboard)/manage-feeds/actions.js`](../../src/app/(dashboard)/manage-feeds/actions.js)

All actions call `requireRole(['reviewer'])` and use the tenant `dbName` from auth context.

| Action | Description |
|--------|-------------|
| `listFeeds()` | All feeds for project, sorted by `updated_at` desc |
| `getFeed(feedId)` | Feed + hydrated topics + normalized manual posts (for editor) |
| `createFeed(input)` | Insert feed; requires `title` |
| `updateFeed(feedId, input)` | Update fields; appends `update_history` entry |
| `deleteFeed(feedId)` | Hard delete |
| `searchTopics(query, limit)` | Title regex search; empty query returns recent topics |
| `searchPostsForFeed(query, limit)` | Hybrid Atlas text + semantic vector search via `getSemanticSearchPosts` (reviewed-only) |

Mutations call `revalidatePath('/manage-feeds')`.

**Post search reuse:** `searchPostsForFeed` delegates to [`getSemanticSearchPosts`](../../src/app/(dashboard)/cases/actions.js) — same hybrid search as the content list (Atlas `$search` on index `default` + `$vectorSearch` on `text_embedding`). Limit defaults to 15, max 40.

**Manual post hydration:** `getFeed` uses [`getPostsByIds`](../../src/app/(dashboard)/cases/actions.js) for `manual_post_ids` (S3 signing + normalization).

### 3.5 Pages & UI

| File | Role |
|------|------|
| [`page.js`](../../src/app/(dashboard)/manage-feeds/page.js) | Server Component: auth, reviewer guard, loads `listFeeds()` |
| [`ManageFeedsClient.js`](../../src/app/(dashboard)/manage-feeds/ManageFeedsClient.js) | Feed index: cards, New Feed, edit/delete, opens builder |
| [`FeedBuilder.js`](../../src/app/(dashboard)/manage-feeds/FeedBuilder.js) | Right-side slide-over panel for create/edit |

#### Route: `/manage-feeds`

- **Access:** Reviewer only (`permission === 'reviewer'`)
- Non-reviewers see a fake **404** (same pattern as `/review-cases`)
- Users without a project see the standard “Account Not Set Up” block

#### Index UI (`ManageFeedsClient`)

- Grid of feed cards: title, description, topic count, manual post count, last updated
- Hover actions: edit (pencil), delete (with confirm)
- Empty state with CTA to create first feed
- **New Feed** button opens the builder with no preloaded feed

#### Feed builder (`FeedBuilder`) — right slide-over panel

Replaced an initial centered modal with a full-height **right-side panel** (`max-w-5xl`) for easier browsing.

**Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│ [×] Edit feed                          [Cancel] [Save]       │
├─────────────────┬────────────────────────────────────────────┤
│ Title           │  [ Topics ] [ Posts ]  tabs                  │
│ Description     │  Search…                                   │
│ In this feed    │  ┌──────────────────────────────────────┐  │
│ Selected topics │  │ scrollable results (tall)            │  │
│ Added posts     │  └──────────────────────────────────────┘  │
└─────────────────┴────────────────────────────────────────────┘
```

- **Left column:** metadata + live summary of selected topics/posts
- **Right column:** tabbed search (Topics | Posts)
- Topics: debounced title search; empty query browses recent topics
- Posts: debounced hybrid search; larger thumbnails and multi-line captions
- Body scroll locked while panel is open; backdrop click closes

### 3.6 Navigation

**File:** [`src/components/Sidebar.js`](../../src/components/Sidebar.js)

```js
{ name: 'Manage Feeds', href: '/manage-feeds', icon: Rss, show: clientDetails?.permission === 'reviewer' }
```

Placed after “Review Profiles”. No client “Feeds” nav item yet.

### 3.7 Shared pipeline helpers (refactor)

**File:** [`src/lib/posts/pipeline-helpers.js`](../../src/lib/posts/pipeline-helpers.js)

Pure module (**no** `'use server'`) extracted from `cases/actions.js` to avoid Next.js registering query builders as Server Action HTTP endpoints.

Exported for reuse by the future client feeds page:

- `normalizeS3Post`
- `buildCasesMatchQuery`
- `buildCasesDateAddFieldsStage` / `buildCasesDateFilterStage`
- `buildUniqueClustersStage`
- `ONLINE_VISIBILITY_VALUES`, `CASES_ALERT_HOUR_TIMEZONE`, `escapeRegex`

[`cases/actions.js`](../../src/app/(dashboard)/cases/actions.js) now imports these instead of defining them inline.

---

## 4. Architecture diagram (current + planned read path)

```mermaid
flowchart TD
  subgraph implemented [Implemented — Phase 1]
    Reviewer["Reviewer @ /manage-feeds"]
    FeedDoc["Feeds collection"]
    Topics["Topics collection"]
    Reviewer -->|CRUD| FeedDoc
    Reviewer -->|searchTopics| Topics
    Reviewer -->|searchPostsForFeed| PostsSearch["getSemanticSearchPosts"]
    PostsSearch --> Posts["Posts collection"]
  end

  subgraph planned [Planned — Phase 2]
    Client["Client @ /feeds/feedId"]
  end

  FeedDoc -->|topic_ids| Topics
  Topics -->|posts[]| Resolve["resolveFeedPostIds"]
  FeedDoc -->|manual_post_ids| Resolve
  Resolve --> ListQ["getFeedPosts + pipeline-helpers"]
  ListQ --> Posts
  Client --> ListQ
  Client --> Histogram["PublishingHistogram"]
```

---

## 5. Auth & security model

| Layer | Mechanism |
|-------|-----------|
| Middleware | Auth only (redirect to `/login`) — no role checks |
| Page | `clientDetails.permission !== 'reviewer'` → fake 404 |
| Server actions | `requireRole(['reviewer'])` on every mutation/query |
| Sidebar | Link hidden for non-reviewers |
| Tenancy | All Mongo access scoped to `dbName` from `mongo_db_map` |

**Note:** Admin UI can assign `client-reviewer` permission, but runtime checks use `'reviewer'`. Test accounts created via Admin should use the `reviewer` permission value.

---

## 6. Bugs fixed during implementation

| Issue | Fix |
|-------|-----|
| `Icon={Rss}` passed from Server Component to `PageHeader` (client) | Removed `Icon` prop from `page.js`; Lucide components cannot cross RSC boundary |
| Pipeline helpers in `'use server'` file | Extracted to `src/lib/posts/pipeline-helpers.js` |
| Cramped modal for feed editing | Replaced with right slide-over panel + two-column layout |

---

## 7. Not implemented yet (Phase 2+)

From the original plan — **intentionally deferred**:

| Item | Notes |
|------|-------|
| Client `/feeds` index | List feeds for all project users |
| Client `/feeds/[feedId]` | Cases-style list for one feed |
| `feeds/actions.js` | `listFeedsForClient`, `getFeedPosts`, `getFeedPublishingHistogram` |
| Live post resolution at scale | `resolveFeedPostIds` + faceted `Posts` query with `_id $in` |
| Publishing-date histogram | Recharts horizontal bar chart grouped by `engagement.posted_at` |
| Filters on feed view | Reuse `CasesFilterPanel` / URL param pattern |
| Report export from feed | Reuse `ReportGenerate` with selected feed posts |
| `CaseDetailPanel` on feed rows | Deep-link / side panel for a case in feed context |
| Image/similar-post search in builder | Only text/semantic search today; `getSimilarPosts` available for later |
| `cover_image_url` UI | Field exists on schema; no picker yet |
| Draft/publish toggle | All feeds visible to entire project when client page ships |
| MongoDB indexes | Recommend `Topics.topic_id` index before client page load |

---

## 8. File inventory

```
src/
├── lib/
│   ├── feeds/
│   │   └── feed-schema.js          # Collection constants + serializers
│   └── posts/
│       └── pipeline-helpers.js     # Shared cases/feed query helpers (new)
├── app/(dashboard)/
│   ├── cases/
│   │   └── actions.js              # Refactored to use pipeline-helpers
│   └── manage-feeds/
│       ├── page.js                 # RSC page + reviewer guard
│       ├── actions.js              # Server actions
│       ├── ManageFeedsClient.js    # Index UI
│       └── FeedBuilder.js          # Right slide-over create/edit panel
└── components/
    └── Sidebar.js                  # "Manage Feeds" nav item

sample_documents/mongodb/
├── Feed.json                       # Sample feed document
└── topics.json                     # Sample topic document

docs/feeds/
└── manage-feeds-implementation-review.md   # This document
```

---

## 9. Manual test checklist

Use a **reviewer** account on a project with `Topics` and reviewed `Posts` data.

- [ ] Sidebar shows **Manage Feeds**; client/analyst accounts do not
- [ ] Direct URL `/manage-feeds` as non-reviewer returns fake 404
- [ ] Create feed with title + description only
- [ ] Search topics (empty query shows recent; typed query filters by title)
- [ ] Add whole topics; save; card shows correct topic count
- [ ] Search posts by text; add individual posts; save; card shows manual post count
- [ ] Edit existing feed: panel loads hydrated topics + manual posts
- [ ] Remove topic/post in builder; save persists
- [ ] Delete feed with confirm; card removed
- [ ] Verify MongoDB `Feeds` document matches expected shape (`update_history`, `topic_ids`, etc.)

---

## 10. Recommended next steps (Phase 2)

1. **`src/lib/feeds/resolve-feed-posts.js`** — `resolveFeedPostIds(feed)` + `getFeedPosts(feedId, page, filters, sort)` using `pipeline-helpers`
2. **`/feeds` + `/feeds/[feedId]`** — client pages with `requireAuthContext()` only
3. **Reuse cases UI** — filter panel, list table/cards, `CaseDetailPanel`, `ReportGenerate`
4. **`PublishingHistogram`** — Mongo `$group` by publish day on resolved post set
5. **Sidebar** — add **Feeds** link (`show: true`) for all authenticated users
6. **Index** — `Topics.topic_id` if topic resolution is slow at scale

---

## 11. Summary

Phase 1 delivers a complete **reviewer workflow** to define feeds as combinations of live topics and individually searched posts, persisted in MongoDB `Feeds`, with a polished management UI at `/manage-feeds`. The data model and shared pipeline helpers are positioned for Phase 2 client viewing without denormalizing posts or sacrificing live topic sync.

The client-facing feed experience — list, filters, reports, and analytics — remains the next implementation slice.
