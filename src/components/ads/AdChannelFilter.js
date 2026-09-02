'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { AD_CHANNEL, AD_CHANNEL_LABELS } from '@/lib/ads/ad-display'

const FILTER_LABEL = 'text-[10px] font-bold text-slate-500 uppercase tracking-wide'
const FILTER_TRIGGER =
  'w-full h-8 text-xs bg-slate-50 border-slate-200 hover:border-slate-300 focus:ring-blue-500/20 px-2.5'

const CHANNEL_OPTIONS = [
  { value: AD_CHANNEL.FEED, label: AD_CHANNEL_LABELS.feed },
  { value: AD_CHANNEL.LIBRARY, label: AD_CHANNEL_LABELS.library },
  { value: AD_CHANNEL.INGESTION, label: AD_CHANNEL_LABELS.ingestion },
]

export function AdChannelFilter({
  value = 'all',
  onChange,
  label = 'Channel',
  triggerClassName,
  showLabel = true,
  className,
}) {
  return (
    <div className={cn('space-y-0.5 min-w-0', className)}>
      {showLabel && <Label className={FILTER_LABEL}>{label}</Label>}
      <Select value={value || 'all'} onValueChange={onChange}>
        <SelectTrigger size="sm" className={cn(FILTER_TRIGGER, triggerClassName)}>
          <SelectValue placeholder="All channels" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All channels</SelectItem>
          {CHANNEL_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
