import type { Point, WallOpening } from '../domain/models'
import { polygonBounds } from '../domain/polygon'
import { MeasurementUnit, OpeningKind } from '../domain/enums'
import type { LengthUnit } from '../domain/enums'

export type { LengthUnit } from '../domain/enums'

export function formatLength(valueCm: number, unit: LengthUnit): string {
  if (unit === MeasurementUnit.Centimeters) return `${valueCm} ${MeasurementUnit.Centimeters}`
  return `${(valueCm / 100).toFixed(2).replace(/\.?0+$/, '')} ${MeasurementUnit.Meters}`
}

export function getOpeningName(opening: WallOpening, openings: WallOpening[]): string {
  if (opening.name) return opening.name
  const index = openings.filter((entry) => entry.type === opening.type).findIndex((entry) => entry.id === opening.id) + 1
  return `${opening.type === OpeningKind.Door ? 'Door' : 'Window'} ${index}`
}

export function zoneBoundaryWithBounds(
  boundary: Point[],
  changes: Partial<{ x: number; y: number; width: number; depth: number }>,
): Point[] {
  const current = polygonBounds(boundary)
  const width = current.maxX - current.minX
  const depth = current.maxY - current.minY
  if (width <= 0 || depth <= 0) return boundary
  const targetX = changes.x ?? current.minX
  const targetY = changes.y ?? current.minY
  const targetWidth = changes.width ?? width
  const targetDepth = changes.depth ?? depth
  return boundary.map((point) => ({
    x: targetX + (point.x - current.minX) * targetWidth / width,
    y: targetY + (point.y - current.minY) * targetDepth / depth,
  }))
}
