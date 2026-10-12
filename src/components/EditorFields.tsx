import { useEffect, useRef, useState } from 'react'
import type { LengthUnit } from '../domain/enums'

export function NumberField({
  label,
  valueCm,
  unit,
  minCm = 1,
  disabled = false,
  onCommit,
}: {
  label: string
  valueCm: number
  unit: LengthUnit
  minCm?: number
  disabled?: boolean
  onCommit: (valueCm: number) => void
}) {
  const [draft, setDraft] = useState(() => unit === 'cm' ? String(valueCm) : (valueCm / 100).toFixed(2))
  const inputRef = useRef<HTMLInputElement>(null)
  const draftRef = useRef(draft)
  const committedRef = useRef(valueCm)
  const unitRef = useRef(unit)
  const minRef = useRef(minCm)
  const onCommitRef = useRef(onCommit)

  const commit = () => {
    const raw = draftRef.current.trim()
    const value = Number(raw)
    const converted = unitRef.current === 'cm' ? value : value * 100
    if (raw && Number.isFinite(converted) && converted >= minRef.current) {
      draftRef.current = unitRef.current === 'cm' ? String(converted) : (converted / 100).toFixed(2)
      setDraft(draftRef.current)
      if (converted !== committedRef.current) {
        committedRef.current = converted
        onCommitRef.current(converted)
      }
    } else {
      draftRef.current = unitRef.current === 'cm' ? String(committedRef.current) : (committedRef.current / 100).toFixed(2)
      setDraft(draftRef.current)
    }
  }
  const commitRef = useRef(commit)

  useEffect(() => {
    onCommitRef.current = onCommit
    unitRef.current = unit
    minRef.current = minCm
  }, [minCm, onCommit, unit])
  useEffect(() => {
    committedRef.current = valueCm
    if (document.activeElement !== inputRef.current) {
      draftRef.current = unit === 'cm' ? String(valueCm) : (valueCm / 100).toFixed(2)
      setDraft(draftRef.current)
    }
  }, [unit, valueCm])
  useEffect(() => {
    const commitBeforePointerAction = (event: PointerEvent) => {
      if (document.activeElement === inputRef.current && event.target !== inputRef.current) {
        if (inputRef.current) draftRef.current = inputRef.current.value
        commitRef.current()
      }
    }
    document.addEventListener('pointerdown', commitBeforePointerAction, true)
    return () => document.removeEventListener('pointerdown', commitBeforePointerAction, true)
  }, [])
  useEffect(() => () => commitRef.current(), [])

  return (
    <label className="editable-number">
      <span>{label}</span>
      <span className="editable-number-input">
        <input
          ref={inputRef}
          type="number"
          disabled={disabled}
          min={unit === 'cm' ? minCm : minCm / 100}
          step={unit === 'cm' ? 1 : 0.1}
          value={draft}
          aria-label={`${label} in ${unit}`}
          onChange={(event) => {
            draftRef.current = event.target.value
            setDraft(event.target.value)
          }}
          onBlur={(event) => {
            draftRef.current = event.currentTarget.value
            commitRef.current()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <small>{unit}</small>
      </span>
    </label>
  )
}

export function DoorAngleField({ value, max, onCommit }: { value: number; max: number; onCommit: (angle: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)
  const draftRef = useRef(String(value))
  const committedRef = useRef(value)
  const maxRef = useRef(max)
  const onCommitRef = useRef(onCommit)
  const commit = () => {
    const raw = draftRef.current.trim()
    const angle = Number(raw)
    if (raw && Number.isFinite(angle)) {
      const committed = Math.max(0, Math.min(maxRef.current, angle))
      draftRef.current = String(committed)
      setDraft(draftRef.current)
      if (committed !== committedRef.current) {
        committedRef.current = committed
        onCommitRef.current(committed)
      }
    } else {
      draftRef.current = String(committedRef.current)
      setDraft(draftRef.current)
    }
  }
  const commitRef = useRef(commit)
  useEffect(() => {
    maxRef.current = max
    onCommitRef.current = onCommit
  }, [max, onCommit])
  useEffect(() => {
    committedRef.current = value
    if (document.activeElement !== inputRef.current) {
      draftRef.current = String(value)
      setDraft(draftRef.current)
    }
  }, [value])
  useEffect(() => {
    const commitBeforePointerAction = (event: PointerEvent) => {
      if (document.activeElement === inputRef.current && event.target !== inputRef.current) {
        if (inputRef.current) draftRef.current = inputRef.current.value
        commitRef.current()
      }
    }
    document.addEventListener('pointerdown', commitBeforePointerAction, true)
    return () => document.removeEventListener('pointerdown', commitBeforePointerAction, true)
  }, [])
  useEffect(() => () => commitRef.current(), [])

  return (
    <label className="editable-number">
      <span>Opening angle</span>
      <span className="editable-number-input door-angle-input">
        <input
          ref={inputRef}
          type="number"
          className="door-angle-value"
          min={0}
          max={max}
          step={1}
          value={draft}
          aria-label="Door opening angle in degrees"
          onChange={(event) => {
            draftRef.current = event.target.value
            setDraft(event.target.value)
          }}
          onBlur={(event) => {
            draftRef.current = event.currentTarget.value
            commitRef.current()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <small>°</small>
      </span>
    </label>
  )
}

export function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const draftRef = useRef(value)
  const committedRef = useRef(value)
  const onCommitRef = useRef(onCommit)
  const commit = () => {
    const trimmed = draftRef.current.trim()
    if (!trimmed) {
      draftRef.current = committedRef.current
      setDraft(committedRef.current)
      return
    }
    draftRef.current = trimmed
    if (trimmed !== committedRef.current) {
      committedRef.current = trimmed
      onCommitRef.current(trimmed)
    }
  }
  const commitRef = useRef(commit)
  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])
  useEffect(() => {
    committedRef.current = value
    if (document.activeElement !== inputRef.current) {
      draftRef.current = value
      setDraft(value)
    }
  }, [value])
  useEffect(() => {
    const commitBeforePointerAction = (event: PointerEvent) => {
      if (document.activeElement === inputRef.current && event.target !== inputRef.current) {
        if (inputRef.current) draftRef.current = inputRef.current.value
        commitRef.current()
      }
    }
    document.addEventListener('pointerdown', commitBeforePointerAction, true)
    return () => document.removeEventListener('pointerdown', commitBeforePointerAction, true)
  }, [])
  useEffect(() => () => commitRef.current(), [])

  return (
    <label className="editable-text">
      <span>{label}</span>
      <input
        ref={inputRef}
        value={draft}
        aria-label={label}
        onChange={(event) => {
          draftRef.current = event.target.value
          setDraft(event.target.value)
        }}
        onBlur={(event) => {
          draftRef.current = event.currentTarget.value
          commitRef.current()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}

export function AngleField({ value, disabled, onCommit }: { value: number; disabled: boolean; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)
  const draftRef = useRef(String(value))
  const committedRef = useRef(value)
  const onCommitRef = useRef(onCommit)
  const commit = () => {
    const raw = draftRef.current.trim()
    const angle = Number(raw)
    if (raw && Number.isFinite(angle)) {
      const committed = ((angle % 360) + 360) % 360
      draftRef.current = String(committed)
      setDraft(draftRef.current)
      if (committed !== committedRef.current) {
        committedRef.current = committed
        onCommitRef.current(committed)
      }
    } else {
      draftRef.current = String(committedRef.current)
      setDraft(draftRef.current)
    }
  }
  const commitRef = useRef(commit)
  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])
  useEffect(() => {
    committedRef.current = value
    if (document.activeElement !== inputRef.current) {
      draftRef.current = String(value)
      setDraft(draftRef.current)
    }
  }, [value])
  useEffect(() => {
    const commitBeforePointerAction = (event: PointerEvent) => {
      if (document.activeElement === inputRef.current && event.target !== inputRef.current) {
        if (inputRef.current) draftRef.current = inputRef.current.value
        commitRef.current()
      }
    }
    document.addEventListener('pointerdown', commitBeforePointerAction, true)
    return () => document.removeEventListener('pointerdown', commitBeforePointerAction, true)
  }, [])
  useEffect(() => () => commitRef.current(), [])

  return (
    <label className="editable-number">
      <span>Rotation</span>
      <span className="editable-number-input">
        <input
          ref={inputRef}
          type="number"
          disabled={disabled}
          value={draft}
          aria-label="Rotation in degrees"
          onChange={(event) => {
            draftRef.current = event.target.value
            setDraft(event.target.value)
          }}
          onBlur={(event) => {
            draftRef.current = event.currentTarget.value
            commitRef.current()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <small>°</small>
      </span>
    </label>
  )
}
