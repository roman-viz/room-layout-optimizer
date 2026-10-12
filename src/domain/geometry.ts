import type { Point, Room, WallSegment } from './models'

const DEFAULT_CURVE_TOLERANCE_CM = 1
const MAX_SUBDIVISION_DEPTH = 16

function distance(first: Point, second: Point): number {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

function distanceFromLine(point: Point, start: Point, end: Point): number {
  const lineLength = distance(start, end)
  if (lineLength === 0) return distance(point, start)
  return Math.abs(
    (end.y - start.y) * point.x -
    (end.x - start.x) * point.y +
    end.x * start.y -
    end.y * start.x,
  ) / lineLength
}

function midpoint(first: Point, second: Point): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
}

function splitCubic(segment: Extract<WallSegment, { type: 'cubic' }>): [typeof segment, typeof segment] {
  const firstControlMidpoint = midpoint(segment.start, segment.control1)
  const controlMidpoint = midpoint(segment.control1, segment.control2)
  const lastControlMidpoint = midpoint(segment.control2, segment.end)
  const leftControlMidpoint = midpoint(firstControlMidpoint, controlMidpoint)
  const rightControlMidpoint = midpoint(controlMidpoint, lastControlMidpoint)
  const center = midpoint(leftControlMidpoint, rightControlMidpoint)

  return [
    {
      ...segment,
      control1: firstControlMidpoint,
      control2: leftControlMidpoint,
      end: center,
    },
    {
      ...segment,
      start: center,
      control1: rightControlMidpoint,
      control2: lastControlMidpoint,
    },
  ]
}

function flattenCubic(
  segment: Extract<WallSegment, { type: 'cubic' }>,
  tolerance: number,
  depth: number,
  points: Point[],
): void {
  const flatness = Math.max(
    distanceFromLine(segment.control1, segment.start, segment.end),
    distanceFromLine(segment.control2, segment.start, segment.end),
  )

  if (flatness <= tolerance || depth >= MAX_SUBDIVISION_DEPTH) {
    points.push(segment.end)
    return
  }

  const [left, right] = splitCubic(segment)
  flattenCubic(left, tolerance, depth + 1, points)
  flattenCubic(right, tolerance, depth + 1, points)
}

export function flattenWallSegment(
  segment: WallSegment,
  toleranceCm = DEFAULT_CURVE_TOLERANCE_CM,
): Point[] {
  if (toleranceCm <= 0) {
    throw new RangeError('Curve tolerance must be greater than zero.')
  }
  if (segment.type === 'line') return [segment.start, segment.end]

  const points = [segment.start]
  flattenCubic(segment, toleranceCm, 0, points)
  return points
}

export function roomBoundaryToPolygon(
  room: Pick<Room, 'boundary'>,
  toleranceCm = DEFAULT_CURVE_TOLERANCE_CM,
): Point[] {
  const points: Point[] = []
  for (const segment of room.boundary) {
    const flattened = flattenWallSegment(segment, toleranceCm)
    points.push(...(points.length > 0 ? flattened.slice(1) : flattened))
  }
  if (points.length > 1 && distance(points[0], points[points.length - 1]) === 0) {
    points.pop()
  }
  return points
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false

  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const currentPoint = polygon[current]
    const previousPoint = polygon[previous]
    const crossesRay = (currentPoint.y > point.y) !== (previousPoint.y > point.y)
    if (!crossesRay) continue

    const crossingX = (
      (previousPoint.x - currentPoint.x) * (point.y - currentPoint.y) /
      (previousPoint.y - currentPoint.y)
    ) + currentPoint.x
    if (point.x < crossingX) inside = !inside
  }
  return inside
}

export function polygonArea(polygon: Point[]): number {
  if (polygon.length < 3) return 0
  let doubleArea = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]
    doubleArea += current.x * next.y - next.x * current.y
  }
  return Math.abs(doubleArea) / 2
}

export function roomAreaCm2(room: Pick<Room, 'boundary'>, toleranceCm?: number): number {
  return polygonArea(roomBoundaryToPolygon(room, toleranceCm))
}

export function rectangleRoom(widthCm: number, depthCm: number): Room {
  if (widthCm <= 0 || depthCm <= 0) {
    throw new RangeError('Room dimensions must be greater than zero.')
  }
  return {
    id: 'room-main',
    name: 'Main room',
    shape: 'rectangle',
    widthCm,
    depthCm,
    ceilingHeightCm: 260,
    boundary: [
      { id: 'wall-top', type: 'line', start: { x: 0, y: 0 }, end: { x: widthCm, y: 0 } },
      { id: 'wall-right', type: 'line', start: { x: widthCm, y: 0 }, end: { x: widthCm, y: depthCm } },
      { id: 'wall-bottom', type: 'line', start: { x: widthCm, y: depthCm }, end: { x: 0, y: depthCm } },
      { id: 'wall-left', type: 'line', start: { x: 0, y: depthCm }, end: { x: 0, y: 0 } },
    ],
  }
}
