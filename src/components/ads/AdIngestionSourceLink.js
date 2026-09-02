'use client'

import { ExternalLink } from 'lucide-react'
import { getAdIngestionSourceUrl } from '@/lib/ads/ad-display'

/**
 * Share / submitted URL used at ingest when it differs from original_url.
 */
export function AdIngestionSourceLink({ ad }) {
  const url = getAdIngestionSourceUrl(ad)
  if (!url) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-blue-600 break-all inline-flex items-start gap-1 hover:underline text-sm"
    >
      <span>{url}</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5" />
    </a>
  )
}
