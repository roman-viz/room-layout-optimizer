import { describe, expect, it } from 'vitest'
import { createRoom } from './rooms'
import { createOpening, doorSwingGeometry, maxDoorSwingAngle, openingPlacementNearPoint } from './openings'
import type { WallOpening } from './models'

describe('door swing geometry', () => {
  it('limits inward door travel at a concave wall boundary', () => {
    const room = createRoom('l-shape', 400, 400)
    const wall = room.boundary[2]
    expect(wall.type).toBe('line')
    const door: WallOpening = {
      id: 'door-in-corner',
      type: 'door',
      wallSegmentId: wall!.id,
      offsetFromStartCm: 0,
      widthCm: 90,
      heightCm: 210,
      swing: 'left',
      swingDirection: 'inward',
      swingAngleDeg: 180,
    }

    const maxAngle = maxDoorSwingAngle(room, door)
    const swing = doorSwingGeometry(room, door)

    expect(maxAngle).toBeGreaterThan(0)
    expect(maxAngle).toBeLessThan(180)
    expect(swing?.maxAngleDeg).toBe(maxAngle)
    expect(swing?.angleDeg).toBe(maxAngle)
  })

  it('allows outward doors to open up to 180 degrees', () => {
    const room = createRoom('rectangle', 400, 300)
    const door: WallOpening = {
      id: 'door-out',
      type: 'door',
      wallSegmentId: room.boundary[0].id,
      offsetFromStartCm: 80,
      widthCm: 90,
      heightCm: 210,
      swing: 'left',
      swingDirection: 'outward',
      swingAngleDeg: 135,
    }

    expect(maxDoorSwingAngle(room, door)).toBe(180)
    expect(doorSwingGeometry(room, door)?.angleDeg).toBe(135)
  })
})

describe('opening drag placement', () => {
  it('snaps an opening onto a different straight wall while preserving the grabbed point', () => {
    const room = createRoom('rectangle', 400, 300)
    const firstWall = room.boundary[0]
    const targetWall = room.boundary[1]
    expect(firstWall?.type).toBe('line')
    expect(targetWall?.type).toBe('line')
    const opening: WallOpening = {
      id: 'door-drag',
      type: 'door',
      wallSegmentId: firstWall!.id,
      offsetFromStartCm: 40,
      widthCm: 90,
      heightCm: 210,
      swing: 'left',
      swingDirection: 'inward',
      swingAngleDeg: 90,
    }
    const point = {
      x: targetWall!.start.x + (targetWall!.end.x - targetWall!.start.x) * 0.5,
      y: targetWall!.start.y + (targetWall!.end.y - targetWall!.start.y) * 0.5,
    }

    expect(openingPlacementNearPoint(room, opening, [], point, 35, 25)).toEqual({
      wallSegmentId: targetWall!.id,
      offsetFromStartCm: 115,
    })
  })

  it('does not move an opening back to its old wall when the nearby target is occupied', () => {
    const room = createRoom('rectangle', 400, 300)
    const opening: WallOpening = {
      id: 'door-drag',
      type: 'door',
      wallSegmentId: room.boundary[0].id,
      offsetFromStartCm: 40,
      widthCm: 90,
      heightCm: 210,
      swing: 'left',
      swingDirection: 'inward',
      swingAngleDeg: 90,
    }
    const targetWall = room.boundary[1]
    const sibling: WallOpening = {
      ...opening,
      id: 'window-on-target',
      type: 'window',
      wallSegmentId: targetWall.id,
      offsetFromStartCm: 100,
    }
    const point = {
      x: targetWall.start.x + (targetWall.end.x - targetWall.start.x) * 0.5,
      y: targetWall.start.y + (targetWall.end.y - targetWall.start.y) * 0.5,
    }

    expect(openingPlacementNearPoint(room, opening, [sibling], point, 35, 25)).toBeNull()
  })
})

describe('opening names', () => {
  it('assigns sequential default names to doors and windows', () => {
    const room = createRoom('rectangle', 520, 390)
    const firstDoor = createOpening(room, [], 'door')
    expect(firstDoor?.name).toBe('Door 1')
    const secondDoor = createOpening(room, firstDoor ? [firstDoor] : [], 'door')
    expect(secondDoor?.name).toBe('Door 2')

    const firstWindow = createOpening(room, firstDoor ? [firstDoor] : [], 'window')
    expect(firstWindow?.name).toBe('Window 1')
  })
})
