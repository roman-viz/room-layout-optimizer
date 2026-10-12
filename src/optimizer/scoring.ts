import type { FurnitureItem, Point, RestrictionZone, Room, WallOpening } from '../domain/models'
import { roomBoundaryToPolygon } from '../domain/geometry'
import { clearanceFor } from '../domain/library'
import { openingClearancePolygon } from '../domain/openings'
import {
  angleDifference,
  convexPolygonsOverlap,
  distanceToSegment,
  frontDirection,
  furnitureFootprint,
  pointInPolygonInclusive,
  polygonBounds,
} from '../domain/polygon'
import { isHardZone } from '../domain/validation'
import type { OptimizationMode, ScoreComponents } from './types'
import { OptimizationGoal } from '../domain/enums'

export const modeWeights: Record<OptimizationMode, ScoreComponents> = {
  [OptimizationGoal.Natural]: {
    usableSpace: 0.08, connectivity: 0.05, circulation: 0.14, access: 0.14, openings: 0.06,
    relationships: 0.18, wallAlignment: 0.15, compactness: 0.02, movement: 0.16, zones: 0.02,
  },
  [OptimizationGoal.FreeSpace]: {
    usableSpace: 0.25, connectivity: 0.15, circulation: 0.18, access: 0.1, openings: 0.04,
    relationships: 0.03, wallAlignment: 0.06, compactness: 0.15, movement: 0.02, zones: 0.02,
  },
  [OptimizationGoal.Balanced]: {
    usableSpace: 0.14, connectivity: 0.09, circulation: 0.16, access: 0.13, openings: 0.06,
    relationships: 0.12, wallAlignment: 0.11, compactness: 0.06, movement: 0.1, zones: 0.03,
  },
}

export const modeLabels: Record<OptimizationMode, { name: string; description: string }> = {
  [OptimizationGoal.Natural]: { name: 'Natural', description: 'Intuitive grouping and wall alignment; stays close to your current layout.' },
  [OptimizationGoal.FreeSpace]: { name: 'Max free space', description: 'Largest connected open floor while keeping routes and access.' },
  [OptimizationGoal.Balanced]: { name: 'Balanced', description: 'Even trade-off between open floor, circulation, grouping and change.' },
}

export function weightedTotal(components: ScoreComponents, weights: ScoreComponents): number {
  let total = 0
  let weightSum = 0
  for (const key of Object.keys(weights) as (keyof ScoreComponents)[]) {
    total += components[key] * weights[key]
    weightSum += weights[key]
  }
  return weightSum === 0 ? 0 : total / weightSum
}

export function isWallPreferred(item: FurnitureItem): boolean {
  return (
    item.category === 'bed' || item.category === 'storage' || item.category === 'shelf' ||
    item.category === 'media' || item.category === 'kitchen' ||
    item.type === 'sofa' || item.type === 'writing-desk'
  )
}

export interface WallEdge {
  start: Point
  end: Point
  length: number
  angleDeg: number
}

export function wallEdges(polygon: Point[]): WallEdge[] {
  return polygon.map((start, index) => {
    const end = polygon[(index + 1) % polygon.length]
    return {
      start,
      end,
      length: Math.hypot(end.x - start.x, end.y - start.y),
      angleDeg: Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI,
    }
  })
}

function edgeContact(a: Point, b: Point, edges: WallEdge[], tolerance: number): boolean {
  const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
  return edges.some((edge) => {
    if (edge.length < 12) return false
    const diff = angleDifference(angle, edge.angleDeg)
    if (Math.min(diff, 180 - diff) > 3) return false
    return distanceToSegment(a, edge.start, edge.end) <= tolerance && distanceToSegment(b, edge.start, edge.end) <= tolerance
  })
}

/** 1 when the back is flush with a wall, 0.6 for a side flush with a wall, 0.3 when only square to the room. */
export function wallContactScore(item: FurnitureItem, edges: WallEdge[]): number {
  const corners = furnitureFootprint(item)
  if (edgeContact(corners[0], corners[1], edges, 4)) return 1
  if (edgeContact(corners[1], corners[2], edges, 4) || edgeContact(corners[3], corners[0], edges, 4)) return 0.6
  if (edgeContact(corners[2], corners[3], edges, 4)) return 0.4
  return item.rotationDeg % 90 === 0 ? 0.3 : 0
}

function pointInConvex(point: Point, polygon: Point[]): boolean {
  let sign = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]
    const b = polygon[(index + 1) % polygon.length]
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
    if (Math.abs(cross) < 1e-9) continue
    const current = cross > 0 ? 1 : -1
    if (sign === 0) sign = current
    else if (sign !== current) return false
  }
  return true
}

export interface ScoreContext {
  room: Room
  openings: WallOpening[]
  zones: RestrictionZone[]
  original: FurnitureItem[]
}

export interface ScoreResult {
  components: ScoreComponents
  freeSpacePercent: number
}

interface Grid {
  cell: number
  minX: number
  minY: number
  cols: number
  rows: number
  inside: Uint8Array
  insideCount: number
}

export function createScorer(context: ScoreContext) {
  const roomPolygon = roomBoundaryToPolygon(context.room, 3)
  const edges = wallEdges(roomPolygon)
  const bounds = polygonBounds(roomPolygon)
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxY - bounds.minY
  const cell = Math.max(10, Math.ceil(Math.sqrt(width * depth / 4500) / 5) * 5)
  const grid: Grid = {
    cell,
    minX: bounds.minX,
    minY: bounds.minY,
    cols: Math.max(1, Math.ceil(width / cell)),
    rows: Math.max(1, Math.ceil(depth / cell)),
    inside: new Uint8Array(0),
    insideCount: 0,
  }
  grid.inside = new Uint8Array(grid.cols * grid.rows)
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const center = { x: grid.minX + (col + 0.5) * cell, y: grid.minY + (row + 0.5) * cell }
      if (pointInPolygonInclusive(center, roomPolygon)) {
        grid.inside[row * grid.cols + col] = 1
        grid.insideCount += 1
      }
    }
  }

  const size = grid.cols * grid.rows
  const erosion = Math.max(1, Math.floor(25 / cell))
  const diagonal = Math.hypot(width, depth)
  const doorEntries = context.openings
    .filter((opening) => opening.type === 'door')
    .map((opening) => openingClearancePolygon(context.room, opening))
    .filter((polygon): polygon is Point[] => polygon !== null)
    .map((polygon) => ({
      x: (polygon[0].x + polygon[1].x + polygon[2].x + polygon[3].x) / 4,
      y: (polygon[0].y + polygon[1].y + polygon[2].y + polygon[3].y) / 4,
    }))
  const windows = context.openings
    .filter((opening) => opening.type === 'window')
    .map((opening) => ({ opening, polygon: openingClearancePolygon(context.room, opening) }))
    .filter((entry): entry is { opening: WallOpening; polygon: Point[] } => entry.polygon !== null)
  const softZones = context.zones
    .filter((zone) => !isHardZone(zone) && zone.boundary.length >= 3 && (zone.type === 'walking-path' || zone.type === 'required-clearance'))
    .map((zone) => ({ polygon: zone.boundary, bounds: polygonBounds(zone.boundary) }))
  const originalById = new Map(context.original.map((item) => [item.id, item]))

  const cellIndexAt = (point: Point): number => {
    const col = Math.floor((point.x - grid.minX) / cell)
    const row = Math.floor((point.y - grid.minY) / cell)
    return col < 0 || row < 0 || col >= grid.cols || row >= grid.rows ? -1 : row * grid.cols + col
  }

  /** Number of set cells inside the (2r+1)² window around each cell, clamped to the grid. */
  const windowCounts = (mask: Uint8Array, radius: number): Uint16Array => {
    const horizontal = new Uint16Array(size)
    for (let row = 0; row < grid.rows; row += 1) {
      const base = row * grid.cols
      const prefix = new Uint16Array(grid.cols + 1)
      for (let col = 0; col < grid.cols; col += 1) prefix[col + 1] = prefix[col] + mask[base + col]
      for (let col = 0; col < grid.cols; col += 1) {
        horizontal[base + col] = prefix[Math.min(grid.cols, col + radius + 1)] - prefix[Math.max(0, col - radius)]
      }
    }
    const counts = new Uint16Array(size)
    for (let col = 0; col < grid.cols; col += 1) {
      const prefix = new Uint32Array(grid.rows + 1)
      for (let row = 0; row < grid.rows; row += 1) prefix[row + 1] = prefix[row] + horizontal[row * grid.cols + col]
      for (let row = 0; row < grid.rows; row += 1) {
        counts[row * grid.cols + col] = prefix[Math.min(grid.rows, row + radius + 1)] - prefix[Math.max(0, row - radius)]
      }
    }
    return counts
  }

  const anyNeighbor = (index: number, radius: number, test: (neighbor: number) => boolean): boolean => {
    const col = index % grid.cols
    const row = Math.floor(index / grid.cols)
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const r = row + dy
        const c = col + dx
        if (r >= 0 && c >= 0 && r < grid.rows && c < grid.cols && test(r * grid.cols + c)) return true
      }
    }
    return false
  }

  const fullWindows = windowCounts(new Uint8Array(size).fill(1), erosion)

  function rasterize(items: FurnitureItem[]): Uint8Array {
    const occupied = new Uint8Array(size)
    for (const item of items) {
      const polygon = furnitureFootprint(item)
      const box = polygonBounds(polygon)
      const c0 = Math.max(0, Math.floor((box.minX - grid.minX) / cell))
      const c1 = Math.min(grid.cols - 1, Math.floor((box.maxX - grid.minX) / cell))
      const r0 = Math.max(0, Math.floor((box.minY - grid.minY) / cell))
      const r1 = Math.min(grid.rows - 1, Math.floor((box.maxY - grid.minY) / cell))
      for (let row = r0; row <= r1; row += 1) {
        for (let col = c0; col <= c1; col += 1) {
          const center = { x: grid.minX + (col + 0.5) * cell, y: grid.minY + (row + 0.5) * cell }
          if (pointInConvex(center, polygon)) occupied[row * grid.cols + col] = 1
        }
      }
    }
    return occupied
  }

  function flood(passable: (index: number) => boolean, seeds: number[]): { visited: Uint8Array; cells: number[] } {
    const visited = new Uint8Array(size)
    const queue: number[] = []
    for (const seed of seeds) {
      if (seed >= 0 && !visited[seed] && passable(seed)) {
        visited[seed] = 1
        queue.push(seed)
      }
    }
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head]
      const col = index % grid.cols
      const row = (index - col) / grid.cols
      const around = [
        col > 0 ? index - 1 : -1,
        col < grid.cols - 1 ? index + 1 : -1,
        row > 0 ? index - grid.cols : -1,
        row < grid.rows - 1 ? index + grid.cols : -1,
      ]
      for (const next of around) {
        if (next >= 0 && !visited[next] && passable(next)) {
          visited[next] = 1
          queue.push(next)
        }
      }
    }
    return { visited, cells: queue }
  }

  function largestComponent(passable: (index: number) => boolean): { cells: number[]; mask: Uint8Array } {
    const seen = new Uint8Array(size)
    let best: number[] = []
    for (let start = 0; start < size; start += 1) {
      if (seen[start] || !passable(start)) continue
      const { cells } = flood(passable, [start])
      for (const index of cells) seen[index] = 1
      if (cells.length > best.length) best = cells
    }
    const mask = new Uint8Array(size)
    for (const index of best) mask[index] = 1
    return { cells: best, mask }
  }

  function areaInFront(item: FurnitureItem, others: FurnitureItem[], depthCm: number, side: 'front' | 'left' | 'right'): number {
    const front = frontDirection(item.rotationDeg)
    const right = { x: -front.y, y: front.x }
    const out = side === 'front' ? front : side === 'right' ? right : { x: -right.x, y: -right.y }
    const across = side === 'front' ? right : front
    const startOffset = side === 'front' ? item.depthCm / 2 : item.widthCm / 2
    const span = side === 'front' ? item.widthCm : item.depthCm
    const nAcross = Math.max(2, Math.ceil(span / 20))
    const nOut = Math.max(1, Math.ceil(depthCm / 20))
    const polygons = others.map((other) => furnitureFootprint(other))
    let free = 0
    for (let i = 0; i < nAcross; i += 1) {
      const a = ((i + 0.5) / nAcross - 0.5) * span
      for (let j = 0; j < nOut; j += 1) {
        const o = startOffset + ((j + 0.5) / nOut) * depthCm
        const point = {
          x: item.position.x + across.x * a + out.x * o,
          y: item.position.y + across.y * a + out.y * o,
        }
        if (pointInPolygonInclusive(point, roomPolygon) && !polygons.some((polygon) => pointInConvex(point, polygon))) free += 1
      }
    }
    return free / (nAcross * nOut)
  }

  function accessScore(item: FurnitureItem, furniture: FurnitureItem[]): number | null {
    const clearance = clearanceFor(item)
    if (clearance <= 0 || item.category === 'chair') return null
    const others = furniture.filter((other) => other.id !== item.id && other.category !== 'chair')
    const front = areaInFront(item, others, clearance, 'front')
    if (item.category !== 'bed') return front
    return Math.max(front, areaInFront(item, others, clearance, 'left'), areaInFront(item, others, clearance, 'right'))
  }

  function relationshipScore(furniture: FurnitureItem[]): number {
    const scores: number[] = []
    const tables = furniture.filter((item) => item.category === 'table' && item.type !== 'coffee-table')
    const sofas = furniture.filter((item) => item.type === 'sofa')
    const beds = furniture.filter((item) => item.category === 'bed')
    const facing = (item: FurnitureItem, target: Point): number => {
      const front = frontDirection(item.rotationDeg)
      const dx = target.x - item.position.x
      const dy = target.y - item.position.y
      return (front.x * dx + front.y * dy) / (Math.hypot(dx, dy) || 1)
    }
    const distanceToItem = (point: Point, item: FurnitureItem): number => {
      const polygon = furnitureFootprint(item)
      if (pointInConvex(point, polygon)) return 0
      return Math.min(...polygon.map((corner, index) => distanceToSegment(point, corner, polygon[(index + 1) % 4])))
    }
    for (const chair of furniture.filter((item) => item.category === 'chair')) {
      if (tables.length === 0) continue
      const nearest = tables.reduce((best, table) =>
        distanceToItem(chair.position, table) < distanceToItem(chair.position, best) ? table : best)
      const rotationDifference = angleDifference(chair.rotationDeg, nearest.rotationDeg)
      const depthFacesTable = rotationDifference < 45 || rotationDifference > 135
      const distance = distanceToItem(chair.position, nearest) - (depthFacesTable ? chair.depthCm : chair.widthCm) / 2
      let score = distance <= 25 ? 1 : distance <= 70 ? 0.6 : 0.1
      if (facing(chair, nearest.position) < 0.5) score *= 0.6
      scores.push(score)
    }
    for (const armchair of furniture.filter((item) => item.type === 'armchair')) {
      if (sofas.length === 0) continue
      const distance = Math.min(...sofas.map((sofa) => distanceToItem(armchair.position, sofa)))
      const nearest = sofas.reduce((best, sofa) =>
        distanceToItem(armchair.position, sofa) < distanceToItem(armchair.position, best) ? sofa : best)
      let score = distance <= 220 ? 1 : distance <= 320 ? 0.6 : 0.2
      if (facing(armchair, nearest.position) < 0.2) score *= 0.6
      scores.push(score)
    }
    for (const coffee of furniture.filter((item) => item.type === 'coffee-table')) {
      if (sofas.length === 0) continue
      scores.push(Math.max(...sofas.map((sofa) => {
        const front = frontDirection(sofa.rotationDeg)
        const dx = coffee.position.x - sofa.position.x
        const dy = coffee.position.y - sofa.position.y
        const forward = dx * front.x + dy * front.y - sofa.depthCm / 2 - coffee.depthCm / 2
        const side = Math.abs(dx * -front.y + dy * front.x)
        if (forward >= 10 && forward <= 80 && side < sofa.widthCm / 2) return 1
        return forward > 0 && forward < 160 ? 0.4 : 0.1
      })))
    }
    for (const stand of furniture.filter((item) => item.type === 'tv-stand')) {
      if (sofas.length === 0) continue
      scores.push(Math.max(...sofas.map((sofa) => {
        const distance = Math.hypot(stand.position.x - sofa.position.x, stand.position.y - sofa.position.y)
        const sofaLooks = facing(sofa, stand.position)
        const standLooks = facing(stand, sofa.position)
        if (distance >= 150 && distance <= 450 && sofaLooks > 0.85 && standLooks > 0.85) return 1
        return sofaLooks > 0.6 ? 0.4 : 0.1
      })))
    }
    for (const stand of furniture.filter((item) => item.type === 'nightstand')) {
      if (beds.length === 0) continue
      scores.push(Math.max(...beds.map((bed) => {
        const distance = distanceToItem(stand.position, bed) - stand.widthCm / 2
        const aligned = angleDifference(bed.rotationDeg, stand.rotationDeg) < 10
        if (distance <= 15 && aligned) return 1
        return distance <= 60 ? 0.5 : 0.1
      })))
    }
    return scores.length === 0 ? 1 : scores.reduce((sum, value) => sum + value, 0) / scores.length
  }

  function score(furniture: FurnitureItem[]): ScoreResult {
    const occupied = rasterize(furniture)
    const isFree = (index: number) => grid.inside[index] === 1 && occupied[index] === 0
    let freeCount = 0
    for (let index = 0; index < size; index += 1) if (isFree(index)) freeCount += 1

    const walkable = new Uint8Array(size)
    for (let index = 0; index < size; index += 1) walkable[index] = isFree(index) || grid.inside[index] === 0 ? 1 : 0
    const walkableCounts = windowCounts(walkable, erosion)
    const passableMask = new Uint8Array(size)
    let passableCount = 0
    for (let index = 0; index < size; index += 1) {
      if (isFree(index) && walkableCounts[index] === fullWindows[index]) {
        passableMask[index] = 1
        passableCount += 1
      }
    }
    const passable = (index: number) => passableMask[index] === 1

    const connectivity = freeCount === 0 ? 0 : largestComponent(isFree).cells.length / freeCount

    const main = largestComponent(passable)
    const nearMain = windowCounts(main.mask, erosion)
    let usable = 0
    for (let index = 0; index < size; index += 1) {
      if (isFree(index) && nearMain[index] > 0) usable += 1
    }
    const usableSpace = freeCount === 0 ? 0 : usable / freeCount
    const freeSpacePercent = grid.insideCount === 0 ? 0 : usable / grid.insideCount * 100

    const seeds: number[] = []
    if (doorEntries.length === 0) seeds.push(...main.cells.slice(0, 1))
    const reachRadius = Math.max(2, Math.ceil(60 / cell))
    for (const entry of doorEntries) {
      const center = cellIndexAt(entry)
      if (center < 0) continue
      const col = center % grid.cols
      const row = Math.floor(center / grid.cols)
      for (let dy = -reachRadius; dy <= reachRadius; dy += 1) {
        for (let dx = -reachRadius; dx <= reachRadius; dx += 1) {
          const c = col + dx
          const r = row + dy
          if (c >= 0 && r >= 0 && c < grid.cols && r < grid.rows) seeds.push(r * grid.cols + c)
        }
      }
    }
    const reached = flood(passable, seeds)
    const targets = furniture
      .filter((item) => item.category !== 'chair' && clearanceFor(item) > 0)
      .map((item) => {
        const front = frontDirection(item.rotationDeg)
        const distance = item.depthCm / 2 + 35
        return { x: item.position.x + front.x * distance, y: item.position.y + front.y * distance }
      })
    const targetRadius = Math.max(2, Math.ceil(45 / cell))
    let reachableTargets = 0
    for (const target of targets) {
      const index = cellIndexAt(target)
      if (index >= 0 && anyNeighbor(index, targetRadius, (neighbor) => reached.visited[neighbor] === 1)) reachableTargets += 1
    }
    const reachShare = passableCount === 0 ? 0 : reached.cells.length / passableCount
    const circulation = reached.cells.length === 0
      ? 0
      : targets.length === 0 ? reachShare : 0.75 * (reachableTargets / targets.length) + 0.25 * reachShare

    const accessScores = furniture
      .map((item) => accessScore(item, furniture))
      .filter((value): value is number => value !== null)
    const access = accessScores.length === 0 ? 1 : accessScores.reduce((sum, value) => sum + value, 0) / accessScores.length

    let openingsScore = 1
    if (windows.length > 0) {
      let clear = 0
      for (const { opening, polygon } of windows) {
        const sill = opening.sillHeightCm ?? 90
        const blocked = furniture.some((item) => item.heightCm > sill && convexPolygonsOverlap(furnitureFootprint(item), polygon))
        if (!blocked) clear += 1
      }
      openingsScore = clear / windows.length
    }

    let wallTotal = 0
    for (const item of furniture) {
      const contact = wallContactScore(item, edges)
      wallTotal += isWallPreferred(item) ? contact : Math.max(0.5, contact)
    }
    const wallAlignment = furniture.length === 0 ? 1 : wallTotal / furniture.length

    const halfSpan = Math.min(width, depth) / 2
    let compactTotal = 0
    for (const item of furniture) {
      const nearest = Math.min(...edges.map((edge) => distanceToSegment(item.position, edge.start, edge.end)))
      compactTotal += 1 - Math.min(1, nearest / halfSpan)
    }
    const compactness = furniture.length === 0 ? 1 : compactTotal / furniture.length

    let movementTotal = 0
    let movable = 0
    for (const item of furniture) {
      const original = originalById.get(item.id)
      if (!original || item.locked) continue
      movable += 1
      const distance = Math.hypot(item.position.x - original.position.x, item.position.y - original.position.y)
      const rotation = angleDifference(item.rotationDeg, original.rotationDeg) > 5 ? 0.15 : 0
      movementTotal += Math.min(1, distance / (diagonal * 0.5) + rotation)
    }
    const movement = movable === 0 ? 1 : 1 - movementTotal / movable

    let zoneScore = 1
    if (softZones.length > 0) {
      let blocked = 0
      let total = 0
      for (const zone of softZones) {
        const stepX = Math.max(10, (zone.bounds.maxX - zone.bounds.minX) / 8)
        const stepY = Math.max(10, (zone.bounds.maxY - zone.bounds.minY) / 8)
        for (let x = zone.bounds.minX + stepX / 2; x < zone.bounds.maxX; x += stepX) {
          for (let y = zone.bounds.minY + stepY / 2; y < zone.bounds.maxY; y += stepY) {
            const point = { x, y }
            if (!pointInPolygonInclusive(point, zone.polygon)) continue
            total += 1
            if (furniture.some((item) => pointInConvex(point, furnitureFootprint(item)))) blocked += 1
          }
        }
      }
      zoneScore = total === 0 ? 1 : 1 - blocked / total
    }

    return {
      freeSpacePercent,
      components: {
        usableSpace, connectivity, circulation, access, openings: openingsScore,
        relationships: relationshipScore(furniture), wallAlignment, compactness, movement, zones: zoneScore,
      },
    }
  }

  return { score, roomPolygon, edges, bounds }
}

export type Scorer = ReturnType<typeof createScorer>
