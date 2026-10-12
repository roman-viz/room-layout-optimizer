export enum WallSegmentKind {
  Line = 'line',
  Cubic = 'cubic',
}

export enum RoomShapeKind {
  Rectangle = 'rectangle',
  LShape = 'l-shape',
  Angled = 'angled',
  Rounded = 'rounded',
  Semicircle = 'semicircle',
  Polygon = 'polygon',
}

export enum FurnitureKind {
  Bed = 'bed',
  Seating = 'seating',
  Table = 'table',
  Chair = 'chair',
  Storage = 'storage',
  Shelf = 'shelf',
  Media = 'media',
  Kitchen = 'kitchen',
  Generic = 'generic',
}

export enum OpeningKind {
  Door = 'door',
  Window = 'window',
}

export enum DoorHingeSide {
  Left = 'left',
  Right = 'right',
}

export enum OpeningDirection {
  Inward = 'inward',
  Outward = 'outward',
}

export enum RestrictionZoneKind {
  Forbidden = 'forbidden',
  RequiredClearance = 'required-clearance',
  Functional = 'functional',
  WalkingPath = 'walking-path',
}

export enum MeasurementUnit {
  Centimeters = 'cm',
  Meters = 'm',
}

export type LengthUnit = `${MeasurementUnit}`

export enum RoomCreationMethod {
  Preset = 'preset',
  Draw = 'draw',
}

export enum OptimizationGoal {
  Natural = 'natural',
  FreeSpace = 'free-space',
  Balanced = 'balanced',
}
