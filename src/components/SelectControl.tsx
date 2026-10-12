import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { createPortal } from 'react-dom'

export interface SelectOption<Value extends string> {
  value: Value
  label: string
}

interface MenuPosition {
  top: number
  left: number
  width: number
  maxHeight: number
}

function getMenuPosition(trigger: HTMLButtonElement, optionCount: number): MenuPosition {
  const bounds = trigger.getBoundingClientRect()
  const menuHeight = Math.min(220, optionCount * 32 + 8)
  const spaceBelow = window.innerHeight - bounds.bottom - 8
  const spaceAbove = bounds.top - 8
  const opensAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow
  const availableHeight = opensAbove ? spaceAbove : spaceBelow
  return {
    top: opensAbove
      ? Math.max(8, bounds.top - Math.min(menuHeight, availableHeight) - 4)
      : bounds.bottom + 4,
    left: Math.max(8, Math.min(bounds.left, window.innerWidth - bounds.width - 8)),
    width: bounds.width,
    maxHeight: Math.max(48, Math.min(menuHeight, availableHeight)),
  }
}

interface SelectControlProps<Value extends string> {
  ariaLabel: string
  className?: string
  onChange: (value: Value) => void
  options: SelectOption<Value>[]
  placeholder?: string
  value: Value
}

export function SelectControl<Value extends string>({
  ariaLabel,
  className = '',
  onChange,
  options,
  placeholder,
  value,
}: SelectControlProps<Value>) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((option) => option.value === value)))
  const selectedIndex = options.findIndex((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const trigger = triggerRef.current
      if (trigger) setMenuPosition(getMenuPosition(trigger, options.length))
    }
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, options.length])

  const showMenu = () => {
    const trigger = triggerRef.current
    if (trigger) setMenuPosition(getMenuPosition(trigger, options.length))
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  const choose = (index: number) => {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        showMenu()
        return
      }
      setActiveIndex((current) => (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      if (!open) showMenu()
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1)
    } else if (event.key === 'Enter' && open) {
      event.preventDefault()
      choose(activeIndex)
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    } else if (event.key === 'Tab' && open) {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className={`select-control ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        className="select-control-trigger"
        onClick={() => {
          if (open) setOpen(false)
          else showMenu()
        }}
        onKeyDown={handleKeyDown}
      >
        <span>{options[selectedIndex]?.label ?? placeholder ?? ''}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        menuPosition && createPortal(
          <div
            ref={menuRef}
            id={`${id}-listbox`}
            role="listbox"
            aria-label={ariaLabel}
            className="select-control-menu"
            style={menuPosition}
          >
            {options.map((option, index) => (
              <button
                key={option.value}
                id={`${id}-option-${index}`}
                type="button"
                tabIndex={-1}
                role="option"
                aria-selected={option.value === value}
                className={`select-control-option${index === activeIndex ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                {option.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      )}
    </div>
  )
}
