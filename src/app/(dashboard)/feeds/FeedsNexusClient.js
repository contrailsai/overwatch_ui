'use client'

import { useCallback, useState, useTransition } from 'react'
import Link from 'next/link'
import { NexusGraphShell } from '@/components/nexus/NexusGraphShell'
import { TopicPostsPanel } from '@/app/(dashboard)/feeds/TopicPostsPanel'
import { getNexusLeafStubs } from '@/app/(dashboard)/nexus/actions'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

function HubPanel({ node, onClose }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Hub</p>
          <h3 className="text-sm font-bold text-slate-900">{node?.label || node?.id}</h3>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-2 p-4 text-sm text-slate-600">
        <p>
          <span className="font-semibold text-slate-800">Type:</span> {node?.hubKind || 'hub'}
        </p>
        <p>
          <span className="font-semibold text-slate-800">Linked count:</span> {node?.count ?? 0}
        </p>
        <p className="text-xs text-slate-500">
          Click a cluster (topic) to browse posts. Leaves pack around clusters when loaded.
        </p>
      </div>
    </div>
  )
}

function LeafPostPanel({ node, onClose, project, clientDetails, projectEmails }) {
  // Leaf click → open as a single-post detail via CaseDetailPanel requires full post.
  // For now show a slim stub with link into cases.
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Post</p>
          <h3 className="truncate text-sm font-bold text-slate-900">{node?.id}</h3>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-3 p-4 text-sm">
        {node?.colorKey && node.colorKey !== 'unknown' && (
          <p>
            <span className="font-semibold">Violation:</span> {node.colorKey}
          </p>
        )}
        <Link
          href={`/cases/${node.id}`}
          className="inline-flex text-sm font-semibold text-blue-600 hover:underline"
        >
          Open full case →
        </Link>
        <p className="text-xs text-slate-500">
          Full creative loads on the case page (graph holds stubs only).
        </p>
      </div>
    </div>
  )
}

export function FeedsNexusClient({
  graphData,
  feedCount = 0,
  project,
  clientDetails,
  projectEmails,
}) {
  const [selected, setSelected] = useState(null)
  const [, startTransition] = useTransition()

  const handleNeedLeaves = useCallback((args, api) => {
    startTransition(async () => {
      const stubs = await getNexusLeafStubs({
        preset: graphData?.meta?.preset || 'feeds-poi-topics',
        parentIds: args?.parentIds || [],
      })
      api?.setLeaves?.(stubs)
    })
  }, [graphData?.meta?.preset])

  const handleSelectNode = useCallback((node) => {
    setSelected(node)
  }, [])

  const handleClose = useCallback(() => {
    setSelected(null)
  }, [])

  let detailPanel = null
  if (selected?.type === 'cluster') {
    detailPanel = (
      <TopicPostsPanel
        topic={{ id: selected.id, title: selected.label, ...selected }}
        onClose={handleClose}
        project={project}
        clientDetails={clientDetails}
        projectEmails={projectEmails}
      />
    )
  } else if (selected?.type === 'hub') {
    detailPanel = <HubPanel node={selected} onClose={handleClose} />
  } else if (selected?.type === 'leaf') {
    detailPanel = (
      <LeafPostPanel
        node={selected}
        onClose={handleClose}
        project={project}
        clientDetails={clientDetails}
        projectEmails={projectEmails}
      />
    )
  }

  return (
    <NexusGraphShell
      graphData={graphData}
      title="Topic map"
      subtitle="POIs → topics → posts (leaves load on demand)"
      emptyTitle="No graph data yet"
      emptyDescription="Topics and POIs will appear here once they exist in your project database."
      onNeedLeaves={handleNeedLeaves}
      onSelectNode={handleSelectNode}
      detailPanel={detailPanel}
      extraSidebar={
        feedCount > 0 ? (
          <div className="nx-control-group">
            <h2>Collections</h2>
            <Link href="/feeds/collections" className="nx-btn nx-btn-primary w-full">
              Browse {feedCount} feed{feedCount === 1 ? '' : 's'}
            </Link>
          </div>
        ) : null
      }
    />
  )
}
