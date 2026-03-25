# ClawDrive v1 — Design Specification

**Date:** 2026-03-22
**Status:** Draft
**Author:** Human + Claude

## Overview

ClawDrive is a CLI-first file storage and retrieval system built for AI agents. It embeds files using Gemini Embedding 2's native multimodal capabilities (text, images, video, audio, PDFs) and stores them in LanceDB for semantic search. A web UI provides a 3D embedding space visualization (agent view) and a taxonomy browser (human view).

**Key differentiator:** Unlike every other RAG tool that converts files to text before embedding, ClawDrive embeds PDFs, images, video, and audio natively — preserving tables, diagrams, visual content, and speech that text extraction loses.

## Scope

### In scope (v1)
- CLI tool: store, search, read, list, remove, import, export, manage
- Multimodal file ingestion with native chunking (no text conversion for non-text files)
- Semantic search with vector similarity
- Web UI with 3D embedding visualization, taxonomy browser, and spotlight search
- Single-agent, local-first operation
- Workspace support (multiple isolated drives)
- `--json` output on all commands for agent consumption

### Out of scope (v1)
- Multi-agent collaboration / file sharing (v2)
- A2A / MCP protocol integration
- L0/L1/L2 tiered progressive loading (v2 optimization)
- Cloud-hosted version
- User auth / permissions

## Tech Stack

| Component | Choice | Reason |
|---|---|---|
| Language | TypeScript | Full-stack (CLI + UI), strong typing, LanceDB/Gemini SDKs available |
| Storage | LanceDB embedded (`@lancedb/lancedb`) | In-process, no server, multimodal vector search, Lance columnar format |
| Embeddings | Gemini Embedding 2 (`gemini-embedding-2-preview`) | 3072-dim, native multimodal (text/image/video/audio/PDF), best-in-class benchmarks |
| CLI | commander or oclif | `--json` flag support, exit codes, subcommands |
| Web framework | React + Vite | Fast dev, static build served by Express |
| 3D visualization | Three.js | Full control, large ecosystem, handles 100K+ points |
| Dimensionality reduction | UMAP (umap-js) | Preserves local + global structure, fast, good for interactive exploration |
| API server | Express or Fastify | Serves REST API + static frontend via `clawdrive serve` |
| Testing | vitest | ESM + native module support (LanceDB ships .node binaries) |
| Validation | zod | Config schema, API input validation |
| Monorepo | npm workspaces + turbo | Build orchestration, dependency management |

## Architecture

```
packages/
  core/           — pure business logic, no CLI/server concerns
  cli/            — thin shell over core (commander/oclif)
  server/         — Express/Fastify REST API (clawdrive serve)
  web/            — React + Vite frontend (3D view, taxonomy, spotlight)
```

### Core Library (`@clawdrive/core`)

All business logic lives here. No `process.exit()`, no `console.log()`, no hardcoded paths. All functions are async and return typed results. A logger interface is injected, not imported.

```
core/src/
  ├── store.ts          — ingestion pipeline
  ├── search.ts         — vector search
  ├── read.ts           — file retrieval
  ├── taxonomy.ts       — auto-organize hierarchy
  ├── chunker/
  │   ├── pdf.ts        — split PDF into 6-page segments
  │   ├── video.ts      — split video into 120s segments
  │   ├── audio.ts      — split audio into 80s segments
  │   └── text.ts       — structure-preserving text splitter
  ├── embedding/
  │   ├── types.ts      — EmbeddingProvider interface
  │   ├── gemini.ts     — Gemini Embedding 2 implementation
  │   └── mock.ts       — deterministic fake for tests
  ├── storage/
  │   ├── db.ts         — LanceDB wrapper + migrations
  │   └── files.ts      — disk file management + hard-links
  ├── config.ts         — Zod-validated config
  ├── workspace.ts      — workspace resolution
  ├── lock.ts           — file-based advisory lock
  └── types.ts          — shared types
```

### CLI (`clawdrive`)

Thin shell that calls core functions and formats output. Human-readable by default, `--json` for agents.

### Server (`clawdrive serve`)

Express/Fastify server exposing core functions as REST endpoints. Serves the static web UI build. Started via `clawdrive serve` or `clawdrive ui` (which also opens the browser).

### Web (`clawdrive` frontend)

React + Vite SPA with three main features:
1. **Agent View** — Three.js 3D scatter plot of file embeddings (UMAP-projected), hover cards, cluster labels
2. **Human View** — Taxonomy sidebar + file grid browser
3. **Spotlight Search** — Cmd+K overlay with real-time semantic search across all modalities

## Data Model

### Files Table (LanceDB)

| Field | Type | Description |
|---|---|---|
| `id` | string (UUID v7) | Sortable by time, globally unique |
| `vector` | Float32[3072] | Gemini Embedding 2 output |
| `original_name` | string | Original filename on ingestion |
| `content_type` | string | MIME type (image/png, application/pdf, etc.) |
| `file_path` | string | Relative path inside workspace files/ directory |
| `file_hash` | string | SHA-256 for deduplication |
| `file_size` | int64 | Bytes |
| `description` | string (nullable) | Agent-provided context hint |
| `tags` | string[] | User/agent-applied labels |
| `taxonomy_path` | string[] | Auto-computed hierarchy path |
| `embedding_model` | string | e.g. "gemini-embedding-2-preview" |
| `parent_id` | string (nullable) | For chunked files — links chunk to parent |
| `chunk_index` | int (nullable) | Ordering within parent |
| `chunk_label` | string (nullable) | e.g. "pages 7-12" or "Section: Methods" |
| `task_type` | string | Gemini taskType used (RETRIEVAL_DOCUMENT, etc.) |
| `searchable_text` | string (nullable) | Extracted/generated text for FTS index (filename + description + tags for non-text files) |
| `status` | enum | "pending" / "embedded" / "failed" |
| `error_message` | string (nullable) | Error details when status is "failed" |
| `deleted_at` | timestamp (nullable) | Soft-delete timestamp (null = active). All queries filter out non-null. |
| `created_at` | timestamp | Insertion time |
| `updated_at` | timestamp | Last modification time |
| `source_url` | string (nullable) | For files ingested from URLs |

### Taxonomy Table (LanceDB, separate)

| Field | Type | Description |
|---|---|---|
| `id` | string | Node ID |
| `label` | string | Human-readable name ("Physics", "Meeting Notes") |
| `parent_id` | string (nullable) | Parent node (null = root) |
| `centroid_vector` | Float32[3072] | Average of member embeddings |
| `item_count` | int | Triggers split when > 8 |

### Schema Versioning

A `_meta` table stores `schema_version`. On database open, pending migrations run before any operation. The `config.json` also stores `db_version` for fast check without opening LanceDB.

### Key Design Decisions

1. **Files stored on disk, not in LanceDB.** Original files at `files/<yyyy-mm>/<id>.<ext>`. LanceDB holds only vectors + metadata. Large blobs in LanceDB degrade query performance.
2. **Hard-link deduplication.** When `file_hash` matches an existing file, try hard link first, fall back to copy if cross-device. On Windows, always copy.
3. **Status field for crash safety.** Row inserted as "pending" before embedding starts. Updated to "embedded" on success, "failed" on error. `clawdrive doctor` finds orphaned pending rows.
4. **Embedding model on every row.** Prevents silently wrong search results when the model changes.
5. **Chunk deduplication in search.** When multiple chunks of the same parent match, only the highest-scoring result is returned, with the chunk label attached.

## Store Pipeline

### Per-Type Ingestion Strategy

| File Type | Strategy | Gemini Limit |
|---|---|---|
| **PDF** | Split into 6-page segments, embed as **raw PDF bytes** | 6 pages per request |
| **Images** | Embed image bytes directly, no chunking | 6 images per request |
| **Video** | Split into 120-second segments, embed as **raw video bytes** | 120 seconds per request |
| **Audio** | Split into 80-second segments, embed as **raw audio bytes** | 80 seconds per request |
| **Text/Markdown** | Structure-preserving split (headings, paragraphs), merge small (<512 tokens), split large (>8192 tokens). Prepend contextual prefix. | 8192 tokens per request |
| **Code** | Split by file or function boundaries. Prepend contextual prefix. | 8192 tokens per request |

### Embedding Task Types

Gemini Embedding 2 supports `taskType` parameters that optimize embedding quality for specific use cases:

| Operation | taskType | Reason |
|---|---|---|
| `store()` — indexing documents | `RETRIEVAL_DOCUMENT` | Optimized for document corpus indexing |
| `search()` — text queries | `RETRIEVAL_QUERY` | Optimized for search query processing |
| `search()` — code queries | `CODE_RETRIEVAL_QUERY` | Optimized for code search |
| Taxonomy centroid computation | `CLUSTERING` | Optimized for clustering similarity |

The `task_type` used is stored alongside `embedding_model` on each row for correctness validation.

### Contextual Prefix (text/code only)

Before embedding text chunks, prepend document-level context:

```
[File: paper.pdf | Section: Methods | 3 of 8]
Users who don't complete onboarding within 48 hours show...
```

This ensures the embedding captures both local content AND document context. Free operation — no LLM call needed.

### Store Operation Flow

1. Validate config (API key exists)
2. Acquire file lock (`~/.clawdrive/workspaces/<name>/db/.lock`)
3. Hash file (SHA-256) → check for duplicate → skip if exists
4. Insert parent row with `status: "pending"`
5. Copy file to `files/<yyyy-mm>/<id>.<ext>` (hard-link if same volume)
6. Detect MIME type → select chunking strategy
7. Split into chunks (if needed)
8. Call Gemini Embedding 2 for each chunk (parallel, concurrency limit: 3)
   - Exponential backoff on rate limit (1s/2s/4s + jitter)
9. Insert child rows (if chunked)
10. Update parent row: `status → "embedded"`, set vector
11. Assign taxonomy node (nearest centroid, split if >8)
12. Log token usage to `usage.jsonl`
13. Release lock, return result

On failure at any step: parent row stays as `status: "failed"` with error message. `clawdrive doctor` finds and offers retry/cleanup.

### Batch Store

`storeBatch()` processes multiple files with a configurable concurrency limit (default: 3) for Gemini API calls. Respects rate limits via token bucket.

## Search Pipeline

### Search Flow

1. Receive query (text string, or image via `--image` flag)
2. Embed query with Gemini Embedding 2 (same model as stored docs)
3. Vector similarity search in LanceDB
   - Searches all rows (parents + chunks)
   - Filters by `embedding_model` to prevent cross-model matches
4. Deduplicate by `parent_id` — keep highest score per file, attach chunk label
5. Apply filters (`--type`, `--tags`, `--after`, `--before`)
6. Return top-k results with scores

### Search Modes

| Mode | Flag | Description |
|---|---|---|
| Vector (default) | none | Embed query → cosine similarity. Works for all modalities. |

### Searchable Text

The `searchable_text` field is populated on store:
- **Text/code files:** full text content (up to first 10K chars)
- **Non-text files:** `original_name + description + tags.join(" ") + chunk_label`

This fallback text supports ingestion metadata and future retrieval improvements, but v1 search executes through vector similarity only.

### Image Query Search

`clawdrive search --image <path>` embeds the image file via Gemini Embedding 2 with `taskType: RETRIEVAL_QUERY`, then performs vector similarity search against all stored embeddings. Accepted formats: PNG, JPEG.

### Filters

- `--type <mime>` — filter by content type (image, pdf, video, audio, text)
- `--tags <tag1,tag2>` — filter by tags (AND logic)
- `--after <date>` — created after date
- `--before <date>` — created before date
- `--limit <n>` — max results (default: 10)
- `--min-score <0-1>` — minimum similarity threshold

### Multimodal Search Examples

- Text → PDF: `clawdrive search "retention analysis"` → finds report.pdf pages 7-12
- Text → Image: `clawdrive search "microservice architecture diagram"` → finds diagram.png
- Text → Video: `clawdrive search "kubernetes deployment tutorial"` → finds lecture.mp4 at 14:00-16:00
- Image → Images: `clawdrive search --image sketch.jpg` → finds similar diagrams
- Text → Audio: `clawdrive search "budget discussion"` → finds meeting.mp3 at 5:20

## CLI Command Reference

### Core Operations

| Command | Description |
|---|---|
| `store <files...>` | Embed and store files. Flags: `--tags`, `--desc`, `--json` |
| `search <query>` | Semantic search. Flags: `--image`, `--mode`, `--type`, `--tags`, `--limit`, `--min-score`, `--after`, `--before`, `--json` |
| `read <id>` | Output file content to stdout (text files) or file path (binary files). `--json` returns metadata + path. |
| `info <id>` | Show full metadata, tags, taxonomy, chunks |
| `rm <id>` | Soft-delete file + chunks (sets `deleted_at`, hidden from queries, `gc` permanently removes) |
| `update <id>` | Update metadata. Flags: `--tags`, `--desc`, `--add-tag`, `--rm-tag` |
| `export <id> <dest>` | Copy stored file to destination path |
| `open <id>` | Open file with system default app |

### Browsing

| Command | Description |
|---|---|
| `ls [path]` | List files, optionally within taxonomy path. Flags: `--json` |
| `tree` | Show full taxonomy hierarchy |
| `import <dir>` | Recursively ingest directory. Flags: `--glob`, `--dry-run`, `--json` |

### Management

| Command | Description |
|---|---|
| `config set <key> <val>` | Set config value |
| `config get <key>` | Read config value |
| `config set-key <key>` | Store Gemini API key |
| `doctor` | Check config, API key, DB health, orphaned files |
| `gc` | Compact DB, free soft-deleted space, clean orphans |
| `usage` | Show API token usage and estimated cost |
| `serve` | Start REST API server + web UI |
| `ui` | Start server + open browser |

### Global Flags

- `--json` — machine-readable JSON output (all commands)
- `--workspace <name>` — select workspace (default: "default")

### Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error (no API key) |
| 3 | File not found |
| 4 | API rate limit / quota exceeded |
| 5 | Duplicate file (with `--fail-on-dup`) |

## Web UI

### Architecture

`clawdrive serve` starts an Express/Fastify server that:
1. Exposes core functions as REST API endpoints
2. Serves the static React+Vite build

### REST API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/store` | Upload and store a file (multipart form) |
| `GET` | `/api/search?q=...&type=...` | Semantic vector search |
| `GET` | `/api/files/:id` | Get file metadata |
| `GET` | `/api/files/:id/content` | Download file content |
| `PATCH` | `/api/files/:id` | Update tags/description |
| `DELETE` | `/api/files/:id` | Soft-delete file |
| `GET` | `/api/files` | List files with pagination (`cursor`, `limit`) |
| `GET` | `/api/taxonomy` | Get full taxonomy tree |
| `GET` | `/api/projections` | Get cached UMAP 3D coordinates for all files |
| `POST` | `/api/projections/recompute` | Trigger UMAP recomputation |
| `GET` | `/api/usage` | Token usage stats |

### Agent View (3D Embedding Space)

- **Rendering:** Three.js with WebGL
- **Projection:** UMAP reduces 3072-dim vectors to 3D coordinates
- **Caching:** UMAP projections are cached in `workspaces/<name>/projections/`. Recomputed on demand via `POST /api/projections/recompute` or when file count changes by >10%. New files are approximately projected using the existing UMAP transform until a full recompute is triggered.
- **Points:** Each file/chunk is a colored point. Color encodes content type or taxonomy.
- **Clusters:** K-means on projected 3D coordinates generates cluster boundaries. Labels float in the background.
- **Interaction:** Hover shows file card (name, score, type, size, tags). Click opens preview. Right-click exports.
- **Scale:** Scatter-GL for datasets >10K points.

### Human View (Taxonomy Browser)

- **Sidebar:** Collapsible tree of taxonomy nodes with item counts
- **Main area:** File grid (icon + name + metadata) for selected node
- **Breadcrumb:** Shows current path (Research > Physics > Quantum)
- **Navigation:** Click to drill down, back button to go up

### Spotlight Search (Cmd+K)

- **Trigger:** Cmd+K (Mac) / Ctrl+K (Windows/Linux) keyboard shortcut
- **Input:** Debounced text input, calls search API as you type
- **Results:** Real-time ranked list with file icon, name, chunk label, taxonomy path, score
- **Actions:** Enter to open, Shift+Enter to preview, Escape to close, arrow keys to navigate

### Taxonomy Algorithm

Lazy split-on-overflow:

1. On first file stored, create a single root taxonomy node
2. On each `store()`, assign file to the most similar taxonomy node via nearest-centroid lookup (fast, O(nodes))
3. When a node exceeds 8 items, split it:
   a. Take all files in the node
   b. Run k-means with k=2 on their embeddings
   c. Generate labels from common keywords in filenames/descriptions of each cluster (or LLM call if available)
   d. Create two child nodes, reassign files
4. Taxonomy is display metadata only — search always uses vector similarity, never filtered by taxonomy
5. When `gc` runs, merge taxonomy nodes with fewer than 2 items back into their parent
6. `gc --rebuild-taxonomy` recomputes the entire hierarchy from scratch

## Data Directory

```
~/.clawdrive/
├── config.json           # Gemini API key, preferences (chmod 600)
└── workspaces/
    ├── default/          # Default workspace
    │   ├── db/           # LanceDB data files
    │   ├── files/        # Original files
    │   │   └── 2026-03/  # Organized by month
    │   ├── usage.jsonl   # Per-workspace token usage log
    │   ├── projections/  # Cached UMAP projections for UI
    │   └── .lock         # Advisory lock
    └── research/         # Another workspace
        ├── db/
        ├── files/
        └── usage.jsonl
```

### Config Schema (Zod-validated)

```typescript
const ConfigSchema = z.object({
  version: z.number().default(1),
  gemini_api_key: z.string().optional(),
  default_workspace: z.string().default("default"),
  embedding: z.object({
    model: z.string().default("gemini-embedding-2-preview"),
    dimensions: z.number().default(3072),
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
```

### API Key Resolution (priority order)

1. `GEMINI_API_KEY` environment variable
2. `~/.clawdrive/config.json` `gemini_api_key` field

## Error Handling

### Atomic Store with WAL Pattern

The store operation uses a write-ahead pattern:
1. Insert row with `status: "pending"` before any I/O
2. Copy file to disk
3. Call Gemini API
4. Update row to `status: "embedded"`
5. On failure: set `status: "failed"` with error message

`clawdrive doctor` queries for pending/failed rows and offers retry or cleanup.

### Concurrent Write Safety

LanceDB embedded doesn't support concurrent writes. A file-based advisory lock (`proper-lockfile` or equivalent) at `~/.clawdrive/workspaces/<name>/.lock` prevents data corruption. The lock is held only during database write operations (insert/update rows), NOT during Gemini API calls. This means a large file embedding doesn't block other store operations during the (potentially minutes-long) API call phase. Fail fast with clear error if lock can't be acquired within 5 seconds.

### Gemini API Resilience

- Exponential backoff with jitter: 1s, 2s, 4s + random 0-500ms (3 retries)
- 5-minute timeout on embedding HTTP calls (video/audio can be slow)
- Clear error messages distinguishing rate limit vs auth vs network failures

## Testing Strategy

### Layers

1. **Unit:** Embedding adapter, config parser, chunker logic (pure functions, no I/O)
2. **Integration:** `store()` → `search()` → `read()` pipeline with mock embedder + real LanceDB in temp dir
3. **E2E:** Full CLI invocations with `execa`, real temp directories, mock embedder via env var flag
4. **Snapshot:** `--json` output shapes for each command (regression protection for agent consumers)

### Mock Embedding Provider

```typescript
type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "CODE_RETRIEVAL_QUERY" | "CLUSTERING";

type EmbedInput =
  | { kind: "text"; text: string; taskType: TaskType }
  | { kind: "binary"; data: Buffer; mimeType: string; taskType: TaskType };

interface EmbeddingProvider {
  embed(input: EmbedInput): Promise<Float32Array>;
}
```

The mock provider returns deterministic vectors derived from a hash of the input, enabling stable integration tests without Gemini API calls.

### Test Infrastructure

- `vitest` (not Jest) — handles ESM and native modules better
- Temp directory per test run for LanceDB data
- `createTestWorkspace()` helper that creates temp dir, initializes DB, returns cleanup function

## Distribution

- **Primary:** `npm install -g clawdrive` / `npx clawdrive`
- **Node.js:** Requires 18+ (native fetch)
- **Platforms:** macOS (Intel + ARM), Linux (x86_64 + aarch64, glibc only), Windows (x86_64 + aarch64)
- **Limitation:** Alpine Linux (musl libc) not supported by LanceDB prebuilt binaries
- **Limitation:** Single-binary bundling (pkg/nexe) incompatible with LanceDB native modules

## Security Considerations

- `~/.clawdrive/` directory created with 700 permissions (owner only)
- `config.json` created with 600 permissions
- Path traversal prevention: resolve absolute paths before any file operation, reject paths containing `..` that resolve outside workspace
- `store()` source path: no restriction (user intentionally adds files)
- `read()`/`export()` destination: must not escape allowed directories
- All string inputs validated with Zod before touching the database

## Future Work (v2+)

- **L0/L1/L2 progressive loading** — LLM-generated summaries for tiered retrieval
- **Multi-agent collaboration** — file sharing, permissions, agent-to-agent via A2A protocol
- **Cloud-hosted version** — managed ClawDrive with user auth
- **AST-based code chunking** — tree-sitter for smarter code file splitting
- **Embedding model migration** — tooling to re-embed all files when upgrading models
- **Image/video thumbnails** — preview generation for UI cards
