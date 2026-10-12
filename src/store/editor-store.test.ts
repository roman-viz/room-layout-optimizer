import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from './editor-store'
import { rectangleRoom } from '../domain/geometry'

const initialRoom = rectangleRoom(520, 390)
const initialFurniture = [
  {
    id: 'test-chair',
    type: 'chair',
    name: 'Chair',
    category: 'chair' as const,
    position: { x: 150, y: 150 },
    widthCm: 50,
    depthCm: 50,
    heightCm: 80,
    rotationDeg: 0,
    locked: false,
  },
]

beforeEach(() => {
  localStorage.clear()
  useEditorStore.setState({
    room: structuredClone(initialRoom),
    furniture: structuredClone(initialFurniture),
    selectedFurnitureId: null,
    past: [],
    future: [],
  })
})

describe('editor state', () => {
  it('adds furniture from the library and supports undo and redo', () => {
    useEditorStore.getState().addFurniture('Sofa')
    expect(useEditorStore.getState().furniture).toHaveLength(2)
    expect(useEditorStore.getState().selectedFurnitureId).toBe(useEditorStore.getState().furniture[1].id)

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().furniture).toHaveLength(1)
    expect(useEditorStore.getState().selectedFurnitureId).toBeNull()

    useEditorStore.getState().redo()
    expect(useEditorStore.getState().furniture[1].name).toBe('Sofa')
  })

  it('records one drag history entry and restores the original position', () => {
    const store = useEditorStore.getState()
    store.beginHistory()
    store.moveFurniture('test-chair', { x: 250, y: 200 })
    expect(useEditorStore.getState().past).toHaveLength(1)
    expect(useEditorStore.getState().furniture[0].position).toEqual({ x: 250, y: 200 })

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().furniture[0].position).toEqual({ x: 150, y: 150 })
  })

  it('keeps the complete furniture footprint inside the room when moved', () => {
    useEditorStore.getState().moveFurniture('test-chair', { x: 600, y: 150 })

    expect(useEditorStore.getState().furniture[0].position).toEqual({ x: 495, y: 150 })
  })

  it('renames and resizes a room while retaining its geometry model', () => {
    useEditorStore.getState().updateRoom({ name: 'Studio', widthCm: 600 })
    const room = useEditorStore.getState().room
    expect(room.name).toBe('Studio')
    expect(room.widthCm).toBe(600)
    expect(room.boundary).toHaveLength(4)
    expect(room.boundary[0].end.x).toBe(600)
  })

  it('prevents locked furniture from moving or rotating but permits unlocking', () => {
    useEditorStore.setState({ furniture: [{ ...initialFurniture[0], locked: true }] })
    const store = useEditorStore.getState()
    store.moveFurniture('test-chair', { x: 300, y: 300 })
    store.updateFurniture('test-chair', { rotationDeg: 90 })
    expect(useEditorStore.getState().furniture[0].position).toEqual({ x: 150, y: 150 })
    expect(useEditorStore.getState().furniture[0].rotationDeg).toBe(0)

    useEditorStore.getState().toggleFurnitureLock('test-chair')
    expect(useEditorStore.getState().furniture[0].locked).toBe(false)
  })

  it('persists room and furniture separately from transient selection', () => {
    useEditorStore.getState().updateRoom({ name: 'Saved room' })
    const stored = JSON.parse(localStorage.getItem('roomform-project') ?? '{}')
    expect(stored.state.room.name).toBe('Saved room')
    expect(stored.state.furniture).toHaveLength(1)
    expect(stored.state.selectedFurnitureId).toBeUndefined()
  })
})
