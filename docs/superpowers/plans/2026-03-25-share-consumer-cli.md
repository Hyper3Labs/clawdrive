# Public Share Consumer CLI

Status: implemented

## Goal

- Add the recipient-side CLI that consumes the existing public share surface.
- Keep the public-share workflow URL-first so another person's agent can act directly on the capability URL.
- Preserve the local-first model: after download, the files live in a normal local pot and all existing local commands keep working.

## Command Contract

### `cdrive share info <url>`

- Accept a public share root URL or a `manifest.json` URL.
- Fetch the public manifest.
- Return share metadata plus the per-item `tldr` values by default.
- Do not include `digest` in the default surface.

### `cdrive share ls <url>`

- Accept the same URL forms as `share info`.
- Return the item list in a concise, inspection-friendly format.
- Show item IDs so agents can target a single file on the next step.

### `cdrive share download <url> [--item <share-item-id> ...] [--pot <local-pot>]`

- Fetch the manifest from the URL.
- Download all items by default.
- If `--item` is present, download only those share items.
- Reuse an existing local pot when the target pot already exists; otherwise create it.
- Store the downloaded files into the local workspace so they become normal ClawDrive files.
- Preserve `tldr` and `source_url` when storing new files.
- On duplicate bytes, attach the existing local file to the target pot instead of creating a copy.

## Metadata Contract

- Public manifests expose `tldr`, not `abstract`.
- `digest` remains a direct-read/local-detail layer and is intentionally excluded from share list and manifest surfaces.
- Item download still flows through `content_url` from the manifest so selective single-file retrieval works without a separate endpoint design.

## Why This Shape

- `info`, `ls`, and `download` match storage/drive CLI precedent better than `inspect` and `import`.
- URL input keeps the remote-share UX explicit and avoids leaking local `ref` semantics into the public-share consumer path.
- Downloading into a local pot preserves the product's existing search, `get`, `tldr`, and `digest` workflows instead of inventing a parallel remote-only mode.

## Non-Goals

- No remote `digest` surface in v1.
- No attempt to rename legacy producer-side commands like `share inbox` in this pass.
- No remote `get` or generic public-share `ref` resolution layer.