'use client'

import { cn } from '@/lib/utils'
import { AdMediaThumb } from '@/components/ads/AdMediaThumb'
import { getMediaItemThumb } from '@/lib/ads/ad-display'

/**
 * Filmstrip / dot navigator for ad creative media or cards.
 * @param {{
 *   items: object[],
 *   activeIndex: number,
 *   onSelect: (index: number) => void,
 *   getThumbItem?: (item: object, index: number) => object | null,
 *   counterClassName?: string,
 *   className?: string,
 *   theme?: 'dark' | 'light',
 * }} props
 */
export function AdMediaNavigator({
  items,
  activeIndex,
  onSelect,
  getThumbItem,
  counterClassName,
  className,
  theme = 'dark',
}) {
  if (!Array.isArray(items) || items.length <= 1) return null

  const isLight = theme === 'light'

  const resolveThumb = (item, index) => {
    const raw = getThumbItem ? getThumbItem(item, index) : item
    if (raw?.type && raw?.url) {
      return raw.type === 'video' && raw.posterUrl
        ? { kind: 'image', url: raw.posterUrl }
        : raw.type === 'video'
          ? { kind: 'video' }
          : { kind: 'image', url: raw.url }
    }
    return getMediaItemThumb(raw)
  }

  return (
    <div
      className={cn(
        'w-[72px] shrink-0 rounded-xl border flex flex-col items-center gap-1.5 py-2 px-1.5 overflow-y-auto custom-scrollbar',
        isLight
          ? 'border-slate-200 bg-white'
          : 'border-slate-200 bg-[#0c1015]',
        className,
      )}
      role="listbox"
      aria-label="Ad media"
    >
      {items.map((item, i) => {
        const thumb = resolveThumb(item, i)
        const isActive = i === activeIndex
        return (
          <button
            key={i}
            type="button"
            role="option"
            aria-selected={isActive}
            onClick={() => onSelect(i)}
            className={cn(
              'relative h-14 w-14 rounded-md overflow-hidden border shrink-0 transition-all duration-150',
              isActive
                ? isLight
                  ? 'border-blue-500 ring-2 ring-blue-200'
                  : 'border-sky-400 ring-2 ring-sky-400/40'
                : isLight
                  ? 'border-slate-200 opacity-80 hover:opacity-100 hover:border-slate-300'
                  : 'border-white/15 opacity-70 hover:opacity-100 hover:border-white/35',
            )}
          >
            <AdMediaThumb
              kind={thumb.kind}
              src={thumb.url}
              className={cn('h-full w-full', isLight ? 'bg-slate-100' : 'bg-slate-800')}
              iconClassName="h-3.5 w-3.5"
            />
            <span
              className={cn(
                'absolute bottom-0 inset-x-0 text-[9px] font-bold tabular-nums text-center leading-4',
                isLight
                  ? 'bg-slate-900/70 text-white/95'
                  : 'bg-black/55 text-white/90',
              )}
            >
              {i + 1}
            </span>
          </button>
        )
      })}
      {counterClassName ? (
        <span className={counterClassName}>
          {activeIndex + 1} / {items.length}
        </span>
      ) : null}
    </div>
  )
}

export function AdMediaCounter({ activeIndex, total, className }) {
  if (total <= 1) return null
  return (
    <div
      className={cn(
        'absolute top-2.5 left-2.5 rounded-md bg-black/55 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white/90 tracking-wide z-10',
        className,
      )}
    >
      {activeIndex + 1} / {total}
    </div>
  )
}
