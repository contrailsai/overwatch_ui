'use client'

import * as React from 'react'
import { useState, useEffect, useCallback, useTransition, useMemo } from 'react'
import { format } from 'date-fns'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Loader2, Filter, ChevronLeft, ChevronRight, Megaphone, ExternalLink, X,
} from 'lucide-react'
import { Facebook, Instagram } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getRiskLabel } from '@/app/(dashboard)/cases/riskBuckets'
import ReviewAdForm from './ReviewAdDetails'

function parseFilters(searchParams) {
  const aiAnalyzedRaw = searchParams.get('aiAnalyzed')
  let aiAnalyzed = 'all'
  if (aiAnalyzedRaw === 'analyzed' || aiAnalyzedRaw === 'true') aiAnalyzed = 'analyzed'
  else if (aiAnalyzedRaw === 'not_analyzed') aiAnalyzed = 'not_analyzed'

  return {
    platform: searchParams.get('platform') || 'all',
    status: searchParams.get('status') || 'pending',
    aiAnalyzed,
    visibility_status: searchParams.get('visibility_status') || 'all',
    aiRisk: searchParams.get('aiRisk') || 'all',
    sourcingDateStart: searchParams.get('sourcingDateStart') || undefined,
    sourcingDateEnd: searchParams.get('sourcingDateEnd') || undefined,
    startDateStart: searchParams.get('startDateStart') || undefined,
    startDateEnd: searchParams.get('startDateEnd') || undefined,
  }
}

function PlatformIcon({ platform }) {
  const p = String(platform || '').toLowerCase()
  if (p === 'meta' || p === 'facebook') {
    return <Facebook className="w-4 h-4 text-blue-600" />
  }
  if (p === 'instagram') {
    return <Instagram className="w-4 h-4 text-pink-500" />
  }
  return <Megaphone className="w-4 h-4 text-slate-500" />
}

export function ReviewAdsInterface({
  initialAds,
  totalPages,
  currentPage,
  project,
  clientDetails,
  initialFilters,
  totalCount,
  initialAd,
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [ads, setAds] = useState(initialAds || [])
  const [selectedAd, setSelectedAd] = useState(initialAd || null)
  const [showFilters, setShowFilters] = useState(false)

  const filters = useMemo(
    () => ({ ...initialFilters, ...parseFilters(searchParams) }),
    [initialFilters, searchParams],
  )

  useEffect(() => {
    setAds(initialAds || [])
  }, [initialAds])

  useEffect(() => {
    if (initialAd) setSelectedAd(initialAd)
  }, [initialAd])

  const updateParams = useCallback(
    (updates, { replace = false } = {}) => {
      const params = new URLSearchParams(searchParams.toString())
      Object.entries(updates).forEach(([key, value]) => {
        if (value == null || value === '' || value === 'all' || value === false) {
          if (key === 'status' && value === 'all') {
            params.set(key, 'all')
          } else if (key === 'status') {
            params.delete(key)
          } else {
            params.delete(key)
          }
        } else {
          params.set(key, String(value))
        }
      })
      const qs = params.toString()
      startTransition(() => {
        const method = replace ? router.replace : router.push
        method(`${pathname}${qs ? `?${qs}` : ''}`)
      })
    },
    [pathname, router, searchParams],
  )

  const openAd = (ad) => {
    setSelectedAd(ad)
    updateParams({ ad_id: ad._id }, { replace: true })
  }

  const closeAd = () => {
    setSelectedAd(null)
    updateParams({ ad_id: null }, { replace: true })
  }

  const selectedIndex = selectedAd
    ? ads.findIndex((a) => a._id === selectedAd._id)
    : -1

  const navigateAd = (dir) => {
    if (selectedIndex < 0) return
    const next = ads[selectedIndex + dir]
    if (next) openAd(next)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* List panel */}
      <div
        className={cn(
          'flex flex-col border-r border-slate-200 bg-white',
          selectedAd ? 'hidden lg:flex lg:w-[380px] xl:w-[420px]' : 'flex w-full',
        )}
      >
        <div className="shrink-0 border-b border-slate-100 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{totalCount.toLocaleString()}</span>
              {' '}ads
              {isPending && <Loader2 className="inline ml-2 h-3.5 w-3.5 animate-spin text-slate-400" />}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters((v) => !v)}
              className="gap-1.5"
            >
              <Filter className="h-3.5 w-3.5" />
              Filters
            </Button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={filters.status}
                onValueChange={(v) => updateParams({ status: v, page: 1 })}
              >
                <SelectTrigger className="h-9 text-xs">Status</SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.platform}
                onValueChange={(v) => updateParams({ platform: v, page: 1 })}
              >
                <SelectTrigger className="h-9 text-xs">Platform</SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All platforms</SelectItem>
                  <SelectItem value="meta">Meta</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.aiAnalyzed}
                onValueChange={(v) => updateParams({ aiAnalyzed: v, page: 1 })}
              >
                <SelectTrigger className="h-9 text-xs">AI status</SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All AI</SelectItem>
                  <SelectItem value="analyzed">Analyzed</SelectItem>
                  <SelectItem value="not_analyzed">Not analyzed</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.aiRisk}
                onValueChange={(v) => updateParams({ aiRisk: v, page: 1 })}
              >
                <SelectTrigger className="h-9 text-xs">Risk</SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All risk</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="safe">Safe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {ads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 text-slate-500">
              <Megaphone className="h-10 w-10 text-slate-300 mb-3" />
              <p className="font-medium text-slate-700">No ads in this queue</p>
              <p className="text-sm mt-1">Adjust filters or wait for ingest to write Ads documents.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {ads.map((ad) => {
                const risk = getRiskLabel(ad.score)
                const isActive = selectedAd?._id === ad._id
                const thumb = ad.signedImageUrl || ad.content?.media?.[0]?.signedUrl
                return (
                  <li key={ad._id}>
                    <button
                      type="button"
                      onClick={() => openAd(ad)}
                      className={cn(
                        'w-full text-left px-4 py-3 flex gap-3 transition-colors',
                        isActive ? 'bg-blue-50' : 'hover:bg-slate-50',
                      )}
                    >
                      <div className="h-14 w-14 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <Megaphone className="h-5 w-5 text-slate-300" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <PlatformIcon platform={ad.platform} />
                          <span className="text-sm font-semibold text-slate-900 truncate">
                            {ad.page_name || 'Unknown page'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-2">
                          {ad.content?.title || ad.caption || ad.platform_ad_id || 'Untitled ad'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', risk.color)}>
                            {risk.label}
                          </Badge>
                          {ad.list?.display_format && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {ad.list.display_format}
                            </Badge>
                          )}
                          {ad.list?.is_active && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200">
                              Active
                            </Badge>
                          )}
                          <span className="text-[10px] text-slate-400 ml-auto">
                            {ad.sourcing_date
                              ? format(new Date(ad.sourcing_date), 'dd MMM yyyy')
                              : '—'}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {totalPages > 1 && (
          <div className="shrink-0 border-t border-slate-100 px-4 py-2 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage <= 1 || isPending}
              onClick={() => updateParams({ page: currentPage - 1 })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-slate-500">
              Page {currentPage} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage >= totalPages || isPending}
              onClick={() => updateParams({ page: currentPage + 1 })}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedAd ? (
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
          <div className="lg:hidden shrink-0 flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200">
            <Button variant="ghost" size="sm" onClick={closeAd}>
              <X className="h-4 w-4 mr-1" /> Back
            </Button>
            {selectedAd.original_url && (
              <a
                href={selectedAd.original_url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-xs text-blue-600 flex items-center gap-1"
              >
                Ads Library <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <ReviewAdForm
            ad={selectedAd}
            project={project}
            clientDetails={clientDetails}
            onClose={closeAd}
            onNavigate={navigateAd}
            hasPrev={selectedIndex > 0}
            hasNext={selectedIndex >= 0 && selectedIndex < ads.length - 1}
            setAds={setAds}
            setSelectedAd={setSelectedAd}
          />
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center text-slate-400 text-sm">
          Select an ad to review
        </div>
      )}
    </div>
  )
}
