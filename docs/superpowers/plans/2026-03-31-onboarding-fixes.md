# Onboarding Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 issues found during fresh-user onboarding testing to make the first-run experience smooth.

**Architecture:** Minimal, targeted fixes across cli/core/server packages. No new abstractions — each fix is 5-30 lines. All 6 tasks are independent and can be implemented in any order.

**Tech Stack:** TypeScript, Node.js, Commander.js (CLI), Express (server), Vitest (tests), LanceDB (storage)

---

### Task 1: `cdrive doctor` — add API key existence check

**Files:**
- Modify: `packages/core/src/manage.ts:241-309` (doctor function + DoctorOptions type)
- Modify: `packages/cli/src/commands/doctor.ts:1-36` (pass config path + env key)
- Test: `packages/core/tests/manage.test.ts:166-170` (add new doctor test)

- [ ] **Step 1: Write the failing test**

In `packages/core/tests/manage.test.ts`, add a new test after the existing doctor test (line 170):

```typescript
it("doctor reports missing API key", async () => {
  const configPath = join(ctx.baseDir, "config.json");
  const result = await doctor({
    wsPath: ctx.wsPath,
    configPath,
    envApiKey: undefined,
  });
  expect(result.healthy).toBe(false);
  expect(result.issues).toContainEqual(
    expect.stringContaining("No Gemini API key configured"),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/manage.test.ts -t "doctor reports missing API key"`
Expected: FAIL — `doctor()` doesn't accept `configPath` or `envApiKey` yet.

- [ ] **Step 3: Update the doctor function signature and add API key check**

In `packages/core/src/manage.ts`, change the `doctor` function signature and add the API key check at the top:

Replace the current `doctor` function signature (line 241-243):
```typescript
export async function doctor(
  opts: ManageOptions,
): Promise<{ healthy: boolean; issues: string[] }> {
```

With:
```typescript
export interface DoctorOptions extends ManageOptions {
  configPath?: string;
  envApiKey?: string;
}

export async function doctor(
  opts: DoctorOptions,
): Promise<{ healthy: boolean; issues: string[] }> {
```

Add the API key check at the top of the function body, right after `const issues: string[] = [];` (after line 247):

```typescript
  // Check API key configuration
  if (opts.configPath) {
    const config = await loadConfig(opts.configPath);
    const apiKey = resolveApiKey(opts.envApiKey, config.gemini_api_key);
    if (!apiKey) {
      issues.push(
        'No Gemini API key configured. Set GEMINI_API_KEY or add gemini_api_key to ~/.clawdrive/config.json',
      );
    }
  }
```

Add the import for `loadConfig` and `resolveApiKey` at the top of `manage.ts` (they're in the same package):

```typescript
import { loadConfig, resolveApiKey } from "./config.js";
```

- [ ] **Step 4: Update the CLI doctor command to pass config path**

In `packages/cli/src/commands/doctor.ts`, change line 16 from:
```typescript
const result = await doctor({ wsPath: ctx.wsPath });
```
to:
```typescript
const configPath = join(ctx.baseDir, "config.json");
const result = await doctor({
  wsPath: ctx.wsPath,
  configPath,
  envApiKey: process.env.GEMINI_API_KEY,
});
```

Add the import at the top:
```typescript
import { join } from "node:path";
```

- [ ] **Step 5: Fix the existing doctor test for backward compatibility**

The existing test on line 166-170 passes `ManageOptions` without the new fields. Since `configPath` is optional, the existing test should still pass (no API key check when `configPath` is absent). Verify by running:

Run: `cd packages/core && npx vitest run tests/manage.test.ts`
Expected: All tests PASS (both old and new doctor tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/manage.ts packages/cli/src/commands/doctor.ts packages/core/tests/manage.test.ts
git commit -m "feat: add API key check to cdrive doctor"
```

---

### Task 2: Wrap Gemini API errors in CLI and server

**Files:**
- Modify: `packages/cli/src/commands/search.ts:55-58` (catch block)
- Modify: `packages/server/src/middleware/error.ts:1-6` (error handler)
- Test: `packages/server/tests/search-routes.test.ts` (add error handling test if pattern exists)

- [ ] **Step 1: Update the CLI search error handler**

In `packages/cli/src/commands/search.ts`, replace lines 55-58:

```typescript
    } catch (err) {
      console.error(`Search error: ${(err as Error).message}`);
      process.exit(1);
    }
```

With:

```typescript
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (
        msg.includes("API key expired") ||
        msg.includes("API key not valid") ||
        msg.includes("API_KEY_INVALID")
      ) {
        console.error("Error: Gemini API key is invalid or expired.");
        console.error("Get a free key at https://aistudio.google.com/apikey");
        console.error('Set it with: export GEMINI_API_KEY="your-key"');
      } else if (msg.includes("429")) {
        console.error("Error: Gemini API rate limit exceeded. Wait a moment and retry.");
      } else {
        console.error(`Search error: ${msg}`);
      }
      process.exit(1);
    }
```

- [ ] **Step 2: Update the server error middleware**

Replace the entire contents of `packages/server/src/middleware/error.ts`:

```typescript
import type { Request, Response, NextFunction } from "express";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  const msg = err.message ?? "";

  if (
    msg.includes("API key expired") ||
    msg.includes("API key not valid") ||
    msg.includes("API_KEY_INVALID")
  ) {
    res.status(502).json({ error: "Gemini API key is invalid or expired." });
    return;
  }

  if (msg.includes("429")) {
    res.status(429).json({ error: "Gemini API rate limit exceeded." });
    return;
  }

  console.error(err.stack);
  res.status(500).json({ error: err.message });
}
```

- [ ] **Step 3: Run existing tests to verify nothing breaks**

Run: `cd packages/server && npx vitest run` and `cd packages/cli && npx vitest run`
Expected: All existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/search.ts packages/server/src/middleware/error.ts
git commit -m "feat: wrap Gemini API errors with user-friendly messages"
```

---

### Task 3: `cdrive pot list` command

**Files:**
- Modify: `packages/cli/src/commands/pot.ts:1-83` (add list subcommand)
- Modify: `packages/cli/src/formatters/human.ts` (add pot list formatter)
- Test: `packages/cli/tests/pot-command.test.ts` (add list test)

- [ ] **Step 1: Write the failing test**

In `packages/cli/tests/pot-command.test.ts`, add at the end of the describe block (before the closing `});`):

```typescript
  it("lists pots with pot list", async () => {
    const program1 = createProgram();
    registerPotCommand(program1);
    await runCommand(program1, ["pot", "create", "alpha-pot"]);

    const program2 = createProgram();
    registerPotCommand(program2);
    await runCommand(program2, ["pot", "create", "beta-pot"]);

    const program3 = createProgram();
    registerPotCommand(program3);
    const result = await runCommand(program3, ["pot", "list"]);

    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output).toHaveLength(2);
    expect(output.map((p: any) => p.name)).toContain("alpha-pot");
    expect(output.map((p: any) => p.name)).toContain("beta-pot");
    expect(output[0]).toHaveProperty("fileCount");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/pot-command.test.ts -t "lists pots with pot list"`
Expected: FAIL — `pot list` command not registered.

- [ ] **Step 3: Add the pot list formatter**

In `packages/cli/src/formatters/human.ts`, add at the end of the file:

```typescript
export function formatPotList(pots: Array<{ name: string; slug: string; description: string | null; fileCount: number; created_at: number }>): string {
  if (pots.length === 0) return chalk.dim("No pots.");
  return pots.map((p) => {
    const files = chalk.green(`${p.fileCount} file${p.fileCount === 1 ? "" : "s"}`);
    const desc = p.description ? chalk.dim(` "${p.description}"`) : "";
    return `${p.name}  ${files}${desc}`;
  }).join("\n");
}
```

- [ ] **Step 4: Add the list subcommand**

In `packages/cli/src/commands/pot.ts`, update the import on line 2:

```typescript
import { createPot, requirePot, listPots, listPotFiles } from "@clawdrive/core";
```

Add the following after the `pot create` command block (after line 39) and before the `pot add` command block:

```typescript
  pot
    .command("list")
    .alias("ls")
    .description("List all pots")
    .action(async (_cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupWorkspaceContext(globalOpts);

      try {
        const pots = await listPots({ wsPath: ctx.wsPath });
        const potsWithCounts = await Promise.all(
          pots.map(async (p) => {
            const files = await listPotFiles(p.slug, { wsPath: ctx.wsPath });
            return { ...p, fileCount: files.length };
          }),
        );

        if (globalOpts.json) {
          console.log(formatJson(potsWithCounts));
        } else {
          console.log(formatPotList(potsWithCounts));
        }
      } catch (err) {
        console.error(`Error listing pots: ${(err as Error).message}`);
        process.exit(1);
      }
    });
```

Update the imports at the top of the file to add `formatPotList`:

```typescript
import { formatJson } from "../formatters/json.js";
import { formatPotList } from "../formatters/human.js";
```

- [ ] **Step 5: Run tests**

Run: `cd packages/cli && npx vitest run tests/pot-command.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/pot.ts packages/cli/src/formatters/human.ts packages/cli/tests/pot-command.test.ts
git commit -m "feat: add cdrive pot list command"
```

---

### Task 4: `--pot` filter for `cdrive todo`

**Files:**
- Modify: `packages/core/src/todo.ts:18-23` (add pot to ListTodosInput)
- Modify: `packages/core/src/todo.ts:80-86` (pass tags filter)
- Modify: `packages/cli/src/commands/todo.ts:21-52` (add --pot option)
- Test: `packages/core/tests/todo.test.ts` (add pot filter test)

- [ ] **Step 1: Write the failing test**

In `packages/core/tests/todo.test.ts`, add the following import at the top (alongside existing imports):

```typescript
import { createPot } from "../src/pots.js";
import { buildPotTag } from "../src/metadata.js";
```

Add a new test at the end of the describe block:

```typescript
  it("filters todos by pot", async () => {
    const pot = await createPot({ name: "filter-pot" }, { wsPath: ctx.wsPath });

    const inPotSrc = join(ctx.baseDir, "in-pot.md");
    const outsideSrc = join(ctx.baseDir, "outside.md");
    await writeFile(inPotSrc, "in pot content");
    await writeFile(outsideSrc, "outside content");

    await store(
      { sourcePath: inPotSrc, tags: [buildPotTag(pot.slug)] },
      { wsPath: ctx.wsPath, embedder },
    );
    await store(
      { sourcePath: outsideSrc },
      { wsPath: ctx.wsPath, embedder },
    );

    const allTodos = await listTodos({ kinds: ["tldr"] }, { wsPath: ctx.wsPath });
    expect(allTodos.items.length).toBeGreaterThanOrEqual(2);

    const potTodos = await listTodos(
      { kinds: ["tldr"], pot: pot.slug },
      { wsPath: ctx.wsPath },
    );
    expect(potTodos.items).toHaveLength(1);
    expect(potTodos.items[0].name).toContain("in-pot");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/todo.test.ts -t "filters todos by pot"`
Expected: FAIL — `pot` not a property of `ListTodosInput`.

- [ ] **Step 3: Add pot support to core todo.ts**

In `packages/core/src/todo.ts`, add the import for `buildPotTag`:

```typescript
import { buildPotTag, normalizeCaption, normalizeTldr, normalizeTranscript } from "./metadata.js";
```

Update `ListTodosInput` (line 18-23) to add `pot`:

```typescript
export interface ListTodosInput {
  limit?: number;
  cursor?: string;
  kinds?: TodoKind[];
  taxonomyPath?: string[];
  pot?: string;
}
```

Update the `listFiles` call inside `listTodos` (line 86) to pass the pot tag when provided:

Replace:
```typescript
  const files = await listFiles({ limit: 1_000_000, taxonomyPath: input.taxonomyPath }, opts);
```

With:
```typescript
  const tags = input.pot ? [buildPotTag(input.pot)] : undefined;
  const files = await listFiles({ limit: 1_000_000, taxonomyPath: input.taxonomyPath, tags }, opts);
```

- [ ] **Step 4: Add --pot option to CLI todo command**

In `packages/cli/src/commands/todo.ts`, add after line 26 (the `--limit` option):

```typescript
    .option("--pot <pot>", "Filter by pot name or slug")
```

Update the `listTodos` call (lines 33-38) to pass the pot:

Replace:
```typescript
        const result = await listTodos(
          {
            kinds: cmdOpts.kind,
            limit: cmdOpts.limit,
            cursor: cmdOpts.cursor,
          },
          { wsPath: ctx.wsPath },
        );
```

With:
```typescript
        const result = await listTodos(
          {
            kinds: cmdOpts.kind,
            limit: cmdOpts.limit,
            cursor: cmdOpts.cursor,
            pot: cmdOpts.pot,
          },
          { wsPath: ctx.wsPath },
        );
```

- [ ] **Step 5: Run tests**

Run: `cd packages/core && npx vitest run tests/todo.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/todo.ts packages/cli/src/commands/todo.ts packages/core/tests/todo.test.ts
git commit -m "feat: add --pot filter to cdrive todo"
```

---

### Task 5: `/api/health` endpoint

**Files:**
- Modify: `packages/server/src/index.ts:36` (add health route)
- Test: `packages/server/tests/e2e.test.ts` or new `packages/server/tests/health-routes.test.ts`

- [ ] **Step 1: Check existing server e2e test setup to follow the pattern**

Read `packages/server/tests/e2e.test.ts` to understand how server tests create test instances. Follow the same pattern.

- [ ] **Step 2: Write the failing test**

Create `packages/server/tests/health-routes.test.ts` (follows the same `fetch` + real server pattern as e2e.test.ts):

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initWorkspace, resolveWorkspacePath, MockEmbeddingProvider } from "@clawdrive/core";
import { createServer } from "../src/index.js";

let server: Server;
let baseUrl: string;
let cleanupDir: () => Promise<void>;

beforeAll(async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "clawdrive-health-test-"));
  const wsPath = resolveWorkspacePath(baseDir, "test");
  await initWorkspace(wsPath);
  const embedder = new MockEmbeddingProvider(3072);

  const app = createServer({ wsPath, embedder, port: 0, host: "127.0.0.1" });

  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
    server.on("error", reject);
  });

  cleanupDir = () => rm(baseDir, { recursive: true, force: true });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await cleanupDir();
});

describe("/api/health", () => {
  it("returns ok status", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/server && npx vitest run tests/health-routes.test.ts`
Expected: FAIL — 404 on `/api/health`.

- [ ] **Step 4: Add the health endpoint**

In `packages/server/src/index.ts`, add the health route before the other API routes. Insert after line 35 (after `app.use("/api", createReadOnlyMiddleware());` block, before `// API routes` comment):

```typescript
  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
```

- [ ] **Step 5: Run tests**

Run: `cd packages/server && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/index.ts packages/server/tests/health-routes.test.ts
git commit -m "feat: add /api/health endpoint"
```

---

### Task 6: Investigate `cdrive serve` web UI path in published package

**Files:**
- Check: `packages/cli/dist/server-runtime.js` (compiled output)

- [ ] **Step 1: Check compiled output for hardcoded paths**

Run: `grep -n "hyperdrive\|morozzz\|Users" packages/cli/dist/server-runtime.js || echo "No hardcoded paths found"`

If no hardcoded paths found → the source is correct and the issue was a local artifact during the subagent test (which ran on the globally installed npm package from a previous build).

- [ ] **Step 2: Rebuild to ensure clean state**

Run: `cd packages/cli && npm run build`

Then verify again: `grep -n "hyperdrive\|morozzz\|Users" packages/cli/dist/server-runtime.js || echo "No hardcoded paths found"`

- [ ] **Step 3: Verify require.resolve works for installed package**

Run: `node -e "const { createRequire } = require('module'); const r = createRequire(require.resolve('./packages/cli/dist/server-runtime.js')); console.log(r.resolve('@clawdrive/web/package.json'))"`

Expected: Should resolve to the `packages/web/package.json` path (via workspace symlinks locally).

- [ ] **Step 4: Document findings and commit if changes made**

If clean: no commit needed — document as "verified, not reproducible" in commit of another task.
If stale build found: rebuild and commit the clean dist.

```bash
# Only if dist was stale:
git add packages/cli/dist/
git commit -m "fix: rebuild CLI dist to remove stale paths"
```

---

### Task 7: Run onboarding experiment again

**Files:** None (testing only)

- [ ] **Step 1: Build all packages**

Run: `npm run build` (from repo root)

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests PASS across core, cli, server.

- [ ] **Step 3: Launch fresh onboarding subagent**

Re-run the same onboarding experiment from the original test: create an isolated temp directory with mock files, spawn a subagent with zero prior knowledge, and have it discover, install (from local build), and use ClawDrive end-to-end. Verify all 6 issues are resolved.

Compare the new report score against the original 7/10.
