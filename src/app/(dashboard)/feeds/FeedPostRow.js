'use client'

import {
  ExternalLink,
  Quote,
  Instagram,
  Facebook,
  Youtube,
  ClockFading,
  CheckCircle,
  FlagTriangleLeft,
  AlertOctagon,
  Info,
} from 'lucide-react'
import { format } from 'date-fns'
import { Twitter, Reddit } from '@/utils/icons'
import getPostLink from '@/components/GetPostLink'
import { cn } from '@/lib/utils'
import { getRiskLabel } from '@/app/(dashboard)/cases/riskBuckets'

export function getFeedPostStatusConfig(post, allowDoTakedown) {
  const status = post.client_status || 'To Be Reviewed'
  if (status === 'To Be Reviewed') {
    return { label: 'To Be Reviewed', icon: ClockFading, color: 'text-slate-700 bg-slate-100 border-slate-200' }
  }
  if (status === 'No Action' || status === 'Pass') {
    return { label: 'No Action', icon: CheckCircle, color: 'text-emerald-500 bg-emerald-50 border-emerald-200' }
  }
  if (status === 'Flag for Takedown') {
    return {
      label: 'Flag for Takedown',
      icon: FlagTriangleLeft,
      color: allowDoTakedown
        ? 'text-orange-500 bg-orange-50 border-orange-200'
        : 'text-rose-500 bg-rose-50 border-rose-200',
    }
  }
  if (status === 'Takedown') {
    return { label: 'Takedown', icon: AlertOctagon, color: 'text-rose-500 bg-rose-50 border-rose-200' }
  }
  return { label: status, icon: Info, color: 'text-slate-600 bg-slate-50 border-slate-200' }
}

export function FeedPostRow({
  post,
  allowDoTakedown = true,
  compact = false,
  renderAs = compact ? 'compact' : 'row',
  isOpen = false,
  onOpen,
}) {
  const risk = getRiskLabel(post.review_details?.threat_score)
  const statusConfig = getFeedPostStatusConfig(post, allowDoTakedown)
  const StatusIcon = statusConfig.icon

  if (renderAs === 'compact') {
    return (
      <button
        type="button"
        onClick={() => onOpen?.(post)}
        className={cn(
          'flex w-full gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/40',
          isOpen && 'border-blue-300 bg-blue-50/60'
        )}
      >
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
          {post.signedImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.signedImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Quote className="h-3.5 w-3.5 text-slate-300" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('inline-flex rounded border px-1 py-0.5 text-[9px] font-black uppercase', risk.color)}>
              {risk.label}
            </span>
            <span className="text-[11px] font-bold text-slate-800 truncate">
              @{post.user?.username || 'unknown'}
            </span>
            <span className={cn('inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border', statusConfig.color)}>
              <StatusIcon className="h-2 w-2" />
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-600">
            {post.caption || <span className="italic text-slate-400">No caption</span>}
          </p>
          {post.posted_date && (
            <p className="mt-1 text-[10px] font-medium text-slate-400">
              {format(new Date(post.posted_date), 'MMM d, yyyy')}
            </p>
          )}
        </div>
      </button>
    )
  }

  const cells = (
    <>
      <td className="px-3 py-2.5 align-top text-center">
        <span className={cn('inline-flex rounded border px-1.5 py-0.5 text-[10px] font-black uppercase', risk.color)}>
          {risk.label}
        </span>
      </td>
      <td className="px-3 py-2.5 align-top">
        <div className="flex gap-2.5">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
            {post.signedImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.signedImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Quote className="h-4 w-4 text-slate-300" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {post.platform === 'instagram' ? <Instagram className="h-3.5 w-3.5 text-pink-500" />
                : post.platform === 'facebook' ? <Facebook className="h-3.5 w-3.5 text-blue-600" />
                  : post.platform === 'x' ? <Twitter className="h-3.5 w-3.5" />
                    : post.platform === 'youtube' ? <Youtube className="h-3.5 w-3.5 text-red-500" />
                      : post.platform === 'reddit' ? <Reddit className="h-3.5 w-3.5" />
                        : null}
              <span className="text-xs font-bold text-slate-800 truncate">
                @{post.user?.username || 'unknown'}
              </span>
              <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full border', statusConfig.color)}>
                <StatusIcon className="h-2.5 w-2.5" />
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-600">
              {post.caption || <span className="italic text-slate-400">No caption</span>}
            </p>
          </div>
        </div>
      </td>
      <td className="hidden lg:table-cell px-3 py-2.5 align-top text-xs text-slate-500 whitespace-nowrap">
        {post.posted_date ? format(new Date(post.posted_date), 'MMM d, yyyy') : '—'}
      </td>
      <td className="px-2 py-2.5 align-top" onClick={(e) => e.stopPropagation()}>
        <a
          href={post.original_url || getPostLink(post)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-md p-1 text-blue-600 hover:bg-blue-50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </td>
    </>
  )

  if (renderAs === 'cells') {
    return cells
  }

  return (
    <tr
      className={cn(
        'border-b border-slate-50 hover:bg-slate-50/80 cursor-pointer transition-colors',
        isOpen && 'bg-blue-50/60'
      )}
      onClick={() => onOpen?.(post)}
    >
      {cells}
    </tr>
  )
}
