'use client'

import { Megaphone, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * List/grid thumbnail: image, video play icon, or megaphone fallback.
 * Never pass a video URL as src — use kind from getAdListThumb.
 */
export function AdMediaThumb({ kind = 'none', src, className, iconClassName }) {
  const showImage = kind === 'image' && src

  return (
    <div className={cn('bg-slate-100 overflow-hidden shrink-0', className)}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : kind === 'video' ? (
        <div className="h-full w-full flex items-center justify-center bg-slate-800/90">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
            <Play className={cn('text-white fill-white ml-0.5', iconClassName || 'h-4 w-4')} />
          </span>
        </div>
      ) : (
        <div className="h-full w-full flex items-center justify-center">
          <Megaphone className={cn('text-slate-300', iconClassName)} />
        </div>
      )}
    </div>
  )
}
