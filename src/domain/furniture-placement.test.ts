import { describe, expect, it } from 'vitest'
import { createRoom } from './rooms'
import { RoomShapeKind } from './enums'
import { roomBoundaryToPolygon } from './geometry'
import { furnitureFootprint, polygonContainedIn } from './polygon'
import { clampFurniturePositionToRoom } from './furniture-placement'
import type { FurnitureItem } from './models'

const item: FurnitureItem = {
  id: 'chair',
  type: 'chair',
  name: 'Chair',
  category: 'chair',
  position: { x: 200, y: 190 },
  widthCm: 50,
  depthCm: 50,
  heightCm: 80,
  rotationDeg: 0,
  locked: false,
}

describe('furniture placement', () => {
  it('keeps the whole furniture footprint inside a rectangular room', () => {
    const room = createRoom(RoomShapeKind.Rectangle, 520, 390)
    const position = clampFurniturePositionToRoom(item, room, { x: 600, y: 190 })

    expect(position.x).toBeCloseTo(495, 2)
    expect(polygonContainedIn(furnitureFootprint({ ...item, position }), roomBoundaryToPolygon(room))).toBe(true)
  })

  it('rounds a position clamped against the wall instead of keeping floating-point noise', () => {
    const room = createRoom(RoomShapeKind.Rectangle, 520, 390)
    const chair = { ...item, widthCm: 48, depthCm: 48 }
    const position = clampFurniturePositionToRoom(chair, room, { x: 600, y: 190 })

    expect(position).toEqual({ x: 496, y: 190 })
    expect(String(position.x)).not.toMatch(/\.0+$|000000/)
  })

  it('stops furniture at concave room walls instead of allowing it into a cut-out', () => {
    const room = createRoom(RoomShapeKind.LShape, 520, 390)
    const lShapedItem = { ...item, position: { x: 200, y: 300 } }
    const position = clampFurniturePositionToRoom(lShapedItem, room, { x: 400, y: 300 })

    expect(position.x).toBeLessThan(300)
    expect(position.y).toBe(300)
    expect(polygonContainedIn(furnitureFootprint({ ...lShapedItem, position }), roomBoundaryToPolygon(room))).toBe(true)
  })
})
