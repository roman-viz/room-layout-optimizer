import type {
  DoorHingeSide,
  FurnitureKind,
  OpeningDirection,
  OpeningKind,
  RestrictionZoneKind,
  RoomShapeKind,
  WallSegmentKind,
} from './enums'

export interface Point {
  x: number
  y: number
}

export interface LineWallSegment {
  id: string
  type: `${WallSegmentKind.Line}`
  start: Point
  end: Point
}

export interface CubicWallSegment {
  id: string
  type: `${WallSegmentKind.Cubic}`
  start: Point
  control1: Point
  control2: Point
  end: Point
}

export type WallSegment = LineWallSegment | CubicWallSegment

export type RoomShape = `${RoomShapeKind}`

export interface Room {
  id: string
  name: string
  shape?: RoomShape
  boundary: WallSegment[]
  widthCm: number
  depthCm: number
  ceilingHeightCm: number
}

export type FurnitureCategory = `${FurnitureKind}`

export interface FurnitureItem {
  id: string
  type: string
  name: string
  category: FurnitureCategory
  position: Point
  widthCm: number
  depthCm: number
  heightCm: number
  rotationDeg: number
  locked: boolean
  color?: string
  clearanceCm?: number
  model3dAssetId?: string
}

export interface WallOpening {
  id: string
  type: `${OpeningKind}`
  name?: string
  wallSegmentId: string
  offsetFromStartCm: number
  widthCm: number
  heightCm: number
  sillHeightCm?: number
  swing?: `${DoorHingeSide}`
  swingDirection?: `${OpeningDirection}`
  swingAngleDeg?: number
}

export interface RestrictionZone {
  id: string
  name: string
  type: `${RestrictionZoneKind}`
  boundary: Point[]
  hardConstraint: boolean
}

export interface ProjectData {
  room: Room
  furniture: FurnitureItem[]
  openings: WallOpening[]
  zones: RestrictionZone[]
}

export interface Placement {
  id: string
  position: Point
  rotationDeg: number
}

export interface RoomProject {
  schemaVersion: 1
  id: string
  name: string
  room: Room
  furniture: FurnitureItem[]
  openings: WallOpening[]
  zones: RestrictionZone[]
}
