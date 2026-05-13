/**
 * Calls Contrails embedding service to backfill text/image embeddings and cluster assignment
 * for a single post. OpenAPI: POST /posts/{post_id}/process?dbName=...
 * @param {string} insertedId - MongoDB ObjectId hex string for the Posts document
 * @param {string} dbName - Tenant database name (mongo_db_map)
 * @returns {{ ok: boolean, warning?: string }}
 */
export async function triggerContrailsPostProcess(insertedId, dbName) {
  const base = process.env.EMBEDDING_SERVICE_API
  if (!base) {
    return {
      ok: false,
      warning: 'EMBEDDING_SERVICE_API is not configured; skipped embeddings and cluster assignment.',
    }
  }

  const root = base.replace(/\/$/, '')
  const url = `${root}/posts/${encodeURIComponent(insertedId)}/process?dbName=${encodeURIComponent(dbName)}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(120_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        warning: `Embedding service returned ${res.status}: ${text.slice(0, 240)}`,
      }
    }

    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, warning: message }
  }
}
