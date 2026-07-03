/** Post search dork operators for manage-feeds post picker. */

export const PLATFORM_OPTIONS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'x', label: 'X (Twitter)' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'website', label: 'Websites' },
]

export const THREAT_OPTIONS = [
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
  { id: 'safe', label: 'Safe' },
]

export const DORK_OPERATORS = [
  { key: 'platform', aliases: ['platform'], label: 'Platform', hint: 'instagram, x, facebook…' },
  { key: 'threat', aliases: ['threat'], label: 'Threat', hint: 'high, medium, low, safe' },
  { key: 'from', aliases: ['from', 'since'], label: 'From', hint: 'YYYY-MM-DD' },
  { key: 'to', aliases: ['to', 'until'], label: 'To', hint: 'YYYY-MM-DD' },
]

const OPERATOR_PATTERN =
  /\b(platform|threat|from|since|to|until):(\S+)/gi

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function normalizePlatform(value) {
  const v = String(value || '').toLowerCase().trim()
  const match = PLATFORM_OPTIONS.find((p) => p.id === v)
  return match ? match.id : null
}

function normalizeThreat(value) {
  const v = String(value || '').toLowerCase().trim()
  const match = THREAT_OPTIONS.find((t) => t.id === v)
  return match ? match.id : null
}

function dateToStartIso(dateStr) {
  if (!ISO_DATE.test(dateStr)) return null
  return new Date(`${dateStr}T00:00:00.000Z`).toISOString()
}

function dateToEndIso(dateStr) {
  if (!ISO_DATE.test(dateStr)) return null
  return new Date(`${dateStr}T23:59:59.999Z`).toISOString()
}

/**
 * Parse dork operators from a search string.
 * @returns {{ freeText: string, filters: object, tokens: Array<{ raw: string, key: string, value: string }> }}
 */
export function parsePostSearchDork(query = '') {
  const filters = {}
  const tokens = []
  let freeText = query

  const matches = [...query.matchAll(OPERATOR_PATTERN)]
  for (const match of matches) {
    const operator = match[1].toLowerCase()
    const value = match[2]
    const raw = match[0]
    tokens.push({ raw, operator, value })

    if (operator === 'platform') {
      const platform = normalizePlatform(value)
      if (platform) filters.platform = platform
    } else if (operator === 'threat') {
      const threat = normalizeThreat(value)
      if (threat) filters.risk_priority = threat
    } else if (operator === 'from' || operator === 'since') {
      const from = dateToStartIso(value)
      if (from) filters.original_date_from = from
    } else if (operator === 'to' || operator === 'until') {
      const to = dateToEndIso(value)
      if (to) filters.original_date_to = to
    }

    freeText = freeText.replace(raw, ' ')
  }

  freeText = freeText.replace(/\s+/g, ' ').trim()
  return { freeText, filters, tokens }
}

export function hasStructuredPostFilters(filters = {}) {
  return Boolean(
    (filters.platform && filters.platform !== 'all') ||
    (filters.risk_priority && filters.risk_priority !== 'all') ||
    filters.original_date_from ||
    filters.original_date_to
  )
}

/** Remove one dork token from the raw query string. */
export function removeDorkToken(query, tokenRaw) {
  return query.replace(tokenRaw, '').replace(/\s+/g, ' ').trim()
}

/**
 * Detect autocomplete context at cursor position.
 * @returns {{ kind: 'operators'|'platform'|'threat'|'date'|null, prefix: string, partial: string }}
 */
export function getDorkAutocompleteContext(query, cursorPos) {
  const before = query.slice(0, cursorPos)
  const tokenMatch = before.match(/(?:^|\s)(\w+):(\S*)$/)
  if (!tokenMatch) {
    const partialOp = before.match(/(?:^|\s)(\w*)$/)
    if (partialOp && partialOp[1].length > 0) {
      const partial = partialOp[1].toLowerCase()
      const matching = DORK_OPERATORS.flatMap((op) =>
        op.aliases
          .filter((a) => a.startsWith(partial) && a !== partial)
          .map((a) => `${a}:`)
      )
      if (matching.length > 0) {
        return { kind: 'operators', prefix: partial, partial, suggestions: matching }
      }
    }
    return { kind: null, prefix: '', partial: '' }
  }

  const operator = tokenMatch[1].toLowerCase()
  const partial = tokenMatch[2]

  if (operator === 'platform') {
    const suggestions = PLATFORM_OPTIONS.filter(
      (p) => p.id.startsWith(partial.toLowerCase()) || p.label.toLowerCase().includes(partial.toLowerCase())
    )
    return { kind: 'platform', operator, partial, suggestions }
  }

  if (operator === 'threat') {
    const suggestions = THREAT_OPTIONS.filter(
      (t) => t.id.startsWith(partial.toLowerCase()) || t.label.toLowerCase().startsWith(partial.toLowerCase())
    )
    return { kind: 'threat', operator, partial, suggestions }
  }

  if (['from', 'since', 'to', 'until'].includes(operator)) {
    return { kind: 'date', operator, partial, suggestions: [] }
  }

  return { kind: null, prefix: '', partial: '' }
}

/** Insert an autocomplete value at the current dork token. */
export function insertDorkValue(query, cursorPos, value) {
  const before = query.slice(0, cursorPos)
  const after = query.slice(cursorPos)
  const tokenMatch = before.match(/^(.*?(?:^|\s))(\w+):(\S*)$/)
  if (!tokenMatch) return { query: `${query} ${value} `.trim(), cursorPos: query.length + value.length + 2 }

  const prefix = tokenMatch[1]
  const operator = tokenMatch[2]
  const newBefore = `${prefix}${operator}:${value} `
  const newQuery = (newBefore + after).replace(/\s+/g, ' ').trimStart()
  const newCursor = newBefore.length
  return { query: newQuery, cursorPos: newCursor }
}
