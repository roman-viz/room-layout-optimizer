import type { FurnitureCategory, FurnitureItem } from './models'

export interface LibraryDefinition {
  name: string
  type: string
  category: FurnitureCategory
  widthCm: number
  depthCm: number
  heightCm: number
  color: string
  clearanceCm: number
}

export const furnitureLibrary: LibraryDefinition[] = [
  { name: 'Single bed', type: 'single-bed', category: 'bed', widthCm: 90, depthCm: 200, heightCm: 50, color: '#b9c9bb', clearanceCm: 60 },
  { name: 'Queen bed', type: 'double-bed', category: 'bed', widthCm: 160, depthCm: 210, heightCm: 55, color: '#b9c9bb', clearanceCm: 60 },
  { name: 'Nightstand', type: 'nightstand', category: 'storage', widthCm: 45, depthCm: 40, heightCm: 50, color: '#d4c5ad', clearanceCm: 30 },
  { name: 'Sofa', type: 'sofa', category: 'seating', widthCm: 200, depthCm: 90, heightCm: 82, color: '#b9c9bb', clearanceCm: 60 },
  { name: 'Armchair', type: 'armchair', category: 'seating', widthCm: 85, depthCm: 85, heightCm: 82, color: '#c3bfd2', clearanceCm: 50 },
  { name: 'Chair', type: 'dining-chair', category: 'chair', widthCm: 48, depthCm: 48, heightCm: 85, color: '#d6bea6', clearanceCm: 0 },
  { name: 'Desk', type: 'writing-desk', category: 'table', widthCm: 120, depthCm: 60, heightCm: 74, color: '#dec8a9', clearanceCm: 70 },
  { name: 'Dining table', type: 'dining-table', category: 'table', widthCm: 160, depthCm: 90, heightCm: 75, color: '#dec8a9', clearanceCm: 70 },
  { name: 'Coffee table', type: 'coffee-table', category: 'table', widthCm: 100, depthCm: 55, heightCm: 42, color: '#e0cdb0', clearanceCm: 30 },
  { name: 'Wardrobe', type: 'wardrobe', category: 'storage', widthCm: 120, depthCm: 60, heightCm: 210, color: '#d4c5ad', clearanceCm: 60 },
  { name: 'Dresser', type: 'dresser', category: 'storage', widthCm: 100, depthCm: 45, heightCm: 85, color: '#d4c5ad', clearanceCm: 60 },
  { name: 'Bookshelf', type: 'bookshelf', category: 'shelf', widthCm: 80, depthCm: 30, heightCm: 180, color: '#cdbb9d', clearanceCm: 50 },
  { name: 'TV stand', type: 'tv-stand', category: 'media', widthCm: 140, depthCm: 40, heightCm: 50, color: '#c9ccd2', clearanceCm: 0 },
  { name: 'Kitchen unit', type: 'kitchen-unit', category: 'kitchen', widthCm: 120, depthCm: 60, heightCm: 90, color: '#cfd5d8', clearanceCm: 80 },
  { name: 'Storage box', type: 'generic', category: 'generic', widthCm: 80, depthCm: 80, heightCm: 60, color: '#d1d0c6', clearanceCm: 30 },
]

export type LibraryItemName = string

export function getLibraryDefinition(name: string): LibraryDefinition {
  return furnitureLibrary.find((item) => item.name === name) ?? furnitureLibrary[0]
}

export const categoryLabels: Record<FurnitureCategory, string> = {
  bed: 'Beds',
  seating: 'Sofas & armchairs',
  table: 'Tables & desks',
  chair: 'Chairs',
  storage: 'Wardrobes & cabinets',
  shelf: 'Shelves',
  media: 'TV stands',
  kitchen: 'Kitchen',
  generic: 'Generic',
}

const defaultClearanceByCategory: Record<FurnitureCategory, number> = {
  bed: 60,
  seating: 55,
  table: 70,
  chair: 0,
  storage: 60,
  shelf: 50,
  media: 0,
  kitchen: 80,
  generic: 30,
}

/** Free floor needed in front of a piece so that it remains usable. */
export function clearanceFor(item: Pick<FurnitureItem, 'category' | 'clearanceCm'>): number {
  return item.clearanceCm ?? defaultClearanceByCategory[item.category]
}
