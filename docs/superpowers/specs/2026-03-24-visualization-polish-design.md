# Visualization Polish Design

**Date:** 2026-03-24
**Status:** Approved
**Supersedes:** Portions of `2026-03-24-visualization-improvements-design.md` (hover card, modal layout, state management)

## Overview

Seven targeted fixes to the 3D embedding space visualization, focused on eliminating the dual hover system, consolidating state management, improving card and modal UX, and adding server-side thumbnail generation.

## Problem

1. **Dual hover UI** — two separate UIs (floating cards near points AND a top-right hover card) fire on the same `hoveredFileId`, creating visual clutter and confusion
2. **State sync bugs** — local `hovered`/`selected` state in `EmbeddingSpace` mirrors the Zustand store but drifts, causing stale glow/selection effects
3. **Hover flickering** — `PreviewCard` hover events fight with Three.js raycaster, causing blinking when mouse moves between card and point
4. **Cluttered floating cards** — 128px cards with full thumbnails are too large; 14 of them crowd the scene
5. **Weak thumbnails** — non-image files show text labels ("VID", "PDF") instead of real previews
6. **Small modal** — 400px wide modal doesn't give enough space for media playback
7. **Z-index chaos** — 5+ z-index layers hardcoded across components with no central registry

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Hover UI model | Floating cards only | Spatial, immersive, no fixed-position panel competing for attention |
| Expanded preview | Centered modal | Focused viewing, good for media playback |
| Card style | Mini cards (88px) | 50% smaller footprint, still visually appealing with real thumbnails |
| Modal layout | 560px media-first | Generous media area, compact metadata strip below |
| File switching in modal | Crossfade transition | Smooth, intentional feel vs. jarring instant swap |
| Card + point hover | Card highlight + 3D glow | Connected feel; fix implementation, don't remove the feature |
| Clickable cards | Both cards and points | Cards are easier click targets than tiny 3D spheres |
| State management | Zustand single source of truth | Eliminates sync bugs between local state and store |
| Sidebar style | Overlay (current) | Preserves canvas space for immersion |
| Thumbnails | Server-side generation | Real previews for all file types |

## Architecture

### 1. State Consolidation

**Remove from `EmbeddingSpace.tsx`:**
- `useState<ProjectionPoint | null>(null)` for `hovered`
- `useState<ProjectionPoint | null>(null)` for `selected`
- The `useEffect` that syncs `clickedFileId === null` → clear local state
- The `useEffect` that syncs `selected` existence with `points`

**All components read directly from Zustand store:**
- `PointCloud` — reads `hoveredFileId` for glow sphere, `clickedFileId` for selection halo
- `FilePreviewLayer` — reads `clickedFileId` to hide when modal is open
- `ExpandablePreview` — reads `clickedFileId` to render modal; no compact hover card
- `EmbeddingSpace` — only manages `focusFileId` → camera target logic (external prop, not user interaction)

**Store changes:**
- `clickFile(id)` and `hoverFile(id)` remain the sole write path
- Add `useClickedPoint(points)` and `useHoveredPoint(points)` hooks (thin wrappers that read the ID from the store and resolve against the `points` array), so consumers don't need to do their own `points.find()`

### 2. Mini Cards (`FilePreviewLayer.tsx`)

**Visual changes:**
- Card width: 128px → 88px
- Thumbnail height: 84px → 52px
- Font sizes scaled proportionally (filename: 10px → 9px, label: 9px → 8px)
- Thumbnail `src`: `point.previewUrl` → `/api/files/${point.id}/thumbnail`

**Sidebar exclusion:**
- On each 8-frame refresh, project each candidate point's 3D position to screen coordinates using `camera.project()`
- Discard points whose projected X falls within 0–240px (sidebar width 220px + 20px margin)
- This prevents cards from rendering behind or partially overlapping the sidebar

**Unchanged:**
- Max 14 previews, refresh every 8 frames
- 150ms leave debounce with local `localHover` state
- `onHover`/`onSelect` callbacks wire to store via `hoverFile()`/`clickFile()`
- 8px invisible padding for forgiving hover area

### 3. Remove Compact Hover Card

**Delete from `ExpandablePreview.tsx`:**
- The entire `if (!isExpanded)` branch (lines 168–230) — the compact hover card at position: absolute, top: 20, right: 20
- The `hoveredFileId` subscription — `ExpandablePreview` no longer needs to read hover state

**After removal, `ExpandablePreview` only:**
- Reads `clickedFileId` from store
- Renders the expanded modal when `clickedFileId !== null`
- Renders nothing otherwise

### 4. Modal Redesign (`ExpandablePreview.tsx`)

**Layout changes:**
- Width: 400px → 560px
- Media preview height: 200px → 280px
- Metadata: keep grid layout but tighten spacing since media area is now bigger

**Crossfade transition:**
- Track `prevFileId` via `useRef`
- When `clickedFileId` changes and both old and new are non-null:
  - Set CSS opacity to 0 on the modal content container
  - After ~100ms, update displayed content to new file
  - Animate opacity back to 1 over ~100ms
- Total transition: ~200ms, CSS `transition: opacity 100ms ease`
- When `clickedFileId` goes from null → value (fresh open), no transition — instant render

**Unchanged:**
- Backdrop blur dismiss (`e.target === e.currentTarget`)
- × close button
- `MediaPreview` component for type-specific rendering
- `PotAssignment` component
- Tags display (filtered to exclude `pot:` tags)

### 5. Thumbnail API

**New endpoint:** `GET /api/files/:id/thumbnail`

**Response:** JPEG image, max 200×200px

**Cache:** Filesystem at `.clawdrive/thumbnails/{fileId}.jpg`
- Check cache first; return cached file if exists
- Generate on miss, write to cache, return

**Generation by content type:**

| Type | Method | Dependency |
|------|--------|------------|
| Image | Resize to 200px wide, preserve aspect | `sharp` (new dependency) |
| Video | Extract frame at 1s mark | `ffmpeg` (system binary, via `child_process`) |
| PDF | Render first page to canvas, export as JPEG | `pdfjs-dist` (already a dependency in web; add to server) |
| Audio | Generate waveform visualization | Canvas API + audio decoding |
| Text | Render first ~15 lines on a dark background | Canvas API with monospace font |

**Fallback:** If generation fails (corrupt file, missing ffmpeg, etc.), return a 200×200 colored placeholder image with the type label centered — same colors as `MODALITY_COLORS` in `theme.ts`.

**Files:**
- `packages/server/src/routes/thumbnails.ts` — new route file
- `packages/core/src/thumbnails.ts` — generation logic
- `packages/server/src/routes/index.ts` — register new route

### 6. Hover Interaction Fix

**Event flow (cleaned up):**

1. **Hover a 3D point:**
   - `instancedMesh.onPointerOver` → `store.hoverFile(point.id)`
   - `PointCloud` reads `hoveredFileId` → renders glow sphere
   - Nearby `MiniCard` does NOT react (it uses `localHover` for its own visual state)

2. **Hover a MiniCard:**
   - `div.onMouseEnter` → `clearTimeout(leaveTimer)`, `setLocalHover(true)`, `store.hoverFile(point.id)`
   - Card border/shadow highlight via `localHover` (local state, no parent re-render)
   - `PointCloud` reads `hoveredFileId` → renders glow sphere on the corresponding point

3. **Leave a MiniCard:**
   - `div.onMouseLeave` → start 150ms timer
   - On timeout: `setLocalHover(false)`, `store.hoverFile(null)`
   - If mouse re-enters before timeout, timer is cleared — no flicker

4. **Leave a 3D point:**
   - `instancedMesh.onPointerOut` → `store.hoverFile(null)`
   - Glow sphere removed

**Key principle:** The 150ms debounce on card leave is the anti-flicker mechanism. The store is the single write target. No intermediate state syncing.

### 7. Z-Index Constants

**Add to `theme.ts`:**

```typescript
export const Z_INDEX = {
  sidebar: 10,
  modal: 20,
  contextMenu: 1000,
} as const;

export const MINI_CARD_Z_RANGE: [number, number] = [100, 0];
```

All components import these instead of hardcoding z-index values.

## Files Summary

| File | Action |
|------|--------|
| `packages/web/src/components/agent-view/EmbeddingSpace.tsx` | **MODIFY** — remove local hovered/selected state, simplify to store-only reads |
| `packages/web/src/components/agent-view/ExpandablePreview.tsx` | **MODIFY** — remove compact hover card, widen modal to 560px, add crossfade |
| `packages/web/src/components/agent-view/FilePreviewLayer.tsx` | **MODIFY** — shrink cards to 88px, use thumbnail API, add sidebar exclusion |
| `packages/web/src/components/agent-view/PointCloud.tsx` | **MODIFY** — read hoveredFileId/clickedFileId from store instead of props |
| `packages/web/src/components/agent-view/useVisualizationStore.ts` | **MODIFY** — add derived point selectors, remove hoveredFileId from ExpandablePreview concerns |
| `packages/web/src/theme.ts` | **MODIFY** — add Z_INDEX and MINI_CARD_Z_RANGE constants |
| `packages/server/src/routes/thumbnails.ts` | **NEW** — thumbnail endpoint |
| `packages/core/src/thumbnails.ts` | **NEW** — thumbnail generation logic |
| `packages/server/src/index.ts` | **MODIFY** — register thumbnail route |

## Dependencies

- `sharp` — add to `packages/server` (image resizing)
- `ffmpeg` — system binary (video frame extraction), document as requirement
- `pdfjs-dist` — add to `packages/server` (already in web)

## Out of Scope

- Drag-and-drop file assignment to pots
- Animated opacity transitions for point dimming
- Search/filter within the sidebar
- Keyboard navigation for modal (arrow keys to cycle files)
- Thumbnail pre-generation on file upload (generate on first request, cache thereafter)
