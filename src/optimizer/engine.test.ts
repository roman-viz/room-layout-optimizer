import { describe, expect, it } from 'vitest'
import { rectangleRoom } from '../domain/geometry'
import { validateLayout } from '../domain/validation'
import type { FurnitureItem } from '../domain/models'
import { optimizeLayout } from './engine'

const room = rectangleRoom(400, 300)
const chair: FurnitureItem = {
  id: 'chair',
  type: 'dining-chair',
  name: 'Chair',
  category: 'chair',
  position: { x: 200, y: 150 },
  widthCm: 50,
  depthCm: 50,
  heightCm: 80,
  rotationDeg: 0,
  locked: false,
}

describe('layout optimizer', () => {
  it('returns valid placements and scores for a movable item', () => {
    const result = optimizeLayout({
      room,
      furniture: [chair],
      openings: [],
      zones: [],
      mode: 'balanced',
      budgetMs: 1000,
    })

    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions[0].placements).toHaveLength(1)
    expect(validateLayout({
      room,
      furniture: [{ ...chair, ...result.suggestions[0].placements[0] }],
      openings: [],
      zones: [],
    })).toEqual([])
  })

  it('does not suggest changes when all furniture is locked', () => {
    const result = optimizeLayout({
      room,
      furniture: [{ ...chair, locked: true }],
      openings: [],
      zones: [],
      mode: 'balanced',
    })

    expect(result.suggestions).toEqual([])
    expect(result.notes.join(' ')).toContain('Every piece is locked')
  })

  it('explains that the room needs furniture before optimizing an empty layout', () => {
    const result = optimizeLayout({
      room,
      furniture: [],
      openings: [],
      zones: [],
      mode: 'balanced',
    })

    expect(result.suggestions).toEqual([])
    expect(result.notes.join(' ')).toContain('Add furniture')
  })
})
