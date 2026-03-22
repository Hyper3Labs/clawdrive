# ClawDrive Server + Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a web UI to ClawDrive with a REST API server, 3D embedding space visualization, taxonomy browser, and spotlight search.

**Architecture:** Two new packages: `packages/server` (Express REST API exposing core functions) and `packages/web` (React + Vite SPA). The server serves the static web build and provides API endpoints. Started via `clawdrive serve` or `clawdrive ui`.

**Tech Stack:** Express, React, Vite, Three.js, umap-js, @react-three/fiber, @react-three/drei

**Spec:** `docs/superpowers/specs/2026-03-22-clawdrive-v1-design.md`

**Depends on:** Plan 1 (Core + CLI) — complete on branch `feat/core-cli`

---

## File Structure

```
packages/
  server/
  ├── package.json
  ├── tsconfig.json
  └── src/
      ├── index.ts                  # createServer() factory
      ├── routes/
      │   ├── files.ts              # POST /api/store, GET /api/files, GET /api/files/:id, etc.
      │   ├── search.ts             # GET /api/search
      │   ├── taxonomy.ts           # GET /api/taxonomy
      │   ├── projections.ts        # GET /api/projections, POST /api/projections/recompute
      │   └── usage.ts              # GET /api/usage
      ├── middleware/
      │   └── error.ts              # error handling middleware
      └── umap.ts                   # UMAP projection computation + caching

  web/
  ├── package.json
  ├── tsconfig.json
  ├── vite.config.ts
  ├── index.html
  └── src/
      ├── main.tsx                  # React entry point
      ├── App.tsx                   # Layout: top bar, view tabs, content
      ├── api.ts                    # fetch wrapper for REST API
      ├── types.ts                  # shared frontend types
      ├── components/
      │   ├── TopBar.tsx            # logo, view tabs, search trigger, file count
      │   ├── ViewTabs.tsx          # Agent View / Human View toggle
      │   ├── SpotlightSearch.tsx   # Cmd+K overlay with real-time search
      │   ├── agent-view/
      │   │   ├── EmbeddingSpace.tsx     # Three.js 3D scatter plot container
      │   │   ├── PointCloud.tsx         # instanced mesh for file points
      │   │   ├── ClusterLabels.tsx      # floating text labels for clusters
      │   │   ├── HoverCard.tsx          # file info popup on hover
      │   │   └── useProjections.ts      # hook: fetch + cache UMAP projections
      │   └── human-view/
      │       ├── TaxonomyBrowser.tsx     # sidebar + file grid layout
      │       ├── TaxonomySidebar.tsx     # collapsible tree with counts
      │       ├── FileGrid.tsx           # file cards with icons
      │       └── Breadcrumb.tsx         # path display
      └── styles/
          └── globals.css           # minimal global styles, dark theme
```

---

## Task 1: Server Package Scaffolding

**Files:**
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/src/middleware/error.ts`
- Update: root `tsconfig.json` (add server reference)
- Update: root `turbo.json` if needed

- [ ] **Step 1: Create packages/server/package.json**

```json
{
  "name": "@clawdrive/server",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@clawdrive/core": "*",
    "express": "^5",
    "cors": "^2",
    "multer": "^1"
  },
  "devDependencies": {
    "@types/express": "^5",
    "@types/cors": "^2",
    "@types/multer": "^1"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Step 3: Create server factory**

```typescript
// packages/server/src/index.ts
import express from "express";
import cors from "cors";
import { join } from "node:path";
import type { EmbeddingProvider } from "@clawdrive/core";
import { errorHandler } from "./middleware/error.js";

export interface ServerOptions {
  wsPath: string;
  embedder: EmbeddingProvider;
  port: number;
  host: string;
  staticDir?: string; // path to built web UI
}

export function createServer(opts: ServerOptions) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // API routes will be registered here (Tasks 2-3)

  // Serve static web UI if provided
  if (opts.staticDir) {
    app.use(express.static(opts.staticDir));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(join(opts.staticDir!, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}

export { ServerOptions };
```

- [ ] **Step 4: Create error middleware**

```typescript
// packages/server/src/middleware/error.ts
import type { Request, Response, NextFunction } from "express";

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
}
```

- [ ] **Step 5: Update root tsconfig.json**

Add `{ "path": "packages/server" }` to references.

- [ ] **Step 6: Install, build, verify**

Run: `npm install && npm run build`

- [ ] **Step 7: Commit**

```bash
git add packages/server/ tsconfig.json
git commit -m "feat(server): scaffold Express server package"
```

---

## Task 2: REST API — File Routes

**Files:**
- Create: `packages/server/src/routes/files.ts`
- Create: `packages/server/src/routes/search.ts`
- Modify: `packages/server/src/index.ts` (register routes)

- [ ] **Step 1: Implement file routes**

```typescript
// packages/server/src/routes/files.ts
import { Router } from "express";
import multer from "multer";
import { store, getFileInfo, getFilePath, exportFile, remove, update, listFiles } from "@clawdrive/core";
import type { EmbeddingProvider } from "@clawdrive/core";

export function createFileRoutes(wsPath: string, embedder: EmbeddingProvider) {
  const router = Router();
  const upload = multer({ dest: "/tmp/clawdrive-uploads/" });

  // POST /api/store — upload and store a file
  router.post("/store", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const tags = req.body.tags ? JSON.parse(req.body.tags) : [];
      const description = req.body.description || null;
      const result = await store(
        { sourcePath: req.file.path, tags, description },
        { wsPath, embedder }
      );
      res.json(result);
    } catch (err) { next(err); }
  });

  // GET /api/files — list files with pagination
  router.get("/", async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const cursor = req.query.cursor as string | undefined;
      const result = await listFiles({ limit, cursor }, { wsPath });
      res.json(result);
    } catch (err) { next(err); }
  });

  // GET /api/files/:id — get file metadata
  router.get("/:id", async (req, res, next) => {
    try {
      const info = await getFileInfo(req.params.id, { wsPath });
      if (!info) return res.status(404).json({ error: "File not found" });
      res.json(info);
    } catch (err) { next(err); }
  });

  // GET /api/files/:id/content — download file
  router.get("/:id/content", async (req, res, next) => {
    try {
      const filePath = await getFilePath(req.params.id, { wsPath });
      if (!filePath) return res.status(404).json({ error: "File not found" });
      res.sendFile(filePath);
    } catch (err) { next(err); }
  });

  // PATCH /api/files/:id — update metadata
  router.patch("/:id", async (req, res, next) => {
    try {
      const { tags, description } = req.body;
      await update(req.params.id, { tags, description }, { wsPath });
      const updated = await getFileInfo(req.params.id, { wsPath });
      res.json(updated);
    } catch (err) { next(err); }
  });

  // DELETE /api/files/:id — soft-delete
  router.delete("/:id", async (req, res, next) => {
    try {
      await remove(req.params.id, { wsPath });
      res.json({ deleted: true });
    } catch (err) { next(err); }
  });

  return router;
}
```

- [ ] **Step 2: Implement search route**

```typescript
// packages/server/src/routes/search.ts
import { Router } from "express";
import { search } from "@clawdrive/core";
import type { EmbeddingProvider } from "@clawdrive/core";

export function createSearchRoutes(wsPath: string, embedder: EmbeddingProvider) {
  const router = Router();

  // GET /api/search?q=...&mode=...&type=...&tags=...&limit=...&minScore=...
  router.get("/", async (req, res, next) => {
    try {
      const q = req.query.q as string;
      if (!q) return res.status(400).json({ error: "Query parameter 'q' is required" });
      const results = await search({
        query: q,
        mode: (req.query.mode as any) || "vector",
        contentType: req.query.type as string | undefined,
        tags: req.query.tags ? (req.query.tags as string).split(",") : undefined,
        limit: parseInt(req.query.limit as string) || 10,
        minScore: req.query.minScore ? parseFloat(req.query.minScore as string) : undefined,
      }, { wsPath, embedder });
      res.json({ results, total: results.length });
    } catch (err) { next(err); }
  });

  return router;
}
```

- [ ] **Step 3: Register routes in server**

Update `packages/server/src/index.ts` to import and mount:
```typescript
app.use("/api/files", createFileRoutes(opts.wsPath, opts.embedder));
app.use("/api/search", createSearchRoutes(opts.wsPath, opts.embedder));
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/ packages/server/src/index.ts
git commit -m "feat(server): add file and search REST API routes"
```

---

## Task 3: REST API — Taxonomy, Projections, Usage Routes

**Files:**
- Create: `packages/server/src/routes/taxonomy.ts`
- Create: `packages/server/src/routes/projections.ts`
- Create: `packages/server/src/routes/usage.ts`
- Create: `packages/server/src/umap.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Install umap-js**

Run: `npm install umap-js` in project root (or add to server's package.json dependencies).

- [ ] **Step 2: Implement UMAP projection module**

```typescript
// packages/server/src/umap.ts
import { UMAP } from "umap-js";
import { readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { createDatabase, getFilesTable, queryFiles } from "@clawdrive/core";

export interface ProjectionPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  fileName: string;
  contentType: string;
  tags: string[];
}

export async function getProjections(wsPath: string): Promise<ProjectionPoint[]> {
  const cachePath = join(wsPath, "projections", "umap-cache.json");
  try {
    const cached = JSON.parse(await readFile(cachePath, "utf-8"));
    // Check if cache is stale (compare file count)
    const db = await createDatabase(join(wsPath, "db"));
    const table = await getFilesTable(db);
    const currentCount = await table.countRows();
    if (Math.abs(currentCount - cached.fileCount) / Math.max(currentCount, 1) < 0.1) {
      return cached.points;
    }
  } catch {}
  return recomputeProjections(wsPath);
}

export async function recomputeProjections(wsPath: string): Promise<ProjectionPoint[]> {
  const db = await createDatabase(join(wsPath, "db"));
  const table = await getFilesTable(db);
  const files = await queryFiles(table);

  if (files.length < 2) {
    // UMAP needs at least 2 points
    return files.map((f, i) => ({
      id: f.id,
      x: i, y: 0, z: 0,
      fileName: f.original_name,
      contentType: f.content_type,
      tags: f.tags,
    }));
  }

  // Extract vectors as number[][]
  const vectors = files.map(f => Array.from(f.vector));

  // Run UMAP to 3D
  const umap = new UMAP({ nComponents: 3, nNeighbors: Math.min(15, files.length - 1) });
  const embedding = umap.fit(vectors);

  const points: ProjectionPoint[] = files.map((f, i) => ({
    id: f.id,
    x: embedding[i][0],
    y: embedding[i][1],
    z: embedding[i][2],
    fileName: f.original_name,
    contentType: f.content_type,
    tags: f.tags,
  }));

  // Cache
  const cachePath = join(wsPath, "projections", "umap-cache.json");
  await writeFile(cachePath, JSON.stringify({ fileCount: files.length, points }));

  return points;
}
```

- [ ] **Step 3: Implement taxonomy route**

```typescript
// packages/server/src/routes/taxonomy.ts
// GET /api/taxonomy — returns full taxonomy tree
```

- [ ] **Step 4: Implement projections route**

```typescript
// packages/server/src/routes/projections.ts
// GET /api/projections — returns cached UMAP 3D coordinates
// POST /api/projections/recompute — triggers recomputation
```

- [ ] **Step 5: Implement usage route**

```typescript
// packages/server/src/routes/usage.ts
// GET /api/usage — returns token usage stats
```

- [ ] **Step 6: Register all routes in server**

- [ ] **Step 7: Build and verify**

- [ ] **Step 8: Commit**

```bash
git add packages/server/
git commit -m "feat(server): add taxonomy, projections, and usage routes"
```

---

## Task 4: Wire Server into CLI

**Files:**
- Create: `packages/cli/src/commands/serve.ts`
- Create: `packages/cli/src/commands/ui.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/package.json` (add @clawdrive/server dep)

- [ ] **Step 1: Add server dependency to CLI**

Add `"@clawdrive/server": "*"` to cli's package.json dependencies.

- [ ] **Step 2: Implement serve command**

```typescript
// packages/cli/src/commands/serve.ts
// clawdrive serve [--port <port>] [--host <host>]
// Creates embedder, calls createServer(), starts listening
// Prints URL to console
```

- [ ] **Step 3: Implement ui command**

```typescript
// packages/cli/src/commands/ui.ts
// clawdrive ui [--port <port>]
// Same as serve, but also opens browser
// Use child_process.exec("open <url>") / xdg-open / start
```

- [ ] **Step 4: Register commands, build, verify**

- [ ] **Step 5: Commit**

```bash
git add packages/cli/
git commit -m "feat(cli): add serve and ui commands"
```

---

## Task 5: Web Package Scaffolding

**Files:**
- Create: `packages/web/package.json`, `packages/web/tsconfig.json`, `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/src/main.tsx`, `packages/web/src/App.tsx`
- Create: `packages/web/src/api.ts`, `packages/web/src/types.ts`
- Create: `packages/web/src/styles/globals.css`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@clawdrive/web",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19",
    "react-dom": "^19",
    "@react-three/fiber": "^9",
    "@react-three/drei": "^10",
    "three": "^0.170"
  },
  "devDependencies": {
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/three": "^0.170",
    "@vitejs/plugin-react": "^4",
    "vite": "^6",
    "typescript": "^5.7"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:7432",
    },
  },
  build: {
    outDir: "dist",
  },
});
```

- [ ] **Step 3: Create index.html, main.tsx, App.tsx**

Basic React app with dark theme. App.tsx renders TopBar + content area (initially just a placeholder).

- [ ] **Step 4: Create api.ts**

Fetch wrapper for all API calls:
```typescript
const BASE = "/api";

export async function searchFiles(query: string, opts?: any) {
  const params = new URLSearchParams({ q: query, ...opts });
  const res = await fetch(`${BASE}/search?${params}`);
  return res.json();
}

export async function listFiles(opts?: any) { ... }
export async function getFile(id: string) { ... }
export async function getTaxonomy() { ... }
export async function getProjections() { ... }
export async function recomputeProjections() { ... }
```

- [ ] **Step 5: Create globals.css**

Dark theme: black background, white text, monospace font, minimal styling.

- [ ] **Step 6: Install, dev server test**

Run: `cd packages/web && npm install && npm run dev`
Verify: Vite dev server starts, page loads in browser.

- [ ] **Step 7: Commit**

```bash
git add packages/web/
git commit -m "feat(web): scaffold React + Vite frontend"
```

---

## Task 6: Top Bar & View Tabs

**Files:**
- Create: `packages/web/src/components/TopBar.tsx`
- Create: `packages/web/src/components/ViewTabs.tsx`
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 1: Implement TopBar**

Contains:
- ClawDrive logo/name (left)
- ViewTabs component (center-left)
- Search trigger button showing "Cmd+K Search" (right)
- File count + total size (far right)

Fetch file count from `/api/files?limit=1` on mount.

- [ ] **Step 2: Implement ViewTabs**

Toggle between "Agent View" and "Human View". Use React state in App.tsx, pass as prop.

Styling: pill-shaped toggle, active tab has background highlight.

- [ ] **Step 3: Wire into App.tsx**

App.tsx manages `activeView: "agent" | "human"` state. Renders TopBar + conditionally renders AgentView or HumanView (placeholders for now).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/
git commit -m "feat(web): add top bar and view tabs"
```

---

## Task 7: 3D Embedding Space (Agent View)

**Files:**
- Create: `packages/web/src/components/agent-view/EmbeddingSpace.tsx`
- Create: `packages/web/src/components/agent-view/PointCloud.tsx`
- Create: `packages/web/src/components/agent-view/ClusterLabels.tsx`
- Create: `packages/web/src/components/agent-view/HoverCard.tsx`
- Create: `packages/web/src/components/agent-view/useProjections.ts`

- [ ] **Step 1: Implement useProjections hook**

Fetches `/api/projections` on mount. Returns `{ points, loading, error, recompute }`. Caches in state.

- [ ] **Step 2: Implement EmbeddingSpace**

Uses `@react-three/fiber` Canvas:
```tsx
<Canvas camera={{ position: [0, 0, 50], fov: 60 }}>
  <ambientLight />
  <OrbitControls />
  <PointCloud points={points} onHover={setHovered} onClick={handleClick} />
  <ClusterLabels points={points} />
</Canvas>
```

- [ ] **Step 3: Implement PointCloud**

Uses `THREE.InstancedMesh` for performance. Each point is a small sphere. Color encodes content type:
- PDF: blue (#7dd3fc)
- Image: green (#86efac)
- Video: purple (#c084fc)
- Audio: yellow (#fbbf24)
- Text: red (#f87171)

On hover: scale up the point, show HoverCard.

- [ ] **Step 4: Implement ClusterLabels**

Run simple k-means (k=5-8) on the 3D projected coordinates. Place a `<Html>` label (from drei) at each cluster centroid. Labels are semi-transparent, uppercase, letter-spaced.

- [ ] **Step 5: Implement HoverCard**

Floating HTML overlay (drei `<Html>`) showing: filename, score, content type, file size, tags. Positioned near the hovered point.

- [ ] **Step 6: Test in dev mode**

Start both server and web dev:
```bash
clawdrive serve &
cd packages/web && npm run dev
```
Store a few files, verify 3D visualization works.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/agent-view/
git commit -m "feat(web): add 3D embedding space visualization"
```

---

## Task 8: Taxonomy Browser (Human View)

**Files:**
- Create: `packages/web/src/components/human-view/TaxonomyBrowser.tsx`
- Create: `packages/web/src/components/human-view/TaxonomySidebar.tsx`
- Create: `packages/web/src/components/human-view/FileGrid.tsx`
- Create: `packages/web/src/components/human-view/Breadcrumb.tsx`

- [ ] **Step 1: Implement TaxonomySidebar**

Fetches `/api/taxonomy`. Renders collapsible tree:
- Each node shows label + item count
- Click to select a node (highlights it, updates content area)
- Expand/collapse with triangle icon

- [ ] **Step 2: Implement FileGrid**

Fetches `/api/files?taxonomyPath=...` for the selected taxonomy node. Renders a grid of file cards:
- Icon based on content type (emoji: pdf, image, video, audio, text)
- Filename
- File size / page count / duration

- [ ] **Step 3: Implement Breadcrumb**

Shows current taxonomy path: "All > Research > Physics". Click any segment to navigate up.

- [ ] **Step 4: Implement TaxonomyBrowser**

Combines sidebar + breadcrumb + file grid in a flex layout (sidebar 240px, main content fills rest).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/human-view/
git commit -m "feat(web): add taxonomy browser with sidebar and file grid"
```

---

## Task 9: Spotlight Search

**Files:**
- Create: `packages/web/src/components/SpotlightSearch.tsx`
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 1: Implement SpotlightSearch**

Modal overlay triggered by Cmd+K (Mac) / Ctrl+K (Windows/Linux):
- Full-width search input at top
- Debounced API call (300ms) to `/api/search?q=...` as user types
- Results list below input:
  - File icon (emoji by content type)
  - Filename + chunk label
  - Taxonomy path (dim)
  - Score (green/yellow colored)
- Keyboard navigation: arrow keys to move, Enter to open, Escape to close
- Click result to navigate to file (or open preview)

- [ ] **Step 2: Wire keyboard shortcut into App.tsx**

Add `useEffect` with keydown listener for Cmd+K / Ctrl+K. Toggle spotlight visibility state.

- [ ] **Step 3: Style the overlay**

Dark semi-transparent backdrop. Centered card (560px wide) with search input + results. Rounded corners, subtle border, blur backdrop.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/SpotlightSearch.tsx packages/web/src/App.tsx
git commit -m "feat(web): add spotlight search with Cmd+K shortcut"
```

---

## Task 10: Build Integration & Polish

**Files:**
- Modify: `packages/server/src/index.ts` (serve static build)
- Modify: `packages/cli/src/commands/serve.ts` (point to web dist)
- Modify: root `package.json` (add build:web script)

- [ ] **Step 1: Configure server to serve web build**

The server already has `staticDir` support. When `clawdrive serve` runs, pass `staticDir` pointing to `packages/web/dist/`. The server serves the SPA with client-side routing fallback.

- [ ] **Step 2: Add build:web script**

Root package.json:
```json
"scripts": {
  "build:web": "cd packages/web && npm run build"
}
```

- [ ] **Step 3: Build everything end-to-end**

```bash
npm run build        # build core + cli + server
npm run build:web    # build web UI
```

- [ ] **Step 4: Test full flow**

```bash
clawdrive serve
# Open http://localhost:7432
# Verify: top bar, view tabs, 3D view, taxonomy browser, spotlight search
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: ClawDrive v1 server + web UI complete"
```
