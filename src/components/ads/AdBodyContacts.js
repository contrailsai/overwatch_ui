'use client'

import { Phone, Link2 } from 'lucide-react'
import { extractBodyContacts } from '@/lib/ads/ad-display'

/**
 * Clickable chips for URLs / phones already present in body text.
 */
export function AdBodyContacts({ body }) {
  const { urls, phones } = extractBodyContacts(body)
  if (!urls.length && !phones.length) return null

  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {urls.map((url) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 max-w-full truncate rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-50"
          title={url}
        >
          <Link2 className="h-3 w-3 shrink-0 opacity-70" />
          <span className="truncate">{url.replace(/^https?:\/\//i, '')}</span>
        </a>
      ))}
      {phones.map((phone) => (
        <a
          key={phone}
          href={`tel:${phone.replace(/[^\d+]/g, '')}`}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
        >
          <Phone className="h-3 w-3 shrink-0 opacity-70" />
          {phone}
        </a>
      ))}
    </div>
  )
}
