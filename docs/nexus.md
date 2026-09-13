# Nexus graphs

**Status:** Live on Feeds, Posts, and Ads.  
**Last updated:** September 2026

Nexus is the shared force-layout used to browse reviewed content as hubs → clusters → leaves. Topology is loaded first (L1). Leaf stubs (L2) are fetched when a family is expanded. Bodies, media, and signed URLs are not on the graph payload — detail panels load those separately.

## Surfaces

| Route | Section gate | Default mode | What you see |
|-------|--------------|--------------|--------------|
| `/feeds` | `feeds` | POI → topics | Topic map. Collections stay at `/feeds/collections`. |
| `/posts/nexus` | `posts` | Parent topics | Parent topic, POI category, or profile hubs, then posts. |
| `/ads/nexus` | `ads` | Ad profiles | Ad-profile or domain hubs, then reviewed ads. |

Sidebar entries: **Posts Nexus** and **Ads Nexus**. The feeds topic map is the **Feeds** item (tab: Topic map).

A fourth preset, `feed-mixed`, is built for a single feed (`getFeedMixedNexusGraph`). It unions that feed’s resolved posts with `manual_ad_ids`. The manage-feeds builder can store ad ids; the mixed graph is available from server actions, not a dedicated nav item yet.

## Topology

Every graph uses the same contract (`src/lib/nexus/schema.js`):

- **hub** — parent (POI, parent topic, profile, ad profile, domain, category)
- **cluster** — grouping under a hub (topic, POI, profile)
- **leaf** — one reviewed post or ad (loaded in L2, capped per parent)

Leaves are typed (`leafKind: 'post' | 'ad'`). Color is violation-based (`colorAxis: 'violation'`). Family color is assigned by hub order from `FAMILY_PALETTE`.

The canvas engine is `mountNexus` in `src/lib/nexus/engine.js`, mounted by `NexusGraphShell`. The old D3 feeds engine (`src/lib/feeds/poi-topics-graph-engine.js`) is deprecated and must not be mounted on new pages.

## Presets and queries

Server actions live in `src/app/(dashboard)/nexus/actions.js`. Query builders live in `src/lib/nexus/queries.js` and project topology fields only — never `content.*`.

| Preset | L1 action | Parents | Leaves |
|--------|-----------|---------|--------|
| `feeds-poi-topics` | `getFeedsNexusGraph` | Parent POIs → topics (`buildPoiTopicsGraph` → `fromPoiTopicsGraph`) | Posts for topic ids |
| `posts-parent-topics` | `getPostsNexusGraph('parent_topic')` | Parent topics → child topics | Posts for topic ids |
| `posts-poi-categories` | `getPostsNexusGraph('poi')` | `pois.category` hub → POI cluster | Reviewed posts matching POI labels |
| `posts-profiles` | `getPostsNexusGraph('profile')` | Up to 200 client-visible profiles | Posts for those profiles |
| `ads-ad-profiles` | `getAdsNexusGraph('ad_profile')` | Client-visible ad profiles | Reviewed ads |
| `ads-domains` | `getAdsNexusGraph('domain')` | Reviewed domains linked from reviewed ads (top 200 by ad count) | Reviewed ads |
| `feed-mixed` | `getFeedMixedNexusGraph(feedId)` | That feed | Posts from topics + `manual_post_ids`, ads from `manual_ad_ids` |

L2: `getNexusLeafStubs({ preset, parentIds, cap })`. Cap default is `DEFAULT_LEAF_CAP_PER_PARENT`.

Opening a cluster loads a page of full documents via `getNexusClusterPosts` or `getNexusClusterAds` (signed media, same cards as the list surfaces).

## Who is included

Nexus follows the same client-visible gates as the list pages.

| Entity | Filter |
|--------|--------|
| Post leaves | `workflow.review_status: 'reviewed'` (`REVIEWED_THREAT_SCORE_FILTER` / reviewed match in `queries.js`) |
| Ad leaves | `REVIEWED_ADS_FILTER` |
| Domain hubs | `REVIEWED_DOMAINS_FILTER` |
| Profile hubs | `CLIENT_VISIBLE_PROFILE_FILTER` — reviewed, or `list.reviewed_post_count > 0`, or `review_details.reviewed_at` |
| Ad-profile hubs | `CLIENT_VISIBLE_AD_PROFILE_FILTER` — same shape, with `list.reviewed_ad_count` |
| POI hubs | `parentPoiFilter()` only. Alias/handle rows are not hubs. |

Posts Nexus POI mode groups parent POIs by `pois.category` (`src/lib/nexus/poi-categories.js`). Slugs `political_party` and `celebrity` still map onto the politician and other hubs so older documents cluster. Counts in that mode come from reviewed mention labels, not the stored `post_count` alone.

## Code map

```
src/lib/nexus/
  schema.js            # contract, fromPoiTopicsGraph
  queries.js           # L1/L2 builders (server-only)
  engine.js            # canvas layout
  colors.js            # violation palette
  poi-categories.js    # POI category hubs
src/components/nexus/  # NexusGraphShell + CSS
src/app/(dashboard)/nexus/actions.js
src/app/(dashboard)/posts/nexus/
src/app/(dashboard)/ads/nexus/
src/app/(dashboard)/feeds/FeedsNexusClient.js
```
