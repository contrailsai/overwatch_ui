'use client'

import { ExternalLink, LinkIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const FIELD_PRIORITY = [
  'profile_url',
  'username',
  'query',
  'search_url',
  'mode',
  'source_url',
]

function humanizeType(type) {
  if (!type) return 'Unknown'
  return String(type)
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function humanizeKey(key) {
  return key.replace(/_/g, ' ')
}

function isUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

function sortKeys(keys) {
  const priorityIndex = (key) => {
    const idx = FIELD_PRIORITY.indexOf(key)
    return idx === -1 ? FIELD_PRIORITY.length : idx
  }
  return [...keys].sort((a, b) => {
    if (a === 'type') return -1
    if (b === 'type') return 1
    const pa = priorityIndex(a)
    const pb = priorityIndex(b)
    if (pa !== pb) return pa - pb
    return a.localeCompare(b)
  })
}

function OriginValue({ value }) {
  if (value == null || value === '') {
    return <span className="italic text-slate-400">N/A</span>
  }

  if (typeof value === 'object') {
    return (
      <pre className="text-xs font-mono text-slate-700 bg-slate-50 border border-slate-100 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all">
        {JSON.stringify(value, null, 2)}
      </pre>
    )
  }

  const text = String(value)

  if (isUrl(text)) {
    return (
      <a
        href={text}
        target="_blank"
        rel="noreferrer"
        title={text}
        className="inline-flex items-start gap-1 text-blue-600 hover:underline min-w-0 max-w-full"
      >
        <span className="break-all">{text}</span>
        <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      </a>
    )
  }

  return <span className="break-words">{text}</span>
}

export default function ResultOriginPanel({ resultOrigin }) {
  if (!resultOrigin || typeof resultOrigin !== 'object') return null

  const entries = sortKeys(Object.keys(resultOrigin))
  if (entries.length === 0) return null

  const type = resultOrigin.type

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <LinkIcon className="w-3 h-3" />
          Result Origin
        </h4>
        {type ? (
          <Badge variant="secondary" className="text-xs font-semibold bg-slate-100 text-slate-700 border-slate-200">
            {humanizeType(type)}
          </Badge>
        ) : null}
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-[minmax(6.5rem,auto)_1fr] gap-x-4 gap-y-2.5">
        {entries.map((key) => (
          <div key={key} className="contents">
            <dt className="text-[10px] font-bold text-slate-500 uppercase tracking-wide sm:pt-0.5">
              {humanizeKey(key)}
            </dt>
            <dd className="text-sm font-medium text-slate-900 min-w-0">
              <OriginValue value={resultOrigin[key]} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
