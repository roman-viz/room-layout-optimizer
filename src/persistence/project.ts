import type {
  FurnitureCategory,
  FurnitureItem,
  Point,
  ProjectData,
  RestrictionZone,
  Room,
  RoomProject,
  WallOpening,
  WallSegment,
} from '../domain/models'
import { validateRoom } from '../domain/rooms'
import { validateOpening } from '../domain/openings'

export const PROJECT_SCHEMA_VERSION = 1

export type ParseResult = { ok: true; project: RoomProject } | { ok: false; error: string }

const categories: FurnitureCategory[] = ['bed', 'seating', 'table', 'chair', 'storage', 'shelf', 'media', 'kitchen', 'generic']
const zoneTypes: RestrictionZone['type'][] = ['forbidden', 'required-clearance', 'functional', 'walking-path']
const roomShapes = ['rectangle', 'l-shape', 'angled', 'rounded', 'semicircle', 'polygon']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0

function parsePoint(value: unknown): Point | null {
  return isRecord(value) && isNumber(value.x) && isNumber(value.y) ? { x: value.x, y: value.y } : null
}

function parseSegment(value: unknown): WallSegment | null {
  if (!isRecord(value) || !isString(value.id)) return null
  const start = parsePoint(value.start)
  const end = parsePoint(value.end)
  if (!start || !end) return null
  if (value.type === 'line') return { id: value.id, type: 'line', start, end }
  if (value.type === 'cubic') {
    const control1 = parsePoint(value.control1)
    const control2 = parsePoint(value.control2)
    return control1 && control2 ? { id: value.id, type: 'cubic', start, control1, control2, end } : null
  }
  return null
}

function parseRoom(value: unknown): Room | string {
  if (!isRecord(value)) return 'The file has no room.'
  if (!isString(value.id) || !isString(value.name)) return 'The room needs an id and a name.'
  if (!Array.isArray(value.boundary)) return 'The room has no walls.'
  const boundary: WallSegment[] = []
  for (const raw of value.boundary) {
    const segment = parseSegment(raw)
    if (!segment) return 'A wall in the file is malformed.'
    boundary.push(segment)
  }
  if (new Set(boundary.map((segment) => segment.id)).size !== boundary.length) return 'Wall ids must be unique.'
  const room: Room = {
    id: value.id,
    name: value.name,
    shape: typeof value.shape === 'string' && roomShapes.includes(value.shape) ? value.shape as Room['shape'] : 'polygon',
    boundary,
    widthCm: isNumber(value.widthCm) ? value.widthCm : 0,
    depthCm: isNumber(value.depthCm) ? value.depthCm : 0,
    ceilingHeightCm: isNumber(value.ceilingHeightCm) && value.ceilingHeightCm >= 100 ? value.ceilingHeightCm : 260,
  }
  const error = validateRoom(room)
  return error ?? room
}

function parseFurniture(value: unknown): FurnitureItem | string {
  if (!isRecord(value) || !isString(value.id) || !isString(value.name) || !isString(value.type)) {
    return 'A furniture entry is missing its id, type or name.'
  }
  const position = parsePoint(value.position)
  if (!position) return `“${value.name}” has an invalid position.`
  if (!isNumber(value.widthCm) || !isNumber(value.depthCm) || value.widthCm <= 0 || value.depthCm <= 0) {
    return `“${value.name}” has invalid dimensions.`
  }
  const category = categories.includes(value.category as FurnitureCategory) ? value.category as FurnitureCategory : 'generic'
  return {
    id: value.id,
    type: value.type,
    name: value.name,
    category,
    position,
    widthCm: value.widthCm,
    depthCm: value.depthCm,
    heightCm: isNumber(value.heightCm) && value.heightCm > 0 ? value.heightCm : 80,
    rotationDeg: isNumber(value.rotationDeg) ? ((value.rotationDeg % 360) + 360) % 360 : 0,
    locked: value.locked === true,
    ...(typeof value.color === 'string' ? { color: value.color } : {}),
    ...(isNumber(value.clearanceCm) ? { clearanceCm: value.clearanceCm } : {}),
    ...(typeof value.model3dAssetId === 'string' ? { model3dAssetId: value.model3dAssetId } : {}),
  }
}

function parseOpening(value: unknown): WallOpening | string {
  if (!isRecord(value) || !isString(value.id) || !isString(value.wallSegmentId)) return 'An opening is malformed.'
  if (value.type !== 'door' && value.type !== 'window') return 'An opening has an unknown type.'
  if (!isNumber(value.offsetFromStartCm) || !isNumber(value.widthCm) || !isNumber(value.heightCm)) {
    return 'An opening has invalid measurements.'
  }
  return {
    id: value.id,
    type: value.type,
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
    wallSegmentId: value.wallSegmentId,
    offsetFromStartCm: value.offsetFromStartCm,
    widthCm: value.widthCm,
    heightCm: value.heightCm,
    ...(isNumber(value.sillHeightCm) ? { sillHeightCm: value.sillHeightCm } : {}),
    ...(value.swing === 'left' || value.swing === 'right' ? { swing: value.swing } : {}),
    ...(value.swingDirection === 'inward' || value.swingDirection === 'outward' ? { swingDirection: value.swingDirection } : {}),
    ...(isNumber(value.swingAngleDeg) && value.swingAngleDeg >= 0 && value.swingAngleDeg <= 180
      ? { swingAngleDeg: value.swingAngleDeg }
      : {}),
  }
}

function parseZone(value: unknown): RestrictionZone | string {
  if (!isRecord(value) || !isString(value.id) || typeof value.name !== 'string') return 'A zone is malformed.'
  if (!zoneTypes.includes(value.type as RestrictionZone['type'])) return 'A zone has an unknown type.'
  if (!Array.isArray(value.boundary) || value.boundary.length < 3) return 'A zone needs at least three corners.'
  const boundary: Point[] = []
  for (const raw of value.boundary) {
    const point = parsePoint(raw)
    if (!point) return 'A zone has an invalid corner.'
    boundary.push(point)
  }
  return { id: value.id, name: value.name, type: value.type as RestrictionZone['type'], boundary, hardConstraint: value.hardConstraint === true }
}

function parseList<T>(raw: unknown, parse: (value: unknown) => T | string): T[] | string {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) return 'A list in the file has the wrong format.'
  const items: T[] = []
  for (const entry of raw) {
    const parsed = parse(entry)
    if (typeof parsed === 'string') return parsed
    items.push(parsed)
  }
  return items
}

export function serializeProject(data: ProjectData): RoomProject {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: data.room.id,
    name: data.room.name,
    room: structuredClone(data.room),
    furniture: structuredClone(data.furniture),
    openings: structuredClone(data.openings),
    zones: structuredClone(data.zones),
  }
}

export function exportProjectJson(data: ProjectData): string {
  return JSON.stringify(serializeProject(data), null, 2)
}

export function parseProject(input: unknown): ParseResult {
  if (!isRecord(input)) return { ok: false, error: 'This file is not a Roomize project.' }
  if (input.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: input.schemaVersion === undefined
        ? 'This file is not a Roomize project (no schema version).'
        : `Unsupported project version ${String(input.schemaVersion)}. This app reads version ${PROJECT_SCHEMA_VERSION}.`,
    }
  }
  const room = parseRoom(input.room)
  if (typeof room === 'string') return { ok: false, error: room }
  const furniture = parseList(input.furniture, parseFurniture)
  if (typeof furniture === 'string') return { ok: false, error: furniture }
  const openings = parseList(input.openings, parseOpening)
  if (typeof openings === 'string') return { ok: false, error: openings }
  const zones = parseList(input.zones, parseZone)
  if (typeof zones === 'string') return { ok: false, error: zones }
  if (new Set(furniture.map((item) => item.id)).size !== furniture.length) {
    return { ok: false, error: 'Furniture ids must be unique.' }
  }
  for (const opening of openings) {
    const problem = validateOpening(room, opening, openings)
    if (problem) return { ok: false, error: `A door or window is invalid: ${problem}` }
  }
  return {
    ok: true,
    project: {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id: room.id,
      name: typeof input.name === 'string' && input.name ? input.name : room.name,
      room,
      furniture,
      openings,
      zones,
    },
  }
}

export function parseProjectJson(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' }
  }
  return parseProject(raw)
}
