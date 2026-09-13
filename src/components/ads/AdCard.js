'use client'

import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getRiskLabel } from '@/app/(dashboard)/cases/riskBuckets'
import {
  PlatformIcon,
  platformLabel,
  formatViolation,
  getViolationBadgeClass,
} from '@/components/analytics/PostCard'

/**
 * Compact ad card for advertiser overview masonry.
 * @param {{ ad: object, href?: string }} props
 */
function asDisplayText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && typeof value.text === 'string') return value.text
  return ''
}

export function AdCard({ ad, href }) {
  const risk = getRiskLabel(ad.effective_threat_score)
  const caption = asDisplayText(ad.caption) || asDisplayText(ad.title) || 'No creative text'
  const adHref = href || `/ads?ad_id=${ad._id}`
  const platform = ad.platform === 'meta' ? 'facebook' : ad.platform

  return (
    <li className="relative break-inside-avoid mb-3 bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
      <Link href={adHref} className="block">
        {ad.signedImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.signedImageUrl}
            alt=""
            className="h-28 w-full object-cover bg-slate-100"
          />
        ) : null}
        <div className="p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <PlatformIcon platform={platform} />
              {platformLabel(ad.platform === 'meta' ? 'facebook' : ad.platform)}
            </span>
            <span
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase border shrink-0',
                risk.color
              )}
            >
              {risk.label}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 line-clamp-2" title={caption}>
            {caption}
          </p>
          <div className="flex flex-wrap gap-1">
            {(ad.threat_types || []).slice(0, 2).map((t) => (
              <Badge
                key={t}
                variant="outline"
                className={cn('text-[10px] capitalize border', getViolationBadgeClass(t))}
              >
                {formatViolation(t)}
              </Badge>
            ))}
          </div>
          {ad.original_url ? <div className="h-7" aria-hidden /> : null}
        </div>
      </Link>
      {ad.original_url ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="absolute bottom-2.5 right-2.5 h-7 w-7"
          title="Open Ads Library"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            window.open(ad.original_url, '_blank', 'noopener,noreferrer')
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </li>
  )
}
