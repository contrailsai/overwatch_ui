'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { NexusGraphShell } from '@/components/nexus/NexusGraphShell'
import { AdCard } from '@/components/ads/AdCard'
import { Button } from '@/components/ui/button'
import {
  getAdsNexusGraph,
  getNexusLeafStubs,
  getNexusClusterAds,
} from '@/app/(dashboard)/nexus/actions'

const PARENT_MODES = [
  { id: 'ad_profile', label: 'Ad profiles' },
  { id: 'domain', label: 'Domains' },
]

function ClusterAdsPanel({ node, parentMode, onClose }) {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [isPending, startTransition] = useTransition()

  const load = useCallback(
    (clusterId, nextPage) => {
      startTransition(async () => {
        const data = await getNexusClusterAds(clusterId, parentMode, nextPage, 25)
        setResult(data)
      })
    },
    [parentMode]
  )

  useEffect(() => {
    if (!node?.id) return
    setPage(1)
    load(node.id, 1)
  }, [node?.id, load])

  const ads = result?.ads || []
  const totalPages = result?.totalPages || 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {parentMode === 'domain' ? 'Domain' : 'Ad profile'}
          </p>
          <h3 className="truncate text-sm font-bold text-slate-900">
            {result?.meta?.title || node?.label || node?.id}
          </h3>
          <p className="text-xs text-slate-500">{result?.totalCount ?? node?.count ?? 0} ads</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ul className="flex-1 overflow-y-auto p-3 columns-1 sm:columns-2 gap-3">
        {isPending && !ads.length ? (
          <div className="flex justify-center py-10 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : ads.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No ads in this cluster.</p>
        ) : (
          ads.map((ad) => <AdCard key={ad._id} ad={ad} />)
        )}
      </ul>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={page <= 1 || isPending}
            onClick={() => {
              const next = page - 1
              setPage(next)
              load(node.id, next)
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-slate-500">
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={page >= totalPages || isPending}
            onClick={() => {
              const next = page + 1
              setPage(next)
              load(node.id, next)
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

export function AdsNexusClient({ initialGraph, initialMode = 'ad_profile' }) {
  const [parentMode, setParentMode] = useState(initialMode)
  const [graphData, setGraphData] = useState(initialGraph)
  const [selected, setSelected] = useState(null)
  const [isPending, startTransition] = useTransition()

  const handleModeChange = useCallback((mode) => {
    setParentMode(mode)
    setSelected(null)
    startTransition(async () => {
      const next = await getAdsNexusGraph(mode)
      setGraphData(next)
    })
  }, [])

  const handleNeedLeaves = useCallback(
    (args, api) => {
      startTransition(async () => {
        const stubs = await getNexusLeafStubs({
          preset: parentMode === 'domain' ? 'ads-domains' : 'ads-ad-profiles',
          parentIds: args?.parentIds || [],
        })
        api?.setLeaves?.(stubs)
      })
    },
    [parentMode]
  )

  let detailPanel = null
  if (selected?.type === 'cluster' || selected?.type === 'hub') {
    detailPanel = (
      <ClusterAdsPanel
        node={selected}
        parentMode={parentMode}
        onClose={() => setSelected(null)}
      />
    )
  } else if (selected?.type === 'leaf') {
    detailPanel = (
      <div className="flex h-full flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold">Ad {selected.id}</h3>
          <Button type="button" variant="ghost" size="icon" onClick={() => setSelected(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {selected.colorKey && selected.colorKey !== 'unknown' && (
          <p className="mb-2 text-sm">Violation: {selected.colorKey}</p>
        )}
        <Link href={`/ads?ad_id=${selected.id}`} className="text-sm font-semibold text-blue-600">
          Open in Ad List →
        </Link>
      </div>
    )
  }

  return (
    <div className="relative flex flex-1 min-h-0 flex-col">
      {isPending && (
        <div className="absolute right-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1 text-xs text-slate-500 shadow">
          Updating…
        </div>
      )}
      <NexusGraphShell
        graphData={graphData}
        title="Nexus-ads"
        subtitle="Leaves = ads · colors = violations"
        parentModes={PARENT_MODES}
        parentMode={parentMode}
        onParentModeChange={handleModeChange}
        onNeedLeaves={handleNeedLeaves}
        onSelectNode={setSelected}
        detailPanel={detailPanel}
      />
    </div>
  )
}
