import type { FurnitureItem, Point, RestrictionZone, Room, WallOpening } from './models'
import { roomBoundaryToPolygon } from './geometry'
import { openingClearancePolygon } from './openings'
import {
  convexPolygonsOverlap,
  furnitureFootprint,
  polygonBounds,
  polygonContainedIn,
  type Bounds,
} from './polygon'

export type ViolationType = 'outside-room' | 'collision' | 'forbidden-zone' | 'door-clearance' | 'required-clearance'

export interface Violation {
  type: ViolationType
  itemId: string
  otherId?: string
  message: string
}

export interface HardRegion {
  id: string
  kind: Exclude<ViolationType, 'outside-room' | 'collision'>
  name: string
  polygon: Point[]
  bounds: Bounds
}

export interface HardRegions {
  roomPolygon: Point[]
  regions: HardRegion[]
}

export interface LayoutContext {
  room: Room
  furniture: FurnitureItem[]
  openings: WallOpening[]
  zones: RestrictionZone[]
}

function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
}

export function isHardZone(zone: RestrictionZone): boolean {
  return zone.type === 'forbidden' || zone.hardConstraint
}

export function buildHardRegions(
  room: Room,
  openings: WallOpening[],
  zones: RestrictionZone[],
  roomToleranceCm = 1,
): HardRegions {
  const regions: HardRegion[] = []
  for (const zone of zones) {
    if (!isHardZone(zone) || zone.boundary.length < 3) continue
    regions.push({
      id: zone.id,
      kind: zone.type === 'forbidden' ? 'forbidden-zone' : 'required-clearance',
      name: zone.name,
      polygon: zone.boundary,
      bounds: polygonBounds(zone.boundary),
    })
  }
  for (const opening of openings) {
    if (opening.type !== 'door') continue
    const polygon = openingClearancePolygon(room, opening)
    if (!polygon) continue
    regions.push({ id: opening.id, kind: 'door-clearance', name: 'door clearance', polygon, bounds: polygonBounds(polygon) })
  }
  return { roomPolygon: roomBoundaryToPolygon(room, roomToleranceCm), regions }
}

const regionMessages: Record<HardRegion['kind'], (name: string) => string> = {
  'forbidden-zone': (name) => `Inside forbidden zone “${name}”.`,
  'door-clearance': () => 'Blocks the clearance in front of a door.',
  'required-clearance': (name) => `Intrudes on required clearance “${name}”.`,
}

/** Violations that depend only on the room and fixed restrictions, not on other furniture. */
export function staticViolations(item: FurnitureItem, hard: HardRegions): Violation[] {
  const footprint = furnitureFootprint(item)
  const violations: Violation[] = []
  if (!polygonContainedIn(footprint, hard.roomPolygon)) {
    violations.push({ type: 'outside-room', itemId: item.id, message: 'Extends outside the room walls.' })
  }
  const bounds = polygonBounds(footprint)
  for (const region of hard.regions) {
    if (!boundsOverlap(bounds, region.bounds)) continue
    if (convexPolygonsOverlap(footprint, region.polygon)) {
      violations.push({
        type: region.kind,
        itemId: item.id,
        otherId: region.id,
        message: regionMessages[region.kind](region.name),
      })
    }
  }
  return violations
}

export function furnitureCollides(first: FurnitureItem, second: FurnitureItem): boolean {
  const firstPolygon = furnitureFootprint(first)
  const secondPolygon = furnitureFootprint(second)
  if (!boundsOverlap(polygonBounds(firstPolygon), polygonBounds(secondPolygon))) return false
  return convexPolygonsOverlap(firstPolygon, secondPolygon)
}

export function validateLayout(context: LayoutContext, hard?: HardRegions): Violation[] {
  const regions = hard ?? buildHardRegions(context.room, context.openings, context.zones)
  const violations: Violation[] = []
  const { furniture } = context
  for (let index = 0; index < furniture.length; index += 1) {
    const item = furniture[index]
    violations.push(...staticViolations(item, regions))
    for (let other = index + 1; other < furniture.length; other += 1) {
      if (furnitureCollides(item, furniture[other])) {
        violations.push({
          type: 'collision',
          itemId: item.id,
          otherId: furniture[other].id,
          message: `Overlaps ${furniture[other].name}.`,
        })
      }
    }
  }
  return violations
}

export function violationsByItem(violations: Violation[]): Map<string, Violation[]> {
  const map = new Map<string, Violation[]>()
  for (const violation of violations) {
    const ids = violation.type === 'collision' && violation.otherId
      ? [violation.itemId, violation.otherId]
      : [violation.itemId]
    for (const id of ids) map.set(id, [...(map.get(id) ?? []), violation])
  }
  return map
}
