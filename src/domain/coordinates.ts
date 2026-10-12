import type { Point } from './models'

export interface ViewTransform {
  scale: number
  offsetX: number
  offsetY: number
}

export function worldToCanvas(point: Point, transform: ViewTransform): Point {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: point.y * transform.scale + transform.offsetY,
  }
}

export function canvasToWorld(point: Point, transform: ViewTransform): Point {
  return {
    x: (point.x - transform.offsetX) / transform.scale,
    y: (point.y - transform.offsetY) / transform.scale,
  }
}

export function fitBounds(
  widthCm: number,
  depthCm: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = 72,
  reservedBottom = 0,
): ViewTransform {
  const availableHeight = Math.max(1, viewportHeight - reservedBottom)
  const scale = Math.min(
    (viewportWidth - padding * 2) / widthCm,
    (availableHeight - padding * 2) / depthCm,
  )

  return {
    scale,
    offsetX: (viewportWidth - widthCm * scale) / 2,
    offsetY: (availableHeight - depthCm * scale) / 2,
  }
}
