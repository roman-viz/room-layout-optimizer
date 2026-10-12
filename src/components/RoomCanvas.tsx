import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { fitBounds, worldToCanvas, type ViewTransform } from '../domain/coordinates'
import { roomBoundaryToPolygon } from '../domain/geometry'
import { doorSwingGeometry, openingGeometry, openingPlacementNearPoint } from '../domain/openings'
import { pointInPolygonInclusive } from '../domain/polygon'
import { clampFurniturePositionToRoom } from '../domain/furniture-placement'
import { validateLayout, violationsByItem } from '../domain/validation'
import { moveCorner as moveRoomCorner } from '../domain/rooms'
import type { FurnitureItem, Point, Room, WallOpening } from '../domain/models'
import { useEditorStore } from '../store/editor-store'
import type { LengthUnit } from '../domain/enums'

export type { LengthUnit } from '../domain/enums'

interface DragState {
  kind: 'move' | 'resize' | 'pan' | 'opening' | 'zone' | 'corner'
  id: string | null
  cornerIndex?: number
  pointerOffset: Point
  startClient: Point
  lastPosition: Point
  lastSize: { widthCm: number; depthCm: number }
  resizeCursor?: string
  openingWallSegmentId?: string
  startPan: Point
  moved: boolean
}

interface DragPreview {
  id?: string
  position: Point
  widthCm?: number
  depthCm?: number
  guides?: { x?: number; y?: number }
  openingId?: string
  openingWallSegmentId?: string
  openingOffset?: number
  zoneId?: string
  zoneDelta?: Point
  cornerIndex?: number
  cornerPoint?: Point
}

interface CanvasPalette {
  canvas: string
  grid: string
  room: string
  wall: string
  furnitureText: string
  furnitureLabel: string
  selection: string
  zone: string
  window: string
  conflict: string
}

function readPalette(element: HTMLElement): CanvasPalette {
  const styles = getComputedStyle(element)
  return {
    canvas: styles.getPropertyValue('--canvas-bg').trim(),
    grid: styles.getPropertyValue('--canvas-grid').trim(),
    room: styles.getPropertyValue('--room-fill').trim(),
    wall: styles.getPropertyValue('--room-wall').trim(),
    furnitureText: styles.getPropertyValue('--text-secondary').trim(),
    furnitureLabel: styles.getPropertyValue('--furniture-label').trim(),
    selection: styles.getPropertyValue('--accent').trim(),
    zone: styles.getPropertyValue('--zone-fill').trim(),
    window: styles.getPropertyValue('--window-mark').trim(),
    conflict: styles.getPropertyValue('--danger').trim(),
  }
}

function traceRoom(context: CanvasRenderingContext2D, room: Room, transform: ViewTransform): void {
  const first = room.boundary[0]
  if (!first) return
  const start = worldToCanvas(first.start, transform)
  context.beginPath()
  context.moveTo(start.x, start.y)

  for (const segment of room.boundary) {
    if (segment.type === 'line') {
      const end = worldToCanvas(segment.end, transform)
      context.lineTo(end.x, end.y)
    } else {
      const control1 = worldToCanvas(segment.control1, transform)
      const control2 = worldToCanvas(segment.control2, transform)
      const end = worldToCanvas(segment.end, transform)
      context.bezierCurveTo(control1.x, control1.y, control2.x, control2.y, end.x, end.y)
    }
  }
  context.closePath()
}

function formatLength(valueCm: number, unit: LengthUnit): string {
  return unit === 'cm'
    ? `${Math.round(valueCm)} cm`
    : `${(valueCm / 100).toFixed(2).replace(/\.?0+$/, '')} m`
}

function drawMeasurementLabel(
  context: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  text: string,
  color: string,
  background: string,
): void {
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1
  const labelX = midpoint.x + (end.y - start.y) / length * 12
  const labelY = midpoint.y - (end.x - start.x) / length * 12
  context.save()
  context.font = '10px Inter, system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const width = context.measureText(text).width + 10
  context.globalAlpha = 0.92
  context.fillStyle = background
  context.fillRect(labelX - width / 2, labelY - 8, width, 16)
  context.fillStyle = color
  context.fillText(text, labelX, labelY)
  context.restore()
}

function pointInFurniture(point: Point, furniture: FurnitureItem): boolean {
  const { x: localX, y: localY } = furnitureLocalPoint(point, furniture)
  return Math.abs(localX) <= furniture.widthCm / 2 && Math.abs(localY) <= furniture.depthCm / 2
}

function furnitureLocalPoint(point: Point, furniture: FurnitureItem): Point {
  const radians = -furniture.rotationDeg * Math.PI / 180
  const dx = point.x - furniture.position.x
  const dy = point.y - furniture.position.y
  const localX = dx * Math.cos(radians) - dy * Math.sin(radians)
  const localY = dx * Math.sin(radians) + dy * Math.cos(radians)
  return { x: localX, y: localY }
}

function resizeCornerAt(point: Point, furniture: FurnitureItem, scale: number): { x: number; y: number } | undefined {
  const local = furnitureLocalPoint(point, furniture)
  const tolerance = 16 / scale
  return [
    { x: -1, y: -1 }, { x: 1, y: -1 },
    { x: -1, y: 1 }, { x: 1, y: 1 },
  ].find((corner) =>
    Math.hypot(local.x - corner.x * furniture.widthCm / 2, local.y - corner.y * furniture.depthCm / 2) <= tolerance,
  )
}

function resizeCursor(corner: { x: number; y: number }, rotationDeg: number): string {
  const radians = rotationDeg * Math.PI / 180
  const x = corner.x * Math.cos(radians) - corner.y * Math.sin(radians)
  const y = corner.x * Math.sin(radians) + corner.y * Math.cos(radians)
  return x * y >= 0 ? 'nwse-resize' : 'nesw-resize'
}

function distanceToLineSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const along = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (start.x + dx * along), point.y - (start.y + dy * along))
}

function openingHitAtPoint(point: Point, room: Room, openings: WallOpening[], tolerance: number) {
  return [...openings].reverse().find((opening) => {
    const geometry = openingGeometry(room, opening)
    if (!geometry) return false
    if (distanceToLineSegment(point, geometry.start, geometry.end) <= tolerance) return true
    if (opening.type !== 'door') return false
    const swing = doorSwingGeometry(room, opening)
    if (!swing || swing.angleDeg <= 0) return false
    if (distanceToLineSegment(point, swing.hinge, swing.openEnd) <= tolerance) return true
    const dx = point.x - swing.hinge.x
    const dy = point.y - swing.hinge.y
    const radius = Math.hypot(dx, dy)
    if (radius > opening.widthCm + tolerance) return false
    const startAngle = Math.atan2(swing.closedEnd.y - swing.hinge.y, swing.closedEnd.x - swing.hinge.x)
    const pointAngle = Math.atan2(dy, dx)
    const twoPi = Math.PI * 2
    const sweptAngle = ((pointAngle - startAngle) * swing.rotationSign % twoPi + twoPi) % twoPi
    return sweptAngle <= swing.angleDeg * Math.PI / 180 + tolerance / Math.max(radius, 1)
  })
}

export function RoomCanvas({
  unit,
  zoom = 1,
  resetViewToken = 0,
  onZoomChange,
  drawingActive = false,
  drawingPoints = [],
  onDrawPoint,
  onMoveDrawPoint,
  editRoom = false,
}: {
  unit: LengthUnit
  zoom?: number
  resetViewToken?: number
  onZoomChange?: (zoom: number) => void
  drawingActive?: boolean
  drawingPoints?: Point[]
  onDrawPoint?: (point: Point) => void
  onMoveDrawPoint?: (index: number, point: Point) => void
  editRoom?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const room = useEditorStore((state) => state.room)
  const furniture = useEditorStore((state) => state.furniture)
  const openings = useEditorStore((state) => state.openings)
  const zones = useEditorStore((state) => state.zones)
  const optimizationPreview = useEditorStore((state) => state.preview)
  const selectedId = useEditorStore((state) => state.selectedFurnitureId)
  const selection = useEditorStore((state) => state.selection)
  const select = useEditorStore((state) => state.select)
  const selectFurniture = useEditorStore((state) => state.selectFurniture)
  const moveFurniture = useEditorStore((state) => state.moveFurniture)
  const updateFurniture = useEditorStore((state) => state.updateFurniture)
  const updateOpening = useEditorStore((state) => state.updateOpening)
  const moveZone = useEditorStore((state) => state.moveZone)
  const moveCorner = useEditorStore((state) => state.moveCorner)
  const beginHistory = useEditorStore((state) => state.beginHistory)
  const transformRef = useRef<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 })
  const baseTransformRef = useRef<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 })
  const panRef = useRef<Point>({ x: 0, y: 0 })
  const spaceDownRef = useRef(false)
  const dragRef = useRef<DragState | null>(null)
  const drawVertexRef = useRef<number | null>(null)
  const drawRef = useRef<(preview?: DragPreview) => void>(() => {})
  const scheduledDraw = useRef<number | null>(null)
  const [cursorPosition, setCursorPosition] = useState<Point | null>(null)
  const [drawingCursor, setDrawingCursor] = useState<Point | null>(null)

  const draw = useCallback((preview?: DragPreview) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const bounds = canvas.getBoundingClientRect()
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(bounds.width * pixelRatio)
    canvas.height = Math.round(bounds.height * pixelRatio)
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    const palette = readPalette(canvas)
    context.fillStyle = palette.canvas
    context.fillRect(0, 0, bounds.width, bounds.height)

    const isMobileCanvas = window.matchMedia('(max-width: 760px)').matches
    const isWideDesktopCanvas = !isMobileCanvas && bounds.width >= 1000
    const padding = isMobileCanvas ? 74 : isWideDesktopCanvas ? 88 : 52
    const summaryClearance = isMobileCanvas || !isWideDesktopCanvas
      ? Math.min(220, bounds.height * 0.38)
      : 0
    const summaryInset = isWideDesktopCanvas ? Math.min(280, bounds.width * 0.32) : 0
    const base = fitBounds(
      room.widthCm,
      room.depthCm,
      bounds.width - summaryInset,
      bounds.height,
      padding,
      summaryClearance,
    )
    base.offsetX += summaryInset
    baseTransformRef.current = base
    const offsetX = bounds.width / 2 + (base.offsetX - bounds.width / 2) * zoom + panRef.current.x
    const offsetY = bounds.height / 2 + (base.offsetY - bounds.height / 2) * zoom + panRef.current.y
    const transform = { scale: base.scale * zoom, offsetX, offsetY }
    transformRef.current = transform

    if (drawingActive) {
      const gridSpacing = transform.scale * 10
      if (gridSpacing >= 5) {
        context.beginPath()
        context.strokeStyle = palette.grid
        context.lineWidth = 0.65
        for (let x = ((transform.offsetX % gridSpacing) + gridSpacing) % gridSpacing; x <= bounds.width; x += gridSpacing) {
          context.moveTo(x, 0)
          context.lineTo(x, bounds.height)
        }
        for (let y = ((transform.offsetY % gridSpacing) + gridSpacing) % gridSpacing; y <= bounds.height; y += gridSpacing) {
          context.moveTo(0, y)
          context.lineTo(bounds.width, y)
        }
        context.stroke()
      }
      if (drawingPoints.length > 0) {
        context.save()
        context.beginPath()
        const canvasPoints = drawingPoints.map((point) => worldToCanvas(point, transform))
        const first = canvasPoints[0]
        context.moveTo(first.x, first.y)
        for (const point of canvasPoints.slice(1)) {
          context.lineTo(point.x, point.y)
        }
        if (drawingPoints.length >= 3) context.closePath()
        context.fillStyle = palette.zone
        context.strokeStyle = palette.selection
        context.lineWidth = 2
        context.setLineDash([7, 5])
        if (drawingPoints.length >= 3) context.fill()
        context.stroke()
        context.setLineDash([])
        for (let index = 1; index < canvasPoints.length; index += 1) {
          drawMeasurementLabel(
            context,
            canvasPoints[index - 1],
            canvasPoints[index],
            formatLength(Math.hypot(
              drawingPoints[index].x - drawingPoints[index - 1].x,
              drawingPoints[index].y - drawingPoints[index - 1].y,
            ), unit),
            palette.furnitureText,
            palette.canvas,
          )
        }
        if (drawingPoints.length >= 3) {
          const lastPoint = drawingPoints[drawingPoints.length - 1]
          const firstPoint = drawingPoints[0]
          drawMeasurementLabel(
            context,
            canvasPoints[canvasPoints.length - 1],
            first,
            formatLength(Math.hypot(firstPoint.x - lastPoint.x, firstPoint.y - lastPoint.y), unit),
            palette.furnitureText,
            palette.canvas,
          )
        }
        if (drawingCursor) {
          const cursor = worldToCanvas(drawingCursor, transform)
          const lastPoint = canvasPoints[canvasPoints.length - 1]
          context.beginPath()
          context.moveTo(lastPoint.x, lastPoint.y)
          context.lineTo(cursor.x, cursor.y)
          context.strokeStyle = palette.selection
          context.lineWidth = 1.5
          context.setLineDash([4, 4])
          context.stroke()
          context.setLineDash([])
          drawMeasurementLabel(
            context,
            lastPoint,
            cursor,
            formatLength(Math.hypot(
              drawingCursor.x - drawingPoints[drawingPoints.length - 1].x,
              drawingCursor.y - drawingPoints[drawingPoints.length - 1].y,
            ), unit),
            palette.furnitureText,
            palette.canvas,
          )
        }
        for (const point of drawingPoints) {
          const vertex = worldToCanvas(point, transform)
          context.beginPath()
          context.arc(vertex.x, vertex.y, 5, 0, Math.PI * 2)
          context.fillStyle = palette.canvas
          context.fill()
          context.strokeStyle = palette.selection
          context.stroke()
        }
        context.restore()
      }
      return
    }

    const roomPreview = preview?.cornerIndex !== undefined && preview.cornerPoint
      ? moveRoomCorner(room, preview.cornerIndex, preview.cornerPoint)
      : null
    const drawnRoom = roomPreview?.ok ? roomPreview.value : room
    traceRoom(context, drawnRoom, transform)
    context.save()
    context.clip()
    context.fillStyle = palette.room
    context.fill()

    const gridSpacing = transform.scale * 10
    if (gridSpacing >= 5) {
      const topLeft = worldToCanvas({ x: 0, y: 0 }, transform)
      const bottomRight = worldToCanvas({ x: room.widthCm, y: room.depthCm }, transform)
      context.beginPath()
      context.strokeStyle = palette.grid
      context.lineWidth = 0.65
      for (let x = topLeft.x; x <= bottomRight.x; x += gridSpacing) {
        context.moveTo(x, topLeft.y)
        context.lineTo(x, bottomRight.y)
      }
      for (let y = topLeft.y; y <= bottomRight.y; y += gridSpacing) {
        context.moveTo(topLeft.x, y)
        context.lineTo(bottomRight.x, y)
      }
      context.stroke()
    }
    context.restore()

    traceRoom(context, drawnRoom, transform)
    context.strokeStyle = palette.wall
    context.lineWidth = 2.2
    context.stroke()

    const polygon = roomBoundaryToPolygon(room)
    for (const zone of zones) {
      if (zone.boundary.length < 3) continue
      const zoneDelta = preview?.zoneId === zone.id ? preview.zoneDelta : undefined
      const boundary = zoneDelta
        ? zone.boundary.map((point) => ({ x: point.x + zoneDelta.x, y: point.y + zoneDelta.y }))
        : zone.boundary
      context.beginPath()
      const first = worldToCanvas(boundary[0], transform)
      context.moveTo(first.x, first.y)
      for (const point of boundary.slice(1)) {
        const canvasPoint = worldToCanvas(point, transform)
        context.lineTo(canvasPoint.x, canvasPoint.y)
      }
      context.closePath()
      context.fillStyle = zone.type === 'forbidden' ? 'rgba(205, 79, 72, 0.18)' : palette.zone
      const selected = selection?.kind === 'zone' && selection.id === zone.id
      context.strokeStyle = selected ? palette.selection : zone.type === 'forbidden' ? 'rgba(205, 79, 72, 0.75)' : palette.selection
      context.lineWidth = selected ? 2 : 1.2
      context.setLineDash([5, 4])
      context.fill()
      context.stroke()
      context.setLineDash([])
    }

    for (const opening of openings) {
      const openingWallSegmentId = preview?.openingId === opening.id
        ? preview.openingWallSegmentId ?? opening.wallSegmentId
        : opening.wallSegmentId
      const wall = room.boundary.find((segment) => segment.id === openingWallSegmentId)
      if (!wall || wall.type !== 'line') continue
      const dx = wall.end.x - wall.start.x
      const dy = wall.end.y - wall.start.y
      const length = Math.hypot(dx, dy)
      if (length === 0) continue
      const ux = dx / length
      const uy = dy / length
      const openingOffset = preview?.openingId === opening.id
        ? preview.openingOffset ?? opening.offsetFromStartCm
        : opening.offsetFromStartCm
      const startWorld = {
        x: wall.start.x + ux * openingOffset,
        y: wall.start.y + uy * openingOffset,
      }
      const endWorld = {
        x: wall.start.x + ux * (openingOffset + opening.widthCm),
        y: wall.start.y + uy * (openingOffset + opening.widthCm),
      }
      let normal = { x: -uy, y: ux }
      const midpoint = { x: (startWorld.x + endWorld.x) / 2, y: (startWorld.y + endWorld.y) / 2 }
      if (!pointInPolygonInclusive({ x: midpoint.x + normal.x * 4, y: midpoint.y + normal.y * 4 }, polygon)) {
        normal = { x: -normal.x, y: -normal.y }
      }
      const hinge = opening.swing === 'right' ? endWorld : startWorld
      const start = worldToCanvas(hinge, transform)
      const end = worldToCanvas(opening.swing === 'right' ? startWorld : endWorld, transform)
      const doorSwing = opening.type === 'door'
        ? doorSwingGeometry(room, {
          ...opening,
          wallSegmentId: openingWallSegmentId,
          offsetFromStartCm: openingOffset,
        })
        : null
      context.beginPath()
      context.moveTo(start.x, start.y)
      context.lineTo(end.x, end.y)
      context.strokeStyle = palette.canvas
      context.lineWidth = 6
      context.stroke()
      if (opening.type === 'door') {
        if (doorSwing && doorSwing.angleDeg > 0) {
          const hinge = worldToCanvas(doorSwing.hinge, transform)
          const closedEnd = worldToCanvas(doorSwing.closedEnd, transform)
          const radius = opening.widthCm * transform.scale
          const startAngle = Math.atan2(closedEnd.y - hinge.y, closedEnd.x - hinge.x)
          const endAngle = startAngle + doorSwing.rotationSign * doorSwing.angleDeg * Math.PI / 180
          context.beginPath()
          context.moveTo(hinge.x, hinge.y)
          context.lineTo(closedEnd.x, closedEnd.y)
          context.arc(hinge.x, hinge.y, radius, startAngle, endAngle, doorSwing.rotationSign < 0)
          context.closePath()
          context.fillStyle = 'rgba(93, 137, 101, 0.2)'
          context.fill()
          context.beginPath()
          context.arc(hinge.x, hinge.y, radius, startAngle, endAngle, doorSwing.rotationSign < 0)
          context.strokeStyle = palette.selection
          context.lineWidth = 1
          context.setLineDash([4, 3])
          context.stroke()
          context.setLineDash([])
          const openEnd = worldToCanvas(doorSwing.openEnd, transform)
          context.beginPath()
          context.moveTo(hinge.x, hinge.y)
          context.lineTo(openEnd.x, openEnd.y)
          context.strokeStyle = palette.selection
          context.lineWidth = 2
          context.stroke()
        }
      }
      context.beginPath()
      context.moveTo(start.x, start.y)
      context.lineTo(end.x, end.y)
      context.strokeStyle = opening.type === 'window' ? palette.window : palette.selection
      context.lineWidth = opening.type === 'window' ? 4 : 2
      context.stroke()
      if (opening.type === 'door') {
        const leaf = worldToCanvas(doorSwing?.openEnd ?? {
          x: hinge.x + normal.x * opening.widthCm,
          y: hinge.y + normal.y * opening.widthCm,
        }, transform)
        const doorHinge = worldToCanvas(opening.swing === 'right' ? endWorld : startWorld, transform)
        context.beginPath()
        context.moveTo(doorHinge.x, doorHinge.y)
        context.lineTo(leaf.x, leaf.y)
        context.strokeStyle = palette.selection
        context.lineWidth = 1
        context.stroke()
      }
    }

    const violations = violationsByItem(validateLayout({ room, furniture, openings, zones }))
    if (polygon.length > 0) {
      const topLeft = worldToCanvas(
        { x: Math.min(...polygon.map((point) => point.x)), y: Math.min(...polygon.map((point) => point.y)) },
        transform,
      )
      const bottomRight = worldToCanvas(
        { x: Math.max(...polygon.map((point) => point.x)), y: Math.max(...polygon.map((point) => point.y)) },
        transform,
      )
      context.fillStyle = palette.furnitureText
      context.font = '11px Inter, system-ui, sans-serif'
      context.textAlign = 'center'
      const formatDistance = (valueCm: number) => unit === 'cm'
        ? `${valueCm} cm`
        : `${(valueCm / 100).toFixed(2).replace(/\.?0+$/, '')} m`
      context.fillText(formatDistance(room.widthCm), (topLeft.x + bottomRight.x) / 2, topLeft.y - 13)
      context.save()
      context.translate(topLeft.x - 18, (topLeft.y + bottomRight.y) / 2)
      context.rotate(-Math.PI / 2)
      context.fillText(formatDistance(room.depthCm), 0, 0)
      context.restore()
    }

    if (preview?.guides) {
      context.save()
      context.strokeStyle = palette.selection
      context.lineWidth = 1
      context.setLineDash([5, 4])
      if (preview.guides.x !== undefined) {
        const guide = worldToCanvas({ x: preview.guides.x, y: 0 }, transform)
        context.beginPath()
        context.moveTo(guide.x, 0)
        context.lineTo(guide.x, bounds.height)
        context.stroke()
      }
      if (preview.guides.y !== undefined) {
        const guide = worldToCanvas({ x: 0, y: preview.guides.y }, transform)
        context.beginPath()
        context.moveTo(0, guide.y)
        context.lineTo(bounds.width, guide.y)
        context.stroke()
      }
      context.restore()
    }

    for (const item of furniture) {
      const suggested = optimizationPreview?.find((placement) => placement.id === item.id)
      const itemPosition = preview?.id === item.id ? preview.position : suggested?.position ?? item.position
      const itemWidth = preview?.id === item.id ? preview.widthCm ?? item.widthCm : item.widthCm
      const itemDepth = preview?.id === item.id ? preview.depthCm ?? item.depthCm : item.depthCm
      const itemRotation = suggested?.rotationDeg ?? item.rotationDeg
      const center = worldToCanvas(itemPosition, transform)
      const selected = item.id === selectedId
      const hasConflict = (violations.get(item.id)?.length ?? 0) > 0
      const width = itemWidth * transform.scale
      const height = itemDepth * transform.scale
      context.save()
      context.translate(center.x, center.y)
      context.rotate(itemRotation * Math.PI / 180)
      context.fillStyle = item.color ?? '#c8c9bb'
      context.strokeStyle = hasConflict ? palette.conflict : selected ? palette.selection : 'rgba(71, 79, 67, 0.35)'
      context.lineWidth = selected || hasConflict ? 2 : 1
      context.beginPath()
      context.roundRect(-width / 2, -height / 2, width, height, 5)
      context.fill()
      context.stroke()
      if (selected) {
        context.setLineDash([4, 3])
        context.strokeStyle = palette.selection
        context.lineWidth = 1
        context.strokeRect(-width / 2 - 4, -height / 2 - 4, width + 8, height + 8)
        if (!item.locked) {
          context.setLineDash([])
          context.fillStyle = palette.canvas
          context.strokeStyle = palette.selection
          for (const x of [-width / 2, width / 2]) {
            for (const y of [-height / 2, height / 2]) {
              context.beginPath()
              context.arc(x, y, 4.5, 0, Math.PI * 2)
              context.fill()
              context.stroke()
            }
          }
        }
      }
      context.restore()

      if (transform.scale > 0.48) {
        context.fillStyle = palette.furnitureLabel
        context.strokeStyle = 'rgba(255, 255, 255, 0.82)'
        context.lineWidth = 2.5
        context.font = '600 12px Inter, system-ui, sans-serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.lineJoin = 'round'
        context.strokeText(item.name, center.x, center.y, Math.max(width - 8, 20))
        context.fillText(item.name, center.x, center.y, Math.max(width - 8, 20))
      }
    }
    if (editRoom) {
      room.boundary.forEach((segment, index) => {
        const point = preview?.cornerIndex === index && preview.cornerPoint
          ? preview.cornerPoint
          : segment.start
        const vertex = worldToCanvas(point, transform)
        context.beginPath()
        context.arc(vertex.x, vertex.y, 6, 0, Math.PI * 2)
        context.fillStyle = palette.canvas
        context.fill()
        context.lineWidth = 2
        context.strokeStyle = palette.selection
        context.stroke()
      })
    }
  }, [drawingActive, drawingCursor, drawingPoints, editRoom, furniture, openings, optimizationPreview, room, selectedId, selection, unit, zoom, zones])

  useEffect(() => {
    panRef.current = { x: 0, y: 0 }
    drawRef.current()
  }, [resetViewToken])

  useEffect(() => {
    drawRef.current = draw
    const canvas = canvasRef.current
    if (!canvas) return
    const resizeObserver = new ResizeObserver(() => draw())
    const themeObserver = new MutationObserver(() => draw())
    resizeObserver.observe(canvas)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    draw()
    return () => {
      resizeObserver.disconnect()
      themeObserver.disconnect()
      if (scheduledDraw.current !== null) cancelAnimationFrame(scheduledDraw.current)
    }
  }, [draw])

  const handlePointerDown = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (event.button === 1 || spaceDownRef.current) {
      event.preventDefault()
      dragRef.current = {
        kind: 'pan',
        id: null,
        pointerOffset: { x: 0, y: 0 },
        startClient: { x: event.clientX, y: event.clientY },
        lastPosition: { x: 0, y: 0 },
        lastSize: { widthCm: 0, depthCm: 0 },
        startPan: { ...panRef.current },
        moved: false,
      }
      event.currentTarget.style.cursor = 'grabbing'
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    const bounds = canvas.getBoundingClientRect()
    const pointerWorld = {
      x: (event.clientX - bounds.left - transformRef.current.offsetX) / transformRef.current.scale,
      y: (event.clientY - bounds.top - transformRef.current.offsetY) / transformRef.current.scale,
    }
    if (drawingActive) {
      const bounds = canvas.getBoundingClientRect()
      const pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      const nearestVertex = drawingPoints.reduce<{ index: number; distance: number } | null>((nearest, point, index) => {
        const vertex = worldToCanvas(point, transformRef.current)
        const distance = Math.hypot(pointer.x - vertex.x, pointer.y - vertex.y)
        return distance <= 14 && (!nearest || distance < nearest.distance) ? { index, distance } : nearest
      }, null)
      if (nearestVertex) {
        drawVertexRef.current = nearestVertex.index
        event.currentTarget.style.cursor = 'grabbing'
        event.currentTarget.setPointerCapture(event.pointerId)
        return
      }
      const step = event.shiftKey ? 1 : 10
      setDrawingCursor(null)
      onDrawPoint?.({
        x: Math.round(pointerWorld.x / step) * step,
        y: Math.round(pointerWorld.y / step) * step,
      })
      event.currentTarget.focus()
      return
    }
    if (editRoom) {
      const pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      const nearestCorner = room.boundary.reduce<{ index: number; distance: number } | null>((nearest, segment, index) => {
        const vertex = worldToCanvas(segment.start, transformRef.current)
        const distance = Math.hypot(pointer.x - vertex.x, pointer.y - vertex.y)
        return distance <= 14 && (!nearest || distance < nearest.distance) ? { index, distance } : nearest
      }, null)
      if (nearestCorner) {
        dragRef.current = {
          kind: 'corner',
          id: null,
          cornerIndex: nearestCorner.index,
          pointerOffset: { ...pointerWorld },
          startClient: { x: event.clientX, y: event.clientY },
          lastPosition: room.boundary[nearestCorner.index].start,
          lastSize: { widthCm: 0, depthCm: 0 },
          startPan: { ...panRef.current },
          moved: false,
        }
        event.currentTarget.style.cursor = 'grab'
        event.currentTarget.setPointerCapture(event.pointerId)
        return
      }
    }
    const selectedItem = furniture.find((item) => item.id === selectedId)
    const selectedCorner = selectedItem && !selectedItem.locked
      ? resizeCornerAt(pointerWorld, selectedItem, transformRef.current.scale)
      : undefined
    if (selectedItem && selectedCorner) {
      selectFurniture(selectedItem.id)
      dragRef.current = {
        kind: 'resize',
        id: selectedItem.id,
        pointerOffset: { x: 0, y: 0 },
        startClient: { x: event.clientX, y: event.clientY },
        lastPosition: selectedItem.position,
        lastSize: { widthCm: selectedItem.widthCm, depthCm: selectedItem.depthCm },
        resizeCursor: resizeCursor(selectedCorner, selectedItem.rotationDeg),
        startPan: { ...panRef.current },
        moved: false,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    const openingHit = openingHitAtPoint(pointerWorld, room, openings, 12 / transformRef.current.scale)
    if (openingHit) {
      const geometry = openingGeometry(room, openingHit)
      if (!geometry) return
      const along = (pointerWorld.x - geometry.wall.start.x) * geometry.direction.x +
        (pointerWorld.y - geometry.wall.start.y) * geometry.direction.y
      const grabOffset = Math.max(0, Math.min(openingHit.widthCm, along - openingHit.offsetFromStartCm))
      select({ kind: 'opening', id: openingHit.id })
      dragRef.current = {
        kind: 'opening',
        id: openingHit.id,
        pointerOffset: { x: grabOffset, y: 0 },
        startClient: { x: event.clientX, y: event.clientY },
        lastPosition: { x: openingHit.offsetFromStartCm, y: 0 },
        lastSize: { widthCm: 0, depthCm: 0 },
        openingWallSegmentId: openingHit.wallSegmentId,
        startPan: { ...panRef.current },
        moved: false,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    const hit = [...furniture].reverse().find((item) => pointInFurniture(pointerWorld, item))
    const zoneHit = [...zones].reverse().find((zone) => pointInPolygonInclusive(pointerWorld, zone.boundary))
    if (hit) selectFurniture(hit.id)
    else if (zoneHit) select({ kind: 'zone', id: zoneHit.id })
    else select(null)
    if (zoneHit) {
      dragRef.current = {
        kind: 'zone',
        id: zoneHit.id,
        pointerOffset: { ...pointerWorld },
        startClient: { x: event.clientX, y: event.clientY },
        lastPosition: { x: 0, y: 0 },
        lastSize: { widthCm: 0, depthCm: 0 },
        startPan: { ...panRef.current },
        moved: false,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if (hit && !hit.locked) {
      const resizeCorner = hit.id === selectedId
        ? resizeCornerAt(pointerWorld, hit, transformRef.current.scale)
        : undefined
      dragRef.current = {
        kind: resizeCorner ? 'resize' : 'move',
        id: hit.id,
        pointerOffset: { x: pointerWorld.x - hit.position.x, y: pointerWorld.y - hit.position.y },
        startClient: { x: event.clientX, y: event.clientY },
        lastPosition: hit.position,
        lastSize: { widthCm: hit.widthCm, depthCm: hit.depthCm },
        resizeCursor: resizeCorner && resizeCursor(resizeCorner, hit.rotationDeg),
        startPan: { ...panRef.current },
        moved: false,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }, [drawingActive, drawingPoints, editRoom, furniture, onDrawPoint, openings, room, select, selectFurniture, selectedId, zones])

  const handlePointerMove = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    const cursorWorld = {
      x: (pointer.x - transformRef.current.offsetX) / transformRef.current.scale,
      y: (pointer.y - transformRef.current.offsetY) / transformRef.current.scale,
    }
    setCursorPosition((current) =>
      current && Math.round(current.x) === Math.round(cursorWorld.x) && Math.round(current.y) === Math.round(cursorWorld.y)
        ? current
        : cursorWorld)
    if (drawingActive) {
      if (drawVertexRef.current !== null) {
        const snapStep = event.shiftKey ? 1 : 10
        const point = cursorWorld
        onMoveDrawPoint?.(drawVertexRef.current, {
          x: Math.round(point.x / snapStep) * snapStep,
          y: Math.round(point.y / snapStep) * snapStep,
        })
        canvas.style.cursor = 'grabbing'
        return
      }
      const snapStep = event.shiftKey ? 1 : 10
      const snappedCursor = {
        x: Math.round(cursorWorld.x / snapStep) * snapStep,
        y: Math.round(cursorWorld.y / snapStep) * snapStep,
      }
      setDrawingCursor((current) =>
        current?.x === snappedCursor.x && current.y === snappedCursor.y ? current : snappedCursor)
      const overVertex = drawingPoints.some((point) => {
        const vertex = worldToCanvas(point, transformRef.current)
        return Math.hypot(pointer.x - vertex.x, pointer.y - vertex.y) <= 14
      })
      canvas.style.cursor = overVertex ? 'grab' : 'crosshair'
      return
    }
    if (!drag) {
      const roomCorner = editRoom
        ? room.boundary.find((segment) => Math.hypot(
            pointer.x - worldToCanvas(segment.start, transformRef.current).x,
            pointer.y - worldToCanvas(segment.start, transformRef.current).y,
          ) <= 14)
        : undefined
      if (roomCorner) {
        canvas.style.cursor = 'grab'
        return
      }
    }
    if (!drag) {
      const openingHit = openingHitAtPoint(cursorWorld, room, openings, 12 / transformRef.current.scale)
      if (openingHit) {
        canvas.style.cursor = 'grab'
        return
      }
      const selectedItem = furniture.find((candidate) => candidate.id === selectedId)
      const selectedCorner = selectedItem && !selectedItem.locked
        ? resizeCornerAt(cursorWorld, selectedItem, transformRef.current.scale)
        : undefined
      if (selectedItem && selectedCorner) {
        canvas.style.cursor = resizeCursor(selectedCorner, selectedItem.rotationDeg)
        return
      }
      const item = [...furniture].reverse().find((candidate) => pointInFurniture(cursorWorld, candidate))
      if (item && !item.locked) {
        const corner = item.id === selectedId
          ? resizeCornerAt(cursorWorld, item, transformRef.current.scale)
          : undefined
        canvas.style.cursor = corner ? resizeCursor(corner, item.rotationDeg) : 'grab'
      } else if (item) {
        canvas.style.cursor = 'pointer'
      } else if ([...zones].reverse().some((zone) => pointInPolygonInclusive(cursorWorld, zone.boundary))) {
        canvas.style.cursor = 'grab'
      } else {
        canvas.style.cursor = 'default'
      }
      return
    }
    if (!drag.moved && Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y) < 3) return

    drag.moved = true
    canvas.style.cursor = drag.kind === 'resize' && drag.resizeCursor ? drag.resizeCursor : 'grabbing'
    if (drag.kind === 'zone') {
      const snapStep = event.shiftKey ? 1 : 10
      const delta = {
        x: Math.round((cursorWorld.x - drag.pointerOffset.x) / snapStep) * snapStep,
        y: Math.round((cursorWorld.y - drag.pointerOffset.y) / snapStep) * snapStep,
      }
      drag.lastPosition = delta
      if (scheduledDraw.current !== null) cancelAnimationFrame(scheduledDraw.current)
      scheduledDraw.current = requestAnimationFrame(() => {
        drawRef.current({ position: { x: 0, y: 0 }, zoneId: drag.id ?? undefined, zoneDelta: delta })
        scheduledDraw.current = null
      })
      return
    }
    if (drag.kind === 'corner' && drag.cornerIndex !== undefined) {
      const snapStep = event.shiftKey ? 1 : 10
      const point = {
        x: Math.round(cursorWorld.x / snapStep) * snapStep,
        y: Math.round(cursorWorld.y / snapStep) * snapStep,
      }
      drag.lastPosition = point
      if (scheduledDraw.current !== null) cancelAnimationFrame(scheduledDraw.current)
      scheduledDraw.current = requestAnimationFrame(() => {
        drawRef.current({ position: { x: 0, y: 0 }, cornerIndex: drag.cornerIndex, cornerPoint: point })
        scheduledDraw.current = null
      })
      return
    }
    if (drag.kind === 'pan') {
      panRef.current = {
        x: drag.startPan.x + event.clientX - drag.startClient.x,
        y: drag.startPan.y + event.clientY - drag.startClient.y,
      }
      if (scheduledDraw.current !== null) cancelAnimationFrame(scheduledDraw.current)
      scheduledDraw.current = requestAnimationFrame(() => {
        drawRef.current()
        scheduledDraw.current = null
      })
      return
    }
    const transform = transformRef.current
    if (drag.kind === 'opening' && drag.id) {
      const opening = openings.find((item) => item.id === drag.id)
      if (!opening) return
      const pointerX = (event.clientX - bounds.left - transform.offsetX) / transform.scale
      const pointerY = (event.clientY - bounds.top - transform.offsetY) / transform.scale
      const placement = openingPlacementNearPoint(
        room,
        opening,
        openings.filter((item) => item.id !== opening.id),
        { x: pointerX, y: pointerY },
        drag.pointerOffset.x,
        Math.max(25, 18 / transform.scale),
      )
      if (!placement) return
      const offset = Math.round(placement.offsetFromStartCm * 10) / 10
      drag.lastPosition.x = offset
      drag.openingWallSegmentId = placement.wallSegmentId
      if (scheduledDraw.current !== null) cancelAnimationFrame(scheduledDraw.current)
      scheduledDraw.current = requestAnimationFrame(() => {
        drawRef.current({
          position: { x: 0, y: 0 },
          openingId: opening.id,
          openingWallSegmentId: placement.wallSegmentId,
          openingOffset: offset,
        })
        scheduledDraw.current = null
      })
      return
    }
    const rawX = (event.clientX - bounds.left - transform.offsetX) / transform.scale - drag.pointerOffset.x
    const rawY = (event.clientY - bounds.top - transform.offsetY) / transform.scale - drag.pointerOffset.y
    const item = furniture.find((furnitureItem) => furnitureItem.id === drag.id)
    if (!item) return
    const snapStep = event.shiftKey ? 1 : 10
    if (drag.kind === 'resize') {
      const local = furnitureLocalPoint({
        x: (event.clientX - bounds.left - transform.offsetX) / transform.scale,
        y: (event.clientY - bounds.top - transform.offsetY) / transform.scale,
      }, item)
      drag.lastSize = {
        widthCm: Math.max(20, Math.round(Math.abs(local.x) * 2 / snapStep) * snapStep),
        depthCm: Math.max(20, Math.round(Math.abs(local.y) * 2 / snapStep) * snapStep),
      }
      if (scheduledDraw.current !== null) cancelAnimationFrame(scheduledDraw.current)
      scheduledDraw.current = requestAnimationFrame(() => {
        drawRef.current({ id: item.id, position: item.position, ...drag.lastSize })
        scheduledDraw.current = null
      })
      return
    }
    const target = {
      x: Math.round(rawX / snapStep) * snapStep,
      y: Math.round(rawY / snapStep) * snapStep,
    }
    const nearby = furniture.filter((other) => other.id !== item.id)
    const alignedX = nearby.find((other) => Math.abs(target.x - other.position.x) <= 5)
    const alignedY = nearby.find((other) => Math.abs(target.y - other.position.y) <= 5)
    if (alignedX) target.x = alignedX.position.x
    if (alignedY) target.y = alignedY.position.y
    const position = clampFurniturePositionToRoom(
      { ...item, position: drag.lastPosition },
      room,
      target,
    )
    const guides: { x?: number; y?: number } = {}
    if (alignedX && position.x === target.x) guides.x = alignedX.position.x
    if (alignedY && position.y === target.y) guides.y = alignedY.position.y
    drag.lastPosition = position
    if (scheduledDraw.current !== null) cancelAnimationFrame(scheduledDraw.current)
    scheduledDraw.current = requestAnimationFrame(() => {
      drawRef.current({ id: item.id, position, guides })
      scheduledDraw.current = null
    })
  }, [drawingActive, drawingPoints, editRoom, furniture, onMoveDrawPoint, openings, room, selectedId, zones])

  const handlePointerUp = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (drawVertexRef.current !== null) {
      drawVertexRef.current = null
      event.currentTarget.style.cursor = 'crosshair'
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      return
    }
    const drag = dragRef.current
    if (drag?.moved && drag.kind === 'move' && drag.id) {
      beginHistory()
      moveFurniture(drag.id, drag.lastPosition)
    } else if (drag?.moved && drag.kind === 'zone' && drag.id) {
      beginHistory()
      moveZone(drag.id, drag.lastPosition)
    } else if (drag?.moved && drag.kind === 'corner' && drag.cornerIndex !== undefined) {
      moveCorner(drag.cornerIndex, drag.lastPosition)
    } else if (drag?.moved && drag.kind === 'resize' && drag.id) {
      beginHistory()
      updateFurniture(drag.id, drag.lastSize)
    } else if (drag?.moved && drag.kind === 'opening' && drag.id) {
      beginHistory()
      updateOpening(drag.id, {
        wallSegmentId: drag.openingWallSegmentId,
        offsetFromStartCm: drag.lastPosition.x,
      })
    }
    dragRef.current = null
    event.currentTarget.style.cursor = 'default'
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [beginHistory, moveCorner, moveFurniture, moveZone, updateFurniture, updateOpening])

  const handleWheel = useCallback((event: WheelEvent<HTMLCanvasElement>) => {
    if (!onZoomChange) return
    event.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    const current = transformRef.current
    const world = {
      x: (point.x - current.offsetX) / current.scale,
      y: (point.y - current.offsetY) / current.scale,
    }
    const nextZoom = Math.max(0.5, Math.min(4, zoom * Math.exp(-event.deltaY * 0.001)))
    const base = baseTransformRef.current
    const nextScale = base.scale * nextZoom
    const baseOffsetX = bounds.width / 2 + (base.offsetX - bounds.width / 2) * nextZoom
    const baseOffsetY = bounds.height / 2 + (base.offsetY - bounds.height / 2) * nextZoom
    panRef.current = {
      x: point.x - world.x * nextScale - baseOffsetX,
      y: point.y - world.y * nextScale - baseOffsetY,
    }
    onZoomChange(nextZoom)
  }, [onZoomChange, zoom])

  const drawingSegmentLengths = drawingPoints.slice(1).map((point, index) =>
    formatLength(Math.hypot(
      point.x - drawingPoints[index].x,
      point.y - drawingPoints[index].y,
    ), unit))
  if (drawingActive && drawingPoints.length >= 3) {
    const lastPoint = drawingPoints[drawingPoints.length - 1]
    const firstPoint = drawingPoints[0]
    drawingSegmentLengths.push(formatLength(Math.hypot(firstPoint.x - lastPoint.x, firstPoint.y - lastPoint.y), unit))
  }
  const liveSegmentLength = drawingActive && drawingPoints.length > 0 && drawingCursor
    ? formatLength(Math.hypot(
      drawingCursor.x - drawingPoints[drawingPoints.length - 1].x,
      drawingCursor.y - drawingPoints[drawingPoints.length - 1].y,
    ), unit)
    : null

  return (
    <div className="canvas-stage">
      <canvas
        ref={canvasRef}
        className={drawingActive ? 'room-canvas is-drawing' : 'room-canvas'}
        role="img"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={(event) => {
          if (!dragRef.current && drawVertexRef.current === null) {
            event.currentTarget.style.cursor = drawingActive ? 'crosshair' : 'default'
            setCursorPosition(null)
            setDrawingCursor(null)
            drawRef.current()
          }
        }}
        onWheel={handleWheel}
        onKeyDown={(event) => {
          if (event.code === 'Space') {
            event.preventDefault()
            spaceDownRef.current = true
          }
        }}
        onKeyUp={(event) => {
          if (event.code === 'Space') spaceDownRef.current = false
        }}
        onBlur={() => { spaceDownRef.current = false }}
        aria-label={drawingActive
          ? `Room outline drawing. Segment lengths: ${drawingSegmentLengths.join(', ') || 'none'}${liveSegmentLength ? `; live segment: ${liveSegmentLength}` : ''}.`
          : 'Room plan with furniture, openings, and zones. Select an item to inspect it.'}
      />
      <div className="canvas-coordinates" aria-live="polite">
        {cursorPosition
          ? `X ${formatLength(cursorPosition.x, unit)} · Y ${formatLength(cursorPosition.y, unit)}`
          : 'Cursor position'}
      </div>
    </div>
  )
}
