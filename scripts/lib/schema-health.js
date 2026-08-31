/**
 * Shared helpers for schema v3 audit and shell cleanup scripts.
 */

const { ObjectId } = require('mongodb')
const { POSTS, LEGACY_POSTS, LEGACY_PROFILES, PROFILES } = require('./collection-names')

const SHELL_FILTER = {
  platform: { $exists: false },
  post_id: { $exists: true },
}

const REAL_POST_PLATFORM_FILTER = {
  platform: { $exists: true, $nin: [null, ''] },
}

function toObjectId(value) {
  if (value == null) return null
  if (value instanceof ObjectId) return value
  if (typeof value === 'object' && value.$oid) {
    try {
      return new ObjectId(value.$oid)
    } catch {
      return null
    }
  }
  if (typeof value === 'string' && ObjectId.isValid(value)) {
    try {
      return new ObjectId(value)
    } catch {
      return null
    }
  }
  return null
}

async function collectionExists(db, name) {
  const cols = await db.listCollections({ name }).toArray()
  return cols.length > 0
}

/**
 * Canonical posts collection for the UI (`Posts`). Falls back to lowercase `posts`
 * only when auditing a tenant that has not been cut over yet.
 */
async function resolvePostsCollection(db) {
  if (await collectionExists(db, POSTS)) {
    return { name: POSTS, collection: db.collection(POSTS) }
  }
  if (await collectionExists(db, LEGACY_POSTS)) {
    return { name: LEGACY_POSTS, collection: db.collection(LEGACY_POSTS) }
  }
  return null
}

async function resolvePostsSource(db) {
  if (await collectionExists(db, POSTS)) {
    return { name: POSTS, collection: db.collection(POSTS) }
  }
  if (await collectionExists(db, LEGACY_POSTS)) {
    return { name: LEGACY_POSTS, collection: db.collection(LEGACY_POSTS) }
  }
  return null
}

async function listCollectionNames(db) {
  const cols = await db.listCollections().toArray()
  return cols.map((c) => c.name).sort()
}

function isTenantDatabaseName(name) {
  if (!name || name.startsWith('admin') || name.startsWith('local')) return false
  if (name === 'config') return false
  return /Data/i.test(name) || /-Search$/i.test(name)
}

async function listTenantDatabases(client, { pattern } = {}) {
  const { databases } = await client.db().admin().listDatabases()
  let names = databases.map((d) => d.name).filter(isTenantDatabaseName)
  if (pattern) {
    const re = new RegExp(pattern, 'i')
    names = names.filter((n) => re.test(n))
  }
  return names.sort()
}

function v1FlatFilter() {
  return {
    ...REAL_POST_PLATFORM_FILTER,
    $or: [{ schema_version: { $exists: false } }, { schema_version: { $ne: 3 } }],
  }
}

function partialV3Filter() {
  return {
    schema_version: 3,
    ...REAL_POST_PLATFORM_FILTER,
    $or: [
      { list: { $exists: false } },
      { workflow: { $exists: false } },
      { 'list.sourced_at': { $exists: false } },
      { 'list.posted_at': { $exists: false } },
    ],
  }
}

function inlineEmbeddingsFilter() {
  return {
    $or: [{ text_embedding: { $exists: true } }, { image_embedding: { $exists: true } }],
  }
}

async function countOrphansEmbeddings(db, postsCollectionName) {
  const embCol = db.collection('post_embeddings')
  const embCount = await embCol.countDocuments({})
  if (embCount === 0) return 0

  const result = await embCol
    .aggregate([
      {
        $lookup: {
          from: postsCollectionName,
          localField: 'post_id',
          foreignField: '_id',
          as: 'post',
        },
      },
      { $match: { post: { $size: 0 } } },
      { $count: 'n' },
    ])
    .toArray()

  return result[0]?.n ?? 0
}

async function countShellsWithRealTarget(db, postsCollectionName) {
  const postsCol = db.collection(postsCollectionName)
  const shells = await postsCol
    .find(SHELL_FILTER, { projection: { _id: 1, post_id: 1 } })
    .toArray()

  let count = 0
  for (const shell of shells) {
    const real = await findRealPost(postsCol, shell)
    if (real && real._id.toString() !== shell._id.toString()) count++
  }
  return count
}

async function findRealPost(postsCol, shell) {
  const postId = shell.post_id
  const oid = toObjectId(postId)
  if (oid) {
    const byId = await postsCol.findOne({
      _id: oid,
      ...REAL_POST_PLATFORM_FILTER,
    })
    if (byId) return byId
  }

  const asString = String(postId)
  return postsCol.findOne({
    ...REAL_POST_PLATFORM_FILTER,
    $or: [{ platform_post_id: asString }, { post_id: asString }],
  })
}

function hasEmbeddingVectors(doc) {
  const text = doc.text_embedding || doc.embeddings?.text
  const image = doc.image_embedding || doc.embeddings?.image
  const hasText = Array.isArray(text) && text.length > 0
  const hasImage = Array.isArray(image) && image.length > 0
  return hasText || hasImage
}

async function auditDatabase(db) {
  const collections = await listCollectionNames(db)
  const postsResolved = await resolvePostsCollection(db)
  const postsName = postsResolved?.name ?? null
  const postsCol = postsResolved?.collection ?? null

  const hasPosts = collections.includes(POSTS)
  const hasPostsLower = collections.includes(LEGACY_POSTS)
  const hasProfilesLegacy = collections.includes(LEGACY_PROFILES)
  const hasProfilesLower = collections.includes(PROFILES)
  const hasPostEmbeddings = collections.includes('post_embeddings')

  let metrics = {
    db: db.databaseName,
    collections,
    posts_collection: postsName,
    on_canonical_posts: hasPosts,
    dual_posts_collections: hasPosts && hasPostsLower,
    lowercase_only: !hasPosts && hasPostsLower,
    total_posts: 0,
    v1_flat: 0,
    partial_v3: 0,
    v3_complete: 0,
    shells: 0,
    shells_with_real_target: 0,
    inline_embeddings: 0,
    post_embeddings: 0,
    orphan_embeddings: 0,
    profiles_legacy: 0,
    profiles_v3: 0,
    needs_migration: false,
  }

  if (!postsCol) {
    metrics.needs_migration = false
    return metrics
  }

  metrics.total_posts = await postsCol.countDocuments({})
  metrics.v1_flat = await postsCol.countDocuments(v1FlatFilter())
  metrics.partial_v3 = await postsCol.countDocuments(partialV3Filter())
  metrics.shells = await postsCol.countDocuments(SHELL_FILTER)
  metrics.inline_embeddings = await postsCol.countDocuments(inlineEmbeddingsFilter())
  metrics.v3_complete = await postsCol.countDocuments({
    schema_version: 3,
    list: { $exists: true },
    workflow: { $exists: true },
    ...REAL_POST_PLATFORM_FILTER,
  })

  if (metrics.shells > 0) {
    metrics.shells_with_real_target = await countShellsWithRealTarget(db, postsName)
  }

  if (hasPostEmbeddings) {
    metrics.post_embeddings = await db.collection('post_embeddings').countDocuments({})
    metrics.orphan_embeddings = await countOrphansEmbeddings(db, postsName)
  }

  if (hasProfilesLegacy) {
    metrics.profiles_legacy = await db.collection(LEGACY_PROFILES).countDocuments({})
  }
  if (hasProfilesLower) {
    metrics.profiles_v3 = await db.collection(PROFILES).countDocuments({})
  }

  metrics.needs_migration =
    metrics.v1_flat > 0 ||
    metrics.partial_v3 > 0 ||
    metrics.shells > 0 ||
    metrics.inline_embeddings > 0 ||
    metrics.dual_posts_collections ||
    metrics.lowercase_only ||
    (metrics.profiles_legacy > 0 && metrics.profiles_v3 === 0)

  return metrics
}

function parseDbArgs(argv) {
  const args = {
    dbs: [],
    allTenantDbs: false,
    pattern: null,
    dryRun: true,
    apply: false,
    jsonOut: null,
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--db' && argv[i + 1]) {
      args.dbs.push(argv[++i])
    } else if (a === '--dbs' && argv[i + 1]) {
      args.dbs.push(
        ...argv[++i]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    } else if (a === '--all-tenant-dbs') {
      args.allTenantDbs = true
    } else if (a === '--pattern' && argv[i + 1]) {
      args.pattern = argv[++i]
    } else if (a === '--dry-run') {
      args.dryRun = true
      args.apply = false
    } else if (a === '--apply') {
      args.apply = true
      args.dryRun = false
    } else if (a === '--json-out' && argv[i + 1]) {
      args.jsonOut = argv[++i]
    }
  }

  args.dbs = [...new Set(args.dbs)]
  return args
}

module.exports = {
  POSTS,
  LEGACY_POSTS,
  SHELL_FILTER,
  REAL_POST_PLATFORM_FILTER,
  toObjectId,
  collectionExists,
  resolvePostsCollection,
  resolvePostsSource,
  listCollectionNames,
  isTenantDatabaseName,
  listTenantDatabases,
  v1FlatFilter,
  partialV3Filter,
  inlineEmbeddingsFilter,
  countOrphansEmbeddings,
  countShellsWithRealTarget,
  findRealPost,
  hasEmbeddingVectors,
  auditDatabase,
  parseDbArgs,
}
