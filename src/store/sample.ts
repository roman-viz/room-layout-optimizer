import { rectangleRoom } from '../domain/geometry'
import { createOpening, validateOpening } from '../domain/openings'
import { createRoom, wallLength } from '../domain/rooms'
import type { FurnitureItem, ProjectData, RestrictionZone, WallOpening } from '../domain/models'

export const sampleFurniture: FurnitureItem[] = [
  {
    id: 'bed-main', type: 'double-bed', name: 'Queen bed', category: 'bed',
    position: { x: 210, y: 190 }, widthCm: 160, depthCm: 210, heightCm: 55,
    rotationDeg: 0, locked: false, color: '#b9c9bb',
  },
  {
    id: 'nightstand-main', type: 'nightstand', name: 'Nightstand', category: 'storage',
    position: { x: 90, y: 250 }, widthCm: 45, depthCm: 40, heightCm: 50,
    rotationDeg: 90, locked: false, color: '#d4c5ad',
  },
  {
    id: 'wardrobe-main', type: 'wardrobe', name: 'Wardrobe', category: 'storage',
    position: { x: 95, y: 335 }, widthCm: 120, depthCm: 60, heightCm: 210,
    rotationDeg: 0, locked: false, color: '#d4c5ad',
  },
  {
    id: 'desk-main', type: 'writing-desk', name: 'Writing desk', category: 'table',
    position: { x: 405, y: 105 }, widthCm: 120, depthCm: 60, heightCm: 74,
    rotationDeg: 0, locked: false, color: '#dec8a9',
  },
  {
    id: 'chair-main', type: 'dining-chair', name: 'Desk chair', category: 'chair',
    position: { x: 405, y: 170 }, widthCm: 48, depthCm: 48, heightCm: 85,
    rotationDeg: 180, locked: false, color: '#d6bea6',
  },
  {
    id: 'armchair-main', type: 'armchair', name: 'Armchair', category: 'seating',
    position: { x: 465, y: 250 }, widthCm: 85, depthCm: 85, heightCm: 82,
    rotationDeg: 0, locked: false, color: '#c3bfd2',
  },
]

export function sampleProject(): ProjectData {
  const room = { ...rectangleRoom(520, 390), id: 'room-sample', name: 'Bedroom' }
  const openings: WallOpening[] = [
    { id: 'door-main', type: 'door', name: 'Door 1', wallSegmentId: 'wall-bottom', offsetFromStartCm: 70, widthCm: 90, heightCm: 210, swing: 'left', swingDirection: 'inward', swingAngleDeg: 90 },
    { id: 'window-main', type: 'window', name: 'Window 1', wallSegmentId: 'wall-top', offsetFromStartCm: 320, widthCm: 130, heightCm: 130, sillHeightCm: 90 },
  ]
  return { room, furniture: structuredClone(sampleFurniture), openings, zones: [] }
}

export function emptyProject(name: string, shape: Parameters<typeof createRoom>[0], widthCm: number, depthCm: number): ProjectData {
  return emptyRoomProject(createRoom(shape, widthCm, depthCm, name))
}

export function emptyRoomProject(room: ProjectData['room']): ProjectData {
  let door = createOpening(room, [], 'door')
  if (!door) {
    const walls = room.boundary
      .filter((wall) => wall.type === 'line')
      .map((wall) => ({ wall, length: wallLength(wall) }))
      .sort((a, b) => b.length - a.length)
    for (const { wall, length } of walls) {
      for (let widthCm = Math.min(90, Math.floor(length / 10) * 10); widthCm >= 30; widthCm -= 10) {
        const candidate: WallOpening = {
          id: crypto.randomUUID(),
          type: 'door',
          name: 'Door 1',
          wallSegmentId: wall.id,
          offsetFromStartCm: (length - widthCm) / 2,
          widthCm,
          heightCm: 210,
          swing: 'left',
          swingDirection: 'inward',
          swingAngleDeg: 90,
        }
        if (!validateOpening(room, candidate, [])) {
          door = candidate
          break
        }
      }
      if (door) break
    }
  }
  if (!door) throw new RangeError('This room outline has no straight wall long enough for a door.')
  return { room, furniture: [], openings: [door], zones: [] }
}

export function rectangleZone(
  type: RestrictionZone['type'],
  x: number,
  y: number,
  width: number,
  depth: number,
  name?: string,
): RestrictionZone {
  const labels: Record<RestrictionZone['type'], string> = {
    forbidden: 'Forbidden zone',
    'required-clearance': 'Clearance zone',
    functional: 'Functional zone',
    'walking-path': 'Walking path',
  }
  return {
    id: crypto.randomUUID(),
    name: name ?? labels[type],
    type,
    boundary: [
      { x, y }, { x: x + width, y }, { x: x + width, y: y + depth }, { x, y: y + depth },
    ],
    hardConstraint: type === 'forbidden',
  }
}
