# ClawDrive Launch Readiness — Production Polish Sprint

**Date:** 2026-03-27
**Target:** Monday 2026-03-31 public launch
**Scope:** 1-day sprint to polish for production readiness

---

## Context

ClawDrive is functionally complete: store, search, pots, shares, taxonomy, 3D visualization, CLI, REST API, and web UI all work. 141 tests pass. The goal is not new features — it's confidence, cleanliness, and polish for a public launch.

**Primary audience:** AI/agent developers (CLI-first)
**Secondary audience:** Twitter viewers (3D UI as viral hook)

---

## Stream 1: Repo Hygiene

### Add
- **MIT LICENSE** file at repo root
- Clean **README.md** pass — verify it reads well for first-time visitors, trim internal references

### Remove / Gitignore
- `docs/superpowers/` — internal design specs and implementation plans
- `PUBLIC_LAUNCH.md` — marketing playbook (not for public eyes)
- `TASK.md` — internal project brief
- Any other internal-only planning artifacts

### Keep
- `README.md` — the storefront
- `CLI.md` — command reference
- `AGENTS.md` — dev workflow for contributors

---

## Stream 2: CLI Tests

The CLI is the primary interface. Test every major command using the mock embedder at the handler level (not subprocess spawning).

### Commands to cover:

| Command | Test cases |
|---------|-----------|
| `add <file>` | Single file, directory, URL, with `--pot`, with `--tldr` |
| `search <query>` | Basic query, `--pot` filter, `--json` output, `--image` query |
| `pot create` / `pot add` | Creation with description, listing, file attachment |
| `share pot` | Link share, principal share |
| `share approve` / `revoke` | Full lifecycle |
| `share inbox` | List pending |
| `todo` | List files missing metadata, `--kind` filter |
| `tldr` / `digest` | Get, `--set`, `--clear` |
| `rename` | Display name change |
| `serve` | Server starts and responds (smoke test) |

### Approach
- Call action functions directly with mock context (matches existing `add-command.test.ts` pattern)
- Use `MockEmbeddingProvider` from `@clawdrive/core`
- Temp workspace directories with cleanup

---

## Stream 3: Server API Tests

Test every route the CLI and web UI depend on using Supertest against the Express app factory.

### Routes to cover:

**Files:**
- `POST /api/files/store` — upload + embed
- `GET /api/files` — list with pagination
- `GET /api/files/:id` — single file metadata
- `PATCH /api/files/:id` — update tags/tldr/digest
- `DELETE /api/files/:id` — soft delete
- `GET /api/files/:id/content` — stream file bytes
- `GET /api/files/:id/thumbnail` — preview image

**Search:**
- `GET /api/search?q=...` — basic vector query
- `GET /api/search?q=...&type=image/` — prefix MIME filter
- `GET /api/search?q=...&pot=...` — pot-scoped search

**Pots:**
- `GET /api/pots` — list all
- `POST /api/pots` — create
- `PATCH /api/pots/:id` — rename
- `DELETE /api/pots/:id` — delete
- `GET /api/pots/:slug/files` — list files in pot

**Shares:**
- `POST /api/shares/pot/:slug` — create share
- `POST /api/shares/:id/approve` — approve
- `POST /api/shares/:id/revoke` — revoke
- `GET /api/shares/inbox` — pending list

**Taxonomy & Projections:**
- `GET /api/taxonomy` — tree retrieval
- `GET /api/projections` — 3D coordinates

### Approach
- Supertest against `createServer()` with mock embedder
- Matches existing `metadata-routes.test.ts` pattern
- Seed test data via direct core function calls

---

## Stream 4: E2E Integration Test

One comprehensive test proving the launch demo flow works end-to-end.

### Flow:
1. Start server with mock embedder
2. `POST /api/files/store` — upload a text file and a PDF
3. `GET /api/files` — verify both appear
4. `GET /api/search?q=...` — search finds the right file
5. `POST /api/pots` — create a pot
6. `PATCH /api/files/:id` — tag file into pot
7. `GET /api/pots/:slug/files` — verify file in pot
8. `POST /api/shares/pot/:slug` — create link share
9. `POST /api/shares/:id/approve` — activate it
10. `GET /s/:token` — public share page returns HTML
11. `GET /s/:token/manifest.json` — manifest has correct items
12. `GET /s/:token/items/:id/content` — file bytes stream correctly
13. `GET /api/taxonomy` — taxonomy tree includes the files
14. `PATCH /api/files/:id` with tldr — set metadata
15. `DELETE /api/files/:id` — soft delete, verify excluded from search

### Location
`packages/server/tests/e2e.test.ts`

---

## Stream 5: Code Simplification

After tests establish a safety net, run batch code-simplifier agents:

- `@clawdrive/core` — largest package, most logic
- `@clawdrive/server` — routes, middleware
- `@clawdrive/web` — React components, API client
- `clawdrive` (CLI) — commands, helpers

**Focus:** Clarity, dead code removal, consistency. Not refactoring.
**Guard rail:** Full test suite after each package's simplification.

---

## Stream 6: Final Verification

The last gate before launch:

1. `npm run build` — clean build, no errors
2. `npm test` — all tests pass (old + new)
3. `npx clawdrive --demo nasa` dry run — verify demo command works
4. Manual check: 3D UI loads, points render, search works, file preview works
5. `git log --oneline` — commit history is clean
6. README reads well from a stranger's perspective

---

## Execution Order

| Stream | Depends on | Parallelizes with |
|--------|-----------|-------------------|
| 1. Repo hygiene | Nothing | 2, 3, 4 |
| 2. CLI tests | Nothing | 1, 3, 4 |
| 3. Server API tests | Nothing | 1, 2, 4 |
| 4. E2E test | Nothing | 1, 2, 3 |
| 5. Code simplification | 2, 3, 4 | — |
| 6. Final verification | All | — |

---

## Out of Scope

- Auto-summarization (v1.1)
- L0/L1/L2 tiered search (v2)
- CI/CD pipeline (post-launch)
- Docker image (post-launch)
- Web UI E2E tests with Playwright (post-launch)
- New features of any kind
