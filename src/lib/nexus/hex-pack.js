/**
 * Hex-lattice slot generation for color-ordered leaf packing.
 * Leaves sit around a parent body; not in the force simulation.
 * Pointy-top lattice so slots nest with drawHexPath (vertex radius = leafR).
 */
export function buildHexSlots({ count, bodyR, leafR, orbitGap = 0.8, gap = 0.55 }) {
  if (count <= 0) return []
  const spacing = Math.sqrt(3) * leafR + gap
  const innerRadius = bodyR + orbitGap + leafR
  const rowPitch = leafR * 1.5 + gap * 0.55
  let outerRadius = innerRadius + spacing
  let slots = []

  while (slots.length < count) {
    slots = []
    const rows = Math.ceil(outerRadius / rowPitch)
    const cols = Math.ceil(outerRadius / spacing) + 1
    for (let row = -rows; row <= rows; row += 1) {
      const y = row * rowPitch
      const offsetX = Math.abs(row) % 2 ? spacing / 2 : 0
      for (let col = -cols; col <= cols; col += 1) {
        const x = col * spacing + offsetX
        const dist = Math.hypot(x, y)
        if (dist < innerRadius || dist > outerRadius) continue
        slots.push({ x, y, dist })
      }
    }
    if (slots.length < count) outerRadius += spacing
  }

  slots.sort((a, b) => a.dist - b.dist)
  slots = slots.slice(0, count)
  slots.sort((a, b) => {
    const aa = (Math.atan2(a.y, a.x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)
    const ba = (Math.atan2(b.y, b.x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)
    return aa - ba || a.dist - b.dist
  })
  return slots
}

/** Estimate cloud radius for collision so packs reserve space without simulating leaves. */
export function estimateCloudRadius(leafCount, bodyR, leafR, orbitGap = 0.8, gap = 0.55) {
  if (leafCount <= 0) return bodyR
  const slots = buildHexSlots({ count: leafCount, bodyR, leafR, orbitGap, gap })
  if (!slots.length) return bodyR + leafR
  const farthest = Math.max(...slots.map((s) => s.dist))
  return farthest + leafR
}
