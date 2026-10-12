import type { LineWallSegment, Point, Room, RoomShape, WallSegment } from './models'
import { RoomShapeKind } from './enums'
import { flattenWallSegment, polygonArea, rectangleRoom, roomBoundaryToPolygon } from './geometry'
import { polygonBounds, polygonSelfIntersects, signedArea, type Bounds } from './polygon'

const ARC_KAPPA = 0.5522847498
const MIN_ROOM_AREA_CM2 = 10_000
const MIN_WALL_LENGTH_CM = 20

export type EditResult<T = Room> = { ok: true; value: T } | { ok: false; error: string }

const ok = <T,>(value: T): EditResult<T> => ({ ok: true, value })
const fail = <T = Room,>(error: string): EditResult<T> => ({ ok: false, error })

export const roomShapeLabels: Record<RoomShape, string> = {
  [RoomShapeKind.Rectangle]: 'Rectangle',
  [RoomShapeKind.LShape]: 'L-shaped',
  [RoomShapeKind.Angled]: 'Angled wall',
  [RoomShapeKind.Rounded]: 'Rounded end',
  [RoomShapeKind.Semicircle]: 'Semicircle',
  [RoomShapeKind.Polygon]: 'Custom polygon',
}

export function roomBounds(room: Pick<Room, 'boundary'>): Bounds {
  return polygonBounds(roomBoundaryToPolygon(room, 2))
}

export function roomCorners(room: Pick<Room, 'boundary'>): Point[] {
  return room.boundary.map((segment) => ({ ...segment.start }))
}

export function wallLength(segment: WallSegment): number {
  const points = flattenWallSegment(segment, 0.5)
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y)
  }
  return total
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function withBounds(room: Room): Room {
  const bounds = roomBounds(room)
  return {
    ...room,
    widthCm: round1(bounds.maxX - bounds.minX),
    depthCm: round1(bounds.maxY - bounds.minY),
  }
}

function lineWalls(points: Point[], prefix = 'wall'): LineWallSegment[] {
  return points.map((point, index) => ({
    id: `${prefix}-${index + 1}`,
    type: 'line' as const,
    start: { ...point },
    end: { ...points[(index + 1) % points.length] },
  }))
}

function baseRoom(id: string, name: string, shape: RoomShape, boundary: WallSegment[]): Room {
  return withBounds({ id, name, shape, boundary, widthCm: 0, depthCm: 0, ceilingHeightCm: 260 })
}

export function createRoom(
  shape: RoomShape,
  widthCm: number,
  depthCm: number,
  name = 'New room',
  id: string = crypto.randomUUID(),
): Room {
  if (!(widthCm >= 100 && depthCm >= 100)) throw new RangeError('Room dimensions must be at least 100 cm.')
  const w = widthCm
  const d = depthCm
  switch (shape) {
    case 'l-shape':
      return baseRoom(id, name, shape, lineWalls([
        { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d * 0.55 },
        { x: w * 0.55, y: d * 0.55 }, { x: w * 0.55, y: d }, { x: 0, y: d },
      ]))
    case 'angled':
      return baseRoom(id, name, shape, lineWalls([
        { x: w * 0.22, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }, { x: 0, y: d * 0.3 },
      ]))
    case 'rounded': {
      const r = Math.min(d / 2, w / 2)
      const k = ARC_KAPPA * r
      return baseRoom(id, name, shape, [
        { id: 'wall-top', type: 'line', start: { x: 0, y: 0 }, end: { x: w - r, y: 0 } },
        {
          id: 'wall-curve-top', type: 'cubic', start: { x: w - r, y: 0 },
          control1: { x: w - r + k, y: 0 }, control2: { x: w, y: r - k }, end: { x: w, y: r },
        },
        {
          id: 'wall-curve-bottom', type: 'cubic', start: { x: w, y: r },
          control1: { x: w, y: r + k }, control2: { x: w - r + k, y: d }, end: { x: w - r, y: d },
        },
        { id: 'wall-bottom', type: 'line', start: { x: w - r, y: d }, end: { x: 0, y: d } },
        { id: 'wall-left', type: 'line', start: { x: 0, y: d }, end: { x: 0, y: 0 } },
      ])
    }
    case 'semicircle': {
      const kx = ARC_KAPPA * w / 2
      const ky = ARC_KAPPA * d
      return baseRoom(id, name, shape, [
        { id: 'wall-flat', type: 'line', start: { x: 0, y: d }, end: { x: w, y: d } },
        {
          id: 'wall-curve-right', type: 'cubic', start: { x: w, y: d },
          control1: { x: w, y: d - ky }, control2: { x: w / 2 + kx, y: 0 }, end: { x: w / 2, y: 0 },
        },
        {
          id: 'wall-curve-left', type: 'cubic', start: { x: w / 2, y: 0 },
          control1: { x: w / 2 - kx, y: 0 }, control2: { x: 0, y: d - ky }, end: { x: 0, y: d },
        },
      ])
    }
    case 'polygon':
    case 'rectangle':
    default: {
      const room = rectangleRoom(w, d)
      return { ...room, id, name, shape: 'rectangle' }
    }
  }
}

export function createPolygonRoom(points: Point[], name = 'Custom room', id = crypto.randomUUID()): Room {
  if (points.length < 3) throw new RangeError('A room outline needs at least three points.')
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    throw new RangeError('Room outline points must be finite numbers.')
  }
  const bounds = polygonBounds(points)
  const normalized = points.map((point) => ({
    x: round1(point.x - bounds.minX),
    y: round1(point.y - bounds.minY),
  }))
  const room = baseRoom(id, name, 'polygon', lineWalls(normalized, `wall-${id.slice(0, 8)}`))
  const error = validateRoom(room)
  if (error) throw new RangeError(error)
  return room
}

export function validateRoom(room: Room): string | null {
  if (room.boundary.length < 3) return 'A room needs at least three walls.'
  for (let index = 0; index < room.boundary.length; index += 1) {
    const segment = room.boundary[index]
    const next = room.boundary[(index + 1) % room.boundary.length]
    if (Math.hypot(segment.end.x - next.start.x, segment.end.y - next.start.y) > 0.01) {
      return 'Walls must form one connected, closed outline.'
    }
    const values = segment.type === 'line'
      ? [segment.start, segment.end]
      : [segment.start, segment.control1, segment.control2, segment.end]
    if (values.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
      return 'Wall coordinates must be finite numbers.'
    }
    if (Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y) < MIN_WALL_LENGTH_CM) {
      return `Walls must be at least ${MIN_WALL_LENGTH_CM} cm long.`
    }
  }
  const polygon = roomBoundaryToPolygon(room, 2)
  if (polygonSelfIntersects(polygon)) return 'Walls must not cross each other.'
  if (polygonArea(polygon) < MIN_ROOM_AREA_CM2) return 'The room must cover at least 1 m².'
  return null
}

function checked(room: Room): EditResult {
  const normalized = withBounds(room)
  const error = validateRoom(normalized)
  return error ? fail(error) : ok(normalized)
}

function mapPoint(point: Point, bounds: Bounds, sx: number, sy: number): Point {
  return { x: bounds.minX + (point.x - bounds.minX) * sx, y: bounds.minY + (point.y - bounds.minY) * sy }
}

/** Scales the whole outline (including curve controls) so its bounding box has the requested size. */
export function scaleRoom(room: Room, widthCm: number, depthCm: number): EditResult {
  const bounds = roomBounds(room)
  const currentWidth = bounds.maxX - bounds.minX
  const currentDepth = bounds.maxY - bounds.minY
  if (currentWidth <= 0 || currentDepth <= 0) return fail('The room has no usable size.')
  const sx = widthCm / currentWidth
  const sy = depthCm / currentDepth
  const boundary = room.boundary.map((segment): WallSegment => segment.type === 'line'
    ? { ...segment, start: mapPoint(segment.start, bounds, sx, sy), end: mapPoint(segment.end, bounds, sx, sy) }
    : {
        ...segment,
        start: mapPoint(segment.start, bounds, sx, sy),
        control1: mapPoint(segment.control1, bounds, sx, sy),
        control2: mapPoint(segment.control2, bounds, sx, sy),
        end: mapPoint(segment.end, bounds, sx, sy),
      })
  return checked({ ...room, boundary })
}

export function moveCorner(room: Room, index: number, point: Point): EditResult {
  const count = room.boundary.length
  if (index < 0 || index >= count) return fail('That corner does not exist.')
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return fail('Corner coordinates must be numbers.')
  const previousIndex = (index - 1 + count) % count
  const current = room.boundary[index].start
  const dx = point.x - current.x
  const dy = point.y - current.y
  const shift = (target: Point): Point => ({ x: target.x + dx, y: target.y + dy })
  const boundary = room.boundary.map((segment, segmentIndex): WallSegment => {
    let next: WallSegment = segment
    if (segmentIndex === index) {
      next = next.type === 'line'
        ? { ...next, start: { ...point } }
        : { ...next, start: { ...point }, control1: shift(next.control1) }
    }
    if (segmentIndex === previousIndex) {
      next = next.type === 'line'
        ? { ...next, end: { ...point } }
        : { ...next, end: { ...point }, control2: shift(next.control2) }
    }
    return next
  })
  return checked({ ...room, shape: 'polygon', boundary })
}

export function setWallLength(room: Room, index: number, lengthCm: number): EditResult {
  const segment = room.boundary[index]
  if (!segment) return fail('That wall does not exist.')
  if (segment.type !== 'line') return fail('Set the length of curved walls by moving their corners.')
  if (!(lengthCm >= MIN_WALL_LENGTH_CM)) return fail(`Walls must be at least ${MIN_WALL_LENGTH_CM} cm long.`)
  const dx = segment.end.x - segment.start.x
  const dy = segment.end.y - segment.start.y
  const current = Math.hypot(dx, dy)
  const end = {
    x: segment.start.x + dx / current * lengthCm,
    y: segment.start.y + dy / current * lengthCm,
  }
  return moveCorner(room, (index + 1) % room.boundary.length, end)
}

export function wallInwardNormal(room: Pick<Room, 'boundary'>, segment: WallSegment): Point {
  const corners = room.boundary.map((wall) => wall.start)
  const dx = segment.end.x - segment.start.x
  const dy = segment.end.y - segment.start.y
  const length = Math.hypot(dx, dy) || 1
  return signedArea(corners) >= 0
    ? { x: -dy / length, y: dx / length }
    : { x: dy / length, y: -dx / length }
}

/** Distance the wall bulges away from the room interior; positive is outward. */
export function wallBulge(room: Pick<Room, 'boundary'>, segment: WallSegment): number {
  if (segment.type === 'line') return 0
  const mid = {
    x: (segment.start.x + 3 * segment.control1.x + 3 * segment.control2.x + segment.end.x) / 8,
    y: (segment.start.y + 3 * segment.control1.y + 3 * segment.control2.y + segment.end.y) / 8,
  }
  const chordMid = { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 }
  const inward = wallInwardNormal(room, segment)
  return -((mid.x - chordMid.x) * inward.x + (mid.y - chordMid.y) * inward.y)
}

export function setWallBulge(room: Room, index: number, bulgeCm: number): EditResult {
  const segment = room.boundary[index]
  if (!segment) return fail('That wall does not exist.')
  if (!Number.isFinite(bulgeCm)) return fail('The curve amount must be a number.')
  const replacement: WallSegment = Math.abs(bulgeCm) < 0.5
    ? { id: segment.id, type: 'line', start: segment.start, end: segment.end }
    : (() => {
        const outward = wallInwardNormal(room, segment)
        const push = -(4 / 3) * bulgeCm
        const offset = { x: outward.x * push, y: outward.y * push }
        const dx = segment.end.x - segment.start.x
        const dy = segment.end.y - segment.start.y
        return {
          id: segment.id,
          type: 'cubic' as const,
          start: segment.start,
          control1: { x: segment.start.x + dx / 3 + offset.x, y: segment.start.y + dy / 3 + offset.y },
          control2: { x: segment.start.x + dx * 2 / 3 + offset.x, y: segment.start.y + dy * 2 / 3 + offset.y },
          end: segment.end,
        }
      })()
  return checked({
    ...room,
    shape: 'polygon',
    boundary: room.boundary.map((wall, wallIndex) => wallIndex === index ? replacement : wall),
  })
}

export interface CornerInsertion {
  room: Room
  splitWallId: string
  newWallId: string
  firstLengthCm: number
}

export function insertCorner(room: Room, index: number, near?: Point): EditResult<CornerInsertion> {
  const segment = room.boundary[index]
  if (!segment) return fail('That wall does not exist.')
  if (segment.type !== 'line') return fail('Corners can only be added to straight walls.')
  const dx = segment.end.x - segment.start.x
  const dy = segment.end.y - segment.start.y
  const lengthSquared = dx * dx + dy * dy
  let t = 0.5
  if (near) {
    t = ((near.x - segment.start.x) * dx + (near.y - segment.start.y) * dy) / lengthSquared
    t = Math.min(0.9, Math.max(0.1, t))
  }
  const point = { x: round1(segment.start.x + dx * t), y: round1(segment.start.y + dy * t) }
  const newWallId = `wall-${crypto.randomUUID().slice(0, 8)}`
  const first: WallSegment = { ...segment, end: point }
  const second: WallSegment = { id: newWallId, type: 'line', start: point, end: segment.end }
  const boundary = [...room.boundary.slice(0, index), first, second, ...room.boundary.slice(index + 1)]
  const result = checked({ ...room, shape: 'polygon', boundary })
  if (!result.ok) return fail(result.error)
  return ok({
    room: result.value,
    splitWallId: segment.id,
    newWallId,
    firstLengthCm: Math.hypot(point.x - segment.start.x, point.y - segment.start.y),
  })
}

export function removeCorner(room: Room, index: number): EditResult<{ room: Room; removedWallIds: string[] }> {
  const count = room.boundary.length
  if (count <= 3) return fail('A room needs at least three corners.')
  const previousIndex = (index - 1 + count) % count
  const previous = room.boundary[previousIndex]
  const current = room.boundary[index]
  if (!previous || !current) return fail('That corner does not exist.')
  if (previous.type !== 'line' || current.type !== 'line') return fail('Corners between curved walls cannot be removed.')
  const merged: WallSegment = { id: previous.id, type: 'line', start: previous.start, end: current.end }
  const boundary = room.boundary
    .map((segment, segmentIndex) => segmentIndex === previousIndex ? merged : segment)
    .filter((_, segmentIndex) => segmentIndex !== index)
  const result = checked({ ...room, shape: 'polygon', boundary })
  if (!result.ok) return fail(result.error)
  return ok({ room: result.value, removedWallIds: [previous.id, current.id] })
}

export function findNearestWall(
  room: Pick<Room, 'boundary'>,
  point: Point,
  maxDistanceCm: number,
): { index: number; distance: number } | null {
  let best: { index: number; distance: number } | null = null
  room.boundary.forEach((segment, index) => {
    const points = flattenWallSegment(segment, 2)
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]
      const b = points[i]
      const abx = b.x - a.x
      const aby = b.y - a.y
      const lengthSquared = abx * abx + aby * aby || 1
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSquared))
      const distance = Math.hypot(point.x - (a.x + abx * t), point.y - (a.y + aby * t))
      if (distance <= maxDistanceCm && (!best || distance < best.distance)) best = { index, distance }
    }
  })
  return best
}
