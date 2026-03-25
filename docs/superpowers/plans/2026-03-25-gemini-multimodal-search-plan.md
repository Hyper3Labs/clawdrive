# Gemini Multimodal Semantic Search Plan

## Goal

Implement `gemini-embedding-2-preview` correctly in ClawDrive using the current Gemini API client in `packages/core/src/embedding/gemini.ts`. This plan is only about correct multimodal embeddings and retrieval behavior, not a broader search-product redesign.

## API Contract

- Target the Gemini API surface used by `@google/genai`, not Vertex-only prompt-instruction conventions.
- Use one model: `gemini-embedding-2-preview`.
- Keep `outputDimensionality` at `3072`.
- Use `RETRIEVAL_DOCUMENT` for indexed items and `RETRIEVAL_QUERY` for normal search queries.
- If ClawDrive keeps a dedicated natural-language-to-code search mode, use `CODE_RETRIEVAL_QUERY` for the query side only; indexed code still uses `RETRIEVAL_DOCUMENT`.
- When one embedding should represent combined input, send one content entry with multiple ordered parts.
- Use inline bytes for small media and the Files API for large or reused media.
- Pass a document `title` when available, usually from the file name.

## Supported Inputs

- Text, including code: up to `8192` tokens.
- Images: `PNG`, `JPEG`, up to `6` per request.
- Audio: `MP3`, `WAV`, up to `80` seconds.
- Video: `MP4`, `MOV`, up to `120` seconds.
- PDF: up to `6` pages per request; prefer smaller chunks for quality.

## Unsupported Inputs

- A file is only semantically embedded if it is already a supported modality or can be transcoded into one for embedding only.
- Transcoding must never replace the stored original file.
- Unsupported random binaries are marked unsupported or failed for embedding.
- Do not fall back to metadata-text embeddings for unsupported binaries.

## Required Changes

### 1. Multipart Embedding Contract

- Replace the current text-or-binary input with ordered parts:
  - text
  - inline bytes
  - uploaded file reference
- Allow an optional document title.

Files:
- `packages/core/src/embedding/types.ts`
- `packages/core/src/embedding/gemini.ts`
- `packages/core/src/embedding/mock.ts`

### 2. Gemini Provider

- Build Gemini API embedding requests from one ordered content entry.
- Keep Gemini API `taskType` usage for this implementation.
- Add a Files API path for large or reused media.

Files:
- `packages/core/src/embedding/gemini.ts`

### 3. Native-Media Ingestion

- Text and code stay text-chunked.
- Images embed as native image bytes.
- PDFs embed as PDF chunks within the `6`-page limit.
- Audio is segmented to the `80`-second limit.
- Video is segmented to the `120`-second limit.
- Add embedding-only transcoding into supported MIME types where needed.
- Do not add transcript extraction in this pass.

Files:
- `packages/core/src/store.ts`
- `packages/core/src/chunker/types.ts`
- `packages/core/src/chunker/pdf.ts`
- `packages/core/src/chunker/video.ts`
- `packages/core/src/chunker/audio.ts`

### 4. Real Multimodal Queries

- Make text-only, image-only, and text-plus-image queries real.
- Allow query text to be optional when an image is present.
- Build one combined query embedding from the active parts.
- If an image is present, use vector search only.

Files:
- `packages/core/src/search.ts`
- `packages/core/src/types.ts`
- `packages/cli/src/commands/search.ts`

### 5. Vector Correctness

- Filter vector search by `embedding_model`.
- Aggregate child vectors into the parent vector with normalized averaging.
- Keep the current `3072`-dimension LanceDB schema for this pass.

Files:
- `packages/core/src/store.ts`
- `packages/core/src/search.ts`

### 6. Tests

Cover:
- multipart inputs
- text-plus-image query embeddings
- image, PDF, audio, and video ingestion
- embedding-only transcoding
- unsupported binary rejection
- parent-vector aggregation
- `embedding_model` filtering

Files:
- `packages/core/tests/embedding/mock.test.ts`
- `packages/core/tests/store.test.ts`
- `packages/core/tests/search.test.ts`

## Out Of Scope

- FTS or hybrid-search redesign
- web or server search-surface redesign
- embedding-dimension migration away from `3072`
- transcript-derived retrieval signals

## Acceptance Criteria

- Supported media is embedded from native media input, not metadata text.
- Large or reused media can use the Files API; small media can stay inline.
- Unsupported binaries are not silently embedded as metadata text.
- `clawdrive search --image path/to/image.png` performs true vector search.
- `clawdrive search "architecture" --image sketch.png` produces one combined query embedding.
- Parent rows use aggregated child vectors.
- Vector search excludes rows from other embedding models.
- Tests cover supported modalities and unsupported-binary behavior.

## Implementation Order

1. embedding contract
2. Gemini provider
3. native-media ingestion and transcoding
4. query path
5. parent aggregation and model filtering
6. tests

## References

- `https://ai.google.dev/gemini-api/docs/embeddings`
- `https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2-preview`
- `https://ai.google.dev/gemini-api/docs/file-input-methods`
- `docs/superpowers/plans/2026-03-25-gemini-embedding-2-alignment.md`