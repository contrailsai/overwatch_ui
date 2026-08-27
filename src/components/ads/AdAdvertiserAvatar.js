'use client'

import { User } from 'lucide-react'
import { cn } from '@/lib/utils'

function initialsFromName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return null
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

/**
 * Advertiser profile pic or initials / user icon fallback.
 */
export function AdAdvertiserAvatar({
  src,
  name,
  className,
  iconClassName = 'h-3.5 w-3.5',
}) {
  const initials = initialsFromName(name)

  return (
    <div
      className={cn(
        'rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden',
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : initials ? (
        <span className="text-[10px] font-semibold text-slate-500 leading-none select-none">
          {initials}
        </span>
      ) : (
        <User className={cn('text-slate-400', iconClassName)} />
      )}
    </div>
  )
}
