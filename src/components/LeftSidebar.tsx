import type { MouseEvent } from 'react'
import {
  Plus,
} from 'lucide-react'
import type { FurnitureItem, Room, WallOpening } from '../domain/models'
import type { LengthUnit } from '../domain/enums'
import { SelectControl } from './SelectControl'
import type { Selection } from '../store/editor-store'
import { formatLength, getOpeningName } from '../utils/editor-utils'

export function LeftSidebar({
  room,
  rooms,
  furniture,
  openings,
  selection,
  unit,
  libraryOpen,
  shortcutsOpen,
  onCreateRoom,
  onChooseRoom,
  onToggleLibrary,
  onAddOpening,
  onSelectFurniture,
  onSelect,
  onToggleShortcuts,
}: {
  room: Room
  rooms: { id: string; name: string }[]
  furniture: FurnitureItem[]
  openings: WallOpening[]
  selection: Selection | null
  unit: LengthUnit
  libraryOpen: boolean
  shortcutsOpen: boolean
  onCreateRoom: () => void
  onChooseRoom: (id: string) => void
  onToggleLibrary: (event: MouseEvent<HTMLButtonElement>) => void
  onAddOpening: (type: WallOpening['type']) => void
  onSelectFurniture: (id: string) => void
  onSelect: (selection: Selection) => void
  onToggleShortcuts: () => void
}) {
  return (
    <aside className="left-panel" aria-label="Rooms and editor tools">
      <div className="panel-heading">
        <div><p className="eyebrow">ROOMS</p><h1>Your rooms</h1></div>
        <button className="small-icon-button" aria-label="Create a new room" title="Create a new room" onClick={onCreateRoom}><Plus size={15} /></button>
      </div>

      <div className="room-chooser">
        <SelectControl
          ariaLabel="Choose room"
          className="room-chooser-select"
          value={room.id}
          options={rooms.map((entry) => ({ value: entry.id, label: entry.name }))}
          onChange={onChooseRoom}
        />
        <button className="room-nav-create" onClick={onCreateRoom}><Plus size={14} /> New room</button>
      </div>

      <div className="sidebar-add-controls">
        <div className="tool-section">
          <p className="section-label">ADD OBJECTS</p>
          <div className="library-control">
            <button className="add-furniture-button add-object-button" aria-expanded={libraryOpen} onClick={onToggleLibrary}>
              <Plus size={16} /> Add furniture
            </button>
          </div>
        </div>
        <div className="room-feature-section sidebar-opening-actions">
          <div className="feature-heading"><p className="section-label">DOORS & WINDOWS</p><span>{openings.length}</span></div>
          <div className="feature-actions">
            <button aria-label="Add door" onClick={() => onAddOpening('door')}><Plus size={16} /> Add door</button>
            <button aria-label="Add window" onClick={() => onAddOpening('window')}><Plus size={16} /> Add window</button>
          </div>
        </div>
      </div>

      <div className="sidebar-dropdowns">
        {furniture.length > 0 && (
          <div className="sidebar-dropdown-section">
            <div className="feature-heading"><p className="section-label">PLACED OBJECTS</p><span>{furniture.length}</span></div>
            <SelectControl
              ariaLabel="Placed objects"
              className="sidebar-item-select"
              value={selection?.kind === 'furniture' ? selection.id : ''}
              placeholder="Choose an object"
              options={furniture.map((item, index) => ({
                value: item.id,
                label: `${item.name} ${index + 1} · ${formatLength(item.widthCm, unit)}`,
              }))}
              onChange={onSelectFurniture}
            />
          </div>
        )}
        {openings.length > 0 && (
          <div className="sidebar-dropdown-section">
            <div className="feature-heading"><p className="section-label">PLACED DOORS & WINDOWS</p><span>{openings.length}</span></div>
            <SelectControl
              ariaLabel="Placed doors and windows"
              className="sidebar-item-select"
              value={selection?.kind === 'opening' ? selection.id : ''}
              placeholder="Choose a door or window"
              options={openings.map((opening) => ({
                value: opening.id,
                label: `${getOpeningName(opening, openings)} · ${formatLength(opening.widthCm, unit)}`,
              }))}
              onChange={(id) => onSelect({ kind: 'opening', id })}
            />
          </div>
        )}
        {furniture.length === 0 && openings.length === 0 && (
          <p className="sidebar-list-empty">Added objects, doors and windows will appear here.</p>
        )}
      </div>

      <div className="left-footer">
        <button className="keyboard-hint" aria-expanded={shortcutsOpen} onClick={onToggleShortcuts}>
          <span className="keycap">?</span> Shortcuts
        </button>
        <span className="version-label">EARLY ACCESS</span>
      </div>
    </aside>
  )
}
