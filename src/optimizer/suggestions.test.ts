import { describe, expect, it } from 'vitest'
import type { LayoutSuggestion, OptimizationMode } from './types'
import { selectDistinctSuggestions } from './suggestions'

const modes: OptimizationMode[] = ['balanced', 'natural', 'free-space']

function suggestion(mode: OptimizationMode, rank: number, x: number): LayoutSuggestion {
  return {
    id: `${mode}-${rank}`,
    mode,
    placements: [{ id: 'sofa', position: { x, y: 100 }, rotationDeg: 0 }],
    total: 80 - rank,
    rating: 'Good',
    stars: 4,
    freeSpacePercent: 60,
    components: {
      usableSpace: 0.6,
      connectivity: 0.6,
      circulation: 0.6,
      access: 0.6,
      openings: 0.6,
      relationships: 0.6,
      wallAlignment: 0.6,
      compactness: 0.6,
      movement: 0.6,
      zones: 0.6,
    },
    advantages: [],
    tradeoffs: [],
    movedCount: 1,
  }
}

describe('suggestion selection', () => {
  it('keeps up to three distinct layouts per mode and removes cross-mode duplicates', () => {
    const candidates = modes.flatMap((mode) =>
      Array.from({ length: 9 }, (_, index) => suggestion(mode, index + 1, 50 + (index + 1) * 60)),
    )

    const selected = selectDistinctSuggestions(candidates, modes)

    expect(selected).toHaveLength(9)
    for (const mode of modes) {
      expect(selected.filter((item) => item.mode === mode)).toHaveLength(3)
    }
    expect(new Set(selected.map((item) => item.placements[0].position.x)).size).toBe(9)
  })

  it('returns only the distinct layouts available when fewer than three can be found', () => {
    const candidates = modes.flatMap((mode) => [
      suggestion(mode, 1, 100),
      suggestion(mode, 2, 100),
      suggestion(mode, 3, 160),
    ])

    const selected = selectDistinctSuggestions(candidates, modes)

    expect(selected).toHaveLength(2)
    expect(new Set(selected.map((item) => item.placements[0].position.x)).size).toBe(2)
  })

  it('uses a stricter duplicate threshold across types without hiding same-type alternatives', () => {
    const selected = selectDistinctSuggestions([
      suggestion('balanced', 1, 100),
      suggestion('balanced', 2, 120),
      suggestion('natural', 1, 120),
    ], modes)

    expect(selected.map((item) => [item.mode, item.placements[0].position.x])).toEqual([
      ['balanced', 100],
      ['balanced', 120],
    ])
  })
})
