# Visualization Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the 3D embedding visualization by removing per-file label clutter, adding expandable media preview, pots sidebar with CRUD, and fixing camera auto-rotation to allow free exploration.

**Architecture:** A centralized zustand interaction store coordinates cross-component state (pot selection, file click/hover, idle tracking). Components read/write through this store. New components: PotsSidebar (left overlay), ExpandablePreview (replaces HoverCard). Backend gets two new pot routes (PATCH, DELETE).

**Tech Stack:** React, Three.js, React Three Fiber, @react-three/drei, zustand (new), vitest

**Spec:** `docs/superpowers/specs/2026-03-24-visualization-improvements-design.md`

---

### Task 1: Add zustand dependency

**Files:**
- Modify: `packages/web/package.json`

- [ ] **Step 1: Install zustand**

```bash
cd packages/web && npm install zustand
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('zustand')" 2>/dev/null || node -e "import('zustand').then(() => console.log('ok'))"
```
Expected: no error

- [ ] **Step 3: Commit**

```bash
git add packages/web/package.json package-lock.json
git commit -m "chore(web): add zustand dependency"
```

---

### Task 2: Backend — add renamePot and deletePot to core

**Files:**
- Modify: `packages/core/src/pots.ts` (add `renamePot()` and `deletePot()`)
- Modify: `packages/core/src/index.ts` (export new functions)
- Test: `packages/core/tests/pots.test.ts`

- [ ] **Step 1: Write failing tests for renamePot and deletePot**

Add to `packages/core/tests/pots.test.ts`:

```typescript
import { createPot, listPotFiles, listPots, renamePot, deletePot } from "../src/pots.js";
// ... (update import at top)

it("renames a pot and migrates tags on member files", async () => {
  const pot = await createPot({ name: "Old Name" }, { wsPath: ctx.wsPath });
  const src = join(ctx.baseDir, "rename-test.md");
  await writeFile(src, "content");

  await store(
    { sourcePath: src, tags: [buildPotTag(pot.slug)] },
    { wsPath: ctx.wsPath, embedder },
  );

  const renamed = await renamePot(pot.id, "New Name", { wsPath: ctx.wsPath });
  expect(renamed.name).toBe("New Name");
  expect(renamed.slug).toBe("new-name");
  expect(renamed.id).toBe(pot.id);

  const all = await listPots({ wsPath: ctx.wsPath });
  expect(all).toHaveLength(1);
  expect(all[0].name).toBe("New Name");

  // Verify pot tags were migrated on files
  const files = await listPotFiles("new-name", { wsPath: ctx.wsPath });
  expect(files).toHaveLength(1);
  expect(files[0].tags).toContain(buildPotTag("new-name"));
  expect(files[0].tags).not.toContain(buildPotTag("old-name"));
});

it("deletes a pot and removes pot tags from member files", async () => {
  const pot = await createPot({ name: "To Delete" }, { wsPath: ctx.wsPath });
  const src = join(ctx.baseDir, "tagged.md");
  await writeFile(src, "content");

  await store(
    { sourcePath: src, tags: [buildPotTag(pot.slug)] },
    { wsPath: ctx.wsPath, embedder },
  );

  // Verify file is tagged
  let files = await listPotFiles(pot.slug, { wsPath: ctx.wsPath });
  expect(files).toHaveLength(1);
  expect(files[0].tags).toContain(buildPotTag(pot.slug));

  await deletePot(pot.id, { wsPath: ctx.wsPath });

  const all = await listPots({ wsPath: ctx.wsPath });
  expect(all).toHaveLength(0);

  // Verify pot tags were removed from member files
  const { getFileInfo } = await import("../src/manage.js");
  const fileInfo = await getFileInfo(files[0].id, { wsPath: ctx.wsPath });
  expect(fileInfo!.tags).not.toContain(buildPotTag(pot.slug));
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/core && npx vitest run tests/pots.test.ts
```
Expected: FAIL — `renamePot` and `deletePot` not exported

- [ ] **Step 3: Implement renamePot in `packages/core/src/pots.ts`**

Add after the `createPot` function:

```typescript
export async function renamePot(
  id: string,
  newName: string,
  opts: PotOptions,
): Promise<PotRecord> {
  const name = newName.trim();
  if (!name) throw new Error("Pot name is required");

  const newSlug = slugifyPotName(name);
  if (!newSlug) throw new Error("Pot name must contain letters or numbers");

  // Get old pot info before renaming (need old slug for tag migration)
  const oldPot = await getPot(id, opts);
  if (!oldPot) throw new Error(`Pot not found: ${id}`);
  const oldSlug = oldPot.slug;

  const result = await updateWorkspaceJson(opts.wsPath, POTS_FILE, [] as PotRecord[], (pots) => {
    const index = pots.findIndex((p) => p.id === id);
    if (index === -1) throw new Error(`Pot not found: ${id}`);

    if (pots.some((p) => p.slug === newSlug && p.id !== id)) {
      throw new Error(`Pot already exists: ${newSlug}`);
    }

    const updated: PotRecord = {
      ...pots[index],
      name,
      slug: newSlug,
      updated_at: Date.now(),
    };

    const next = [...pots];
    next[index] = updated;
    return { next, result: updated };
  });

  // Migrate pot tags on member files: pot:<old-slug> → pot:<new-slug>
  if (oldSlug !== newSlug) {
    const oldTag = buildPotTag(oldSlug);
    const newTag = buildPotTag(newSlug);
    // listPotFiles won't work here (pot already renamed), so query files with old tag directly
    const db = await createDatabase(join(opts.wsPath, "db"));
    const table = await getFilesTable(db);
    const rows = await table
      .query()
      .where("deleted_at IS NULL AND parent_id IS NULL")
      .limit(1_000_000)
      .toArray();

    const members = rows
      .map((row) => toFileRecord(row as Record<string, unknown>))
      .filter((file) => file.tags.includes(oldTag));

    for (const file of members) {
      const newTags = file.tags.map((t) => (t === oldTag ? newTag : t));
      await update(file.id, { tags: newTags }, { wsPath: opts.wsPath });
    }
  }

  return result;
}
```

- [ ] **Step 4: Implement deletePot in `packages/core/src/pots.ts`**

Add after `renamePot`:

```typescript
export async function deletePot(id: string, opts: PotOptions): Promise<void> {
  const pot = await getPot(id, opts);
  if (!pot) throw new Error(`Pot not found: ${id}`);

  // Remove pot from pots.json
  await updateWorkspaceJson(opts.wsPath, POTS_FILE, [] as PotRecord[], (pots) => {
    return {
      next: pots.filter((p) => p.id !== id),
      result: undefined,
    };
  });

  // Remove pot tags from member files (uses update() from manage.ts for proper locking + chunk handling)
  const potTag = buildPotTag(pot.slug);
  const files = await listPotFiles(pot.slug, opts);
  for (const file of files) {
    const newTags = file.tags.filter((t) => t !== potTag);
    await update(file.id, { tags: newTags }, { wsPath: opts.wsPath });
  }
}
```

Note: You'll need to import `update` from `./manage.js` at the top of pots.ts:
```typescript
import { update } from "./manage.js";
```
The `update()` function handles locking and also updates child chunks, so pot tags are cleaned up properly.

- [ ] **Step 5: Export new functions from `packages/core/src/index.ts`**

Find the existing pot exports and add `renamePot` and `deletePot` to the export list.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd packages/core && npx vitest run tests/pots.test.ts
```
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/pots.ts packages/core/src/index.ts packages/core/tests/pots.test.ts
git commit -m "feat(core): add renamePot and deletePot functions"
```

---

### Task 3: Backend — add PATCH and DELETE pot routes

**Files:**
- Modify: `packages/server/src/routes/pots.ts`

- [ ] **Step 1: Add PATCH route for renaming a pot**

Add to `packages/server/src/routes/pots.ts`, after the existing `POST /` route. Also update the import to include `renamePot` and `deletePot`:

```typescript
import { createPot, listPotFiles, listPots, renamePot, deletePot } from "@clawdrive/core";

// ... existing routes ...

router.patch("/:id", async (req, res, next) => {
  try {
    if (!req.body?.name || typeof req.body.name !== "string") {
      res.status(400).json({ error: "Field 'name' is required" });
      return;
    }
    const pot = await renamePot(req.params.id, req.body.name, { wsPath });
    res.json(pot);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 2: Add DELETE route for deleting a pot**

Add after the PATCH route:

```typescript
router.delete("/:id", async (req, res, next) => {
  try {
    await deletePot(req.params.id, { wsPath });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 3: Verify server compiles**

```bash
cd packages/server && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/pots.ts
git commit -m "feat(server): add PATCH and DELETE routes for pots"
```

---

### Task 4: Frontend — add API functions for pots and file updates

**Files:**
- Modify: `packages/web/src/api.ts`

- [ ] **Step 1: Add pot and file API functions**

Add to the end of `packages/web/src/api.ts`:

```typescript
export async function listPots() {
  const res = await fetch(`${BASE}/pots`);
  if (!res.ok) throw new Error(`List pots failed: ${res.statusText}`);
  return res.json();
}

export async function createPot(name: string) {
  const res = await fetch(`${BASE}/pots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Create pot failed: ${res.statusText}`);
  return res.json();
}

export async function renamePot(id: string, name: string) {
  const res = await fetch(`${BASE}/pots/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Rename pot failed: ${res.statusText}`);
  return res.json();
}

export async function deletePot(id: string) {
  const res = await fetch(`${BASE}/pots/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete pot failed: ${res.statusText}`);
  return res.json();
}

export async function listPotFiles(potSlug: string) {
  const res = await fetch(`${BASE}/pots/${potSlug}/files`);
  if (!res.ok) throw new Error(`List pot files failed: ${res.statusText}`);
  return res.json();
}

export async function updateFile(id: string, changes: { tags?: string[]; description?: string }) {
  const res = await fetch(`${BASE}/files/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  if (!res.ok) throw new Error(`Update file failed: ${res.statusText}`);
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/api.ts
git commit -m "feat(web): add API functions for pot CRUD and file updates"
```

---

### Task 5: Frontend — create interaction store

**Files:**
- Modify: `packages/web/src/types.ts`
- Create: `packages/web/src/components/agent-view/useVisualizationStore.ts`

- [ ] **Step 1: Add PotRecord to web types**

Add to `packages/web/src/types.ts`:

```typescript
export interface PotRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}
```

- [ ] **Step 2: Create the zustand store**

Create `packages/web/src/components/agent-view/useVisualizationStore.ts`:

```typescript
import { create } from "zustand";
import type { PotRecord, ProjectionPoint } from "../../types";
import * as api from "../../api";

const IDLE_TIMEOUT = 30_000; // 30 seconds

interface VisualizationState {
  // Pot state
  selectedPotId: string | null;
  pots: PotRecord[];
  potFileIds: Set<string>;

  // File interaction state
  clickedFileId: string | null;
  hoveredFileId: string | null;

  // Camera idle state
  lastInteractionTime: number;

  // Actions
  selectPot: (id: string | null) => void;
  clickFile: (id: string | null) => void;
  hoverFile: (id: string | null) => void;
  recordInteraction: () => void;
  isIdle: () => boolean;

  // Pot CRUD
  fetchPots: () => Promise<void>;
  createPot: (name: string) => Promise<void>;
  renamePot: (id: string, name: string) => Promise<void>;
  deletePot: (id: string) => Promise<void>;

  // File-pot assignment
  assignFileToPot: (fileId: string, potSlug: string, currentTags: string[]) => Promise<void>;
  unassignFileFromPot: (fileId: string, potSlug: string, currentTags: string[]) => Promise<void>;
}

export const useVisualizationStore = create<VisualizationState>((set, get) => ({
  selectedPotId: null,
  pots: [],
  potFileIds: new Set(),
  clickedFileId: null,
  hoveredFileId: null,
  lastInteractionTime: Date.now(),

  selectPot: async (id) => {
    set({ selectedPotId: id, potFileIds: new Set() });
    if (!id) return;

    const pot = get().pots.find((p) => p.id === id);
    if (!pot) return;

    try {
      const data = await api.listPotFiles(pot.slug);
      const ids = new Set<string>((data.items ?? []).map((f: { id: string }) => f.id));
      // Only update if this pot is still selected
      if (get().selectedPotId === id) {
        set({ potFileIds: ids });
      }
    } catch (err) {
      console.error("Failed to fetch pot files:", err);
    }
  },

  clickFile: (id) => {
    set({ clickedFileId: id });
    get().recordInteraction();
  },

  hoverFile: (id) => set({ hoveredFileId: id }),

  recordInteraction: () => set({ lastInteractionTime: Date.now() }),

  isIdle: () => Date.now() - get().lastInteractionTime > IDLE_TIMEOUT,

  fetchPots: async () => {
    try {
      const data = await api.listPots();
      set({ pots: data.pots ?? [] });
    } catch (err) {
      console.error("Failed to fetch pots:", err);
    }
  },

  createPot: async (name) => {
    try {
      await api.createPot(name);
      await get().fetchPots();
    } catch (err) {
      console.error("Failed to create pot:", err);
    }
  },

  renamePot: async (id, name) => {
    try {
      await api.renamePot(id, name);
      await get().fetchPots();
    } catch (err) {
      console.error("Failed to rename pot:", err);
    }
  },

  deletePot: async (id) => {
    try {
      await api.deletePot(id);
      if (get().selectedPotId === id) {
        set({ selectedPotId: null, potFileIds: new Set() });
      }
      await get().fetchPots();
    } catch (err) {
      console.error("Failed to delete pot:", err);
    }
  },

  assignFileToPot: async (fileId, potSlug, currentTags) => {
    const potTag = `pot:${potSlug}`;
    if (currentTags.includes(potTag)) return;
    try {
      await api.updateFile(fileId, { tags: [...currentTags, potTag] });
      // Refresh pot files if this pot is selected
      const { selectedPotId, pots } = get();
      const selectedPot = pots.find((p) => p.id === selectedPotId);
      if (selectedPot?.slug === potSlug) {
        get().selectPot(selectedPotId);
      }
    } catch (err) {
      console.error("Failed to assign file to pot:", err);
    }
  },

  unassignFileFromPot: async (fileId, potSlug, currentTags) => {
    const potTag = `pot:${potSlug}`;
    try {
      await api.updateFile(fileId, { tags: currentTags.filter((t) => t !== potTag) });
      const { selectedPotId, pots } = get();
      const selectedPot = pots.find((p) => p.id === selectedPotId);
      if (selectedPot?.slug === potSlug) {
        get().selectPot(selectedPotId);
      }
    } catch (err) {
      console.error("Failed to unassign file from pot:", err);
    }
  },
}));
```

- [ ] **Step 3: Verify it compiles**

```bash
cd packages/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/agent-view/useVisualizationStore.ts packages/web/src/types.ts
git commit -m "feat(web): add zustand visualization interaction store"
```

---

### Task 6: Remove per-file labels

**Files:**
- Delete: `packages/web/src/components/agent-view/PointLabels.tsx`
- Modify: `packages/web/src/components/agent-view/EmbeddingSpace.tsx`

- [ ] **Step 1: Remove PointLabels import and usage from EmbeddingSpace.tsx**

In `EmbeddingSpace.tsx`:
- Remove the import: `import { PointLabels } from "./PointLabels";`
- Remove the JSX: `<PointLabels points={points} highlightedId={highlightedId} />`
- Remove the `highlightedId` variable if it's no longer used elsewhere (check — it's only used by PointLabels, so remove `const highlightedId = selected?.id ?? hovered?.id ?? null;`)

- [ ] **Step 2: Delete PointLabels.tsx**

```bash
rm packages/web/src/components/agent-view/PointLabels.tsx
```

- [ ] **Step 3: Verify compilation**

```bash
cd packages/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add -u packages/web/src/components/agent-view/PointLabels.tsx packages/web/src/components/agent-view/EmbeddingSpace.tsx
git commit -m "feat(web): remove per-file labels from 3D visualization"
```

---

### Task 7: Camera auto-rotation with 30s idle timeout

**Files:**
- Modify: `packages/web/src/components/agent-view/MapCameraRig.tsx`
- Modify: `packages/web/src/components/agent-view/EmbeddingSpace.tsx`

- [ ] **Step 1: Rewrite MapCameraRig to use the store**

Replace the entire content of `MapCameraRig.tsx`:

```typescript
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { RefObject } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useVisualizationStore } from "./useVisualizationStore";

interface FocusTarget {
  x: number;
  y: number;
  z: number;
}

interface MapCameraRigProps {
  focusTarget: FocusTarget | null;
  controlsRef: RefObject<OrbitControlsImpl | null>;
}

const RAMP_DURATION = 3; // seconds to ramp up auto-rotation

export function MapCameraRig({ focusTarget, controlsRef }: MapCameraRigProps) {
  const { camera, clock } = useThree();
  const targetVec = useMemo(() => new THREE.Vector3(), []);
  const desiredVec = useMemo(() => new THREE.Vector3(), []);
  const idleStartTime = useRef<number | null>(null);
  const isIdle = useVisualizationStore((s) => s.isIdle);
  const recordInteraction = useVisualizationStore((s) => s.recordInteraction);

  useFrame((_, delta) => {
    // Focus mode: smoothly move to target
    if (focusTarget) {
      targetVec.set(focusTarget.x, focusTarget.y, focusTarget.z);
      desiredVec.set(focusTarget.x + 8, focusTarget.y + 5, focusTarget.z + 12);
      const settle = 1 - Math.exp(-delta * 3.2);
      camera.position.lerp(desiredVec, settle);
      if (controlsRef.current) {
        controlsRef.current.target.lerp(targetVec, settle);
        controlsRef.current.update();
      } else {
        camera.lookAt(targetVec);
      }
      return;
    }

    // Check idle state
    const idle = isIdle();
    if (!idle) {
      idleStartTime.current = null;
      return; // Free camera — OrbitControls fully in charge
    }

    // Track when idle started for ramp-up
    if (idleStartTime.current === null) {
      idleStartTime.current = clock.getElapsedTime();
    }

    // Ramp factor: 0 → 1 over RAMP_DURATION seconds
    const idleDuration = clock.getElapsedTime() - idleStartTime.current;
    const ramp = Math.min(idleDuration / RAMP_DURATION, 1);

    const t = clock.getElapsedTime();
    targetVec.set(
      Math.sin(t * 0.11) * 2.4,
      Math.cos(t * 0.07) * 1.5,
      Math.cos(t * 0.09) * 2.2,
    );
    desiredVec.set(
      Math.cos(t * 0.05) * 52,
      11 + Math.sin(t * 0.13) * 4,
      Math.sin(t * 0.05) * 52,
    );

    const drift = (1 - Math.exp(-delta * 0.65)) * ramp;
    camera.position.lerp(desiredVec, drift);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetVec, drift);
      controlsRef.current.update();
    } else {
      camera.lookAt(targetVec);
    }
  });

  return null;
}
```

- [ ] **Step 2: Update EmbeddingSpace to wire interaction recording**

In `EmbeddingSpace.tsx`:
- Remove the `userInteracting` state: `const [userInteracting, setUserInteracting] = useState(false);`
- Remove the `userInteracting` prop from `<MapCameraRig>`
- Import the store: `import { useVisualizationStore } from "./useVisualizationStore";`
- Add inside the component: `const recordInteraction = useVisualizationStore((s) => s.recordInteraction);`
- Update `OrbitControls`:
  ```tsx
  <OrbitControls
    ref={controlsRef}
    enableDamping
    dampingFactor={0.05}
    minDistance={8}
    maxDistance={140}
    onStart={() => recordInteraction()}
    onEnd={() => recordInteraction()}
  />
  ```

- [ ] **Step 3: Verify compilation**

```bash
cd packages/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/agent-view/MapCameraRig.tsx packages/web/src/components/agent-view/EmbeddingSpace.tsx
git commit -m "feat(web): 30s idle timeout for camera auto-rotation"
```

---

### Task 8: Point dimming for pot selection

**Files:**
- Modify: `packages/web/src/components/agent-view/PointCloud.tsx`

- [ ] **Step 1: Add pot-based dimming to PointCloud**

Rewrite `PointCloud.tsx` to read from the store and apply per-instance opacity:

```typescript
import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ProjectionPoint } from "../../types";
import { getModalityColor, MAP_THEME } from "../../theme";
import { useVisualizationStore } from "./useVisualizationStore";

const DIM_OPACITY = 0.15;
const FULL_OPACITY = 1.0;
const BG_COLOR = new THREE.Color(MAP_THEME.background);

function getColor(contentType: string): THREE.Color {
  return new THREE.Color(getModalityColor(contentType));
}

interface Props {
  points: ProjectionPoint[];
  onHover: (point: ProjectionPoint | null) => void;
  onSelect: (point: ProjectionPoint | null) => void;
  selectedId: string | null;
}

export function PointCloud({ points, onHover, onSelect, selectedId }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const selectedPoint = useMemo(
    () => points.find((point) => point.id === selectedId) ?? null,
    [points, selectedId],
  );

  const potFileIds = useVisualizationStore((s) => s.potFileIds);
  const selectedPotId = useVisualizationStore((s) => s.selectedPotId);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  // Set initial positions
  useEffect(() => {
    if (!meshRef.current || points.length === 0) return;
    const mesh = meshRef.current;
    const dummy = new THREE.Object3D();

    points.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, getColor(p.contentType));
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [points]);

  // Apply dimming when pot is selected
  useFrame(() => {
    if (!meshRef.current || points.length === 0) return;
    if (!selectedPotId) return; // No pot selected, colors already set in useEffect

    const mesh = meshRef.current;

    points.forEach((p, i) => {
      const inPot = potFileIds.has(p.id);
      const baseColor = getColor(p.contentType);

      if (inPot) {
        mesh.setColorAt(i, baseColor);
      } else {
        tmpColor.copy(baseColor).lerp(BG_COLOR, 1 - DIM_OPACITY);
        mesh.setColorAt(i, tmpColor);
      }
    });

    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  // Reset colors when pot is deselected
  useEffect(() => {
    if (selectedPotId || !meshRef.current || points.length === 0) return;
    const mesh = meshRef.current;
    points.forEach((p, i) => {
      mesh.setColorAt(i, getColor(p.contentType));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [selectedPotId, points]);

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, Math.max(points.length, 1)]}
        onPointerOver={(e) => {
          e.stopPropagation();
          const idx = e.instanceId;
          if (idx !== undefined && points[idx]) onHover(points[idx]);
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          const idx = e.instanceId;
          if (idx !== undefined && points[idx]) onSelect(points[idx]);
        }}
      >
        <sphereGeometry args={[0.35, 12, 12]} />
        <meshStandardMaterial
          emissive={MAP_THEME.accentPrimary}
          emissiveIntensity={0.18}
          metalness={0.05}
          roughness={0.32}
          transparent
        />
      </instancedMesh>

      {selectedPoint && (
        <group position={[selectedPoint.x, selectedPoint.y, selectedPoint.z]}>
          <mesh>
            <sphereGeometry args={[1.05, 16, 16]} />
            <meshBasicMaterial
              color={getModalityColor(selectedPoint.contentType)}
              transparent
              opacity={0.22}
            />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.45, 0.05, 10, 48]} />
            <meshBasicMaterial color={MAP_THEME.accentPrimary} transparent opacity={0.7} />
          </mesh>
        </group>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd packages/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/agent-view/PointCloud.tsx
git commit -m "feat(web): dim non-pot points when pot is selected"
```

---

### Task 9: Expandable Preview component

**Files:**
- Create: `packages/web/src/components/agent-view/ExpandablePreview.tsx`
- Delete: `packages/web/src/components/agent-view/HoverCard.tsx`
- Modify: `packages/web/src/components/agent-view/EmbeddingSpace.tsx`

- [ ] **Step 1: Create ExpandablePreview.tsx**

Create `packages/web/src/components/agent-view/ExpandablePreview.tsx`:

```typescript
import { useEffect, useRef, useState } from "react";
import type { ProjectionPoint } from "../../types";
import { getModalityColor, getModalityLabel, getPreviewKind, MAP_THEME } from "../../theme";
import { useVisualizationStore } from "./useVisualizationStore";

function MediaPreview({ point }: { point: ProjectionPoint }) {
  const [imageFailed, setImageFailed] = useState(false);
  const kind = getPreviewKind(point.contentType);
  const color = getModalityColor(point.contentType);
  const label = getModalityLabel(point.contentType);
  const contentUrl = `/api/files/${encodeURIComponent(point.id)}/content`;

  useEffect(() => {
    setImageFailed(false);
  }, [point.id]);

  if (kind === "image" && point.previewUrl && !imageFailed) {
    return (
      <img
        src={point.previewUrl}
        alt={point.fileName}
        loading="lazy"
        onError={() => setImageFailed(true)}
        style={{ width: "100%", height: 200, objectFit: "contain", display: "block", background: "#0a131c" }}
      />
    );
  }

  if (kind === "video") {
    return (
      <video
        key={point.id}
        src={contentUrl}
        controls
        autoPlay
        muted
        style={{ width: "100%", height: 200, objectFit: "contain", display: "block", background: "#000" }}
      />
    );
  }

  if (kind === "audio") {
    return (
      <div style={{ padding: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 32, color, fontWeight: 700 }}>{label}</div>
        <audio key={point.id} src={contentUrl} controls style={{ width: "100%" }} />
      </div>
    );
  }

  return (
    <div style={{
      height: 120,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color,
      fontSize: 18,
      fontWeight: 700,
      letterSpacing: 1,
    }}>
      {label} PREVIEW
    </div>
  );
}

function PotAssignment({ point }: { point: ProjectionPoint }) {
  const pots = useVisualizationStore((s) => s.pots);
  const assignFileToPot = useVisualizationStore((s) => s.assignFileToPot);
  const unassignFileFromPot = useVisualizationStore((s) => s.unassignFileFromPot);
  const [showPicker, setShowPicker] = useState(false);

  const assignedSlugs = point.tags
    .filter((t) => t.startsWith("pot:"))
    .map((t) => t.slice(4));

  const assignedPots = pots.filter((p) => assignedSlugs.includes(p.slug));
  const unassignedPots = pots.filter((p) => !assignedSlugs.includes(p.slug));

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${MAP_THEME.border}` }}>
      <div style={{ color: "#6B8A9E", textTransform: "uppercase", fontSize: 10, letterSpacing: 1 }}>Pot</div>
      <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {assignedPots.map((p) => (
          <span
            key={p.id}
            onClick={() => unassignFileFromPot(point.id, p.slug, point.tags)}
            style={{
              background: "rgba(110, 231, 255, 0.08)",
              border: "1px solid rgba(110, 231, 255, 0.25)",
              color: MAP_THEME.accentPrimary,
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {p.name} ×
          </span>
        ))}
        {unassignedPots.length > 0 && (
          <div style={{ position: "relative" }}>
            <span
              onClick={() => setShowPicker(!showPicker)}
              style={{ color: "#6B8A9E", fontSize: 11, cursor: "pointer" }}
            >
              + assign
            </span>
            {showPicker && (
              <div style={{
                position: "absolute",
                bottom: "100%",
                left: 0,
                marginBottom: 4,
                background: MAP_THEME.panel,
                border: `1px solid ${MAP_THEME.border}`,
                borderRadius: 8,
                padding: 4,
                minWidth: 140,
                zIndex: 10,
              }}>
                {unassignedPots.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      assignFileToPot(point.id, p.slug, point.tags);
                      setShowPicker(false);
                    }}
                    style={{
                      padding: "6px 10px",
                      fontSize: 12,
                      color: MAP_THEME.text,
                      cursor: "pointer",
                      borderRadius: 4,
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "rgba(110, 231, 255, 0.08)"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
                  >
                    {p.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ExpandablePreview({ points }: { points: ProjectionPoint[] }) {
  const clickedFileId = useVisualizationStore((s) => s.clickedFileId);
  const hoveredFileId = useVisualizationStore((s) => s.hoveredFileId);
  const clickFile = useVisualizationStore((s) => s.clickFile);
  const cardRef = useRef<HTMLDivElement>(null);

  const isExpanded = clickedFileId !== null;
  const displayId = clickedFileId ?? hoveredFileId;
  const point = points.find((p) => p.id === displayId);

  // Click outside to dismiss
  useEffect(() => {
    if (!isExpanded) return;
    function handleClick(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        // Don't dismiss if clicking on the canvas (that's handled by onPointerMissed)
      }
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [isExpanded, clickFile]);

  if (!point) return null;

  const color = getModalityColor(point.contentType);
  const label = getModalityLabel(point.contentType);

  if (!isExpanded) {
    // Compact hover card
    return (
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          background: "linear-gradient(135deg, rgba(8, 22, 32, 0.92), rgba(6, 16, 24, 0.92))",
          border: `1px solid ${MAP_THEME.border}`,
          borderRadius: 12,
          padding: "14px 14px 12px",
          fontSize: 13,
          width: 240,
          backdropFilter: "blur(8px)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <span style={{
            padding: "3px 8px", borderRadius: 999,
            border: `1px solid ${color}66`, color,
            letterSpacing: 0.6, fontSize: 10, fontWeight: 700,
          }}>
            {label}
          </span>
        </div>
        <div style={{
          fontWeight: 600, color: MAP_THEME.text, marginBottom: 6,
          fontFamily: "'DM Sans', 'Avenir Next', 'Segoe UI', sans-serif",
          fontSize: 14, lineHeight: 1.3, wordBreak: "break-word",
        }}>
          {point.fileName}
        </div>
        {point.previewUrl && getPreviewKind(point.contentType) === "image" && (
          <div style={{
            border: `1px solid ${MAP_THEME.border}`, borderRadius: 10,
            overflow: "hidden", marginBottom: 10,
          }}>
            <img
              src={point.previewUrl}
              alt={point.fileName}
              loading="lazy"
              style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }}
            />
          </div>
        )}
        {point.tags.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {point.tags.filter((t) => !t.startsWith("pot:")).map((t) => (
              <span key={t} style={{
                padding: "2px 6px", borderRadius: 3,
                fontSize: 10, background: `${color}20`, color,
              }}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Expanded preview
  return (
    <div
      ref={cardRef}
      style={{
        position: "absolute",
        top: 20,
        right: 20,
        background: "linear-gradient(135deg, rgba(8, 22, 32, 0.95), rgba(6, 16, 24, 0.95))",
        border: `1px solid ${MAP_THEME.border}`,
        borderRadius: 12,
        padding: 16,
        fontSize: 13,
        width: 320,
        backdropFilter: "blur(16px)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
        maxHeight: "calc(100vh - 60px)",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: MAP_THEME.text, fontSize: 14, fontWeight: 600, wordBreak: "break-word", flex: 1 }}>
          {point.fileName}
        </div>
        <div
          onClick={() => clickFile(null)}
          style={{ color: "#6B8A9E", fontSize: 18, cursor: "pointer", marginLeft: 8, lineHeight: 1 }}
        >
          ×
        </div>
      </div>

      <div style={{
        border: `1px solid ${MAP_THEME.border}`, borderRadius: 10,
        overflow: "hidden", marginTop: 12, background: "rgba(10, 19, 28, 0.7)",
      }}>
        <MediaPreview point={point} />
      </div>

      <div style={{
        marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: 8, fontSize: 12,
      }}>
        <div>
          <div style={{ color: "#6B8A9E", textTransform: "uppercase", fontSize: 10, letterSpacing: 1 }}>Type</div>
          <div style={{ color: MAP_THEME.text, marginTop: 2 }}>{point.contentType}</div>
        </div>
        <div>
          <div style={{ color: "#6B8A9E", textTransform: "uppercase", fontSize: 10, letterSpacing: 1 }}>ID</div>
          <div style={{ color: MAP_THEME.text, marginTop: 2, fontSize: 10, opacity: 0.7 }}>{point.id.slice(0, 12)}...</div>
        </div>
      </div>

      {point.tags.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: "#6B8A9E", textTransform: "uppercase", fontSize: 10, letterSpacing: 1 }}>Tags</div>
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {point.tags.filter((t) => !t.startsWith("pot:")).map((t) => (
              <span key={t} style={{
                padding: "2px 8px", borderRadius: 999, fontSize: 10,
                background: `${color}20`, color,
              }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      <PotAssignment point={point} />
    </div>
  );
}
```

- [ ] **Step 2: Update EmbeddingSpace to use ExpandablePreview**

In `EmbeddingSpace.tsx`:
- Remove: `import { HoverCard } from "./HoverCard";`
- Add: `import { ExpandablePreview } from "./ExpandablePreview";`
- Remove: `const detailsPoint = selected ?? hovered;`
- Replace: `{detailsPoint && <HoverCard point={detailsPoint} />}` with `<ExpandablePreview points={points} />`
- Wire click/hover to store. Add to the component body:
  ```typescript
  const clickFile = useVisualizationStore((s) => s.clickFile);
  const hoverFile = useVisualizationStore((s) => s.hoverFile);
  ```
- Update `PointCloud` and `FilePreviewLayer` onSelect/onHover callbacks to also write to the store:
  ```tsx
  <PointCloud
    points={points}
    selectedId={selected?.id ?? null}
    onHover={(p) => { setHovered(p); hoverFile(p?.id ?? null); }}
    onSelect={(p) => { setSelected(p); clickFile(p?.id ?? null); }}
  />
  <FilePreviewLayer
    points={points}
    hoveredId={hovered?.id ?? null}
    selectedId={selected?.id ?? null}
    onHover={(p) => { setHovered(p); hoverFile(p?.id ?? null); }}
    onSelect={(p) => { setSelected(p); clickFile(p?.id ?? null); }}
  />
  ```
- Update `onPointerMissed` on Canvas:
  ```tsx
  onPointerMissed={() => { setSelected(null); clickFile(null); }}
  ```

- [ ] **Step 3: Delete HoverCard.tsx**

```bash
rm packages/web/src/components/agent-view/HoverCard.tsx
```

- [ ] **Step 4: Verify compilation**

```bash
cd packages/web && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add -u packages/web/src/components/agent-view/HoverCard.tsx
git add packages/web/src/components/agent-view/ExpandablePreview.tsx packages/web/src/components/agent-view/EmbeddingSpace.tsx
git commit -m "feat(web): add expandable preview with media playback, replace HoverCard"
```

---

### Task 10: Pots Sidebar

**Files:**
- Create: `packages/web/src/components/agent-view/PotsSidebar.tsx`
- Modify: `packages/web/src/components/agent-view/EmbeddingSpace.tsx`

- [ ] **Step 1: Create PotsSidebar.tsx**

Create `packages/web/src/components/agent-view/PotsSidebar.tsx`:

```typescript
import { useEffect, useState, useRef } from "react";
import { MAP_THEME } from "../../theme";
import { useVisualizationStore } from "./useVisualizationStore";

function ContextMenu({
  x, y, potId, potName, onClose,
}: {
  x: number; y: number; potId: string; potName: string; onClose: () => void;
}) {
  const renamePot = useVisualizationStore((s) => s.renamePot);
  const deletePotAction = useVisualizationStore((s) => s.deletePot);
  const recordInteraction = useVisualizationStore((s) => s.recordInteraction);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(potName);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  if (renaming) {
    return (
      <div ref={menuRef} style={{
        position: "fixed", left: x, top: y, zIndex: 1000,
        background: MAP_THEME.panel, border: `1px solid ${MAP_THEME.border}`,
        borderRadius: 8, padding: 8, minWidth: 160,
      }}>
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && newName.trim()) {
              await renamePot(potId, newName.trim());
              recordInteraction();
              onClose();
            }
            if (e.key === "Escape") onClose();
          }}
          style={{
            width: "100%", background: MAP_THEME.background,
            border: `1px solid ${MAP_THEME.border}`, borderRadius: 4,
            padding: "4px 8px", color: MAP_THEME.text, fontSize: 12, outline: "none",
          }}
        />
      </div>
    );
  }

  return (
    <div ref={menuRef} style={{
      position: "fixed", left: x, top: y, zIndex: 1000,
      background: MAP_THEME.panel, border: `1px solid ${MAP_THEME.border}`,
      borderRadius: 8, padding: 4, minWidth: 120,
    }}>
      <div
        onClick={() => setRenaming(true)}
        style={{
          padding: "6px 12px", fontSize: 12, color: MAP_THEME.text,
          cursor: "pointer", borderRadius: 4,
        }}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "rgba(110, 231, 255, 0.08)"; }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
      >
        Rename
      </div>
      <div
        onClick={async () => {
          await deletePotAction(potId);
          recordInteraction();
          onClose();
        }}
        style={{
          padding: "6px 12px", fontSize: 12, color: "#ff8d8d",
          cursor: "pointer", borderRadius: 4,
        }}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "rgba(255, 100, 100, 0.08)"; }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
      >
        Delete
      </div>
    </div>
  );
}

export function PotsSidebar() {
  const pots = useVisualizationStore((s) => s.pots);
  const selectedPotId = useVisualizationStore((s) => s.selectedPotId);
  const selectPot = useVisualizationStore((s) => s.selectPot);
  const fetchPots = useVisualizationStore((s) => s.fetchPots);
  const createPotAction = useVisualizationStore((s) => s.createPot);
  const potFileIds = useVisualizationStore((s) => s.potFileIds);
  const recordInteraction = useVisualizationStore((s) => s.recordInteraction);

  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPotName, setNewPotName] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; potId: string; potName: string } | null>(null);

  useEffect(() => {
    fetchPots();
  }, [fetchPots]);

  if (collapsed) {
    return (
      <div
        onClick={() => { setCollapsed(false); recordInteraction(); }}
        style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: 40,
          background: "rgba(14, 26, 36, 0.85)", backdropFilter: "blur(12px)",
          borderRight: `1px solid ${MAP_THEME.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", zIndex: 10,
        }}
      >
        <span style={{ color: "#6B8A9E", fontSize: 14 }}>▶</span>
      </div>
    );
  }

  return (
    <div style={{
      position: "absolute", left: 0, top: 0, bottom: 0, width: 220,
      background: "rgba(14, 26, 36, 0.92)", backdropFilter: "blur(12px)",
      borderRight: `1px solid ${MAP_THEME.border}`,
      display: "flex", flexDirection: "column", zIndex: 10,
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 16px 12px", display: "flex",
        justifyContent: "space-between", alignItems: "center",
        borderBottom: `1px solid ${MAP_THEME.border}`,
      }}>
        <span style={{
          color: MAP_THEME.accentPrimary, fontSize: 12,
          textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600,
        }}>
          Pots
        </span>
        <div
          onClick={() => { setCreating(true); recordInteraction(); }}
          style={{
            width: 24, height: 24, borderRadius: 6,
            background: "rgba(110, 231, 255, 0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: MAP_THEME.accentPrimary, fontSize: 16, cursor: "pointer",
          }}
        >
          +
        </div>
      </div>

      {/* Create input */}
      {creating && (
        <div style={{ padding: "8px 16px" }}>
          <input
            autoFocus
            placeholder="Pot name..."
            value={newPotName}
            onChange={(e) => setNewPotName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && newPotName.trim()) {
                await createPotAction(newPotName.trim());
                setNewPotName("");
                setCreating(false);
                recordInteraction();
              }
              if (e.key === "Escape") {
                setNewPotName("");
                setCreating(false);
              }
            }}
            onBlur={() => {
              if (!newPotName.trim()) {
                setCreating(false);
                setNewPotName("");
              }
            }}
            style={{
              width: "100%", background: MAP_THEME.background,
              border: `1px solid ${MAP_THEME.border}`, borderRadius: 6,
              padding: "6px 10px", color: MAP_THEME.text, fontSize: 12, outline: "none",
            }}
          />
        </div>
      )}

      {/* Pot list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {pots.map((pot) => {
          const isSelected = pot.id === selectedPotId;
          return (
            <div
              key={pot.id}
              onClick={() => {
                selectPot(isSelected ? null : pot.id);
                recordInteraction();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, potId: pot.id, potName: pot.name });
              }}
              style={{
                padding: "10px 12px", borderRadius: 8, marginBottom: 4, cursor: "pointer",
                background: isSelected ? "rgba(110, 231, 255, 0.08)" : "transparent",
                border: isSelected ? "1px solid rgba(110, 231, 255, 0.25)" : "1px solid transparent",
                transition: "background 120ms ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{
                  color: isSelected ? MAP_THEME.text : "#9AB",
                  fontSize: 13, fontWeight: isSelected ? 500 : 400,
                }}>
                  {pot.name}
                </span>
                {isSelected && potFileIds.size > 0 && (
                  <span style={{ color: MAP_THEME.accentPrimary, fontSize: 11 }}>
                    {potFileIds.size}
                  </span>
                )}
              </div>
              {isSelected && (
                <div style={{ color: "#6B8A9E", fontSize: 11, marginTop: 2 }}>
                  Files highlighted
                </div>
              )}
            </div>
          );
        })}
        {pots.length === 0 && !creating && (
          <div style={{ padding: "16px 12px", color: "#6B8A9E", fontSize: 12, textAlign: "center" }}>
            No pots yet
          </div>
        )}
      </div>

      {/* Collapse */}
      <div style={{ padding: "8px 16px", borderTop: `1px solid ${MAP_THEME.border}` }}>
        <div
          onClick={() => setCollapsed(true)}
          style={{ color: "#6B8A9E", fontSize: 11, cursor: "pointer", textAlign: "center" }}
        >
          ◀ Collapse
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          potId={contextMenu.potId}
          potName={contextMenu.potName}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add PotsSidebar to EmbeddingSpace**

In `EmbeddingSpace.tsx`, add:
- Import: `import { PotsSidebar } from "./PotsSidebar";`
- Place `<PotsSidebar />` inside the root `<div>`, before `<Canvas>`:

```tsx
return (
  <div style={{ flex: 1, position: "relative", minHeight: 0, background: "..." }}>
    <PotsSidebar />
    <Canvas ...>
      {/* ... */}
    </Canvas>
    <ExpandablePreview points={points} />
  </div>
);
```

- [ ] **Step 3: Verify compilation**

```bash
cd packages/web && npx tsc --noEmit
```

- [ ] **Step 4: Manual test**

```bash
cd packages/server && npm run dev
```

Open the web UI. Verify:
1. Pots sidebar appears on the left
2. Can create a new pot via `+` button
3. Clicking a pot highlights its files (dims others)
4. Right-click opens rename/delete context menu
5. Collapse/expand works

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/agent-view/PotsSidebar.tsx packages/web/src/components/agent-view/EmbeddingSpace.tsx
git commit -m "feat(web): add pots sidebar with CRUD and highlight toggle"
```

---

### Task 11: Integration — wire everything together and test

**Files:**
- Modify: `packages/web/src/components/agent-view/EmbeddingSpace.tsx` (final cleanup)

- [ ] **Step 1: Final review of EmbeddingSpace.tsx**

Verify the final state of `EmbeddingSpace.tsx` has:
- `useVisualizationStore` imported and wired (clickFile, hoverFile, recordInteraction)
- `PotsSidebar` rendered before Canvas
- `ExpandablePreview` rendered after Canvas
- No `PointLabels` or `HoverCard` imports
- No `userInteracting` state
- `MapCameraRig` receives no `userInteracting` prop
- `onPointerMissed` clears both local state and store

- [ ] **Step 2: Run full compilation check**

```bash
cd packages/web && npx tsc --noEmit
```

- [ ] **Step 3: Run dev server and manual integration test**

```bash
cd packages/server && npm run dev
```

Test checklist:
- [ ] Per-file labels are gone, cluster (taxonomy) labels remain
- [ ] Hover shows compact card (top-right, 240px)
- [ ] Click a point expands to 320px with media player
- [ ] Video plays inline, audio has controls
- [ ] Click × or click empty space to dismiss
- [ ] Pots sidebar visible on left, can create/rename/delete pots
- [ ] Click a pot → non-pot files dim to ~15% brightness
- [ ] Click pot again → deselects, all points return to full brightness
- [ ] Can assign files to pots from expanded preview
- [ ] Camera orbits on load
- [ ] User interaction stops orbit immediately
- [ ] After 30s idle, orbit gently resumes (3s ramp-up)
- [ ] Sidebar interactions reset idle timer

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -u packages/web/src/components/agent-view/
git commit -m "feat(web): visualization improvements integration and cleanup"
```
