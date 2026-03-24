# Visualization Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 3D embedding visualization by consolidating state, removing the dual hover system, shrinking floating cards, widening the modal, adding server-side thumbnails, and centralizing z-index values.

**Architecture:** Single Zustand store becomes the only source of truth for hover/click state. Floating mini cards (88px) are the sole hover UI — the fixed-position compact card is removed. Server generates real thumbnails for all file types via a new `/api/files/:id/thumbnail` endpoint with filesystem caching. Modal widens to 560px with crossfade transitions.

**Tech Stack:** React 19, Three.js (@react-three/fiber, @react-three/drei), Zustand 5, Express 5, sharp (new), ffmpeg (system), pdfjs-dist, Vitest 3

**Spec:** `docs/superpowers/specs/2026-03-24-visualization-polish-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/web/src/theme.ts` | Modify | Add Z_INDEX and MINI_CARD_Z_RANGE constants |
| `packages/web/src/components/agent-view/useVisualizationStore.ts` | Modify | Remove EmbeddingSpace's need for local state |
| `packages/web/src/components/agent-view/useVisualizationHooks.ts` | Create | `useClickedPoint(points)` and `useHoveredPoint(points)` convenience hooks |
| `packages/web/src/components/agent-view/EmbeddingSpace.tsx` | Modify | Remove local hovered/selected state, use store directly |
| `packages/web/src/components/agent-view/PointCloud.tsx` | Modify | Read hovered/clicked from store instead of props |
| `packages/web/src/components/agent-view/ExpandablePreview.tsx` | Modify | Remove compact hover card, widen to 560px, add crossfade |
| `packages/web/src/components/agent-view/FilePreviewLayer.tsx` | Modify | Shrink to 88px, use thumbnail URL, add sidebar exclusion |
| `packages/core/src/thumbnails.ts` | Create | Thumbnail generation logic per content type |
| `packages/core/src/index.ts` | Modify | Re-export thumbnails module |
| `packages/server/src/routes/thumbnails.ts` | Create | GET /api/files/:id/thumbnail route |
| `packages/server/src/index.ts` | Modify | Register thumbnail route |
| `packages/core/tests/thumbnails.test.ts` | Create | Tests for thumbnail generation |

---

### Task 1: Z-Index Constants

**Files:**
- Modify: `packages/web/src/theme.ts`
- Modify: `packages/web/src/components/agent-view/PotsSidebar.tsx`
- Modify: `packages/web/src/components/agent-view/ExpandablePreview.tsx`
- Modify: `packages/web/src/components/agent-view/FilePreviewLayer.tsx`

- [ ] **Step 1: Add z-index constants to theme.ts**

```typescript
// Add at end of packages/web/src/theme.ts

export const Z_INDEX = {
  sidebar: 10,
  hoverCard: 15,
  modal: 20,
  contextMenu: 1000,
} as const;

export const MINI_CARD_Z_RANGE: [number, number] = [100, 0];
```

- [ ] **Step 2: Replace hardcoded z-index in PotsSidebar.tsx**

Import `Z_INDEX` from `../../theme` and replace:
- `zIndex: 10` → `zIndex: Z_INDEX.sidebar` (lines 119, 132)
- `zIndex: 1000` → `zIndex: Z_INDEX.contextMenu` (lines 30, 57)

- [ ] **Step 3: Replace hardcoded z-index in ExpandablePreview.tsx**

Import `Z_INDEX` from `../../theme` and replace:
- `zIndex: 15` → `zIndex: Z_INDEX.hoverCard` (line 176)
- `zIndex: 20` → `zIndex: Z_INDEX.modal` (line 241)

- [ ] **Step 4: Replace hardcoded z-index in FilePreviewLayer.tsx**

Import `MINI_CARD_Z_RANGE` from `../../theme` and replace:
- `zIndexRange={[100, 0]}` → `zIndexRange={MINI_CARD_Z_RANGE}` (line 199)

- [ ] **Step 5: Verify build**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/theme.ts packages/web/src/components/agent-view/PotsSidebar.tsx packages/web/src/components/agent-view/ExpandablePreview.tsx packages/web/src/components/agent-view/FilePreviewLayer.tsx
git commit -m "refactor(web): centralize z-index values in theme.ts"
```

---

### Task 2: Thumbnail Generation Core

**Files:**
- Create: `packages/core/src/thumbnails.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/tests/thumbnails.test.ts`

**Dependencies to install:** `sharp` in packages/core

- [ ] **Step 1: Install sharp**

Run: `cd packages/core && npm install sharp && npm install -D @types/sharp`

- [ ] **Step 2: Write failing tests for thumbnail generation**

Create `packages/core/tests/thumbnails.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { generateThumbnail, getThumbnail } from "../src/thumbnails.js";

describe("thumbnails", () => {
  let tempDir: string;
  let cacheDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "thumb-test-"));
    cacheDir = join(tempDir, "thumbnails");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("generateThumbnail", () => {
    it("generates a JPEG thumbnail for an image file", async () => {
      // Create a tiny 2x2 red PNG using sharp
      const sharp = (await import("sharp")).default;
      const srcPath = join(tempDir, "test.png");
      await sharp({
        create: { width: 400, height: 300, channels: 3, background: { r: 255, g: 0, b: 0 } },
      }).png().toFile(srcPath);

      const result = await generateThumbnail(srcPath, "image/png", cacheDir, "test-id");

      expect(result).not.toBeNull();
      // Check it's a JPEG
      const bytes = await readFile(result!);
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xd8); // JPEG magic bytes
    });

    it("returns a fallback placeholder for unsupported types", async () => {
      const srcPath = join(tempDir, "test.bin");
      await writeFile(srcPath, Buffer.alloc(100));

      const result = await generateThumbnail(srcPath, "application/octet-stream", cacheDir, "test-id");

      expect(result).not.toBeNull();
      const bytes = await readFile(result!);
      // Should still be a valid JPEG
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xd8);
    });

    it("resizes large images to max 200px width", async () => {
      const sharp = (await import("sharp")).default;
      const srcPath = join(tempDir, "big.png");
      await sharp({
        create: { width: 1000, height: 800, channels: 3, background: { r: 0, g: 0, b: 255 } },
      }).png().toFile(srcPath);

      const result = await generateThumbnail(srcPath, "image/png", cacheDir, "big-id");
      const meta = await sharp(result!).metadata();
      expect(meta.width).toBeLessThanOrEqual(200);
      expect(meta.height).toBeLessThanOrEqual(200);
    });
  });

  describe("getThumbnail", () => {
    it("returns cached thumbnail on second call", async () => {
      const sharp = (await import("sharp")).default;
      const srcPath = join(tempDir, "cached.png");
      await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 255, b: 0 } },
      }).png().toFile(srcPath);

      const first = await getThumbnail(srcPath, "image/png", cacheDir, "cached-id");
      const second = await getThumbnail(srcPath, "image/png", cacheDir, "cached-id");

      expect(first).toBe(second); // Same path — served from cache
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run tests/thumbnails.test.ts`
Expected: FAIL — `generateThumbnail` not found

- [ ] **Step 4: Implement thumbnail generation**

Create `packages/core/src/thumbnails.ts`:

```typescript
import sharp from "sharp";
import { join } from "node:path";
import { mkdir, access, constants } from "node:fs/promises";

const THUMB_WIDTH = 200;
const THUMB_HEIGHT = 200;

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function cachePath(cacheDir: string, fileId: string): string {
  return join(cacheDir, `${fileId}.jpg`);
}

/** Get or generate a thumbnail. Returns the path to the JPEG thumbnail. */
export async function getThumbnail(
  srcPath: string,
  contentType: string,
  cacheDir: string,
  fileId: string,
): Promise<string | null> {
  const dest = cachePath(cacheDir, fileId);

  if (await fileExists(dest)) return dest;

  return generateThumbnail(srcPath, contentType, cacheDir, fileId);
}

/** Generate a thumbnail and write it to cacheDir. Returns path to JPEG. */
export async function generateThumbnail(
  srcPath: string,
  contentType: string,
  cacheDir: string,
  fileId: string,
): Promise<string | null> {
  await mkdir(cacheDir, { recursive: true });
  const dest = cachePath(cacheDir, fileId);

  const kind = getPreviewKind(contentType);

  try {
    switch (kind) {
      case "image":
        await sharp(srcPath)
          .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(dest);
        return dest;

      case "video":
        return await generateVideoThumbnail(srcPath, dest);

      case "pdf":
        return await generatePdfThumbnail(srcPath, dest);

      case "audio":
        return await generatePlaceholder(dest, "#F6C177", "AUD");

      case "text":
        return await generatePlaceholder(dest, "#9AD1FF", "TXT");

      default:
        return await generatePlaceholder(dest, "#6B8A9E", "FILE");
    }
  } catch (err) {
    console.error(`Thumbnail generation failed for ${fileId}:`, err);
    // Fallback: generate a colored placeholder
    try {
      return await generatePlaceholder(dest, "#6B8A9E", "FILE");
    } catch {
      return null;
    }
  }
}

function getPreviewKind(contentType: string): string {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("application/pdf")) return "pdf";
  if (contentType.startsWith("text/")) return "text";
  return "unknown";
}

async function generateVideoThumbnail(srcPath: string, dest: string): Promise<string | null> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  try {
    // Extract frame at 1 second via ffmpeg
    await execFileAsync("ffmpeg", [
      "-i", srcPath,
      "-ss", "1",
      "-vframes", "1",
      "-vf", `scale=${THUMB_WIDTH}:-1`,
      "-y",
      dest,
    ], { timeout: 10_000 });
    return dest;
  } catch {
    // ffmpeg not available or failed — generate placeholder
    return generatePlaceholder(dest, "#C792EA", "VID");
  }
}

async function generatePdfThumbnail(srcPath: string, dest: string): Promise<string | null> {
  try {
    // Use sharp to convert first page of PDF
    // sharp supports PDF input via libvips
    await sharp(srcPath, { page: 0 })
      .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "inside" })
      .jpeg({ quality: 80 })
      .toFile(dest);
    return dest;
  } catch {
    // PDF rendering not supported in this sharp build — placeholder
    return generatePlaceholder(dest, "#8AB4FF", "PDF");
  }
}

async function generatePlaceholder(dest: string, color: string, label: string): Promise<string> {
  // Create a colored rectangle with centered text label
  const width = THUMB_WIDTH;
  const height = THUMB_HEIGHT;

  // Parse hex color
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  // Dark background with a subtle colored gradient
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="40%">
        <stop offset="0%" stop-color="rgb(${Math.round(r * 0.2)},${Math.round(g * 0.2)},${Math.round(b * 0.2)})"/>
        <stop offset="100%" stop-color="#0a131c"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
      font-family="sans-serif" font-size="32" font-weight="700"
      fill="${color}" opacity="0.8">${label}</text>
  </svg>`;

  await sharp(Buffer.from(svg))
    .jpeg({ quality: 80 })
    .toFile(dest);

  return dest;
}
```

- [ ] **Step 5: Export from core index**

Add to `packages/core/src/index.ts`:
```typescript
export * from "./thumbnails.js";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run tests/thumbnails.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/thumbnails.ts packages/core/src/index.ts packages/core/tests/thumbnails.test.ts packages/core/package.json packages/core/package-lock.json
git commit -m "feat(core): add thumbnail generation with caching"
```

---

### Task 3: Thumbnail Route

**Files:**
- Create: `packages/server/src/routes/thumbnails.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Create the thumbnail route**

Create `packages/server/src/routes/thumbnails.ts`:

```typescript
import { Router } from "express";
import { join } from "node:path";
import { getFileInfo, getThumbnail } from "@clawdrive/core";

export function createThumbnailRoutes(wsPath: string): Router {
  const router = Router();
  const cacheDir = join(wsPath, "thumbnails");

  // GET /api/files/:id/thumbnail
  router.get("/:id/thumbnail", async (req, res, next) => {
    try {
      const info = await getFileInfo(req.params.id, { wsPath });
      if (!info) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const filePath = join(wsPath, "files", info.file_path);
      const thumbPath = await getThumbnail(filePath, info.content_type, cacheDir, info.id);

      if (!thumbPath) {
        res.status(500).json({ error: "Thumbnail generation failed" });
        return;
      }

      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "public, max-age=86400");
      const { createReadStream } = await import("node:fs");
      createReadStream(thumbPath).pipe(res);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Register the route in server index**

In `packages/server/src/index.ts`, add import:
```typescript
import { createThumbnailRoutes } from "./routes/thumbnails.js";
```

Register the thumbnail router on the `/api/files` prefix **before** the existing `createFileRoutes` registration. Express evaluates routers in registration order, so the `/:id/thumbnail` route must be registered before the catch-all `/:id` route in the files router:
```typescript
app.use("/api/files", createThumbnailRoutes(opts.wsPath));
app.use("/api/files", createFileRoutes(opts.wsPath, opts.embedder));
```

- [ ] **Step 3: Verify build**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/thumbnails.ts packages/server/src/index.ts
git commit -m "feat(server): add GET /api/files/:id/thumbnail route"
```

---

### Task 4: State Consolidation

**Files:**
- Create: `packages/web/src/components/agent-view/useVisualizationHooks.ts`
- Modify: `packages/web/src/components/agent-view/EmbeddingSpace.tsx`
- Modify: `packages/web/src/components/agent-view/PointCloud.tsx`

- [ ] **Step 1: Create convenience hooks**

Create `packages/web/src/components/agent-view/useVisualizationHooks.ts`:

```typescript
import { useMemo } from "react";
import type { ProjectionPoint } from "../../types";
import { useVisualizationStore } from "./useVisualizationStore";

/** Resolve clickedFileId from the store to a full ProjectionPoint. */
export function useClickedPoint(points: ProjectionPoint[]): ProjectionPoint | null {
  const clickedFileId = useVisualizationStore((s) => s.clickedFileId);
  return useMemo(
    () => points.find((p) => p.id === clickedFileId) ?? null,
    [points, clickedFileId],
  );
}

/** Resolve hoveredFileId from the store to a full ProjectionPoint. */
export function useHoveredPoint(points: ProjectionPoint[]): ProjectionPoint | null {
  const hoveredFileId = useVisualizationStore((s) => s.hoveredFileId);
  return useMemo(
    () => points.find((p) => p.id === hoveredFileId) ?? null,
    [points, hoveredFileId],
  );
}
```

- [ ] **Step 2: Simplify EmbeddingSpace — remove local state**

Rewrite `packages/web/src/components/agent-view/EmbeddingSpace.tsx`:

Remove these imports/state:
- Remove `useState` from the import (keep `useMemo`, `useRef`, `useEffect`)
- Remove `const [hovered, setHovered] = useState<ProjectionPoint | null>(null);`
- Remove `const [selected, setSelected] = useState<ProjectionPoint | null>(null);`
- Remove the `useEffect` that clears local state when `clickedFileId === null` (lines 31-36)
- Remove the `useEffect` that syncs `selected` with `points` (lines 44-48)
- Remove the `useEffect` that sets `selected` from `focusFileId` (lines 38-42) — replace with a direct store write

Update the `focusFileId` effect to write directly to the store:
```typescript
useEffect(() => {
  if (!focusFileId) return;
  const match = points.find((point) => point.id === focusFileId);
  if (match) clickFile(match.id);
}, [focusFileId, points, clickFile]);
```

Update PointCloud props — remove `selectedId`, `onHover`, `onSelect`:
```typescript
<PointCloud points={points} />
```

Update FilePreviewLayer props — remove `onHover`, `onSelect`:
```typescript
<FilePreviewLayer points={points} />
```

Update `onPointerMissed` to use store only. The guard prevents backdrop clicks from dismissing the modal (since HTML overlay cards aren't Three.js objects, clicking them triggers `onPointerMissed`):
```typescript
onPointerMissed={() => {
  // Guard: don't clear when modal is open — HTML overlays trigger onPointerMissed
  if (!useVisualizationStore.getState().clickedFileId) {
    hoverFile(null);
  }
}}
```

- [ ] **Step 3: Update PointCloud to read from store**

Modify `packages/web/src/components/agent-view/PointCloud.tsx`:

Change the Props interface:
```typescript
interface Props {
  points: ProjectionPoint[];
}
```

Update the component signature:
```typescript
export function PointCloud({ points }: Props) {
```

Import and use the convenience hooks:
```typescript
import { useClickedPoint, useHoveredPoint } from "./useVisualizationHooks";
```

Replace the existing `selectedPoint`/`hoveredPoint` logic with:
```typescript
const selectedPoint = useClickedPoint(points);
const hoveredPoint = useHoveredPoint(points);
const clickedFileId = useVisualizationStore((s) => s.clickedFileId);
const hoverFile = useVisualizationStore((s) => s.hoverFile);
const clickFile = useVisualizationStore((s) => s.clickFile);
```

Update event handlers on the instancedMesh:
```typescript
onPointerOver={(e) => {
  e.stopPropagation();
  const idx = e.instanceId;
  if (idx !== undefined && points[idx]) hoverFile(points[idx].id);
}}
onPointerOut={() => hoverFile(null)}
onClick={(e) => {
  e.stopPropagation();
  const idx = e.instanceId;
  if (idx !== undefined && points[idx]) clickFile(points[idx].id);
}}
```

Update the hover glow condition (use `clickedFileId` instead of `selectedId`):
```typescript
{hoveredPoint && hoveredPoint.id !== clickedFileId && (
```

- [ ] **Step 4: Update FilePreviewLayer to read from store**

Modify `packages/web/src/components/agent-view/FilePreviewLayer.tsx`:

Remove the `onHover` and `onSelect` props from the interface:
```typescript
interface FilePreviewLayerProps {
  points: ProjectionPoint[];
}
```

Update signature:
```typescript
export function FilePreviewLayer({ points }: FilePreviewLayerProps) {
```

Add store reads:
```typescript
const hoverFile = useVisualizationStore((s) => s.hoverFile);
const clickFile = useVisualizationStore((s) => s.clickFile);
```

Update PreviewCard callbacks:
```typescript
<PreviewCard
  point={point}
  onHover={() => hoverFile(point.id)}
  onLeave={() => hoverFile(null)}
  onSelect={() => clickFile(point.id)}
/>
```

- [ ] **Step 5: Verify build**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/agent-view/useVisualizationHooks.ts packages/web/src/components/agent-view/EmbeddingSpace.tsx packages/web/src/components/agent-view/PointCloud.tsx packages/web/src/components/agent-view/FilePreviewLayer.tsx
git commit -m "refactor(web): consolidate to Zustand-only state, remove local hovered/selected"
```

---

### Task 5: Remove Compact Hover Card

**Files:**
- Modify: `packages/web/src/components/agent-view/ExpandablePreview.tsx`

- [ ] **Step 1: Remove the compact hover card branch**

In `packages/web/src/components/agent-view/ExpandablePreview.tsx`:

Remove the `hoveredFileId` subscription:
```typescript
// DELETE this line:
const hoveredFileId = useVisualizationStore((s) => s.hoveredFileId);
```

Change `displayId` to only use `clickedFileId`:
```typescript
// BEFORE:
const isExpanded = clickedFileId !== null;
const displayId = clickedFileId ?? hoveredFileId;

// AFTER:
const displayId = clickedFileId;
```

Delete the entire `if (!isExpanded)` block (the compact hover card, lines 168-230).

The component now returns `null` when `clickedFileId` is null, and the modal when it's set.

- [ ] **Step 2: Remove Z_INDEX.hoverCard since it's no longer used**

In `packages/web/src/theme.ts`, remove `hoverCard: 15` from `Z_INDEX`:
```typescript
export const Z_INDEX = {
  sidebar: 10,
  modal: 20,
  contextMenu: 1000,
} as const;
```

- [ ] **Step 3: Verify build**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/agent-view/ExpandablePreview.tsx packages/web/src/theme.ts
git commit -m "fix(web): remove compact hover card — floating mini cards are sole hover UI"
```

---

### Task 6: Mini Cards

**Files:**
- Modify: `packages/web/src/components/agent-view/FilePreviewLayer.tsx`

- [ ] **Step 1: Shrink card dimensions**

In `PreviewCard` component, change the outer card div width:
```typescript
// BEFORE: width: 128
// AFTER:
width: 88,
```

Change the thumbnail height:
```typescript
// BEFORE: height: 84
// AFTER:
height: 52,
```

Change thumbnail `src` to use the thumbnail API:
```typescript
// BEFORE:
src={point.previewUrl}

// AFTER:
src={`/api/files/${encodeURIComponent(point.id)}/thumbnail`}
```

Scale font sizes down:
- Label font-size: `9` → `8`
- Filename font-size: `10` → `9`

Update the `trimName` function to trim shorter:
```typescript
function trimName(name: string): string {
  if (name.length <= 20) return name;
  return `${name.slice(0, 17)}...`;
}
```

- [ ] **Step 2: Add sidebar exclusion zone**

In the `useFrame` callback inside `FilePreviewLayer`, after computing `nearest`, add screen-space filtering:

```typescript
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

// Inside the component, add:
const { camera, size } = useThree();
const tmpVec = useMemo(() => new THREE.Vector3(), []);

// Inside useFrame, after filtering by distance and sorting:
const SIDEBAR_EXCLUSION_PX = 240; // sidebar width (220) + margin (20)

const filtered = nearest.filter((entry) => {
  const point = pointById.get(entry.id);
  if (!point) return false;
  tmpVec.set(point.x, point.y, point.z);
  tmpVec.project(camera);
  // Convert NDC (-1 to 1) to screen pixels
  const screenX = (tmpVec.x * 0.5 + 0.5) * size.width;
  return screenX > SIDEBAR_EXCLUSION_PX;
});

const finalIds = filtered.slice(0, MAX_PREVIEWS).map((entry) => entry.id);
```

- [ ] **Step 3: Update non-image thumbnail fallback**

In `PreviewCard`, the fallback for non-image types now uses the thumbnail API too (which returns a JPEG placeholder). Replace the fallback div with a simple img:

```typescript
{kind === "image" && point.previewUrl && !imageFailed ? (
  <img ... />
) : (
  <img
    src={`/api/files/${encodeURIComponent(point.id)}/thumbnail`}
    alt={point.fileName}
    loading="lazy"
    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
  />
)}
```

Actually, since ALL file types now have thumbnails from the API, simplify to always use the thumbnail URL:

```typescript
<div style={{ height: 52, background: "rgba(10, 20, 28, 0.92)" }}>
  <img
    src={`/api/files/${encodeURIComponent(point.id)}/thumbnail`}
    alt={point.fileName}
    loading="lazy"
    onError={() => setImageFailed(true)}
    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
  />
  {imageFailed && (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      color, fontSize: 13, letterSpacing: 1, fontWeight: 700,
    }}>
      {label}
    </div>
  )}
</div>
```

- [ ] **Step 4: Verify build**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/agent-view/FilePreviewLayer.tsx
git commit -m "feat(web): shrink preview cards to 88px, use thumbnail API, add sidebar exclusion"
```

---

### Task 7: Modal Redesign + Crossfade

**Files:**
- Modify: `packages/web/src/components/agent-view/ExpandablePreview.tsx`

- [ ] **Step 1: Widen modal and enlarge media area**

In the expanded modal container div:
```typescript
// BEFORE: width: 400
// AFTER:
width: 560,
```

In `MediaPreview`, update image/video height:
```typescript
// BEFORE: height: 200
// AFTER:
height: 280,
```

- [ ] **Step 2: Add crossfade transition**

Add `useRef` and `useEffect` for crossfade:

```typescript
import { useEffect, useState, useRef } from "react";

// Inside ExpandablePreview:
const [displayedId, setDisplayedId] = useState<string | null>(null);
const [opacity, setOpacity] = useState(1);
const prevClickedId = useRef<string | null>(null);

useEffect(() => {
  if (clickedFileId === null) {
    // Closing modal — instant
    setDisplayedId(null);
    setOpacity(1);
    prevClickedId.current = null;
    return;
  }

  if (prevClickedId.current === null) {
    // Fresh open — instant
    setDisplayedId(clickedFileId);
    setOpacity(1);
    prevClickedId.current = clickedFileId;
    return;
  }

  if (prevClickedId.current !== clickedFileId) {
    // Switching files — crossfade
    setOpacity(0);
    const timer = setTimeout(() => {
      setDisplayedId(clickedFileId);
      setOpacity(1);
      prevClickedId.current = clickedFileId;
    }, 100);
    return () => clearTimeout(timer);
  }
}, [clickedFileId]);
```

Wrap the modal content container with the transition:
```typescript
<div style={{
  // ... existing modal container styles ...
  opacity,
  transition: "opacity 100ms ease",
}}>
```

Use `displayedId` instead of `clickedFileId` to resolve the point:
```typescript
const point = points.find((p) => p.id === displayedId);
```

- [ ] **Step 3: Verify build**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/agent-view/ExpandablePreview.tsx
git commit -m "feat(web): widen modal to 560px, add crossfade transition on file switch"
```

---

### Task 8: Visual Verification

- [ ] **Step 1: Start the dev server**

Run: `cd packages/web && npm run dev`

- [ ] **Step 2: Verify the following behaviors**

Open the app in a browser and check:

1. **No compact hover card** — hovering a point shows only the 3D glow sphere, no top-right card
2. **Mini cards visible** — small 88px cards float near points in the scene
3. **Mini cards show thumbnails** — images show real thumbnails; other types show colored placeholders
4. **Sidebar exclusion** — no cards render behind/overlapping the pots sidebar
5. **Card hover** — hovering a mini card highlights its border AND the 3D point glows
6. **Card click opens modal** — clicking a mini card opens the 560px centered modal
7. **Point click opens modal** — clicking a 3D point opens the modal
8. **Modal crossfade** — with modal open, clicking another point crossfades to new content
9. **Modal dismiss** — clicking backdrop or × closes the modal, no state leaks (no lingering glow)
10. **Pots sidebar** — still works: select pot, points dim, file count shows
11. **No flickering** — hover in/out of cards repeatedly — no blinking

- [ ] **Step 3: Fix any issues found**

If issues are found, fix them and commit with descriptive message.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix(web): visual verification fixes"
```

(Only if there were fixes needed in step 3)
