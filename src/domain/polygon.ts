import type { FurnitureItem, Point } from './models'

const TOUCH_TOLERANCE_CM = 0.05
const CROSS_TOLERANCE = 1e-4

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function polygonBounds(points: Point[]): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { minX, minY, maxX, maxY }
}

export function degToRad(degrees: number): number {
  return degrees * Math.PI / 180
}

/** Unit vector pointing out of the front of a piece (local +y). The back is local -y. */
export function frontDirection(rotationDeg: number): Point {
  const radians = degToRad(rotationDeg)
  return { x: -Math.sin(radians), y: Math.cos(radians) }
}

export function rightDirection(rotationDeg: number): Point {
  const radians = degToRad(rotationDeg)
  return { x: Math.cos(radians), y: Math.sin(radians) }
}

export function localToWorld(
  center: Point,
  rotationDeg: number,
  local: Point,
): Point {
  const right = rightDirection(rotationDeg)
  const front = frontDirection(rotationDeg)
  return {
    x: center.x + right.x * local.x + front.x * local.y,
    y: center.y + right.y * local.x + front.y * local.y,
  }
}

export function footprintFor(
  center: Point,
  widthCm: number,
  depthCm: number,
  rotationDeg: number,
  inflateCm = 0,
): Point[] {
  const halfWidth = widthCm / 2 + inflateCm
  const halfDepth = depthCm / 2 + inflateCm
  return [
    localToWorld(center, rotationDeg, { x: -halfWidth, y: -halfDepth }),
    localToWorld(center, rotationDeg, { x: halfWidth, y: -halfDepth }),
    localToWorld(center, rotationDeg, { x: halfWidth, y: halfDepth }),
    localToWorld(center, rotationDeg, { x: -halfWidth, y: halfDepth }),
  ]
}

export function furnitureFootprint(item: FurnitureItem, inflateCm = 0): Point[] {
  return footprintFor(item.position, item.widthCm, item.depthCm, item.rotationDeg, inflateCm)
}

export function distanceBetween(first: Point, second: Point): number {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

export function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return distanceBetween(point, start)
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return distanceBetween(point, { x: start.x + dx * t, y: start.y + dy * t })
}

export function pointOnBoundary(point: Point, polygon: Point[], tolerance = TOUCH_TOLERANCE_CM): boolean {
  for (let index = 0; index < polygon.length; index += 1) {
    if (distanceToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]) <= tolerance) return true
  }
  return false
}

function strictInside(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current]
    const b = polygon[previous]
    if ((a.y > point.y) !== (b.y > point.y)) {
      const crossingX = (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x
      if (point.x < crossingX) inside = !inside
    }
  }
  return inside
}

/** Inside the polygon, or on its boundary. */
export function pointInPolygonInclusive(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false
  return strictInside(point, polygon) || pointOnBoundary(point, polygon)
}

export function pointStrictlyInside(point: Point, polygon: Point[]): boolean {
  return polygon.length >= 3 && strictInside(point, polygon) && !pointOnBoundary(point, polygon)
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

/** True only when the segments cross at a single interior point; touching and collinear contact are allowed. */
export function segmentsProperlyIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  return (
    ((o1 > CROSS_TOLERANCE && o2 < -CROSS_TOLERANCE) || (o1 < -CROSS_TOLERANCE && o2 > CROSS_TOLERANCE)) &&
    ((o3 > CROSS_TOLERANCE && o4 < -CROSS_TOLERANCE) || (o3 < -CROSS_TOLERANCE && o4 > CROSS_TOLERANCE))
  )
}

function projectRange(polygon: Point[], axis: Point): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const point of polygon) {
    const value = point.x * axis.x + point.y * axis.y
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  return [min, max]
}

/** Separating-axis overlap test for convex polygons. Shared edges and corners are not overlaps. */
export function convexPolygonsOverlap(first: Point[], second: Point[], tolerance = TOUCH_TOLERANCE_CM): boolean {
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index]
      const next = polygon[(index + 1) % polygon.length]
      const length = Math.hypot(next.x - current.x, next.y - current.y)
      if (length === 0) continue
      const axis = { x: (next.y - current.y) / length, y: -(next.x - current.x) / length }
      const [minA, maxA] = projectRange(first, axis)
      const [minB, maxB] = projectRange(second, axis)
      if (Math.min(maxA, maxB) - Math.max(minA, minB) <= tolerance) return false
    }
  }
  return true
}

/** True when `inner` (convex) lies within `outer` (any simple polygon, concave allowed). */
export function polygonContainedIn(inner: Point[], outer: Point[]): boolean {
  if (inner.length < 3 || outer.length < 3) return false
  for (const point of inner) {
    if (!pointInPolygonInclusive(point, outer)) return false
  }
  for (let i = 0; i < inner.length; i += 1) {
    const a = inner[i]
    const b = inner[(i + 1) % inner.length]
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    if (!pointInPolygonInclusive(midpoint, outer)) return false
    for (let j = 0; j < outer.length; j += 1) {
      if (segmentsProperlyIntersect(a, b, outer[j], outer[(j + 1) % outer.length])) return false
    }
  }
  for (const vertex of outer) {
    if (pointStrictlyInside(vertex, inner)) return false
  }
  return true
}

export function polygonCentroid(points: Point[]): Point {
  let area = 0
  let cx = 0
  let cy = 0
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]
    const b = points[(index + 1) % points.length]
    const cross = a.x * b.y - b.x * a.y
    area += cross
    cx += (a.x + b.x) * cross
    cy += (a.y + b.y) * cross
  }
  if (Math.abs(area) < 1e-9) {
    const bounds = polygonBounds(points)
    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
  }
  return { x: cx / (3 * area), y: cy / (3 * area) }
}

/** True if a polygon's edges cross each other. Adjacent edges are allowed to meet at corners. */
export function polygonSelfIntersects(points: Point[]): boolean {
  const count = points.length
  for (let i = 0; i < count; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % count]
    for (let j = i + 1; j < count; j += 1) {
      if (j === i + 1 || (i === 0 && j === count - 1)) continue
      if (segmentsProperlyIntersect(a, b, points[j], points[(j + 1) % count])) return true
    }
  }
  return false
}

export function signedArea(points: Point[]): number {
  let total = 0
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]
    const b = points[(index + 1) % points.length]
    total += a.x * b.y - b.x * a.y
  }
  return total / 2
}

export function normalizeAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

export function angleDifference(first: number, second: number): number {
  const difference = Math.abs(normalizeAngle(first) - normalizeAngle(second))
  return Math.min(difference, 360 - difference)
}
