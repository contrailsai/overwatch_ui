'use client'

import { Megaphone } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Detail creative stage: image or video player (no autoplay).
 * @param {{ type: 'image' | 'video' | null, url?: string }} media
 */
export function AdMediaStage({ media, className, emptyIconClassName = 'h-12 w-12 text-slate-300' }) {
  const type = media?.type
  const url = media?.url

  return (
    <div
      className={cn(
        'relative overflow-hidden flex items-center justify-center',
        className,
      )}
    >
      {type === 'video' && url ? (
        <video
          src={url}
          controls
          preload="metadata"
          playsInline
          className="max-h-full max-w-full object-contain"
        />
      ) : type === 'image' && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="max-h-full max-w-full object-contain" />
      ) : (
        <Megaphone className={emptyIconClassName} />
      )}
    </div>
  )
}
