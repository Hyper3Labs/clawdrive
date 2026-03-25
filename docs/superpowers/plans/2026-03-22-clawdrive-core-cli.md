# ClawDrive Core + CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working CLI tool that stores multimodal files with Gemini Embedding 2 and retrieves them via semantic search.

**Architecture:** TypeScript monorepo with `packages/core` (business logic) and `packages/cli` (thin shell). Core handles embedding, storage (LanceDB), chunking, taxonomy, and config. CLI calls core functions and formats output. All commands support `--json` for agent consumption.

**Tech Stack:** TypeScript, @lancedb/lancedb, @google/genai, commander, zod, vitest, npm workspaces + turbo

**Spec:** `docs/superpowers/specs/2026-03-22-clawdrive-v1-design.md`

**2026-03-25 Alignment Update:** Keep the first multimodal pass tightly aligned with the Gemini Embedding 2 docs: one shared 3072-d embedding space, `RETRIEVAL_DOCUMENT` for indexed corpus items, `RETRIEVAL_QUERY` for search queries, native media bytes or Files API handles for non-text inputs, and parent vectors built from aggregated child embeddings. Video transcript enrichment is explicitly deferred; this plan only uses Gemini's native video embeddings.

---

## File Structure

```
clawdrive/
├── package.json                          # npm workspaces root
├── turbo.json                            # build orchestration
├── tsconfig.json                         # project references
├── vitest.workspace.ts                   # vitest workspace config
│
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                  # public API barrel export
│   │       ├── types.ts                  # shared types (StoreInput, SearchResult, FileRecord, etc.)
│   │       ├── config.ts                 # Zod-validated config + API key resolution
│   │       ├── workspace.ts              # workspace path resolution + init
│   │       ├── lock.ts                   # file-based advisory lock
│   │       ├── storage/
│   │       │   ├── db.ts                 # LanceDB wrapper, table creation, migrations
│   │       │   └── files.ts              # disk file ops: copy, hard-link, hash, delete
│   │       ├── embedding/
│   │       │   ├── types.ts              # EmbeddingProvider interface, EmbedInput, TaskType
│   │       │   ├── gemini.ts             # Gemini Embedding 2 implementation with retry
│   │       │   └── mock.ts              # deterministic mock for tests
│   │       ├── chunker/
│   │       │   ├── types.ts              # Chunk type, ChunkerResult
│   │       │   ├── detect.ts             # MIME detection + chunker selection
│   │       │   ├── pdf.ts                # split PDF into 6-page segments
│   │       │   ├── video.ts              # split video into 120s segments
│   │       │   ├── audio.ts              # split audio into 80s segments
│   │       │   └── text.ts               # structure-preserving text splitter
│   │       ├── store.ts                  # store() + storeBatch() pipeline
│   │       ├── search.ts                 # search() — vector, fts, hybrid
│   │       ├── read.ts                   # read(), info(), export()
│   │       ├── manage.ts                 # remove(), update(), gc(), doctor(), usage()
│   │       └── taxonomy.ts               # auto-organize: assign, split, merge, rebuild
│   │
│   ├── core/tests/
│   │   ├── config.test.ts
│   │   ├── workspace.test.ts
│   │   ├── storage/
│   │   │   ├── db.test.ts
│   │   │   └── files.test.ts
│   │   ├── embedding/
│   │   │   └── mock.test.ts
│   │   ├── chunker/
│   │   │   ├── text.test.ts
│   │   │   ├── pdf.test.ts
│   │   │   └── detect.test.ts
│   │   ├── store.test.ts
│   │   ├── search.test.ts
│   │   ├── manage.test.ts
│   │   └── helpers.ts                    # createTestWorkspace(), fixtures
│   │
│   └── cli/
│       ├── package.json
│       ├── tsconfig.json
│       ├── bin/
│       │   └── clawdrive.ts              # #!/usr/bin/env node entry point
│       └── src/
│           ├── index.ts                  # commander program setup
│           ├── commands/
│           │   ├── store.ts
│           │   ├── search.ts
│           │   ├── read.ts
│           │   ├── info.ts
│           │   ├── rm.ts
│           │   ├── update.ts
│           │   ├── export.ts
│           │   ├── open.ts
│           │   ├── ls.ts
│           │   ├── tree.ts
│           │   ├── import.ts
│           │   ├── config.ts
│           │   ├── doctor.ts
│           │   ├── gc.ts
│           │   └── usage.ts
│           └── formatters/
│               ├── json.ts               # --json output
│               └── human.ts              # colored human-readable output
```

---

## Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json`, `turbo.json`, `tsconfig.json`, `vitest.workspace.ts`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize root package.json with workspaces**

```json
{
  "name": "clawdrive",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "dev": "turbo dev"
  },
  "devDependencies": {
    "turbo": "^2",
    "typescript": "^5.7",
    "vitest": "^3"
  }
}
```

- [ ] **Step 2: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

- [ ] **Step 3: Create root tsconfig.json with project references**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "references": [
    { "path": "packages/core" },
    { "path": "packages/cli" }
  ]
}
```

- [ ] **Step 4: Create packages/core/package.json**

```json
{
  "name": "@clawdrive/core",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@google/genai": "^1",
    "@lancedb/lancedb": "^0.15",
    "apache-arrow": "^18",
    "proper-lockfile": "^4",
    "uuidv7": "^1",
    "zod": "^3"
  },
  "devDependencies": {
    "vitest": "^3",
    "@types/proper-lockfile": "^4",
    "@types/proper-lockfile": "^4"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 5: Create packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 6: Create packages/cli/package.json**

```json
{
  "name": "clawdrive",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "clawdrive": "dist/bin/clawdrive.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@clawdrive/core": "*",
    "commander": "^13",
    "chalk": "^5",
    "ora": "^8"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 7: Create packages/cli/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*", "bin/**/*"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Step 8: Create vitest.workspace.ts**

```typescript
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/core",
]);
```

- [ ] **Step 9: Update .gitignore**

Add `node_modules/`, `dist/`, `.superpowers/` to `.gitignore`.

- [ ] **Step 10: Install dependencies and verify build**

Run: `npm install && npm run build`
Expected: Clean build with no errors, `packages/core/dist/` and `packages/cli/dist/` created.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold monorepo with core and cli packages"
```

---

## Task 2: Types & Config

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/config.ts`
- Test: `packages/core/tests/config.test.ts`

- [ ] **Step 1: Write failing test for config loading**

```typescript
// packages/core/tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, resolveApiKey } from "../src/config.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadConfig", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "clawdrive-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it("returns defaults when no config file exists", async () => {
    const config = await loadConfig(join(dir, "config.json"));
    expect(config.version).toBe(1);
    expect(config.default_workspace).toBe("default");
    expect(config.embedding.model).toBe("gemini-embedding-2-preview");
    expect(config.embedding.dimensions).toBe(3072);
    expect(config.store.concurrency).toBe(3);
  });

  it("merges partial config with defaults", async () => {
    await writeFile(
      join(dir, "config.json"),
      JSON.stringify({ gemini_api_key: "test-key", store: { concurrency: 5 } })
    );
    const config = await loadConfig(join(dir, "config.json"));
    expect(config.gemini_api_key).toBe("test-key");
    expect(config.store.concurrency).toBe(5);
    expect(config.embedding.model).toBe("gemini-embedding-2-preview");
  });

  it("rejects invalid config values", async () => {
    await writeFile(
      join(dir, "config.json"),
      JSON.stringify({ store: { concurrency: "not-a-number" } })
    );
    await expect(loadConfig(join(dir, "config.json"))).rejects.toThrow();
  });
});

describe("resolveApiKey", () => {
  it("prefers env var over config", () => {
    const key = resolveApiKey("env-key", "config-key");
    expect(key).toBe("env-key");
  });

  it("falls back to config when no env var", () => {
    const key = resolveApiKey(undefined, "config-key");
    expect(key).toBe("config-key");
  });

  it("returns undefined when neither exists", () => {
    const key = resolveApiKey(undefined, undefined);
    expect(key).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/config.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write types.ts**

```typescript
// packages/core/src/types.ts

export type TaskType =
  | "RETRIEVAL_DOCUMENT"
  | "RETRIEVAL_QUERY"
  | "CODE_RETRIEVAL_QUERY"
  | "CLUSTERING";

export type FileStatus = "pending" | "embedded" | "failed";

export interface FileRecord {
  id: string;
  vector: Float32Array;
  original_name: string;
  content_type: string;
  file_path: string;
  file_hash: string;
  file_size: number;
  description: string | null;
  tags: string[];
  taxonomy_path: string[];
  embedding_model: string;
  task_type: TaskType;
  searchable_text: string | null;
  parent_id: string | null;
  chunk_index: number | null;
  chunk_label: string | null;
  status: FileStatus;
  error_message: string | null;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
  source_url: string | null;
}

export interface StoreInput {
  sourcePath: string;
  tags?: string[];
  description?: string;
  workspaceId?: string;
  sourceUrl?: string;
}

export interface StoreResult {
  id: string;
  fileHash: string;
  status: "stored" | "duplicate";
  duplicateId?: string;
  chunks: number;
  tokensUsed: number;
}

export interface SearchInput {
  query?: string;
  queryImage?: string; // path to image file; image-only and text+image queries are both allowed
  mode?: "vector" | "fts" | "hybrid";
  contentType?: string;
  tags?: string[];
  after?: Date;
  before?: Date;
  limit?: number;
  minScore?: number;
}

export interface SearchResult {
  id: string;
  score: number;
  file: string;
  contentType: string;
  fileSize: number;
  tags: string[];
  taxonomyPath: string[];
  matchedChunk?: {
    index: number;
    label: string;
  };
  totalChunks: number;
  filePath: string;
  description: string | null;
}

export interface TaxonomyNode {
  id: string;
  label: string;
  parentId: string | null;
  centroidVector: Float32Array;
  itemCount: number;
}
```

- [ ] **Step 4: Write config.ts**

```typescript
// packages/core/src/config.ts
import { z } from "zod";
import { readFile, writeFile, chmod } from "node:fs/promises";

export const ConfigSchema = z.object({
  version: z.number().default(1),
  gemini_api_key: z.string().optional(),
  default_workspace: z.string().default("default"),
  embedding: z.object({
    model: z.string().default("gemini-embedding-2-preview"),
    dimensions: z.literal(3072).default(3072),
  }).default({}),
  store: z.object({
    concurrency: z.number().default(3),
    fail_on_duplicate: z.boolean().default(false),
    chunk_sizes: z.object({
      pdf_pages: z.number().default(6),
      video_seconds: z.number().default(120),
      audio_seconds: z.number().default(80),
      text_tokens: z.number().default(8192),
    }).default({}),
  }).default({}),
  serve: z.object({
    port: z.number().default(7432),
    host: z.string().default("127.0.0.1"),
  }).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

export async function loadConfig(path: string): Promise<Config> {
  let raw: unknown = {};
  try {
    const content = await readFile(path, "utf-8");
    raw = JSON.parse(content);
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
  }
  return ConfigSchema.parse(raw);
}

export async function saveConfig(path: string, config: Config): Promise<void> {
  await writeFile(path, JSON.stringify(config, null, 2));
  await chmod(path, 0o600);
}

export function resolveApiKey(
  envKey: string | undefined,
  configKey: string | undefined
): string | undefined {
  return envKey ?? configKey;
}
```

- [ ] **Step 5: Create barrel export**

```typescript
// packages/core/src/index.ts
export * from "./types.js";
export * from "./config.js";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run tests/config.test.ts`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/config.ts packages/core/src/index.ts packages/core/tests/config.test.ts
git commit -m "feat(core): add types and config with Zod validation"
```

---

## Task 3: Workspace & Lock

**Files:**
- Create: `packages/core/src/workspace.ts`
- Create: `packages/core/src/lock.ts`
- Test: `packages/core/tests/workspace.test.ts`

- [ ] **Step 1: Write failing test for workspace resolution**

```typescript
// packages/core/tests/workspace.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initWorkspace, resolveWorkspacePath } from "../src/workspace.js";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("workspace", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "clawdrive-ws-"));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true });
  });

  it("resolves default workspace path", () => {
    const path = resolveWorkspacePath(baseDir, "default");
    expect(path).toBe(join(baseDir, "workspaces", "default"));
  });

  it("initializes workspace directories", async () => {
    const wsPath = resolveWorkspacePath(baseDir, "default");
    await initWorkspace(wsPath);
    const dbStat = await stat(join(wsPath, "db"));
    expect(dbStat.isDirectory()).toBe(true);
    const filesStat = await stat(join(wsPath, "files"));
    expect(filesStat.isDirectory()).toBe(true);
  });

  it("sets 700 permissions on workspace dir", async () => {
    const wsPath = resolveWorkspacePath(baseDir, "test");
    await initWorkspace(wsPath);
    const s = await stat(wsPath);
    expect(s.mode & 0o777).toBe(0o700);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/workspace.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement workspace.ts and lock.ts**

```typescript
// packages/core/src/workspace.ts
import { mkdir, chmod } from "node:fs/promises";
import { join } from "node:path";

export function resolveWorkspacePath(baseDir: string, name: string): string {
  return join(baseDir, "workspaces", name);
}

export async function initWorkspace(wsPath: string): Promise<void> {
  await mkdir(join(wsPath, "db"), { recursive: true });
  await mkdir(join(wsPath, "files"), { recursive: true });
  await mkdir(join(wsPath, "projections"), { recursive: true });
  await chmod(wsPath, 0o700);
}
```

```typescript
// packages/core/src/lock.ts
import lockfile from "proper-lockfile";
import { join } from "node:path";

export async function acquireLock(wsPath: string): Promise<() => Promise<void>> {
  const lockPath = join(wsPath, "db");
  const release = await lockfile.lock(lockPath, {
    retries: { retries: 5, minTimeout: 200, maxTimeout: 5000 },
    stale: 30000,
  });
  return release;
}
```

- [ ] **Step 4: Update index.ts exports**

Add: `export * from "./workspace.js";` and `export * from "./lock.js";`

- [ ] **Step 5: Run tests**

Run: `cd packages/core && npx vitest run tests/workspace.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/workspace.ts packages/core/src/lock.ts packages/core/src/index.ts packages/core/tests/workspace.test.ts
git commit -m "feat(core): add workspace resolution and file locking"
```

---

## Task 4: Storage Layer (LanceDB + File Ops)

**Files:**
- Create: `packages/core/src/storage/db.ts`
- Create: `packages/core/src/storage/files.ts`
- Test: `packages/core/tests/storage/db.test.ts`
- Test: `packages/core/tests/storage/files.test.ts`
- Create: `packages/core/tests/helpers.ts`

- [ ] **Step 1: Write test helpers**

```typescript
// packages/core/tests/helpers.ts
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initWorkspace, resolveWorkspacePath } from "../src/workspace.js";

export async function createTestWorkspace() {
  const baseDir = await mkdtemp(join(tmpdir(), "clawdrive-test-"));
  const wsPath = resolveWorkspacePath(baseDir, "test");
  await initWorkspace(wsPath);
  return {
    baseDir,
    wsPath,
    dbPath: join(wsPath, "db"),
    filesPath: join(wsPath, "files"),
    cleanup: () => rm(baseDir, { recursive: true }),
  };
}
```

- [ ] **Step 2: Write failing test for db.ts**

```typescript
// packages/core/tests/storage/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, getFilesTable, insertFileRecord, queryFiles } from "../../src/storage/db.js";
import { createTestWorkspace } from "../helpers.js";

describe("database", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;

  beforeEach(async () => { ctx = await createTestWorkspace(); });
  afterEach(async () => { await ctx.cleanup(); });

  it("creates database and files table", async () => {
    const db = await createDatabase(ctx.dbPath);
    const table = await getFilesTable(db);
    expect(table).toBeDefined();
    const count = await table.countRows();
    expect(count).toBe(0);
  });

  it("inserts and retrieves a file record", async () => {
    const db = await createDatabase(ctx.dbPath);
    const table = await getFilesTable(db);
    const record = {
      id: "test-id-001",
      vector: new Float32Array(3072).fill(0.1),
      original_name: "test.txt",
      content_type: "text/plain",
      file_path: "2026-03/test-id-001.txt",
      file_hash: "abc123",
      file_size: 1024,
      description: null,
      tags: ["test"],
      taxonomy_path: [],
      embedding_model: "gemini-embedding-2-preview",
      task_type: "RETRIEVAL_DOCUMENT",
      searchable_text: "test content",
      parent_id: null,
      chunk_index: null,
      chunk_label: null,
      status: "embedded",
      error_message: null,
      deleted_at: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      source_url: null,
    };
    await insertFileRecord(table, record);
    const rows = await queryFiles(table);
    expect(rows).toHaveLength(1);
    expect(rows[0].original_name).toBe("test.txt");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/storage/db.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement db.ts**

Implement `createDatabase()`, `getFilesTable()`, `insertFileRecord()`, `queryFiles()` using `@lancedb/lancedb`. Create the files table with the full schema from the spec. Handle table creation on first use. Use `apache-arrow` `Schema` for explicit table definition.

**Important:** LanceDB stores vectors as Arrow `FixedSizeList<Float32>`. When reading back, convert to `Float32Array` in the read path. Add a `toFileRecord()` helper that converts raw LanceDB rows to `FileRecord` type.

Also create a `_meta` table with a single row containing `schema_version: number`. On `createDatabase()`, check the version and run migrations if needed. Start at version 1.

Check @context7 for LanceDB TypeScript SDK docs for correct API usage.

- [ ] **Step 5: Run db test**

Run: `cd packages/core && npx vitest run tests/storage/db.test.ts`
Expected: PASS.

- [ ] **Step 6: Write failing test for files.ts**

```typescript
// packages/core/tests/storage/files.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { storeFile, hashFile, removeFile } from "../../src/storage/files.js";
import { createTestWorkspace } from "../helpers.js";
import { writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

describe("file storage", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;

  beforeEach(async () => { ctx = await createTestWorkspace(); });
  afterEach(async () => { await ctx.cleanup(); });

  it("hashes a file with SHA-256", async () => {
    const src = join(ctx.baseDir, "input.txt");
    await writeFile(src, "hello world");
    const hash = await hashFile(src);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("copies file to workspace files dir", async () => {
    const src = join(ctx.baseDir, "input.txt");
    await writeFile(src, "hello world");
    const destPath = await storeFile(src, ctx.filesPath, "test-id", ".txt");
    const s = await stat(destPath);
    expect(s.isFile()).toBe(true);
  });

  it("removes file from workspace", async () => {
    const src = join(ctx.baseDir, "input.txt");
    await writeFile(src, "hello world");
    const destPath = await storeFile(src, ctx.filesPath, "test-id", ".txt");
    await removeFile(destPath);
    await expect(stat(destPath)).rejects.toThrow();
  });
});
```

- [ ] **Step 7: Implement files.ts**

Implement `hashFile()` (SHA-256 via `node:crypto`), `storeFile()` (try hard link via `fs.link()`, fall back to `fs.copyFile()`), `removeFile()` (unlink). Organize by `<yyyy-mm>/<id>.<ext>` subdirectory.

- [ ] **Step 8: Run files test**

Run: `cd packages/core && npx vitest run tests/storage/files.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/storage/ packages/core/tests/storage/ packages/core/tests/helpers.ts
git commit -m "feat(core): add LanceDB storage and file management"
```

---

## Task 5: Embedding Layer

**Files:**
- Create: `packages/core/src/embedding/types.ts`
- Create: `packages/core/src/embedding/gemini.ts`
- Create: `packages/core/src/embedding/mock.ts`
- Test: `packages/core/tests/embedding/mock.test.ts`

- [ ] **Step 1: Write failing test for mock embedder**

```typescript
// packages/core/tests/embedding/mock.test.ts
import { describe, it, expect } from "vitest";
import { MockEmbeddingProvider } from "../../src/embedding/mock.js";

describe("MockEmbeddingProvider", () => {
  const provider = new MockEmbeddingProvider(3072);

  it("returns a vector of correct dimensions", async () => {
    const result = await provider.embed({
      parts: [{ kind: "text", text: "hello" }],
      taskType: "RETRIEVAL_DOCUMENT",
      title: "hello.md",
    });
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(3072);
  });

  it("returns deterministic vectors for same input", async () => {
    const a = await provider.embed({
      parts: [{ kind: "text", text: "hello" }],
      taskType: "RETRIEVAL_DOCUMENT",
    });
    const b = await provider.embed({
      parts: [{ kind: "text", text: "hello" }],
      taskType: "RETRIEVAL_DOCUMENT",
    });
    expect(a).toEqual(b);
  });

  it("returns different vectors for different inputs", async () => {
    const a = await provider.embed({
      parts: [{ kind: "text", text: "hello" }],
      taskType: "RETRIEVAL_DOCUMENT",
    });
    const b = await provider.embed({
      parts: [{ kind: "text", text: "world" }],
      taskType: "RETRIEVAL_DOCUMENT",
    });
    expect(a).not.toEqual(b);
  });

  it("handles binary input", async () => {
    const result = await provider.embed({
      parts: [{ kind: "inlineData", data: Buffer.from("image data"), mimeType: "image/png" }],
      taskType: "RETRIEVAL_DOCUMENT",
      title: "diagram.png",
    });
    expect(result.length).toBe(3072);
  });

  it("handles combined text plus image input", async () => {
    const result = await provider.embed({
      parts: [
        { kind: "text", text: "system architecture" },
        { kind: "inlineData", data: Buffer.from("image data"), mimeType: "image/png" },
      ],
      taskType: "RETRIEVAL_QUERY",
    });
    expect(result.length).toBe(3072);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/embedding/mock.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement embedding types**

```typescript
// packages/core/src/embedding/types.ts
import type { TaskType } from "../types.js";

export type EmbedPart =
  | { kind: "text"; text: string }
  | { kind: "inlineData"; data: Buffer; mimeType: string }
  | { kind: "fileUri"; uri: string; mimeType: string };

export interface EmbedInput {
  parts: EmbedPart[];
  taskType: TaskType;
  title?: string;
}

export interface EmbeddingProvider {
  embed(input: EmbedInput): Promise<Float32Array>;
  readonly modelId: string;
  readonly dimensions: number;
}
```

- [ ] **Step 4: Implement mock.ts**

Use `node:crypto` `createHash("sha256")` to derive a deterministic seed from input, then generate a pseudo-random `Float32Array` from that seed. Normalize the vector to unit length.

- [ ] **Step 5: Implement gemini.ts**

Use `@google/genai` SDK. Implement `GeminiEmbeddingProvider` class:
- Constructor takes API key, model ID, dimensions
- `embed()` builds one Gemini embedding request from the ordered `parts` array and calls `client.models.embedContent()`
- For text parts: pass the text directly
- For smaller binary parts: pass inline data with mimeType
- For larger or reused binary inputs: upload with the Files API and pass a file URI part instead of forcing inline upload
- Pass `taskType`, `outputDimensionality: 3072`, and `title` for `RETRIEVAL_DOCUMENT` inputs when available
- Multiple parts in one request must produce one combined embedding so text+image queries stay aligned with the Gemini docs
- Add exponential backoff retry wrapper (3 retries, 1s/2s/4s + jitter)
- 5-minute timeout on HTTP calls
- Do not add transcript extraction for video in this pass; video uses Gemini's native video embedding path only

Check @context7 for `@google/genai` SDK docs for correct embedding API usage.

- [ ] **Step 6: Run tests**

Run: `cd packages/core && npx vitest run tests/embedding/mock.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/embedding/ packages/core/tests/embedding/
git commit -m "feat(core): add embedding layer with Gemini and mock providers"
```

---

## Task 6: Chunkers

**Files:**
- Create: `packages/core/src/chunker/types.ts`
- Create: `packages/core/src/chunker/detect.ts`
- Create: `packages/core/src/chunker/text.ts`
- Create: `packages/core/src/chunker/pdf.ts`
- Create: `packages/core/src/chunker/video.ts`
- Create: `packages/core/src/chunker/audio.ts`
- Test: `packages/core/tests/chunker/text.test.ts`
- Test: `packages/core/tests/chunker/detect.test.ts`

- [ ] **Step 1: Write failing test for text chunker**

```typescript
// packages/core/tests/chunker/text.test.ts
import { describe, it, expect } from "vitest";
import { chunkText } from "../../src/chunker/text.js";

describe("chunkText", () => {
  it("returns single chunk for small text", () => {
    const chunks = chunkText("Hello world", { maxTokens: 8192, minTokens: 512 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Hello world");
    expect(chunks[0].label).toBe("full");
  });

  it("splits by headings", () => {
    const text = "# Intro\nSome text\n\n## Methods\nMore text\n\n## Results\nFinal text";
    const chunks = chunkText(text, { maxTokens: 20, minTokens: 5 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some(c => c.label.includes("Methods"))).toBe(true);
  });

  it("merges small sections", () => {
    const text = "# A\nTiny\n\n# B\nAlso tiny";
    const chunks = chunkText(text, { maxTokens: 8192, minTokens: 512 });
    expect(chunks).toHaveLength(1); // merged because both are under minTokens
  });

  it("prepends contextual prefix", () => {
    const text = "# Intro\nSome text\n\n## Methods\nLong methods section...".repeat(50);
    const chunks = chunkText(text, { maxTokens: 100, minTokens: 10, fileName: "paper.md" });
    expect(chunks[0].text).toContain("[File: paper.md");
  });
});
```

- [ ] **Step 2: Write failing test for MIME detection**

```typescript
// packages/core/tests/chunker/detect.test.ts
import { describe, it, expect } from "vitest";
import { detectMimeType, selectChunker } from "../../src/chunker/detect.js";

describe("detectMimeType", () => {
  it("detects PDF", () => {
    expect(detectMimeType("paper.pdf")).toBe("application/pdf");
  });
  it("detects PNG", () => {
    expect(detectMimeType("diagram.png")).toBe("image/png");
  });
  it("detects MP4", () => {
    expect(detectMimeType("lecture.mp4")).toBe("video/mp4");
  });
  it("detects markdown", () => {
    expect(detectMimeType("notes.md")).toBe("text/markdown");
  });
});

describe("selectChunker", () => {
  it("selects pdf chunker for PDFs", () => {
    expect(selectChunker("application/pdf")).toBe("pdf");
  });
  it("selects text chunker for markdown", () => {
    expect(selectChunker("text/markdown")).toBe("text");
  });
  it("selects video chunker for MP4", () => {
    expect(selectChunker("video/mp4")).toBe("video");
  });
  it("selects none for single images", () => {
    expect(selectChunker("image/png")).toBe("none");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run tests/chunker/`
Expected: FAIL.

- [ ] **Step 4: Implement chunker types**

```typescript
// packages/core/src/chunker/types.ts
export interface Chunk {
  index: number;
  label: string;       // "pages 1-6", "Section: Methods", "0:00-2:00"
  text?: string;       // for text chunks
  data?: Buffer;       // for inline binary chunks
  filePath?: string;   // for temporary media files used with Gemini Files API
  mimeType?: string;   // for binary chunks
}

export interface ChunkOptions {
  maxTokens?: number;
  minTokens?: number;
  fileName?: string;
  pdfPages?: number;
  videoSeconds?: number;
  audioSeconds?: number;
}
```

- [ ] **Step 5: Implement detect.ts**

Use file extension mapping for MIME detection. Map MIME types to chunker names: `pdf` → "pdf", `video/*` → "video", `audio/*` → "audio", `text/*` → "text", `image/*` → "none".

- [ ] **Step 6: Implement text.ts**

Structure-preserving text splitter:
1. Split by markdown headings (`## `, `### `, etc.)
2. Estimate token count (chars / 4 as rough approximation)
3. Merge adjacent sections below `minTokens`
4. Split sections above `maxTokens` by paragraph boundaries (`\n\n`)
5. Prepend contextual prefix `[File: name | Section: heading | N of M]` when `fileName` is provided

- [ ] **Step 7: Implement pdf.ts, video.ts, audio.ts**

These chunkers must produce actual binary segments or temporary media files — the Gemini Embedding API requires real media inputs, not page/time range metadata.

- **pdf.ts**: Use `pdf-lib` (`npm install pdf-lib`) to split a PDF into 6-page segment files. Each chunk returns a `Buffer` containing a valid PDF with just those pages, plus `mimeType: "application/pdf"` and `label: "pages 1-6"`.
- **video.ts**: Use `ffmpeg` (via `child_process.execFile`) to split video into 120s segments. Command: `ffmpeg -i input.mp4 -ss START -t 120 -c copy segment.mp4`. Each chunk returns the segment `filePath`, `mimeType`, and `label: "0:00-2:00"`.
- **audio.ts**: Use `ffmpeg` to split audio into 80s segments. Command: `ffmpeg -i input.mp3 -ss START -t 80 -c copy segment.mp3`. Each chunk returns the segment `filePath`, `mimeType`, and `label: "0:00-1:20"`.

For images, there is still no chunker: the store pipeline should embed the original image as one native-media chunk. Normalize unsupported image formats to PNG or JPEG before embedding. Normalize unsupported audio/video containers to Gemini-supported formats before embedding, and use Files API fallback for large media instead of forcing inline upload.

Video transcript extraction is explicitly out of scope for this task. The first pass only uses Gemini's native video embeddings.

Add `pdf-lib` to `packages/core/package.json` dependencies. ffmpeg is a system dependency (document in README that it's required for video/audio support).

- [ ] **Step 8: Run tests**

Run: `cd packages/core && npx vitest run tests/chunker/`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/chunker/ packages/core/tests/chunker/
git commit -m "feat(core): add text chunker and MIME detection"
```

---

## Task 7: Store Pipeline

**Files:**
- Create: `packages/core/src/store.ts`
- Test: `packages/core/tests/store.test.ts`

- [ ] **Step 1: Write failing test for store**

```typescript
// packages/core/tests/store.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { store } from "../src/store.js";
import { createTestWorkspace } from "./helpers.js";
import { MockEmbeddingProvider } from "../src/embedding/mock.js";
import { createDatabase, getFilesTable, queryFiles } from "../src/storage/db.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

describe("store", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let embedder: MockEmbeddingProvider;

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    embedder = new MockEmbeddingProvider(3072);
  });
  afterEach(async () => { await ctx.cleanup(); });

  it("stores a text file and returns result", async () => {
    const src = join(ctx.baseDir, "test.md");
    await writeFile(src, "# Hello\n\nThis is a test document.");
    const result = await store({
      sourcePath: src,
      tags: ["test"],
      description: "A test file",
    }, { wsPath: ctx.wsPath, embedder });
    expect(result.status).toBe("stored");
    expect(result.id).toBeDefined();
    expect(result.chunks).toBeGreaterThanOrEqual(1);
  });

  it("detects duplicates by hash", async () => {
    const src = join(ctx.baseDir, "test.md");
    await writeFile(src, "duplicate content");
    const r1 = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    const r2 = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    expect(r1.status).toBe("stored");
    expect(r2.status).toBe("duplicate");
    expect(r2.duplicateId).toBe(r1.id);
  });

  it("sets status to embedded on success", async () => {
    const src = join(ctx.baseDir, "test.txt");
    await writeFile(src, "content");
    await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    const db = await createDatabase(join(ctx.wsPath, "db"));
    const table = await getFilesTable(db);
    const rows = await queryFiles(table);
    expect(rows[0].status).toBe("embedded");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Add focused failing tests for non-text ingestion as part of this task as well: image/PDF/audio/video inputs should assert that `store()` sends native media chunks into the embedder instead of collapsing those files into metadata text, and parent-vector tests should assert that the stored parent vector is the normalized average of all child vectors.

Run: `cd packages/core && npx vitest run tests/store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement store.ts**

Implement the store pipeline from the spec:
1. Hash file → check duplicate
2. Generate UUID v7 for id
3. Insert pending row (acquire lock, insert, release lock)
4. Copy file to workspace (hard-link or copy)
5. Detect MIME → select chunker → split into chunks, or treat a single image as one native-media chunk
6. Build Gemini inputs for each chunk and embed with `taskType: RETRIEVAL_DOCUMENT`
  - text/code chunks: one text part with contextual prefix
  - image/PDF/audio/video chunks: native bytes or Files API handles, never metadata-text fallback
  - pass `title` from the original filename when available
7. Insert child rows for chunks (acquire lock, insert, release lock), recording `embedding_model` and `task_type` on every row
8. Update parent row to "embedded" with the normalized average of child vectors, not the first chunk vector
9. Populate `searchable_text` for FTS only (full text for text files, filename+desc+tags+chunk labels for binary)
10. Log usage
11. Return StoreResult

Lock scope: acquire lock for the initial duplicate-check + pending-row-insert (these must be atomic to prevent race conditions). Release lock. Embed chunks without lock. Re-acquire lock for inserting child rows and updating parent to "embedded". Release lock.

Video transcript enrichment is deferred. Do not extract transcript text or create a second text embedding for video in this task.

- [ ] **Step 4: Run tests**

Run: `cd packages/core && npx vitest run tests/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement storeBatch()**

Add `storeBatch(inputs: StoreInput[], opts)` that processes multiple files with `p-limit` (add `p-limit` to dependencies) capping concurrency at `config.store.concurrency` (default: 3). Calls `store()` for each file. After all files are processed, rebuilds the FTS index. Returns `StoreResult[]`.

- [ ] **Step 6: Run tests**

Run: `cd packages/core && npx vitest run tests/store.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/store.ts packages/core/tests/store.test.ts
git commit -m "feat(core): implement store pipeline with dedup and chunking"
```

---

## Task 8: Search Pipeline

**Files:**
- Create: `packages/core/src/search.ts`
- Test: `packages/core/tests/search.test.ts`

- [ ] **Step 1: Write failing test for search**

```typescript
// packages/core/tests/search.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { search } from "../src/search.js";
import { store } from "../src/store.js";
import { createTestWorkspace } from "./helpers.js";
import { MockEmbeddingProvider } from "../src/embedding/mock.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

describe("search", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let embedder: MockEmbeddingProvider;

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    embedder = new MockEmbeddingProvider(3072);
    // Store some test files
    const f1 = join(ctx.baseDir, "ml-paper.md");
    await writeFile(f1, "# Machine Learning\n\nNeural networks are powerful.");
    await store({ sourcePath: f1, tags: ["ml"] }, { wsPath: ctx.wsPath, embedder });

    const f2 = join(ctx.baseDir, "recipe.md");
    await writeFile(f2, "# Chocolate Cake\n\nMix flour and cocoa.");
    await store({ sourcePath: f2, tags: ["cooking"] }, { wsPath: ctx.wsPath, embedder });
  });
  afterEach(async () => { await ctx.cleanup(); });

  it("returns results ranked by similarity", async () => {
    const results = await search(
      { query: "machine learning", limit: 10 },
      { wsPath: ctx.wsPath, embedder }
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeDefined();
    expect(results[0].file).toBeDefined();
  });

  it("filters by tags", async () => {
    const results = await search(
      { query: "anything", tags: ["cooking"], limit: 10 },
      { wsPath: ctx.wsPath, embedder }
    );
    expect(results.every(r => r.tags.includes("cooking"))).toBe(true);
  });

  it("filters by content type", async () => {
    const results = await search(
      { query: "anything", contentType: "text/markdown", limit: 10 },
      { wsPath: ctx.wsPath, embedder }
    );
    expect(results.every(r => r.contentType === "text/markdown")).toBe(true);
  });

  it("respects limit", async () => {
    const results = await search(
      { query: "anything", limit: 1 },
      { wsPath: ctx.wsPath, embedder }
    );
    expect(results).toHaveLength(1);
  });

  it("excludes soft-deleted files", async () => {
    // Store and then soft-delete a file — should not appear in search
    const f3 = join(ctx.baseDir, "deleted.md");
    await writeFile(f3, "# Deleted content");
    const r = await store({ sourcePath: f3 }, { wsPath: ctx.wsPath, embedder });
    // ... soft-delete r.id, then verify search doesn't find it
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Add failing coverage for image-only queries, combined text+image queries, `embedding_model` filtering, and the rule that image-only queries must stay on vector mode.

Run: `cd packages/core && npx vitest run tests/search.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement search.ts**

Implement the search pipeline:
1. Validate input: require at least one of `query` or `queryImage`
2. Build one Gemini query embedding request
  - text-only: one text part with `RETRIEVAL_QUERY`
  - image-only: one image part with `RETRIEVAL_QUERY`
  - text+image: one multipart request containing both parts
  - use `CODE_RETRIEVAL_QUERY` only for text/code queries, not image-only queries
3. Open LanceDB, get files table
4. Vector search with `table.vectorSearch(queryVector)`
5. Apply filters: `WHERE deleted_at IS NULL AND status = "embedded" AND embedding_model = ?`
6. Add content type, tags, date filters if provided
7. Deduplicate by `parent_id` — group results, keep highest score per parent
8. Attach chunk label from the best-matching chunk
9. Return `SearchResult[]`

For FTS mode: use `table.search(query, "fts")` on `searchable_text` field.
For hybrid mode: combine vector + FTS results via reciprocal rank fusion.
FTS and hybrid require a non-empty text query. If `--image` is also present, use the combined text+image Gemini embedding for the vector side and the text query for the FTS side. Pure image queries always use vector mode.

**Important:** Before FTS/hybrid search can work, the FTS index must exist. Add a helper `ensureFtsIndex(table)` that calls `table.createIndex("searchable_text", { config: Index.fts({ withPosition: true }) })` if the index doesn't already exist. Call this at the start of `search()` for FTS/hybrid modes. Note: LanceDB FTS index is NOT incrementally updated — after batch inserts via `storeBatch()`, the FTS index must be rebuilt by dropping and recreating it.

- [ ] **Step 4: Run tests**

Run: `cd packages/core && npx vitest run tests/search.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/search.ts packages/core/tests/search.test.ts
git commit -m "feat(core): implement search with vector, FTS, and hybrid modes"
```

---

## Task 9: Read, Manage & Usage

**Files:**
- Create: `packages/core/src/read.ts`
- Create: `packages/core/src/manage.ts`
- Test: `packages/core/tests/manage.test.ts`

- [ ] **Step 1: Write failing test for manage operations**

```typescript
// packages/core/tests/manage.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { remove, update, gc, doctor } from "../src/manage.js";
import { store } from "../src/store.js";
import { search } from "../src/search.js";
import { createTestWorkspace } from "./helpers.js";
import { MockEmbeddingProvider } from "../src/embedding/mock.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

describe("manage", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let embedder: MockEmbeddingProvider;

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    embedder = new MockEmbeddingProvider(3072);
  });
  afterEach(async () => { await ctx.cleanup(); });

  it("soft-deletes a file", async () => {
    const src = join(ctx.baseDir, "test.md");
    await writeFile(src, "content");
    const r = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    await remove(r.id, { wsPath: ctx.wsPath });
    const results = await search({ query: "content", limit: 10 }, { wsPath: ctx.wsPath, embedder });
    expect(results.find(r2 => r2.id === r.id)).toBeUndefined();
  });

  it("updates tags and description", async () => {
    const src = join(ctx.baseDir, "test.md");
    await writeFile(src, "content");
    const r = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    await update(r.id, { tags: ["new-tag"], description: "updated" }, { wsPath: ctx.wsPath });
    // Verify update persisted (read info for this file)
  });

  it("gc permanently removes soft-deleted files", async () => {
    const src = join(ctx.baseDir, "test.md");
    await writeFile(src, "content");
    const r = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    await remove(r.id, { wsPath: ctx.wsPath });
    const gcResult = await gc({ wsPath: ctx.wsPath });
    expect(gcResult.deletedRows).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/manage.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement read.ts**

- `getFileInfo(id)` — return full FileRecord metadata
- `getFilePath(id)` — resolve absolute path to stored file
- `exportFile(id, destPath)` — copy stored file to destination (with path traversal check)

- [ ] **Step 4: Implement manage.ts**

- `remove(id)` — set `deleted_at = Date.now()` on the row and all its chunks
- `update(id, changes)` — update `tags`, `description`, `searchable_text`, `updated_at`
- `gc(opts)` — permanently delete rows where `deleted_at` is set, remove associated files from disk, call `table.optimize()` and `table.cleanupOldVersions()`
- `doctor(opts)` — check for pending/failed rows, orphaned files, config validity
- `listFiles(opts)` — paginated file listing with cursor + limit, optional taxonomy path filter. Queries files table, filters out `deleted_at IS NOT NULL`, returns `{ items: FileRecord[], nextCursor?: string }`
- `getUsage(wsPath)` — read and aggregate `usage.jsonl`
- `logUsage(wsPath, entry)` — append a JSON line to `usage.jsonl`

- [ ] **Step 5: Run tests**

Run: `cd packages/core && npx vitest run tests/manage.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/read.ts packages/core/src/manage.ts packages/core/tests/manage.test.ts
git commit -m "feat(core): add read, remove, update, gc, and doctor"
```

---

## Task 10: Taxonomy

**Files:**
- Create: `packages/core/src/taxonomy.ts`
- Modify: `packages/core/src/store.ts` — call taxonomy assignment after embedding

- [ ] **Step 1: Implement taxonomy.ts**

- `assignToTaxonomy(vector, wsPath)` — find nearest taxonomy node by centroid similarity, assign file, increment count. If no nodes exist, create root.
- `splitNode(nodeId, wsPath, embedder)` — when item_count > 8: load all member vectors, run k-means(k=2), create two child nodes, generate labels from member filenames, reassign files.
- `rebuildTaxonomy(wsPath, embedder)` — drop all nodes, reassign all files from scratch.
- `getTaxonomyTree(wsPath)` — return full tree structure for display.
- `mergeEmptyNodes(wsPath)` — merge nodes with <2 items into parent (called by gc).

Use a separate LanceDB table `taxonomy` for nodes.

- [ ] **Step 2: Wire taxonomy into store pipeline**

After embedding succeeds, call `assignToTaxonomy()`. If the assigned node now exceeds 8 items, trigger `splitNode()`.

- [ ] **Step 3: Write taxonomy tests**

```typescript
// packages/core/tests/taxonomy.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assignToTaxonomy, getTaxonomyTree, splitNode } from "../src/taxonomy.js";
import { createTestWorkspace } from "./helpers.js";
import { MockEmbeddingProvider } from "../src/embedding/mock.js";

describe("taxonomy", () => {
  let ctx, embedder;
  beforeEach(async () => { ctx = await createTestWorkspace(); embedder = new MockEmbeddingProvider(3072); });
  afterEach(async () => { await ctx.cleanup(); });

  it("creates root node on first assignment", async () => {
    const vector = new Float32Array(3072).fill(0.1);
    await assignToTaxonomy(vector, "file1", "test.md", { wsPath: ctx.wsPath });
    const tree = await getTaxonomyTree({ wsPath: ctx.wsPath });
    expect(tree).toBeDefined();
    expect(tree.itemCount).toBe(1);
  });

  it("assigns to nearest centroid", async () => {
    // Store 3 files, verify they all end up in root node
    for (let i = 0; i < 3; i++) {
      const v = new Float32Array(3072).fill(0.1 * (i + 1));
      await assignToTaxonomy(v, `file${i}`, `test${i}.md`, { wsPath: ctx.wsPath });
    }
    const tree = await getTaxonomyTree({ wsPath: ctx.wsPath });
    expect(tree.itemCount).toBe(3);
  });

  it("splits node when exceeding 8 items", async () => {
    for (let i = 0; i < 9; i++) {
      const v = new Float32Array(3072).fill(0.1 * (i + 1));
      await assignToTaxonomy(v, `file${i}`, `test${i}.md`, { wsPath: ctx.wsPath });
    }
    const tree = await getTaxonomyTree({ wsPath: ctx.wsPath });
    expect(tree.children).toBeDefined();
    expect(tree.children!.length).toBe(2);
  });
});
```

- [ ] **Step 4: Run taxonomy tests**

Run: `cd packages/core && npx vitest run tests/taxonomy.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/taxonomy.ts packages/core/src/store.ts packages/core/tests/taxonomy.test.ts
git commit -m "feat(core): add taxonomy with lazy split-on-overflow"
```

---

## Task 11: CLI — Entry Point & Core Commands

**Files:**
- Create: `packages/cli/bin/clawdrive.ts`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/commands/store.ts`
- Create: `packages/cli/src/commands/search.ts`
- Create: `packages/cli/src/commands/read.ts`
- Create: `packages/cli/src/commands/info.ts`
- Create: `packages/cli/src/formatters/json.ts`
- Create: `packages/cli/src/formatters/human.ts`

- [ ] **Step 1: Create CLI entry point**

```typescript
// packages/cli/bin/clawdrive.ts
#!/usr/bin/env node
import { program } from "../src/index.js";
program.parse();
```

```typescript
// packages/cli/src/index.ts
import { Command } from "commander";
import { registerStoreCommand } from "./commands/store.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerReadCommand } from "./commands/read.js";
import { registerInfoCommand } from "./commands/info.js";

export const program = new Command()
  .name("clawdrive")
  .description("Smart file storage for AI agents")
  .version("0.1.0")
  .option("--json", "Output as JSON")
  .option("--workspace <name>", "Workspace name", "default");

registerStoreCommand(program);
registerSearchCommand(program);
registerReadCommand(program);
registerInfoCommand(program);
```

- [ ] **Step 2: Implement formatters**

```typescript
// packages/cli/src/formatters/json.ts
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// packages/cli/src/formatters/human.ts
import chalk from "chalk";
// Format search results, store results, file info, etc. for terminal
```

- [ ] **Step 3: Implement store command**

```typescript
// packages/cli/src/commands/store.ts
// clawdrive store <files...> --tags <tags> --desc <description> --fail-on-dup --json
// Resolves config, creates embedder, calls core store() for each file
// Shows progress with ora spinner
// Outputs human or JSON result
// Exit code 2 if no API key, exit code 5 if duplicate and --fail-on-dup
```

Exit code 2 if no API key. Exit code 5 if duplicate and `--fail-on-dup`.

- [ ] **Step 4: Implement search command**

```typescript
// clawdrive search [query] --image <path> --mode <vector|fts|hybrid>
//   --type <mime> --tags <tags> --limit <n> --min-score <n>
//   --after <date> --before <date> --json
```

Command validation rules:
- allow text-only, image-only, and combined text+image queries
- reject `--mode fts` or `--mode hybrid` when no text query is provided
- build one combined core search input when both text and image are present

- [ ] **Step 5: Implement read and info commands**

```typescript
// clawdrive read <id> — stdout for text, path for binary
// clawdrive info <id> — full metadata display
```

- [ ] **Step 6: Build and test manually**

Run: `npm run build && node packages/cli/dist/bin/clawdrive.js --help`
Expected: Help text with all registered commands.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/
git commit -m "feat(cli): add store, search, read, info commands"
```

---

## Task 12: CLI — Remaining Commands

**Files:**
- Create: `packages/cli/src/commands/rm.ts`
- Create: `packages/cli/src/commands/update.ts`
- Create: `packages/cli/src/commands/export.ts`
- Create: `packages/cli/src/commands/open.ts`
- Create: `packages/cli/src/commands/ls.ts`
- Create: `packages/cli/src/commands/tree.ts`
- Create: `packages/cli/src/commands/import.ts`
- Create: `packages/cli/src/commands/config.ts`
- Create: `packages/cli/src/commands/doctor.ts`
- Create: `packages/cli/src/commands/gc.ts`
- Create: `packages/cli/src/commands/usage.ts`

- [ ] **Step 1: Implement rm, update, export, open**

- `rm <id>` — calls `core.remove()`, shows confirmation
- `update <id> --tags --desc --add-tag --rm-tag` — calls `core.update()`
- `export <id> <dest>` — calls `core.exportFile()`
- `open <id>` — resolves file path, calls `child_process.exec("open <path>")` (macOS) / `xdg-open` (Linux) / `start` (Windows)

- [ ] **Step 2: Implement ls, tree**

- `ls [path]` — calls `core.listFiles()`, optionally filtered by taxonomy path. Paginated output.
- `tree` — calls `core.getTaxonomyTree()`, renders as indented tree with item counts

- [ ] **Step 3: Implement import**

- `import <dir> --glob <pattern> --dry-run --json` — recursively find files matching glob, call `core.storeBatch()`. `--dry-run` shows file count and estimated API cost without storing.

- [ ] **Step 4: Implement config, doctor, gc, usage**

- `config set <key> <val>` / `config get <key>` / `config set-key <key>` — read/write config
- `doctor` — calls `core.doctor()`, displays health report
- `gc` — calls `core.gc()`, shows freed space. `gc --rebuild-taxonomy` calls `core.rebuildTaxonomy()`
- `usage` — calls `core.getUsage()`, shows token count and estimated cost

- [ ] **Step 5: Register all commands in index.ts**

Import and register all command modules.

- [ ] **Step 6: Build and test all commands**

Run: `npm run build && node packages/cli/dist/bin/clawdrive.js --help`
Verify all commands appear. Test each with `--help` flag.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/ packages/cli/src/index.ts
git commit -m "feat(cli): add all remaining commands (rm, update, ls, tree, import, config, doctor, gc, usage)"
```

---

## Task 13: E2E Integration Test

**Files:**
- Create: `packages/core/tests/e2e.test.ts`

- [ ] **Step 1: Write E2E test for full pipeline**

```typescript
// packages/core/tests/e2e.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { store } from "../src/store.js";
import { search } from "../src/search.js";
import { getFileInfo, exportFile } from "../src/read.js";
import { remove, update, gc } from "../src/manage.js";
import { getTaxonomyTree } from "../src/taxonomy.js";
import { createTestWorkspace } from "./helpers.js";
import { MockEmbeddingProvider } from "../src/embedding/mock.js";
import { writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

describe("E2E pipeline", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let embedder: MockEmbeddingProvider;

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    embedder = new MockEmbeddingProvider(3072);
  });
  afterEach(async () => { await ctx.cleanup(); });

  it("full lifecycle: store → search → info → update → search → rm → gc", async () => {
    // 1. Store a file
    const src = join(ctx.baseDir, "test-doc.md");
    await writeFile(src, "# Neural Networks\n\nDeep learning architectures for image classification.");
    const storeResult = await store(
      { sourcePath: src, tags: ["ml"], description: "ML research" },
      { wsPath: ctx.wsPath, embedder }
    );
    expect(storeResult.status).toBe("stored");

    // 2. Search for it
    const searchResults = await search(
      { query: "deep learning", limit: 5 },
      { wsPath: ctx.wsPath, embedder }
    );
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].id).toBe(storeResult.id);

    // 3. Get info
    const info = await getFileInfo(storeResult.id, { wsPath: ctx.wsPath });
    expect(info.original_name).toBe("test-doc.md");
    expect(info.tags).toContain("ml");

    // 4. Update tags
    await update(storeResult.id, { tags: ["ml", "research"] }, { wsPath: ctx.wsPath });
    const updatedInfo = await getFileInfo(storeResult.id, { wsPath: ctx.wsPath });
    expect(updatedInfo.tags).toContain("research");

    // 5. Export
    const exportDest = join(ctx.baseDir, "exported.md");
    await exportFile(storeResult.id, exportDest, { wsPath: ctx.wsPath });
    const exportStat = await stat(exportDest);
    expect(exportStat.isFile()).toBe(true);

    // 6. Remove
    await remove(storeResult.id, { wsPath: ctx.wsPath });
    const afterRm = await search(
      { query: "deep learning", limit: 5 },
      { wsPath: ctx.wsPath, embedder }
    );
    expect(afterRm.find(r => r.id === storeResult.id)).toBeUndefined();

    // 7. GC
    const gcResult = await gc({ wsPath: ctx.wsPath });
    expect(gcResult.deletedRows).toBe(1);
  });
});
```

- [ ] **Step 2: Run E2E test**

Run: `cd packages/core && npx vitest run tests/e2e.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/core/tests/e2e.test.ts
git commit -m "test(core): add E2E integration test for full lifecycle"
```

---

## Task 14: Polish & Ship

- [ ] **Step 1: Add npm bin link for CLI**

Verify `npx clawdrive --help` works from the repo root after `npm run build`.

- [ ] **Step 2: Create minimal README.md**

Quick start: install, set API key, store a file, search for it. Keep it under 50 lines.

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: ClawDrive v1 core + CLI ready"
```
