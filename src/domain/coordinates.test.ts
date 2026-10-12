import { describe, expect, it } from 'vitest'
import { fitBounds } from './coordinates'

describe('fitBounds', () => {
  it('keeps the room within the clear canvas area above a reserved overlay', () => {
    const viewportWidth = 1000
    const viewportHeight = 600
    const reservedBottom = 220
    const padding = 74
    const room = { width: 460, depth: 240 }
    const transform = fitBounds(room.width, room.depth, viewportWidth, viewportHeight, padding, reservedBottom)
    const right = transform.offsetX + room.width * transform.scale
    const bottom = transform.offsetY + room.depth * transform.scale

    expect(transform.offsetX).toBeGreaterThanOrEqual(padding)
    expect(right).toBeLessThanOrEqual(viewportWidth - padding)
    expect(transform.offsetY).toBeGreaterThanOrEqual(padding)
    expect(bottom).toBeLessThanOrEqual(viewportHeight - reservedBottom - padding)
  })
})
