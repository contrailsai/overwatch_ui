'use client'

import Link from 'next/link'
import { Rss, Layers, FileText, Clock, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { feedDetailPath } from '@/lib/feeds/feed-slug'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

function FeedCard({ feed }) {
  return (
    <Link
      href={feedDetailPath(feed)}
      className={cn(
        'group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all',
        'hover:border-blue-200 hover:shadow-md hover:ring-1 hover:ring-blue-100'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600">
          <Rss className="h-5 w-5" />
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500" />
      </div>

      <h3 className="mt-4 line-clamp-2 text-base font-semibold text-slate-900 group-hover:text-blue-900">
        {feed.title}
      </h3>
      <p className="mt-1.5 line-clamp-3 min-h-[3.75rem] text-sm leading-relaxed text-slate-500">
        {feed.description || 'Curated collection of related content for your review.'}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          <Layers className="h-3.5 w-3.5" />
          {feed.topic_count} {feed.topic_count === 1 ? 'topic' : 'topics'}
        </span>
        {feed.manual_post_count > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            <FileText className="h-3.5 w-3.5" />
            {feed.manual_post_count} added {feed.manual_post_count === 1 ? 'post' : 'posts'}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-400">
        <Clock className="h-3.5 w-3.5" />
        Updated {formatDate(feed.updated_at)}
      </div>
    </Link>
  )
}

export function FeedsIndexClient({ feeds }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">Your feeds</h2>
        <p className="text-sm text-slate-500">
          {feeds.length} curated {feeds.length === 1 ? 'collection' : 'collections'} prepared for this project.
        </p>
      </div>

      {feeds.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Rss className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-900">No feeds yet</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            When your team publishes curated feeds, they will appear here for browsing and reporting.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {feeds.map((feed) => (
            <FeedCard key={feed._id} feed={feed} />
          ))}
        </div>
      )}
    </div>
  )
}
