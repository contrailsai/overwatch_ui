'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  ExternalLink, Image as ImageIcon, Play,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { uniqueCloakVariants } from '@/lib/domains/domain-display'

function tabLabel(v) {
  if (v.label === 'bare') return 'Bare'
  return v.param || v.label || 'Variant'
}

function variantShot(v, primaryScreenshotUrl) {
  return (
    v?.signedScreenshotUrl
    || v?.screenshot?.s3_url
    || v?.screenshot?.url
    || (v?.label === 'bare' || v?.kind === 'scam' ? primaryScreenshotUrl : null)
  )
}

function buildArchivedMedia(images = [], videos = []) {
  const items = []
  images.forEach((img, idx) => {
    const src = img.signedUrl || img.s3_url
    if (!src) return
    items.push({ type: 'image', src, alt: img.alt || `Image ${idx + 1}` })
  })
  videos.forEach((vid, idx) => {
    const src = vid.signedUrl || vid.s3_url
    if (!src) return
    items.push({
      type: 'video',
      src,
      alt: `Video ${idx + 1}`,
      poster: vid.poster || vid.thumbnail || null,
    })
  })
  return items
}

/**
 * Evidence stage: filmstrip lander switcher + compact meta + tall capture plane.
 */
export function DomainCloakVariants({
  variants = [],
  primaryScreenshotUrl = null,
  className,
}) {
  const list = useMemo(() => uniqueCloakVariants(variants), [variants])

  const defaultIndex = useMemo(() => {
    const scamIdx = list.findIndex((v) => v.kind === 'scam' && v.differs_from_bare)
    if (scamIdx >= 0) return scamIdx
    const unlockedIdx = list.findIndex((v) => v.label !== 'bare' && v.differs_from_bare)
    if (unlockedIdx >= 0) return unlockedIdx
    return 0
  }, [list])

  const [active, setActive] = useState(defaultIndex)
  const [showPageText, setShowPageText] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)

  useEffect(() => {
    setActive(defaultIndex)
    setShowPageText(false)
    setViewerOpen(false)
  }, [defaultIndex, list.length])

  useEffect(() => {
    setViewerOpen(false)
  }, [active])

  const current = list.length > 0
    ? (list[Math.min(active, list.length - 1)] || list[0])
    : null

  const mediaItems = useMemo(
    () => buildArchivedMedia(current?.media?.images || [], current?.media?.videos || []),
    [current],
  )

  const openViewer = useCallback((index) => {
    setViewerIndex(index)
    setViewerOpen(true)
  }, [])

  const stepViewer = useCallback((delta) => {
    setViewerIndex((prev) => {
      if (mediaItems.length === 0) return 0
      return (prev + delta + mediaItems.length) % mediaItems.length
    })
  }, [mediaItems.length])

  useEffect(() => {
    if (!viewerOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        stepViewer(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        stepViewer(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewerOpen, stepViewer])

  if (list.length === 0 || !current) return null

  const shot = variantShot(current, primaryScreenshotUrl)
  const unlockedCount = list.filter((v) => v.label !== 'bare').length
  const hasPageText = Boolean(current?.excerpt)
  const viewerItem = mediaItems[viewerIndex] || null

  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
          Captured landers
        </h4>
        <p className="text-[10px] text-slate-400 shrink-0">
          {unlockedCount > 0
            ? `Bare + ${unlockedCount} unlock${unlockedCount === 1 ? '' : 's'}`
            : 'Bare only'}
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
        {list.map((v, idx) => {
          const thumb = variantShot(v, primaryScreenshotUrl)
          const isActive = idx === active
          return (
            <button
              key={`${v.label}-${idx}`}
              type="button"
              onClick={() => setActive(idx)}
              className={cn(
                'shrink-0 w-[104px] rounded-lg border overflow-hidden text-left transition-all',
                isActive
                  ? 'border-slate-900 ring-2 ring-offset-1 ring-slate-300'
                  : 'border-slate-200 hover:border-slate-300 bg-white',
              )}
              title={v.url || tabLabel(v)}
            >
              <div className="h-14 bg-slate-100 overflow-hidden">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <ImageIcon className="h-4 w-4 text-slate-300" />
                  </div>
                )}
              </div>
              <div className={cn(
                'px-1.5 py-1 border-t',
                isActive ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-100',
              )}>
                <p className={cn(
                  'text-[10px] font-bold truncate',
                  isActive ? 'text-white' : 'text-slate-700',
                )}>
                  {tabLabel(v)}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      <div className="sticky top-0 z-10 rounded-lg border border-slate-200 bg-white/95 backdrop-blur-sm px-3 py-2 space-y-1.5 shadow-sm">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {current.label === 'bare' ? (
            <Badge variant="outline" className="text-[10px] font-semibold border-slate-200 text-slate-600 shrink-0">
              Default URL
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] font-semibold border-violet-200 text-violet-700 bg-violet-50 shrink-0">
              Differs from bare
            </Badge>
          )}
          {current.title && (
            <span className="text-xs font-semibold text-slate-800 truncate min-w-0 flex-1">
              {current.title}
            </span>
          )}
          {current.url && (
            <a
              href={current.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:underline shrink-0 max-w-[40%] truncate"
              title={current.url}
            >
              <span className="truncate">{current.url}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          )}
        </div>
        {hasPageText && (
          <div>
            <button
              type="button"
              onClick={() => setShowPageText((v) => !v)}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600"
            >
              Page text
              {showPageText ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showPageText && (
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                {current.excerpt}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
        {shot ? (
          <div className="max-h-[min(78vh,900px)] overflow-y-auto custom-scrollbar bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shot}
              alt={`Capture of ${tabLabel(current)}`}
              className="w-full h-auto block"
            />
          </div>
        ) : (
          <div className="aspect-video flex flex-col items-center justify-center text-slate-400 gap-2 py-10">
            <ImageIcon className="h-8 w-8 text-slate-300" />
            <p className="text-xs font-semibold">No screenshot for this lander</p>
          </div>
        )}
      </div>

      {mediaItems.length > 0 && (
        <div className="space-y-1.5">
          <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Archived media ({mediaItems.length})
          </h5>
          <div className="flex flex-wrap gap-1">
            {mediaItems.map((item, idx) => (
              <button
                key={`${item.type}-${item.src}-${idx}`}
                type="button"
                onClick={() => openViewer(idx)}
                className="relative h-12 w-12 rounded overflow-hidden border border-slate-200 bg-slate-100 hover:ring-2 hover:ring-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                title={item.alt}
              >
                {item.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.src} alt="" className="h-full w-full object-cover" />
                ) : (
                  <>
                    {item.poster ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.poster} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-slate-900" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                      <Play className="h-3.5 w-3.5 text-white fill-white" />
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent
          className={cn(
            'flex flex-col p-0 gap-0 overflow-hidden',
            'w-[min(100vw-2rem,42rem)] max-w-[min(100vw-2rem,42rem)] sm:max-w-[min(100vw-2rem,42rem)]',
            'h-[min(80vh,560px)] max-h-[min(80vh,560px)]',
            'bg-white border-slate-200 text-slate-900 shadow-2xl',
          )}
          overlayClassName="bg-black/60"
        >
          <DialogHeader className="shrink-0 px-4 py-3 border-b border-slate-200 flex-row items-center justify-between space-y-0 pr-12 text-left">
            <div className="min-w-0">
              <DialogTitle className="text-sm font-semibold text-slate-900">
                Archived media
              </DialogTitle>
              <DialogDescription className="text-[11px] text-slate-500">
                {mediaItems.length > 0
                  ? `${viewerIndex + 1} / ${mediaItems.length}${viewerItem ? ` · ${viewerItem.type}` : ''}`
                  : 'No media'}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="relative flex items-stretch gap-1 px-2 py-3 min-h-0 flex-1 overflow-hidden">
            {mediaItems.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 self-center h-9 w-9 text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                onClick={() => stepViewer(-1)}
                aria-label="Previous media"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}

            <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center overflow-hidden bg-slate-50 rounded-md">
              {viewerItem?.type === 'image' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={viewerItem.src}
                  src={viewerItem.src}
                  alt={viewerItem.alt || ''}
                  className="max-h-full max-w-full object-contain"
                />
              )}
              {viewerItem?.type === 'video' && (
                <video
                  key={viewerItem.src}
                  src={viewerItem.src}
                  poster={viewerItem.poster || undefined}
                  controls
                  autoPlay
                  className="max-h-full max-w-full object-contain"
                >
                  <track kind="captions" />
                </video>
              )}
            </div>

            {mediaItems.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 self-center h-9 w-9 text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                onClick={() => stepViewer(1)}
                aria-label="Next media"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
