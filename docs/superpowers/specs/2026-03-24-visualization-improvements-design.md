# Visualization Improvements Design

**Date:** 2026-03-24
**Status:** Approved

## Overview

Four targeted improvements to the 3D embedding space visualization (`packages/web/src/components/agent-view/`), coordinated through a new centralized interaction store.

## Problem

1. Per-file labels (`PointLabels.tsx`) clutter the 3D space — only taxonomy/cluster labels are useful
2. No way to preview media (play video, listen to audio) — hover card is too small and static
3. No visibility into pots (collections) — can't see which files belong to which pot in the 3D space
4. Auto-rotation constantly pulls the camera back, preventing deep exploration of the embedding space

## Approach

**Approach B: Centralized interaction store** — a thin zustand store that holds all cross-cutting interaction state (pot selection, file click/hover, idle tracking). Components read/write through this single source of truth instead of managing isolated state. This avoids prop drilling and keeps interactions coordinated as the visualization grows.

## Architecture

### Interaction Store (`useVisualizationStore.ts`)

New zustand store in `packages/web/src/components/agent-view/`.

**State:**
- `selectedPotId: string | null` — which pot is highlighted
- `clickedFileId: string | null` — which file's preview is expanded
- `hoveredFileId: string | null` — for the compact hover card
- `lastInteractionTime: number` — timestamp of last user interaction
- `isAutoRotating: boolean` — derived: true when idle > 30s
- `pots: PotRecord[]` — cached list of pots from API
- `potFileIds: Set<string>` — derived: file IDs in the selected pot

**Actions:**
- `selectPot(id: string | null)` — toggle pot highlight, fetches pot files if needed
- `clickFile(id: string | null)` — expand/collapse preview
- `hoverFile(id: string | null)` — set hover target
- `recordInteraction()` — update lastInteractionTime to Date.now()
- `fetchPots()` — load pots from `GET /api/pots/`
- `createPot(name: string)` — `POST /api/pots/`
- `renamePot(id: string, name: string)` — `PATCH /api/pots/:id` (new endpoint, needs backend work)
- `deletePot(id: string)` — `DELETE /api/pots/:id` (new endpoint, needs backend work)
- `assignFileToPot(fileId: string, potSlug: string)` — adds `pot:<slug>` tag via `PATCH /api/files/:id` with updated tags array

### Component Changes

#### 1. Remove Per-File Labels

**Action:** Delete `PointLabels.tsx` and remove its usage from `EmbeddingSpace.tsx`.

`ClusterLabels.tsx` (taxonomy labels) stays unchanged.

#### 2. Expandable Preview (`ExpandablePreview.tsx`)

Replaces `HoverCard.tsx`. Two states:

**Hover state** (compact, top-right, ~240px wide):
- File name, thumbnail, modality badge, tags
- Appears when `hoveredFileId` is set and `clickedFileId` is null

**Expanded state** (top-right, ~320px wide):
- Triggered on point click (`clickedFileId` set)
- Full media preview area:
  - **Image:** `<img>` with `object-fit: contain`
  - **Video:** `<video>` with controls, autoplay muted
  - **Audio:** `<audio>` with controls
  - **PDF:** First page rendered via pdfjs (already a dependency)
  - **Text:** First ~20 lines in monospace
- Metadata grid: type, size, dimensions/duration, date added
- Tags display
- Pot assignment: shows current pot(s), `+ assign` button to add file to a pot. Mechanism: adds a `pot:<slug>` tag to the file via `PATCH /api/files/:id` with updated tags array. Remove assignment by removing the tag.
- Close via `×` button or clicking outside (canvas click with no point hit)

**Interaction rules:**
- Click a point → expand preview for that file
- Click another point while expanded → swap to new file
- Click outside / `×` → collapse, clear `clickedFileId`
- Hover while expanded → hover card suppressed, expanded card stays

#### 3. Pots Sidebar (`PotsSidebar.tsx`)

New component. Overlays the left edge of the canvas (does not shrink canvas).

**Layout:**
- Position: absolute, left: 0, top: 0, bottom: 0, width: ~220px
- Semi-transparent background with backdrop blur (`rgba(14, 26, 36, 0.92)`)
- Collapsible to a thin icon strip (~40px)
- Initial state: expanded (visible on load)

**Content:**
- Header: "POTS" label + `+` create button
- Pot list: each item shows name + file count
- Selected pot: highlighted border (accent color), "files highlighted" subtitle
- Collapse/expand toggle at bottom

**Management actions:**
- **Click pot:** Toggle `selectedPotId` — highlights pot's files in 3D space (dims others)
- **+ button:** Inline name input → `POST /api/pots/` to create
- **Right-click pot:** Context menu with Rename and Delete options
- **Pot assignment from preview:** The expanded preview card has `+ assign` to add a file to a pot

**API integration:**
- `GET /api/pots/` — list all pots on mount
- `POST /api/pots/` — create new pot
- `GET /api/pots/:pot/files` — fetch file IDs when pot is selected (for highlighting)
- `PATCH /api/pots/:id` — rename pot (new endpoint, must be added to `packages/server/src/routes/pots.ts` and `packages/core/src/pots.ts`)
- `DELETE /api/pots/:id` — delete pot (new endpoint, must be added; must also remove `pot:<slug>` tags from all member files)
- `PATCH /api/files/:id` — assign/unassign file to pot by updating tags array (endpoint already exists)

#### 4. Camera Auto-Rotation (`MapCameraRig.tsx`)

**Current behavior:** Continuously lerps camera to orbit path. Resumes almost immediately after interaction.

**New behavior:**
- Every mouse/touch/scroll/keyboard event on the canvas calls `recordInteraction()`
- Sidebar interactions (clicking pots, CRUD actions) also call `recordInteraction()`
- `MapCameraRig` reads `isAutoRotating` from store:
  - `false` (interacted within 30s): free camera, no orbit influence. OrbitControls fully in charge.
  - `true` (idle > 30s): begin auto-rotation, but with a gentle ramp-up over ~3 seconds (lerp factor starts near 0 and increases) so it doesn't snap the camera
- The 30s timeout resets on any interaction

#### 5. Point Dimming (`PointCloud.tsx`)

**When a pot is selected** (`selectedPotId !== null`):
- Points in the pot (`potFileIds.has(point.id)`): full opacity, normal color
- Points not in the pot: opacity drops to ~0.15, color shifts toward background/fog

**When no pot is selected:** All points at full brightness (current behavior).

**Implementation:** Add a per-instance opacity attribute buffer to the instanced mesh. In a `useFrame` loop, set opacity values based on pot membership. Use a custom shader material (or modify the existing `meshStandardMaterial` via `onBeforeCompile`) to read the per-instance opacity attribute. Note: current `PointCloud.tsx` sets instance data in `useEffect`, not `useFrame` — the dimming logic will need a `useFrame` hook to react to store changes.

## Files Summary

| File | Action |
|---|---|
| `useVisualizationStore.ts` | **NEW** — zustand interaction store |
| `PotsSidebar.tsx` | **NEW** — left sidebar with pot management |
| `ExpandablePreview.tsx` | **NEW** — replaces HoverCard.tsx |
| `PointLabels.tsx` | **DELETE** — per-file labels removed |
| `HoverCard.tsx` | **DELETE** — replaced by ExpandablePreview |
| `EmbeddingSpace.tsx` | **MODIFY** — swap components, add sidebar to layout |
| `PointCloud.tsx` | **MODIFY** — add pot-based dimming logic |
| `MapCameraRig.tsx` | **MODIFY** — 30s idle timeout, gentle ramp-up |
| `FilePreviewLayer.tsx` | **MODIFY** — wire click to store instead of local state |
| `packages/server/src/routes/pots.ts` | **MODIFY** — add PATCH and DELETE routes |
| `packages/core/src/pots.ts` | **MODIFY** — add `renamePot()` and `deletePot()` functions |

## Dependencies

- `zustand` — must be added to `packages/web` (not currently a dependency)
- Existing: `@react-three/fiber`, `@react-three/drei`, `three`, `pdfjs-dist`

## Out of Scope

- Drag-and-drop file assignment to pots (future follow-up)
- Multi-pot selection / color-coding per pot
- Animated opacity transitions for dimming
- Search/filter within the sidebar
