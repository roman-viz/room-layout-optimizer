import type { LineWallSegment, Point, Room, WallOpening } from './models'
import { wallInwardNormal, wallLength } from './rooms'
import { pointInPolygonInclusive } from './polygon'
import { roomBoundaryToPolygon } from './geometry'

export interface OpeningGeometry {
  wall: LineWallSegment
  wallIndex: number
  start: Point
  end: Point
  direction: Point
  inward: Point
}

export interface DoorSwingGeometry {
  hinge: Point
  closedEnd: Point
  openEnd: Point
  inward: Point
  angleDeg: number
  maxAngleDeg: number
  rotationSign: number
}

function rotateVector(vector: Point, degrees: number): Point {
  const radians = degrees * Math.PI / 180
  return {
    x: vector.x * Math.cos(radians) - vector.y * Math.sin(radians),
    y: vector.x * Math.sin(radians) + vector.y * Math.cos(radians),
  }
}

function doorLeafAtAngle(geometry: OpeningGeometry, opening: WallOpening, angleDeg: number): { hinge: Point; end: Point; rotationSign: number } {
  const hingeAtEnd = opening.swing === 'right'
  const hinge = hingeAtEnd ? geometry.end : geometry.start
  const closedVector = {
    x: geometry.direction.x * opening.widthCm * (hingeAtEnd ? -1 : 1),
    y: geometry.direction.y * opening.widthCm * (hingeAtEnd ? -1 : 1),
  }
  const inward = opening.swingDirection === 'outward'
    ? { x: -geometry.inward.x, y: -geometry.inward.y }
    : geometry.inward
  const cross = closedVector.x * inward.y - closedVector.y * inward.x
  const rotationSign = Math.sign(cross) || 1
  const vector = rotateVector(closedVector, rotationSign * angleDeg)
  return { hinge, end: { x: hinge.x + vector.x, y: hinge.y + vector.y }, rotationSign }
}

function doorAngleFitsRoom(geometry: OpeningGeometry, opening: WallOpening, angleDeg: number, polygon: Point[]): boolean {
  if (opening.swingDirection === 'outward') return true
  const leaf = doorLeafAtAngle(geometry, opening, angleDeg)
  for (let pointIndex = 1; pointIndex <= 5; pointIndex += 1) {
    const fraction = pointIndex / 5
    const point = {
      x: leaf.hinge.x + (leaf.end.x - leaf.hinge.x) * fraction,
      y: leaf.hinge.y + (leaf.end.y - leaf.hinge.y) * fraction,
    }
    if (!pointInPolygonInclusive(point, polygon)) return false
  }
  return true
}

export function maxDoorSwingAngle(room: Room, opening: WallOpening): number {
  if (opening.type !== 'door') return 180
  if (opening.swingDirection === 'outward') return 180
  const geometry = openingGeometry(room, opening)
  if (!geometry) return 0
  const polygon = roomBoundaryToPolygon(room)
  let maxAngle = 0
  for (let angle = 1; angle <= 180; angle += 1) {
    if (!doorAngleFitsRoom(geometry, opening, angle, polygon)) break
    maxAngle = angle
  }
  return maxAngle
}

export function doorSwingGeometry(room: Room, opening: WallOpening): DoorSwingGeometry | null {
  const geometry = openingGeometry(room, opening)
  if (!geometry || opening.type !== 'door') return null
  const maxAngleDeg = maxDoorSwingAngle(room, opening)
  const angleDeg = Math.max(0, Math.min(opening.swingAngleDeg ?? 90, maxAngleDeg))
  const leaf = doorLeafAtAngle(geometry, opening, angleDeg)
  const closed = doorLeafAtAngle(geometry, opening, 0)
  return {
    hinge: leaf.hinge,
    closedEnd: closed.end,
    openEnd: leaf.end,
    inward: opening.swingDirection === 'outward'
      ? { x: -geometry.inward.x, y: -geometry.inward.y }
      : geometry.inward,
    angleDeg,
    maxAngleDeg,
    rotationSign: leaf.rotationSign,
  }
}

export function clampDoorSwingAngle(room: Room, opening: WallOpening, angleDeg: number): number {
  const safeAngle = Number.isFinite(angleDeg) ? Math.max(0, Math.min(180, angleDeg)) : 90
  return Math.min(safeAngle, maxDoorSwingAngle(room, opening))
}

export function openingGeometry(room: Room, opening: WallOpening): OpeningGeometry | null {
  const wallIndex = room.boundary.findIndex((segment) => segment.id === opening.wallSegmentId)
  const wall = room.boundary[wallIndex]
  if (!wall || wall.type !== 'line') return null
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
  if (length === 0) return null
  const direction = { x: (wall.end.x - wall.start.x) / length, y: (wall.end.y - wall.start.y) / length }
  const start = {
    x: wall.start.x + direction.x * opening.offsetFromStartCm,
    y: wall.start.y + direction.y * opening.offsetFromStartCm,
  }
  const end = { x: start.x + direction.x * opening.widthCm, y: start.y + direction.y * opening.widthCm }
  return { wall, wallIndex, start, end, direction, inward: wallInwardNormal(room, wall) }
}

export function openingPlacementNearPoint(
  room: Room,
  opening: WallOpening,
  siblings: WallOpening[],
  point: Point,
  grabOffsetCm: number,
  maxWallDistanceCm: number,
): { wallSegmentId: string; offsetFromStartCm: number } | null {
  const candidates: {
    wallSegmentId: string
    offsetFromStartCm: number
    distance: number
    valid: boolean
  }[] = []
  for (const wall of room.boundary) {
    if (wall.type !== 'line') continue
    const dx = wall.end.x - wall.start.x
    const dy = wall.end.y - wall.start.y
    const length = Math.hypot(dx, dy)
    if (length < opening.widthCm) continue
    const along = ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / length
    const projected = {
      x: wall.start.x + dx / length * Math.max(0, Math.min(length, along)),
      y: wall.start.y + dy / length * Math.max(0, Math.min(length, along)),
    }
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y)
    if (wall.id !== opening.wallSegmentId && distance > maxWallDistanceCm) continue
    const offsetFromStartCm = clampOpeningOffset(room, { ...opening, wallSegmentId: wall.id }, along - grabOffsetCm)
    const candidate = { ...opening, wallSegmentId: wall.id, offsetFromStartCm }
    candidates.push({
      wallSegmentId: wall.id,
      offsetFromStartCm,
      distance,
      valid: !validateOpening(room, candidate, siblings),
    })
  }
  candidates.sort((first, second) => first.distance - second.distance)
  const nearest = candidates[0]
  return nearest?.valid
    ? { wallSegmentId: nearest.wallSegmentId, offsetFromStartCm: nearest.offsetFromStartCm }
    : null
}

export function defaultClearanceDepth(opening: WallOpening): number {
  return opening.type === 'door' ? opening.widthCm : 40
}

/** Floor area in front of an opening that must stay free (hard for doors, soft for windows). */
export function openingClearancePolygon(room: Room, opening: WallOpening): Point[] | null {
  const geometry = openingGeometry(room, opening)
  if (!geometry) return null
  const depth = defaultClearanceDepth(opening)
  const { start, end, inward } = geometry
  return [
    start,
    end,
    { x: end.x + inward.x * depth, y: end.y + inward.y * depth },
    { x: start.x + inward.x * depth, y: start.y + inward.y * depth },
  ]
}

export function validateOpening(room: Room, opening: WallOpening, siblings: WallOpening[]): string | null {
  const wall = room.boundary.find((segment) => segment.id === opening.wallSegmentId)
  if (!wall) return 'This opening is not attached to an existing wall.'
  if (wall.type !== 'line') return 'Doors and windows can only be placed on straight walls.'
  if (!(opening.widthCm >= 30)) return 'Openings must be at least 30 cm wide.'
  if (!(opening.heightCm > 0)) return 'Opening height must be greater than zero.'
  if (opening.type === 'door' && opening.swingAngleDeg !== undefined &&
    (!Number.isFinite(opening.swingAngleDeg) || opening.swingAngleDeg < 0 || opening.swingAngleDeg > 180)) {
    return 'A door opening angle must be between 0 and 180 degrees.'
  }
  if (opening.offsetFromStartCm < 0) return 'The opening starts before the wall does.'
  if (opening.offsetFromStartCm + opening.widthCm > wallLength(wall) + 0.01) {
    return 'The opening is wider than the space left on its wall.'
  }
  const overlaps = siblings.some((other) =>
    other.id !== opening.id &&
    other.wallSegmentId === opening.wallSegmentId &&
    opening.offsetFromStartCm < other.offsetFromStartCm + other.widthCm &&
    other.offsetFromStartCm < opening.offsetFromStartCm + opening.widthCm)
  return overlaps ? 'Another door or window already occupies this part of the wall.' : null
}

export function createOpening(room: Room, openings: WallOpening[], type: WallOpening['type']): WallOpening | null {
  const widthCm = type === 'door' ? 90 : 120
  const label = type === 'door' ? 'Door' : 'Window'
  const nextNameIndex = openings.reduce((max, opening) => {
    if (opening.type !== type) return max
    const match = opening.name?.match(new RegExp(`^${label} (\\d+)$`))
    return match ? Math.max(max, Number(match[1])) : max
  }, openings.filter((opening) => opening.type === type).length) + 1
  const walls = room.boundary
    .filter((segment): segment is LineWallSegment => segment.type === 'line')
    .map((segment) => ({ segment, length: wallLength(segment) }))
    .sort((a, b) => b.length - a.length)
  for (const { segment, length } of walls) {
    for (let offset = Math.round((length - widthCm) / 2 / 10) * 10; offset >= 0; offset -= 10) {
      const candidate: WallOpening = {
        id: crypto.randomUUID(),
        type,
        name: `${label} ${nextNameIndex}`,
        wallSegmentId: segment.id,
        offsetFromStartCm: offset,
        widthCm,
        heightCm: type === 'door' ? 210 : 120,
        ...(type === 'window'
          ? { sillHeightCm: 90 }
          : { swing: 'left' as const, swingDirection: 'inward' as const, swingAngleDeg: 90 }),
      }
      if (!validateOpening(room, candidate, openings)) {
        if (candidate.type === 'door') candidate.swingAngleDeg = clampDoorSwingAngle(room, candidate, candidate.swingAngleDeg ?? 90)
        return candidate
      }
      const flipped = Math.min(length - widthCm, length - offset - widthCm + 10)
      if (flipped >= 0 && !validateOpening(room, { ...candidate, offsetFromStartCm: flipped }, openings)) {
        return { ...candidate, offsetFromStartCm: flipped }
      }
    }
  }
  return null
}

export function clampOpeningOffset(room: Room, opening: WallOpening, offsetCm: number): number {
  const wall = room.boundary.find((segment) => segment.id === opening.wallSegmentId)
  const length = wall ? wallLength(wall) : 0
  return Math.max(0, Math.min(Math.max(0, length - opening.widthCm), offsetCm))
}
