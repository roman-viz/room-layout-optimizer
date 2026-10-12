import { describe, expect, it } from 'vitest'
import { canvasToWorld, fitBounds, worldToCanvas } from './coordinates'
import { flattenWallSegment, pointInPolygon, polygonArea, rectangleRoom, roomAreaCm2, roomBoundaryToPolygon } from './geometry'
import { createPolygonRoom } from './rooms'

describe('room geometry', () => {
  it('creates a rectangular boundary and calculates its area in square centimeters', () => {
    const room = rectangleRoom(400, 300)
    expect(room.boundary).toHaveLength(4)
    expect(roomAreaCm2(room)).toBe(120_000)
  })

  it('supports concave polygon containment', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 150 },
      { x: 150, y: 150 },
      { x: 150, y: 300 },
      { x: 0, y: 300 },
    ]

    expect(pointInPolygon({ x: 80, y: 220 }, polygon)).toBe(true)
    expect(pointInPolygon({ x: 300, y: 240 }, polygon)).toBe(false)
  })

  it('approximates curved walls within a controlled tolerance', () => {
    const arc = {
      id: 'curved-wall',
      type: 'cubic' as const,
      start: { x: 0, y: 100 },
      control1: { x: 0, y: 0 },
      control2: { x: 100, y: 0 },
      end: { x: 100, y: 100 },
    }
    const points = flattenWallSegment(arc, 0.5)

    expect(points.length).toBeGreaterThan(3)
    expect(points[0]).toEqual(arc.start)
    expect(points.at(-1)).toEqual(arc.end)
    expect(roomBoundaryToPolygon({ boundary: [arc] }, 0.5)).toHaveLength(points.length)
  })

  it('rejects non-positive dimensions and curve tolerances', () => {
    expect(() => rectangleRoom(0, 300)).toThrow(RangeError)
    expect(() => flattenWallSegment(
      { id: 'wall', type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
      0,
    )).toThrow(RangeError)
  })

  it('round-trips world and canvas coordinates and fits room bounds', () => {
    const transform = fitBounds(400, 300, 1000, 800)
    const worldPoint = { x: 125, y: 80 }
    const canvasPoint = worldToCanvas(worldPoint, transform)

    expect(canvasToWorld(canvasPoint, transform).x).toBeCloseTo(worldPoint.x)
    expect(canvasToWorld(canvasPoint, transform).y).toBeCloseTo(worldPoint.y)
    expect(canvasPoint.x).toBeGreaterThan(0)
  })

  it('calculates polygon area regardless of vertex winding', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ]
    expect(polygonArea(polygon)).toBe(5_000)
    expect(polygonArea([...polygon].reverse())).toBe(5_000)
  })

  it('creates a normalized freeform room from its drawn outline', () => {
    const room = createPolygonRoom([
      { x: 120, y: 80 },
      { x: 520, y: 80 },
      { x: 420, y: 380 },
      { x: 120, y: 280 },
    ], 'Studio', '00000000-0000-4000-8000-000000000001')

    expect(room.name).toBe('Studio')
    expect(room.shape).toBe('polygon')
    expect(room.boundary[0].start).toEqual({ x: 0, y: 0 })
    expect(room.widthCm).toBe(400)
    expect(room.depthCm).toBe(300)
  })

  it('rejects self-intersecting freeform room outlines', () => {
    expect(() => createPolygonRoom([
      { x: 0, y: 0 },
      { x: 400, y: 300 },
      { x: 400, y: 0 },
      { x: 0, y: 300 },
    ])).toThrow(/cross/)
  })
})
