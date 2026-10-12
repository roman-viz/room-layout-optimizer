import { Armchair, BedDouble, DoorOpen, Sofa, Table2 } from 'lucide-react'
import type { FurnitureCategory } from '../domain/models'
import { FurnitureKind } from '../domain/enums'
import type { LibraryItemName } from '../store/editor-store'

const furnitureOptions: { name: LibraryItemName; category: FurnitureCategory; icon: typeof Armchair }[] = [
  { name: 'Armchair', category: FurnitureKind.Seating, icon: Armchair },
  { name: 'Sofa', category: FurnitureKind.Seating, icon: Sofa },
  { name: 'Queen bed', category: FurnitureKind.Bed, icon: BedDouble },
  { name: 'Desk', category: FurnitureKind.Table, icon: Table2 },
  { name: 'Chair', category: FurnitureKind.Chair, icon: Armchair },
  { name: 'Wardrobe', category: FurnitureKind.Storage, icon: DoorOpen },
]

export function FurnitureLibraryMenu({
  position,
  onAdd,
}: {
  position: { left: number; top: number; maxHeight: number }
  onAdd: (name: LibraryItemName) => void
}) {
  return (
    <div className="library-menu" role="menu" aria-label="Furniture library" style={position}>
      <p className="section-label">ADD FURNITURE</p>
      {furnitureOptions.map(({ name, category, icon: Icon }) => (
        <button key={name} role="menuitem" onClick={() => onAdd(name)}>
          <Icon size={16} /><span>{name}</span><small>{category}</small>
        </button>
      ))}
    </div>
  )
}
