'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { mountNexus } from '@/lib/nexus/engine'
import './nexus-graph.css'

const INFO_DISMISS_KEY = 'overwatch-nexus-info-dismissed'

function readInfoDismissed() {
  try {
    return localStorage.getItem(INFO_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Shared Nexus canvas host used by Feeds, Posts understanding, and Ads understanding.
 */
export function NexusGraphShell({
  graphData,
  title = 'Nexus',
  subtitle = '',
  emptyTitle = 'No graph data yet',
  emptyDescription = 'Hubs and clusters will appear once data exists in this project.',
  parentModes = null,
  parentMode = null,
  onParentModeChange = null,
  onNeedLeaves = null,
  onSelectNode = null,
  detailPanel = null,
  detailSize = null,
  extraSidebar = null,
  violationLabels = null,
  defaultShowColors = false,
}) {
  const rootRef = useRef(null)
  const apiRef = useRef(null)
  const selectRef = useRef(onSelectNode)
  const needLeavesRef = useRef(onNeedLeaves)
  const [graphReady, setGraphReady] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  selectRef.current = onSelectNode
  needLeavesRef.current = onNeedLeaves

  useEffect(() => {
    setShowInfo(!readInfoDismissed())
  }, [])

  const dismissInfo = useCallback(() => {
    try {
      localStorage.setItem(INFO_DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setShowInfo(false)
  }, [])

  useEffect(() => {
    if (!rootRef.current || !graphData?.nodes?.length) {
      setGraphReady(false)
      return undefined
    }

    apiRef.current?.destroy?.()
    setGraphReady(false)
    apiRef.current = mountNexus(rootRef.current, graphData, {
      title,
      subtitle,
      violationLabels,
      defaultShowColors,
      onSelectNode: (node) => {
        // Pass a plain snapshot — never the live simulation node (circular / mutable).
        selectRef.current?.(node ? snapshotNode(node) : null)
      },
      onNeedLeaves: (args) => {
        needLeavesRef.current?.(args, {
          setLeaves: (payload) => apiRef.current?.setLeaves?.(payload),
        })
      },
    })
    // boot() is sync; mark ready so React owns the `ready` class (don't fight classList).
    setGraphReady(true)

    return () => {
      apiRef.current?.destroy?.()
      apiRef.current = null
      setGraphReady(false)
    }
  }, [graphData, title, subtitle, violationLabels, defaultShowColors])

  const handleClear = useCallback(() => {
    apiRef.current?.clearSelection?.()
    selectRef.current?.(null)
  }, [])

  const hasGraph = Boolean(graphData?.nodes?.length)
  const hasModes = Array.isArray(parentModes) && parentModes.length > 0
  const showDetail = hasGraph && Boolean(detailPanel)
  const appClassName = [
    hasGraph ? (graphReady ? 'ready' : '') : 'ready',
    showDetail ? 'has-selection' : '',
    showDetail && detailSize === 'narrow' ? 'detail-narrow' : '',
    showDetail && detailSize === 'medium' ? 'detail-medium' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const modeSwitcher = hasModes ? (
    <div className="nx-control-group">
      <h2>Parent mode</h2>
      <div className="nx-mode-row">
        {parentModes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={`nx-mode-btn${parentMode === mode.id ? ' active' : ''}`}
            onClick={() => onParentModeChange?.(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  ) : null

  // Keep mode switcher reachable when the current mode has no nodes.
  if (!hasGraph) {
    return (
      <div className="nexus-graph-root">
        <div data-nx="app" className={appClassName || undefined}>
          <aside className="nx-sidebar">
            <div className="nx-control-group">
              <h1 className="nx-title">{title}</h1>
              <p className="nx-subtitle">{subtitle}</p>
            </div>
            {modeSwitcher}
          </aside>
          <main data-nx="canvas-wrap" className="nx-empty-wrap">
            <div className="nx-empty">
              <h2 className="text-lg font-semibold text-slate-900">{emptyTitle}</h2>
              <p className="max-w-md text-sm">{emptyDescription}</p>
              {hasModes && (
                <p className="max-w-md text-sm text-slate-500 mt-3">
                  Try another parent mode in the sidebar — this view only uses data for the
                  selected mode.
                </p>
              )}
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="nexus-graph-root">
      <div data-nx="loading" hidden={graphReady} aria-hidden={graphReady}>
        Loading graph…
      </div>

      <div data-nx="app" className={appClassName || undefined}>
        <aside className="nx-sidebar">
          <div className="nx-control-group">
            <h1 className="nx-title" data-nx="title">
              {title}
            </h1>
            <p className="nx-subtitle" data-nx="subtitle">
              {subtitle}
            </p>
            <div data-nx="meta-pills" />
            {showInfo && (
              <div className="nx-info-card mt-2" role="note">
                <div className="nx-info-card-head">
                  <strong>Interactions</strong>
                  <button
                    type="button"
                    className="nx-info-dismiss"
                    onClick={dismissInfo}
                    aria-label="Dismiss interactions info"
                    title="Dismiss"
                  >
                    ×
                  </button>
                </div>
                <p>
                  Drag a parent hub to pin it. Clusters and posts can be dragged, then snap back.
                  Scroll to zoom. Click for details.
                </p>
              </div>
            )}
          </div>

          {modeSwitcher}

          <div className="nx-control-group">
            <h2>Search</h2>
            <input type="search" data-nx="search" placeholder="Filter hubs or clusters…" />
          </div>

          <div className="nx-control-group">
            <h2>View</h2>
            <label className="nx-toggle-row">
              <span>Show labels</span>
              <input type="checkbox" className="nx-toggle" data-nx="show-labels" defaultChecked />
            </label>
            <label className="nx-toggle-row">
              <span>Show leaves</span>
              <input type="checkbox" className="nx-toggle" data-nx="show-leaves" defaultChecked />
            </label>
            <label className="nx-toggle-row">
              <span>Show violation colors</span>
              <input type="checkbox" className="nx-toggle" data-nx="show-colors" />
            </label>
            <button type="button" className="nx-btn mt-2" data-nx="load-leaves">
              Load / refresh leaves
            </button>
          </div>

          {extraSidebar}

          <div className="nx-control-group">
            <h2>Legend</h2>
            <div data-nx="legend" />
          </div>
        </aside>

        <main data-nx="canvas-wrap">
          <canvas data-nx="canvas" />
          <div className="nx-graph-controls">
            <span className="zoom-indicator" data-nx="zoom-percent">
              100%
            </span>
            <button type="button" data-nx="zoom-fit" title="Fit to view">
              Fit
            </button>
            <button type="button" data-nx="zoom-out" title="Zoom out">
              −
            </button>
            <button type="button" data-nx="zoom-in" title="Zoom in">
              +
            </button>
          </div>
          <div className="nx-graph-hint">
            Scroll to zoom · Drag parent to pin · Clusters and posts snap back
          </div>
        </main>

        {showDetail && (
          <aside className="nx-detail-panel" data-nx="detail-panel">
            {typeof detailPanel === 'function'
              ? detailPanel({ onClose: handleClear })
              : detailPanel}
          </aside>
        )}
      </div>
    </div>
  )
}

/** Strip simulation fields so React state stays JSON-safe and stable. */
function snapshotNode(node) {
  if (!node) return null
  return {
    id: node.id,
    type: node.type,
    label: node.label ?? null,
    parentId: node.parentId ?? null,
    familyId: node.familyId ?? null,
    count: node.count ?? 0,
    colorKey: node.colorKey ?? null,
    colorKeys: Array.isArray(node.colorKeys) ? [...node.colorKeys] : [],
    leafKind: node.leafKind ?? null,
    hubKind: node.hubKind ?? null,
    clusterKind: node.clusterKind ?? null,
    topicType: node.topicType ?? null,
    category: node.category ?? null,
    tier: node.tier ?? null,
    isPrimary: Boolean(node.isPrimary),
    imageUrl: node.imageUrl ?? null,
  }
}
