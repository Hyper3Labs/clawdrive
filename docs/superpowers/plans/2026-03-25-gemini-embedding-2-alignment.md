# Gemini Embedding 2 Alignment Note

**Answer:** yes. The current multimodal semantic-search plan is closely aligned with the official `gemini-embedding-2-preview` documentation.

## What Is Aligned

- Use `gemini-embedding-2-preview` as the single embedding model for text, image, audio, video, and PDF content in one shared vector space.
- Use `RETRIEVAL_DOCUMENT` for indexed corpus items and `RETRIEVAL_QUERY` for search queries.
- Keep the workspace on 3072 dimensions for now, which matches both the current LanceDB schema and Google's guidance that 3072-dim output is already normalized.
- Ingest supported media as native bytes instead of collapsing non-text files into metadata text.
- Support multimodal query construction, including text-only, image-only, and combined text-plus-image query embeddings.
- Aggregate chunk embeddings into one parent/document representation rather than using only the first chunk vector.
- Preserve modality-aware chunk sizes that match the Gemini docs:
  - PDF: 6 pages
  - Audio: 80 seconds
  - Video: 120 seconds
- Use Files API fallback for larger media instead of assuming every request should be sent inline.

## Repo-Specific Adjustments

- Image support must follow Gemini Embedding 2's supported input formats for embeddings, so unsupported image formats should be normalized before embedding.
- Audio and video support must also be normalized to Gemini-supported embedding formats when the source file format does not match the documented input set.
- Search should filter by `embedding_model` so vectors from incompatible embedding spaces are never compared.
- The current repo already exposes `queryImage`, but the plan makes it real end-to-end instead of leaving it as dead surface area.

## Intentional Scope Decisions

- Video transcription enrichment is deferred. The first pass should rely on Gemini's native video embeddings only.
- Future work can add transcript-derived text embeddings as an additional retrieval signal, but that is not required to make the current search implementation correctly multimodal.

## Main Caveat

The plan is aligned with the Gemini docs, but the repo is not fully aligned yet. The current code still:

- embeds non-text files as metadata text in the main store pipeline,
- ignores `queryImage` in core search,
- stores parent vectors as the first chunk embedding instead of an aggregate,
- and hardcodes a 3072-dim LanceDB schema even though config exposes a dimensions setting.

## Source Docs Used

- Gemini API embeddings guide
- Gemini Embedding 2 model page
- Embeddings API reference
- File input methods guide
