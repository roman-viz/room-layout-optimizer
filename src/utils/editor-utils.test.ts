import { describe, expect, it } from 'vitest'
import { MeasurementUnit, OpeningKind } from '../domain/enums'
import type { WallOpening } from '../domain/models'
import { formatLength, getOpeningName, zoneBoundaryWithBounds } from './editor-utils'

describe('editor utilities', () => {
  it('formats lengths with the requested measurement unit', () => {
    expect(formatLength(520, MeasurementUnit.Centimeters)).toBe('520 cm')
    expect(formatLength(125, MeasurementUnit.Meters)).toBe('1.25 m')
  })

  it('uses stable names for unnamed openings', () => {
    const openings: WallOpening[] = [
      { id: 'door-1', type: OpeningKind.Door, wallSegmentId: 'wall-1', offsetFromStartCm: 0, widthCm: 90, heightCm: 210 },
      { id: 'door-2', type: OpeningKind.Door, wallSegmentId: 'wall-2', offsetFromStartCm: 0, widthCm: 90, heightCm: 210 },
    ]

    expect(getOpeningName(openings[1], openings)).toBe('Door 2')
  })

  it('resizes and repositions every point in a zone boundary', () => {
    expect(zoneBoundaryWithBounds(
      [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 40 }],
      { x: 5, y: 15, width: 40, depth: 40 },
    )).toEqual([{ x: 5, y: 15 }, { x: 45, y: 15 }, { x: 45, y: 55 }])
  })
})
