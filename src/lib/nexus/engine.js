/**
 * Nexus Canvas + D3 force engine.
 *
 * Structural nodes (hub + cluster) participate in the force simulation.
 * Leaves are hex-packed around their parent and track via local coords + lerp.
 */

import * as d3 from 'd3'
import {
  BLAND_GREY,
  COLORS,
  FAMILY_PALETTE,
  UNKNOWN_COLOR_KEY,
  darkenHex,
  hexToRgba,
  orderColorKeys,
  violationColor,
  violationColorDistinct,
} from './colors'
import { buildHexSlots, estimateCloudRadius } from './hex-pack'
import {
  forceForeignClusterRepel,
  forceHubAttract,
  forceLiveCollide,
  forceLiveRepel,
} from './force-utils'
import { NODE_TYPES, DEFAULT_LEAF_CAP_PER_PARENT } from './constants'

const HUB_R = 22
const CLUSTER_R = 10
const PRIMARY_CLUSTER_R = 18
const IMAGE_CLUSTER_R = 20
const IMAGE_PRIMARY_CLUSTER_R = 24
const LEAF_R = 3
const LEAF_ORBIT_GAP = 0.7
const LEAF_PACK_GAP = 0.45
const PARENT_LINK_GAP = 6
/** Hub edge → child center. Parent-topic topics never sit on the parent disk. */
const PARENT_MIN_CLEARANCE = 72
const PARENT_FAN_STAGGER_CAP = 480
const REPEL_HOLD_TICKS = 8
const REPEL_RAMP_TICKS = 36
const CLUSTER_PACK_PAD = 36
/** Gap between parent family auras in the seed grid. Close, but not overlapping. */
const HUB_SEED_GAP = 40
const POST_LERP = 0.24
const POST_LERP_EPSILON = 0.04
const LABEL_ZOOM_MULT = 2.4
const GRID_SPACING = 48
const FAMILY_AURA_ALPHA = 0.11
const STORAGE_KEY = 'overwatch-nexus-settings'

const DEFAULT_SETTINGS = {
  hubSize: HUB_R,
  clusterSize: CLUSTER_R,
  leafSize: LEAF_R,
  showLeaves: true,
  showLabels: true,
  showEmptyHubs: true,
  showEmptyClusters: true,
  showAllColors: false,
  colorVisibility: {},
}

function truncateLabel(text, maxChars) {
  if (!text) return ''
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars - 1)}…`
}

function traceRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius)
    return
  }
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/** Translucent white pill so parent titles stay readable on family auras. */
function drawTitleBadge(ctx, text, x, baselineY, fontPx, alpha, zoom) {
  ctx.save()
  ctx.globalAlpha = Math.max(0.35, Math.min(1, alpha))
  ctx.font = `700 ${fontPx}px Inter, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const width = ctx.measureText(text).width
  const padX = fontPx * 0.5
  const padY = fontPx * 0.28
  const boxH = fontPx * 1.2
  const top = baselineY - fontPx * 0.88 - padY
  const left = x - width / 2 - padX
  const k = zoom || 1
  traceRoundRect(ctx, left, top, width + padX * 2, boxH + padY * 2, Math.min(fontPx * 0.36, 7 / k))
  ctx.fillStyle = 'rgba(255, 255, 255, 0.86)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.14)'
  ctx.lineWidth = 1 / k
  ctx.stroke()
  ctx.fillStyle = COLORS.text
  ctx.fillText(text, x, baselineY)
  ctx.restore()
}

/** Pointy-top hex path aligned with the hex lattice (odd-row offset). */
function drawHexPath(ctx, x, y, r) {
  ctx.moveTo(x, y - r)
  for (let i = 1; i < 6; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 3
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r)
  }
  ctx.closePath()
}

/** Center-crop image into a square destination (CSS object-fit: cover). */
function drawImageCover(ctx, img, dx, dy, size) {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih) return
  const scale = Math.max(size / iw, size / ih)
  const sw = size / scale
  const sh = size / scale
  const sx = (iw - sw) / 2
  const sy = (ih - sh) / 2
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, size, size)
}

function pointerToGraph(event, canvas, transform) {
  const rect = canvas.getBoundingClientRect()
  const sx = event.clientX - rect.left
  const sy = event.clientY - rect.top
  return [(sx - transform.x) / transform.k, (sy - transform.y) / transform.k]
}

/**
 * @param {HTMLElement} container - element with [data-nx] chrome hooks
 * @param {object} graph - canonical nexus graph
 * @param {object} options
 */
export function mountNexus(container, graph, options = {}) {
  const noop = { destroy() {}, clearSelection() {}, setLeaves() {}, getSettings() { return {} } }
  if (!container || !graph?.nodes?.length) return noop

  const {
    onSelectNode = null,
    onNeedLeaves = null,
    title = 'Nexus',
    subtitle = '',
    violationLabels = null,
    defaultShowColors = false,
  } = options

  const nx = (name) => container.querySelector(`[data-nx="${name}"]`)

  const state = {
    nodes: [],
    links: [],
    byId: new Map(),
    hubs: [],
    clusters: [],
    leaves: [],
    structuralNodes: [],
    structuralLinks: [],
    leavesByParent: new Map(),
    clustersByHub: new Map(),
    transform: d3.zoomIdentity,
    baselineZoom: 1,
    width: 0,
    height: 0,
    dpr: 1,
    selectedId: null,
    hoveredId: null,
    highlightColorKey: null,
    neighborhoodIds: null,
    simulation: null,
    settled: false,
    leavesAnimating: false,
    renderFrame: null,
    draggingNode: null,
    dragActive: false,
    pointerDown: null,
    returningIds: new Set(),
    repelArmed: false,
    repelTick: 0,
    parentRepelScale: 0.05,
    repelTimer: null,
    searchQuery: '',
    leavesLoaded: false,
    colorKeys: [],
    imageCache: new Map(),
  }

  const storedSettings = loadSettings()
  let settings = { ...storedSettings }
  if (defaultShowColors) settings.showAllColors = true
  let colorsTouched = !defaultShowColors
  let canvas = nx('canvas')
  let ctx = canvas?.getContext('2d')
  let zoomBehavior = null
  let resizeObserver = null
  let destroyed = false

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    } catch {
      /* ignore */
    }
    return { ...DEFAULT_SETTINGS }
  }

  function saveSettings() {
    try {
      const toSave = colorsTouched
        ? settings
        : { ...settings, showAllColors: storedSettings.showAllColors }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch {
      /* ignore */
    }
  }

  function hubR() {
    return settings.hubSize
  }
  function clusterR() {
    return settings.clusterSize
  }
  function leafR() {
    return settings.leafSize
  }

  function clusterRadiusFor(n) {
    const hasImage = Boolean(n?.imageUrl)
    if (hasImage) {
      if (n?.baseRadius) return Math.max(n.baseRadius, IMAGE_PRIMARY_CLUSTER_R)
      if (n?.isPrimary || n?.tier === 'primary') {
        return Math.max(settings.clusterSize, IMAGE_PRIMARY_CLUSTER_R)
      }
      return Math.max(settings.clusterSize, IMAGE_CLUSTER_R)
    }
    if (n?.baseRadius) return n.baseRadius
    if (n?.isPrimary || n?.tier === 'primary') {
      return Math.max(settings.clusterSize, PRIMARY_CLUSTER_R)
    }
    return settings.clusterSize
  }

  function preloadNodeImage(url) {
    if (!url || typeof Image === 'undefined') return
    if (state.imageCache.has(url)) return
    const img = new Image()
    // Omit crossOrigin — signed S3 URLs often lack CORS; we only draw to canvas (no export).
    img.decoding = 'async'
    img.onload = () => requestRender()
    img.onerror = () => {
      state.imageCache.set(url, null)
    }
    state.imageCache.set(url, img)
    img.src = url
  }

  /** Per-child spring target: hub body + gap + that child's packed cloud. */
  function hubLinkDistance(hub, child) {
    const childR = child.collisionRadius || child.radius || clusterR()
    return (hub.radius || hubR()) + PARENT_LINK_GAP + childR
  }

  /** Variable cloud orbit, never closer than PARENT_MIN_CLEARANCE from the hub edge. */
  function parentTopicBaseRadius(hub, child) {
    const floor = (hub.radius || hubR()) + PARENT_MIN_CLEARANCE
    return Math.max(hubLinkDistance(hub, child), floor)
  }

  function hashUnit(id) {
    let h = 2166136261
    const s = String(id)
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return (h >>> 0) / 4294967295
  }

  function angleDelta(a, b) {
    let d = Math.abs(a - b) % (Math.PI * 2)
    if (d > Math.PI) d = Math.PI * 2 - d
    return d
  }

  /** 0 = open canvas, 1 = this spoke is aimed at another parent. */
  function facingHubPressure(hub, angle) {
    if (!Number.isFinite(hub.x) || !Number.isFinite(hub.y) || !Number.isFinite(angle)) return 0
    let pressure = 0
    for (const other of state.hubs) {
      if (other === hub || isExcluded(other)) continue
      if (!Number.isFinite(other.x) || !Number.isFinite(other.y)) continue
      const dx = other.x - hub.x
      const dy = other.y - hub.y
      const dist = Math.hypot(dx, dy)
      if (dist < 8) continue
      const delta = angleDelta(angle, Math.atan2(dy, dx))
      const cone = 0.9
      if (delta >= cone) continue
      const aim = 1 - delta / cone
      const near = Math.min(1, 320 / dist)
      pressure = Math.max(pressure, aim * (0.4 + 0.6 * near))
    }
    return pressure
  }

  /**
   * Keep the equal-angle fan, but mix spoke length so the family is not a ring.
   * Larger clouds sit farther out; spokes aimed at another parent tuck in so the
   * gap between parents is usable; a stable offset keeps equal siblings off one circle.
   */
  function mixedTopicOrbit(hub, child, siblings) {
    const link = hubLinkDistance(hub, child)
    const preferred = parentTopicBaseRadius(hub, child)
    const size = child.collisionRadius || child.radius || 10
    const count = child.count || 0
    let maxSize = 10
    let maxCount = 1
    for (const s of siblings) {
      maxSize = Math.max(maxSize, s.collisionRadius || s.radius || 10)
      maxCount = Math.max(maxCount, s.count || 0)
    }
    const sizeT = size / maxSize
    const countT = count / maxCount
    const noise = hashUnit(child.id)
    const pressure = facingHubPressure(hub, child.slotAngle)
    const weight = Math.min(
      1,
      Math.max(0.08, 0.28 + 0.42 * sizeT + 0.22 * countT + 0.16 * noise - 0.46 * pressure)
    )
    const inner = Math.max(link + 8, (hub.radius || hubR()) + 36, preferred * 0.56)
    const outer = preferred + 12 + 36 * Math.max(sizeT, countT)
    return inner + (outer - inner) * weight
  }

  /** Smooth blob around mixed spokes — dips between topics instead of a disk. */
  function traceFamilyAura(ctx, hub) {
    const kids = (state.clustersByHub.get(hub.id) || []).filter(
      (c) => !isExcluded(c) && Number.isFinite(c.slotAngle)
    )
    const minR = (hub.radius || hubR()) * 2.6
    if (!kids.length) {
      ctx.beginPath()
      ctx.arc(hub.x, hub.y, hub.clusterExtent || minR, 0, Math.PI * 2)
      return
    }
    const samples = 72
    const half = Math.PI / Math.max(kids.length, 3)
    ctx.beginPath()
    for (let i = 0; i <= samples; i += 1) {
      const a = (i / samples) * Math.PI * 2 - Math.PI / 2
      let r = minR
      for (const c of kids) {
        const d = angleDelta(a, c.slotAngle)
        const t = Math.max(0, 1 - d / (half * 1.45))
        const smooth = t * t * (3 - 2 * t)
        const reach = (c.orbitFloor || parentTopicBaseRadius(hub, c)) + (c.collisionRadius || c.radius || 10) * 0.45 + 16
        const bulge = minR + Math.max(0, reach - minR) * smooth
        if (bulge > r) r = bulge
      }
      const x = hub.x + Math.cos(a) * r
      const y = hub.y + Math.sin(a) * r
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }

  function chordDistance(r1, r2, angle) {
    return Math.hypot(r1 - r2 * Math.cos(angle), r2 * Math.sin(angle))
  }

  /** Smallest radius that clears a neighbor sitting at otherR, separated by angle. */
  function radiusToClear(otherR, angle, need) {
    const perp = Math.abs(otherR * Math.sin(angle))
    if (perp >= need - 0.5) return 0
    const along = Math.sqrt(Math.max(0, need * need - perp * perp))
    return otherR * Math.cos(angle) + along
  }

  function shouldPushSecond(a, b, index) {
    const ra = a.collisionRadius || a.radius || 0
    const rb = b.collisionRadius || b.radius || 0
    if (rb > ra + 1) return true
    if (ra > rb + 1) return false
    return index % 2 === 0
  }

  /**
   * Equal-angle slots for every hub's children (topics, POIs, profiles).
   * Spoke length is mixed (size, post count, neighbor parents) so the fan
   * is not a uniform circle, plus stagger when neighbors would overlap.
   */
  function assignParentTopicSlots() {
    for (const hub of state.hubs) {
      const allKids = state.clustersByHub.get(hub.id) || []
      for (const c of allKids) {
        c.slotAngle = null
        c.orbitFloor = null
        c.orbitExtra = 0
      }
      const kids = allKids
        .filter((c) => !isExcluded(c))
        .slice()
        .sort(
          (a, b) =>
            (b.count || 0) - (a.count || 0) || String(a.id).localeCompare(String(b.id))
        )
      const n = kids.length
      if (!n) continue
      const angleStep = (Math.PI * 2) / n
      for (let i = 0; i < n; i += 1) {
        const c = kids[i]
        c.slotAngle = i * angleStep - Math.PI / 2
        c.orbitBase = mixedTopicOrbit(hub, c, kids)
        c.orbitExtra = 0
      }
      if (n >= 2) {
        const passes = Math.min(n, 8)
        for (let pass = 0; pass < passes; pass += 1) {
          let moved = false
          for (let i = 0; i < n; i += 1) {
            const a = kids[i]
            const b = kids[(i + 1) % n]
            const rA = a.orbitBase + a.orbitExtra
            const rB = b.orbitBase + b.orbitExtra
            const need =
              (a.collisionRadius || a.radius || 10) +
              (b.collisionRadius || b.radius || 10) +
              10
            if (chordDistance(rA, rB, angleStep) >= need) continue
            const pushB = shouldPushSecond(a, b, i)
            const mover = pushB ? b : a
            const otherR = pushB ? rA : rB
            const solved = radiusToClear(otherR, angleStep, need)
            if (!Number.isFinite(solved)) continue
            const extra = Math.min(PARENT_FAN_STAGGER_CAP, Math.max(0, solved - mover.orbitBase))
            if (extra > mover.orbitExtra + 0.5) {
              mover.orbitExtra = extra
              moved = true
            }
          }
          if (!moved) break
        }
      }
      for (const c of kids) {
        c.orbitFloor = c.orbitBase + (c.orbitExtra || 0)
      }
    }
  }

  /**
   * Hard-lock children onto equal angles and their variable orbit.
   * Collision cannot bunch them on one side of the parent.
   */
  function projectParentTopicFans() {
    for (const hub of state.hubs) {
      if (!Number.isFinite(hub.x) || !Number.isFinite(hub.y)) continue
      if (state.draggingNode?.id === hub.id) continue
      const kids = state.clustersByHub.get(hub.id) || []
      for (const c of kids) {
        if (!Number.isFinite(c.slotAngle) || c.fx != null) continue
        const dist = c.orbitFloor || parentTopicBaseRadius(hub, c)
        const ux = Math.cos(c.slotAngle)
        const uy = Math.sin(c.slotAngle)
        c.x = hub.x + ux * dist
        c.y = hub.y + uy * dist
        c.vx = 0
        c.vy = 0
      }
    }
  }

  function effectiveChildOrbit(hub, child) {
    if (Number.isFinite(child.orbitFloor)) return child.orbitFloor
    if ((state.clustersByHub.get(hub.id) || []).length) return parentTopicBaseRadius(hub, child)
    return hubLinkDistance(hub, child)
  }

  function hubPackRadius(h) {
    return Math.max(h.radius || hubR(), h.collisionRadius || h.clusterExtent || h.radius || hubR())
  }

  /**
   * Pack parent hubs into a compact grid of cells.
   * A ring leaves the center empty and throws families too far apart to read.
   * Each cell is the family's aura plus a small gap; row/column tracks take the
   * largest cell in that track so neighbors stay close without overlapping.
   */
  function placeHubsOnGrid(hubs, cx, cy) {
    const free = hubs.filter((h) => !h.userPinned)
    const n = free.length
    if (!n) return
    if (n === 1) {
      free[0].x = cx
      free[0].y = cy
      free[0].vx = 0
      free[0].vy = 0
      free[0].fx = null
      free[0].fy = null
      return
    }

    // Freeze cell order so a later re-seat (leaves growing the auras) expands
    // spacing instead of shuffling parents into different cells.
    let nextIndex = 0
    for (const h of free) {
      if (Number.isFinite(h.gridIndex)) nextIndex = Math.max(nextIndex, h.gridIndex + 1)
    }
    for (const h of free) {
      if (!Number.isFinite(h.gridIndex)) h.gridIndex = nextIndex++
    }
    free.sort((a, b) => a.gridIndex - b.gridIndex || String(a.id).localeCompare(String(b.id)))

    const aspect = state.width > 80 && state.height > 80 ? state.width / state.height : 1.4
    const cols = Math.max(1, Math.round(Math.sqrt(n * aspect)))
    const rows = Math.ceil(n / cols)
    const gap = HUB_SEED_GAP

    const colW = Array(cols).fill(0)
    const rowH = Array(rows).fill(0)
    const slots = free.map((h, i) => {
      const row = Math.floor(i / cols)
      const colInRow = i % cols
      const rowCount = Math.min(cols, n - row * cols)
      const col = colInRow + Math.floor((cols - rowCount) / 2)
      const cell = hubPackRadius(h) * 2 + gap
      colW[col] = Math.max(colW[col], cell)
      rowH[row] = Math.max(rowH[row], cell)
      return { h, row, col }
    })

    const colX = [0]
    const rowY = [0]
    for (let c = 0; c < cols; c += 1) colX.push(colX[c] + colW[c])
    for (let r = 0; r < rows; r += 1) rowY.push(rowY[r] + rowH[r])
    const originX = cx - colX[cols] / 2
    const originY = cy - rowY[rows] / 2

    for (const { h, row, col } of slots) {
      h.x = originX + colX[col] + colW[col] / 2
      h.y = originY + rowY[row] + rowH[row] / 2
      h.vx = 0
      h.vy = 0
      h.fx = null
      h.fy = null
    }
  }

  /** Family aura / hub–hub collide: farthest child cloud from hub center. */
  function hubClusterExtent(hub, children) {
    if (!children.length) return (hub.radius || hubR()) * 3
    let outer = hub.radius || hubR()
    for (const c of children) {
      const childR = c.collisionRadius || c.radius || clusterR()
      outer = Math.max(outer, effectiveChildOrbit(hub, c) + childR)
    }
    return outer + CLUSTER_PACK_PAD
  }

  function estimatedLeafCount(n) {
    const loaded = (state.leavesByParent.get(n.id) || []).filter(isLeafVisible).length
    if (loaded > 0) return loaded
    if (!settings.showLeaves || state.leavesLoaded) return loaded
    const count = Number(n.count) || 0
    if (count <= 0) return 0
    return Math.min(count, DEFAULT_LEAF_CAP_PER_PARENT)
  }

  function ingestGraph(data, { replaceLeaves = true } = {}) {
    const nodes = (data.nodes || []).map((n) => ({
      ...n,
      id: String(n.id),
      type: n.type,
      label: n.label || String(n.id),
      parentId: n.parentId != null ? String(n.parentId) : null,
      familyId: n.familyId != null ? String(n.familyId) : String(n.id),
      radius:
        n.type === NODE_TYPES.HUB
          ? hubR()
          : n.type === NODE_TYPES.CLUSTER
            ? clusterRadiusFor(n)
            : leafR(),
      localX: 0,
      localY: 0,
      targetLocalX: 0,
      targetLocalY: 0,
      count: n.count ?? 0,
      cloudRadius: null,
      familyColor: n.familyColor || null,
      isPrimary: Boolean(n.isPrimary || n.tier === 'primary'),
      imageUrl: n.imageUrl || null,
      baseRadius: n.baseRadius || null,
    }))

    for (const n of nodes) {
      if (n.imageUrl) preloadNodeImage(n.imageUrl)
    }

    const byId = new Map(nodes.map((n) => [n.id, n]))
    const links = (data.links || [])
      .map((l) => ({
        source: String(typeof l.source === 'object' ? l.source.id : l.source),
        target: String(typeof l.target === 'object' ? l.target.id : l.target),
        type: l.type || 'hub_cluster',
      }))
      .filter((l) => byId.has(l.source) && byId.has(l.target) && l.source !== l.target)

    // Infer parent links for clusters without parentId
    for (const l of links) {
      if (l.type === 'hub_cluster') {
        const cluster = byId.get(l.target)
        const hub = byId.get(l.source)
        if (cluster?.type === NODE_TYPES.CLUSTER && hub?.type === NODE_TYPES.HUB) {
          if (!cluster.parentId) cluster.parentId = hub.id
          if (!cluster.familyId) cluster.familyId = hub.id
        } else if (hub?.type === NODE_TYPES.CLUSTER && cluster?.type === NODE_TYPES.HUB) {
          if (!hub.parentId) hub.parentId = cluster.id
          if (!hub.familyId) hub.familyId = cluster.id
        }
      }
    }

    const hubs = nodes.filter((n) => n.type === NODE_TYPES.HUB)
    hubs.forEach((h, i) => {
      if (!h.familyColor) h.familyColor = FAMILY_PALETTE[i % FAMILY_PALETTE.length]
      h.color = h.familyColor
      h.strokeColor = darkenHex(h.familyColor, 0.28)
    })
    const colorByFamily = new Map(hubs.map((h) => [h.familyId || h.id, h.familyColor]))

    for (const n of nodes) {
      if (n.type === NODE_TYPES.CLUSTER) {
        const fc = colorByFamily.get(n.familyId) || n.familyColor || FAMILY_PALETTE[0]
        n.familyColor = fc
        n.color = fc
        n.strokeColor = darkenHex(fc, 0.2)
      } else if (n.type === NODE_TYPES.LEAF) {
        const parent = n.parentId ? byId.get(n.parentId) : null
        n.familyColor = parent?.familyColor || COLORS.leafFallback
        n.color = COLORS.leafFallback
      }
    }

    state.nodes = nodes
    state.links = links
    state.byId = byId
    state.hubs = hubs
    state.clusters = nodes.filter((n) => n.type === NODE_TYPES.CLUSTER)
    state.leaves = replaceLeaves ? nodes.filter((n) => n.type === NODE_TYPES.LEAF) : state.leaves
    if (replaceLeaves) {
      state.leaves = nodes.filter((n) => n.type === NODE_TYPES.LEAF)
    }
    state.structuralNodes = [...state.hubs, ...state.clusters]
    state.structuralLinks = links.filter(
      (l) =>
        l.type === 'hub_cluster' ||
        l.type === 'cluster_parent' ||
        (byId.get(l.source)?.type !== NODE_TYPES.LEAF && byId.get(l.target)?.type !== NODE_TYPES.LEAF)
    )

    state.clustersByHub = new Map()
    for (const c of state.clusters) {
      if (!c.parentId) continue
      if (!state.clustersByHub.has(c.parentId)) state.clustersByHub.set(c.parentId, [])
      state.clustersByHub.get(c.parentId).push(c)
    }

    state.leavesByParent = new Map()
    for (const leaf of state.leaves) {
      if (!leaf.parentId) continue
      if (!state.leavesByParent.has(leaf.parentId)) state.leavesByParent.set(leaf.parentId, [])
      state.leavesByParent.get(leaf.parentId).push(leaf)
    }

    state.colorKeys = data.colorAxis?.keys || []
    if (!state.colorKeys.length) {
      const set = new Set()
      for (const leaf of state.leaves) {
        if (leaf.colorKey && leaf.colorKey !== UNKNOWN_COLOR_KEY) set.add(leaf.colorKey)
        for (const k of leaf.colorKeys || []) if (k) set.add(k)
      }
      state.colorKeys = orderColorKeys([...set], violationLabels)
    }

    // Default color visibility: all known keys on
    for (const key of state.colorKeys) {
      if (settings.colorVisibility[key] === undefined) settings.colorVisibility[key] = true
    }

    applyRadii()
  }

  function leafParentIds() {
    // Topic trees: leaves hang under clusters. Flat ads/profiles: under hubs.
    if (state.clusters.length) return state.clusters.map((c) => c.id)
    return state.hubs.map((h) => h.id)
  }

  function applyRadii() {
    for (const n of state.hubs) n.radius = hubR()
    for (const n of state.clusters) {
      n.radius = clusterRadiusFor(n)
      const leafCount = estimatedLeafCount(n)
      n.cloudRadius = estimateCloudRadius(leafCount, n.radius, leafR(), LEAF_ORBIT_GAP, LEAF_PACK_GAP)
      n.collisionRadius = Math.max(n.radius, n.cloudRadius || n.radius)
    }
    for (const n of state.leaves) n.radius = leafR()
    assignParentTopicSlots()
    for (const h of state.hubs) {
      const children = state.clustersByHub.get(h.id) || []
      const directLeaves = settings.showLeaves
        ? (state.leavesByParent.get(h.id) || []).filter(isLeafVisible).length
        : 0
      if (children.length) {
        const extent = hubClusterExtent(h, children)
        h.clusterExtent = extent
        h.collisionRadius = extent
        h.cloudRadius = null
      } else {
        // Flat hub→leaf: pack cloud around the hub itself
        const leafCount =
          directLeaves > 0
            ? directLeaves
            : !state.leavesLoaded && settings.showLeaves
              ? Math.min(Number(h.count) || 0, DEFAULT_LEAF_CAP_PER_PARENT)
              : 0
        h.cloudRadius = estimateCloudRadius(leafCount, h.radius, leafR(), LEAF_ORBIT_GAP, LEAF_PACK_GAP)
        h.collisionRadius = Math.max(h.radius, h.cloudRadius || h.radius)
        h.clusterExtent = h.collisionRadius
      }
    }
  }

  function isLeafVisible(leaf) {
    if (!settings.showLeaves) return false
    if (state.highlightColorKey) {
      const keys = leaf.colorKeys?.length ? leaf.colorKeys : [leaf.colorKey]
      if (!keys.includes(state.highlightColorKey)) return false
    }
    const key = leaf.colorKey || UNKNOWN_COLOR_KEY
    if (key !== UNKNOWN_COLOR_KEY && settings.colorVisibility[key] === false) return false
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase()
      if (!String(leaf.label || leaf.id).toLowerCase().includes(q)) return false
    }
    return true
  }

  function isExcluded(n) {
    if (!n) return true
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase()
      if (n.type === NODE_TYPES.HUB || n.type === NODE_TYPES.CLUSTER) {
        const selfMatch = String(n.label || n.id).toLowerCase().includes(q)
        if (n.type === NODE_TYPES.HUB) {
          const kids = state.clustersByHub.get(n.id) || []
          if (!selfMatch && !kids.some((c) => String(c.label || c.id).toLowerCase().includes(q))) {
            return true
          }
        } else if (!selfMatch) {
          return true
        }
      }
    }
    if (n.type === NODE_TYPES.HUB) {
      if (settings.showEmptyHubs) return false
      const kids = state.clustersByHub.get(n.id) || []
      const directLeaves = state.leavesByParent.get(n.id) || []
      // Flat graphs: hub with count or leaves is not empty
      if (kids.length === 0 && (n.count > 0 || directLeaves.length > 0)) return false
      return kids.length === 0 && directLeaves.length === 0 && !(n.count > 0)
    }
    if (n.type === NODE_TYPES.CLUSTER) {
      if (!settings.showEmptyClusters && (n.count || 0) === 0 && !(state.leavesByParent.get(n.id) || []).length) {
        return true
      }
      if (n.parentId) {
        const parent = state.byId.get(n.parentId)
        if (parent && isExcluded(parent)) return true
      }
      return false
    }
    if (n.type === NODE_TYPES.LEAF) {
      if (!isLeafVisible(n)) return true
      if (n.parentId) {
        const parent = state.byId.get(n.parentId)
        if (parent && isExcluded(parent)) return true
      }
      return false
    }
    return false
  }

  function activeStructuralNodes() {
    return state.structuralNodes.filter((n) => !isExcluded(n))
  }

  function seedPositions() {
    const cx = state.width / 2 || 400
    const cy = state.height / 2 || 300
    const hubs = state.hubs.filter((n) => !isExcluded(n))
    hubs.sort((a, b) => (b.clusterExtent || 0) - (a.clusterExtent || 0))

    // Compact grid: close enough to read, cells sized so family auras do not overlap.
    placeHubsOnGrid(hubs, cx, cy)
    assignParentTopicSlots()
    projectParentTopicFans()

    // Orphan clusters (no hub)
    const orphans = state.clusters.filter((c) => !c.parentId && !isExcluded(c) && !Number.isFinite(c.x))
    orphans.forEach((c, i) => {
      const angle = i * 2.4
      c.x = cx + Math.cos(angle) * (200 + i * 20)
      c.y = cy + Math.sin(angle) * (200 + i * 20)
    })
  }

  function placeLeavesAroundParent(parent, group, { immediate = false } = {}) {
    const visible = group.filter(isLeafVisible)
    if (!visible.length) {
      parent.cloudRadius = parent.radius
      return
    }

    // Bucket by color key for wedge packing
    const buckets = new Map()
    for (const leaf of visible) {
      const key = leaf.colorKey || UNKNOWN_COLOR_KEY
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(leaf)
    }
    const order = [...state.colorKeys, UNKNOWN_COLOR_KEY].filter((k) => buckets.has(k))
    for (const k of buckets.keys()) {
      if (!order.includes(k)) order.push(k)
    }

    const slots = buildHexSlots({
      count: visible.length,
      bodyR: parent.radius,
      leafR: leafR(),
      orbitGap: LEAF_ORBIT_GAP,
      gap: LEAF_PACK_GAP,
    })

    let slotIndex = 0
    for (const key of order) {
      for (const leaf of buckets.get(key) || []) {
        const slot = slots[slotIndex++]
        if (!slot) break
        leaf.targetLocalX = slot.x
        leaf.targetLocalY = slot.y
        if (immediate || !Number.isFinite(leaf.localX)) {
          leaf.localX = leaf.targetLocalX
          leaf.localY = leaf.targetLocalY
        } else if (
          Math.abs(leaf.targetLocalX - leaf.localX) > POST_LERP_EPSILON ||
          Math.abs(leaf.targetLocalY - leaf.localY) > POST_LERP_EPSILON
        ) {
          state.leavesAnimating = true
        }
        leaf.x = parent.x + leaf.localX
        leaf.y = parent.y + leaf.localY
      }
    }

    parent.cloudRadius =
      (slots.length ? Math.max(...slots.map((s) => s.dist)) : parent.radius) + leafR()
    parent.collisionRadius = Math.max(parent.radius, parent.cloudRadius)
  }

  function layoutAllLeafPacks({ immediate = false } = {}) {
    for (const [parentId, leaves] of state.leavesByParent) {
      const parent = state.byId.get(parentId)
      if (!parent || isExcluded(parent) || !Number.isFinite(parent.x)) continue
      placeLeavesAroundParent(parent, leaves, { immediate })
    }
    syncWorldPositions()
    if (state.leavesAnimating) requestRender()
  }

  function syncWorldPositions(advance = false) {
    let animating = false
    for (const [parentId, leaves] of state.leavesByParent) {
      const parent = state.byId.get(parentId)
      if (!parent || !Number.isFinite(parent.x)) continue
      for (const leaf of leaves) {
        const dragging = state.draggingNode?.id === leaf.id
        if (advance && !dragging) {
          const dx = (leaf.targetLocalX ?? leaf.localX ?? 0) - (leaf.localX ?? 0)
          const dy = (leaf.targetLocalY ?? leaf.localY ?? 0) - (leaf.localY ?? 0)
          if (Math.abs(dx) > POST_LERP_EPSILON || Math.abs(dy) > POST_LERP_EPSILON) {
            leaf.localX = (leaf.localX ?? 0) + dx * POST_LERP
            leaf.localY = (leaf.localY ?? 0) + dy * POST_LERP
            animating = true
          } else {
            leaf.localX = leaf.targetLocalX ?? leaf.localX ?? 0
            leaf.localY = leaf.targetLocalY ?? leaf.localY ?? 0
          }
        }
        if (!dragging) {
          leaf.x = parent.x + (leaf.localX || 0)
          leaf.y = parent.y + (leaf.localY || 0)
        }
      }
    }
    if (advance) state.leavesAnimating = animating
    return advance ? animating : state.leavesAnimating
  }

  function parentRepelScale() {
    const s = state.parentRepelScale || 0
    // Stay at zero during the opening hold so the clump is actually visible.
    return s < 0.16 ? 0 : s
  }

  function advanceRepelScale() {
    const tick = (state.repelTick || 0) + 1
    state.repelTick = tick
    if (tick <= REPEL_HOLD_TICKS) {
      state.parentRepelScale = 0.02
      return
    }
    const t = Math.min(1, (tick - REPEL_HOLD_TICKS) / REPEL_RAMP_TICKS)
    const eased = t * t * (3 - 2 * t)
    state.parentRepelScale = 0.02 + 0.98 * eased
  }

  function releaseLayoutPins() {
    for (const n of state.structuralNodes) {
      if (n.type === NODE_TYPES.HUB && n.userPinned) continue
      n.fx = null
      n.fy = null
    }
  }

  function armAndSimulate({ fresh = false } = {}) {
    const first = !state.repelArmed || fresh
    state.repelArmed = true
    if (first) {
      state.repelTick = 0
      state.parentRepelScale = 0.04
    } else {
      state.repelTick = REPEL_RAMP_TICKS
      state.parentRepelScale = 1
    }
    releaseLayoutPins()
    startSimulation()
    if (first) {
      requestAnimationFrame(() => {
        if (!destroyed && !state.draggingNode) fitGraphToView(false)
      })
    }
  }

  function startSimulation() {
    if (state.simulation) state.simulation.stop()
    const nodes = activeStructuralNodes()
    state.settled = false
    const isHub = (n) => n.type === NODE_TYPES.HUB
    const isCluster = (n) => n.type === NODE_TYPES.CLUSTER

    state.simulation = d3
      .forceSimulation(nodes)
      .alpha(0.92)
      .alphaMin(0.001)
      .alphaDecay(0.026)
      .velocityDecay(0.46)
      .force('hubAttract', forceHubAttract({ strength: 0.09, parentLinkGap: PARENT_LINK_GAP }))
      .force(
        'repelHubs',
        forceLiveRepel({
          // Only leftover overlap. Range is the pair's auras, not a fixed disk,
          // so the seed grid stays compact instead of being stretched apart.
          maxStrength: 28,
          distanceMax: 520,
          strengthScale: parentRepelScale,
          predicate: isHub,
          radius: (n) => (n.collisionRadius || n.radius || hubR()) + 10,
        })
      )
      .force(
        'repelForeignClusters',
        forceForeignClusterRepel({
          type: NODE_TYPES.CLUSTER,
          parentKey: 'parentId',
          strength: () => 48 * parentRepelScale(),
          distanceMax: 180,
        })
      )
      .force(
        'hubCollide',
        forceLiveCollide({
          radius: (n) => n.collisionRadius || n.radius || hubR(),
          maxStrength: 0.9,
          strengthScale: parentRepelScale,
          padding: 18,
          predicate: isHub,
        })
      )
      .force(
        'clusterCollide',
        forceLiveCollide({
          radius: (n) => n.collisionRadius || n.radius || clusterR(),
          maxStrength: 0.72,
          strengthScale: parentRepelScale,
          padding: 8,
          // Slotted children are locked to the fan; colliding them bunches one side.
          predicate: (n) => isCluster(n) && !Number.isFinite(n.slotAngle),
        })
      )
      .on('tick', () => {
        advanceRepelScale()
        assignParentTopicSlots()
        projectParentTopicFans()
        syncWorldPositions()
        requestRender()
      })
      .on('end', () => {
        for (const n of activeStructuralNodes()) {
          n.vx = 0
          n.vy = 0
          if (n.type === NODE_TYPES.HUB) {
            n.fx = n.x
            n.fy = n.y
          } else {
            n.fx = null
            n.fy = null
          }
        }
        syncWorldPositions()
        state.settled = true
        if (!state.draggingNode) fitGraphToView()
        requestRender()
      })
  }

  function clusterHome(node) {
    const parent = node.parentId ? state.byId.get(node.parentId) : null
    if (parent && Number.isFinite(node.homeDx) && Number.isFinite(parent.x)) {
      return { x: parent.x + node.homeDx, y: parent.y + node.homeDy }
    }
    return { x: node.homeX ?? node.x, y: node.homeY ?? node.y }
  }

  function captureReturnHome(node) {
    if (!node || node.type !== NODE_TYPES.CLUSTER) return
    const parent = node.parentId ? state.byId.get(node.parentId) : null
    if (parent && Number.isFinite(parent.x) && Number.isFinite(node.x)) {
      node.homeDx = node.x - parent.x
      node.homeDy = node.y - parent.y
    } else {
      node.homeX = node.x
      node.homeY = node.y
    }
  }

  function beginReturn(node) {
    if (!node || node.type === NODE_TYPES.HUB) return
    node.userPinned = false
    node.fx = null
    node.fy = null
    if (node.type === NODE_TYPES.LEAF) {
      state.leavesAnimating = true
      requestRender()
      return
    }
    state.returningIds.add(node.id)
    requestRender()
  }

  function advanceReturns() {
    let animating = false
    for (const id of [...state.returningIds]) {
      const n = state.byId.get(id)
      if (!n || n.type === NODE_TYPES.HUB) {
        state.returningIds.delete(id)
        continue
      }
      if (state.draggingNode?.id === n.id) continue
      const home = clusterHome(n)
      const dx = home.x - n.x
      const dy = home.y - n.y
      if (Math.hypot(dx, dy) < 0.45) {
        n.x = home.x
        n.y = home.y
        n.vx = 0
        n.vy = 0
        n.fx = null
        n.fy = null
        state.returningIds.delete(id)
      } else {
        n.x += dx * 0.28
        n.y += dy * 0.28
        n.fx = n.x
        n.fy = n.y
        animating = true
      }
    }
    return animating
  }

  function requestRender() {
    if (state.renderFrame != null || destroyed) return
    state.renderFrame = requestAnimationFrame(() => {
      state.renderFrame = null
      const keepReturn = advanceReturns()
      const keepLeaves = syncWorldPositions(true)
      render()
      if (keepReturn || keepLeaves) requestRender()
    })
  }

  function focusing() {
    return Boolean(state.selectedId || state.highlightColorKey || state.neighborhoodIds)
  }

  function isHighlighted(n) {
    if (!n) return false
    if (state.selectedId && n.id === state.selectedId) return true
    if (state.neighborhoodIds?.has(n.id)) return true
    if (state.highlightColorKey && n.type === NODE_TYPES.LEAF) {
      const keys = n.colorKeys?.length ? n.colorKeys : [n.colorKey]
      return keys.includes(state.highlightColorKey)
    }
    return false
  }

  function nodeAlpha(n) {
    if (!focusing()) return 1
    return isHighlighted(n) || n.id === state.selectedId ? 1 : COLORS.dimAlpha
  }

  function render() {
    if (!ctx || !canvas) return
    const { width, height, transform: t } = state
    if (!width || !height) return

    const viewPad = 80 / t.k
    const view = {
      left: -t.x / t.k - viewPad,
      right: (width - t.x) / t.k + viewPad,
      top: -t.y / t.k - viewPad,
      bottom: (height - t.y) / t.k + viewPad,
    }
    const visible = (n, extra = 0) =>
      Number.isFinite(n.x) &&
      n.x + extra >= view.left &&
      n.x - extra <= view.right &&
      n.y + extra >= view.top &&
      n.y - extra <= view.bottom

    ctx.save()
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, width, height)
    ctx.translate(t.x, t.y)
    ctx.scale(t.k, t.k)

    // Grid
    {
      let spacing = GRID_SPACING
      const viewW = view.right - view.left
      const viewH = view.bottom - view.top
      const maxDots = 6000
      const est = (viewW / spacing) * (viewH / spacing)
      if (est > maxDots) {
        spacing = Math.ceil(Math.sqrt((viewW * viewH) / maxDots) / GRID_SPACING) * GRID_SPACING
      }
      const x0 = Math.floor(view.left / spacing) * spacing
      const x1 = Math.ceil(view.right / spacing) * spacing
      const y0 = Math.floor(view.top / spacing) * spacing
      const y1 = Math.ceil(view.bottom / spacing) * spacing
      ctx.fillStyle = hexToRgba('#64748B', 0.16)
      ctx.beginPath()
      for (let x = x0; x <= x1; x += spacing) {
        for (let y = y0; y <= y1; y += spacing) {
          ctx.moveTo(x + 1.1, y)
          ctx.arc(x, y, 1.1, 0, Math.PI * 2)
        }
      }
      ctx.fill()
    }

    // Family auras — follow the mixed spokes so the fill is not a perfect disk.
    for (const h of state.hubs) {
      if (isExcluded(h) || !Number.isFinite(h.x)) continue
      const auraR = h.clusterExtent || h.radius * 6
      if (!visible(h, auraR)) continue
      const dimmed = focusing() && !isHighlighted(h) && h.id !== state.selectedId
      const base = h.familyColor || COLORS.orphan
      traceFamilyAura(ctx, h)
      ctx.fillStyle = hexToRgba(base, dimmed ? FAMILY_AURA_ALPHA * COLORS.dimAlpha : FAMILY_AURA_ALPHA)
      ctx.fill()
    }

    // Structural links
    ctx.lineWidth = 1.25 / t.k
    for (const l of state.structuralLinks) {
      const s = state.byId.get(typeof l.source === 'object' ? l.source.id : l.source)
      const tg = state.byId.get(typeof l.target === 'object' ? l.target.id : l.target)
      if (!s || !tg || isExcluded(s) || isExcluded(tg)) continue
      if (!visible(s, s.radius) && !visible(tg, tg.radius)) continue
      const related = focusing() && (isHighlighted(s) || isHighlighted(tg))
      ctx.strokeStyle =
        focusing() && !related ? hexToRgba(COLORS.edge, COLORS.dimAlpha * 0.7) : COLORS.edge
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(tg.x, tg.y)
      ctx.stroke()
    }

    // Leaf links (zoom-gated)
    const relativeZoom = t.k / (state.baselineZoom || 1)
    const showLeafLinks = focusing() || relativeZoom >= 1.8
    if (showLeafLinks && settings.showLeaves) {
      ctx.lineWidth = 1 / t.k
      for (const [parentId, leaves] of state.leavesByParent) {
        const parent = state.byId.get(parentId)
        if (!parent || isExcluded(parent)) continue
        for (const leaf of leaves) {
          if (isExcluded(leaf) || !visible(leaf, leafR())) continue
          ctx.strokeStyle = hexToRgba(COLORS.edge, focusing() && !isHighlighted(leaf) ? 0.15 : 0.35)
          ctx.beginPath()
          ctx.moveTo(parent.x, parent.y)
          ctx.lineTo(leaf.x, leaf.y)
          ctx.stroke()
        }
      }
    }

    // Leaves
    if (settings.showLeaves) {
      const showColors = settings.showAllColors || Boolean(state.highlightColorKey)
      for (const n of state.leaves) {
        if (isExcluded(n) || !visible(n, leafR() + 2)) continue
        const selected = n.id === state.selectedId || isHighlighted(n)
        const dimmed = focusing() && !selected
        const r = selected ? leafR() + 1.25 : leafR()
        ctx.beginPath()
        if (n.leafKind === 'ad') {
          const s = r * 1.6
          ctx.rect(n.x - s / 2, n.y - s / 2, s, s)
        } else {
          drawHexPath(ctx, n.x, n.y, r)
        }
        const parent = n.parentId ? state.byId.get(n.parentId) : null
        let fill = COLORS.leafFallback
        if (dimmed) {
          fill = hexToRgba(COLORS.leafFallback, COLORS.dimAlpha)
        } else if (showColors) {
          fill = violationColorDistinct(n.colorKey, parent?.familyColor, violationLabels)
        }
        ctx.fillStyle = fill
        ctx.fill()
        if (!dimmed && showColors && fill !== COLORS.leafFallback && fill !== BLAND_GREY) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
          ctx.lineWidth = 1.05 / t.k
          ctx.stroke()
          ctx.strokeStyle = darkenHex(fill, 0.32)
          ctx.lineWidth = 0.55 / t.k
          ctx.stroke()
        }
        if (n.id === state.selectedId) {
          ctx.strokeStyle = COLORS.selectionRing
          ctx.lineWidth = 1.75 / t.k
          ctx.stroke()
        }
      }
    }

    // Clusters then hubs
    for (const n of [...state.clusters, ...state.hubs]) {
      if (isExcluded(n) || !visible(n, n.radius + 4)) continue
      const alpha = nodeAlpha(n)
      const selected = n.id === state.selectedId
      const hovered = n.id === state.hoveredId
      const img = n.imageUrl ? state.imageCache.get(n.imageUrl) : null
      const hasImage = Boolean(img && img.complete && img.naturalWidth > 0)

      ctx.save()
      ctx.globalAlpha = alpha * (n.type === NODE_TYPES.CLUSTER ? 0.95 : 1)
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
      if (hasImage) {
        ctx.save()
        ctx.clip()
        const size = n.radius * 2
        drawImageCover(ctx, img, n.x - n.radius, n.y - n.radius, size)
        ctx.restore()
        ctx.fillStyle = hexToRgba(n.color || COLORS.orphan, 0.18)
        ctx.fill()
      } else {
        ctx.fillStyle = n.color || COLORS.orphan
        ctx.fill()
      }
      ctx.strokeStyle = selected || hovered ? COLORS.selectionRing : n.strokeColor || '#fff'
      ctx.lineWidth = (selected || n.isPrimary ? 2.5 : hovered ? 2 : 1.5) / t.k
      ctx.stroke()
      if (n.isPrimary && !hasImage) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, Math.max(2, n.radius * 0.28), 0, Math.PI * 2)
        ctx.fillStyle = '#fff'
        ctx.fill()
      }
      ctx.restore()
    }

    // Labels — parent titles sit on a translucent white pill so they stay readable.
    if (settings.showLabels) {
      const showClusterLabels = relativeZoom >= LABEL_ZOOM_MULT
      ctx.textAlign = 'center'
      for (const h of state.hubs) {
        if (isExcluded(h) || !visible(h, h.radius + 28)) continue
        const size = 13 / t.k
        drawTitleBadge(
          ctx,
          truncateLabel(h.label, 26),
          h.x,
          h.y + h.radius + 16 / t.k,
          size,
          nodeAlpha(h),
          t.k
        )
      }
      if (showClusterLabels) {
        for (const c of state.clusters) {
          if (isExcluded(c) || !visible(c, c.radius + 16)) continue
          const size = (c.isPrimary ? 11 : 10) / t.k
          drawTitleBadge(
            ctx,
            truncateLabel(c.label, c.isPrimary ? 28 : 22),
            c.x,
            c.y + c.radius + 12 / t.k,
            size,
            nodeAlpha(c) * 0.9,
            t.k
          )
        }
      } else {
        for (const c of state.clusters) {
          if (!c.isPrimary || isExcluded(c) || !visible(c, c.radius + 16)) continue
          const size = 11 / t.k
          drawTitleBadge(
            ctx,
            truncateLabel(c.label, 28),
            c.x,
            c.y + c.radius + 12 / t.k,
            size,
            nodeAlpha(c) * 0.95,
            t.k
          )
        }
      }
    }

    ctx.restore()
    updateZoomLabel()
  }

  function hitTest(gx, gy) {
    // Prefer leaves when zoomed in (pad for tiny posts)
    const k = state.transform.k
    let best = null
    let bestDist = Infinity

    const candidates = [
      ...(settings.showLeaves ? state.leaves.filter((n) => !isExcluded(n)) : []),
      ...state.clusters.filter((n) => !isExcluded(n)),
      ...state.hubs.filter((n) => !isExcluded(n)),
    ]

    for (const n of candidates) {
      if (!Number.isFinite(n.x)) continue
      const pad = Math.max(n.radius, 6 / k)
      const d = Math.hypot(gx - n.x, gy - n.y)
      if (d <= pad && d < bestDist) {
        best = n
        bestDist = d
      }
    }
    return best
  }

  function setSelection(node) {
    state.selectedId = node?.id ?? null
    if (node && (node.type === NODE_TYPES.HUB || node.type === NODE_TYPES.CLUSTER)) {
      const ids = new Set([node.id])
      if (node.type === NODE_TYPES.HUB) {
        for (const c of state.clustersByHub.get(node.id) || []) {
          ids.add(c.id)
          for (const leaf of state.leavesByParent.get(c.id) || []) ids.add(leaf.id)
        }
        for (const leaf of state.leavesByParent.get(node.id) || []) ids.add(leaf.id)
      } else {
        for (const leaf of state.leavesByParent.get(node.id) || []) ids.add(leaf.id)
        if (node.parentId) ids.add(node.parentId)
      }
      state.neighborhoodIds = ids
    } else if (node?.type === NODE_TYPES.LEAF) {
      state.neighborhoodIds = new Set([node.id, node.parentId].filter(Boolean))
    } else {
      state.neighborhoodIds = null
    }
    requestRender()
    if (node) {
      focusCameraOnNode(node, true)
      // Detail panel can shrink the canvas after React paints — nudge focus once layout settles.
      const selectedId = node.id
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (destroyed || state.selectedId !== selectedId) return
          const still = state.byId.get(selectedId)
          if (still) focusCameraOnNode(still, true)
        }, 140)
      })
    }
    onSelectNode?.(node || null)
  }

  /** Nodes to frame when focusing a hub/cluster/leaf selection. */
  function collectFocusNodes(node) {
    if (!node) return []
    let root = node
    if (node.type === NODE_TYPES.LEAF && node.parentId) {
      root = state.byId.get(node.parentId) || node
    }
    const out = []
    const push = (n) => {
      if (n && Number.isFinite(n.x) && Number.isFinite(n.y)) out.push(n)
    }
    push(root)
    if (root.type === NODE_TYPES.HUB) {
      for (const c of state.clustersByHub.get(root.id) || []) {
        push(c)
        for (const leaf of state.leavesByParent.get(c.id) || []) push(leaf)
      }
      for (const leaf of state.leavesByParent.get(root.id) || []) push(leaf)
    } else if (root.type === NODE_TYPES.CLUSTER) {
      for (const leaf of state.leavesByParent.get(root.id) || []) push(leaf)
    }
    return out
  }

  function focusPadFor(n) {
    if (!n) return 20
    if (n.type === NODE_TYPES.LEAF) return Math.max(n.radius || 3, 8)
    return Math.max(
      n.collisionRadius || 0,
      n.cloudRadius || 0,
      n.clusterExtent || 0,
      (n.radius || 22) * 4,
      48
    )
  }

  /**
   * Zoom/pan so the selection (parent + leaf cloud, or leaf's parent group) fills the canvas.
   * Does not change baselineZoom — Fit still means "whole graph".
   */
  function focusCameraOnNode(node, animate = true) {
    if (!node || !zoomBehavior || !state.width || !state.height) return
    const nodes = collectFocusNodes(node)
    if (!nodes.length) return

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const n of nodes) {
      const pad = focusPadFor(n)
      minX = Math.min(minX, n.x - pad)
      maxX = Math.max(maxX, n.x + pad)
      minY = Math.min(minY, n.y - pad)
      maxY = Math.max(maxY, n.y + pad)
    }

    const gw = Math.max(maxX - minX, 60)
    const gh = Math.max(maxY - minY, 60)
    const margin = 56
    const maxScale = 8
    const minScale = 0.08
    const scale = Math.min(
      (state.width - margin * 2) / gw,
      (state.height - margin * 2) / gh,
      maxScale
    )
    const k = Math.max(minScale, scale)
    const tx = state.width / 2 - ((minX + maxX) / 2) * k
    const ty = state.height / 2 - ((minY + maxY) / 2) * k
    const transform = d3.zoomIdentity.translate(tx, ty).scale(k)

    if (!zoomBehavior || destroyed) return
    if (animate) {
      d3.select(canvas).transition().duration(420).ease(d3.easeCubicOut).call(zoomBehavior.transform, transform)
    } else {
      d3.select(canvas).call(zoomBehavior.transform, transform)
    }
  }

  function clearSelection() {
    state.selectedId = null
    state.neighborhoodIds = null
    state.highlightColorKey = null
    requestRender()
  }

  function resize() {
    const wrap = nx('canvas-wrap') || canvas?.parentElement
    if (!wrap || !canvas || !ctx) return
    const rect = wrap.getBoundingClientRect()
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height)
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    state.width = width
    state.height = height
    state.dpr = dpr
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    requestRender()
  }

  function fitGraphToView(animate = true) {
    const nodes = activeStructuralNodes().filter((n) => Number.isFinite(n.x))
    if (!nodes.length || !state.width) return
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const n of nodes) {
      const pad = n.collisionRadius || n.radius || 20
      minX = Math.min(minX, n.x - pad)
      maxX = Math.max(maxX, n.x + pad)
      minY = Math.min(minY, n.y - pad)
      maxY = Math.max(maxY, n.y + pad)
    }
    const gw = Math.max(maxX - minX, 40)
    const gh = Math.max(maxY - minY, 40)
    const pad = 48
    const scale = Math.min((state.width - pad * 2) / gw, (state.height - pad * 2) / gh, 2.5)
    const tx = state.width / 2 - ((minX + maxX) / 2) * scale
    const ty = state.height / 2 - ((minY + maxY) / 2) * scale
    const transform = d3.zoomIdentity.translate(tx, ty).scale(scale)
    state.baselineZoom = scale
    if (animate) {
      d3.select(canvas).transition().duration(450).call(zoomBehavior.transform, transform)
    } else {
      d3.select(canvas).call(zoomBehavior.transform, transform)
    }
  }

  function zoomBy(factor) {
    d3.select(canvas).transition().duration(180).call(zoomBehavior.scaleBy, factor)
  }

  function updateZoomLabel() {
    const el = nx('zoom-percent')
    if (!el) return
    const rel = state.transform.k / (state.baselineZoom || 1)
    el.textContent = `${Math.round(rel * 100)}%`
  }

  let chromeControlsBound = false

  /** Meta pills + legend — safe to call after leaves load. */
  function refreshChromeMeta() {
    const titleEl = nx('title')
    if (titleEl) titleEl.textContent = title
    const subEl = nx('subtitle')
    if (subEl) subEl.textContent = subtitle

    const meta = nx('meta-pills')
    if (meta) {
      const pills = [
        `<span class="nx-pill"><strong>${state.hubs.length}</strong> hubs</span>`,
      ]
      if (state.clusters.length) {
        pills.push(
          `<span class="nx-pill"><strong>${state.clusters.length}</strong> clusters</span>`
        )
      }
      pills.push(
        `<span class="nx-pill"><strong>${state.leaves.length}</strong> leaves</span>`
      )
      meta.innerHTML = pills.join('')
    }

    const legend = nx('legend')
    if (legend) {
      legend.innerHTML = `
        <div class="nx-legend-item"><span class="nx-dot" style="background:#3B82F6"></span> Hub</div>
        <div class="nx-legend-item"><span class="nx-dot" style="background:#8B5CF6"></span> Cluster</div>
        <div class="nx-legend-item"><span class="nx-hex" style="background:#9AA5B1"></span> Post leaf (hex)</div>
        <div class="nx-legend-item"><span class="nx-dot" style="background:#9AA5B1;border-radius:2px"></span> Ad leaf (square)</div>
      `
      if (state.colorKeys.length) {
        legend.innerHTML += `<div class="nx-legend-section">Violations</div>`
        for (const key of state.colorKeys.slice(0, 12)) {
          const color = violationColor(key, violationLabels)
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'nx-legend-item nx-legend-btn'
          btn.innerHTML = `<span class="nx-dot" style="background:${color}"></span> ${key}`
          btn.addEventListener('click', () => {
            state.highlightColorKey = state.highlightColorKey === key ? null : key
            settings.showAllColors = Boolean(state.highlightColorKey)
            layoutAllLeafPacks({ immediate: true })
            requestRender()
          })
          legend.appendChild(btn)
        }
      }
    }

  }

  /** Bind controls once — setLeaves must not re-attach listeners. */
  function setupChrome() {
    refreshChromeMeta()
    if (chromeControlsBound) return
    chromeControlsBound = true

    bindControl('search', 'input', (e) => {
      state.searchQuery = e.target.value.trim()
      assignParentTopicSlots()
      projectParentTopicFans()
      syncWorldPositions()
      requestRender()
    })
    bindControl('show-labels', 'change', (e) => {
      settings.showLabels = e.target.checked
      saveSettings()
      requestRender()
    })
    bindControl('show-leaves', 'change', (e) => {
      settings.showLeaves = e.target.checked
      saveSettings()
      if (settings.showLeaves && !state.leavesLoaded && onNeedLeaves) {
        onNeedLeaves({ parentIds: leafParentIds() })
      }
      applyRadii()
      layoutAllLeafPacks({ immediate: true })
      applyRadii()
      if (state.leavesLoaded) {
        armAndSimulate()
      }
      requestRender()
    })
    bindControl('show-colors', 'change', (e) => {
      settings.showAllColors = e.target.checked
      colorsTouched = true
      saveSettings()
      requestRender()
    })
    bindControl('zoom-fit', 'click', () => fitGraphToView(true))
    bindControl('zoom-in', 'click', () => zoomBy(1.28))
    bindControl('zoom-out', 'click', () => zoomBy(1 / 1.28))
    bindControl('load-leaves', 'click', () => {
      if (onNeedLeaves) onNeedLeaves({ parentIds: leafParentIds() })
    })

    const showLabels = nx('show-labels')
    if (showLabels) showLabels.checked = settings.showLabels
    const showLeaves = nx('show-leaves')
    if (showLeaves) showLeaves.checked = settings.showLeaves
    const showColors = nx('show-colors')
    if (showColors) showColors.checked = settings.showAllColors
  }

  function bindControl(name, event, handler) {
    const el = nx(name)
    if (el) el.addEventListener(event, handler)
  }

  function setupZoom() {
    zoomBehavior = d3
      .zoom()
      .scaleExtent([0.05, 12])
      .filter((event) => {
        if (event.type === 'wheel') return true
        if (event.shiftKey) return true
        if (state.draggingNode) return false
        if (event.type === 'mousedown' || event.type === 'pointerdown') {
          const [gx, gy] = pointerToGraph(event, canvas, state.transform)
          if (hitTest(gx, gy)) return false
        }
        return event.button === 0
      })
      .on('zoom', (event) => {
        state.transform = event.transform
        requestRender()
      })
    d3.select(canvas).call(zoomBehavior)
  }

  function setupPointer() {
    const DRAG_THRESHOLD = 4

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      const [gx, gy] = pointerToGraph(e, canvas, state.transform)
      const hit = hitTest(gx, gy)
      state.pointerDown = {
        x: e.clientX,
        y: e.clientY,
        gx,
        gy,
        hit,
        moved: false,
      }
      if (
        hit &&
        (hit.type === NODE_TYPES.HUB ||
          hit.type === NODE_TYPES.CLUSTER ||
          hit.type === NODE_TYPES.LEAF)
      ) {
        state.draggingNode = hit
        if (hit.type === NODE_TYPES.HUB) {
          hit.fx = hit.x
          hit.fy = hit.y
        }
        canvas.setPointerCapture(e.pointerId)
      }
    })

    canvas.addEventListener('pointermove', (e) => {
      const [gx, gy] = pointerToGraph(e, canvas, state.transform)
      if (state.pointerDown && !state.pointerDown.moved) {
        const dx = e.clientX - state.pointerDown.x
        const dy = e.clientY - state.pointerDown.y
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          state.pointerDown.moved = true
          if (state.draggingNode?.type === NODE_TYPES.CLUSTER) {
            captureReturnHome(state.draggingNode)
          }
        }
      }

      if (state.draggingNode && state.pointerDown?.moved) {
        state.dragActive = true
        const node = state.draggingNode
        if (state.pointerDown.startX == null) {
          state.pointerDown.startX = node.x
          state.pointerDown.startY = node.y
        }
        node.x = state.pointerDown.startX + (gx - state.pointerDown.gx)
        node.y = state.pointerDown.startY + (gy - state.pointerDown.gy)

        if (node.type === NODE_TYPES.HUB) {
          node.fx = node.x
          node.fy = node.y
          const kids = state.clustersByHub.get(node.id) || []
          if (state.pointerDown.kidStarts == null) {
            state.pointerDown.kidStarts = kids.map((c) => ({ id: c.id, x: c.x, y: c.y }))
          }
          for (const start of state.pointerDown.kidStarts) {
            const c = state.byId.get(start.id)
            if (!c) continue
            c.x = start.x + (gx - state.pointerDown.gx)
            c.y = start.y + (gy - state.pointerDown.gy)
            c.fx = c.x
            c.fy = c.y
          }
        } else if (node.type === NODE_TYPES.CLUSTER) {
          node.fx = node.x
          node.fy = node.y
          state.returningIds.delete(node.id)
        } else if (node.type === NODE_TYPES.LEAF) {
          const parent = node.parentId ? state.byId.get(node.parentId) : null
          if (parent && Number.isFinite(parent.x)) {
            node.localX = node.x - parent.x
            node.localY = node.y - parent.y
          }
        }
        syncWorldPositions()
        requestRender()
        return
      }

      const hit = hitTest(gx, gy)
      const nextId = hit?.id ?? null
      if (nextId !== state.hoveredId) {
        state.hoveredId = nextId
        canvas.style.cursor = hit ? 'pointer' : 'default'
        requestRender()
      }
    })

    canvas.addEventListener('pointerup', (e) => {
      const wasDrag = state.dragActive
      const dragged = state.draggingNode
      if (dragged && wasDrag) {
        if (dragged.type === NODE_TYPES.HUB) {
          dragged.userPinned = true
          dragged.fx = dragged.x
          dragged.fy = dragged.y
          for (const start of state.pointerDown?.kidStarts || []) {
            const c = state.byId.get(start.id)
            if (!c) continue
            c.userPinned = false
            c.fx = null
            c.fy = null
            c.vx = 0
            c.vy = 0
          }
        } else {
          beginReturn(dragged)
        }
      } else if (dragged && dragged.type === NODE_TYPES.HUB && !dragged.userPinned && !state.settled) {
        dragged.fx = null
        dragged.fy = null
      } else if (dragged && dragged.type !== NODE_TYPES.HUB) {
        dragged.fx = null
        dragged.fy = null
      }
      if (!wasDrag && state.pointerDown && !state.pointerDown.moved) {
        const [gx, gy] = pointerToGraph(e, canvas, state.transform)
        const hit = hitTest(gx, gy)
        setSelection(hit)
      }
      state.draggingNode = null
      state.dragActive = false
      state.pointerDown = null
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    })
  }

  function boot() {
    ingestGraph(graph)
    resize()
    setupZoom()
    setupPointer()
    setupChrome()
    seedPositions()
    layoutAllLeafPacks({ immediate: true })
    requestRender()

    if (state.leaves.length) {
      armAndSimulate({ fresh: true })
    } else if (settings.showLeaves && onNeedLeaves) {
      setTimeout(() => {
        if (!destroyed) onNeedLeaves({ parentIds: leafParentIds() })
      }, 100)
      state.repelTimer = setTimeout(() => {
        if (!destroyed && !state.repelArmed) armAndSimulate({ fresh: true })
      }, 900)
    } else {
      state.repelTimer = setTimeout(() => {
        if (!destroyed && !state.repelArmed) armAndSimulate({ fresh: true })
      }, 280)
    }

    const wrap = nx('canvas-wrap') || canvas.parentElement
    if (wrap && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => resize())
      resizeObserver.observe(wrap)
    }

    const loading = nx('loading')
    if (loading) loading.hidden = true
    // `ready` class is owned by React (NexusGraphShell) so selection re-renders
    // do not wipe it by resetting className.
  }

  function setLeaves(stubPayload) {
    const merged = mergeLeafStubsInline(graph, stubPayload)
    const leafNodes = merged.nodes.filter((n) => n.type === NODE_TYPES.LEAF)
    // Remove old leaves from state
    state.nodes = state.nodes.filter((n) => n.type !== NODE_TYPES.LEAF)
    state.links = state.links.filter((l) => l.type !== 'cluster_leaf')
    for (const leaf of leafNodes) {
      state.nodes.push({
        ...leaf,
        radius: leafR(),
        localX: 0,
        localY: 0,
        targetLocalX: 0,
        targetLocalY: 0,
        familyColor: state.byId.get(leaf.parentId)?.familyColor || COLORS.leafFallback,
        color: COLORS.leafFallback,
      })
      state.byId.set(leaf.id, state.nodes[state.nodes.length - 1])
      state.links.push({ source: leaf.parentId, target: leaf.id, type: 'cluster_leaf' })
    }
    state.leaves = state.nodes.filter((n) => n.type === NODE_TYPES.LEAF)
    state.leavesByParent = new Map()
    for (const leaf of state.leaves) {
      if (!state.leavesByParent.has(leaf.parentId)) state.leavesByParent.set(leaf.parentId, [])
      state.leavesByParent.get(leaf.parentId).push(leaf)
    }
    state.colorKeys = merged.colorAxis?.keys || state.colorKeys
    state.leavesLoaded = true
    applyRadii()
    layoutAllLeafPacks({ immediate: true })
    // Extents grew with real post clouds — re-seat the same grid with a gap, no shove.
    applyRadii()
    const placed = state.hubs.filter((h) => !isExcluded(h) && Number.isFinite(h.x))
    if (placed.length) {
      const hx = placed.reduce((s, h) => s + h.x, 0) / placed.length
      const hy = placed.reduce((s, h) => s + h.y, 0) / placed.length
      placeHubsOnGrid(placed, hx, hy)
    }
    projectParentTopicFans()
    syncWorldPositions()
    if (state.repelTimer) {
      clearTimeout(state.repelTimer)
      state.repelTimer = null
    }
    armAndSimulate({ fresh: !state.repelArmed })
    refreshChromeMeta()
    requestRender()
  }

  function mergeLeafStubsInline(baseGraph, stubPayload) {
    const axisKeys = stubPayload?.colorAxis?.keys || []
    const keys = axisKeys.length
      ? axisKeys
      : (() => {
          const s = new Set()
          for (const c of stubPayload?.clusters || []) {
            for (const leaf of c.leaves || []) {
              if (leaf.colorKeys) leaf.colorKeys.forEach((k) => s.add(k))
            }
          }
          return orderColorKeys([...s], violationLabels)
        })()
    const indexByKey = new Map(keys.map((k, i) => [k, i]))
    const leafNodes = []
    for (const cluster of stubPayload?.clusters || []) {
      for (const leaf of cluster.leaves || []) {
        const colorKey =
          leaf.k != null && keys[leaf.k] != null
            ? keys[leaf.k]
            : leaf.colorKeys?.[0] || UNKNOWN_COLOR_KEY
        leafNodes.push({
          id: String(leaf.id),
          type: NODE_TYPES.LEAF,
          label: leaf.label || String(leaf.id),
          parentId: String(cluster.id),
          familyId: String(cluster.familyId || cluster.id),
          colorKey,
          colorKeys: leaf.colorKeys || (colorKey !== UNKNOWN_COLOR_KEY ? [colorKey] : []),
          colorIndex: indexByKey.get(colorKey) ?? -1,
          leafKind: leaf.leafKind || 'post',
          t: leaf.t ?? null,
        })
      }
    }
    return {
      nodes: [...(baseGraph.nodes || []), ...leafNodes],
      colorAxis: { keys },
    }
  }

  function destroy() {
    destroyed = true
    if (state.repelTimer) clearTimeout(state.repelTimer)
    if (state.simulation) state.simulation.stop()
    if (state.renderFrame != null) cancelAnimationFrame(state.renderFrame)
    if (resizeObserver) resizeObserver.disconnect()
    if (canvas) d3.select(canvas).on('.zoom', null)
  }

  boot()

  return {
    destroy,
    clearSelection,
    setLeaves,
    getSettings: () => ({ ...settings }),
    fitGraphToView,
    focusCameraOnNode,
    setHighlightColor(key) {
      state.highlightColorKey = key
      requestRender()
    },
  }
}
