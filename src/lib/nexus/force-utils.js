import * as d3 from 'd3'

/** Many-body repel limited to nodes matching predicate. */
export function typeRepel(strengthMag, distanceMax, predicate) {
  const f = d3.forceManyBody().strength(-strengthMag).distanceMax(distanceMax).theta(0.9)
  const base = f.initialize
  f.initialize = (nodes, random) => base.call(f, nodes.filter(predicate), random)
  return f
}

/** Collide limited to nodes matching predicate. */
export function typeCollide(radius, strength, iterations, predicate) {
  const f = d3.forceCollide().radius(radius).strength(strength).iterations(iterations)
  const base = f.initialize
  f.initialize = (nodes, random) => base.call(f, nodes.filter(predicate), random)
  return f
}

/** Push same-type nodes apart when their parentKey differs. */
export function forceForeignClusterRepel(opts) {
  const { type, parentKey, strength, distanceMax } = opts
  let nodes = []
  const dist2Max = distanceMax * distanceMax

  function force(alpha) {
    const items = []
    for (const n of nodes) {
      if (n.type === type && Number.isFinite(n.x) && Number.isFinite(n.y)) {
        items.push(n)
      }
    }
    if (items.length < 2) return

    const tree = d3.quadtree(
      items,
      (d) => d.x,
      (d) => d.y
    )
    const s = (typeof strength === 'function' ? strength() : strength) * alpha

    for (const a of items) {
      tree.visit((quad, x0, y0, x1, y1) => {
        const b = quad.data
        if (b) {
          if (a === b || a.id >= b.id) return
          const ap = a[parentKey]
          const bp = b[parentKey]
          if (ap != null && bp != null && ap === bp) return

          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist2 = dx * dx + dy * dy
          if (dist2 >= dist2Max || dist2 === 0) return

          const dist = Math.sqrt(dist2)
          const mag = (s * (1 - dist / distanceMax)) / dist
          const fx = dx * mag
          const fy = dy * mag
          a.vx -= fx
          a.vy -= fy
          b.vx += fx
          b.vy += fy
          return
        }

        return (
          x0 > a.x + distanceMax ||
          x1 < a.x - distanceMax ||
          y0 > a.y + distanceMax ||
          y1 < a.y - distanceMax
        )
      })
    }
  }

  force.initialize = (initNodes) => {
    nodes = initNodes
  }
  return force
}

/**
 * Hub pulls each cluster toward a per-child orbit:
 * hub.radius + parentLinkGap + child.collisionRadius
 * (not a shared hub.clusterExtent ring).
 */
export function forceHubAttract({
  hubType = 'hub',
  clusterType = 'cluster',
  strength = 0.08,
  parentLinkGap = 6,
} = {}) {
  let nodes = []
  const byId = new Map()

  function force(alpha) {
    byId.clear()
    for (const n of nodes) byId.set(n.id, n)
    const s = strength * alpha
    for (const n of nodes) {
      if (n.type !== clusterType || n.parentId == null) continue
      const hub = byId.get(n.parentId)
      if (!hub || hub.type !== hubType) continue
      if (!Number.isFinite(hub.x) || !Number.isFinite(n.x)) continue
      const dx = n.x - hub.x
      const dy = n.y - hub.y
      const dist = Math.hypot(dx, dy) || 1
      const childR = n.collisionRadius || n.radius || 10
      const variable = (hub.radius || 0) + parentLinkGap + childR
      const target = Number.isFinite(n.orbitFloor) ? Math.max(variable, n.orbitFloor) : variable
      // Parent-topic fans hold a slot angle. Others stay radial-only.
      if (Number.isFinite(n.slotAngle)) {
        const tx = Math.cos(n.slotAngle) * target
        const ty = Math.sin(n.slotAngle) * target
        n.vx -= (dx - tx) * s
        n.vy -= (dy - ty) * s
        continue
      }
      const delta = dist - target
      // Spring toward per-child orbit radius
      const mag = (delta * s) / dist
      n.vx -= dx * mag
      n.vy -= dy * mag
    }
  }

  force.initialize = (initNodes) => {
    nodes = initNodes
  }
  return force
}

/**
 * Pairwise repulsion. Strength is read every tick so it can ramp after
 * parents have been shown close together.
 * Fixed nodes (fx set) still push neighbors but do not move.
 */
export function forceLiveRepel({
  maxStrength = 240,
  distanceMax = 460,
  strengthScale = () => 1,
  predicate,
  radius,
} = {}) {
  let nodes = []
  const dist2Max = distanceMax * distanceMax

  function reach(n) {
    if (!radius) return null
    const base = typeof radius === 'function' ? radius(n) : radius
    return Number.isFinite(base) ? base : 0
  }

  function force(alpha) {
    const strength = maxStrength * strengthScale() * alpha
    if (strength < 0.4) return
    const items = []
    for (const n of nodes) {
      if (predicate(n) && Number.isFinite(n.x) && Number.isFinite(n.y)) items.push(n)
    }
    for (let i = 0; i < items.length; i += 1) {
      const a = items[i]
      for (let j = i + 1; j < items.length; j += 1) {
        const b = items[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist2 = dx * dx + dy * dy
        if (dist2 === 0) {
          dx = 0.02
          dy = 0
          dist2 = 0.0004
        }
        if (dist2 >= dist2Max) continue
        const dist = Math.sqrt(dist2)
        const ra = reach(a)
        const rb = reach(b)
        const pairMax = ra != null && rb != null ? Math.min(distanceMax, ra + rb) : distanceMax
        if (pairMax <= 1 || dist >= pairMax) continue
        const impulse = Math.min(18, strength * (1 - dist / pairMax))
        const mag = impulse / dist
        const aFixed = a.fx != null
        const bFixed = b.fx != null
        if (aFixed && bFixed) continue
        if (!aFixed) {
          a.vx -= dx * mag * (bFixed ? 1 : 0.5)
          a.vy -= dy * mag * (bFixed ? 1 : 0.5)
        }
        if (!bFixed) {
          b.vx += dx * mag * (aFixed ? 1 : 0.5)
          b.vy += dy * mag * (aFixed ? 1 : 0.5)
        }
      }
    }
  }

  force.initialize = (initNodes) => {
    nodes = initNodes
  }
  return force
}

/**
 * Collide that reads radius and strength every tick (d3 caches both at init).
 * Used so parent clouds can start overlapped and separate as strength ramps.
 */
export function forceLiveCollide({
  radius,
  maxStrength = 0.82,
  strengthScale = () => 1,
  padding = 16,
  predicate,
} = {}) {
  let nodes = []

  function nodeRadius(n) {
    const base = typeof radius === 'function' ? radius(n) : radius
    return (base || 0) + padding
  }

  function force(alpha) {
    const s = maxStrength * strengthScale()
    if (s < 0.02) return
    const items = []
    for (const n of nodes) {
      if (predicate(n) && Number.isFinite(n.x) && Number.isFinite(n.y)) items.push(n)
    }
    for (let i = 0; i < items.length; i += 1) {
      const a = items[i]
      const ra = nodeRadius(a)
      for (let j = i + 1; j < items.length; j += 1) {
        const b = items[j]
        const min = ra + nodeRadius(b)
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist = Math.hypot(dx, dy) || 0.01
        if (dist >= min) continue
        const push = Math.min(0.22, ((min - dist) / dist) * s * alpha)
        const aFixed = a.fx != null
        const bFixed = b.fx != null
        if (aFixed && bFixed) continue
        if (!aFixed) {
          a.vx -= dx * push * (bFixed ? 1 : 0.5)
          a.vy -= dy * push * (bFixed ? 1 : 0.5)
        }
        if (!bFixed) {
          b.vx += dx * push * (aFixed ? 1 : 0.5)
          b.vy += dy * push * (aFixed ? 1 : 0.5)
        }
      }
    }
  }

  force.initialize = (initNodes) => {
    nodes = initNodes
  }
  return force
}
