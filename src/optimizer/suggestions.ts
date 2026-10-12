import type { LayoutSuggestion, OptimizationMode } from './types'
import type { Placement } from '../domain/models'
import { angleDifference } from '../domain/polygon'

const MIN_DISTINCT_DISPLACEMENT_CM = 15
const MIN_CROSS_MODE_DISPLACEMENT_CM = 30

function placementsDistance(first: Placement[], second: Placement[]): number {
  const secondById = new Map(second.map((placement) => [placement.id, placement]))
  if (first.length !== second.length || first.some((placement) => !secondById.has(placement.id))) return Infinity

  let greatestDistance = 0
  for (const placement of first) {
    const other = secondById.get(placement.id)
    if (!other) return Infinity
    const positionDistance = Math.hypot(
      placement.position.x - other.position.x,
      placement.position.y - other.position.y,
    )
    const rotationDistance = angleDifference(placement.rotationDeg, other.rotationDeg) > 45
      ? MIN_DISTINCT_DISPLACEMENT_CM
      : 0
    greatestDistance = Math.max(greatestDistance, positionDistance, rotationDistance)
  }
  return greatestDistance
}

export function selectDistinctSuggestions(
  suggestions: LayoutSuggestion[],
  modes: OptimizationMode[],
  perMode = 3,
): LayoutSuggestion[] {
  const byMode = new Map(modes.map((mode) => [
    mode,
    suggestions.filter((suggestion) => suggestion.mode === mode),
  ]))
  const selected: LayoutSuggestion[] = []
  const selectedByMode = new Map<OptimizationMode, number>(modes.map((mode) => [mode, 0]))

  const nextIndex = new Map<OptimizationMode, number>(modes.map((mode) => [mode, 0]))
  let hasCandidates = true
  while (hasCandidates) {
    hasCandidates = false
    for (const mode of modes) {
      if ((selectedByMode.get(mode) ?? 0) >= perMode) continue
      const candidates = byMode.get(mode) ?? []
      let index = nextIndex.get(mode) ?? 0
      while (index < candidates.length) {
        hasCandidates = true
        const suggestion = candidates[index]
        index += 1
        nextIndex.set(mode, index)
        if (selected.some((existing) => {
          const threshold = existing.mode === suggestion.mode
            ? MIN_DISTINCT_DISPLACEMENT_CM
            : MIN_CROSS_MODE_DISPLACEMENT_CM
          return placementsDistance(existing.placements, suggestion.placements) < threshold
        })) continue
        selected.push(suggestion)
        selectedByMode.set(mode, (selectedByMode.get(mode) ?? 0) + 1)
        break
      }
    }
  }
  return selected
}
