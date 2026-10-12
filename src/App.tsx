import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Download,
  Grid2X2,
  LockKeyhole,
  LocateFixed,
  Moon,
  Pencil,
  Plus,
  Redo2,
  RotateCw,
  Ruler,
  Sun,
  Trash2,
  UnlockKeyhole,
  Undo2,
  Upload,
  ImageDown,
  Printer,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { RoomCanvas } from './components/RoomCanvas'
import { SelectControl } from './components/SelectControl'
import { AngleField, DoorAngleField, NumberField, TextField } from './components/EditorFields'
import { LeftSidebar } from './components/LeftSidebar'
import { OptimizerDialog } from './components/OptimizerDialog'
import { FurnitureLibraryMenu } from './components/FurnitureLibraryMenu'
import type { Point, RestrictionZone, RoomShape, WallOpening } from './domain/models'
import { MeasurementUnit, OptimizationGoal, RestrictionZoneKind, RoomCreationMethod, RoomShapeKind } from './domain/enums'
import type { LengthUnit } from './domain/enums'
import { roomAreaCm2 } from './domain/geometry'
import { createPolygonRoom, createRoom as createRoomShape, roomShapeLabels } from './domain/rooms'
import { polygonBounds } from './domain/polygon'
import { maxDoorSwingAngle, openingGeometry, openingPlacementNearPoint } from './domain/openings'
import { emptyProject, emptyRoomProject, rectangleZone } from './store/sample'
import { useEditorStore } from './store/editor-store'
import { useSaveStatus } from './store/save-status'
import { downloadProjectJson, downloadRoomCanvasPng, parseProjectFile } from './services/project-file-service'
import { validateLayout } from './domain/validation'
import type { OptimizationMode, OptimizationResult, WorkerResponse } from './optimizer/types'
import { selectDistinctSuggestions } from './optimizer/suggestions'
import { modeLabels } from './optimizer/scoring'
import { getThemePreference, setThemePreference, type ThemePreference } from './theme/theme'
import { formatLength, getOpeningName, zoneBoundaryWithBounds } from './utils/editor-utils'

const optimizerModes: OptimizationMode[] = [OptimizationGoal.Balanced, OptimizationGoal.Natural, OptimizationGoal.FreeSpace]

function App() {
  const room = useEditorStore((state) => state.room)
  const furniture = useEditorStore((state) => state.furniture)
  const openings = useEditorStore((state) => state.openings)
  const zones = useEditorStore((state) => state.zones)
  const savedRooms = useEditorStore((state) => state.savedRooms)
  const selectedId = useEditorStore((state) => state.selectedFurnitureId)
  const selection = useEditorStore((state) => state.selection)
  const lastError = useEditorStore((state) => state.lastError)
  const saveStatus = useSaveStatus()
  const past = useEditorStore((state) => state.past)
  const future = useEditorStore((state) => state.future)
  const select = useEditorStore((state) => state.select)
  const selectFurniture = useEditorStore((state) => state.selectFurniture)
  const addFurniture = useEditorStore((state) => state.addFurniture)
  const addOpening = useEditorStore((state) => state.addOpening)
  const addZone = useEditorStore((state) => state.addZone)
  const applyPlacements = useEditorStore((state) => state.applyPlacements)
  const clearError = useEditorStore((state) => state.clearError)
  const createRoom = useEditorStore((state) => state.createRoom)
  const deleteRoom = useEditorStore((state) => state.deleteRoom)
  const deleteOpening = useEditorStore((state) => state.deleteOpening)
  const deleteZone = useEditorStore((state) => state.deleteZone)
  const importProject = useEditorStore((state) => state.importProject)
  const setPreview = useEditorStore((state) => state.setPreview)
  const setError = useEditorStore((state) => state.setError)
  const switchRoom = useEditorStore((state) => state.switchRoom)
  const updateOpening = useEditorStore((state) => state.updateOpening)
  const updateRoom = useEditorStore((state) => state.updateRoom)
  const setRoomGeometry = useEditorStore((state) => state.setRoomGeometry)
  const updateFurniture = useEditorStore((state) => state.updateFurniture)
  const updateZone = useEditorStore((state) => state.updateZone)
  const duplicateFurniture = useEditorStore((state) => state.duplicateFurniture)
  const deleteFurniture = useEditorStore((state) => state.deleteFurniture)
  const rotateFurniture = useEditorStore((state) => state.rotateFurniture)
  const toggleFurnitureLock = useEditorStore((state) => state.toggleFurnitureLock)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => getThemePreference())
  const [unit, setUnit] = useState<LengthUnit>(() => localStorage.getItem('roomform-unit') === MeasurementUnit.Meters ? MeasurementUnit.Meters : MeasurementUnit.Centimeters)
  const [zoom, setZoom] = useState(1)
  const [viewResetToken, setViewResetToken] = useState(0)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [editingRoomGeometry, setEditingRoomGeometry] = useState(false)
  const [libraryMenuPosition, setLibraryMenuPosition] = useState({ left: 8, top: 8, maxHeight: 280 })
  const [roomPanelOpen, setRoomPanelOpen] = useState(false)
  const [drawingRoom, setDrawingRoom] = useState(false)
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([])
  const [drawingRoomName, setDrawingRoomName] = useState('Custom room')
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [newRoomOpen, setNewRoomOpen] = useState(false)
  const [newRoomMethod, setNewRoomMethod] = useState<RoomCreationMethod>(RoomCreationMethod.Preset)
  const [newRoomName, setNewRoomName] = useState('New room')
  const [newRoomShape, setNewRoomShape] = useState<RoomShape>(RoomShapeKind.Rectangle)
  const [newRoomWidth, setNewRoomWidth] = useState('520')
  const [newRoomDepth, setNewRoomDepth] = useState('390')
  const [zoneType, setZoneType] = useState<RestrictionZone['type']>(RestrictionZoneKind.Forbidden)
  const [optimizerOpen, setOptimizerOpen] = useState(false)
  const [optimizerBusy, setOptimizerBusy] = useState(false)
  const [optimizerProgress, setOptimizerProgress] = useState(0)
  const [optimizerResult, setOptimizerResult] = useState<OptimizationResult | null>(null)
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null)
  const workerRef = useRef<Worker[]>([])
  const optimizerRequestIdRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editingRoomName, setEditingRoomName] = useState(false)
  const [roomNameDraft, setRoomNameDraft] = useState(room.name)
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  const activeTheme = themePreference === 'system' ? systemTheme : themePreference
  const selectedFurniture = furniture.find((item) => item.id === selectedId)
  const selectedOpening = selection?.kind === 'opening' ? openings.find((item) => item.id === selection.id) : undefined
  const selectedZone = selection?.kind === 'zone' ? zones.find((item) => item.id === selection.id) : undefined
  const layoutViolations = validateLayout({ room, furniture, openings, zones })
  const roomList = [
    { id: room.id, name: room.name, active: true },
    ...Object.values(savedRooms).map((project) => ({ id: project.room.id, name: project.room.name, active: false })),
  ]
  const uniqueRoomName = (name: string) => {
    const baseName = name.trim()
    const existingNames = new Set(roomList.map((entry) => entry.name.trim().toLocaleLowerCase()))
    if (!existingNames.has(baseName.toLocaleLowerCase())) return baseName
    let index = 2
    while (existingNames.has(`${baseName} ${index}`.toLocaleLowerCase())) index += 1
    return `${baseName} ${index}`
  }

  useEffect(() => {
    setThemePreference(themePreference)
  }, [activeTheme, themePreference])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? 'dark' : 'light')
    media.addEventListener('change', updateSystemTheme)
    return () => media.removeEventListener('change', updateSystemTheme)
  }, [])

  useEffect(() => {
    localStorage.setItem('roomform-unit', unit)
  }, [unit])

  useEffect(() => () => workerRef.current.forEach((worker) => worker.terminate()), [])

  useEffect(() => {
    const isEditing = (target: EventTarget | null) =>
      target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditing(event.target)) return
      const command = event.ctrlKey || event.metaKey
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (command && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      } else if (command && event.key.toLowerCase() === 'd' && selectedFurniture) {
        event.preventDefault()
        duplicateFurniture(selectedFurniture.id)
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedFurniture) {
        event.preventDefault()
        deleteFurniture(selectedFurniture.id)
      } else if (event.code === 'KeyR' && selectedFurniture && !selectedFurniture.locked) {
        event.preventDefault()
        rotateFurniture(selectedFurniture.id, 90)
      } else if (event.key === 'Escape') {
        setDrawingRoom(false)
        setDrawingPoints([])
        optimizerRequestIdRef.current += 1
        workerRef.current.forEach((worker) => worker.terminate())
        workerRef.current = []
        setOptimizerBusy(false)
        setLibraryOpen(false)
        setExportMenuOpen(false)
        setRoomPanelOpen(false)
        setOptimizerOpen(false)
        setNewRoomOpen(false)
        setShortcutsOpen(false)
        setRoomToDelete(null)
        setPreview(null)
      } else if (!command && event.key.toLowerCase() === 'v') {
        selectFurniture(null)
      } else if (event.key.startsWith('Arrow') && selectedFurniture && !selectedFurniture.locked) {
        event.preventDefault()
        const step = event.shiftKey ? 1 : 10
        const position = { ...selectedFurniture.position }
        if (event.key === 'ArrowLeft') position.x -= step
        if (event.key === 'ArrowRight') position.x += step
        if (event.key === 'ArrowUp') position.y -= step
        if (event.key === 'ArrowDown') position.y += step
        const halfWidth = (selectedFurniture.rotationDeg % 180 === 0 ? selectedFurniture.widthCm : selectedFurniture.depthCm) / 2
        const halfDepth = (selectedFurniture.rotationDeg % 180 === 0 ? selectedFurniture.depthCm : selectedFurniture.widthCm) / 2
        position.x = Math.max(halfWidth, Math.min(room.widthCm - halfWidth, position.x))
        position.y = Math.max(halfDepth, Math.min(room.depthCm - halfDepth, position.y))
        updateFurniture(selectedFurniture.id, { position })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteFurniture, duplicateFurniture, redo, room, rotateFurniture, selectFurniture, selectedFurniture, setPreview, undo, updateFurniture])

  const saveRoomName = () => {
    const name = roomNameDraft.trim()
    if (name) updateRoom({ name })
    else setRoomNameDraft(room.name)
    setEditingRoomName(false)
  }

  const changeRoomShape = (shape: RoomShape) => {
    if (shape === RoomShapeKind.Polygon || shape === (room.shape ?? RoomShapeKind.Rectangle)) return
    try {
      const nextRoom = {
        ...createRoomShape(shape, room.widthCm, room.depthCm, room.name, room.id),
        ceilingHeightCm: room.ceilingHeightCm,
      }
      const retainedOpenings: WallOpening[] = []
      for (const opening of openings) {
        const geometry = openingGeometry(room, opening)
        if (!geometry) continue
        const center = {
          x: (geometry.start.x + geometry.end.x) / 2,
          y: (geometry.start.y + geometry.end.y) / 2,
        }
        const placement = openingPlacementNearPoint(
          nextRoom,
          opening,
          retainedOpenings,
          center,
          opening.widthCm / 2,
          Math.hypot(room.widthCm, room.depthCm) * 2,
        )
        if (placement) retainedOpenings.push({ ...opening, ...placement })
      }
      if (setRoomGeometry(nextRoom, retainedOpenings) && retainedOpenings.length < openings.length) {
        setError('The room shape changed, but some doors or windows could not be preserved.')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to change the room shape.')
    }
  }

  const resetCanvasView = () => {
    setZoom(1)
    setViewResetToken((value) => value + 1)
  }

  const toggleTheme = () => setThemePreferenceState(activeTheme === 'dark' ? 'light' : 'dark')

  const createNewRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newRoomName.trim()) {
      setError('Enter a room name.')
      return
    }
    if (newRoomMethod === RoomCreationMethod.Draw) {
      startRoomDrawing(uniqueRoomName(newRoomName))
      setNewRoomOpen(false)
      setExportMenuOpen(false)
      return
    }
    const width = Number(newRoomWidth)
    const depth = Number(newRoomDepth)
    if (!Number.isFinite(width) || !Number.isFinite(depth) || width < 100 || depth < 100) {
      setError('Enter room dimensions of at least 100 cm.')
      return
    }
    try {
      setEditingRoomGeometry(false)
      createRoom(emptyProject(uniqueRoomName(newRoomName), newRoomShape, width, depth))
      setNewRoomOpen(false)
      setExportMenuOpen(false)
      setRoomPanelOpen(true)
      setNewRoomName('New room')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to create this room.')
    }
  }

  const runOptimizer = () => {
    workerRef.current.forEach((worker) => worker.terminate())
    const requestId = optimizerRequestIdRef.current + 1
    optimizerRequestIdRef.current = requestId
    setOptimizerBusy(true)
    setOptimizerProgress(0)
    setOptimizerResult(null)
    setSelectedSuggestion(null)
    setPreview(null)
    const results: Partial<Record<OptimizationMode, OptimizationResult>> = {}
    const progress = new Map<OptimizationMode, number>(optimizerModes.map((mode) => [mode, 0]))
    let completed = 0
    let failed = false
    const workers: Worker[] = []
    workerRef.current = workers

    const fail = (message: string) => {
      if (failed || optimizerRequestIdRef.current !== requestId) return
      failed = true
      workers.forEach((worker) => worker.terminate())
      if (workerRef.current === workers) workerRef.current = []
      setOptimizerBusy(false)
      setError(message)
    }

    for (const mode of optimizerModes) {
      try {
        const worker = new Worker(new URL('./optimizer/worker.ts', import.meta.url), { type: 'module' })
        workers.push(worker)
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const response = event.data
          if (response.requestId !== requestId || optimizerRequestIdRef.current !== requestId || failed) return
          if (response.type === 'progress') {
            progress.set(mode, response.progress)
            setOptimizerProgress([...progress.values()].reduce((sum, value) => sum + value, 0) / optimizerModes.length)
            return
          }
          if (response.type === 'error') {
            fail(response.message)
            return
          }
          results[mode] = response.result
          progress.set(mode, 1)
          completed += 1
          worker.terminate()
          if (completed < optimizerModes.length) {
            setOptimizerProgress([...progress.values()].reduce((sum, value) => sum + value, 0) / optimizerModes.length)
            return
          }
          const baseline = results[OptimizationGoal.Balanced] ?? results[optimizerModes[0]]
          if (!baseline) {
            fail('The optimizer did not return a baseline result.')
            return
          }
          const allSuggestions = optimizerModes.flatMap((resultMode) => results[resultMode]?.suggestions ?? [])
          const suggestions = selectDistinctSuggestions(allSuggestions, optimizerModes)
          setOptimizerResult({
            ...baseline,
            suggestions,
            conflicts: [...new Set(optimizerModes.flatMap((resultMode) => results[resultMode]?.conflicts ?? []))],
            notes: suggestions.length === 0
              ? [...new Set(optimizerModes.flatMap((resultMode) => results[resultMode]?.notes ?? []))]
              : [],
            candidatesEvaluated: optimizerModes.reduce((sum, resultMode) => sum + (results[resultMode]?.candidatesEvaluated ?? 0), 0),
          })
          const first = suggestions[0]
          if (first) {
            setSelectedSuggestion(first.id)
            setPreview(first.placements)
          }
          setOptimizerBusy(false)
          if (workerRef.current === workers) workerRef.current = []
        }
        worker.onerror = (event) => {
          event.preventDefault()
          fail(event.message || `The ${modeLabels[mode].name.toLowerCase()} optimization could not run.`)
        }
        worker.postMessage({
          type: 'run',
          requestId,
          request: { room, furniture, openings, zones, mode, maxResults: 16, budgetMs: 3500 },
        })
      } catch (error) {
        fail(error instanceof Error ? error.message : 'The optimization workers could not start.')
        break
      }
    }
    if (failed) {
      return
    }
  }

  const cancelOptimizer = () => {
    optimizerRequestIdRef.current += 1
    workerRef.current.forEach((worker) => worker.terminate())
    workerRef.current = []
    setOptimizerBusy(false)
    setPreview(null)
    setOptimizerOpen(false)
  }

  const exportJson = () => {
    downloadProjectJson({ room, furniture, openings, zones })
  }

  const exportPng = async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('.room-canvas')
    if (!canvas) {
      setError('The room canvas is not available for export.')
      return
    }
    try {
      await downloadRoomCanvasPng(canvas, room.name)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create the PNG image.')
    }
  }

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    try {
      const result = await parseProjectFile(file)
      if (!result.ok) {
        setError(result.error)
        return
      }
      importProject({
        room: result.project.room,
        furniture: result.project.furniture,
        openings: result.project.openings,
        zones: result.project.zones,
      })
      setEditingRoomGeometry(false)
      setExportMenuOpen(false)
      setRoomPanelOpen(true)
    } catch (error) {
      setError(error instanceof Error ? `Could not read project file: ${error.message}` : 'Could not read project file.')
    }
  }

  const addRestrictionZone = () => {
    const width = Math.min(120, room.widthCm / 3)
    const depth = Math.min(100, room.depthCm / 3)
    const zone = rectangleZone(
      zoneType,
      (room.widthCm - width) / 2,
      (room.depthCm - depth) / 2,
      width,
      depth,
    )
    addZone(zone)
    setRoomPanelOpen(true)
  }

  const startRoomDrawing = (name = 'Custom room') => {
    setDrawingPoints([])
    setDrawingRoomName(name)
    setDrawingRoom(true)
    setRoomPanelOpen(false)
    setZoom(1)
    setViewResetToken((value) => value + 1)
  }

  const cancelRoomDrawing = () => {
    setDrawingRoom(false)
    setDrawingPoints([])
  }

  const finishRoomDrawing = () => {
    try {
      const drawnRoom = createPolygonRoom(drawingPoints, uniqueRoomName(drawingRoomName))
      createRoom(emptyRoomProject(drawnRoom))
      setEditingRoomGeometry(false)
      cancelRoomDrawing()
      setRoomPanelOpen(true)
      setViewResetToken((value) => value + 1)
      setZoom(1)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create this room outline.')
    }
  }

  const openOptimizer = () => {
    setOptimizerOpen(true)
    runOptimizer()
  }

  const toggleLibrary = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (libraryOpen) {
      setLibraryOpen(false)
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const width = Math.min(230, window.innerWidth - 16)
    const maxHeight = Math.min(280, window.innerHeight - 16)
    const mobile = window.innerWidth <= 980
    const left = mobile
      ? Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8))
      : Math.max(8, Math.min(bounds.right + 8, window.innerWidth - width - 8))
    const top = Math.max(8, Math.min(bounds.top, window.innerHeight - maxHeight - 8))
    setLibraryMenuPosition({ left, top, maxHeight })
    setLibraryOpen(true)
  }

  return (
    <main className="app-shell" onClick={(event) => {
      if (!(event.target instanceof Element) || !event.target.closest('.library-control, .library-menu')) setLibraryOpen(false)
      if (!(event.target instanceof Element) || !event.target.closest('.export-menu-control')) setExportMenuOpen(false)
    }}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Roomize home">
          <span className="brand-mark"><Grid2X2 size={17} strokeWidth={2.3} /></span>
          <span className="brand-copy"><strong>Roomize</strong><small>Room layout optimizer</small></span>
        </a>
        <div className="project-name">
          {editingRoomName ? (
            <input
              autoFocus
              aria-label="Room name"
              value={roomNameDraft}
              onChange={(event) => setRoomNameDraft(event.target.value)}
              onBlur={saveRoomName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveRoomName()
                if (event.key === 'Escape') {
                  setRoomNameDraft(room.name)
                  setEditingRoomName(false)
                }
              }}
            />
          ) : <span className="room-name-label">{room.name}</span>}
          {!editingRoomName && (
            <button
              className="room-rename-button"
              aria-label="Rename room"
              title="Rename room"
              onClick={() => {
                setRoomNameDraft(room.name)
                setEditingRoomName(true)
              }}
            ><Pencil size={13} /></button>
          )}
        </div>
        <div className="topbar-actions">
          <span className={`save-status${saveStatus.state === 'error' ? ' has-error' : ''}`} title={saveStatus.state === 'error' ? 'Could not save changes to this device' : 'Changes are saved to this device'}>
            <span className="status-dot" /> {saveStatus.state === 'error' ? 'Save failed' : 'Saved on this device'}
          </span>
          <div className="export-menu-control">
            <button className="export-menu-button" aria-label="Import and export" aria-expanded={exportMenuOpen} onClick={() => setExportMenuOpen((open) => !open)}>
              <Download size={15} /><span>Import / Export</span><ChevronDown size={13} />
            </button>
            {exportMenuOpen && (
              <div className="export-menu" role="menu" aria-label="Import and export">
                <button role="menuitem" onClick={() => fileInputRef.current?.click()}><Upload size={15} /> Import project JSON</button>
                <button role="menuitem" onClick={() => { exportJson(); setExportMenuOpen(false) }}><Download size={15} /> Export project JSON</button>
                <button role="menuitem" onClick={() => { exportPng(); setExportMenuOpen(false) }}><ImageDown size={15} /> Export room as PNG</button>
                <button role="menuitem" onClick={() => { window.print(); setExportMenuOpen(false) }}><Printer size={15} /> Print plan</button>
              </div>
            )}
            <input ref={fileInputRef} className="sr-only" type="file" accept="application/json,.json" onChange={importJson} />
          </div>
          <span className="topbar-divider" />
          <button className="icon-button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={past.length === 0} onClick={undo}><Undo2 size={17} /></button>
          <button className="icon-button" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={future.length === 0} onClick={redo}><Redo2 size={17} /></button>
          <span className="topbar-divider" />
          <button
            className="icon-button theme-toggle"
            aria-label={`Switch to ${activeTheme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${activeTheme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={toggleTheme}
          >
            {activeTheme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </header>
      {lastError && (
        <div className="error-toast" role="alert">
          <AlertTriangle size={16} /><span>{lastError}</span>
          <button aria-label="Dismiss message" onClick={clearError}><X size={15} /></button>
        </div>
      )}

      <div className="workspace">
        <LeftSidebar
          room={room}
          rooms={roomList}
          furniture={furniture}
          openings={openings}
          selection={selection}
          unit={unit}
          libraryOpen={libraryOpen}
          shortcutsOpen={shortcutsOpen}
          onCreateRoom={() => setNewRoomOpen(true)}
          onChooseRoom={(id) => {
            if (id !== room.id) {
              setEditingRoomGeometry(false)
              switchRoom(id)
            }
            setRoomPanelOpen(true)
          }}
          onToggleLibrary={toggleLibrary}
          onAddOpening={(type) => {
            addOpening(type)
            setRoomPanelOpen(true)
          }}
          onSelectFurniture={(id) => {
            selectFurniture(id)
            setRoomPanelOpen(false)
          }}
          onSelect={(nextSelection) => {
            select(nextSelection)
            setRoomPanelOpen(false)
          }}
          onToggleShortcuts={() => setShortcutsOpen((open) => !open)}
        />

        <section className="canvas-area" aria-label="Room canvas">
          <div className="canvas-toolbar">
            <div className="canvas-toolbar-actions">
              {drawingRoom ? (
                <div className="drawing-actions">
                  <span>{drawingPoints.length === 0 ? 'Click canvas to place corners' : `${drawingPoints.length} corners · drag points to adjust`}</span>
                  <button className="secondary-button" onClick={cancelRoomDrawing}>Cancel</button>
                  <button className="primary-button" disabled={drawingPoints.length < 3} onClick={finishRoomDrawing}><Check size={14} /> Finish room</button>
                </div>
              ) : (
                <div className="canvas-toolbar-layout">
                  <div className="canvas-toolbar-leading">
                    <SelectControl
                      ariaLabel="Measurement units"
                      className="unit-picker"
                      value={unit}
                      options={[
                        { value: MeasurementUnit.Centimeters, label: MeasurementUnit.Centimeters },
                        { value: MeasurementUnit.Meters, label: MeasurementUnit.Meters },
                      ]}
                      onChange={(value) => setUnit(value as LengthUnit)}
                    />
                    {layoutViolations.length > 0 && (
                      <span className="validation-badge" title={layoutViolations.map((violation) => violation.message).join(' ')}>
                        <AlertTriangle size={13} /> {layoutViolations.length} issue{layoutViolations.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <button className="optimize-primary optimize-canvas" onClick={openOptimizer}><WandSparkles size={16} /><span>Optimize layout</span></button>
                </div>
              )}
            </div>
          </div>
          <div className="room-summary canvas-room-summary">
            <div className="summary-heading"><span className="tool-icon"><Ruler size={16} /></span><span>ROOM DIMENSIONS</span></div>
            <div className="dimension-grid">
              <div><span>Width</span><strong>{formatLength(room.widthCm, unit)}</strong></div>
              <div><span>Depth</span><strong>{formatLength(room.depthCm, unit)}</strong></div>
            </div>
            <div className="area-row"><span>Floor area</span><strong>{(roomAreaCm2(room) / 10_000).toFixed(1)} m²</strong></div>
            {roomList.length > 1 && (
              <button className="delete-room-button" onClick={() => setRoomToDelete(room.id)}>
                <Trash2 size={14} /> Delete this room
              </button>
            )}
          </div>
          <RoomCanvas
            unit={unit}
            zoom={zoom}
            onZoomChange={setZoom}
            resetViewToken={viewResetToken}
            editRoom={editingRoomGeometry}
            drawingActive={drawingRoom}
            drawingPoints={drawingPoints}
            onDrawPoint={(point) => setDrawingPoints((points) => [...points, point])}
            onMoveDrawPoint={(index, point) => setDrawingPoints((points) => points.map((existing, current) => current === index ? point : existing))}
          />
          <div className="canvas-footer">
            <span><span className="canvas-live-dot" /> Drag to move · Shift: 1 cm · Wheel: zoom · Space-drag: pan</span>
            <div className="view-controls">
              <button className="fit-view-button" aria-label="Reset canvas view" title="Fit room to view" onClick={resetCanvasView}><LocateFixed size={14} /></button>
              <div className="zoom-controls" aria-label="Canvas zoom controls">
                <button aria-label="Zoom out" title="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value / 1.2))}><ZoomOut size={14} /></button>
                <span className="zoom-indicator">{Math.round(zoom * 100)}%</span>
                <button aria-label="Zoom in" title="Zoom in" disabled={zoom >= 4} onClick={() => setZoom((value) => Math.min(4, value * 1.2))}><ZoomIn size={14} /></button>
              </div>
            </div>
          </div>
          <div className="mobile-actions">
            <div className="mobile-room-size"><strong>{formatLength(room.widthCm, unit)} × {formatLength(room.depthCm, unit)}</strong><span>Room size</span></div>
            <button className="mobile-room-button" onClick={() => setNewRoomOpen(true)} aria-label="Create a new room" title="Create a new room"><Plus size={17} /></button>
            <button className="mobile-room-button" onClick={() => setRoomPanelOpen((open) => !open)} aria-label="Room details"><Ruler size={17} /></button>
            <div className="library-control">
              <button className="add-furniture-button add-object-button" aria-expanded={libraryOpen} onClick={toggleLibrary}>
                <Plus size={16} /> Add furniture
              </button>
            </div>
          </div>
        </section>

        <aside className={`right-panel${selectedFurniture || selectedOpening || selectedZone || roomPanelOpen ? ' is-open' : ''}`} aria-label="Properties">
          <div className="properties-header">
            <div><p className="eyebrow">INSPECTOR</p><h2>{selectedFurniture ? 'Furniture' : selectedOpening ? getOpeningName(selectedOpening, openings) : selectedZone ? 'Restriction zone' : 'Room'}</h2></div>
          </div>

          {selectedFurniture ? (
            <div className="property-content">
              <div className="object-preview">
                <span className="preview-furniture-icon"><Grid2X2 size={21} /></span>
                <div><strong>{selectedFurniture.name}</strong><span>{selectedFurniture.category}</span></div>
              </div>
              <TextField key={selectedFurniture.id + selectedFurniture.name} label="Furniture name" value={selectedFurniture.name} onCommit={(name) => updateFurniture(selectedFurniture.id, { name })} />
              <p className="section-label">DIMENSIONS</p>
              <div className="property-grid">
                <NumberField key={`width-${unit}-${selectedFurniture.widthCm}`} label="Width" valueCm={selectedFurniture.widthCm} unit={unit} onCommit={(widthCm) => updateFurniture(selectedFurniture.id, { widthCm })} />
                <NumberField key={`depth-${unit}-${selectedFurniture.depthCm}`} label="Depth" valueCm={selectedFurniture.depthCm} unit={unit} onCommit={(depthCm) => updateFurniture(selectedFurniture.id, { depthCm })} />
                <NumberField key={`height-${unit}-${selectedFurniture.heightCm}`} label="Height" valueCm={selectedFurniture.heightCm} unit={unit} onCommit={(heightCm) => updateFurniture(selectedFurniture.id, { heightCm })} />
                <AngleField key={`rotation-${selectedFurniture.rotationDeg}`} value={selectedFurniture.rotationDeg} disabled={selectedFurniture.locked} onCommit={(rotationDeg) => updateFurniture(selectedFurniture.id, { rotationDeg })} />
                <NumberField key={`x-${unit}-${selectedFurniture.position.x}`} label="X position" valueCm={selectedFurniture.position.x} unit={unit} minCm={0} disabled={selectedFurniture.locked} onCommit={(x) => updateFurniture(selectedFurniture.id, { position: { ...selectedFurniture.position, x } })} />
                <NumberField key={`y-${unit}-${selectedFurniture.position.y}`} label="Y position" valueCm={selectedFurniture.position.y} unit={unit} minCm={0} disabled={selectedFurniture.locked} onCommit={(y) => updateFurniture(selectedFurniture.id, { position: { ...selectedFurniture.position, y } })} />
              </div>
              <div className="object-actions">
                <button onClick={() => rotateFurniture(selectedFurniture.id, 90)} disabled={selectedFurniture.locked}><RotateCw size={15} /> Rotate 90°</button>
                <button onClick={() => duplicateFurniture(selectedFurniture.id)} disabled={selectedFurniture.locked}><Copy size={15} /> Duplicate</button>
                <button onClick={() => toggleFurnitureLock(selectedFurniture.id)}>
                  {selectedFurniture.locked ? <UnlockKeyhole size={15} /> : <LockKeyhole size={15} />}
                  {selectedFurniture.locked ? 'Unlock' : 'Lock'}
                </button>
                <button className="delete-action" onClick={() => deleteFurniture(selectedFurniture.id)}><Trash2 size={15} /> Delete</button>
              </div>
            </div>
          ) : selectedOpening ? (
            <div className="property-content">
              <TextField
                key={`opening-name-${selectedOpening.id}-${getOpeningName(selectedOpening, openings)}`}
                label={selectedOpening.type === 'door' ? 'Door name' : 'Window name'}
                value={getOpeningName(selectedOpening, openings)}
                onCommit={(name) => updateOpening(selectedOpening.id, { name })}
              />
              <div className="property-grid opening-measurements">
                <NumberField key={`opening-width-${selectedOpening.id}-${selectedOpening.widthCm}`} label="Width" valueCm={selectedOpening.widthCm} unit={unit} minCm={20} onCommit={(widthCm) => updateOpening(selectedOpening.id, { widthCm })} />
                <NumberField key={`opening-height-${selectedOpening.id}-${selectedOpening.heightCm}`} label="Height" valueCm={selectedOpening.heightCm} unit={unit} minCm={20} onCommit={(heightCm) => updateOpening(selectedOpening.id, { heightCm })} />
                {selectedOpening.type === 'window' && (
                  <NumberField key={`opening-sill-${selectedOpening.id}-${selectedOpening.sillHeightCm ?? 0}`} label="Sill height" valueCm={selectedOpening.sillHeightCm ?? 90} unit={unit} minCm={0} onCommit={(sillHeightCm) => updateOpening(selectedOpening.id, { sillHeightCm })} />
                )}
                <NumberField key={`opening-offset-${selectedOpening.id}-${selectedOpening.offsetFromStartCm}`} label="Offset" valueCm={selectedOpening.offsetFromStartCm} unit={unit} minCm={0} onCommit={(offsetFromStartCm) => updateOpening(selectedOpening.id, { offsetFromStartCm })} />
              </div>
              {selectedOpening.type === 'door' && (
                <>
                  <label className="editable-text">
                    <span>Hinge side</span>
                    <SelectControl
                      ariaLabel="Door hinge side"
                      value={selectedOpening.swing ?? 'left'}
                      options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]}
                      onChange={(swing) => updateOpening(selectedOpening.id, { swing })}
                    />
                  </label>
                  <label className="editable-text">
                    <span>Opens</span>
                    <SelectControl
                      ariaLabel="Door opening direction"
                      value={selectedOpening.swingDirection ?? 'inward'}
                      options={[{ value: 'inward', label: 'Into room' }, { value: 'outward', label: 'Out of room' }]}
                      onChange={(swingDirection) => updateOpening(selectedOpening.id, { swingDirection })}
                    />
                  </label>
                  <DoorAngleField
                    key={`door-angle-${selectedOpening.id}-${selectedOpening.swingAngleDeg ?? 90}-${maxDoorSwingAngle(room, selectedOpening)}`}
                    value={selectedOpening.swingAngleDeg ?? 90}
                    max={maxDoorSwingAngle(room, selectedOpening)}
                    onCommit={(swingAngleDeg) => updateOpening(selectedOpening.id, { swingAngleDeg })}
                  />
                  <p className="door-swing-hint">The shaded arc shows the door’s travel. The maximum angle is limited by the room walls.</p>
                </>
              )}
              <button className="delete-action full-width-action" onClick={() => {
                deleteOpening(selectedOpening.id)
                select(null)
              }}><Trash2 size={15} /> Delete opening</button>
            </div>
          ) : selectedZone ? (
            <div className="property-content">
              <TextField key={`zone-${selectedZone.id}-${selectedZone.name}`} label="Zone name" value={selectedZone.name} onCommit={(name) => updateZone(selectedZone.id, { name })} />
              <p className="room-edit-hint">Drag the zone on the canvas to move it.</p>
              <p className="section-label">ZONE BOUNDS</p>
              <div className="property-grid">
                <NumberField key={`zone-x-${unit}-${polygonBounds(selectedZone.boundary).minX}`} label="X position" valueCm={polygonBounds(selectedZone.boundary).minX} unit={unit} minCm={0} onCommit={(x) => updateZone(selectedZone.id, { boundary: zoneBoundaryWithBounds(selectedZone.boundary, { x }) })} />
                <NumberField key={`zone-y-${unit}-${polygonBounds(selectedZone.boundary).minY}`} label="Y position" valueCm={polygonBounds(selectedZone.boundary).minY} unit={unit} minCm={0} onCommit={(y) => updateZone(selectedZone.id, { boundary: zoneBoundaryWithBounds(selectedZone.boundary, { y }) })} />
                <NumberField key={`zone-width-${unit}-${polygonBounds(selectedZone.boundary).maxX - polygonBounds(selectedZone.boundary).minX}`} label="Width" valueCm={polygonBounds(selectedZone.boundary).maxX - polygonBounds(selectedZone.boundary).minX} unit={unit} minCm={20} onCommit={(width) => updateZone(selectedZone.id, { boundary: zoneBoundaryWithBounds(selectedZone.boundary, { width }) })} />
                <NumberField key={`zone-depth-${unit}-${polygonBounds(selectedZone.boundary).maxY - polygonBounds(selectedZone.boundary).minY}`} label="Depth" valueCm={polygonBounds(selectedZone.boundary).maxY - polygonBounds(selectedZone.boundary).minY} unit={unit} minCm={20} onCommit={(depth) => updateZone(selectedZone.id, { boundary: zoneBoundaryWithBounds(selectedZone.boundary, { depth }) })} />
              </div>
              <label className="zone-hard-toggle">
                <input type="checkbox" checked={selectedZone.hardConstraint} onChange={(event) => updateZone(selectedZone.id, { hardConstraint: event.target.checked })} />
                <span>Prevent furniture placement here</span>
              </label>
              <button className="delete-action full-width-action" onClick={() => {
                deleteZone(selectedZone.id)
                select(null)
              }}><Trash2 size={15} /> Delete zone</button>
            </div>
          ) : (
            <div className="property-content room-properties">
              <div className="room-property-card">
                <span className="property-icon"><Grid2X2 size={16} /></span>
                <div className="room-shape-control">
                  <span>Room shape</span>
                  <SelectControl
                    ariaLabel="Room shape"
                    value={room.shape ?? RoomShapeKind.Rectangle}
                    options={Object.entries(roomShapeLabels)
                      .filter(([shape]) => shape !== RoomShapeKind.Polygon || room.shape === RoomShapeKind.Polygon)
                      .map(([shape, label]) => ({ value: shape as RoomShape, label }))}
                    onChange={changeRoomShape}
                  />
                </div>
              </div>
              <button
                className={`secondary-button room-edit-toggle${editingRoomGeometry ? ' is-active' : ''}`}
                aria-pressed={editingRoomGeometry}
                onClick={() => setEditingRoomGeometry((editing) => !editing)}
              >
                <Pencil size={14} /> {editingRoomGeometry ? 'Finish editing room' : 'Edit room'}
              </button>
              {editingRoomGeometry && <p className="room-edit-hint">Drag a corner to reshape the room. Hold Shift for 1 cm movement.</p>}
              <div className="property-grid room-dimension-fields">
                <NumberField key={`room-width-${unit}-${room.widthCm}`} label="Width" valueCm={room.widthCm} unit={unit} minCm={100} onCommit={(widthCm) => updateRoom({ widthCm })} />
                <NumberField key={`room-depth-${unit}-${room.depthCm}`} label="Depth" valueCm={room.depthCm} unit={unit} minCm={100} onCommit={(depthCm) => updateRoom({ depthCm })} />
                <NumberField key={`room-height-${unit}-${room.ceilingHeightCm}`} label="Ceiling height" valueCm={room.ceilingHeightCm} unit={unit} minCm={100} onCommit={(ceilingHeightCm) => updateRoom({ ceilingHeightCm })} />
              </div>
              <div className="room-feature-section">
                <div className="feature-heading"><p className="section-label">RESTRICTION ZONES</p><span>{zones.length}</span></div>
                <div className="zone-add-row">
                  <SelectControl
                    ariaLabel="New zone type"
                    className="zone-select"
                    value={zoneType}
                    options={[
                      { value: RestrictionZoneKind.Forbidden, label: 'Forbidden' },
                      { value: RestrictionZoneKind.RequiredClearance, label: 'Required clearance' },
                      { value: RestrictionZoneKind.Functional, label: 'Functional' },
                      { value: RestrictionZoneKind.WalkingPath, label: 'Walking path' },
                    ]}
                    onChange={(value) => setZoneType(value as RestrictionZone['type'])}
                  />
                  <button onClick={addRestrictionZone} aria-label="Add restriction zone"><Plus size={15} /></button>
                </div>
                {zones.map((zone) => (
                  <button key={zone.id} className={`feature-list-row${selection?.kind === 'zone' && selection.id === zone.id ? ' is-selected' : ''}`} onClick={() => select({ kind: 'zone', id: zone.id })}>
                    <span className={`zone-dot zone-${zone.type}`} /><span>{zone.name}</span><small>{zone.hardConstraint ? 'Hard' : 'Soft'}</small>
                  </button>
                ))}
              </div>
              {layoutViolations.length > 0 && (
                <div className="validation-list" role="status">
                  <strong><AlertTriangle size={14} /> Placement issues ({layoutViolations.length})</strong>
                  {layoutViolations.slice(0, 4).map((violation, index) => <p key={`${violation.itemId}-${index}`}>{violation.message}</p>)}
                </div>
              )}
            </div>
          )}

          <div className="inspector-bottom">
            <div className="furniture-count"><span>Objects in room</span><strong>{furniture.length}</strong></div>
          </div>
        </aside>
      </div>

      {libraryOpen && (
        <FurnitureLibraryMenu
          position={libraryMenuPosition}
          onAdd={(name) => {
            addFurniture(name)
            setLibraryOpen(false)
          }}
        />
      )}
      {newRoomOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setNewRoomOpen(false)
        }}>
          <section className="app-modal new-room-modal" role="dialog" aria-modal="true" aria-labelledby="new-room-title">
            <header className="modal-header">
              <div><p className="eyebrow">ROOM SETUP</p><h2 id="new-room-title">Create a room</h2></div>
              <button className="icon-button" aria-label="Close" onClick={() => setNewRoomOpen(false)}><X size={17} /></button>
            </header>
            <form onSubmit={createNewRoom}>
              <TextField label="Room name" value={newRoomName} onCommit={setNewRoomName} />
              <fieldset className="room-method-picker">
                <legend>How would you like to create it?</legend>
                <button type="button" className={`room-method-card${newRoomMethod === RoomCreationMethod.Preset ? ' is-selected' : ''}`} aria-pressed={newRoomMethod === RoomCreationMethod.Preset} onClick={() => setNewRoomMethod(RoomCreationMethod.Preset)}>
                  <Grid2X2 size={17} /><span><strong>Use a standard shape</strong><small>Choose a preset and set its dimensions</small></span>
                </button>
                <button type="button" className={`room-method-card${newRoomMethod === RoomCreationMethod.Draw ? ' is-selected' : ''}`} aria-pressed={newRoomMethod === RoomCreationMethod.Draw} onClick={() => setNewRoomMethod(RoomCreationMethod.Draw)}>
                  <Pencil size={17} /><span><strong>Draw it myself</strong><small>Trace a custom outline on the canvas</small></span>
                </button>
              </fieldset>
              {newRoomMethod === RoomCreationMethod.Preset ? (
                <>
              <label className="editable-text"><span>Room shape</span>
                <SelectControl
                  ariaLabel="Room shape"
                  value={newRoomShape}
                  options={Object.entries(roomShapeLabels)
                    .filter(([shape]) => shape !== RoomShapeKind.Polygon)
                    .map(([shape, label]) => ({ value: shape as RoomShape, label }))}
                  onChange={setNewRoomShape}
                />
              </label>
              <div className="property-grid">
                <label className="editable-number"><span>Width</span><span className="editable-number-input"><input aria-label="Room width in cm" type="number" min="100" step="10" value={newRoomWidth} onChange={(event) => setNewRoomWidth(event.target.value)} /><small>cm</small></span></label>
                <label className="editable-number"><span>Depth</span><span className="editable-number-input"><input aria-label="Room depth in cm" type="number" min="100" step="10" value={newRoomDepth} onChange={(event) => setNewRoomDepth(event.target.value)} /><small>cm</small></span></label>
              </div>
                </>
              ) : (
                <p className="room-draw-hint">After you continue, click at least three corners to outline the room. You can cancel or finish the drawing at any time.</p>
              )}
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setNewRoomOpen(false)}>Cancel</button>
                <button type="submit" className="primary-button">{newRoomMethod === RoomCreationMethod.Draw ? <Pencil size={15} /> : <Plus size={15} />}{newRoomMethod === RoomCreationMethod.Draw ? 'Start drawing' : 'Create room'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {roomToDelete && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setRoomToDelete(null)
        }}>
          <section className="app-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-room-title" aria-describedby="delete-room-description">
            <header className="modal-header">
              <div><p className="eyebrow">DELETE ROOM</p><h2 id="delete-room-title">Delete this room?</h2></div>
              <button className="icon-button" aria-label="Close" onClick={() => setRoomToDelete(null)}><X size={17} /></button>
            </header>
            <p id="delete-room-description">“{roomList.find((entry) => entry.id === roomToDelete)?.name ?? 'This room'}” and its contents will be permanently removed.</p>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setRoomToDelete(null)}>Cancel</button>
              <button className="danger-button" onClick={() => {
                deleteRoom(roomToDelete)
                setEditingRoomGeometry(false)
                setRoomToDelete(null)
              }}><Trash2 size={15} /> Delete room</button>
            </div>
          </section>
        </div>
      )}
      {optimizerOpen && (
        <OptimizerDialog
          busy={optimizerBusy}
          progress={optimizerProgress}
          result={optimizerResult}
          room={room}
          furniture={furniture}
          openings={openings}
          selectedSuggestion={selectedSuggestion}
          onSelectSuggestion={(suggestion) => {
            setSelectedSuggestion(suggestion.id)
            setPreview(suggestion.placements)
          }}
          onApply={(placements) => {
            applyPlacements(placements)
            setPreview(null)
            setOptimizerOpen(false)
          }}
          onClose={() => {
            setPreview(null)
            setOptimizerOpen(false)
          }}
          onCancel={cancelOptimizer}
        />
      )}
      {shortcutsOpen && (
        <aside className="shortcuts-toast" role="status" aria-label="Keyboard shortcuts">
          <div className="shortcuts-toast-heading"><strong>Keyboard shortcuts</strong><button aria-label="Close shortcuts" onClick={() => setShortcutsOpen(false)}><X size={15} /></button></div>
          <div className="shortcut-list">
            <span><kbd>V</kbd> Select</span><span><kbd>Drag</kbd> Move object</span><span><kbd>R</kbd> Rotate</span>
            <span><kbd>Ctrl/Cmd + Z</kbd> Undo</span><span><kbd>Ctrl/Cmd + D</kbd> Duplicate</span>
            <span><kbd>Delete</kbd> Remove</span><span><kbd>Arrows</kbd> Move selected</span>
          </div>
        </aside>
      )}
    </main>
  )
}

export default App
