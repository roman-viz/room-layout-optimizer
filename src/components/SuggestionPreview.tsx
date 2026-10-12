import type { FurnitureItem, Room, WallOpening } from '../domain/models'
import { roomBoundaryToPolygon } from '../domain/geometry'
import { furnitureFootprint, polygonBounds } from '../domain/polygon'
import { openingGeometry } from '../domain/openings'
import type { LayoutSuggestion } from '../optimizer/types'
import { modeLabels } from '../optimizer/scoring'

function pointsPath(points: { x: number; y: number }[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ') + ' Z'
}

export function SuggestionPreview({
  room,
  furniture,
  openings,
  suggestion,
}: {
  room: Room
  furniture: FurnitureItem[]
  openings: WallOpening[]
  suggestion: LayoutSuggestion
}) {
  const polygon = roomBoundaryToPolygon(room)
  const bounds = polygonBounds(polygon)
  const padding = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.055
  const placementMap = new Map(suggestion.placements.map((placement) => [placement.id, placement]))
  const viewBox = `${bounds.minX - padding} ${bounds.minY - padding} ${bounds.maxX - bounds.minX + padding * 2} ${bounds.maxY - bounds.minY + padding * 2}`
  return (
    <div className="suggestion-preview">
      <svg className="suggestion-preview-svg" viewBox={viewBox} role="img" aria-label={`Preview of ${modeLabels[suggestion.mode].name} layout`}>
        <path className="suggestion-preview-room" d={pointsPath(polygon)} />
        {openings.map((opening) => {
          const geometry = openingGeometry(room, opening)
          if (!geometry) return null
          return (
            <line
              key={opening.id}
              className={`suggestion-preview-opening is-${opening.type}`}
              x1={geometry.start.x}
              y1={geometry.start.y}
              x2={geometry.end.x}
              y2={geometry.end.y}
            />
          )
        })}
        {furniture.map((item) => {
          const placement = placementMap.get(item.id)
          const position = placement?.position ?? item.position
          const rotationDeg = placement?.rotationDeg ?? item.rotationDeg
          const footprint = furnitureFootprint({ ...item, position, rotationDeg })
          return <path className="suggestion-preview-furniture" key={item.id} d={pointsPath(footprint)} fill={item.color ?? '#aab5aa'} />
        })}
      </svg>
    </div>
  )
}
