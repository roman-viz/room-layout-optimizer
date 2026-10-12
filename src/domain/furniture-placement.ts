import type { FurnitureItem, Point, Room } from './models'
import { roomBoundaryToPolygon } from './geometry'
import { furnitureFootprint, polygonContainedIn } from './polygon'

const MAX_PATH_SAMPLES = 512
const MAX_SAMPLE_DISTANCE_CM = 5
const BINARY_SEARCH_ITERATIONS = 24

function interpolate(start: Point, end: Point, amount: number): Point {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  }
}

function roundPosition(position: Point): Point {
  return {
    x: Math.round(position.x * 10) / 10,
    y: Math.round(position.y * 10) / 10,
  }
}

export function clampFurniturePositionToRoom(
  item: FurnitureItem,
  room: Room,
  target: Point,
): Point {
  const start = item.position
  const distance = Math.hypot(target.x - start.x, target.y - start.y)
  if (distance === 0) return start

  const roomPolygon = roomBoundaryToPolygon(room)
  const isValidAt = (amount: number) => {
    const position = interpolate(start, target, amount)
    return polygonContainedIn(furnitureFootprint({ ...item, position }), roomPolygon)
  }
  const roundedPositionAt = (amount: number) => roundPosition(interpolate(start, target, amount))
  const isRoundedValidAt = (amount: number) =>
    polygonContainedIn(furnitureFootprint({ ...item, position: roundedPositionAt(amount) }), roomPolygon)
  const lastRoundedValidPosition = (maxAmount: number): Point => {
    if (isRoundedValidAt(maxAmount)) return roundedPositionAt(maxAmount)
    if (!isRoundedValidAt(0)) return start

    let low = 0
    let high = maxAmount
    let lastValid = roundedPositionAt(0)
    for (let iteration = 0; iteration < BINARY_SEARCH_ITERATIONS; iteration += 1) {
      const middle = (low + high) / 2
      if (isRoundedValidAt(middle)) {
        low = middle
        lastValid = roundedPositionAt(middle)
      } else {
        high = middle
      }
    }
    return lastValid
  }
  const sampleCount = Math.min(MAX_PATH_SAMPLES, Math.max(1, Math.ceil(distance / MAX_SAMPLE_DISTANCE_CM)))
  const startsInside = isValidAt(0)
  let lastValid = 0
  let previous = 0

  for (let index = 1; index <= sampleCount; index += 1) {
    const amount = index / sampleCount
    const valid = isValidAt(amount)

    if (startsInside && !valid) {
      let low = lastValid
      let high = amount
      for (let iteration = 0; iteration < BINARY_SEARCH_ITERATIONS; iteration += 1) {
        const middle = (low + high) / 2
        if (isValidAt(middle)) low = middle
        else high = middle
      }
      return lastRoundedValidPosition(low)
    }

    if (!startsInside && valid) {
      let low = previous
      let high = amount
      for (let iteration = 0; iteration < BINARY_SEARCH_ITERATIONS; iteration += 1) {
        const middle = (low + high) / 2
        if (isValidAt(middle)) high = middle
        else low = middle
      }
      return isRoundedValidAt(high) ? roundedPositionAt(high) : interpolate(start, target, high)
    }

    if (valid) lastValid = amount
    previous = amount
  }

  return startsInside ? lastRoundedValidPosition(1) : start
}
