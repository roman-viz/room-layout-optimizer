import { useSyncExternalStore } from 'react'

export type SaveState = 'saved' | 'error'

interface SaveStatus {
  state: SaveState
  at: number
}

let status: SaveStatus = { state: 'saved', at: Date.now() }
const listeners = new Set<() => void>()

export function reportSave(state: SaveState): void {
  status = { state, at: Date.now() }
  listeners.forEach((listener) => listener())
}

export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => status,
  )
}
