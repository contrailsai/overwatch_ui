'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { mountPoiTopicsGraph } from '@/lib/feeds/poi-topics-graph-engine'
import { TopicPostsPanel } from './TopicPostsPanel'
import './feeds-graph.css'

const LAYOUT_SLIDERS = [
  { key: 'poiRepel', min: 500, max: 10000, step: 100 },
  { key: 'topicRepel', min: 50, max: 800, step: 10 },
  { key: 'postRepel', min: 5, max: 100, step: 1 },
  { key: 'poiTopicAttract', min: 0.1, max: 1.5, step: 0.05 },
  { key: 'postTopicAttract', min: 0.05, max: 1, step: 0.05 },
  { key: 'collideStrength', min: 0.1, max: 1, step: 0.05 },
  { key: 'collisionScale', min: 0.4, max: 1.5, step: 0.05 },
  { key: 'repelDistanceMax', min: 100, max: 800, step: 20 },
  { key: 'gravity', min: 0, max: 0.15, step: 0.005 },
  { key: 'poiLinkBase', min: 8, max: 50, step: 1 },
  { key: 'poiLinkWeightBonus', min: 0, max: 30, step: 1 },
  { key: 'topicFanStep', min: 4, max: 30, step: 1 },
  { key: 'topicInitRadius', min: 6, max: 50, step: 1 },
  { key: 'postLinkDistance', min: 8, max: 60, step: 1 },
  { key: 'labelCharW', min: 2, max: 6, step: 0.1 },
  { key: 'topicLabelZoomPct', min: 80, max: 300, step: 5 },
]

export function FeedsGraphClient({
  graphData,
  feedCount = 0,
  project,
  clientDetails,
  projectEmails,
}) {
  const rootRef = useRef(null)
  const graphApiRef = useRef(null)
  const selectNodeRef = useRef(null)
  const [selectedTopic, setSelectedTopic] = useState(null)

  const handleSelectNode = useCallback((node) => {
    if (node?.type === 'topic') {
      setSelectedTopic(node)
    } else {
      setSelectedTopic(null)
    }
  }, [])

  selectNodeRef.current = handleSelectNode

  useEffect(() => {
    if (!rootRef.current || !graphData?.nodes?.length) return undefined

    graphApiRef.current?.destroy?.()
    graphApiRef.current = mountPoiTopicsGraph(rootRef.current, graphData, {
      onSelectNode: (node) => selectNodeRef.current?.(node),
    })

    return () => {
      graphApiRef.current?.destroy?.()
      graphApiRef.current = null
    }
  }, [graphData])

  const handleCloseTopicPanel = useCallback(() => {
    setSelectedTopic(null)
    graphApiRef.current?.clearSelection?.()
  }, [])

  if (!graphData?.nodes?.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-900">No graph data yet</h2>
        <p className="max-w-md text-sm text-slate-500">
          Topics and POIs will appear here once they exist in your project database.
        </p>
        {feedCount > 0 && (
          <Link href="/feeds/collections" className="text-sm font-semibold text-blue-600 hover:underline">
            Browse {feedCount} feed {feedCount === 1 ? 'collection' : 'collections'}
          </Link>
        )}
      </div>
    )
  }

  return (
    <div ref={rootRef} className="feeds-graph-root">
      <div data-fg="loading">Loading graph…</div>

      <div className="feeds-graph-app" data-fg="app">
        <aside className="sidebar">
          <div className="control-group">
            <h2>Overview</h2>
            <div data-fg="meta-pills" />
            <div className="info-box mt-3" data-fg="info-box" />
          </div>

          <div className="control-group">
            <h2>Search</h2>
            <input type="search" data-fg="search" placeholder="Filter POIs or topics…" />
          </div>

          <div className="control-group" data-fg="poi-controls">
            <h2>POI configuration</h2>
            <div className="poi-config">
              <div className="poi-config-header">
                <span>Selected (visible on graph)</span>
                <button type="button" className="poi-select-all" data-fg="select-all-primary-pois">
                  All primary
                </button>
              </div>
              <div className="poi-list poi-list-tall" data-fg="selected-poi-list" />
            </div>
            <div className="poi-config" style={{ marginTop: 10 }}>
              <div className="poi-config-header">Primary POIs (org)</div>
              <div className="poi-list" data-fg="primary-poi-list" />
            </div>
            <div className="poi-config" style={{ marginTop: 10 }}>
              <div className="poi-config-header">Secondary POIs (discovered)</div>
              <div className="poi-list" data-fg="secondary-poi-list" />
            </div>
            <p className="config-note">
              Reassign POIs between tiers. Selection saved in this browser.
            </p>
          </div>

          <div className="control-group">
            <h2>View</h2>
            <label className="checkbox-row">
              <input type="checkbox" data-fg="show-labels" defaultChecked />
              Show labels
            </label>
          </div>

          <div className="control-group">
            <h2>Legend</h2>
            <div data-fg="legend" />
          </div>
        </aside>

        <main data-fg="canvas-wrap">
          <canvas data-fg="canvas" />
          <button type="button" className="layout-tuning-toggle" data-fg="layout-tuning-toggle" title="Layout tuning">
            ⚙
          </button>
          <div className="layout-tuning-panel hidden" data-fg="layout-tuning-panel">
            <h3>Layout tuning</h3>
            {LAYOUT_SLIDERS.map(({ key, min, max, step }) => (
              <label key={key}>
                <span>{key}</span>
                <span className="val" data-for={key} />
                <input type="range" data-fg={`lt-${key}`} id={`lt-${key}`} min={min} max={max} step={step} />
              </label>
            ))}
            <div className="layout-tuning-actions">
              <button type="button" data-fg="layout-tuning-reset">Reset</button>
              <button type="button" className="primary" data-fg="layout-tuning-restart">Restart</button>
            </div>
          </div>
          <div className="graph-controls">
            <span>Drag POI · click details</span>
            <span className="zoom-indicator" data-fg="zoom-percent" title="Zoom relative to Fit (100%)">
              100%
            </span>
            <button type="button" className="fit-btn" data-fg="zoom-fit" title="Fit to view (100%)">
              Fit
            </button>
            <button type="button" data-fg="zoom-out" title="Zoom out">
              −
            </button>
            <button type="button" data-fg="zoom-in" title="Zoom in">
              +
            </button>
          </div>
          <div className="graph-hint" data-fg="graph-hint">
            Scroll to zoom · Drag to pan · Click node for details
          </div>
        </main>

        <aside className="detail-panel" data-fg="detail-panel">
          {selectedTopic && (
            <TopicPostsPanel
              topic={selectedTopic}
              onClose={handleCloseTopicPanel}
              project={project}
              clientDetails={clientDetails}
              projectEmails={projectEmails}
            />
          )}
          <div data-fg="detail-panel-engine" />
        </aside>
      </div>
    </div>
  )
}
