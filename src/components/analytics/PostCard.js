'use client'

import Link from 'next/link'
import {
  Facebook,
  Instagram,
  Youtube,
  Globe,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Twitter, Reddit } from '@/utils/icons'
import { getRiskLabel } from '@/app/(dashboard)/cases/riskBuckets'

const VIOLATION_BADGE_COLORS = {
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export function getViolationBadgeClass(labelName) {
  const name = String(labelName || '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
  if (name.includes('scam') || name.includes('fraud')) return VIOLATION_BADGE_COLORS.rose
  if (name.includes('investment')) return VIOLATION_BADGE_COLORS.emerald
  if (name.includes('misinformation') || name.includes('fake')) return VIOLATION_BADGE_COLORS.orange
  if (name.includes('hate')) return VIOLATION_BADGE_COLORS.red
  if (name.includes('satire') || name.includes('humor')) return VIOLATION_BADGE_COLORS.blue
  if (name.includes('nsfw')) return VIOLATION_BADGE_COLORS.indigo
  if (name.includes('violence') || name.includes('terrorism')) return VIOLATION_BADGE_COLORS.red
  if (name.includes('phishing')) return VIOLATION_BADGE_COLORS.indigo
  if (name.includes('propaganda')) return VIOLATION_BADGE_COLORS.red
  if (name.includes('spam')) return VIOLATION_BADGE_COLORS.blue
  return VIOLATION_BADGE_COLORS.amber
}

export function PlatformIcon({ platform, className }) {
  const p = platform?.toLowerCase()
  if (p === 'instagram') return <Instagram className={cn('w-3.5 h-3.5 text-pink-500', className)} />
  if (p === 'facebook') return <Facebook className={cn('w-3.5 h-3.5 text-blue-600', className)} />
  if (p === 'x' || p === 'twitter') {
    return (
      <span className="w-3.5 h-3.5 inline-flex">
        <Twitter className={cn('max-w-3.5 max-h-3.5 text-slate-900', className)} />
      </span>
    )
  }
  if (p === 'reddit') {
    return (
      <span className="w-3.5 h-3.5 inline-flex">
        <Reddit className={cn('max-w-3.5 max-h-3.5', className)} />
      </span>
    )
  }
  if (p === 'youtube') return <Youtube className={cn('w-3.5 h-3.5 text-red-500', className)} />
  return <Globe className={cn('w-3.5 h-3.5 text-slate-400', className)} />
}

export function platformLabel(p) {
  if (!p) return 'Unknown'
  const k = String(p).toLowerCase()
  if (k === 'x') return 'X'
  return k.charAt(0).toUpperCase() + k.slice(1)
}

export function formatViolation(name) {
  return String(name || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * @param {{ post: object, href?: string, showAuthor?: boolean }} props
 * href defaults to /cases/[id] (profile inspect path). POI uses /cases?case_id=.
 */
export function PostCard({ post, href, showAuthor = true }) {
  const risk = getRiskLabel(post.effective_threat_score)
  const caption = post.caption || 'No caption'
  const caseHref = href || `/cases/${post._id}`

  return (
    <li className="relative break-inside-avoid mb-3 bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
      <Link href={caseHref} className="block">
        {post.signedImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.signedImageUrl}
            alt=""
            className="h-28 w-full object-cover bg-slate-100"
          />
        ) : null}
        <div className="p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <PlatformIcon platform={post.platform} />
              {platformLabel(post.platform)}
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
            {(post.threat_types || []).slice(0, 2).map((t) => (
              <Badge
                key={t}
                variant="outline"
                className={cn('text-[10px] capitalize border', getViolationBadgeClass(t))}
              >
                {formatViolation(t)}
              </Badge>
            ))}
          </div>
          {showAuthor ? (
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 pt-0.5">
              <span className="truncate min-w-0">
                {post.author?.display_name || post.author?.username || '—'}
              </span>
              {post.original_url ? <span className="h-7 w-7 shrink-0" aria-hidden /> : null}
            </div>
          ) : (
            post.original_url ? <div className="h-7" aria-hidden /> : null
          )}
        </div>
      </Link>
      {post.original_url ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="absolute bottom-2.5 right-2.5 h-7 w-7"
          title="Open platform post"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            window.open(post.original_url, '_blank', 'noopener,noreferrer')
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </li>
  )
}
