# Onboarding Fixes Design Spec

**Date:** 2026-03-31
**Context:** A fresh-user onboarding test revealed 6 issues that hurt the first-run experience. This spec covers all fixes.

---

## Fix 1: `cdrive doctor` — API key existence check

**Problem:** `cdrive doctor` reports "Healthy" even when no Gemini API key is configured. The #1 setup blocker goes undetected.

**Files to modify:**
- `packages/core/src/manage.ts` — `doctor()` function (line 241)
- `packages/core/src/manage.ts` — `doctor()` options type

**Design:**

Add `configPath` and `envApiKey` to the doctor options interface so the function can check API key availability without depending on the embedder:

```typescript
export interface DoctorOptions extends ManageOptions {
  configPath: string;
  envApiKey?: string;  // pass process.env.GEMINI_API_KEY from CLI
}
```

At the top of the `doctor()` function, before DB checks:

1. Load config from `configPath`
2. Call `resolveApiKey(envApiKey, config.gemini_api_key)`
3. If `undefined` → push issue: `No Gemini API key configured. Set GEMINI_API_KEY or add gemini_api_key to ~/.clawdrive/config.json`

No live validation (no API call). Doctor stays fast and offline.

**CLI side** (`packages/cli/src/commands/doctor.ts`): Pass `configPath` and `process.env.GEMINI_API_KEY` to the doctor call.

---

## Fix 2: Wrap Gemini API errors in CLI and server

**Problem:** When search fails due to a bad/expired API key, users see raw JSON from Google's API. No actionable guidance.

**Files to modify:**
- `packages/cli/src/commands/search.ts` — catch block (line 55)
- `packages/server/src/middleware/error.ts` — error handler

### CLI (`search.ts`)

Replace the catch block with error classification:

```typescript
} catch (err) {
  const msg = (err as Error).message ?? "";
  if (msg.includes("API key expired") || msg.includes("API key not valid") || msg.includes("API_KEY_INVALID")) {
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

### Server (`error.ts`)

Detect Gemini auth errors and return appropriate HTTP status:

```typescript
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  const msg = err.message ?? "";
  if (msg.includes("API key expired") || msg.includes("API key not valid") || msg.includes("API_KEY_INVALID")) {
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

---

## Fix 3: `cdrive pot list` command

**Problem:** No CLI command to list existing pots. The core `listPots()` function exists and the API `GET /api/pots` works, but there's no CLI wiring.

**Files to modify:**
- `packages/cli/src/commands/pot.ts` — add `list` subcommand
- `packages/cli/src/formatters/human.ts` — add pot list formatter (if needed, check if one exists)

**Design:**

Add a `list` (aliased as `ls`) subcommand to the `pot` command group:

```
cdrive pot list
cdrive pot ls
```

Implementation:
1. Call `listPots({ wsPath })` to get all pots
2. For each pot, call `listPotFiles(pot.slug, { wsPath })` to get file count
3. Display table: name, file count, description (truncated), created date

Human output format:
```
my-project     3 files   "Launch docs and notes"    2026-03-31
nasa-demo     248 files  "NASA demo dataset"        2026-03-28
```

JSON output: return the array of pot records augmented with `fileCount`.

Import `listPots` and `listPotFiles` from `@clawdrive/core` (already exported).

---

## Fix 4: `--pot` filter for `cdrive todo`

**Problem:** `cdrive todo` shows files from all pots. No way to scope it to a specific pot.

**Files to modify:**
- `packages/cli/src/commands/todo.ts` — add `--pot` option
- `packages/core/src/todo.ts` — add `pot` to `ListTodosInput`

**Design:**

CLI: Add `--pot <pot>` option to the todo command.

Core (`todo.ts`):
1. Add `pot?: string` to `ListTodosInput`
2. When `pot` is provided, resolve it to a slug, then pass `tags: [buildPotTag(slug)]` to the internal `listFiles()` call
3. `listFiles()` already supports `tags` filtering — no changes needed there

The pot resolution should use `requirePot()` to validate the pot exists, providing a clear error if not found.

---

## Fix 5: `/api/health` endpoint

**Problem:** No health endpoint for monitoring, load balancers, or tunnel setups.

**File to modify:**
- `packages/server/src/index.ts` — add route before other API routes

**Design:**

```typescript
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});
```

Place it before the other `/api/*` routes (around line 36). No auth, no complex checks — just a liveness probe.

---

## Fix 6: Investigate `cdrive serve` web UI path in published package

**Problem:** The onboarding test hit a 500 error with a path referencing `/Users/morozzz/.../hyperdrive/...` (note: "hyperdrive", not "clawdrive"). The source code uses correct dynamic resolution via `require.resolve()`.

**Investigation steps:**
1. Check the compiled output in `packages/cli/dist/` — does `server-runtime.js` contain any hardcoded paths?
2. If the compiled output is correct, the issue may be in the published npm tarball. Run `npm pack` on the CLI package and inspect the built `server-runtime.js` inside.
3. If a stale build artifact is found, clean and rebuild.

**Files to check:**
- `packages/cli/dist/server-runtime.js` — verify compiled output matches source
- `packages/cli/tsconfig.json` — check build config

**Action:** If the built output is correct, this is a non-issue (was a local symlink artifact during the subagent test, which ran against the globally installed npm package). Document as "verified — not reproducible from source" and move on. If stale, rebuild.

---

## Testing Strategy

After all fixes:
1. Run existing test suite (`vitest`)
2. Add unit tests for:
   - `doctor()` detecting missing API key
   - `listTodos()` with `pot` filter
   - Error wrapping logic (if extracted to a helper)
3. Re-run the onboarding experiment with a fresh subagent to validate the experience end-to-end

---

## Out of Scope

These were identified but are not part of this spec:
- `cdrive config show/set` commands
- Documenting `~/.clawdrive/config.json` in README (separate docs PR)
- ffmpeg check in doctor
- Tab completion
- `cdrive tldr` exit code change (P3, behavioral change that could break scripts)
