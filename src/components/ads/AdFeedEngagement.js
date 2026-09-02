'use client'

import { Heart, MessageCircle, Share2, Eye } from 'lucide-react'
import { getAdFeedEngagement } from '@/lib/ads/ad-display'
import { cn } from '@/lib/utils'

function EngagementStat({ icon: Icon, label, value }) {
  if (!Number.isFinite(value) || value <= 0) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 flex items-center gap-1">
        <Icon className="h-3 w-3 shrink-0" />
        {label}
      </p>
      <p className="text-base font-semibold text-slate-900 tabular-nums mt-0.5">
        {value.toLocaleString()}
      </p>
    </div>
  )
}

/**
 * Feed post engagement counts when stored on the ad document.
 */
export function AdFeedEngagement({ ad, className, compact = false }) {
  const engagement = getAdFeedEngagement(ad)
  if (!engagement) return null

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        Feed engagement
      </p>
      <div
        className={cn(
          'grid gap-2',
          compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4',
        )}
      >
        <EngagementStat icon={Heart} label="Likes" value={engagement.likes} />
        <EngagementStat icon={MessageCircle} label="Comments" value={engagement.comments} />
        <EngagementStat icon={Share2} label="Shares" value={engagement.shares} />
        <EngagementStat icon={Eye} label="Views" value={engagement.views} />
      </div>
    </div>
  )
}
