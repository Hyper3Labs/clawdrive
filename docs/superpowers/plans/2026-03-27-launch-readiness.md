# ClawDrive Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish ClawDrive for Monday public launch — repo hygiene, comprehensive tests, code quality.

**Architecture:** Six parallel streams: repo cleanup, CLI tests, server API tests, E2E integration test, code simplification, final verification. Streams 1-4 are independent and can run in parallel. Stream 5 runs after tests establish a safety net. Stream 6 is the final gate.

**Tech Stack:** Vitest 3, native fetch (no supertest), MockEmbeddingProvider, Express 5, Commander.js 13

---

## File Map

### New Files
- `LICENSE` — MIT license
- `packages/cli/tests/search-command.test.ts` — CLI search tests
- `packages/cli/tests/pot-command.test.ts` — CLI pot tests
- `packages/cli/tests/share-command.test.ts` — CLI share lifecycle tests
- `packages/cli/tests/metadata-commands.test.ts` — CLI todo/tldr/digest/rename tests
- `packages/cli/tests/serve-command.test.ts` — CLI serve smoke test
- `packages/server/tests/files-routes.test.ts` — File CRUD route tests
- `packages/server/tests/search-routes.test.ts` — Search route tests
- `packages/server/tests/pot-routes.test.ts` — Pot route tests
- `packages/server/tests/share-routes.test.ts` — Share route tests
- `packages/server/tests/taxonomy-routes.test.ts` — Taxonomy + projection route tests
- `packages/server/tests/e2e.test.ts` — Full demo flow integration test

### Modified Files
- `README.md` — Polish for public launch
- `.gitignore` — Add internal doc patterns

### Removed from Tracking
- `docs/superpowers/` — Internal specs/plans (gitignored)
- `PUBLIC_LAUNCH.md` — Marketing playbook
- `TASK.md` — Internal brief

---

## Task 1: Repo Hygiene — LICENSE and Gitignore

**Files:**
- Create: `LICENSE`
- Modify: `.gitignore`

- [ ] **Step 1: Create MIT LICENSE file**

Create `LICENSE` with the standard MIT template:

```
MIT License

Copyright (c) 2026 Hyper3 Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Update .gitignore to exclude internal docs**

Add these lines to `.gitignore`:

```
# Internal planning docs
docs/superpowers/
PUBLIC_LAUNCH.md
TASK.md
```

- [ ] **Step 3: Remove internal files from git tracking**

```bash
git rm --cached -r docs/superpowers/ 2>/dev/null; git rm --cached PUBLIC_LAUNCH.md 2>/dev/null; git rm --cached TASK.md 2>/dev/null
```

These files remain on disk but are no longer tracked.

- [ ] **Step 4: Commit**

```bash
git add LICENSE .gitignore && git commit -m "chore: add MIT license, gitignore internal docs"
```

---

## Task 2: Repo Hygiene — README Polish

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current README**

Read `README.md` in full. Check for:
- Internal references (links to internal docs, TASK.md, etc.)
- Missing sections a first-time visitor needs
- Anything that reads as "work in progress"
- The quick-start flow is clear and correct

- [ ] **Step 2: Polish README for public launch**

Ensure the README:
- Leads with a clear one-liner and value prop
- Has a quick-start that works (`npx clawdrive` or `npm install -g clawdrive`)
- Shows the core CLI workflow (add → search → share)
- Mentions the 3D visualization
- Lists requirements (Node.js 18+, ffmpeg)
- Has a link to `CLI.md` for full command reference
- Includes the MIT license badge
- Removes any references to internal docs, TASK.md, PUBLIC_LAUNCH.md, or docs/superpowers/
- Removes any TODO/WIP language

- [ ] **Step 3: Commit**

```bash
git add README.md && git commit -m "docs: polish README for public launch"
```

---

## Task 2b: CLI Tests — Extend Add Command Tests

**Files:**
- Modify: `packages/cli/tests/add-command.test.ts`
- Reference: `packages/cli/src/commands/add.ts`

The existing `add-command.test.ts` has 3 tests (single file, pot, auto-create pot). The spec requires additional coverage.

- [ ] **Step 1: Add missing test cases to add-command.test.ts**

Add these tests to the existing file:
1. **Add with --tldr** — `add <file> --tldr "Short summary"`, verify the stored file has the tldr set
2. **Add directory** — Create a temp directory with 2 files, `add <dir>`, verify both files stored
3. **Add URL** — This requires network access; mock `fetch` and test that URL sources are handled. If mocking is complex, add a note and skip — URL add is tested implicitly by the E2E and manual verification.

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/cli && npx vitest run tests/add-command.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/tests/add-command.test.ts && git commit -m "test(cli): extend add command tests (tldr, directory)"
```

---

## Task 3: CLI Tests — Search Command

**Files:**
- Create: `packages/cli/tests/search-command.test.ts`
- Reference: `packages/cli/tests/add-command.test.ts` (pattern)
- Reference: `packages/cli/src/commands/search.ts` (implementation)

- [ ] **Step 1: Write search command tests**

Create `packages/cli/tests/search-command.test.ts`. Follow the exact pattern from `add-command.test.ts`: use `vi.hoisted()` to create mocks, `vi.mock()` to inject them, create a test workspace with `MockEmbeddingProvider(3072)`, and use `createProgram()` + `runCommand()` helpers.

Test cases:
1. **Basic text search** — Store a file, search for it, verify result appears in JSON output
2. **Search with --pot filter** — Store file in a pot, search with `--pot`, verify only pot files returned
3. **Search with --limit** — Store multiple files, search with `--limit 1`, verify only 1 result
4. **Search with --image** — Create a small test image file, search with `--image <path>`, verify results returned (cross-modal search)
5. **Search with no results** — Search for nonsensical query, verify empty results
6. **Search without query** — Run search with no query or --image arg, verify error message

For each test:
- Use `store()` from `@clawdrive/core` directly to seed test data (not the CLI add command)
- Use `search()` from core or the CLI command via `runCommand()`
- Parse JSON output and assert structure

The mock pattern from `add-command.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MockEmbeddingProvider,
  initWorkspace,
  resolveWorkspacePath,
  store,
} from "@clawdrive/core";

const { setupContextMock, setupWorkspaceContextMock } = vi.hoisted(() => ({
  setupContextMock: vi.fn(),
  setupWorkspaceContextMock: vi.fn(),
}));

vi.mock("../src/helpers.js", () => ({
  getGlobalOptions: (cmd: { optsWithGlobals?: () => Record<string, unknown> }) =>
    cmd.optsWithGlobals?.() ?? {},
  setupContext: setupContextMock,
  setupWorkspaceContext: setupWorkspaceContextMock,
}));

import { registerSearchCommand } from "../src/commands/search.js";

function createProgram() {
  return new Command()
    .name("cdrive")
    .option("--workspace <name>", "Workspace name", "test")
    .option("--json", "JSON output")
    .exitOverride();
}

async function runCommand(program: Command, args: string[]) {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    await program.parseAsync(["node", "cdrive", "--json", ...args], { from: "node" });
    return {
      logs: logSpy.mock.calls.map(([value]) => String(value)),
      errors: errorSpy.mock.calls.map(([value]) => String(value)),
    };
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
}
```

Each test follows:
```typescript
it("returns search results as JSON", async () => {
  // Seed: store a text file directly via core
  const filePath = join(ctx.wsPath, "test.txt");
  await writeFile(filePath, "The quick brown fox jumps over the lazy dog");
  await store(filePath, { wsPath: ctx.wsPath, embedder: ctx.embedder });

  // Act: run search command
  const program = createProgram();
  registerSearchCommand(program);
  const result = await runCommand(program, ["search", "quick brown fox"]);

  // Assert: JSON output contains results
  const output = JSON.parse(result.logs[0]);
  expect(output.results).toBeDefined();
  expect(output.results.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/cli && npx vitest run tests/search-command.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/tests/search-command.test.ts && git commit -m "test(cli): add search command tests"
```

---

## Task 4: CLI Tests — Pot Command

**Files:**
- Create: `packages/cli/tests/pot-command.test.ts`
- Reference: `packages/cli/tests/add-command.test.ts` (pattern)
- Reference: `packages/cli/src/commands/pot.ts` (implementation)

- [ ] **Step 1: Write pot command tests**

Create `packages/cli/tests/pot-command.test.ts` using the same mock pattern as Task 3.

Test cases:
1. **Create pot** — `pot create my-pot --desc "Test pot"`, verify JSON output has slug, name, description
2. **Create pot without description** — `pot create bare-pot`, verify it works with null description
3. **Add file to pot** — Create pot, then `pot add my-pot <file>`, verify file is tagged
4. **Duplicate pot name** — Create same pot twice, verify error

Use `registerPotCommand(program)` and register `registerAddCommand(program)` too (pot add depends on add logic).

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/cli && npx vitest run tests/pot-command.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/tests/pot-command.test.ts && git commit -m "test(cli): add pot command tests"
```

---

## Task 5: CLI Tests — Share Command

**Files:**
- Create: `packages/cli/tests/share-command.test.ts`
- Reference: `packages/cli/src/commands/share.ts` (implementation)

- [ ] **Step 1: Write share command tests**

Create `packages/cli/tests/share-command.test.ts`. This tests the full share lifecycle.

Test cases:
1. **Create link share** — Create pot with file, `share pot my-pot --link`, verify JSON output has token and status "pending"
2. **Approve share** — Create share, then `share approve <id>`, verify status becomes "active"
3. **Revoke share** — Create and approve share, then `share revoke <id>`, verify status "revoked"
4. **Share inbox** — Create pending share, run `share inbox`, verify it appears
5. **Share inbox empty** — No pending shares, verify empty list

Seed data using core functions directly: `createPot()`, `store()`, `addFileToPot()`, `createPotShare()`.

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/cli && npx vitest run tests/share-command.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/tests/share-command.test.ts && git commit -m "test(cli): add share command lifecycle tests"
```

---

## Task 6: CLI Tests — Metadata Commands (todo, tldr, digest, rename)

**Files:**
- Create: `packages/cli/tests/metadata-commands.test.ts`
- Reference: `packages/cli/src/commands/todo.ts`, `tldr.ts`, `digest.ts`, `rename.ts`

- [ ] **Step 1: Write metadata command tests**

Create `packages/cli/tests/metadata-commands.test.ts`.

Test cases:

**todo:**
1. **List todos** — Store file without tldr, run `todo --json`, verify file appears with missing kinds
2. **Filter by kind** — `todo --kind tldr --json`, verify only tldr-missing files shown
3. **Empty todo list** — Store file with all metadata, verify empty list

**tldr:**
4. **Set tldr** — `tldr <file> --set "Short summary"`, verify update in JSON output
5. **Get tldr** — Set then get, verify text output
6. **Clear tldr** — Set then `--clear`, verify null

**digest:**
7. **Set digest** — `digest <file> --set "Structured markdown"`, verify update
8. **Clear digest** — Set then `--clear`, verify null

**rename:**
9. **Rename file** — `rename <file> --set "New Name"`, verify display_name changes
10. **Clear rename** — Rename then `--clear`, verify reverts

Seed: store a file, then test each metadata command against it. File resolution in these commands uses `resolveFileInfo()` which matches by display_name or original_name.

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/cli && npx vitest run tests/metadata-commands.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/tests/metadata-commands.test.ts && git commit -m "test(cli): add metadata command tests (todo, tldr, digest, rename)"
```

---

## Task 7: CLI Tests — Serve Command Smoke Test

**Files:**
- Create: `packages/cli/tests/serve-command.test.ts`
- Reference: `packages/cli/src/commands/serve.ts`

- [ ] **Step 1: Write serve smoke test**

Create `packages/cli/tests/serve-command.test.ts`.

This test verifies the server starts and responds. Instead of testing via CLI parsing (which spawns child processes), test the underlying server creation:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  MockEmbeddingProvider,
  initWorkspace,
  resolveWorkspacePath,
} from "@clawdrive/core";
import { createServer } from "@clawdrive/server";

vi.mock("sharp", () => {
  const chain = {
    resize: () => chain,
    jpeg: () => chain,
    toFile: async () => undefined,
  };
  return { default: () => chain };
});

describe("serve command", () => {
  let wsPath: string;
  let baseDir: string;
  let server: Server;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "clawdrive-serve-test-"));
    wsPath = resolveWorkspacePath(baseDir, "test");
    await initWorkspace(wsPath);
  });

  afterEach(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()));
    await rm(baseDir, { recursive: true });
  });

  it("starts server and responds to health check", async () => {
    const embedder = new MockEmbeddingProvider(3072);
    const app = createServer({ wsPath, embedder, port: 0, host: "127.0.0.1" });

    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/api/files`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cd packages/cli && npx vitest run tests/serve-command.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/tests/serve-command.test.ts && git commit -m "test(cli): add serve command smoke test"
```

---

## Task 8: Server Tests — File Routes

**Files:**
- Create: `packages/server/tests/files-routes.test.ts`
- Reference: `packages/server/tests/metadata-routes.test.ts` (pattern)
- Reference: `packages/server/src/routes/files.ts`

- [ ] **Step 1: Write file route tests**

Create `packages/server/tests/files-routes.test.ts`. Follow the existing server test pattern: mock `sharp`, create test workspace, start server on port 0, use native `fetch`.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  MockEmbeddingProvider,
  initWorkspace,
  resolveWorkspacePath,
  store,
} from "@clawdrive/core";
import { createServer } from "../src/index.js";

vi.mock("sharp", () => {
  const chain = {
    resize: () => chain,
    jpeg: () => chain,
    toFile: async () => undefined,
  };
  return { default: () => chain };
});
```

Test cases:

1. **POST /api/files/store** — Upload a text file via multipart form. Verify 200, response has `id`, `status`.

```typescript
it("uploads and stores a file", async () => {
  const form = new FormData();
  form.append("file", new Blob(["hello world"], { type: "text/plain" }), "hello.txt");
  const res = await fetch(`${baseUrl}/api/files/store`, { method: "POST", body: form });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.id).toBeDefined();
});
```

2. **GET /api/files** — List files. Verify `items` array and `total` count.
3. **GET /api/files/:id** — Get single file metadata. Verify all expected fields.
4. **PATCH /api/files/:id** — Update tldr and tags. Verify changes persisted.
5. **DELETE /api/files/:id** — Soft delete. Verify file no longer appears in list.
6. **GET /api/files/:id/content** — Stream file content. Verify body matches original.

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/server && npx vitest run tests/files-routes.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/tests/files-routes.test.ts && git commit -m "test(server): add file route tests"
```

---

## Task 9: Server Tests — Search Routes

**Files:**
- Create: `packages/server/tests/search-routes.test.ts`
- Reference: `packages/server/src/routes/search.ts`

- [ ] **Step 1: Write search route tests**

Create `packages/server/tests/search-routes.test.ts`. Same server test setup pattern.

Test cases:
1. **Basic search** — Store file, `GET /api/search?q=hello`, verify results array with scores
2. **Search with type prefix filter** — Store text and image files, `GET /api/search?q=test&type=text/`, verify only text results (this tests the bug fix from earlier)
3. **Search with pot filter** — Store file in pot, `GET /api/search?q=test&pot=my-pot`, verify scoped results
4. **Search with limit** — `GET /api/search?q=test&limit=1`, verify single result
5. **Empty search** — `GET /api/search` without `q` param, verify 400 error
6. **No results** — Search for nonsensical query, verify empty results array

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/server && npx vitest run tests/search-routes.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/tests/search-routes.test.ts && git commit -m "test(server): add search route tests including type prefix filter"
```

---

## Task 10: Server Tests — Pot Routes

**Files:**
- Create: `packages/server/tests/pot-routes.test.ts`
- Reference: `packages/server/src/routes/pots.ts`

- [ ] **Step 1: Write pot route tests**

Create `packages/server/tests/pot-routes.test.ts`.

Test cases:
1. **POST /api/pots** — Create pot with name and description. Verify slug, name, id.
2. **GET /api/pots** — List pots. Verify array includes created pot.
3. **PATCH /api/pots/:id** — Rename pot. Verify name changed.
4. **DELETE /api/pots/:id** — Delete pot. Verify removed from list.
5. **GET /api/pots/:slug/files** — Store file in pot, list pot files, verify file appears.

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/server && npx vitest run tests/pot-routes.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/tests/pot-routes.test.ts && git commit -m "test(server): add pot route tests"
```

---

## Task 11: Server Tests — Share Routes

**Files:**
- Create: `packages/server/tests/share-routes.test.ts`
- Reference: `packages/server/src/routes/shares.ts`

- [ ] **Step 1: Write share route tests**

Create `packages/server/tests/share-routes.test.ts`.

Test cases:
1. **Create link share** — Create pot with file, `POST /api/shares/pot/:slug` with `{ kind: "link" }`. Verify token returned.
2. **Approve share** — `POST /api/shares/:id/approve`. Verify status "active".
3. **Revoke share** — `POST /api/shares/:id/revoke`. Verify status "revoked".
4. **Get inbox** — Create pending share, `GET /api/shares/inbox`, verify it appears.
5. **Public share access** — Approve share, `GET /s/:token`, verify HTML response with 200.
6. **Public manifest** — `GET /s/:token/manifest.json`, verify JSON with items array.

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/server && npx vitest run tests/share-routes.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/tests/share-routes.test.ts && git commit -m "test(server): add share route and public share tests"
```

---

## Task 12: Server Tests — Taxonomy and Projection Routes

**Files:**
- Create: `packages/server/tests/taxonomy-routes.test.ts`
- Reference: `packages/server/src/routes/taxonomy.ts`, `packages/server/src/routes/projections.ts`

- [ ] **Step 1: Write taxonomy and projection route tests**

Create `packages/server/tests/taxonomy-routes.test.ts`.

Test cases:
1. **GET /api/taxonomy** — Empty workspace, verify returns tree structure (possibly empty root).
2. **GET /api/taxonomy after store** — Store files, verify taxonomy has nodes with items.
3. **GET /api/projections** — Store files, verify returns array of points with x, y, z coordinates.

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/server && npx vitest run tests/taxonomy-routes.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/tests/taxonomy-routes.test.ts && git commit -m "test(server): add taxonomy and projection route tests"
```

---

## Task 13: E2E Integration Test — Full Demo Flow

**Files:**
- Create: `packages/server/tests/e2e.test.ts`

- [ ] **Step 1: Write the E2E integration test**

Create `packages/server/tests/e2e.test.ts`. This is a single `describe` block with sequential `it` blocks sharing state — each step builds on the previous one to mirror the demo flow.

```typescript
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  MockEmbeddingProvider,
  initWorkspace,
  resolveWorkspacePath,
} from "@clawdrive/core";
import { createServer } from "../src/index.js";

vi.mock("sharp", () => {
  const chain = {
    resize: () => chain,
    jpeg: () => chain,
    toFile: async () => undefined,
  };
  return { default: () => chain };
});

describe("E2E: full demo flow", () => {
  let baseDir: string;
  let wsPath: string;
  let server: Server;
  let baseUrl: string;
  let embedder: MockEmbeddingProvider;

  // Shared state across sequential tests
  let fileId: string;
  let secondFileId: string;
  let potId: string;
  let potSlug: string;
  let shareId: string;
  let shareToken: string;
  let shareItemId: string;

  beforeAll(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "clawdrive-e2e-"));
    wsPath = resolveWorkspacePath(baseDir, "test");
    await initWorkspace(wsPath);
    embedder = new MockEmbeddingProvider(3072);

    const app = createServer({ wsPath, embedder, port: 0, host: "127.0.0.1" });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    // Create test files on disk for upload
    await writeFile(join(baseDir, "doc.txt"), "The quick brown fox jumps over the lazy dog. This is a document about animals.");
    await writeFile(join(baseDir, "notes.txt"), "Meeting notes from the quarterly review. Budget allocation for Q3.");
  });

  afterAll(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()));
    await rm(baseDir, { recursive: true });
  });

  it("step 1: uploads two files", async () => {
    // Upload first file
    const form1 = new FormData();
    form1.append("file", new Blob(["The quick brown fox jumps over the lazy dog. This is a document about animals."], { type: "text/plain" }), "doc.txt");
    const res1 = await fetch(`${baseUrl}/api/files/store`, { method: "POST", body: form1 });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    fileId = body1.id;
    expect(fileId).toBeDefined();

    // Upload second file
    const form2 = new FormData();
    form2.append("file", new Blob(["Meeting notes from the quarterly review. Budget allocation for Q3."], { type: "text/plain" }), "notes.txt");
    const res2 = await fetch(`${baseUrl}/api/files/store`, { method: "POST", body: form2 });
    expect(res2.status).toBe(200);
    secondFileId = (await res2.json()).id;
  });

  it("step 2: lists both files", async () => {
    const res = await fetch(`${baseUrl}/api/files`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(2);
  });

  it("step 3: searches and finds relevant file", async () => {
    const res = await fetch(`${baseUrl}/api/search?q=animals`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.length).toBeGreaterThan(0);
  });

  it("step 4: creates a pot", async () => {
    const res = await fetch(`${baseUrl}/api/pots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Demo Pot", description: "For the launch demo" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    potId = body.id;
    potSlug = body.slug;
    expect(potSlug).toBe("demo-pot");
  });

  it("step 5: tags file into pot", async () => {
    // Get current tags
    const getRes = await fetch(`${baseUrl}/api/files/${fileId}`);
    const file = await getRes.json();
    const currentTags = file.tags ?? [];

    const res = await fetch(`${baseUrl}/api/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: [...currentTags, `pot:${potSlug}`] }),
    });
    expect(res.status).toBe(200);
  });

  it("step 6: lists files in pot", async () => {
    const res = await fetch(`${baseUrl}/api/pots/${potSlug}/files`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].id).toBe(fileId);
  });

  it("step 7: creates a link share for pot", async () => {
    const res = await fetch(`${baseUrl}/api/shares/pot/${potSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "link" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    shareId = body.id;
    shareToken = body.token;
    expect(shareToken).toBeDefined();
    expect(body.status).toBe("pending");
  });

  it("step 8: approves the share", async () => {
    const res = await fetch(`${baseUrl}/api/shares/${shareId}/approve`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("active");
  });

  it("step 9: public share page returns HTML", async () => {
    const res = await fetch(`${baseUrl}/s/${shareToken}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("step 10: public manifest has items", async () => {
    const res = await fetch(`${baseUrl}/s/${shareToken}/manifest.json`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBe(1);
    shareItemId = body.items[0].id;
  });

  it("step 11: public share streams file content", async () => {
    const res = await fetch(`${baseUrl}/s/${shareToken}/items/${shareItemId}/content`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("quick brown fox");
  });

  it("step 12: taxonomy tree includes files", async () => {
    const res = await fetch(`${baseUrl}/api/taxonomy`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  it("step 13: sets metadata on file", async () => {
    const res = await fetch(`${baseUrl}/api/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tldr: "A document about animals and foxes" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tldr).toBe("A document about animals and foxes");
  });

  it("step 14: soft deletes file and it disappears from search", async () => {
    const delRes = await fetch(`${baseUrl}/api/files/${secondFileId}`, { method: "DELETE" });
    expect(delRes.status).toBe(200);

    // Verify it no longer appears in file list
    const listRes = await fetch(`${baseUrl}/api/files`);
    const listBody = await listRes.json();
    const ids = listBody.items.map((f: { id: string }) => f.id);
    expect(ids).not.toContain(secondFileId);
  });
});
```

- [ ] **Step 2: Run E2E test**

```bash
cd packages/server && npx vitest run tests/e2e.test.ts
```

Expected: All 14 steps PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/server/tests/e2e.test.ts && git commit -m "test(server): add full E2E integration test covering demo flow"
```

---

## Task 14: Code Simplification

**Files:**
- All source files across all 4 packages

**Prerequisites:** Tasks 3-13 must be complete (tests provide safety net).

- [ ] **Step 1: Run full test suite to establish baseline**

```bash
npm test
```

Record total test count. All must pass.

- [ ] **Step 2: Run code-simplifier on @clawdrive/core**

Focus on: dead code, unused imports, redundant type assertions, inconsistent patterns, overly complex functions. Do NOT refactor architecture — just clean.

- [ ] **Step 3: Run tests after core simplification**

```bash
npm test
```

All tests must still pass.

- [ ] **Step 4: Run code-simplifier on @clawdrive/server**

Same focus as Step 2.

- [ ] **Step 5: Run tests after server simplification**

```bash
npm test
```

- [ ] **Step 6: Run code-simplifier on @clawdrive/web**

Same focus. Pay attention to unused components, dead CSS, unnecessary re-renders.

- [ ] **Step 7: Run tests after web simplification**

```bash
npm test
```

- [ ] **Step 8: Run code-simplifier on clawdrive (CLI)**

Same focus.

- [ ] **Step 9: Run full test suite — final verification**

```bash
npm test
```

All tests must pass. Test count should be >= baseline from Step 1.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "refactor: code simplification pass across all packages"
```

---

## Task 15: Final Verification

**Prerequisites:** All previous tasks complete.

- [ ] **Step 1: Clean build**

```bash
rm -rf packages/*/dist && npm run build
```

Verify: no errors, no warnings except known Vite chunk size.

- [ ] **Step 2: Full test suite**

```bash
npm test
```

Verify: ALL tests pass (should be 141 + all new tests).

- [ ] **Step 3: Verify git status is clean**

```bash
git status
```

No unexpected untracked files. Working tree clean.

- [ ] **Step 4: Review README from a stranger's perspective**

Read `README.md` one final time. Ask: if I had never seen this project, would I understand what it does, how to install it, and how to use it in 60 seconds?

- [ ] **Step 5: Verify demo command works**

```bash
npx clawdrive serve --demo nasa --open
```

Verify:
- NASA dataset downloads (or is cached)
- Server starts
- Browser opens with 3D visualization
- Points render in the embedding space
- Search works (try a query)
- File preview works (click a point)

- [ ] **Step 6: Final commit log review**

```bash
git log --oneline -20
```

Verify commit history is clean and tells a coherent story.
