# Roomize — Room layout optimizer

Roomize is a local-first room planner for creating room outlines, arranging furniture, and comparing automatically generated layouts. It is built with React, TypeScript, Vite, Zustand, and Canvas 2D.

## Features

- Create and switch between rooms. Start with a rectangular, L-shaped, angled, rounded, or semicircular room, or draw a custom outline and edit its corners later.
- New rooms include a default door. Add and position doors and windows along room walls; configure door hinge, swing direction, and opening angle.
- Add furniture from the library, then move, resize, rotate, duplicate, lock, rename, or remove items.
- Add and move restriction zones. Roomize highlights invalid furniture placements and reports collision, wall, and clearance issues.
- Zoom and pan around the canvas, fit the room to view, and use alignment guides while arranging furniture.
- Compare up to three distinct suggestions for each available optimization goal: balanced, natural, and maximum free space. Review the previews and apply a layout; object names are shown once in a shared legend.
- Import and export validated Roomize JSON projects, export the room plan as PNG, and print the plan.
- Undo and redo supported edits. Room data and theme/unit preferences are saved locally in the browser.
- Use the editor on desktop or mobile, with responsive controls for room and furniture editing.

## Controls

- Drag furniture, doors, windows, and restriction zones on the canvas to move them.
- Use the mouse wheel to zoom. Hold Space and drag to pan.
- Press `R` to rotate the selected unlocked furniture item.
- Use `Ctrl/Cmd + Z` to undo and `Ctrl/Cmd + D` to duplicate the selected furniture item.
- Choose centimeters or meters for displayed measurements. Room and furniture dimensions are stored in centimeters.

## Project structure

```text
src/
  components/    React UI, editor panels, optimizer dialog, and Canvas renderer
  domain/        Room, furniture, opening, zone, geometry, and validation logic
  optimizer/     Layout scoring, suggestion generation, and Web Worker
  persistence/   Project JSON serialization and validation
  services/      Project file import and export
  store/         Zustand editor state, undo/redo history, and local persistence
  theme/         Theme preference and DOM theme application
  utils/         Shared editor utilities
e2e/             Playwright browser workflows
```

The optimizer checks room boundaries, furniture collisions, door clearance, hard restriction zones, furniture locks, and layout scoring goals.

## Development

Install dependencies and start the Vite development server:

```sh
npm install
npm run dev
```

Run checks:

```sh
npm test
npm run test:e2e
npm run lint
npm run build
```
