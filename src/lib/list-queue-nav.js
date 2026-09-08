/**
 * Paged list + detail queue navigation.
 * Keep the current URL page when opening a row; prev/next can turn the page
 * at the edges. Client decisions stay on the row until the user moves on.
 */

export function normalizeQueueDir(dir) {
  if (dir === 'next' || dir === 1 || dir === '1') return 1
  if (dir === 'prev' || dir === -1 || dir === '-1') return -1
  const n = Number(dir)
  return n > 0 ? 1 : n < 0 ? -1 : 0
}

export function idsEqual(a, b) {
  return a != null && b != null && String(a) === String(b)
}

export function queueHasPrev({ selectedIndex, page }) {
  return selectedIndex > 0 || (selectedIndex >= 0 && page > 1)
}

export function queueHasNext({ selectedIndex, listLength, page, totalPages }) {
  if (selectedIndex < 0) return false
  return selectedIndex < listLength - 1 || page < totalPages
}

export function pickQueueEdge(list, edge) {
  if (!Array.isArray(list) || list.length === 0) return null
  return edge === 'last' ? list[list.length - 1] : list[0]
}

/** UI client_status vs list status filter (Cases / Domains / Ads). */
export function clientStatusMatchesFilter(status, filter) {
  if (!filter || filter === 'all') return true
  const s = status || 'To Be Reviewed'
  if (filter === 'To Be Reviewed') return s === 'To Be Reviewed'
  if (filter === 'No Action') return s === 'No Action' || s === 'Pass'
  return s === filter
}

/**
 * @returns {{ list: any[], type: 'item'|'page'|'close'|'none', item?: any, page?: number, edge?: 'first'|'last' }}
 */
export function planQueueMove({
  list,
  selectedId,
  dir,
  page,
  totalPages,
  dropCurrent = false,
}) {
  const step = normalizeQueueDir(dir)
  const rows = Array.isArray(list) ? list : []
  const idx = rows.findIndex((row) => idsEqual(row?._id, selectedId))

  if (!step || idx < 0) {
    return { list: rows, type: 'none' }
  }

  if (dropCurrent) {
    const working = rows.filter((_, i) => i !== idx)
    const neighbor = step > 0 ? working[idx] : working[idx - 1]
    if (neighbor) return { list: working, type: 'item', item: neighbor, replaced: true }
    if (step > 0 && page < totalPages) {
      return { list: working, type: 'page', page: page + 1, edge: 'first', replaced: true }
    }
    if (step < 0 && page > 1) {
      return { list: working, type: 'page', page: page - 1, edge: 'last', replaced: true }
    }
    if (working.length > 0) {
      return {
        list: working,
        type: 'item',
        item: step > 0 ? working[working.length - 1] : working[0],
        replaced: true,
      }
    }
    return { list: working, type: 'close', replaced: true }
  }

  const neighbor = rows[idx + step]
  if (neighbor) return { list: rows, type: 'item', item: neighbor }
  if (step > 0 && page < totalPages) {
    return { list: rows, type: 'page', page: page + 1, edge: 'first' }
  }
  if (step < 0 && page > 1) {
    return { list: rows, type: 'page', page: page - 1, edge: 'last' }
  }
  return { list: rows, type: 'none' }
}

export function scrollQueueItemIntoView(id) {
  if (id == null || typeof document === 'undefined') return
  const raw = String(id)
  const safe = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(raw) : raw.replace(/"/g, '\\"')
  const el = document.querySelector(`[data-queue-id="${safe}"]`)
  el?.scrollIntoView({ block: 'nearest' })
}
