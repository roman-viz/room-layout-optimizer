import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type {
  FurnitureItem,
  Placement,
  Point,
  ProjectData,
  RestrictionZone,
  Room,
  WallOpening,
} from '../domain/models'
import { getLibraryDefinition } from '../domain/library'
import { clampDoorSwingAngle, clampOpeningOffset, createOpening, validateOpening } from '../domain/openings'
import { polygonBounds } from '../domain/polygon'
import { clampFurniturePositionToRoom } from '../domain/furniture-placement'
import {
  insertCorner,
  moveCorner,
  removeCorner,
  scaleRoom,
  setWallBulge,
  setWallLength,
  validateRoom,
  type EditResult,
} from '../domain/rooms'
import { buildHardRegions, furnitureCollides, staticViolations } from '../domain/validation'
import { parseProject } from '../persistence/project'
import { sampleProject } from './sample'
import { reportSave } from './save-status'

export type { LibraryItemName } from '../domain/library'

export type Selection =
  | { kind: 'furniture'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'zone'; id: string }
  | { kind: 'wall'; index: number }
  | { kind: 'corner'; index: number }

interface EditorSnapshot extends ProjectData {
  selection: Selection | null
}

export interface RoomSummary {
  id: string
  name: string
}

interface EditorState extends ProjectData {
  selection: Selection | null
  selectedFurnitureId: string | null
  savedRooms: Record<string, ProjectData>
  preview: Placement[] | null
  lastError: string | null
  past: EditorSnapshot[]
  future: EditorSnapshot[]
  select: (selection: Selection | null) => void
  selectFurniture: (id: string | null) => void
  setPreview: (placements: Placement[] | null) => void
  clearError: () => void
  setError: (message: string) => void
  addFurniture: (name?: string) => void
  updateRoom: (changes: Partial<Pick<Room, 'name' | 'widthCm' | 'depthCm' | 'ceilingHeightCm'>>) => boolean
  setRoomGeometry: (room: Room, openings?: WallOpening[]) => boolean
  moveCorner: (index: number, point: Point) => boolean
  setWallLength: (index: number, lengthCm: number) => boolean
  setWallBulge: (index: number, bulgeCm: number) => boolean
  addCorner: (wallIndex: number, near?: Point) => boolean
  removeCorner: (index: number) => boolean
  updateFurniture: (id: string, changes: Partial<FurnitureItem>) => void
  moveFurniture: (id: string, position: FurnitureItem['position']) => void
  duplicateFurniture: (id: string) => void
  deleteFurniture: (id: string) => void
  rotateFurniture: (id: string, degrees: number) => void
  toggleFurnitureLock: (id: string) => void
  addOpening: (type: WallOpening['type']) => boolean
  updateOpening: (id: string, changes: Partial<WallOpening>) => boolean
  moveOpening: (id: string, offsetFromStartCm: number) => void
  deleteOpening: (id: string) => void
  addZone: (zone: RestrictionZone) => void
  updateZone: (id: string, changes: Partial<RestrictionZone>) => void
  moveZone: (id: string, delta: Point) => void
  deleteZone: (id: string) => void
  applyPlacements: (placements: Placement[]) => void
  createRoom: (project: ProjectData) => void
  switchRoom: (id: string) => void
  deleteRoom: (id: string) => boolean
  importProject: (project: ProjectData) => void
  loadSample: () => void
  beginHistory: () => void
  undo: () => void
  redo: () => void
}

const HISTORY_LIMIT = 100

function snapshot(state: EditorState): EditorSnapshot {
  return {
    room: structuredClone(state.room),
    furniture: structuredClone(state.furniture),
    openings: structuredClone(state.openings),
    zones: structuredClone(state.zones),
    selection: state.selection,
  }
}

function selectedFurnitureIdOf(selection: Selection | null): string | null {
  return selection?.kind === 'furniture' ? selection.id : null
}

function activeData(state: ProjectData): ProjectData {
  return { room: state.room, furniture: state.furniture, openings: state.openings, zones: state.zones }
}

function findFreeSpot(item: FurnitureItem, state: ProjectData): Point | null {
  const hard = buildHardRegions(state.room, state.openings, state.zones)
  const bounds = polygonBounds(hard.roomPolygon)
  const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
  const candidates: Point[] = []
  for (let x = bounds.minX; x <= bounds.maxX; x += 10) {
    for (let y = bounds.minY; y <= bounds.maxY; y += 10) candidates.push({ x, y })
  }
  candidates.sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))
  for (const position of candidates) {
    const trial = { ...item, position }
    if (staticViolations(trial, hard).length > 0) continue
    if (state.furniture.some((other) => furnitureCollides(trial, other))) continue
    return position
  }
  return null
}

function reconcileOpenings(room: Room, openings: WallOpening[]): WallOpening[] {
  const kept: WallOpening[] = []
  for (const opening of openings) {
    const candidate = {
      ...opening,
      offsetFromStartCm: clampOpeningOffset(room, opening, opening.offsetFromStartCm),
      ...(opening.type === 'door'
        ? { swingAngleDeg: clampDoorSwingAngle(room, opening, opening.swingAngleDeg ?? 90) }
        : {}),
    }
    if (!validateOpening(room, candidate, kept)) kept.push(candidate)
  }
  return kept
}

const guardedStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
      reportSave('saved')
    } catch {
      reportSave('error')
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {
      /* storage unavailable */
    }
  },
}

export const useEditorStore = create<EditorState>()(persist((set, get) => {
  const initial = sampleProject()

  const commit = (changes: Partial<EditorState>) => set((state) => {
    const selection = changes.selection !== undefined ? changes.selection : state.selection
    return {
      ...changes,
      selection,
      selectedFurnitureId: selectedFurnitureIdOf(selection),
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      preview: null,
      lastError: null,
    }
  })

  const applyRoomEdit = (result: EditResult, selection?: Selection | null, openings?: WallOpening[]): boolean => {
    if (!result.ok) {
      set({ lastError: result.error })
      return false
    }
    const state = get()
    commit({
      room: result.value,
      openings: reconcileOpenings(result.value, openings ?? state.openings),
      ...(selection !== undefined ? { selection } : {}),
    })
    return true
  }

  const restore = (data: EditorSnapshot) => ({
    room: data.room,
    furniture: data.furniture,
    openings: data.openings,
    zones: data.zones,
    selection: data.selection,
    selectedFurnitureId: selectedFurnitureIdOf(data.selection),
    preview: null,
    lastError: null,
  })

  const resetTransient = {
    selection: null,
    selectedFurnitureId: null,
    preview: null,
    lastError: null,
    past: [],
    future: [],
  }

  return {
    ...initial,
    selection: null,
    selectedFurnitureId: null,
    savedRooms: {},
    preview: null,
    lastError: null,
    past: [],
    future: [],
    select: (selection) => set({ selection, selectedFurnitureId: selectedFurnitureIdOf(selection) }),
    selectFurniture: (id) => get().select(id ? { kind: 'furniture', id } : null),
    setPreview: (preview) => set({ preview }),
    clearError: () => set({ lastError: null }),
    setError: (message) => set({ lastError: message }),
    addFurniture: (name = 'Armchair') => {
      const definition = getLibraryDefinition(name)
      const state = get()
      const draft: FurnitureItem = {
        id: crypto.randomUUID(),
        type: definition.type,
        name: definition.name,
        category: definition.category,
        position: { x: 0, y: 0 },
        widthCm: definition.widthCm,
        depthCm: definition.depthCm,
        heightCm: definition.heightCm,
        rotationDeg: 0,
        locked: false,
        color: definition.color,
        clearanceCm: definition.clearanceCm,
      }
      let position = findFreeSpot(draft, state)
      let notice: string | null = null
      if (!position) {
        const bounds = polygonBounds(buildHardRegions(state.room, [], []).roomPolygon)
        position = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
        notice = 'There is no free space for this item; it was placed in the room centre and overlaps something.'
      }
      commit({ furniture: [...state.furniture, { ...draft, position }], selection: { kind: 'furniture', id: draft.id } })
      if (notice) set({ lastError: notice })
    },
    updateRoom: (changes) => {
      const state = get()
      const room: Room = { ...state.room }
      if (changes.name !== undefined) room.name = changes.name
      if (changes.ceilingHeightCm !== undefined) room.ceilingHeightCm = changes.ceilingHeightCm
      if (changes.widthCm !== undefined || changes.depthCm !== undefined) {
        const scaled = scaleRoom(room, changes.widthCm ?? room.widthCm, changes.depthCm ?? room.depthCm)
        if (!scaled.ok) {
          set({ lastError: scaled.error })
          return false
        }
        return applyRoomEdit({ ok: true, value: scaled.value })
      }
      return applyRoomEdit({ ok: true, value: room })
    },
    setRoomGeometry: (room, openings) => {
      const error = validateRoom(room)
      return applyRoomEdit(error ? { ok: false, error } : { ok: true, value: room }, undefined, openings)
    },
    moveCorner: (index, point) => applyRoomEdit(moveCorner(get().room, index, point)),
    setWallLength: (index, lengthCm) => applyRoomEdit(setWallLength(get().room, index, lengthCm)),
    setWallBulge: (index, bulgeCm) => applyRoomEdit(setWallBulge(get().room, index, bulgeCm)),
    addCorner: (wallIndex, near) => {
      const result = insertCorner(get().room, wallIndex, near)
      if (!result.ok) {
        set({ lastError: result.error })
        return false
      }
      const { room, splitWallId, newWallId, firstLengthCm } = result.value
      const openings = get().openings.flatMap((opening): WallOpening[] => {
        if (opening.wallSegmentId !== splitWallId) return [opening]
        if (opening.offsetFromStartCm + opening.widthCm <= firstLengthCm + 0.01) return [opening]
        if (opening.offsetFromStartCm >= firstLengthCm - 0.01) {
          return [{ ...opening, wallSegmentId: newWallId, offsetFromStartCm: opening.offsetFromStartCm - firstLengthCm }]
        }
        return []
      })
      commit({ room, openings: reconcileOpenings(room, openings), selection: { kind: 'corner', index: wallIndex + 1 } })
      return true
    },
    removeCorner: (index) => {
      const result = removeCorner(get().room, index)
      if (!result.ok) {
        set({ lastError: result.error })
        return false
      }
      const { room, removedWallIds } = result.value
      const openings = get().openings.filter((opening) => !removedWallIds.includes(opening.wallSegmentId))
      commit({ room, openings: reconcileOpenings(room, openings), selection: null })
      return true
    },
    updateFurniture: (id, changes) => {
      const state = get()
      const existing = state.furniture.find((item) => item.id === id)
      if (!existing) return
      if (existing.locked && (changes.position !== undefined || changes.rotationDeg !== undefined)) return
      const clean: Partial<FurnitureItem> = { ...changes }
      if (clean.widthCm !== undefined && !(clean.widthCm >= 5)) delete clean.widthCm
      if (clean.depthCm !== undefined && !(clean.depthCm >= 5)) delete clean.depthCm
      if (clean.position) {
        const targetPosition = clean.position
        clean.position = clampFurniturePositionToRoom(
          { ...existing, ...clean, position: existing.position },
          state.room,
          targetPosition,
        )
      }
      commit({ furniture: state.furniture.map((item) => item.id === id ? { ...item, ...clean } : item) })
    },
    moveFurniture: (id, position) => set((state) => {
      const item = state.furniture.find((furnitureItem) => furnitureItem.id === id)
      if (!item || item.locked) return state
      const clampedPosition = clampFurniturePositionToRoom(item, state.room, position)
      return {
        furniture: state.furniture.map((furnitureItem) => furnitureItem.id === id ? { ...furnitureItem, position: clampedPosition } : furnitureItem),
      }
    }),
    duplicateFurniture: (id) => {
      const state = get()
      const original = state.furniture.find((item) => item.id === id)
      if (!original || original.locked) return
      const draft: FurnitureItem = {
        ...structuredClone(original),
        id: crypto.randomUUID(),
        name: `${original.name} copy`,
      }
      const hard = buildHardRegions(state.room, state.openings, state.zones)
      const step = Math.max(original.widthCm, original.depthCm) + 20
      const offsets: Point[] = [
        { x: step, y: 0 }, { x: -step, y: 0 }, { x: 0, y: step }, { x: 0, y: -step },
        { x: 30, y: 30 }, { x: -30, y: 30 }, { x: 30, y: -30 }, { x: -30, y: -30 },
      ]
      let position: Point | null = null
      for (const offset of offsets) {
        const trial = { ...draft, position: { x: original.position.x + offset.x, y: original.position.y + offset.y } }
        if (staticViolations(trial, hard).length === 0 && !state.furniture.some((other) => furnitureCollides(trial, other))) {
          position = trial.position
          break
        }
      }
      position ??= findFreeSpot(draft, state) ?? { x: original.position.x + 20, y: original.position.y + 20 }
      commit({ furniture: [...state.furniture, { ...draft, position }], selection: { kind: 'furniture', id: draft.id } })
    },
    deleteFurniture: (id) => {
      const state = get()
      const isSelected = state.selection?.kind === 'furniture' && state.selection.id === id
      commit({
        furniture: state.furniture.filter((item) => item.id !== id),
        ...(isSelected ? { selection: null } : {}),
      })
    },
    rotateFurniture: (id, degrees) => {
      const item = get().furniture.find((furnitureItem) => furnitureItem.id === id)
      if (!item || item.locked) return
      get().updateFurniture(id, { rotationDeg: (((item.rotationDeg + degrees) % 360) + 360) % 360 })
    },
    toggleFurnitureLock: (id) => {
      const item = get().furniture.find((furnitureItem) => furnitureItem.id === id)
      if (item) get().updateFurniture(id, { locked: !item.locked })
    },
    addOpening: (type) => {
      const state = get()
      const opening = createOpening(state.room, state.openings, type)
      if (!opening) {
        set({ lastError: `There is no free straight wall space for a ${type}.` })
        return false
      }
      commit({ openings: [...state.openings, opening], selection: { kind: 'opening', id: opening.id } })
      return true
    },
    updateOpening: (id, changes) => {
      const state = get()
      const existing = state.openings.find((opening) => opening.id === id)
      if (!existing) return false
      const updated = { ...existing, ...changes }
      if (updated.type === 'door') {
        updated.swingAngleDeg = clampDoorSwingAngle(state.room, updated, updated.swingAngleDeg ?? 90)
      }
      const error = validateOpening(state.room, updated, state.openings)
      if (error) {
        set({ lastError: error })
        return false
      }
      commit({ openings: state.openings.map((opening) => opening.id === id ? updated : opening) })
      return true
    },
    moveOpening: (id, offsetFromStartCm) => set((state) => {
      const existing = state.openings.find((opening) => opening.id === id)
      if (!existing) return state
      const updated = { ...existing, offsetFromStartCm: clampOpeningOffset(state.room, existing, offsetFromStartCm) }
      if (updated.type === 'door') {
        updated.swingAngleDeg = clampDoorSwingAngle(state.room, updated, updated.swingAngleDeg ?? 90)
      }
      if (validateOpening(state.room, updated, state.openings)) return state
      return { openings: state.openings.map((opening) => opening.id === id ? updated : opening) }
    }),
    deleteOpening: (id) => {
      const state = get()
      const isSelected = state.selection?.kind === 'opening' && state.selection.id === id
      commit({
        openings: state.openings.filter((opening) => opening.id !== id),
        ...(isSelected ? { selection: null } : {}),
      })
    },
    addZone: (zone) => commit({ zones: [...get().zones, zone], selection: { kind: 'zone', id: zone.id } }),
    updateZone: (id, changes) => {
      if (changes.boundary && changes.boundary.length < 3) return
      commit({ zones: get().zones.map((zone) => zone.id === id ? { ...zone, ...changes } : zone) })
    },
    moveZone: (id, delta) => set((state) => ({
      zones: state.zones.map((zone) => zone.id === id
        ? { ...zone, boundary: zone.boundary.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y })) }
        : zone),
    })),
    deleteZone: (id) => {
      const state = get()
      const isSelected = state.selection?.kind === 'zone' && state.selection.id === id
      commit({
        zones: state.zones.filter((zone) => zone.id !== id),
        ...(isSelected ? { selection: null } : {}),
      })
    },
    applyPlacements: (placements) => {
      const state = get()
      const byId = new Map(placements.map((placement) => [placement.id, placement]))
      commit({
        furniture: state.furniture.map((item) => {
          const placement = byId.get(item.id)
          return placement && !item.locked
            ? { ...item, position: { ...placement.position }, rotationDeg: placement.rotationDeg }
            : item
        }),
      })
    },
    createRoom: (project) => {
      const state = get()
      const taken = new Set([state.room.id, ...Object.keys(state.savedRooms)])
      const id = taken.has(project.room.id) ? crypto.randomUUID() : project.room.id
      set({
        savedRooms: { ...state.savedRooms, [state.room.id]: activeData(state) },
        room: { ...project.room, id },
        furniture: project.furniture,
        openings: project.openings,
        zones: project.zones,
        ...resetTransient,
      })
    },
    switchRoom: (id) => {
      const state = get()
      const target = state.savedRooms[id]
      if (!target || id === state.room.id) return
      const rest = { ...state.savedRooms }
      delete rest[id]
      set({ savedRooms: { ...rest, [state.room.id]: activeData(state) }, ...activeData(target), ...resetTransient })
    },
    deleteRoom: (id) => {
      const state = get()
      const rest = { ...state.savedRooms }
      if (id === state.room.id) {
        const [nextId] = Object.keys(rest)
        if (!nextId) return false
        const next = rest[nextId]
        delete rest[nextId]
        set({ savedRooms: rest, ...activeData(next), ...resetTransient })
        return true
      }
      if (!rest[id]) return false
      delete rest[id]
      set({ savedRooms: rest })
      return true
    },
    importProject: (project) => get().createRoom(project),
    loadSample: () => {
      const sample = sampleProject()
      get().createRoom({ ...sample, room: { ...sample.room, id: crypto.randomUUID() } })
    },
    beginHistory: () => set((state) => ({ past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT), future: [] })),
    undo: () => set((state) => {
      const previous = state.past.at(-1)
      if (!previous) return state
      return {
        ...restore(previous),
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future],
      }
    }),
    redo: () => set((state) => {
      const next = state.future[0]
      if (!next) return state
      return {
        ...restore(next),
        past: [...state.past, snapshot(state)],
        future: state.future.slice(1),
      }
    }),
  }
}, {
  name: 'roomform-project',
  version: 2,
  storage: createJSONStorage(() => guardedStorage),
  partialize: (state) => ({
    room: state.room,
    furniture: state.furniture,
    openings: state.openings,
    zones: state.zones,
    savedRooms: state.savedRooms,
  }),
  migrate: (persisted) => persisted as Partial<EditorState>,
  merge: (persisted, current) => {
    const saved = (persisted ?? {}) as Partial<ProjectData> & { savedRooms?: Record<string, ProjectData> }
    const active = parseProject({
      schemaVersion: 1,
      room: saved.room,
      furniture: saved.furniture ?? [],
      openings: saved.openings ?? [],
      zones: saved.zones ?? [],
    })
    if (!active.ok) return current
    const savedRooms: Record<string, ProjectData> = {}
    for (const [id, data] of Object.entries(saved.savedRooms ?? {})) {
      const parsed = parseProject({ schemaVersion: 1, ...data })
      if (parsed.ok) {
        const { room, furniture, openings, zones } = parsed.project
        savedRooms[id] = { room, furniture, openings, zones }
      }
    }
    const { room, furniture, openings, zones } = active.project
    return { ...current, room, furniture, openings, zones, savedRooms }
  },
}))
