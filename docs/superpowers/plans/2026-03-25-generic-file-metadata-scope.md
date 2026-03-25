# Generic File Metadata Scope

Status: accepted scope cut

## Goal

- Stop treating the curated NASA demo as the default metadata contract.
- Keep phase 1 limited to metadata that exists for ordinary local files and common connector imports.
- Avoid designing the public share surface around fields that only exist because the demo seed path adds them.

## Current Reality

- The generic file record contains many fields because it mixes storage internals, embedding internals, and end-user metadata.
- The public share route currently returns almost the full file record minus the vector.
- The NASA demo bundle still carries generated theme notes and NASA-specific manifest fields, and the seed path adds description and tags at ingest time that normal filesystem imports do not have.

## Phase 1 Metadata Contract

The public and product-facing metadata contract for now should assume only these fields are reliably available for normal files:

- `id`
- `original_name`
- `content_type`
- `file_size`
- `created_at`
- `updated_at`
- `source_url` only when the source import actually has one

Optional phase-1 exception:

- `tldr` may be present as a short summary layer for some files
- recommended target length: 20 to 45 words
- product flows may use it when present, but must still work when it is missing
- direct file detail reads may also include `digest` as a structured overview layer when it exists
- list, share, and search-summary surfaces should still work without it

## Do Not Assume In Phase 1

- description text
- tags
- taxonomy path
- NASA theme/query/ID fields
- generated note files
- digest on list, share, or search-summary surfaces
- connector-specific rich metadata that is not already consistently present

These fields may exist in some records, but the product should not depend on them being present.

## Internal Fields Stay Internal

These fields can continue to exist in storage, but they should not define the public share contract or the baseline product story for generic data:

- `file_path`
- `file_hash`
- `embedding_model`
- `task_type`
- `searchable_text`
- `parent_id`
- `chunk_index`
- `chunk_label`
- `status`
- `error_message`
- `deleted_at`

## NASA Demo Rule

- Keep NASA-specific curation limited to choosing which files enter the demo bundle.
- The tracked demo bundle should only carry generic import metadata needed to fetch normal files.
- Do not copy the demo's extra description/tag pattern into the generic ingest path.
- Do not use the demo metadata shape as the reference shape for public manifests, product copy, or future connector work.

## NASA Dataset Cleanup

- Reduce `sample-files/sources.json` to the generic import fields needed for the demo bundle: `fileName`, `bytes`, and `sourceUrl`, plus dataset-level totals.
- Remove generated theme note files from the tracked demo bundle.
- Seed the NASA demo without synthetic descriptions or tags.
- Do not seed `README.md`, `sources.json`, or other bundle-explainer metadata files into the demo workspace as content items.

## Explicitly Out Of Scope

- separate provenance layers
- enrichment pipeline
- remote share CLI changes
- metadata completeness tracking beyond nullable `tldr` and optional `digest`
- additional optional metadata layers that are not implemented or not currently used

## Immediate Plan Impact

- Public share manifests should expose only the minimal generic metadata contract.
- `sample-files/sources.json` should stop exposing theme labels, query text, NASA IDs, and other demo-only fields.
- `sample-files/*-note.md` should be removed from the tracked demo bundle.
- `packages/cli/src/demo/nasa.ts` should ingest the demo files without inventing descriptions or tags.
- Existing NASA demo workspaces should be reconciled on seed so legacy note files and synthetic NASA/demo tags and descriptions are removed instead of persisting forever.
- Planning docs should stop assuming rich descriptions or curated thematic labels.
- Product messaging should describe ClawDrive as working on sparse real-world file metadata plus file content, not on hand-authored annotations.
