import type { FurnitureItem, Placement, Room, RestrictionZone, WallOpening } from '../domain/models'
import type { OptimizationGoal } from '../domain/enums'

export type OptimizationMode = `${OptimizationGoal}`

export interface ScoreComponents {
  usableSpace: number
  connectivity: number
  circulation: number
  access: number
  openings: number
  relationships: number
  wallAlignment: number
  compactness: number
  movement: number
  zones: number
}

export interface LayoutSuggestion {
  id: string
  mode: OptimizationMode
  placements: Placement[]
  total: number
  rating: 'Excellent' | 'Good' | 'Fair' | 'Basic'
  stars: number
  freeSpacePercent: number
  components: ScoreComponents
  advantages: string[]
  tradeoffs: string[]
  movedCount: number
}

export interface OptimizationRequest {
  room: Room
  furniture: FurnitureItem[]
  openings: WallOpening[]
  zones: RestrictionZone[]
  mode: OptimizationMode
  maxResults?: number
  budgetMs?: number
}

export interface OptimizationResult {
  suggestions: LayoutSuggestion[]
  currentScore: number
  currentFreeSpacePercent: number
  conflicts: string[]
  notes: string[]
  candidatesEvaluated: number
}

export type WorkerMessage =
  | { type: 'run'; requestId: number; request: OptimizationRequest }
  | { type: 'cancel'; requestId: number }

export type WorkerResponse =
  | { type: 'progress'; requestId: number; progress: number }
  | { type: 'done'; requestId: number; result: OptimizationResult }
  | { type: 'error'; requestId: number; message: string }
