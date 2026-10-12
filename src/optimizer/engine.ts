import type { FurnitureItem, Placement, Point } from '../domain/models'
import {
  angleDifference,
  frontDirection,
  normalizeAngle,
  pointInPolygonInclusive,
  rightDirection,
} from '../domain/polygon'
import {
  buildHardRegions,
  furnitureCollides,
  staticViolations,
  validateLayout,
  type HardRegions,
} from '../domain/validation'
import { createScorer, isWallPreferred, modeWeights, weightedTotal, type Scorer } from './scoring'
import type {
  LayoutSuggestion,
  OptimizationRequest,
  OptimizationResult,
  ScoreComponents,
} from './types'

const BEAM_WIDTH = 16
const CANDIDATE_CAP = 36
const LOCAL_SEARCH_PASSES = 2
const DEFAULT_BUDGET_MS = 7000
const MIN_DISTINCT_DISPLACEMENT_CM = 15

export interface OptimizeHooks {
  onProgress?: (progress: number) => void
  isCancelled?: () => boolean
  now?: () => number
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function pose(item: FurnitureItem, position: Point, rotationDeg: number): FurnitureItem {
  return { ...item, position: { x: round1(position.x), y: round1(position.y) }, rotationDeg: normalizeAngle(round1(rotationDeg)) }
}

function placementPriority(item: FurnitureItem): number {
  if (item.category === 'bed') return 0
  if (item.type === 'wardrobe' || item.type === 'dresser' || item.category === 'kitchen') return 1
  if (item.type === 'sofa') return 2
  if (item.category === 'media' || item.category === 'shelf') return 3
  if (item.category === 'table' && item.type !== 'coffee-table') return 4
  if (item.type === 'armchair') return 6
  if (item.type === 'coffee-table') return 7
  if (item.type === 'nightstand') return 8
  if (item.category === 'chair') return 9
  return 5
}

function layoutSignature(items: { position: Point; rotationDeg: number }[], gridCm = 30): string {
  return items
    .map((item) => `${Math.round(item.position.x / gridCm)},${Math.round(item.position.y / gridCm)},${Math.round(normalizeAngle(item.rotationDeg) / 90) % 4}`)
    .join('|')
}

function candidateKey(position: Point, rotationDeg: number): string {
  return `${Math.round(position.x / 4)},${Math.round(position.y / 4)},${Math.round(normalizeAngle(rotationDeg))}`
}

function faceRotation(normal: Point): number {
  return normalizeAngle(Math.atan2(-normal.x, normal.y) * 180 / Math.PI)
}

interface RawCandidate {
  position: Point
  rotationDeg: number
  anchored: boolean
}

function wallCandidates(item: FurnitureItem, scorer: Scorer, polygonEdges = scorer.edges): RawCandidate[] {
  const result: RawCandidate[] = []
  for (const edge of polygonEdges) {
    if (edge.length < 25) continue
    const u = { x: (edge.end.x - edge.start.x) / edge.length, y: (edge.end.y - edge.start.y) / edge.length }
    const midpoint = { x: (edge.start.x + edge.end.x) / 2, y: (edge.start.y + edge.end.y) / 2 }
    let normal = { x: -u.y, y: u.x }
    if (!pointInPolygonInclusive({ x: midpoint.x + normal.x * 4, y: midpoint.y + normal.y * 4 }, scorer.roomPolygon)) {
      normal = { x: -normal.x, y: -normal.y }
    }
    const baseRotation = faceRotation(normal)
    const variants = isWallPreferred(item)
      ? [{ rotation: baseRotation, along: item.widthCm, out: item.depthCm }]
      : [
          { rotation: baseRotation, along: item.widthCm, out: item.depthCm },
          { rotation: baseRotation + 90, along: item.depthCm, out: item.widthCm },
          { rotation: baseRotation - 90, along: item.depthCm, out: item.widthCm },
        ]
    for (const variant of variants) {
      if (edge.length < variant.along) continue
      const offsets = new Set<number>([variant.along / 2, edge.length - variant.along / 2])
      for (let s = variant.along / 2; s <= edge.length - variant.along / 2 + 0.01; s += 20) offsets.add(s)
      for (const s of offsets) {
        result.push({
          position: {
            x: edge.start.x + u.x * s + normal.x * variant.out / 2,
            y: edge.start.y + u.y * s + normal.y * variant.out / 2,
          },
          rotationDeg: variant.rotation,
          anchored: true,
        })
      }
    }
  }
  return result
}

function relationshipCandidates(item: FurnitureItem, placed: FurnitureItem[]): RawCandidate[] {
  const result: RawCandidate[] = []
  const add = (position: Point, rotationDeg: number) => result.push({ position, rotationDeg, anchored: true })
  const at = (center: Point, rotation: number, local: Point): Point => {
    const right = rightDirection(rotation)
    const front = frontDirection(rotation)
    return { x: center.x + right.x * local.x + front.x * local.y, y: center.y + right.y * local.x + front.y * local.y }
  }

  if (item.category === 'chair') {
    for (const table of placed.filter((other) => other.category === 'table' && other.type !== 'coffee-table')) {
      const rot = table.rotationDeg
      const gap = 4
      const sides = [
        { local: (f: number) => ({ x: f * table.widthCm * 0.3, y: table.depthCm / 2 + item.depthCm / 2 + gap }), rotation: rot + 180 },
        { local: (f: number) => ({ x: f * table.widthCm * 0.3, y: -(table.depthCm / 2 + item.depthCm / 2 + gap) }), rotation: rot },
        { local: () => ({ x: table.widthCm / 2 + item.widthCm / 2 + gap, y: 0 }), rotation: rot + 90 },
        { local: () => ({ x: -(table.widthCm / 2 + item.widthCm / 2 + gap), y: 0 }), rotation: rot - 90 },
      ]
      for (const side of sides) for (const f of [-1, 0, 1]) add(at(table.position, rot, side.local(f)), side.rotation)
    }
  }
  if (item.type === 'nightstand') {
    for (const bed of placed.filter((other) => other.category === 'bed')) {
      for (const side of [-1, 1]) {
        add(at(bed.position, bed.rotationDeg, {
          x: side * (bed.widthCm / 2 + item.widthCm / 2 + 3),
          y: -(bed.depthCm / 2) + item.depthCm / 2,
        }), bed.rotationDeg)
      }
    }
  }
  if (item.type === 'armchair' || item.type === 'coffee-table') {
    for (const sofa of placed.filter((other) => other.type === 'sofa')) {
      const rot = sofa.rotationDeg
      if (item.type === 'coffee-table') {
        for (const gap of [35, 55]) add(at(sofa.position, rot, { x: 0, y: sofa.depthCm / 2 + gap + item.depthCm / 2 }), rot)
      } else {
        add(at(sofa.position, rot, { x: sofa.widthCm / 2 + item.widthCm / 2 + 20, y: sofa.depthCm / 2 + 40 }), rot + 90)
        add(at(sofa.position, rot, { x: -(sofa.widthCm / 2 + item.widthCm / 2 + 20), y: sofa.depthCm / 2 + 40 }), rot - 90)
        add(at(sofa.position, rot, { x: 0, y: sofa.depthCm / 2 + 160 + item.depthCm / 2 }), rot + 180)
      }
    }
  }
  return result
}

function floatingCandidates(item: FurnitureItem, scorer: Scorer): RawCandidate[] {
  if (isWallPreferred(item)) return []
  const result: RawCandidate[] = []
  const { bounds } = scorer
  const rotations = item.category === 'table' ? [0, 90] : [0, 90, 180, 270]
  for (let x = bounds.minX + 60; x < bounds.maxX; x += 60) {
    for (let y = bounds.minY + 60; y < bounds.maxY; y += 60) {
      for (const rotationDeg of rotations) result.push({ position: { x, y }, rotationDeg, anchored: false })
    }
  }
  return result
}

interface State {
  placed: FurnitureItem[]
  total: number
}

export function optimizeLayout(request: OptimizationRequest, hooks: OptimizeHooks = {}): OptimizationResult {
  const now = hooks.now ?? (() => performance.now())
  const startedAt = now()
  const budget = request.budgetMs ?? DEFAULT_BUDGET_MS
  const outOfTime = () => now() - startedAt > budget
  const cancelled = () => hooks.isCancelled?.() ?? false
  const weights = modeWeights[request.mode]
  const maxResults = request.maxResults ?? 3
  const { room, openings, zones } = request

  const hard: HardRegions = buildHardRegions(room, openings, zones)
  const scorer = createScorer({ room, openings, zones, original: request.furniture })
  const total = (components: ScoreComponents) => weightedTotal(components, weights)

  const locked = request.furniture.filter((item) => item.locked)
  const movable = request.furniture
    .filter((item) => !item.locked)
    .sort((a, b) => placementPriority(a) - placementPriority(b) || b.widthCm * b.depthCm - a.widthCm * a.depthCm)

  const currentScore = scorer.score(request.furniture)
  const empty = (conflicts: string[], notes: string[], evaluated = 0): OptimizationResult => ({
    suggestions: [],
    currentScore: total(currentScore.components),
    currentFreeSpacePercent: currentScore.freeSpacePercent,
    conflicts,
    notes,
    candidatesEvaluated: evaluated,
  })

  const conflicts: string[] = []
  for (const violation of validateLayout({ room, openings, zones, furniture: locked }, hard)) {
    const item = locked.find((candidate) => candidate.id === violation.itemId)
    conflicts.push(`Locked “${item?.name ?? 'item'}”: ${violation.message}`)
  }
  if (conflicts.length > 0) {
    return empty([...new Set(conflicts)], ['Unlock or move the locked furniture, or adjust the restriction, then try again.'])
  }
  if (movable.length === 0) {
    return empty([], [
      locked.length > 0
        ? 'Every piece is locked, so there is nothing to rearrange.'
        : 'Add furniture to the room before asking the optimizer to arrange it.',
    ])
  }
  if (hard.roomPolygon.length < 3) return empty(['The room outline is not valid.'], [])

  let evaluated = 0
  const rejectionReasons = new Map<string, Map<string, number>>()

  function validCandidates(item: FurnitureItem, placed: FurnitureItem[], tight: boolean): FurnitureItem[] {
    const related = relationshipCandidates(item, placed)
    const raw: RawCandidate[] = [
      { position: item.position, rotationDeg: item.rotationDeg, anchored: false },
      { position: item.position, rotationDeg: item.rotationDeg + 90, anchored: false },
      ...wallCandidates(item, scorer),
      ...related,
      ...(tight ? [] : floatingCandidates(item, scorer)),
    ]
    const seen = new Set<string>()
    const valid: { item: FurnitureItem; anchored: boolean }[] = []
    const reasons = rejectionReasons.get(item.id) ?? new Map<string, number>()
    for (const candidate of raw) {
      const key = candidateKey(candidate.position, candidate.rotationDeg)
      if (seen.has(key)) continue
      seen.add(key)
      const posed = pose(item, candidate.position, candidate.rotationDeg)
      const violations = staticViolations(posed, hard)
      if (violations.length > 0) {
        reasons.set(violations[0].type, (reasons.get(violations[0].type) ?? 0) + 1)
        continue
      }
      if (placed.some((other) => furnitureCollides(posed, other))) {
        reasons.set('collision', (reasons.get('collision') ?? 0) + 1)
        continue
      }
      valid.push({ item: posed, anchored: candidate.anchored })
    }
    rejectionReasons.set(item.id, reasons)
    if (valid.length <= CANDIDATE_CAP) return valid.map((entry) => entry.item)

    const diagonal = Math.hypot(scorer.bounds.maxX - scorer.bounds.minX, scorer.bounds.maxY - scorer.bounds.minY)
    const cheap = (entry: { item: FurnitureItem; anchored: boolean }) => {
      const distance = Math.hypot(entry.item.position.x - item.position.x, entry.item.position.y - item.position.y)
      const rotation = angleDifference(entry.item.rotationDeg, item.rotationDeg) / 180
      return (entry.anchored ? 0.4 : 0) + (1 - Math.min(1, distance / diagonal)) * 0.4 - rotation * 0.1
    }
    const ranked = valid.map((entry, index) => ({ entry, index, value: cheap(entry) }))
      .sort((a, b) => b.value - a.value || a.index - b.index)
    const kept = ranked.slice(0, CANDIDATE_CAP / 2).map((r) => r.entry)
    const rest = ranked.slice(CANDIDATE_CAP / 2)
    const stride = Math.max(1, Math.floor(rest.length / (CANDIDATE_CAP / 2)))
    for (let index = 0; index < rest.length && kept.length < CANDIDATE_CAP; index += stride) kept.push(rest[index].entry)
    return kept.map((entry) => entry.item)
  }

  let states: State[] = [{ placed: [...locked], total: 0 }]
  let failedItem: FurnitureItem | null = null

  for (let step = 0; step < movable.length; step += 1) {
    if (cancelled()) return empty([], ['Optimization was cancelled.'], evaluated)
    hooks.onProgress?.(step / (movable.length + 1))
    const item = movable[step]
    const tight = outOfTime()
    const width = tight ? 1 : BEAM_WIDTH
    const expanded: State[] = []
    for (const state of states) {
      for (const candidate of validCandidates(item, state.placed, tight)) {
        const placed = [...state.placed, candidate]
        evaluated += 1
        expanded.push({ placed, total: total(scorer.score(placed).components) })
      }
    }
    if (expanded.length === 0) {
      failedItem = item
      states = []
      break
    }
    expanded.sort((a, b) => b.total - a.total)
    const kept: State[] = []
    const signatures = new Set<string>()
    for (const state of expanded) {
      const signature = layoutSignature(state.placed.filter((placed) => !placed.locked), 20)
      if (signatures.has(signature)) continue
      signatures.add(signature)
      kept.push(state)
      if (kept.length >= width) break
    }
    states = kept
  }

  if (states.length === 0) {
    const messages: string[] = []
    if (failedItem) {
      const reasons = rejectionReasons.get(failedItem.id)
      const summary = reasons && reasons.size > 0
        ? [...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => `${count} blocked by ${reasonLabel(type)}`).join(', ')
        : 'no candidate positions were available'
      messages.push(`“${failedItem.name}” (${failedItem.widthCm}×${failedItem.depthCm} cm) has no valid position: ${summary}.`)
    }
    return empty(messages, [
      'Try removing a zone, unlocking furniture, enlarging the room, or shrinking an item.',
    ], evaluated)
  }

  const improve = (state: State): State => {
    let best = state
    for (let pass = 0; pass < LOCAL_SEARCH_PASSES; pass += 1) {
      let changed = false
      for (const original of movable) {
        if (outOfTime() || cancelled()) return best
        const index = best.placed.findIndex((placed) => placed.id === original.id)
        const current = best.placed[index]
        const others = best.placed.filter((_, otherIndex) => otherIndex !== index)
        const trials: FurnitureItem[] = []
        for (const [dx, dy] of [[10, 0], [-10, 0], [0, 10], [0, -10], [30, 0], [-30, 0], [0, 30], [0, -30]]) {
          trials.push(pose(current, { x: current.position.x + dx, y: current.position.y + dy }, current.rotationDeg))
        }
        trials.push(pose(current, current.position, current.rotationDeg + 180))
        for (const trial of trials) {
          if (staticViolations(trial, hard).length > 0 || others.some((other) => furnitureCollides(trial, other))) continue
          const candidatePlaced = best.placed.map((placed, placedIndex) => placedIndex === index ? trial : placed)
          evaluated += 1
          const value = total(scorer.score(candidatePlaced).components)
          if (value > best.total + 1e-4) {
            best = { placed: candidatePlaced, total: value }
            changed = true
          }
        }
      }
      if (!changed) break
    }
    return best
  }

  const improved = states.flatMap((state, index) => {
    hooks.onProgress?.((movable.length + (index + 1) / states.length) / (movable.length + 1))
    return [improve(state), state]
  }).sort((a, b) => b.total - a.total)

  const currentSignature = layoutSignature(request.furniture)
  const suggestions: LayoutSuggestion[] = []
  const accepted: FurnitureItem[][] = []
  for (const state of improved) {
    const final = request.furniture.map((item) => state.placed.find((placed) => placed.id === item.id) ?? item)
    if (validateLayout({ room, openings, zones, furniture: final }, hard).length > 0) continue
    if (layoutSignature(final) === currentSignature && suggestions.length === 0 && improved.length > 1) continue
    const tooSimilar = accepted.some((existing) => layoutDistance(existing, final) < MIN_DISTINCT_DISPLACEMENT_CM)
    if (tooSimilar) continue
    accepted.push(final)
    suggestions.push(describe(final, suggestions.length))
    if (suggestions.length >= maxResults) break
  }

  function describe(final: FurnitureItem[], index: number): LayoutSuggestion {
    const { components, freeSpacePercent } = scorer.score(final)
    const value = total(components)
    const moved = final.filter((item) => {
      const original = request.furniture.find((candidate) => candidate.id === item.id)
      return original && (Math.hypot(item.position.x - original.position.x, item.position.y - original.position.y) > 5 ||
        angleDifference(item.rotationDeg, original.rotationDeg) > 1)
    })
    const rating = value >= 0.8 ? 'Excellent' : value >= 0.68 ? 'Good' : value >= 0.55 ? 'Fair' : 'Basic'
    const stars = value >= 0.95 ? 5 : value >= 0.85 ? 4 : value >= 0.75 ? 3 : value >= 0.6 ? 2 : 1
    const placements: Placement[] = final.map((item) => ({ id: item.id, position: item.position, rotationDeg: item.rotationDeg }))
    return {
      id: `${request.mode}-${index + 1}`,
      mode: request.mode,
      placements,
      total: value,
      rating,
      stars,
      freeSpacePercent,
      components,
      advantages: advantagesFor(components),
      tradeoffs: tradeoffsFor(components, moved.length),
      movedCount: moved.length,
    }
  }

  const notes: string[] = []
  if (suggestions.length === 0) {
    notes.push('No distinct valid layout was found beyond your current arrangement.')
  } else if (suggestions.length < maxResults) {
    notes.push(`Only ${suggestions.length} distinct valid layout${suggestions.length === 1 ? '' : 's'} could be found for this room and its restrictions.`)
  }
  if (outOfTime()) notes.push('The time limit was reached, so the search was shortened.')
  hooks.onProgress?.(1)

  return {
    suggestions,
    currentScore: total(currentScore.components),
    currentFreeSpacePercent: currentScore.freeSpacePercent,
    conflicts: [],
    notes,
    candidatesEvaluated: evaluated,
  }
}

function reasonLabel(type: string): string {
  switch (type) {
    case 'outside-room': return 'the room walls'
    case 'forbidden-zone': return 'a forbidden zone'
    case 'door-clearance': return 'door clearance'
    case 'required-clearance': return 'a required clearance zone'
    default: return 'other furniture'
  }
}

function layoutDistance(first: FurnitureItem[], second: FurnitureItem[]): number {
  let greatest = 0
  for (const item of first) {
    const other = second.find((candidate) => candidate.id === item.id)
    if (!other || item.locked) continue
    const rotated = angleDifference(item.rotationDeg, other.rotationDeg) > 45 ? MIN_DISTINCT_DISPLACEMENT_CM : 0
    greatest = Math.max(
      greatest,
      Math.hypot(item.position.x - other.position.x, item.position.y - other.position.y),
      rotated,
    )
  }
  return greatest
}

function advantagesFor(components: ScoreComponents): string[] {
  const list: string[] = []
  if (components.circulation >= 0.85) list.push('Clear walking routes to doors and furniture')
  if (components.usableSpace >= 0.85 && components.connectivity >= 0.85) list.push('Large, connected open floor')
  if (components.access >= 0.9) list.push('Every piece has room to be used')
  if (components.relationships >= 0.8) list.push('Related pieces are grouped sensibly')
  if (components.wallAlignment >= 0.75) list.push('Furniture sits neatly against walls')
  if (components.openings >= 0.99) list.push('Windows stay unobstructed')
  if (components.movement >= 0.85) list.push('Stays close to your current layout')
  return list.slice(0, 3).length > 0 ? list.slice(0, 3) : ['Valid layout that respects all hard constraints']
}

function tradeoffsFor(components: ScoreComponents, moved: number): string[] {
  const list: string[] = []
  if (moved >= 4 || components.movement < 0.55) list.push(`Moves ${moved} piece${moved === 1 ? '' : 's'} from your layout`)
  if (components.circulation < 0.6) list.push('Some areas are harder to reach')
  if (components.access < 0.7) list.push('Tight space in front of some furniture')
  if (components.relationships < 0.6) list.push('Related furniture is less grouped')
  if (components.connectivity < 0.7) list.push('Open floor is split into pockets')
  if (components.openings < 0.99) list.push('A window is partly blocked by tall furniture')
  if (components.wallAlignment < 0.5) list.push('Several pieces float away from walls')
  return list.slice(0, 3)
}
